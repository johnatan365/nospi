-- Los administradores pueden editar los mensajes de Nospi sin el limite de 15
-- minutos: los suyos (casi todo lo que publica Nospi en el canal, la
-- comunidad, los canales de evento y los grupos sale de la cuenta de un admin)
-- y los de la cuenta del sistema "Equipo Nospi". Pedido del dueno el 19 de
-- noviembre de 2026: corregir un anuncio despues de publicado.
--
-- Para todos los demas no cambia nada: solo lo propio y dentro de 15 minutos.
-- Borrar (borrar_mi_mensaje) no se toca.
create or replace function public.editar_mi_mensaje(p_id uuid, p_contenido text)
 returns table(id uuid, content text, edited_at timestamp with time zone, retenido boolean)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  m record;
  v_admin boolean := public.is_admin();
  c_sistema constant uuid := '00000000-0000-0000-0000-000000000099';
begin
  select * into m from public.chat_messages where chat_messages.id = p_id;
  if m is null then raise exception 'mensaje no encontrado' using errcode='P0002'; end if;
  if m.sender_id <> auth.uid() and not (v_admin and m.sender_id = c_sistema) then
    raise exception 'solo puedes editar tus propios mensajes' using errcode='42501';
  end if;
  if m.deleted_at is not null then
    raise exception 'ese mensaje ya fue eliminado' using errcode='42501';
  end if;
  if not v_admin and now() - m.created_at > interval '15 minutes' then
    raise exception 'ya pasaron los 15 minutos para editar' using errcode='42501';
  end if;
  if btrim(coalesce(p_contenido,'')) = '' then
    raise exception 'el mensaje no puede quedar vacio' using errcode='22023';
  end if;

  -- El trigger trg_retener_mensaje_moderacion se encarga de revisar el texto
  -- nuevo y, si toca, devolverlo a revision.
  return query
  update public.chat_messages cm
     set content = p_contenido
   where cm.id = p_id
  returning cm.id, cm.content, cm.edited_at, cm.retenido_at is not null;
end;
$function$;
