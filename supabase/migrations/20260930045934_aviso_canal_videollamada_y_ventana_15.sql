-- Las videollamadas tambien reciben aviso en su canal, pero uno propio.
--
-- Hasta ahora quedaban fuera a proposito: el texto de los presenciales
-- ("recuerden confirmar su asistencia para no quedar como inasistencia") no
-- aplica a una videollamada, donde confirmar no es un recordatorio sino el
-- paso para entrar.
--
-- Pero quedarse sin ningun aviso tampoco servia: nadie les dice por donde
-- entrar. Asi que ahora reciben el suyo, y ANTES de empezar -- no 10 minutos
-- despues como los presenciales-- porque el punto es que lleguen a tiempo.
--
-- La ventana pasa a 15 minutos, igual que el mensaje de WhatsApp que ya se
-- mandaba desde el admin: ese decia 15 y la app abria a los 10, asi que la
-- gente lo intentaba y no podia.
alter table public.events
  add column if not exists aviso_virtual_enviado_at timestamptz;

comment on column public.events.aviso_virtual_enviado_at is
  'Cuando se publico en el canal el aviso de conectarse a la videollamada. NULL = todavia no. Es el candado del cron, que corre cada 5 minutos.';

create or replace function public.enviar_aviso_confirmar_asistencia()
returns integer
language plpgsql security definer set search_path to 'public'
as $function$
DECLARE
  v_evento record;
  v_conv uuid;
  v_nospi uuid;
  v_enviados integer := 0;
  c_saludo constant text :=
    'Hola a todos,gracias por asistir al evento y esperamos que la pasen super bien 😊';
  c_aviso constant text :=
    'Por favor, recuerden confirmar su asistencia en la app para poder participar en la dinámica. 🙌  Además, es importante hacerlo para que el sistema registre correctamente su asistencia y no les aparezca como inasistencia, ya que esto podría generar una suspensión temporal de la cuenta para futuros eventos. 😊';
  -- Videollamada: aqui no se "recuerda" nada, se explica el camino.
  c_virtual_1 constant text :=
    '🎥 ¡Ya pueden conectarse! Abran Nospi y vayan a la pestaña *Dinámica*.';
  c_virtual_2 constant text :=
    'Ahí confirman su asistencia, entre ustedes escogen quién será el moderador y desde ahí mismo entran a la videollamada. 🙌  El enlace vive en la app, no acá — y tocar ese botón es lo que registra que llegaron. Ojo con la cámara prendida, que de eso se trata 😉';
BEGIN
  SELECT id INTO v_nospi FROM public.users WHERE email = 'nospisocial@gmail.com' LIMIT 1;
  IF v_nospi IS NULL THEN
    RETURN 0;
  END IF;

  -- ── Presenciales: sin cambios, 10 minutos DESPUES de empezar ──────────────
  FOR v_evento IN
    SELECT e.id, e.name, false as es_virtual
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

    -- ── Videollamadas: 15 minutos ANTES, para que lleguen a tiempo ──────────
    SELECT e.id, e.name, true
    FROM public.events e
    WHERE e.aviso_virtual_enviado_at IS NULL
      AND e.event_status = 'published'
      AND e.status = 'active'
      AND COALESCE(e.type, '') = 'virtual'
      AND e.start_time IS NOT NULL
      AND e.start_time <= now() + interval '15 minutes'
      -- Ventana de seguridad: si el cron se cae un rato, que no salgan avisos
      -- de videollamadas que ya terminaron.
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

    -- Dos mensajes separados. El segundo lleva un segundo mas para que el
    -- orden en el chat sea el correcto y no quede al azar.
    INSERT INTO public.chat_messages (conversation_id, sender_id, content, created_at)
    VALUES (v_conv, v_nospi,
            CASE WHEN v_evento.es_virtual THEN c_virtual_1 ELSE c_saludo END,
            clock_timestamp());

    INSERT INTO public.chat_messages (conversation_id, sender_id, content, created_at)
    VALUES (v_conv, v_nospi,
            CASE WHEN v_evento.es_virtual THEN c_virtual_2 ELSE c_aviso END,
            clock_timestamp() + interval '1 second');

    IF v_evento.es_virtual THEN
      UPDATE public.events SET aviso_virtual_enviado_at = now() WHERE id = v_evento.id;
    ELSE
      UPDATE public.events SET aviso_confirmar_enviado_at = now() WHERE id = v_evento.id;
    END IF;
    v_enviados := v_enviados + 1;
  END LOOP;

  RETURN v_enviados;
END;
$function$;

revoke all on function public.enviar_aviso_confirmar_asistencia() from public, anon, authenticated;