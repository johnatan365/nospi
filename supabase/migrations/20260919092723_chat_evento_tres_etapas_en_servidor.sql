-- El chat de un evento pasa por tres etapas. Hasta ahora la primera vivia
-- solo en la app (una constante de 30 minutos en dos pantallas), asi que se
-- podia saltar llamando la API directo. Ahora las tres viven en la base.
--
--   cerrado          hasta 30 min antes  -> no se ve nada
--   sin_lista        los ultimos 30 min  -> se puede escribir y coordinar,
--                                           pero NO se ve quienes van
--   solo_asistentes  desde que arranca   -> solo quien confirmo asistencia
--
-- La etapa 'sin_lista' existe porque ver la lista antes de ir cambia la
-- decision: hay gente que mira quienes van y se cae del evento. Y le quita
-- al plan la sorpresa, que es medio producto.
create or replace function public.chat_evento_etapa(p_conversation_id uuid)
returns text
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_tipo text;
  v_event_id uuid;
  v_fecha timestamptz;
begin
  select type, event_id into v_tipo, v_event_id
  from public.chat_conversations where id = p_conversation_id;

  if v_tipo is null then return 'cerrado'; end if;
  if v_event_id is null then return 'sin_restriccion'; end if;
  if v_tipo not in ('event_group', 'direct') then return 'sin_restriccion'; end if;

  select date into v_fecha from public.events where id = v_event_id;
  if v_fecha is null then return 'sin_restriccion'; end if;

  if v_fecha < timestamptz '2026-09-19 00:00:00-05' then return 'sin_restriccion'; end if;
  if public.is_admin() then return 'sin_restriccion'; end if;

  -- Los chats privados que salieron de un evento no tienen ventana previa:
  -- o asististe, o no hay conversacion.
  if v_tipo = 'direct' then
    if now() < v_fecha then return 'cerrado'; end if;
    return 'solo_asistentes';
  end if;

  if now() < v_fecha - interval '30 minutes' then return 'cerrado'; end if;
  if now() < v_fecha then return 'sin_lista'; end if;
  return 'solo_asistentes';
end;
$$;

-- Puede LEER los mensajes.
create or replace function public.chat_abierto_por_asistencia(p_conversation_id uuid)
returns boolean
language plpgsql stable security definer set search_path to 'public'
as $$
declare v_etapa text;
begin
  v_etapa := public.chat_evento_etapa(p_conversation_id);
  if v_etapa = 'sin_restriccion' then return true; end if;
  if v_etapa = 'cerrado' then return false; end if;
  if v_etapa = 'sin_lista' then return true; end if;
  return public.asistio_al_evento(
    (select event_id from public.chat_conversations where id = p_conversation_id),
    auth.uid()
  );
end;
$$;

-- Puede ver QUIENES estan en el chat. Mas estricto: en los 30 minutos
-- previos se puede escribir pero no ver la lista.
create or replace function public.chat_lista_miembros_visible(p_conversation_id uuid)
returns boolean
language plpgsql stable security definer set search_path to 'public'
as $$
declare v_etapa text;
begin
  v_etapa := public.chat_evento_etapa(p_conversation_id);
  if v_etapa = 'sin_restriccion' then return true; end if;
  if v_etapa in ('cerrado', 'sin_lista') then return false; end if;
  return public.asistio_al_evento(
    (select event_id from public.chat_conversations where id = p_conversation_id),
    auth.uid()
  );
end;
$$;

drop policy if exists chat_participants_select_same_conversation on public.chat_participants;

create policy chat_participants_select_same_conversation
  on public.chat_participants
  for select
  using (
    -- La fila propia siempre se ve: la app la necesita para saber hasta donde
    -- habia leido esta persona.
    user_id = auth.uid()
    or (
      is_chat_participant(conversation_id)
      and chat_lista_miembros_visible(conversation_id)
    )
  );
