-- El 22 de octubre de 2026, en la Sala de Despecho, se unieron las dos mesas a
-- las 7:32 p. m. con el evento ya empezado. Las citas se movieron bien, pero el
-- telefono de la gente de la mesa que desaparecio siguio apuntando al evento
-- viejo, que quedo cerrado. Para ellos el boton de registrar llegada dejo de
-- servir: de la mesa 20 no registro llegada ni una sola persona despues de esa
-- hora, mientras que los de la mesa que sobrevivio siguieron registrando normal.
--
-- A medianoche el cron repartio faltas por inasistencia a los cinco que no
-- tenian check-in, y a las 10:05 de la manana les llego un correo diciendoles
-- que no habian asistido. Una de ellas quedo con dos faltas, o sea suspendida
-- quince dias. Habian ido todos.
--
-- El error de fondo: la falta se decide solo por si la persona apreto el boton
-- en la app. Cuando somos nosotros los que le movemos la mesa debajo de los
-- pies, la ausencia de check-in no prueba absolutamente nada.
--
-- Se arregla en dos partes:
--
--   1. appointments.movida_de_evento_at deja constancia del momento exacto en
--      que una cita cambio de evento. Un trigger lo llena solo, asi que sirve
--      igual si la division la hace la RPC o si se hace a mano.
--
--      Ojo: NO se puede usar updated_at para esto. Lo toca el check-in, lo toca
--      el cron de medianoche al pasar las citas a 'anterior', lo toca cualquier
--      cosa. Se probo y protegia a las catorce personas en vez de a las cuatro.
--
--   2. flag_event_no_shows no le pone falta a quien fue movido de mesa dentro
--      de las dos horas previas al evento o despues de empezado, y no reparte
--      nada desde un evento que ya fue dividido o unido (esos son cascaras: sus
--      citas se fueron a otro lado).

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS movida_de_evento_at timestamptz;

COMMENT ON COLUMN public.appointments.movida_de_evento_at IS
  'Momento exacto en que esta cita cambio de evento (division o union de mesas). Sirve para no cobrarle falta a quien no pudo registrar llegada porque le movimos la mesa encima del evento. No usar updated_at para esto: lo toca cualquier cosa.';

CREATE OR REPLACE FUNCTION public.trg_marcar_cita_movida()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.event_id IS DISTINCT FROM OLD.event_id THEN
    NEW.movida_de_evento_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_appointments_marcar_movida ON public.appointments;
CREATE TRIGGER trg_appointments_marcar_movida
  BEFORE UPDATE OF event_id ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.trg_marcar_cita_movida();

CREATE OR REPLACE FUNCTION public.flag_event_no_shows(p_event_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
  v_ev    record;
  v_secreto text;
BEGIN
  SELECT id, date, dividido_at INTO v_ev FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Un evento ya dividido o unido es una cascara: sus citas se fueron a otra
  -- mesa. De aqui no sale ninguna falta.
  IF v_ev.dividido_at IS NOT NULL THEN RETURN 0; END IF;

  UPDATE public.appointments a
     SET no_show = true,
         no_show_marked_at = now()
   WHERE a.event_id = p_event_id
     AND a.status IN ('confirmada','anterior')
     AND a.payment_status = 'completed'
     AND COALESCE(a.arrival_status,'pending') <> 'on_time'
     AND a.no_show = false
     -- Si a esta persona le cambiamos la mesa con el evento ya encima, su
     -- telefono seguia apuntando al evento viejo y el boton de registrar
     -- llegada no le servia. No se le pone falta.
     AND NOT (
       a.movida_de_evento_at IS NOT NULL
       AND a.movida_de_evento_at >= v_ev.date - interval '2 hours'
     );
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Registrar ya las amonestaciones de ESTE evento, sin notificar. Si falla la
  -- llamada no se pierde nada: el cron de las 10:00 las crea igual, solo que el
  -- admin no las veria hasta entonces. Por eso no se levanta excepcion.
  -- Registrar ya las amonestaciones de ESTE evento, sin notificar. Si falla la
  -- llamada no se pierde nada: el cron de las 10:00 las crea igual, solo que el
  -- admin no las veria hasta entonces. Por eso no se levanta excepcion.
  --
  -- El secreto y la llave salen de app_config, NO van escritos aqui: este
  -- repositorio es publico. Ver CLAUDE.md.
  IF v_count > 0 THEN
    BEGIN
      SELECT value INTO v_secreto FROM public.app_config WHERE key = 'noshow_secret';
      PERFORM net.http_post(
        url := 'https://wjdiraurfbawotlcndmk.supabase.co/functions/v1/notify-no-show',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'apikey', (SELECT value FROM public.app_config WHERE key = 'anon_key'),
          'x-noshow-secret', coalesce(v_secreto,'')
        ),
        body := jsonb_build_object('registrar_solamente', true, 'event_id', p_event_id)
      );
    EXCEPTION WHEN others THEN
      RAISE WARNING 'flag_event_no_shows: no se pudo registrar amonestaciones de % (%)', p_event_id, SQLERRM;
    END;
  END IF;

  RETURN v_count;
END;
$function$;
