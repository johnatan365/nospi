-- La cuarta sala que aparecia en el historial de videollamadas (30 de septiembre).
insert into public.meet_salas (url, etiqueta, orden)
values ('https://meet.google.com/xjs-kdyu-fkz', 'Sala 4', 4)
on conflict (url) do nothing;

-- Cuantas veces se ha usado cada sala y cuando fue la ultima.
--
-- No es decoracion: una sala muy usada es una sala que mucha gente ya se
-- guardo, y entrar a una videollamada sin haber pagado es tan facil como
-- abrir el link viejo. Ver el contador es lo que deja decidir cuando rotarla.
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