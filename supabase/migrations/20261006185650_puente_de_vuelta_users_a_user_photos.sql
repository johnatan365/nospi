-- El puente en el sentido contrario: users.profile_photo_url -> user_photos.
--
-- POR QUE HACE FALTA
-- La pantalla de registro y las apps que la gente aun no ha actualizado
-- escriben la foto DIRECTO en users.profile_photo_url, sin saber que existe
-- user_photos. Sin esto, esa foto no aparecria en la rejilla "Mis fotos" y la
-- persona creeria que se perdio.
--
-- No se cicla con sync_foto_principal porque ese solo escribe en users cuando
-- el valor cambia, y al terminar aqui ya coinciden.
create or replace function public.sync_foto_desde_users()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_n integer;
begin
  if new.profile_photo_url is null or new.profile_photo_url = '' then
    return null;
  end if;

  if exists (
    select 1 from public.user_photos p
    where p.user_id = new.id and p.url = new.profile_photo_url
  ) then
    return null;  -- ya esta en la rejilla, no hay nada que hacer
  end if;

  select count(*) into v_n from public.user_photos where user_id = new.id;

  if v_n = 0 then
    insert into public.user_photos (user_id, url, orden)
    values (new.id, new.profile_photo_url, 0);
  else
    -- Una app sin actualizar acaba de "cambiar la foto de perfil": se cambia
    -- la principal y se dejan las demas como estaban.
    update public.user_photos
       set url = new.profile_photo_url, storage_path = null
     where user_id = new.id and orden = 0;
  end if;

  return null;
end;
$$;

create trigger sync_foto_desde_users_trg
  after insert or update of profile_photo_url on public.users
  for each row execute function public.sync_foto_desde_users();