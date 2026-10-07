-- Renumera las fotos propias de 0 en adelante, sin huecos.
--
-- Se llama justo despues de quitar una foto. El borrado en si lo hace la app
-- contra la tabla (la politica de RLS ya solo deja tocar las propias); aqui
-- solo queda recompactar, que es lo que la app no puede hacer en una sola
-- transaccion por la restriccion unica diferida de (user_id, orden).
create or replace function public.compactar_mis_fotos()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  update public.user_photos p
     set orden = (nuevo.pos - 1)::smallint
    from (
      select id, row_number() over (order by orden, created_at) as pos
      from public.user_photos where user_id = v_user
    ) as nuevo
   where p.id = nuevo.id
     and p.user_id = v_user
     and p.orden is distinct from (nuevo.pos - 1)::smallint;
end;
$$;