-- Moderacion de mensajes de chat: ocultar sin que el autor lo note.
--
-- Mismo comportamiento que "ocultar comentario" de Facebook/Instagram: el
-- mensaje desaparece para el resto de participantes, pero su autor lo sigue
-- viendo igual que siempre. Es reversible (basta poner hidden_at en null),
-- a diferencia de borrarlo.
--
-- El filtro va en la base, no en la app: asi el mensaje no se puede sacar
-- tampoco llamando la API directamente.

alter table public.chat_messages
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_by uuid references public.users(id);

comment on column public.chat_messages.hidden_at is
  'Si no es null, el mensaje esta oculto: solo lo ven su autor y los admins.';

create index if not exists chat_messages_hidden_idx
  on public.chat_messages (conversation_id, hidden_at)
  where hidden_at is not null;

-- El SELECT deja de devolver los ocultos, salvo a su autor y a los admins.
drop policy if exists chat_messages_select_participants on public.chat_messages;

create policy chat_messages_select_participants
  on public.chat_messages
  for select
  using (
    (is_chat_participant(conversation_id) or is_admin())
    and (
      hidden_at is null
      or sender_id = auth.uid()
      or is_admin()
    )
  );
