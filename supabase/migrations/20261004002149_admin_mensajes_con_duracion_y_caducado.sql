-- El panel necesita dos datos mas del adjunto para poder MOSTRARLO en vez de
-- obligar a descargarlo:
--
--   media_duration → para escribir "0:19" al lado del reproductor de la nota
--                    de voz, igual que en el chat de la app.
--   media_expired  → las fotos se borran solas al mes. Sin este dato el panel
--                    pedia un enlace firmado de un archivo que ya no existe y
--                    la burbuja se quedaba en "Foto (cargando...)" para
--                    siempre. Hoy hay 7 asi.
--
-- Cambia el tipo de retorno, asi que toca DROP antes del CREATE: Postgres no
-- deja cambiarle las columnas a una funcion con CREATE OR REPLACE.
drop function if exists public.admin_get_conversation_messages(uuid);

create function public.admin_get_conversation_messages(p_conversation_id uuid)
returns table(
  id uuid, sender_id uuid, sender_name text, sender_photo text,
  content text, created_at timestamp with time zone,
  media_path text, media_kind text, media_mime text, media_size bigint,
  media_duration real, media_expired boolean,
  hidden_at timestamp with time zone
)
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not exists (select 1 from public.admins where user_id = auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  select
    cm.id,
    cm.sender_id,
    u.name,
    u.profile_photo_url,
    cm.content,
    cm.created_at,
    cm.media_path,
    cm.media_kind,
    cm.media_mime,
    cm.media_size,
    cm.media_duration,
    cm.media_expired,
    cm.hidden_at
  from public.chat_messages cm
  join public.users u on u.id = cm.sender_id
  where cm.conversation_id = p_conversation_id
  order by cm.created_at asc;
end;
$function$;