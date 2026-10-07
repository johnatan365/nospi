create or replace function public.user_photos_max_seis()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if (select count(*) from public.user_photos where user_id = new.user_id) > 6 then
    raise exception 'Maximo 6 fotos por persona' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger user_photos_max_seis_trg
  after insert on public.user_photos
  deferrable initially deferred
  for each row execute function public.user_photos_max_seis();

insert into public.user_photos (user_id, url, orden)
select u.id, u.profile_photo_url, 0
from public.users u
where u.profile_photo_url is not null
  and u.profile_photo_url <> ''
  and not exists (select 1 from public.user_photos p where p.user_id = u.id);