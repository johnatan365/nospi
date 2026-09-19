-- Esta funcion es SECURITY DEFINER, asi que NO pasa por las policies: era la
-- via por la que se seguia viendo quien va al evento aunque la tabla estuviera
-- cerrada. Y no devuelve solo nombres: devuelve foto, EDAD e intereses, que es
-- justo con lo que alguien decide si va o no.
CREATE OR REPLACE FUNCTION public.get_conversation_participants(p_conversation_id uuid)
 RETURNS TABLE(user_id uuid, name text, profile_photo_url text, edad integer, interests jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_event_id uuid;
begin
  if not public.is_chat_participant(p_conversation_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if not public.chat_lista_miembros_visible(p_conversation_id) then
    return;
  end if;

  select c.event_id into v_event_id
  from public.chat_conversations c where c.id = p_conversation_id;

  return query
  select u.id, u.name, u.profile_photo_url,
         case when u.birthdate is null then null
              else date_part('year', age(u.birthdate))::integer end,
         u.interests
  from public.chat_participants cp
  join public.users u on u.id = cp.user_id
  where cp.conversation_id = p_conversation_id
    -- En un chat de evento ya pasado, solo se listan los que asistieron:
    -- quien no fue no aparece para nadie.
    and (
      v_event_id is null
      or public.chat_evento_etapa(p_conversation_id) <> 'solo_asistentes'
      or public.asistio_al_evento(v_event_id, cp.user_id)
    );
end;
$function$;
