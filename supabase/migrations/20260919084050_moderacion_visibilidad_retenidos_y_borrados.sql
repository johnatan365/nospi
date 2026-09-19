-- Un mensaje se ve si NO esta borrado, NO esta oculto a mano y NO esta
-- retenido esperando aprobacion. Su autor lo sigue viendo mientras no este
-- borrado — para el todo transcurre normal.
drop policy if exists chat_messages_select_participants on public.chat_messages;

create policy chat_messages_select_participants
  on public.chat_messages
  for select
  using (
    (is_chat_participant(conversation_id) or is_admin())
    and deleted_at is null
    and (
      is_admin()
      or sender_id = auth.uid()
      or (hidden_at is null and retenido_at is null)
    )
  );

-- Misma regla para la lista de conversaciones, que al ser SECURITY DEFINER
-- no pasa por la policy. Sin esto, un mensaje retenido seguiria saliendo
-- como ultima linea y sumando al globo de no leidos de todo el grupo.
CREATE OR REPLACE FUNCTION public.get_my_conversations()
 RETURNS TABLE(conversation_id uuid, conv_type text, event_id uuid, event_name text, event_type text, event_date timestamp with time zone, event_status text, other_user_id uuid, other_user_name text, other_user_photo text, last_message text, last_message_at timestamp with time zone, unread_count bigint, replies_open boolean, channel_title text, estado text, solicitada_por uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return query
  select
    c.id, c.type, c.event_id, e.name, e.type, e.date, e.event_status,
    ou.other_id, ou.other_name, ou.other_photo,
    lm.content, lm.created_at,
    (select count(*) from public.chat_messages cm2
       where cm2.conversation_id = c.id
         and cm2.created_at > cp.last_read_at
         and (cm2.sender_id <> auth.uid() or cm2.is_system)
         and cm2.deleted_at is null
         and (cm2.hidden_at is null and cm2.retenido_at is null)),
    c.replies_open,
    case
      when c.type = 'channel_global' then coalesce(c.title, 'Canal Nospi')
      when c.type = 'channel_event'  then coalesce(c.title, 'Avisos · ' || coalesce(e.name, 'Evento'))
      when c.type = 'community'      then coalesce(c.title, 'Comunidad Nospi')
      else null
    end,
    c.estado,
    c.solicitada_por
  from public.chat_participants cp
  join public.chat_conversations c on c.id = cp.conversation_id
  left join public.events e on e.id = c.event_id
  left join lateral (
    select u.id as other_id, u.name as other_name, u.profile_photo_url as other_photo
    from public.chat_participants cp2
    join public.users u on u.id = cp2.user_id
    where cp2.conversation_id = c.id and cp2.user_id <> auth.uid() and c.type = 'direct'
    limit 1
  ) ou on true
  left join lateral (
    select
      case
        when length(btrim(cm.content)) > 0 and cm.media_kind is not null
          then public.media_label(cm.media_kind, cm.media_mime) || ' ' || cm.content
        when cm.media_kind is not null then public.media_label(cm.media_kind, cm.media_mime)
        else cm.content
      end as content,
      cm.created_at
    from public.chat_messages cm
    where cm.conversation_id = c.id
      and cm.deleted_at is null
      and (
        cm.sender_id = auth.uid()
        or (cm.hidden_at is null and cm.retenido_at is null)
      )
    order by cm.created_at desc limit 1
  ) lm on true
  where cp.user_id = auth.uid()
    and not (c.type = 'direct' and c.estado = 'ignorada' and c.solicitada_por <> auth.uid())
    and (
      c.type in ('event_group', 'community')
      or (c.type in ('channel_global','channel_event') and lm.created_at is not null)
      or (c.type = 'direct' and lm.created_at is not null)
    )

  union all

  select
    c.id, c.type, null::uuid, null::text, null::text, null::timestamptz, null::text,
    null::uuid, null::text, null::text,
    null::text, null::timestamptz, 0::bigint, c.replies_open,
    coalesce(c.title, 'Comunidad Nospi'),
    'bloqueada'::text,
    null::uuid
  from public.chat_conversations c
  where c.type = 'community'
    and not exists (
      select 1 from public.chat_participants p
      where p.conversation_id = c.id and p.user_id = auth.uid()
    )
    and not exists (
      select 1 from public.comunidad_salidas s
      where s.conversation_id = c.id and s.user_id = auth.uid()
    )

  order by 12 desc nulls last;
end;
$function$;
