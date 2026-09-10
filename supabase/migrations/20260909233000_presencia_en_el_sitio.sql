-- Hasta que hora siguio cada persona EN EL SITIO del evento.
--
-- Para que: ya se sabe a que hora llegan (checked_in_at) y cuando termina la
-- dinamica (la ultima pregunta registrada), pero no cuanto se quedan
-- conversando despues, que es justo lo que distingue un evento que funciono de
-- uno que no.
--
-- Como: mientras la pantalla de la dinamica este abierta, la app manda su
-- posicion cada 5 minutos y aqui se comprueba que siga dentro del radio del
-- evento. Reutiliza el permiso de ubicacion que la persona ya dio al confirmar
-- su llegada.
--
-- Por que NO se usa ubicacion en segundo plano, que seria lo preciso:
--   - Google Play la revisa aparte y exige que la funcion sea esencial PARA EL
--     USUARIO; "medir cuanto dura mi evento" es beneficio del negocio, y si la
--     rechazan bloquean la actualizacion de la app entera.
--   - iOS le muestra al usuario un mapa periodico de donde se le rastreo.
--   - Las geovallas avisan con 5-15 minutos de retraso igualmente.
--
-- IMPORTANTE: esto es un PISO, no la hora de salida. Solo cuenta con la app
-- abierta; si guardan el telefono y siguen hablando, deja de contar. El error
-- va siempre hacia abajo: se queda corto o acierta, nunca se pasa. Por eso en
-- el admin se dice "al menos hasta" y nunca "termino a las".
alter table public.appointments
  add column if not exists last_seen_at timestamptz;

comment on column public.appointments.last_seen_at is
  'Ultima vez que el GPS confirmo a esta persona dentro del radio del evento. Es un piso: solo se actualiza con la app abierta. NULL = nunca se registro (version vieja de la app, o no dio ubicacion).';

create index if not exists appointments_event_last_seen_idx
  on public.appointments (event_id, last_seen_at desc nulls last);

-- La llama la app. Comprueba que quien reporta va de verdad a ese evento y que
-- esta dentro del radio; si no, no toca nada.
create or replace function public.registrar_presencia(
  p_event_id uuid, p_lat double precision, p_lng double precision
) returns boolean
language plpgsql security definer set search_path = public
as $$
DECLARE
  v_lat double precision; v_lng double precision;
  v_radio double precision; v_dist double precision; v_cita uuid;
BEGIN
  SELECT a.id INTO v_cita FROM appointments a
  WHERE a.event_id = p_event_id AND a.user_id = auth.uid()
    AND a.status IN ('confirmada','anterior') LIMIT 1;
  IF v_cita IS NULL THEN RETURN false; END IF;

  SELECT e.latitude, e.longitude, coalesce(e.radius_meters, 150)
    INTO v_lat, v_lng, v_radio FROM events e WHERE e.id = p_event_id;
  IF v_lat IS NULL OR v_lng IS NULL OR p_lat IS NULL OR p_lng IS NULL THEN
    RETURN false;   -- sin coordenadas no se inventa una presencia
  END IF;

  -- Haversine en metros, a mano para no depender de postgis.
  v_dist := 2 * 6371000 * asin(sqrt(
      power(sin(radians(p_lat - v_lat) / 2), 2)
      + cos(radians(v_lat)) * cos(radians(p_lat))
      * power(sin(radians(p_lng - v_lng) / 2), 2)));

  IF v_dist > v_radio THEN
    RETURN false;   -- ya salio del sitio: no se pisa la ultima marca buena
  END IF;

  UPDATE appointments SET last_seen_at = now() WHERE id = v_cita;
  RETURN true;
END;
$$;

-- Para la lista de "En Vivo": el admin lista desde event_participants y el dato
-- vive en appointments; unirlas en el cliente obligaria a traer todas las citas
-- de todos los eventos.
create or replace function public.admin_get_presencia(p_event_id uuid)
returns table(user_id uuid, checked_in_at timestamptz, last_seen_at timestamptz)
language plpgsql security definer set search_path = public
as $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT a.user_id, a.checked_in_at, a.last_seen_at FROM appointments a
  WHERE a.event_id = p_event_id AND a.status IN ('confirmada','anterior');
END;
$$;

-- Resumen de como termino la noche, en una sola fila. Junta tres tablas.
create or replace function public.admin_get_cierre_evento(p_event_id uuid)
returns table(
  primer_ingreso timestamptz, fin_dinamica timestamptz, ultima_presencia timestamptz,
  reportaron integer, total integer, siguen_ahi integer
)
language plpgsql security definer set search_path = public
as $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    (SELECT min(a.checked_in_at) FROM appointments a
      WHERE a.event_id = p_event_id AND a.checked_in_at IS NOT NULL),
    (SELECT max(q.created_at) FROM question_stats q WHERE q.event_id = p_event_id),
    (SELECT max(a.last_seen_at) FROM appointments a WHERE a.event_id = p_event_id),
    (SELECT count(*)::int FROM appointments a
      WHERE a.event_id = p_event_id AND a.last_seen_at IS NOT NULL),
    (SELECT count(*)::int FROM appointments a
      WHERE a.event_id = p_event_id AND a.status IN ('confirmada','anterior')),
    -- "Sigue ahi" = reporto en los ultimos 12 minutos. La app avisa cada 5, asi
    -- que dos fallos seguidos todavia no bastan para darlo por ido.
    (SELECT count(*)::int FROM appointments a
      WHERE a.event_id = p_event_id AND a.last_seen_at > now() - interval '12 minutes');
END;
$$;

revoke all on function public.registrar_presencia(uuid, double precision, double precision) from public, anon;
revoke all on function public.admin_get_presencia(uuid) from public, anon;
revoke all on function public.admin_get_cierre_evento(uuid) from public, anon;
grant execute on function public.registrar_presencia(uuid, double precision, double precision) to authenticated;
grant execute on function public.admin_get_presencia(uuid) to authenticated;
grant execute on function public.admin_get_cierre_evento(uuid) to authenticated;
