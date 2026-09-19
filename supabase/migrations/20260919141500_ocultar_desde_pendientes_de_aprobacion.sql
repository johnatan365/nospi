-- Tercera salida para la bandeja de "Pendientes de aprobacion": ocultar.
--
-- Hasta ahora solo habia dos decisiones de verdad — publicar o eliminar — y
-- una tercera de facto: no hacer nada. Quedarse quieto ya oculta el mensaje
-- (retenido_at lo esconde de todos menos de su autor), pero deja la ficha en
-- la bandeja para siempre y el contador rojo prendido. Eso empuja a decidir
-- entre publicar algo que no quieres publicar o borrarlo.
--
-- "Ocultar" convierte esa espera en una decision cerrada: el mensaje sale de
-- la bandeja y queda invisible para el grupo, mientras su autor lo sigue
-- viendo igual que siempre. Es el mismo comportamiento de "ocultar
-- comentario" de Facebook e Instagram, y el mismo que ya tiene el menu del
-- mensaje dentro de cada chat (admin_set_message_hidden). Lo unico nuevo es
-- poder hacerlo desde aqui, en un solo paso.
--
-- Por que hace falta una funcion propia y no sirve llamar a las dos que ya
-- existen: admin_set_message_hidden marca hidden_at pero deja retenido_at
-- puesto, asi que la ficha seguiria en la bandeja; y admin_aprobar_mensaje
-- con p_aprobar = false tampoco lo limpia. Ademas, hechas por separado son
-- dos viajes a la base: si el segundo falla, el mensaje queda oculto Y
-- pendiente, que es justo el estado que esto viene a eliminar.
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
         -- Se limpia para que salga de la bandeja: admin_mensajes_retenidos
         -- lista por retenido_at is not null. La visibilidad no cambia —
         -- hidden_at esconde por su cuenta, sin depender de retenido_at.
         --
         -- Tambien es lo que hace que se pueda deshacer: mientras retenido_at
         -- siguiera puesto, el boton "volver a mostrarlo a todos" del menu del
         -- mensaje limpiaria hidden_at y el mensaje seguiria escondido, sin
         -- que se entienda por que.
         retenido_at = null
         -- retenido_motivo se conserva a proposito: es el registro de por que
         -- lo agarro el filtro. No se muestra a nadie fuera del panel.
   where cm.id = p_id
     and cm.deleted_at is null
  returning cm.id, cm.hidden_at;
end;
$function$;

comment on function public.admin_ocultar_retenido(uuid) is
  'Cierra un mensaje retenido dejandolo oculto para el grupo y visible para su autor. Reversible desde el menu del mensaje.';

revoke all on function public.admin_ocultar_retenido(uuid) from public, anon;
grant execute on function public.admin_ocultar_retenido(uuid) to authenticated;
