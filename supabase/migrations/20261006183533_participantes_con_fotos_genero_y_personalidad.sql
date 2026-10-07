-- Version 2 de get_event_participants_for_interaction.
--
-- Es una funcion nueva y no un CREATE OR REPLACE porque cambia la forma de la
-- tabla que devuelve, y Postgres exige borrar la anterior para eso. La v1
-- sigue viva para las apps ya instaladas que aun no se han actualizado.
--
-- Agrega lo que la ficha de perfil nueva necesita y antes no viajaba:
--   user_gender              -> para el avatar de Nospi cuando no hay foto
--   user_personality_traits  -> los chips de "Como es"
--   user_photos              -> todas las fotos, no solo la principal
create or replace function public.get_event_participants_for_interaction_v2(p_event_id uuid)
returns table (
  id uuid,
  event_id uuid,
  user_id uuid,
  confirmed boolean,
  check_in_time timestamptz,
  is_presented boolean,
  presented_at timestamptz,
  user_name text,
  user_city text,
  user_profile_photo_url text,
  user_edad integer,
  user_interests jsonb,
  user_gender text,
  user_personality_traits jsonb,
  user_photos jsonb
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() and not exists (
    select 1 from public.appointments a
    where a.event_id = p_event_id
      and a.user_id = auth.uid()
      and coalesce(a.status, '') <> 'cancelada'
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  select
    ep.id, ep.event_id, ep.user_id, ep.confirmed,
    ep.check_in_time, ep.is_presented, ep.presented_at,
    u.name, u.city, u.profile_photo_url,
    case when u.birthdate is null then null
         else date_part('year', age(u.birthdate))::integer end,
    u.interests,
    u.gender,
    u.personality_traits,
    coalesce(
      (select jsonb_agg(p.url order by p.orden)
         from public.user_photos p
        where p.user_id = ep.user_id),
      case when u.profile_photo_url is null then '[]'::jsonb
           else jsonb_build_array(u.profile_photo_url) end
    )
  from public.event_participants ep
  left join public.users u on ep.user_id = u.id
  where ep.event_id = p_event_id
    and ep.confirmed = true
  order by ep.check_in_time asc nulls last;
end;
$$;

comment on function public.get_event_participants_for_interaction(uuid) is
  'OBSOLETA: usar get_event_participants_for_interaction_v2, que ademas trae genero, personalidad y todas las fotos. Se mantiene por las apps sin actualizar.';