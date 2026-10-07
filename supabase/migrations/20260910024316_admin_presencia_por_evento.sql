-- Hasta que hora se vio a cada persona en el sitio, para un evento.
--
-- Existe como funcion aparte porque el admin lista los asistentes desde
-- event_participants y el dato vive en appointments; unirlas en el cliente
-- obligaria a traer todas las citas de todos los eventos.
create or replace function public.admin_get_presencia(p_event_id uuid)
returns table(
  user_id uuid,
  checked_in_at timestamptz,
  last_seen_at timestamptz
)
language plpgsql security definer set search_path = public
as $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT a.user_id, a.checked_in_at, a.last_seen_at
  FROM appointments a
  WHERE a.event_id = p_event_id
    AND a.status IN ('confirmada','anterior');
END;
$$;

revoke all on function public.admin_get_presencia(uuid) from public, anon;
grant execute on function public.admin_get_presencia(uuid) to authenticated;