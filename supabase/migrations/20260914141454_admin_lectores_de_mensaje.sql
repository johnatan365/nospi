-- Quién vio un mensaje. La app guarda, por persona y por conversación, la
-- última vez que ABRIÓ ese chat (chat_participants.last_read_at, que la
-- pantalla actualiza al entrar y al llegar mensajes nuevos). No hay acuse de
-- recibo por mensaje: "visto" aquí significa que esa persona abrió el chat
-- DESPUÉS de que se publicó el mensaje, que para un canal o la comunidad es
-- justo lo que interesa saber.

create or replace function public.admin_get_message_readers(p_message_id uuid)
 returns table(
   user_id uuid,
   name text,
   email text,
   phone text,
   profile_photo_url text,
   last_read_at timestamp with time zone,
   visto boolean
 )
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_conversation_id uuid;
  v_created_at timestamptz;
  v_sender uuid;
begin
  if not public.is_admin() then
    raise exception 'no autorizado' using errcode = '42501';
  end if;

  select cm.conversation_id, cm.created_at, cm.sender_id
    into v_conversation_id, v_created_at, v_sender
  from public.chat_messages cm
  where cm.id = p_message_id;

  if v_conversation_id is null then
    raise exception 'mensaje no encontrado';
  end if;

  return query
  select
    cp.user_id,
    u.name,
    u.email,
    u.phone,
    u.profile_photo_url,
    cp.last_read_at,
    (cp.last_read_at >= v_created_at) as visto
  from public.chat_participants cp
  join public.users u on u.id = cp.user_id
  where cp.conversation_id = v_conversation_id
    and cp.user_id <> v_sender
  order by (cp.last_read_at >= v_created_at) desc, cp.last_read_at desc nulls last, u.name asc;
end;
$function$;

-- Resumen rápido: cuántos de los participantes vieron el mensaje.
create or replace function public.admin_message_read_summary(p_message_id uuid)
 returns table(total bigint, vistos bigint, pendientes bigint)
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
    count(*)::bigint,
    count(*) filter (where r.visto)::bigint,
    count(*) filter (where not r.visto)::bigint
  from public.admin_get_message_readers(p_message_id) r;
end;
$function$;