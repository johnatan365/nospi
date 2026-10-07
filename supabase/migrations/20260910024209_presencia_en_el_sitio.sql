-- Hasta que hora siguio cada persona EN EL SITIO del evento.
--
-- Para que: hoy se sabe a que hora llegan (checked_in_at) y cuando termina la
-- dinamica, pero no cuanto se quedan conversando despues. Eso es justo lo que
-- distingue un evento que funciono de uno que no.
--
-- Como: mientras la pantalla de la dinamica este abierta, la app manda su
-- posicion cada pocos minutos y aqui se comprueba que siga dentro del radio del
-- evento. Reutiliza el permiso de ubicacion que ya se concedio al confirmar la
-- llegada; NO pide permiso de segundo plano (ese lo revisa Google aparte y
-- puede costar el bloqueo de la app).
--
-- IMPORTANTE: esto es un PISO, no la hora de salida. Solo cuenta mientras
-- alguien tenga la app abierta; si guardan el telefono y siguen hablando, deja
-- de contar. El error va siempre en la misma direccion: se queda corto o
-- acierta, nunca se pasa. Por eso en el admin se dice "al menos hasta".
alter table public.appointments
  add column if not exists last_seen_at timestamptz;

comment on column public.appointments.last_seen_at is
  'Ultima vez que el GPS confirmo a esta persona dentro del radio del evento. Es un piso: solo se actualiza con la app abierta. NULL = nunca se registro (version vieja de la app, o no dio ubicacion).';

-- Indice para el listado del admin, que pide el maximo por evento.
create index if not exists appointments_event_last_seen_idx
  on public.appointments (event_id, last_seen_at desc nulls last);

create or replace function public.registrar_presencia(
  p_event_id uuid,
  p_lat double precision,
  p_lng double precision
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
DECLARE
  v_lat double precision;
  v_lng double precision;
  v_radio double precision;
  v_dist double precision;
  v_cita uuid;
BEGIN
  -- Solo se registra a uno mismo, y solo si de verdad va a ese evento.
  SELECT a.id INTO v_cita
  FROM appointments a
  WHERE a.event_id = p_event_id
    AND a.user_id = auth.uid()
    AND a.status IN ('confirmada','anterior')
  LIMIT 1;
  IF v_cita IS NULL THEN
    RETURN false;
  END IF;

  SELECT e.latitude, e.longitude, coalesce(e.radius_meters, 150)
    INTO v_lat, v_lng, v_radio
  FROM events e WHERE e.id = p_event_id;

  -- Sin coordenadas no hay con que comparar: no se inventa una presencia.
  IF v_lat IS NULL OR v_lng IS NULL OR p_lat IS NULL OR p_lng IS NULL THEN
    RETURN false;
  END IF;

  -- Haversine en metros. Se hace a mano para no depender de postgis ni de
  -- extensiones que habria que instalar solo para esto.
  v_dist := 2 * 6371000 * asin(sqrt(
      power(sin(radians(p_lat - v_lat) / 2), 2)
      + cos(radians(v_lat)) * cos(radians(p_lat))
      * power(sin(radians(p_lng - v_lng) / 2), 2)
  ));

  IF v_dist > v_radio THEN
    RETURN false;   -- ya se fue del sitio: no se toca la ultima marca buena
  END IF;

  UPDATE appointments SET last_seen_at = now() WHERE id = v_cita;
  RETURN true;
END;
$$;

revoke all on function public.registrar_presencia(uuid, double precision, double precision) from public, anon;
grant execute on function public.registrar_presencia(uuid, double precision, double precision) to authenticated;