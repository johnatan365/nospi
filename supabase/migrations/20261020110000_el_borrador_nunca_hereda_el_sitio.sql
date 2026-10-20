-- El borrador automatico nunca hereda el sitio del evento anterior.
--
-- Historia del error, en dos capas:
--
-- 1. La version original decidia si copiar el sitio mirando
--    is_location_revealed del evento padre. Para cuando el padre se cierra esa
--    bandera ya esta en true SIEMPRE (el evento ya paso), asi que el borrador
--    nacia con el sitio copiado y con la ubicacion YA REVELADA. La app le
--    mostraba al publico una direccion que el dueno nunca puso.
-- 2. La correccion del 17 de octubre lo ato a sitio_publico (sede fija). Mejor,
--    pero seguia heredando y seguia naciendo revelado en esos casos.
--
-- Quedaron tres eventos de la primera epoca mostrando direccion sin permiso:
-- Cena del 30 de octubre (La Causa), Cafe del 31 (Cafe Primavera) y Bolos del
-- 1 de noviembre (SB Acuario). Se limpiaron a mano.
--
-- Efecto secundario que tambien se arregla: el aviso de "ya esta el lugar"
-- (correo y push) solo se dispara cuando la bandera pasa de oculta a revelada,
-- y es un trigger AFTER UPDATE. A un evento que NACE revelado ese cambio no le
-- ocurre nunca, asi que a sus inscritos jamas les llegaba el aviso del lugar.
--
-- Desde ahora el borrador nace en blanco siempre: sin nombre de lugar, sin
-- direccion, sin mapa, sin GPS y sin la bandera de revelado. Cada evento
-- define su propio sitio a mano. Esto desactiva tambien la herencia de las
-- sedes fijas (sitio_publico): es lo que se pidio, porque los eventos se van a
-- hacer en lugares distintos.

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

-- Limpieza de los tres eventos que ya habian nacido con el sitio heredado.
UPDATE public.events SET
  location_name = '', location_address = '', maps_link = '',
  gps_link = NULL, latitude = NULL, longitude = NULL,
  radius_meters = 200, sitio_publico = false, is_location_revealed = false
WHERE id IN ('63bafa72-ee8f-475b-9411-8de0b3970c10',
             '979fade9-57e7-41fa-8358-f0801c6318bf',
             '07485008-5eeb-412e-a4af-fbca514d7e58');
