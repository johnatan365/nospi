
alter table public.events
  add column if not exists aviso_previo_enviado_at timestamptz;

comment on column public.events.aviso_previo_enviado_at is
  'Cuando salio el aviso del canal de 45 minutos antes (solo presenciales). NULL = todavia no salio.';

create or replace function public.enviar_aviso_confirmar_asistencia()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_evento record;
  v_conv uuid;
  v_nospi uuid;
  v_enviados integer := 0;

  c_previo_1 constant text :=
    '¡Hola a todos! 👋 Ya casi arranca el evento, esperamos que la pasen súper bien 😊';
  c_previo_2 constant text :=
    'Un paso importante para cuando lleguen: abran Nospi, entren a la pestaña *Dinámica* y toquen confirmar su llegada. Solo funciona estando en el lugar (se verifica por GPS), así que háganlo al llegar. Eso es lo que registra su asistencia — si no queda registrada, el sistema la cuenta como inasistencia y eso puede suspender la cuenta para futuros eventos.';

  c_recordatorio constant text :=
    '¿Ya confirmaron su llegada en la pestaña *Dinámica*? 🙌 Es lo que registra su asistencia.';

  c_virtual_1 constant text :=
    '🎥 ¡Ya pueden conectarse! Abran Nospi y vayan a la pestaña *Dinámica*.';
  c_virtual_2 constant text :=
    'Ahí confirman su asistencia, entre ustedes escogen quién será el moderador y desde ahí mismo entran a la videollamada. 🙌  El enlace vive en la app, no acá — y tocar ese botón es lo que registra que llegaron. Ojo con la cámara prendida, que de eso se trata 😉';
BEGIN
  SELECT id INTO v_nospi FROM public.users WHERE email = 'nospisocial@gmail.com' LIMIT 1;
  IF v_nospi IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_evento IN
    SELECT e.id, e.name, 'previo'::text as etapa
    FROM public.events e
    WHERE e.aviso_previo_enviado_at IS NULL
      AND e.event_status = 'published'
      AND e.status = 'active'
      AND COALESCE(e.type, '') <> 'virtual'
      AND e.start_time IS NOT NULL
      AND e.start_time <= now() + interval '45 minutes'
      AND e.start_time > now() + interval '5 minutes'
      AND EXISTS (SELECT 1 FROM public.appointments a
                  WHERE a.event_id = e.id AND a.status = 'confirmada')

    UNION ALL

    SELECT e.id, e.name, 'presencial'::text
    FROM public.events e
    WHERE e.aviso_confirmar_enviado_at IS NULL
      AND e.event_status = 'published'
      AND e.status = 'active'
      AND COALESCE(e.type, '') <> 'virtual'
      AND e.start_time IS NOT NULL
      AND e.start_time <= now() - interval '10 minutes'
      AND e.start_time > now() - interval '3 hours'
      AND EXISTS (SELECT 1 FROM public.appointments a
                  WHERE a.event_id = e.id AND a.status = 'confirmada')

    UNION ALL

    SELECT e.id, e.name, 'virtual'::text
    FROM public.events e
    WHERE e.aviso_virtual_enviado_at IS NULL
      AND e.event_status = 'published'
      AND e.status = 'active'
      AND COALESCE(e.type, '') = 'virtual'
      AND e.start_time IS NOT NULL
      AND e.start_time <= now() + interval '15 minutes'
      AND e.start_time > now() - interval '2 hours'
      AND EXISTS (SELECT 1 FROM public.appointments a
                  WHERE a.event_id = e.id AND a.status = 'confirmada')
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

    IF v_evento.etapa = 'presencial' THEN
      INSERT INTO public.chat_messages (conversation_id, sender_id, content, created_at)
      VALUES (v_conv, v_nospi, c_recordatorio, clock_timestamp());

      UPDATE public.events SET aviso_confirmar_enviado_at = now() WHERE id = v_evento.id;
    ELSE
      INSERT INTO public.chat_messages (conversation_id, sender_id, content, created_at)
      VALUES (v_conv, v_nospi,
              CASE WHEN v_evento.etapa = 'virtual' THEN c_virtual_1 ELSE c_previo_1 END,
              clock_timestamp());

      INSERT INTO public.chat_messages (conversation_id, sender_id, content, created_at)
      VALUES (v_conv, v_nospi,
              CASE WHEN v_evento.etapa = 'virtual' THEN c_virtual_2 ELSE c_previo_2 END,
              clock_timestamp() + interval '1 second');

      IF v_evento.etapa = 'virtual' THEN
        UPDATE public.events SET aviso_virtual_enviado_at = now() WHERE id = v_evento.id;
      ELSE
        UPDATE public.events SET aviso_previo_enviado_at = now() WHERE id = v_evento.id;
      END IF;
    END IF;

    v_enviados := v_enviados + 1;
  END LOOP;

  RETURN v_enviados;
END;
$function$;
