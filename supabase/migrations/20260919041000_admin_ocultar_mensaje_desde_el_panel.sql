-- Ocultar/mostrar un mensaje desde el panel de admin, con un solo boton.
create or replace function public.admin_set_message_hidden(
  p_message_id uuid,
  p_hidden boolean
)
returns table(id uuid, hidden_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not exists (select 1 from public.admins where user_id = auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  update public.chat_messages cm
     set hidden_at = case when p_hidden then now() else null end,
         hidden_by = case when p_hidden then auth.uid() else null end
   where cm.id = p_message_id
  returning cm.id, cm.hidden_at;
end;
$function$;

revoke all on function public.admin_set_message_hidden(uuid, boolean) from public, anon;
grant execute on function public.admin_set_message_hidden(uuid, boolean) to authenticated;

-- El panel necesita saber cuales ya estan ocultos para mostrar
-- "Ocultar" o "Mostrar" en el menu del mensaje. Cambia el tipo de retorno,
-- asi que toca soltarla antes de recrearla.
drop function if exists public.admin_get_conversation_messages(uuid);

CREATE FUNCTION public.admin_get_conversation_messages(p_conversation_id uuid)
 RETURNS TABLE(id uuid, sender_id uuid, sender_name text, sender_photo text, content text, created_at timestamp with time zone, media_path text, media_kind text, media_mime text, media_size bigint, hidden_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from public.admins where user_id = auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  select
    cm.id, cm.sender_id, u.name, u.profile_photo_url, cm.content, cm.created_at,
    cm.media_path, cm.media_kind, cm.media_mime, cm.media_size, cm.hidden_at
  from public.chat_messages cm
  join public.users u on u.id = cm.sender_id
  where cm.conversation_id = p_conversation_id
  order by cm.created_at asc;
end;
$function$;

revoke all on function public.admin_get_conversation_messages(uuid) from public, anon;
grant execute on function public.admin_get_conversation_messages(uuid) to authenticated;
