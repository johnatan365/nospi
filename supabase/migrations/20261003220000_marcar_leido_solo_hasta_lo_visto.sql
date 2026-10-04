-- Marcar leido deja de mentir.
--
-- Antes ponia last_read_at = now() sin mas. O sea: abrias un chat, el chat te
-- bajaba al ultimo mensaje, salias, y los 200 de la Comunidad que nunca viste
-- quedaban marcados como leidos. El contador de la lista de chats no
-- significaba nada.
--
-- Ahora se puede decir HASTA DONDE se leyo de verdad (la fecha del mensaje mas
-- nuevo que estuvo en pantalla). Sin el parametro se comporta como antes, para
-- no romper a nadie que la llame con un solo argumento.
--
-- El greatest evita que se mueva hacia atras: si alguien sube a leer algo viejo
-- y sale, no se "desleen" los mensajes que ya habia visto.
--
-- last_delivered_at sigue siendo now(): entregado es que llego al dispositivo,
-- y eso pasa aunque no se haya mirado.
--
-- Se borra la version de un solo parametro: dejar las dos haria ambigua
-- cualquier llamada con un argumento.
drop function if exists public.mark_conversation_read(uuid);

create or replace function public.mark_conversation_read(
  p_conversation_id uuid,
  p_hasta timestamptz default null
)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
begin
  update public.chat_participants cp
  set last_read_at = greatest(
        coalesce(cp.last_read_at, '-infinity'::timestamptz),
        coalesce(p_hasta, now())
      ),
      last_delivered_at = greatest(
        coalesce(cp.last_delivered_at, '-infinity'::timestamptz),
        now()
      )
  where cp.conversation_id = p_conversation_id
    and cp.user_id = auth.uid();
end;
$function$;
