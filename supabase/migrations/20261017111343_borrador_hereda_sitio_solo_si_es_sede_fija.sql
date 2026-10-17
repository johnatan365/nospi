-- Cuando un evento se cierra, se crea su borrador para 3 semanas despues.
-- Ese borrador NO debe heredar el lugar: ni nombre, ni direccion, ni mapa,
-- ni coordenadas GPS.
--
-- La migracion 20261008170137 uso is_location_revealed como condicion para
-- heredar el sitio. Eso es incorrecto: esa bandera se pone en true el dia
-- antes de CADA evento (es justamente como se revela la direccion), asi que
-- al momento del cierre siempre vale true y el borrador terminaba naciendo
-- con el nombre, la direccion y las coordenadas del evento anterior. Peor
-- aun, con require_gps_verification heredado, el check-in por GPS quedaba
-- apuntando a un sitio que todavia no esta confirmado.
--
-- Se separan los dos conceptos:
--   is_location_revealed -> "la direccion ya se le mostro a los inscritos"
--   sitio_publico        -> "este evento es de sede fija y su lugar es publico"
-- Solo sitio_publico hace que el borrador herede el lugar.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS sitio_publico boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.events.sitio_publico IS
  'Evento de sede fija cuyo lugar es publico desde el principio. Solo estos heredan location_name/address/maps_link/coordenadas al generar el borrador recurrente.';

-- La Sala de Despecho es el unico evento de sede fija hoy.
UPDATE public.events SET sitio_publico = true WHERE name ILIKE '%sala de despecho%';

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
         latitude, longitude, radius_meters, gps_link, sitio_publico
    INTO ev
  FROM public.events WHERE id = p_event_id;

  IF NOT FOUND OR ev.date IS NULL THEN RETURN; END IF;

  -- No autogenerar caminatas ni "Cena Solo Mujeres": no son semanales, se crean a mano.
  IF ev.type = 'caminata' OR ev.name ILIKE '%solo mujeres%' THEN
    RETURN;
  END IF;

  -- El borrador hereda el sitio SOLO en eventos de sede fija. Para todos los
  -- demas nace en blanco: sin nombre, sin direccion, sin mapa, sin coordenadas
  -- y sin la bandera de revelado. Antes esto miraba is_location_revealed, que
  -- al momento del cierre ya esta en true para todos (ver cabecera).
  v_sitio := COALESCE(ev.sitio_publico, false);

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
      CASE WHEN v_sitio THEN COALESCE(ev.location_name, '')    ELSE '' END,
      CASE WHEN v_sitio THEN COALESCE(ev.location_address, '') ELSE '' END,
      CASE WHEN v_sitio THEN COALESCE(ev.maps_link, '')        ELSE '' END,
      ev.require_gps_verification, v_sitio, v_sitio,
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
