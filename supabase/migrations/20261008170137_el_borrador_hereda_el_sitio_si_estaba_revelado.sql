-- El borrador hereda el lugar SOLO si el evento origen lo tenia revelado.
--
-- Hasta ahora nacia siempre sin sitio: location_name y la direccion en blanco,
-- is_location_revealed en false, y sin coordenadas. Para una cena eso esta
-- bien y es deliberado -- el sitio es secreto hasta 48 horas antes, y copiarlo
-- lo delataria tres semanas antes de tiempo.
--
-- Pero no vale para un evento donde el sitio ES la oferta. En Sala de Despecho
-- el nombre del bar es lo que convence a la gente de entrar, y ademas el
-- check-in por GPS necesita las coordenadas: sin ellas, a quien asiste le queda
-- marcado que no fue.
--
-- La condicion es is_location_revealed, y no una lista de nombres ni el tipo de
-- evento, porque ya significa exactamente lo que hace falta: "el lugar de este
-- evento es publico". Si manana hay otro evento asi, funciona solo.
--
-- Se hereda el paquete completo del sitio -- nombre, direccion, mapa,
-- coordenadas, radio y el link del GPS -- porque de nada sirve el nombre sin
-- las coordenadas: el borrador saldria con direccion y sin poder confirmar
-- asistencia, que es peor que no tener nada, porque nadie lo nota hasta el dia
-- del evento.

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
  v_sitio boolean;
BEGIN
  SELECT name, subtitulo, city, cities, nacional, description, type, date, start_time, time,
         require_gps_verification, max_participants, confirmation_code, price,
         aviso_consumo, aviso_consumo_en,
         location_name, location_address, maps_link, is_location_revealed,
         latitude, longitude, radius_meters, gps_link
    INTO ev
  FROM public.events WHERE id = p_event_id;

  IF NOT FOUND OR ev.date IS NULL THEN RETURN; END IF;

  -- No autogenerar caminatas ni "Cena Solo Mujeres": no son semanales, se crean a mano.
  IF ev.type = 'caminata' OR ev.name ILIKE '%solo mujeres%' THEN
    RETURN;
  END IF;

  -- Si el sitio era publico, la copia nace con el. Si era secreto, en blanco.
  v_sitio := COALESCE(ev.is_location_revealed, false);

  -- Alcance del evento, con la misma regla que constants/Ciudades.ts:
  -- esNacional() tambien acepta la columna legacy city = 'Todo el pais', y
  -- ciudadesDeEvento() cae a [city] cuando cities viene vacio. Sin esto, el
  -- borrador nacia con nacional = false y sin ciudades, y no le aparecia a
  -- nadie; y un evento de varias ciudades perdia todas menos la primera.
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

  -- Crear SOLO la copia a +21 dias: una por cierre, manteniendo ~3 semanas de
  -- anticipacion (las semanas +7 y +14 ya las crearon los dos cierres anteriores).
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

    -- Anti-duplicado: si ya existe un evento con ese nombre, no crear otro.
    IF new_name IS NOT NULL AND EXISTS (SELECT 1 FROM public.events WHERE name = new_name) THEN
      CONTINUE;
    END IF;

    -- El link NO se copia del evento origen (cada videollamada necesita su propia
    -- sala). En su lugar se toma la primera sala ACTIVA que este libre ese dia,
    -- con el mismo criterio que admin_salas_libres. Si no hay ninguna libre queda
    -- NULL y se asigna a mano desde el admin.
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
      require_gps_verification, is_location_revealed,
      latitude, longitude, radius_meters, gps_link,
      max_participants, current_participants, event_status,
      confirmation_code, price, meet_link,
      aviso_consumo, aviso_consumo_en
    ) VALUES (
      new_name, ev.subtitulo, ev.city, v_cities, v_nacional, ev.description, ev.type, new_date, new_start, ev.time,
      CASE WHEN v_sitio THEN COALESCE(ev.location_name, '')    ELSE '' END,
      CASE WHEN v_sitio THEN COALESCE(ev.location_address, '') ELSE '' END,
      CASE WHEN v_sitio THEN COALESCE(ev.maps_link, '')        ELSE '' END,
      ev.require_gps_verification, v_sitio,
      CASE WHEN v_sitio THEN ev.latitude      ELSE NULL END,
      CASE WHEN v_sitio THEN ev.longitude     ELSE NULL END,
      CASE WHEN v_sitio THEN ev.radius_meters ELSE 200 END,
      CASE WHEN v_sitio THEN ev.gps_link      ELSE NULL END,
      ev.max_participants, 0, 'draft',
      ev.confirmation_code, ev.price, v_meet,
      ev.aviso_consumo, ev.aviso_consumo_en
    ) RETURNING id INTO new_id;

    INSERT INTO public.event_questions (event_id, level, question_text, question_order, is_default, is_pinned)
    WITH bank AS (
      SELECT level, question_text, is_pinned
      FROM public.event_questions WHERE event_id IS NULL
    ),
    ranked AS (
      SELECT level, question_text, is_pinned,
             row_number() OVER (PARTITION BY level ORDER BY is_pinned DESC, random()) AS rn
      FROM bank
    )
    SELECT new_id, level, question_text, rn - 1, true, is_pinned
    FROM ranked
    WHERE rn <= 8;
  END LOOP;
END;
$function$;
