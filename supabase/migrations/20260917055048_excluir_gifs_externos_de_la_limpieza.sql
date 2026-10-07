-- Los GIFs de GIPHY ya no se copian a nuestro Storage: el mensaje guarda el
-- enlace de GIPHY tal cual en media_path (empieza por http). Eso hace que
-- enviarlos sea instantaneo, porque antes el telefono los bajaba y los volvia a
-- subir antes de que el mensaje apareciera.
--
-- La limpieza mensual borra el archivo del bucket y marca el mensaje como
-- caducado. Un enlace externo no es un archivo nuestro: no hay nada que borrar
-- y marcarlo caducado dejaria un "GIF no disponible" mentiroso, porque el
-- enlace sigue sirviendo. Por eso se excluyen aca.
create or replace function public.get_expired_chat_media(p_days integer DEFAULT 30, p_limit integer DEFAULT 500)
 returns table(message_id uuid, media_path text)
 language sql
 security definer
 set search_path to 'public'
as $function$
  SELECT m.id, m.media_path
  FROM public.chat_messages m
  WHERE m.media_path IS NOT NULL
    AND m.media_path NOT LIKE 'http%'
    AND m.media_kind IN ('image', 'video')
    AND m.media_expired = false
    AND m.created_at < now() - (p_days || ' days')::interval
  ORDER BY m.created_at
  LIMIT p_limit;
$function$;