ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS aviso_confirmar_enviado_at timestamptz;

COMMENT ON COLUMN public.events.aviso_confirmar_enviado_at IS
  'Cuando se publico el aviso automatico de confirmar asistencia en el canal del evento. NULL = todavia no se envio. Sirve de candado: el cron corre cada 5 minutos y sin esto repetiria el mensaje en cada pasada.';

CREATE OR REPLACE FUNCTION public.enviar_aviso_confirmar_asistencia()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_evento record;
  v_conv uuid;
  v_nospi uuid;
  v_enviados integer := 0;
  c_saludo constant text :=
    'Hola a todos,gracias por asistir al evento y esperamos que la pasen super bien 😊';
  c_aviso constant text :=
    'Por favor, recuerden confirmar su asistencia en la app para poder participar en la dinámica. 🙌  Además, es importante hacerlo para que el sistema registre correctamente su asistencia y no les aparezca como inasistencia, ya que esto podría generar una suspensión temporal de la cuenta para futuros eventos. 😊';
BEGIN
  SELECT id INTO v_nospi FROM public.users WHERE email = 'nospisocial@gmail.com' LIMIT 1;
  IF v_nospi IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_evento IN
    SELECT e.id, e.name
    FROM public.events e
    WHERE e.aviso_confirmar_enviado_at IS NULL
      AND e.event_status = 'published'
      AND e.status = 'active'
      AND COALESCE(e.type, '') <> 'virtual'
      AND e.start_time IS NOT NULL
      AND e.start_time <= now() - interval '10 minutes'
      AND e.start_time > now() - interval '3 hours'
      AND EXISTS (
        SELECT 1 FROM public.appointments a
        WHERE a.event_id = e.id AND a.status = 'confirmada'
      )
  LOOP
    SELECT id INTO v_conv
    FROM public.chat_conversations
    WHERE type = 'channel_event' AND event_id = v_evento.id
    LIMIT 1;

    IF v_conv IS NULL THEN
      INSERT INTO public.chat_conversations (type, event_id, title, replies_open, requires_attendance)
      VALUES ('channel_event', v_evento.id, 'Avisos · ' || COALESCE(v_evento.name, 'evento'), false, false)
      RETURNING id INTO v_conv;
    END IF;

    PERFORM public.sync_event_channel_participants(v_evento.id);

    INSERT INTO public.chat_messages (conversation_id, sender_id, content, created_at)
    VALUES (v_conv, v_nospi, c_saludo, clock_timestamp());

    INSERT INTO public.chat_messages (conversation_id, sender_id, content, created_at)
    VALUES (v_conv, v_nospi, c_aviso, clock_timestamp() + interval '1 second');

    UPDATE public.events SET aviso_confirmar_enviado_at = now() WHERE id = v_evento.id;
    v_enviados := v_enviados + 1;
  END LOOP;

  RETURN v_enviados;
END;
$function$;

REVOKE ALL ON FUNCTION public.enviar_aviso_confirmar_asistencia() FROM public, anon, authenticated;

SELECT cron.unschedule('aviso-confirmar-asistencia')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'aviso-confirmar-asistencia');

SELECT cron.schedule(
  'aviso-confirmar-asistencia',
  '*/5 * * * *',
  $$SELECT public.enviar_aviso_confirmar_asistencia();$$
);