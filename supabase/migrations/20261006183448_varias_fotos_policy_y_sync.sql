create policy "cada quien gestiona sus fotos" on public.user_photos
  for all to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

create or replace function public.sync_foto_principal()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user uuid := coalesce(new.user_id, old.user_id);
  v_url text;
begin
  select up.url into v_url
  from public.user_photos up
  where up.user_id = v_user
  order by up.orden asc
  limit 1;

  update public.users u
     set profile_photo_url = v_url
   where u.id = v_user
     and u.profile_photo_url is distinct from v_url;

  return null;
end;
$$;

create trigger sync_foto_principal_trg
  after insert or update or delete on public.user_photos
  for each row execute function public.sync_foto_principal();