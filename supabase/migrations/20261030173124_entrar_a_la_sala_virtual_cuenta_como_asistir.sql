-- Quien entro a la sala de una videollamada ya no queda como inasistente.
--
-- El cron de medianoche decidia quien falto mirando solamente
-- appointments.arrival_status. En los eventos virtuales ese campo solo queda
-- en 'on_time' cuando la persona alcanza a confirmar asistencia DENTRO de la
-- dinamica. Quien entro a la sala pero no llego a ese paso -- porque entro
-- antes de que arrancara, o porque solo le cargo el chat -- se quedaba en
-- 'pending' y a las 00:05 se le registraba una falta, y a las 10:00 le salia
-- el correo acusandolo de no haber ido.
--
-- Paso de verdad tres martes y jueves seguidos: 11, 18 y 29 de octubre.
-- Cuatro casos, tres personas, y una de ellas (Sora) acumulo dos faltas asi y
-- quedo suspendida para reservar hasta el 14 de noviembre sin haber faltado
-- nunca.
--
-- event_participants.check_in_time es prueba dura de que la persona estuvo en
-- la sala: lo escribe el propio ingreso, no la dinamica. Con esto basta para
-- no marcarla. La condicion solo puede quitar falsos positivos, nunca dejar
-- pasar a alguien que de verdad no entro: se verifico contra todo el
-- historico y solo cambia esos cuatro casos, ninguno presencial.

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

  IF v_ev.dividido_at IS NOT NULL THEN RETURN 0; END IF;

  UPDATE public.appointments a
     SET no_show = true,
         no_show_marked_at = now()
   WHERE a.event_id = p_event_id
     AND a.status IN ('confirmada','anterior')
     AND a.payment_status = 'completed'
     AND COALESCE(a.arrival_status,'pending') <> 'on_time'
     AND a.no_show = false
     AND NOT (
       a.movida_de_evento_at IS NOT NULL
       AND a.movida_de_evento_at >= v_ev.date - interval '2 hours'
     )
     -- Entrar a la sala cuenta como asistir, asi la dinamica no lo haya
     -- alcanzado a registrar.
     AND NOT EXISTS (
       SELECT 1 FROM public.event_participants ep
        WHERE ep.event_id = a.event_id
          AND ep.user_id  = a.user_id
          AND ep.check_in_time IS NOT NULL
     );
  GET DIAGNOSTICS v_count = ROW_COUNT;

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
