-- Reordena las fotos de quien llama, en una sola transaccion.
--
-- Tiene que ser una funcion y no varios UPDATE desde la app: al mover una foto
-- de la posicion 3 a la 1, a mitad del cambio hay dos filas con el mismo
-- orden. La restriccion unica es DEFERRABLE justo por eso, pero solo sirve si
-- todos los cambios van en la misma transaccion. Desde la app cada UPDATE es
-- una peticion aparte y el segundo chocaria con el primero.
create or replace function public.reordenar_mis_fotos(p_ids uuid[])
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

  -- Solo se aceptan ids que sean de quien llama, y tienen que venir todos:
  -- un arreglo parcial dejaria huecos en el orden.
  if (select count(*) from public.user_photos where user_id = v_user)
     <> coalesce(array_length(p_ids, 1), 0) then
    raise exception 'la lista debe traer todas tus fotos' using errcode = '22023';
  end if;

  if exists (
    select 1 from unnest(p_ids) as id
    where not exists (
      select 1 from public.user_photos p where p.id = id and p.user_id = v_user
    )
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update public.user_photos p
     set orden = nuevo.pos - 1
    from (select id, row_number() over () as pos from unnest(p_ids) as id) as nuevo
   where p.id = nuevo.id
     and p.user_id = v_user
     and p.orden is distinct from (nuevo.pos - 1)::smallint;
end;
$$;