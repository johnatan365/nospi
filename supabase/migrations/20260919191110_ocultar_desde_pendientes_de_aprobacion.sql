create or replace function public.admin_ocultar_retenido(p_id uuid)
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
     set hidden_at   = now(),
         hidden_by   = auth.uid(),
         retenido_at = null
   where cm.id = p_id
     and cm.deleted_at is null
  returning cm.id, cm.hidden_at;
end;
$function$;

comment on function public.admin_ocultar_retenido(uuid) is
  'Cierra un mensaje retenido dejandolo oculto para el grupo y visible para su autor. Reversible desde el menu del mensaje.';

revoke all on function public.admin_ocultar_retenido(uuid) from public, anon;
grant execute on function public.admin_ocultar_retenido(uuid) to authenticated;