-- El sorteo de preguntas ignoraba si la pregunta era presencial o virtual.
--
-- event_questions tiene una columna applies_to con tres valores: 'todos',
-- 'presencial' y 'virtual'. El generador de borradores nunca la miraba: sacaba
-- 8 preguntas por nivel de TODO el banco, sin importar el tipo de evento.
--
-- Ya estaba pasando: dos preguntas marcadas como solo presenciales se colaron
-- en videollamadas. Al reves es peor, porque las marcadas como virtuales son
-- los juegos que solo funcionan por camara -- la caza del color, la carrera
-- por la casa, el retrato a ciegas. Caerle una de esas a un cafe significa que
-- el moderador lee en voz alta "todos traigan algo de ese color a la camara"
-- en la mesa de un restaurante.
--
-- Ahora el sorteo filtra: un evento virtual recibe las de 'virtual' y las de
-- 'todos'; cualquier otro recibe las de 'presencial' y las de 'todos'.
--
-- Nota: esto solo afecta a los borradores que se generen de aqui en adelante.
-- Las preguntas ya repartidas a eventos existentes no se tocan.

CREATE OR REPLACE FUNCTION public.create_recurring_drafts_for_event(p_event_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ev record;
  meses text[] := ARRAY['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  off int;
  new_date timestamptz;
  new_start timestamptz;
  local_d date;
  fecha_txt text;
  new_name text;
  new_id uuid;
  v_nacional boolean;
  v_cities text[];
  v_meet text;
  v_ambito text;
BEGIN
  SELECT name, subtitulo, city, cities, nacional, description, type, date, start_time, time,
         require_gps_verification, max_participants, confirmation_code, price,
         aviso_consumo, aviso_consumo_en
    INTO ev
  FROM public.events WHERE id = p_event_id;

  IF NOT FOUND OR ev.date IS NULL THEN RETURN; END IF;

  IF ev.type = 'caminata' OR ev.name ILIKE '%solo mujeres%' THEN
    RETURN;
  END IF;

  -- Que mitad del banco le corresponde a este tipo de evento.
  v_ambito := CASE WHEN ev.type = 'virtual' THEN 'virtual' ELSE 'presencial' END;

  v_nacional := COALESCE(ev.nacional, false) OR ev.city = 'Todo el país';

  IF v_nacional THEN
    v_cities := ARRAY[]::text[];
  ELSE
    v_cities := COALESCE(NULLIF(ev.cities, ARRAY[]::text[]),
                         CASE WHEN COALESCE(ev.city, '') = '' THEN ARRAY[]::text[]
                              ELSE ARRAY[ev.city] END);
    v_cities := COALESCE(
      (SELECT array_agg(c) FROM unnest(v_cities) AS c WHERE c <> 'Todo el país'),
      ARRAY[]::text[]);
  END IF;

  FOREACH off IN ARRAY ARRAY[21] LOOP
    new_date  := ev.date + (off || ' days')::interval;
    new_start := CASE WHEN ev.start_time IS NULL THEN NULL ELSE ev.start_time + (off || ' days')::interval END;
    local_d   := (new_date AT TIME ZONE 'America/Bogota')::date;
    fecha_txt := (extract(day from local_d)::int)::text || ' de ' || meses[extract(month from local_d)::int];

    IF ev.name IS NULL OR ev.name = '' THEN
      new_name := NULL;
    ELSIF ev.name ~ '\([^)]*\)' THEN
      new_name := regexp_replace(ev.name, '\([^)]*\)([^()]*)$', '(' || fecha_txt || ')\1');
    ELSE
      new_name := ev.name || ' (' || fecha_txt || ')';
    END IF;

    IF new_name IS NOT NULL AND EXISTS (SELECT 1 FROM public.events WHERE name = new_name) THEN
      CONTINUE;
    END IF;

    v_meet := NULL;
    IF ev.type = 'virtual' THEN
      SELECT s.url INTO v_meet
      FROM public.meet_salas s
      WHERE s.activo
        AND NOT EXISTS (
          SELECT 1 FROM public.events e
          WHERE e.meet_link = s.url
            AND e.type = 'virtual'
            AND coalesce(e.event_status, '') <> 'closed'
            AND e.dividido_at IS NULL
            AND (e.date AT TIME ZONE 'America/Bogota')::date = local_d
        )
      ORDER BY s.orden, s.created_at
      LIMIT 1;
    END IF;

    INSERT INTO public.events (
      name, subtitulo, city, cities, nacional, description, type, date, start_time, time,
      location_name, location_address, maps_link,
      require_gps_verification, is_location_revealed, sitio_publico,
      latitude, longitude, radius_meters, gps_link,
      max_participants, current_participants, event_status,
      confirmation_code, price, meet_link,
      aviso_consumo, aviso_consumo_en
    ) VALUES (
      new_name, ev.subtitulo, ev.city, v_cities, v_nacional, ev.description, ev.type, new_date, new_start, ev.time,
      '', '', '',
      ev.require_gps_verification, false, false,
      NULL, NULL, 200, NULL,
      ev.max_participants, 0, 'draft',
      ev.confirmation_code, ev.price, v_meet,
      ev.aviso_consumo, ev.aviso_consumo_en
    ) RETURNING id INTO new_id;

    -- El sorteo ahora respeta applies_to: solo entran las de este ambito y las
    -- marcadas para todos.
    INSERT INTO public.event_questions (event_id, level, question_text, question_order, is_default, is_pinned, category, applies_to)
    WITH bank AS (
      SELECT level, question_text, is_pinned, category, applies_to
      FROM public.event_questions
      WHERE event_id IS NULL
        AND coalesce(applies_to, 'todos') IN ('todos', v_ambito)
    ),
    ranked AS (
      SELECT level, question_text, is_pinned, category, applies_to,
             row_number() OVER (PARTITION BY level ORDER BY is_pinned DESC, random()) AS rn
      FROM bank
    )
    SELECT new_id, level, question_text, rn - 1, true, is_pinned, category, applies_to
    FROM ranked
    WHERE rn <= 8;
  END LOOP;
END;
$function$;
