-- En la media hora previa al evento, todos los mensajes salian firmados como
-- "Un participante".
--
-- Por que: en esa etapa ('sin_lista') la lista de miembros esta oculta a
-- proposito -- no se quiere revelar quien va a ir antes de que empiece -- y
-- get_conversation_participants devolvia CERO filas. Sin esa lista la app no
-- tiene con que resolver los nombres, asi que ningun mensaje tenia autor.
--
-- El efecto era el contrario del buscado: el chat se abre media hora antes
-- justamente para que se saluden, y se saludaban a ciegas.
--
-- Arreglo: en esa etapa se devuelven SOLO las personas que ya escribieron algo.
-- Quien habla se esta presentando por su cuenta; quien calla sigue sin
-- aparecer, que es lo que la regla queria proteger. La lista completa se sigue
-- viendo solo cuando corresponde.
create or replace function public.get_conversation_participants(p_conversation_id uuid)
returns table(user_id uuid, name text, profile_photo_url text, edad integer, interests jsonb)
language plpgsql security definer set search_path to 'public'
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
         u.interests
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