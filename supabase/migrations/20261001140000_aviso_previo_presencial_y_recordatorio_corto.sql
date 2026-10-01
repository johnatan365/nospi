-- Dos avisos en el canal "Avisos · <evento>" de los presenciales, en vez de uno.
--
-- Antes: un solo bloque 10 minutos DESPUES de empezar, con saludo largo
-- ("gracias por asistir... que la pasen super bien") pegado al recordatorio de
-- confirmar asistencia. Problema medido: de 24 inscritos en los 3 primeros
-- eventos con aviso, solo 2 confirmaron DESPUES de recibirlo. El saludo llegaba
-- cuando ya estaban sentados y el recordatorio competia con la conversacion.
--
-- Ahora:
--   1) 45 minutos ANTES  -> el saludo + que hacer al llegar. Es informacion,
--      no una orden que no se pueda cumplir (ver la nota del GPS abajo).
--   2) 10 minutos DESPUES -> un solo mensaje corto. Nada de saludo ni de
--      parrafos: a esa hora la persona esta en una mesa con gente.
--
-- NOTA DEL GPS, que es la razon de que el aviso previo NO diga "confirma ya":
-- todos los presenciales tienen require_gps_verification = true, y la pantalla
-- de Dinamica rechaza la confirmacion si la persona esta fuera del radio
-- ("Debes estar en el lugar del evento para confirmar tu llegada. Estas a X m").
-- O sea que 45 minutos antes NADIE puede confirmar aunque quiera. Pedirselo
-- seria mandarlos a un boton que les da error. Por eso el previo explica el
-- paso para cuando lleguen, y el recordatorio de confirmar va despues.
--
-- Las videollamadas NO cambian: ahi el aviso de 15 minutos antes si pide
-- conectarse, porque no hay GPS y a esa hora el boton ya existe.
--
-- El previo tampoco se pisa con los push que ya existen: hay uno a 2 horas
-- ("preparate"), otro a 30 minutos ("ya pueden chatear") y otro en inicio+5.
-- Los 45 minutos es la franja que estaba libre.

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

  -- ── Presencial, 45 minutos ANTES ──────────────────────────────────────────
  c_previo_1 constant text :=
    '¡Hola a todos! 👋 Ya casi arranca el evento, esperamos que la pasen súper bien 😊';
  c_previo_2 constant text :=
    'Un paso importante para cuando lleguen: abran Nospi, entren a la pestaña *Dinámica* y toquen confirmar su llegada. Solo funciona estando en el lugar (se verifica por GPS), así que háganlo al llegar. Eso es lo que registra su asistencia — si no queda registrada, el sistema la cuenta como inasistencia y eso puede suspender la cuenta para futuros eventos.';

  -- ── Presencial, 10 minutos DESPUES: corto, una sola linea ─────────────────
  c_recordatorio constant text :=
    '¿Ya confirmaron su llegada en la pestaña *Dinámica*? 🙌 Es lo que registra su asistencia.';

  -- ── Videollamada: igual que antes, sin tocar ──────────────────────────────
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
    -- ── a) Presenciales, 45 minutos ANTES ───────────────────────────────────
    SELECT e.id, e.name, 'previo'::text as etapa
    FROM public.events e
    WHERE e.aviso_previo_enviado_at IS NULL
      AND e.event_status = 'published'
      AND e.status = 'active'
      AND COALESCE(e.type, '') <> 'virtual'
      AND e.start_time IS NOT NULL
      AND e.start_time <= now() + interval '45 minutes'
      -- Piso de 5 minutos: si el cron se cayo un rato, mejor saltarse el previo
      -- que mandar "ya casi arranca" cuando el evento ya empezo.
      AND e.start_time > now() + interval '5 minutes'
      AND EXISTS (SELECT 1 FROM public.appointments a
                  WHERE a.event_id = e.id AND a.status = 'confirmada')

    UNION ALL

    -- ── b) Presenciales, 10 minutos DESPUES de empezar ──────────────────────
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

    -- ── c) Videollamadas, 15 minutos ANTES (sin cambios) ────────────────────
    SELECT e.id, e.name, 'virtual'::text
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

    IF v_evento.etapa = 'presencial' THEN
      -- Un solo mensaje. El saludo ya salio 45 minutos antes.
      INSERT INTO public.chat_messages (conversation_id, sender_id, content, created_at)
      VALUES (v_conv, v_nospi, c_recordatorio, clock_timestamp());

      UPDATE public.events SET aviso_confirmar_enviado_at = now() WHERE id = v_evento.id;
    ELSE
      -- Previo y videollamada van en dos mensajes. El segundo lleva un segundo
      -- mas para que el orden en el chat sea el correcto y no quede al azar.
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
