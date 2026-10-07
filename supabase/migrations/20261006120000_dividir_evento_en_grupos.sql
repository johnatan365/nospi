-- Dividir un evento en varios grupos (mesas), desde el admin.
--
-- Hasta hoy esto se hacia a mano por consulta directa a la base. Dividir
-- significa CAMBIARLE EL event_id A CADA CITA, que es justo lo que rompio la
-- cena del 4 de septiembre (ver supabase/CHAT-ACCESO.md): los triggers de chat
-- escuchaban solo cambios de `status`. Eso ya esta arreglado --hoy escuchan
-- `status, event_id`-- y por eso mover citas aqui arrastra el chat solo.
--
-- Tres triggers de `appointments` se revisaron antes de escribir esto, porque
-- un UPDATE masivo los dispara a todos:
--
--   · trg_check_gender_registration_closed: solo levanta excepcion cuando la
--     cita PASA a 'confirmada'. Aqui el status no se toca, asi que no bloquea
--     mover a nadie a un grupo con inscripcion cerrada para su genero.
--   · trg_check_gender_threshold_notify: mismo guardia. No manda avisos.
--   · trg_appointments_sync_current_participants: ya escucha `event_id` y
--     recuenta los DOS eventos. Por eso aqui no se toca current_participants.
--
-- Lo que NO se copia al grupo nuevo, a proposito:
--
--   · meet_link. Si los tres grupos quedan con el link del original, las 15
--     personas caen en la misma llamada y la division no sirvio de nada. Queda
--     NULL y el admin lo marca en rojo hasta que lo peguen.
--   · El estado de la dinamica (game_phase, current_question*, answered_users,
--     ready_users, started_at, questions_*). Cada grupo arranca de cero.
--   · confirmation_code y los aviso_*_enviado_at: son del evento original.
--
-- El original NO se borra. No se puede: payment_attempts.event_id esta en
-- NO ACTION, asi que Postgres rechaza el DELETE de cualquier evento que haya
-- tenido un intento de pago. Y aunque se pudiera, se llevaria en cascada el
-- chat con sus mensajes, las calificaciones y los matches. En vez de eso se
-- renombra con el prefijo 'BORRAR | ' y se manda a borrador, que lo saca de la
-- vista de publicados sin perder nada y deja el deshacer posible.

-- ── columnas ────────────────────────────────────────────────────────────────

alter table public.events
  add column if not exists dividido_at timestamptz,
  add column if not exists dividido_de uuid references public.events(id) on delete set null,
  add column if not exists dividido_nombre_previo text,
  add column if not exists dividido_status_previo text;

comment on column public.events.dividido_at is
  'Cuando este evento se dividio en grupos. No nulo = es el original archivado.';
comment on column public.events.dividido_de is
  'El evento original del que salio este grupo. No nulo = es una mesa.';
comment on column public.events.dividido_nombre_previo is
  'El nombre que tenia antes de que se le pusiera el prefijo BORRAR, para poder deshacer.';
comment on column public.events.dividido_status_previo is
  'El event_status que tenia antes de pasar a borrador, para poder deshacer.';

create index if not exists idx_events_dividido_de on public.events(dividido_de)
  where dividido_de is not null;

-- ── dividir ─────────────────────────────────────────────────────────────────
--
-- p_grupos: [{"nombre": "Cena - Mesa 1", "user_ids": ["uuid", ...]}, ...]
--
-- Es todo o nada: si alguien queda sin grupo, la transaccion entera se revierte
-- antes que dejar personas sueltas en un evento que acaba de pasar a borrador.

