-- La primera version leia new.profile_photo_url / new.url dentro de un CASE.
-- PL/pgSQL resuelve los campos de NEW por nombre y la rama que no existe en
-- esa tabla hacia que el disparador no funcionara. Pasando el registro a
-- jsonb se lee el campo que haya, sin importar en que tabla este puesto.
create or replace function public.rechaza_foto_vacia()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_json jsonb := to_jsonb(new);
  v_url  text  := coalesce(v_json->>'profile_photo_url', v_json->>'url');
  v_path text;
  v_size bigint;
begin
  if v_url is null or v_url = '' then
    return new;
  end if;

  v_path := split_part(split_part(v_url, '/storage/v1/object/public/profile-photos/', 2), '?', 1);
  if v_path = '' then
    return new;  -- URL externa (avatar por defecto, foto de Google): no se valida
  end if;

  select (o.metadata->>'size')::bigint into v_size
  from storage.objects o
  where o.bucket_id = 'profile-photos' and o.name = v_path;

  if v_size = 0 then
    raise exception 'La imagen se subio vacia (0 bytes). Intenta con otra foto de tu galeria.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

-- Limpieza de las fotos que quedaron apuntando a un archivo vacio.
-- Va dentro de una funcion y no suelta porque DELETE suelto se queda colgado
-- a traves del MCP de Supabase.
create or replace function public.limpia_fotos_vacias()
returns table (user_id uuid, url_borrada text)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  return query
  with vacias as (
    select p.id, p.user_id, p.url
    from public.user_photos p
    join storage.objects o
      on o.bucket_id = 'profile-photos'
     and o.name = split_part(split_part(p.url, '/storage/v1/object/public/profile-photos/', 2), '?', 1)
    where (o.metadata->>'size')::bigint = 0
  ), borradas as (
    delete from public.user_photos d
    using vacias v
    where d.id = v.id
    returning d.user_id, d.url
  )
  select b.user_id, b.url from borradas b;
end;
$$;

comment on function public.limpia_fotos_vacias() is
  'Borra las filas de user_photos cuyo archivo en storage pesa 0 bytes. El disparador sync_foto_principal deja users.profile_photo_url en NULL solo.';