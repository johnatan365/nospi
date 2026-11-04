-- Las preguntas de cierre estaban saliendo de primeras.
--
-- El sorteo ordenaba por "is_pinned DESC, random()" y numeraba desde cero, asi
-- que toda pregunta fijada caia al principio del nivel sin mirar nunca su
-- pinned_position. El resultado se veia absurdo en los eventos ya generados
-- (video llamada del 19, cena del 20, cafe del 21, bolos del 22):
--
--   "LO QUE QUEDO SIN PREGUNTAR: algo que dijeron en este nivel te dio
--   curiosidad?"  -> salia ANTES de que se preguntara nada.
--   "PREGUNTA LIBRE, sin filtro"  -> abria el nivel atrevido con la mesa fria,
--   en vez de cerrarlo.
--
-- Ahora cada fijada va a SU ranura y las demas rellenan las libres en orden.
-- Las posiciones declaradas hoy en el banco:
--   divertido 1 = romper el hielo, 6 = carrera por la casa (virtual),
--             7 = turno del mas callado
--   sensual   3 = caza del color (virtual), 7 = lo que quedo sin preguntar
--   atrevido  7 = pregunta libre
--
-- Si dos fijadas del mismo nivel reclaman la misma ranura entra una sola: nunca
-- se pisan ni se corre la numeracion. Verificado en los dos ambitos antes de
-- aplicar: 8 preguntas por nivel, 8 posiciones distintas, de 0 a 7, sin huecos.
--
-- El insert ahora tambien copia pinned_position al evento. Antes no lo hacia, y
-- por eso en los eventos ya creados esa columna quedo en nulo y hubo que
-- reordenarlos buscando la posicion en el banco por el texto de la pregunta.

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

    -- El sorteo respeta applies_to (solo las de este ambito y las de todos) y
    -- ahora tambien pinned_position: cada fijada va a su ranura.
    INSERT INTO public.event_questions (event_id, level, question_text, question_order, is_default, is_pinned, pinned_position, category, applies_to)
    WITH bank AS (
      SELECT level, question_text, coalesce(is_pinned, false) AS is_pinned,
             pinned_position, category, applies_to
      FROM public.event_questions
      WHERE event_id IS NULL
        AND coalesce(applies_to, 'todos') IN ('todos', v_ambito)
    ),
    fijadas AS (
      SELECT level, question_text, is_pinned, pinned_position, category, applies_to,
             least(greatest(coalesce(pinned_position, 7), 0), 7) AS pos,
             row_number() OVER (
               PARTITION BY level, least(greatest(coalesce(pinned_position, 7), 0), 7)
               ORDER BY random()) AS dup
      FROM bank WHERE is_pinned
    ),
    fijadas_ok AS (
      SELECT level, question_text, is_pinned, pinned_position, category, applies_to, pos
      FROM fijadas WHERE dup = 1
    ),
    libres AS (
      SELECT b.level, s.pos,
             row_number() OVER (PARTITION BY b.level ORDER BY s.pos) AS slot_n
      FROM (SELECT DISTINCT level FROM bank) b
      CROSS JOIN generate_series(0, 7) AS s(pos)
      WHERE NOT EXISTS (
        SELECT 1 FROM fijadas_ok f WHERE f.level = b.level AND f.pos = s.pos)
    ),
    sueltas AS (
      SELECT level, question_text, is_pinned, pinned_position, category, applies_to,
             row_number() OVER (PARTITION BY level ORDER BY random()) AS n
      FROM bank WHERE NOT is_pinned
    )
    SELECT new_id, level, question_text, pos, true, is_pinned, pinned_position, category, applies_to
      FROM fijadas_ok
    UNION ALL
    SELECT new_id, s.level, s.question_text, l.pos, true, s.is_pinned, s.pinned_position,
           s.category, s.applies_to
      FROM sueltas s
      JOIN libres l ON l.level = s.level AND l.slot_n = s.n;
  END LOOP;
END;
$function$;
