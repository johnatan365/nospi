-- Checks de WhatsApp en el chat: ✓ enviado, ✓✓ entregado, ✓✓ azul leido.
--
-- Ya existia "leido" (chat_participants.last_read_at, que pone
-- mark_conversation_read al abrir el chat). Faltaba "entregado".
--
-- QUE SIGNIFICA ENTREGADO AQUI, para que nadie lo lea mal: la otra persona
-- ABRIO LA APP despues de que se mando el mensaje. WhatsApp puede decir
-- "entregado" con el telefono en el bolsillo porque el sistema operativo le
-- confirma la notificacion; ni iOS ni Android nos garantizan correr codigo
-- cuando llega un push con la app cerrada, asi que lo honesto es marcar
-- entregado cuando la app estuvo abierta y pudo bajarlo.

alter table public.chat_participants
  add column if not exists last_delivered_at timestamptz;

comment on column public.chat_participants.last_delivered_at is
  'Ultima vez que la app de esta persona estuvo abierta (y por tanto ya tenia los mensajes de esta conversacion). Alimenta el doble check gris.';

-- Marca como entregado TODO lo que le haya llegado a esta persona. Se llama al
-- abrir la app y al volver a ella, no por conversacion: si la app esta abierta,
-- ya recibio lo de todos sus chats.
create or replace function public.marcar_entregado()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  update public.chat_participants cp
     set last_delivered_at = now()
   where cp.user_id = auth.uid();
end;
$function$;

grant execute on function public.marcar_entregado() to authenticated;

-- Abrir un chat implica haberlo recibido: se actualizan las dos marcas juntas
-- para que nunca quede un mensaje "leido pero no entregado".
create or replace function public.mark_conversation_read(p_conversation_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  update public.chat_participants cp
  set last_read_at = now(),
      last_delivered_at = now()
  where cp.conversation_id = p_conversation_id and cp.user_id = auth.uid();
end;
$function$;

-- Estado de los DEMAS participantes de una conversacion: con esto la pantalla
-- del chat decide, para cada mensaje propio, si va un check, dos, o dos azules.
-- Devuelve tambien nombre y foto para la pantalla de "Info del mensaje".
--
-- Va como funcion y no como consulta directa a la tabla para no depender de las
-- reglas de la tabla users (los nombres de los demas no siempre son legibles) y
-- para no exponer mas columnas de las necesarias.
create or replace function public.estado_conversacion(p_conversation_id uuid)
 returns table(
   user_id uuid,
   name text,
   profile_photo_url text,
   last_read_at timestamptz,
   last_delivered_at timestamptz
 )
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
begin
  if not public.is_chat_participant(p_conversation_id) then
    raise exception 'no autorizado' using errcode = '42501';
  end if;

  return query
  select cp.user_id, u.name, u.profile_photo_url, cp.last_read_at, cp.last_delivered_at
    from public.chat_participants cp
    join public.users u on u.id = cp.user_id
   where cp.conversation_id = p_conversation_id
     and cp.user_id <> auth.uid();
end;
$function$;

grant execute on function public.estado_conversacion(uuid) to authenticated;