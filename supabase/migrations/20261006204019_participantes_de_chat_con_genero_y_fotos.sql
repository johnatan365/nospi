-- Version 2: agrega genero, personalidad, ciudad y todas las fotos.
--
-- El genero hace falta para pintar el personaje de Nospi de quien no subio
-- foto. Hoy el 89% de las personas no tiene foto, asi que la lista de un chat
-- de grupo se ve como un muro de iniciales sobre circulos de colores.
--
-- Es funcion nueva y no CREATE OR REPLACE porque cambia la forma de la tabla
-- que devuelve, y Postgres exige borrar la anterior para eso. La v1 se queda
-- viva para las apps que la gente aun no ha actualizado.
create or replace function public.get_conversation_participants_v2(p_conversation_id uuid)
returns table (
  user_id uuid,
  name text,
  profile_photo_url text,
  edad integer,
  interests jsonb,
  gender text,
  personality_traits jsonb,
  city text,
  fotos jsonb
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_event_id uuid;
  v_etapa text;
begin
  if not public.is_chat_participant(p_conversation_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_etapa := public.chat_evento_etapa(p_conversation_id);

  -- Antes de que el chat abra no se devuelve nada, como siempre.
  if v_etapa = 'cerrado' then
    return;
  end if;

  select c.event_id into v_event_id
  from public.chat_conversations c where c.id = p_conversation_id;

  return query
  select u.id, u.name, u.profile_photo_url,
         case when u.birthdate is null then null
              else date_part('year', age(u.birthdate))::integer end,
         u.interests,
         u.gender,
         u.personality_traits,
         u.city,
         coalesce(
           (select jsonb_agg(p.url order by p.orden)
              from public.user_photos p where p.user_id = u.id),
           case when u.profile_photo_url is null then '[]'::jsonb
                else jsonb_build_array(u.profile_photo_url) end
         )
  from public.chat_participants cp
  join public.users u on u.id = cp.user_id
  where cp.conversation_id = p_conversation_id
    -- En la ventana previa: solo quien ya escribio. Se presenta solo.
    and (
      v_etapa <> 'sin_lista'
      or exists (
        select 1 from public.chat_messages m
        where m.conversation_id = p_conversation_id
          and m.sender_id = cp.user_id
          and m.deleted_at is null
      )
    )
    -- En un chat de evento ya pasado, solo se listan los que asistieron:
    -- quien no fue no aparece para nadie.
    and (
      v_event_id is null
      or v_etapa <> 'solo_asistentes'
      or public.asistio_al_evento(v_event_id, cp.user_id)
    );
end;
$function$;

comment on function public.get_conversation_participants(uuid) is
  'OBSOLETA: usar get_conversation_participants_v2, que ademas trae genero, personalidad, ciudad y todas las fotos. Se mantiene por las apps sin actualizar.';