create or replace function public.admin_dividir_evento(
  p_event_id uuid,
  p_grupos jsonb
) returns jsonb
language plpgsql security definer set search_path = public
as $$
DECLARE
  v_orig    public.events%rowtype;
  v_grupo   jsonb;
  v_nuevo   uuid;
  v_ids     uuid[];
  v_creados jsonb := '[]'::jsonb;
  v_movidas integer := 0;
  v_sueltas integer;
  v_n       integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_orig FROM public.events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El evento no existe' USING ERRCODE = 'P0001';
  END IF;
  IF v_orig.dividido_at IS NOT NULL THEN
    RAISE EXCEPTION 'Ese evento ya esta dividido' USING ERRCODE = 'P0001';
  END IF;
  IF v_orig.dividido_de IS NOT NULL THEN
    RAISE EXCEPTION 'Ese evento ya es un grupo de otra division' USING ERRCODE = 'P0001';
  END IF;
  IF p_grupos IS NULL OR jsonb_typeof(p_grupos) <> 'array' OR jsonb_array_length(p_grupos) < 2 THEN
    RAISE EXCEPTION 'Hay que dividir en al menos 2 grupos' USING ERRCODE = 'P0001';
  END IF;

  FOR v_grupo IN SELECT * FROM jsonb_array_elements(p_grupos)
  LOOP
    SELECT array_agg(x::uuid) INTO v_ids
      FROM jsonb_array_elements_text(v_grupo->'user_ids') AS x;

    v_n := coalesce(array_length(v_ids, 1), 0);
    IF v_n = 0 THEN
      RAISE EXCEPTION 'El grupo "%" quedo sin personas', coalesce(v_grupo->>'nombre', '?')
        USING ERRCODE = 'P0001';
    END IF;
    IF coalesce(btrim(v_grupo->>'nombre'), '') = '' THEN
      RAISE EXCEPTION 'Un grupo quedo sin nombre' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.events (
      type, date, "time", location, max_participants, status,
      address, latitude, longitude, radius_meters, start_time,
      name, city, description, location_name, location_address, maps_link,
      is_location_revealed, event_status, price, gps_link, moderator_id,
      cities, nacional, subtitulo, ocultar_ciudad, require_gps_verification,
      dividido_de
    ) VALUES (
      v_orig.type, v_orig.date, v_orig."time", v_orig.location, v_n, v_orig.status,
      v_orig.address, v_orig.latitude, v_orig.longitude, v_orig.radius_meters, v_orig.start_time,
      btrim(v_grupo->>'nombre'), v_orig.city, v_orig.description, v_orig.location_name,
      v_orig.location_address, v_orig.maps_link,
      v_orig.is_location_revealed, v_orig.event_status, v_orig.price, v_orig.gps_link,
      v_orig.moderator_id,
      v_orig.cities, v_orig.nacional, v_orig.subtitulo, v_orig.ocultar_ciudad,
      v_orig.require_gps_verification,
      p_event_id
    ) RETURNING id INTO v_nuevo;

    -- Solo cambia event_id. Ver la nota de los triggers arriba.
    UPDATE public.appointments
       SET event_id = v_nuevo, updated_at = now()
     WHERE event_id = p_event_id
       AND user_id = ANY(v_ids)
       AND status <> 'cancelada';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_movidas := v_movidas + v_n;

    -- Las preguntas ya sorteadas y revisadas se copian tal cual a cada grupo.
    INSERT INTO public.event_questions (
      event_id, level, question_text, question_order, is_default,
      is_pinned, pinned_position, category, applies_to
    )
    SELECT v_nuevo, level, question_text, question_order, is_default,
           is_pinned, pinned_position, category, applies_to
      FROM public.event_questions
     WHERE event_id = p_event_id;

    v_creados := v_creados || jsonb_build_object(
      'id', v_nuevo, 'nombre', btrim(v_grupo->>'nombre'), 'personas', v_n);
  END LOOP;

  -- Nadie se puede quedar atras: el original pasa a borrador y ahi no lo ve nadie.
  SELECT count(*) INTO v_sueltas
    FROM public.appointments
   WHERE event_id = p_event_id AND status <> 'cancelada';
  IF v_sueltas > 0 THEN
    RAISE EXCEPTION 'Quedaron % personas sin grupo. No se dividio nada.', v_sueltas
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.events
     SET dividido_nombre_previo = name,
         dividido_status_previo = event_status,
         name = 'BORRAR | ' || coalesce(name, ''),
         event_status = 'draft',
         dividido_at = now()
   WHERE id = p_event_id;

  RETURN jsonb_build_object(
    'creados', v_creados,
    'personas_movidas', v_movidas,
    'original_id', p_event_id
  );
END;
$$;

-- ── deshacer ────────────────────────────────────────────────────────────────
--
-- Se pasa el id del ORIGINAL. Devuelve a todos y borra los grupos creados.
-- Se niega a correr si alguien ya escribio en el chat de un grupo: borrar el
-- grupo se llevaria esos mensajes por cascada, y eso si es perdida real.

create or replace function public.admin_deshacer_division(p_event_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
DECLARE
  v_hijos    uuid[];
  v_mensajes integer;
  v_pagos    integer;
  v_movidas  integer;
  v_orig     public.events%rowtype;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_orig FROM public.events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El evento no existe' USING ERRCODE = 'P0001';
  END IF;

  SELECT array_agg(id) INTO v_hijos FROM public.events WHERE dividido_de = p_event_id;
  IF v_hijos IS NULL THEN
    RAISE EXCEPTION 'Ese evento no tiene una division que deshacer' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO v_mensajes
    FROM public.chat_messages m
    JOIN public.chat_conversations c ON c.id = m.conversation_id
   WHERE c.event_id = ANY(v_hijos);
  IF v_mensajes > 0 THEN
    RAISE EXCEPTION 'No se puede deshacer: ya hay % mensajes en los chats de los grupos', v_mensajes
      USING ERRCODE = 'P0001';
  END IF;

  -- Si a un grupo ya le entro plata, borrarlo deja el pago apuntando al vacio.
  SELECT count(*) INTO v_pagos
    FROM public.payment_attempts WHERE event_id = ANY(v_hijos);
  IF v_pagos > 0 THEN
    RAISE EXCEPTION 'No se puede deshacer: ya hay % pagos contra los grupos', v_pagos
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.appointments
     SET event_id = p_event_id, updated_at = now()
   WHERE event_id = ANY(v_hijos);
  GET DIAGNOSTICS v_movidas = ROW_COUNT;

  DELETE FROM public.events WHERE id = ANY(v_hijos);

  UPDATE public.events
     SET name = coalesce(dividido_nombre_previo, regexp_replace(coalesce(name, ''), '^BORRAR \| ', '')),
         event_status = coalesce(dividido_status_previo, 'published'),
         dividido_at = NULL,
         dividido_nombre_previo = NULL,
         dividido_status_previo = NULL
   WHERE id = p_event_id;

  RETURN jsonb_build_object(
    'grupos_borrados', array_length(v_hijos, 1),
    'personas_devueltas', v_movidas
  );
END;
$$;

revoke all on function public.admin_dividir_evento(uuid, jsonb) from public;
revoke all on function public.admin_deshacer_division(uuid) from public;
grant execute on function public.admin_dividir_evento(uuid, jsonb) to authenticated;
grant execute on function public.admin_deshacer_division(uuid) to authenticated;
