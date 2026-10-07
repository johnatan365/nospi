-- Resumen de como termino la noche, en una sola fila.
--
-- Junta tres cosas que viven en tablas distintas: la primera llegada
-- (appointments.checked_in_at), el fin de la dinamica (la ultima pregunta
-- registrada en question_stats) y hasta cuando se vio a alguien en el sitio
-- (appointments.last_seen_at).
--
-- Lo de "al menos" no es prudencia retorica: last_seen_at solo se actualiza con
-- la app abierta, asi que el numero se queda corto o acierta, nunca se pasa.
create or replace function public.admin_get_cierre_evento(p_event_id uuid)
returns table(
  primer_ingreso timestamptz,
  fin_dinamica timestamptz,
  ultima_presencia timestamptz,
  reportaron integer,
  total integer,
  siguen_ahi integer
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

revoke all on function public.admin_get_cierre_evento(uuid) from public, anon;
grant execute on function public.admin_get_cierre_evento(uuid) to authenticated;