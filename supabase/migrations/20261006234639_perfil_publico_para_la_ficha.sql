-- Los datos de perfil que la ficha pide al abrirse.
--
-- POR QUE UNA FUNCION APARTE Y NO UNA COLUMNA MAS EN LAS LISTAS
-- Las listas (participantes de un chat, de un evento) devuelven lo justo para
-- pintar un avatar y un nombre. Cada vez que el perfil gana un campo nuevo
-- habria que crear otra version de CADA una de esas funciones, porque Postgres
-- no deja cambiar la forma de lo que devuelve una funcion sin borrarla.
--
-- Asi, la ficha pide el perfil completo de UNA persona cuando alguien la abre
-- -- que es cuando de verdad hace falta -- y los campos nuevos entran aqui sin
-- tocar nada mas.
--
-- Solo se responde a quien comparta un chat o un evento con esa persona: el
-- perfil de alguien no es publico para toda la base de datos.
create or replace function public.get_perfil_publico(p_user_id uuid)
returns table (
  user_id uuid,
  name text,
  bio text,
  city text,
  gender text,
  edad integer,
  interests jsonb,
  personality_traits jsonb,
  fotos jsonb
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_yo uuid := auth.uid();
begin
  if v_yo is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_user_id <> v_yo and not public.is_admin() and not exists (
    select 1
    from public.chat_participants a
    join public.chat_participants b on b.conversation_id = a.conversation_id
    where a.user_id = v_yo and b.user_id = p_user_id
  ) and not exists (
    select 1
    from public.appointments a
    join public.appointments b on b.event_id = a.event_id
    where a.user_id = v_yo and b.user_id = p_user_id
      and coalesce(a.status,'') <> 'cancelada'
      and coalesce(b.status,'') <> 'cancelada'
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  select u.id, u.name, u.bio, u.city, u.gender,
         case when u.birthdate is null then null
              else date_part('year', age(u.birthdate))::integer end,
         u.interests,
         u.personality_traits,
         coalesce(
           (select jsonb_agg(p.url order by p.orden)
              from public.user_photos p where p.user_id = u.id),
           case when u.profile_photo_url is null then '[]'::jsonb
                else jsonb_build_array(u.profile_photo_url) end
         )
  from public.users u
  where u.id = p_user_id;
end;
$$;