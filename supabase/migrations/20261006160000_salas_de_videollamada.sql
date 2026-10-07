-- Salas de videollamada guardadas, para no pegar links a mano cada vez.
--
-- Son salas FIJAS y reutilizables: las mismas sirven todas las semanas. Por eso
-- la tabla no lleva un estado "usada". Que una sala este ocupada no es un dato
-- que haya que guardar y mantener al dia --se desincroniza al primer descuido--
-- sino algo que se deduce: una sala esta ocupada si un evento de ese mismo dia
-- que todavia no se ha cerrado ya la tiene puesta en meet_link.
--
-- El choque que esto evita es real. El 2 de octubre hubo cuatro videollamadas y
-- solo tres links distintos: el evento original y la "Mesa 1" quedaron con la
-- misma sala. No paso nada porque el original habia quedado vacio, pero dos
-- grupos con la misma sala a la misma hora es gente de mesas distintas cayendo
-- en la misma llamada.
--
-- La regla al repartir es: nunca repetir. Si no alcanzan las salas, los grupos
-- de sobra quedan SIN link y marcados, nunca con una sala repetida para
-- rellenar.

create table if not exists public.meet_salas (
  id         uuid primary key default gen_random_uuid(),
  url        text not null unique,
  etiqueta   text,
  orden      integer not null default 0,
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.meet_salas is
  'Salas de Google Meet fijas y reutilizables. Que una este ocupada se deduce de events.meet_link, no se guarda aqui.';

alter table public.meet_salas enable row level security;

drop policy if exists "admins gestionan las salas" on public.meet_salas;
create policy "admins gestionan las salas" on public.meet_salas
  for all using (public.is_admin()) with check (public.is_admin());

create index if not exists idx_meet_salas_orden on public.meet_salas(orden) where activo;

-- Las tres salas que ya se venian usando el 2 de octubre.
insert into public.meet_salas (url, etiqueta, orden) values
  ('https://meet.google.com/jtv-zqct-dit', 'Sala 1', 1),
  ('https://meet.google.com/eay-beiq-wzt', 'Sala 2', 2),
  ('https://meet.google.com/egy-cesi-dau', 'Sala 3', 3)
on conflict (url) do nothing;

-- ── que salas estan libres ese dia ──────────────────────────────────────────
--
-- p_excluir_event_id sirve para no contarse a si mismo: al dividir, el evento
-- original tiene puesta una sala y sus grupos la pueden volver a usar.

create or replace function public.admin_salas_libres(
  p_fecha date,
  p_excluir_event_id uuid default null
) returns table(id uuid, url text, etiqueta text, orden integer)
language plpgsql security definer set search_path = public
as $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT s.id, s.url, s.etiqueta, s.orden
  FROM public.meet_salas s
  WHERE s.activo
    AND NOT EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.meet_link = s.url
        AND e.type = 'virtual'
        AND coalesce(e.event_status, '') <> 'closed'
        AND e.dividido_at IS NULL          -- el original archivado ya no cuenta
        AND (e.date AT TIME ZONE 'America/Bogota')::date = p_fecha
        AND (p_excluir_event_id IS NULL OR e.id <> p_excluir_event_id)
    )
  ORDER BY s.orden, s.created_at;
END;
$$;

-- ── guardar la lista completa ───────────────────────────────────────────────
--
-- Recibe las urls en el orden en que quedaron escritas. Lo que ya no aparece se
-- apaga en vez de borrarse: un evento viejo puede seguir apuntando a esa url y
-- no tiene por que perder su historial.

create or replace function public.admin_guardar_salas(p_urls text[])
returns jsonb
language plpgsql security definer set search_path = public
as $$
DECLARE
  v_url   text;
  v_i     integer := 0;
  v_vivas text[] := '{}';
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  FOREACH v_url IN ARRAY coalesce(p_urls, '{}')
  LOOP
    v_url := btrim(v_url);
    CONTINUE WHEN v_url = '';
    IF v_url !~* '^https://meet\.google\.com/\S+$' THEN
      RAISE EXCEPTION 'Esto no parece un link de Meet: %', v_url USING ERRCODE = 'P0001';
    END IF;
    v_i := v_i + 1;
    v_vivas := v_vivas || v_url;

    INSERT INTO public.meet_salas (url, etiqueta, orden, activo)
    VALUES (v_url, 'Sala ' || v_i, v_i, true)
    ON CONFLICT (url) DO UPDATE
      SET orden = excluded.orden, etiqueta = excluded.etiqueta, activo = true;
  END LOOP;

  UPDATE public.meet_salas SET activo = false WHERE NOT (url = ANY(v_vivas));

  RETURN jsonb_build_object('guardadas', v_i);
END;
$$;

-- ── dividir, ahora con la sala de cada grupo ────────────────────────────────
--
-- Unico cambio sobre la version anterior: cada grupo puede traer su "meet_link"
-- y se guarda en el evento nuevo. Si no lo trae, queda NULL como antes. Dos
-- grupos de la misma division no pueden quedar con la misma sala.

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

revoke all on function public.admin_salas_libres(date, uuid) from public;
revoke all on function public.admin_guardar_salas(text[]) from public;
grant execute on function public.admin_salas_libres(date, uuid) to authenticated;
grant execute on function public.admin_guardar_salas(text[]) to authenticated;

-- ── la cuarta sala, y el contador de uso ────────────────────────────────────
--
-- Al revisar el historial aparecieron 4 links distintos, no 3: el del 30 de
-- septiembre no se habia vuelto a usar.

insert into public.meet_salas (url, etiqueta, orden)
values ('https://meet.google.com/xjs-kdyu-fkz', 'Sala 4', 4)
on conflict (url) do nothing;

-- Cuantas veces se ha usado cada sala y cuando fue la ultima.
--
-- No es decoracion: una sala muy usada es una sala que mucha gente ya se
-- guardo, y entrar a una videollamada sin haber pagado es tan facil como abrir
-- el link viejo. Ver el contador es lo que deja decidir cuando rotarla.

create or replace function public.admin_salas_con_uso()
returns table(
  id uuid, url text, etiqueta text, orden integer, activo boolean,
  veces_usada integer, ultima_vez timestamptz
)
language plpgsql security definer set search_path = public
as $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT s.id, s.url, s.etiqueta, s.orden, s.activo,
         (SELECT count(*)::int FROM public.events e
           WHERE e.meet_link = s.url AND e.type = 'virtual'),
         (SELECT max(e.date) FROM public.events e
           WHERE e.meet_link = s.url AND e.type = 'virtual')
  FROM public.meet_salas s
  WHERE s.activo
  ORDER BY s.orden, s.created_at;
END;
$$;

revoke all on function public.admin_salas_con_uso() from public;
grant execute on function public.admin_salas_con_uso() to authenticated;
