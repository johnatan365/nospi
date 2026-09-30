-- Solicitudes de chat: el tope deja de ser una condena y pasa a ser un limite diario.
--
-- El problema, encontrado el 30 de septiembre de 2026 a partir de una pregunta
-- de un usuario en la comunidad: el tope contaba las solicitudes SIN RESPONDER
-- de toda la vida, no las enviadas hoy. Como una solicitud ignorada se queda en
-- 'pendiente' para siempre, quien mandaba 5 y no recibia respuesta de nadie
-- quedaba bloqueado de por vida, sin haber hecho nada mal y sin ninguna forma
-- de recuperarse: la app le decia "espera a que te contesten" y nunca le iban a
-- contestar. El castigo no era por abusar, era por tener mala suerte.
--
-- Lo que NO se hace: quitar el tope. Es lo unico que hoy impide que una sola
-- persona le escriba a los 203 miembros de la comunidad de un tiron. Es la
-- diferencia entre conocer gente y acosar.
--
-- Lo que se hace:
--   1. El conteo mira solo las ultimas 24 horas, asi el limite se libera solo.
--   2. El tope sube de 5 a 10: con la ventana de 24 horas, 5 era muy apretado
--      para alguien que si esta conociendo gente de buena fe.
--   3. El mensaje de error se reescribe: el de antes ("espera a que te
--      contesten") ya no es cierto, porque lo que libera el limite es el paso
--      de las horas y no la respuesta del otro.
--
-- No cambia nada de quien PUEDE escribir: eso lo sigue decidiendo
-- puede_escribir_en_directo(), y sigue igual (un solo mensaje mientras la
-- solicitud este pendiente, y nada mas si la ignoran).

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
