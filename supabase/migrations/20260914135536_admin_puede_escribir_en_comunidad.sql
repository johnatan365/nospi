-- El chat de comunidad (type = 'community', "Comunidad Nospi Medellín") no
-- aparecía en la pestaña de Canales del admin y, aunque apareciera, la regla
-- de escritura no dejaba publicar: el admin no es participante de esa
-- conversación, can_write_channel() solo cubre channel_global/channel_event, y
-- la excepción de admin estaba limitada a los grupos de evento.

-- 1) Que el admin pueda escribir también en la comunidad.
drop policy if exists "chat_messages_insert_participants" on public.chat_messages;
create policy "chat_messages_insert_participants"
  on public.chat_messages for insert
  with check (
    (sender_id = auth.uid())
    and (
      public.can_write_channel(conversation_id)
      or (
        public.is_chat_participant(conversation_id)
        and (not public.is_channel(conversation_id))
        and public.puede_escribir_en_directo(conversation_id)
      )
      or (
        public.is_admin()
        and (
          select c.type from public.chat_conversations c
          where c.id = chat_messages.conversation_id
        ) in ('event_group', 'community')
      )
    )
  );

-- 2) Que la comunidad salga en la lista de canales del admin, justo después
--    del canal global y antes de los canales de evento.
create or replace function public.admin_get_channels()
 returns table(conversation_id uuid, kind text, title text, event_id uuid, event_name text, event_date timestamp with time zone, replies_open boolean, participants bigint, messages bigint, last_message text, last_message_at timestamp with time zone)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not public.is_admin() then
    raise exception 'no autorizado' using errcode = '42501';
  end if;

  return query
  select
    c.id, c.type,
    coalesce(
      c.title,
      case when c.type = 'community' then 'Comunidad'
           else 'Avisos · ' || coalesce(e.name, 'Evento') end
    ),
    c.event_id, e.name, e.date,
    c.replies_open,
    (select count(*) from public.chat_participants cp where cp.conversation_id = c.id),
    (select count(*) from public.chat_messages cm where cm.conversation_id = c.id),
    lm.content, lm.created_at
  from public.chat_conversations c
  left join public.events e on e.id = c.event_id
  left join lateral (
    select cm.content, cm.created_at from public.chat_messages cm
    where cm.conversation_id = c.id order by cm.created_at desc limit 1
  ) lm on true
  where c.type in ('channel_global', 'community', 'channel_event')
  order by
    case c.type when 'channel_global' then 0 when 'community' then 1 else 2 end,
    e.date desc nulls last;
end;
$function$;