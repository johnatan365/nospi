create or replace function public.tope_solicitudes_pendientes()
returns integer
language sql
immutable
as $function$ select 10 $function$;

comment on function public.tope_solicitudes_pendientes() is
  'Cuantas solicitudes de chat sin responder puede tener alguien al mismo tiempo, contando solo las enviadas en las ultimas 24 horas.';

create or replace function public.get_or_create_direct_chat(p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_conv_id     uuid;
  v_compartieron boolean;
  v_pendientes  integer;
begin
  if p_other_user_id = auth.uid() then
    raise exception 'cannot start a chat with yourself';
  end if;

  -- Si ya existe la conversacion se devuelve tal cual, sin re-validar. Los
  -- chats creados antes de estas reglas siguen accesibles.
  select cp1.conversation_id into v_conv_id
  from public.chat_participants cp1
  join public.chat_participants cp2 on cp2.conversation_id = cp1.conversation_id
  join public.chat_conversations c on c.id = cp1.conversation_id
  where cp1.user_id = auth.uid() and cp2.user_id = p_other_user_id and c.type = 'direct';

  if v_conv_id is not null then
    return v_conv_id;
  end if;

  -- ¿Se sentaron juntos alguna vez? Los dos confirmaron llegada al mismo evento.
  select exists (
    select 1
    from public.appointments a1
    join public.appointments a2 on a1.event_id = a2.event_id
    where a1.user_id = auth.uid() and a2.user_id = p_other_user_id
      and a1.status <> 'cancelada' and a2.status <> 'cancelada'
      and a1.location_confirmed = true and a2.location_confirmed = true
  ) into v_compartieron;

  -- Si NO compartieron mesa, esto es una solicitud. Antes directamente se
  -- bloqueaba; ahora se permite pedir permiso, que es lo que hace posible la
  -- comunidad: alli se van a conocer personas de cenas distintas.
  if not v_compartieron then
    -- Solo las de las ultimas 24 horas. Antes se contaban todas las que
    -- siguieran en 'pendiente', y como una solicitud ignorada nunca cambia de
    -- estado, el tope se llenaba una vez y no se vaciaba jamas.
    select count(*) into v_pendientes
    from public.chat_conversations c
    where c.type = 'direct'
      and c.estado = 'pendiente'
      and c.solicitada_por = auth.uid()
      and c.created_at > now() - interval '24 hours';

    if v_pendientes >= public.tope_solicitudes_pendientes() then
      raise exception 'Puedes tener hasta % solicitudes sin responder al mismo tiempo. En unas horas se liberan solas, y tambien se libera cada vez que alguien te acepta.',
        public.tope_solicitudes_pendientes() using errcode = '42501';
    end if;
  end if;

  insert into public.chat_conversations (type, estado, solicitada_por)
  values (
    'direct',
    case when v_compartieron then 'aceptada' else 'pendiente' end,
    case when v_compartieron then null else auth.uid() end
  )
  returning id into v_conv_id;

  insert into public.chat_participants (conversation_id, user_id)
  values (v_conv_id, auth.uid()), (v_conv_id, p_other_user_id);

  return v_conv_id;
end;
$function$;