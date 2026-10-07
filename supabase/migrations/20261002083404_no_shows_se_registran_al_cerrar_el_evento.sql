-- La falta aparece en el panel apenas se cierra el evento; el correo y el push
-- siguen saliendo a las 10 de la manana.
--
-- Antes todo pasaba junto en la corrida de las 10:00 (cron notify-no-show-10min):
-- se creaba la amonestacion, se aplicaba la suspension, se mandaba el correo y
-- el push. Resultado: un evento que cerraba a las 00:05 no mostraba ninguna
-- falta en el admin hasta diez horas despues, y parecia que el sistema no
-- estuviera funcionando.
--
-- Ahora flag_event_no_shows, ademas de marcar las citas, llama a la funcion en
-- modo registrar_solamente: deja la amonestacion y la suspension listas (y por
-- tanto visibles en No-shows) pero sin escribirle a nadie. A las 10:00 el cron
-- corre igual y manda correo + push a quien tenga no_show_notified_at NULL,
-- reutilizando la amonestacion que ya existe en vez de crear otra.
--
-- Se escribe a nadie de madrugada y el admin ve la realidad al instante.

create or replace function public.flag_event_no_shows(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.appointments a
     SET no_show = true,
         no_show_marked_at = now()
   WHERE a.event_id = p_event_id
     AND a.status IN ('confirmada','anterior')
     AND a.payment_status = 'completed'
     AND COALESCE(a.arrival_status,'pending') <> 'on_time'
     AND a.no_show = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Registrar ya las amonestaciones de ESTE evento, sin notificar. Si falla la
  -- llamada no se pierde nada: el cron de las 10:00 las crea igual, solo que el
  -- admin no las veria hasta entonces. Por eso no se levanta excepcion.
  IF v_count > 0 THEN
    BEGIN
      PERFORM net.http_post(
        url := 'https://wjdiraurfbawotlcndmk.supabase.co/functions/v1/notify-no-show',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqZGlyYXVyZmJhd290bGNuZG1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0MDMxMTUsImV4cCI6MjA4NTk3OTExNX0.FxMBafEjIliTDzRBRlnY59i1wEcbIx6u8ZdVf1uxuj8',
          'x-noshow-secret','nospi_noshow_wh_7f3a9c2e'
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

comment on function public.flag_event_no_shows(uuid) is
  'Al cerrar un evento: marca las citas sin llegada como no_show y registra ya sus amonestaciones (modo registrar_solamente de notify-no-show), para que la falta se vea de una en el panel. El correo y el push salen despues, en la corrida de las 10:00.';