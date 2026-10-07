-- Red de seguridad del lado del servidor contra las fotos de 0 bytes.
--
-- El arreglo del cliente (lib/subirFoto.ts) impide generar el archivo vacio,
-- pero una app vieja instalada en el telefono de alguien sigue corriendo el
-- codigo anterior durante semanas. Esto hace que el servidor rechace la URL
-- en vez de guardarla: la persona ve un error y vuelve a intentar, en lugar
-- de quedarse creyendo que su foto quedo bien.
create or replace function public.rechaza_foto_vacia()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_url  text := case tg_table_name when 'users' then new.profile_photo_url else new.url end;
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

create trigger rechaza_foto_vacia_users_trg
  before insert or update of profile_photo_url on public.users
  for each row execute function public.rechaza_foto_vacia();

create trigger rechaza_foto_vacia_photos_trg
  before insert or update of url on public.user_photos
  for each row execute function public.rechaza_foto_vacia();