-- El chat del evento y los contactos que salen de el son un beneficio de
-- HABER IDO. Quien paga y no llega no ve el chat ni a los asistentes.
--
-- Antes del evento se ve normal: hasta que abre el check-in nadie ha
-- confirmado, y si no la sala estaria vacia toda la semana previa.
--
-- Solo aplica de aqui en adelante: los eventos anteriores al 19 de septiembre
-- de 2026 siguen como estaban, para no sacar a nadie de un chat que ya usa.

create or replace function public.asistio_al_evento(p_event_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select exists(
    select 1 from public.event_participants ep
    where ep.event_id = p_event_id and ep.user_id = p_user_id
  );
$$;

-- true = esta persona puede abrir esta conversacion.
create or replace function public.chat_abierto_por_asistencia(p_conversation_id uuid)
returns boolean
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_tipo text;
  v_event_id uuid;
  v_fecha timestamptz;
begin
  select type, event_id into v_tipo, v_event_id
  from public.chat_conversations where id = p_conversation_id;

  if v_tipo is null then return false; end if;

  -- La comunidad, el canal global y los chats privados que no salieron de un
  -- evento no dependen de asistencia.
  if v_event_id is null then return true; end if;

  -- Los canales de avisos del evento son informativos: no se cierran.
  if v_tipo not in ('event_group', 'direct') then return true; end if;

  select date into v_fecha from public.events where id = v_event_id;
  if v_fecha is null then return true; end if;

  -- Solo de aqui en adelante.
  if v_fecha < timestamptz '2026-09-19 00:00:00-05' then return true; end if;

  -- Antes de que arranque el evento todavia nadie confirmo: se ve normal.
  if now() < v_fecha then return true; end if;

  if public.is_admin() then return true; end if;

  return public.asistio_al_evento(v_event_id, auth.uid());
end;
$$;

-- Los mensajes quedan fuera de alcance para quien no asistio.
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

-- Y la lista de miembros tambien: sin esto veria quienes estaban inscritos
-- aunque no pudiera leer lo que escribieron.
drop policy if exists chat_participants_select_same_conversation on public.chat_participants;

create policy chat_participants_select_same_conversation
  on public.chat_participants
  for select
  using (
    is_chat_participant(conversation_id)
    and chat_abierto_por_asistencia(conversation_id)
  );