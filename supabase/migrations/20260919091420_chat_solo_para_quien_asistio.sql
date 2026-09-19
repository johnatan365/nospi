-- El chat del evento y los contactos que salen de el son un beneficio de
-- HABER IDO. Quien paga y no llega no ve el chat ni a los asistentes.
-- Solo aplica de aqui en adelante (eventos desde el 19 de septiembre de 2026).
create or replace function public.asistio_al_evento(p_event_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select exists(
    select 1 from public.event_participants ep
    where ep.event_id = p_event_id and ep.user_id = p_user_id
  );
$$;

drop policy if exists chat_messages_select_participants on public.chat_messages;

create policy chat_messages_select_participants
  on public.chat_messages
  for select
  using (
    (is_chat_participant(conversation_id) or is_admin())
    and chat_abierto_por_asistencia(conversation_id)
    and deleted_at is null
    and (
      is_admin()
      or sender_id = auth.uid()
      or (hidden_at is null and retenido_at is null)
    )
  );
