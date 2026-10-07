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
  v_link    text;
  v_links   text[] := '{}';
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

    v_link := nullif(btrim(coalesce(v_grupo->>'meet_link', '')), '');
    IF v_link IS NOT NULL THEN
      IF v_link = ANY(v_links) THEN
        RAISE EXCEPTION 'Dos grupos quedaron con la misma sala: %', v_link USING ERRCODE = 'P0001';
      END IF;
      v_links := v_links || v_link;
    END IF;

    INSERT INTO public.events (
      type, date, "time", location, max_participants, status,
      address, latitude, longitude, radius_meters, start_time,
      name, city, description, location_name, location_address, maps_link,
      is_location_revealed, event_status, price, gps_link, moderator_id,
      cities, nacional, subtitulo, ocultar_ciudad, require_gps_verification,
      meet_link, dividido_de
    ) VALUES (
      v_orig.type, v_orig.date, v_orig."time", v_orig.location, v_n, v_orig.status,
      v_orig.address, v_orig.latitude, v_orig.longitude, v_orig.radius_meters, v_orig.start_time,
      btrim(v_grupo->>'nombre'), v_orig.city, v_orig.description, v_orig.location_name,
      v_orig.location_address, v_orig.maps_link,
      v_orig.is_location_revealed, v_orig.event_status, v_orig.price, v_orig.gps_link,
      v_orig.moderator_id,
      v_orig.cities, v_orig.nacional, v_orig.subtitulo, v_orig.ocultar_ciudad,
      v_orig.require_gps_verification,
      v_link, p_event_id
    ) RETURNING id INTO v_nuevo;

    UPDATE public.appointments
       SET event_id = v_nuevo, updated_at = now()
     WHERE event_id = p_event_id
       AND user_id = ANY(v_ids)
       AND status <> 'cancelada';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_movidas := v_movidas + v_n;

    INSERT INTO public.event_questions (
      event_id, level, question_text, question_order, is_default,
      is_pinned, pinned_position, category, applies_to
    )
    SELECT v_nuevo, level, question_text, question_order, is_default,
           is_pinned, pinned_position, category, applies_to
      FROM public.event_questions
     WHERE event_id = p_event_id;

    v_creados := v_creados || jsonb_build_object(
      'id', v_nuevo, 'nombre', btrim(v_grupo->>'nombre'), 'personas', v_n,
      'meet_link', v_link);
  END LOOP;

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
         event_status = 'closed',
         dividido_at = now()
   WHERE id = p_event_id;

  RETURN jsonb_build_object(
    'creados', v_creados,
    'personas_movidas', v_movidas,
    'original_id', p_event_id
  );
END;
$$;

update public.events
   set event_status = 'closed'
 where dividido_at is not null and event_status = 'draft';