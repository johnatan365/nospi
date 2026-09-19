-- Ventana en la que una persona puede editar o borrar lo que escribio.
-- 15 minutos, como en WhatsApp. Pasado ese rato queda fijo.
create or replace function public.editar_mi_mensaje(p_id uuid, p_contenido text)
returns table(id uuid, content text, edited_at timestamptz, retenido boolean)
language plpgsql security definer set search_path to 'public'
as $$
declare m record;
begin
  select * into m from public.chat_messages where chat_messages.id = p_id;
  if m is null then raise exception 'mensaje no encontrado' using errcode='P0002'; end if;
  if m.sender_id <> auth.uid() then
    raise exception 'solo puedes editar tus propios mensajes' using errcode='42501';
  end if;
  if m.deleted_at is not null then
    raise exception 'ese mensaje ya fue eliminado' using errcode='42501';
  end if;
  if now() - m.created_at > interval '15 minutes' then
    raise exception 'ya pasaron los 15 minutos para editar' using errcode='42501';
  end if;
  if btrim(coalesce(p_contenido,'')) = '' then
    raise exception 'el mensaje no puede quedar vacio' using errcode='22023';
  end if;

  -- El trigger trg_retener_mensaje_moderacion revisa el texto nuevo y, si
  -- toca, lo devuelve a revision.
  return query
  update public.chat_messages cm set content = p_contenido where cm.id = p_id
  returning cm.id, cm.content, cm.edited_at, cm.retenido_at is not null;
end;
$$;

create or replace function public.borrar_mi_mensaje(p_id uuid)
returns table(id uuid, deleted_at timestamptz)
language plpgsql security definer set search_path to 'public'
as $$
declare m record;
begin
  select * into m from public.chat_messages where chat_messages.id = p_id;
  if m is null then raise exception 'mensaje no encontrado' using errcode='P0002'; end if;
  if m.sender_id <> auth.uid() then
    raise exception 'solo puedes eliminar tus propios mensajes' using errcode='42501';
  end if;
  if now() - m.created_at > interval '15 minutes' then
    raise exception 'ya pasaron los 15 minutos para eliminar' using errcode='42501';
  end if;

  return query
  update public.chat_messages cm
     set deleted_at = now(), deleted_by = auth.uid()
   where cm.id = p_id
  returning cm.id, cm.deleted_at;
end;
$$;

-- El admin puede borrar cualquier mensaje, propio o ajeno, sin limite de tiempo.
create or replace function public.admin_delete_message(p_id uuid)
returns table(id uuid, deleted_at timestamptz)
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not exists (select 1 from public.admins where user_id = auth.uid()) then
    raise exception 'not authorized' using errcode='42501';
  end if;
  return query
  update public.chat_messages cm
     set deleted_at = now(), deleted_by = auth.uid()
   where cm.id = p_id
  returning cm.id, cm.deleted_at;
end;
$$;

-- Aprobar publica el mensaje CON SU FECHA ORIGINAL (no se reordena).
-- Rechazar lo deja retenido: su autor lo sigue viendo y nadie mas.
create or replace function public.admin_aprobar_mensaje(p_id uuid, p_aprobar boolean)
returns table(id uuid, retenido boolean, aprobado_at timestamptz)
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not exists (select 1 from public.admins where user_id = auth.uid()) then
    raise exception 'not authorized' using errcode='42501';
  end if;
  return query
  update public.chat_messages cm
     set retenido_at  = case when p_aprobar then null else cm.retenido_at end,
         aprobado_at  = case when p_aprobar then now() else null end,
         aprobado_por = case when p_aprobar then auth.uid() else null end
   where cm.id = p_id
  returning cm.id, cm.retenido_at is not null, cm.aprobado_at;
end;
$$;

-- Bandeja de pendientes del panel de admin.
create or replace function public.admin_mensajes_retenidos()
returns table(
  id uuid, conversation_id uuid, conv_titulo text, conv_tipo text,
  autor_id uuid, autor_nombre text, contenido text, motivo text,
  created_at timestamptz, retenido_at timestamptz, edited_at timestamptz,
  contenido_original text
)
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not exists (select 1 from public.admins where user_id = auth.uid()) then
    raise exception 'not authorized' using errcode='42501';
  end if;
  return query
  select cm.id, cm.conversation_id,
         coalesce(c.title, e.name, 'Chat'), c.type,
         cm.sender_id, u.name, cm.content, cm.retenido_motivo,
         cm.created_at, cm.retenido_at, cm.edited_at, cm.contenido_original
  from public.chat_messages cm
  join public.chat_conversations c on c.id = cm.conversation_id
  left join public.events e on e.id = c.event_id
  join public.users u on u.id = cm.sender_id
  where cm.retenido_at is not null
    and cm.aprobado_at is null
    and cm.deleted_at is null
  order by cm.retenido_at desc;
end;
$$;

revoke all on function public.admin_delete_message(uuid) from public, anon;
revoke all on function public.admin_aprobar_mensaje(uuid, boolean) from public, anon;
revoke all on function public.admin_mensajes_retenidos() from public, anon;
revoke all on function public.editar_mi_mensaje(uuid, text) from public, anon;
revoke all on function public.borrar_mi_mensaje(uuid) from public, anon;
grant execute on function public.admin_delete_message(uuid) to authenticated;
grant execute on function public.admin_aprobar_mensaje(uuid, boolean) to authenticated;
grant execute on function public.admin_mensajes_retenidos() to authenticated;
grant execute on function public.editar_mi_mensaje(uuid, text) to authenticated;
grant execute on function public.borrar_mi_mensaje(uuid) to authenticated;
