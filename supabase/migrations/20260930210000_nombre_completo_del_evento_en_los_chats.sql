-- El chat muestra el nombre COMPLETO del evento, y el canal de avisos deja de
-- quedarse con el nombre viejo.
--
-- Dos cosas distintas que se veian como una sola:
--
-- 1) El subtitulo no llegaba al chat. En gestion de eventos el nombre se llena
--    en dos campos (name + subtitulo), pero el chat solo leia `name`. Con los
--    presenciales no se notaba porque el nombre ya se explica solo
--    ("Cena (30 de septiembre)"); con las videollamadas las dos se llaman
--    igual -- "Video llamada" -- y lo unico que las distingue ("Con Gente de
--    todo el pais" / "Con Gente de Medellin") vivia solo en el subtitulo. En
--    la lista de chats se veian dos conversaciones identicas.
--
-- 2) El titulo del canal de avisos era una foto congelada. Se escribia al
--    crear el canal y get_my_conversations lo preferia sobre el nombre vivo
--    (coalesce(c.title, ...)), asi que renombrar el evento no lo cambiaba
--    nunca. Comprobado en produccion: los dos canales del cafe del 26 de
--    septiembre seguian diciendo "- Mesa 1" y "- Mesa 2" mucho despues de que
--    el evento volviera a llamarse "Cafe (26 de septiembre)".
--
-- Se arregla en el servidor a proposito, y no en la app: asi el nombre correcto
-- le llega HOY a quien ya tiene la app instalada, sin esperar un build.
--
-- Solo cambia lo que se VE en el chat. Mis Citas y la Dinamica se quedan como
-- estan (decision del dueno, 30 de septiembre de 2026).

create or replace function public.get_my_conversations()
returns table(conversation_id uuid, conv_type text, event_id uuid, event_name text, event_type text, event_date timestamp with time zone, event_status text, other_user_id uuid, other_user_name text, other_user_photo text, last_message text, last_message_at timestamp with time zone, unread_count bigint, replies_open boolean, channel_title text, estado text, solicitada_por uuid)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return query
  with todo as (
    select
      c.id                                                     as k_conversation_id,
      c.type                                                   as k_conv_type,
      c.event_id                                               as k_event_id,
      ne.nombre                                                as k_event_name,
      e.type                                                   as k_event_type,
      e.date                                                   as k_event_date,
      e.event_status                                           as k_event_status,
      case when ab.abierto then ou.other_id else null end      as k_other_user_id,
      case when ab.abierto then ou.other_name else null end    as k_other_user_name,
      case when ab.abierto then ou.other_photo else null end   as k_other_user_photo,
      case when ab.abierto then lm.content else null end       as k_last_message,
      case when ab.abierto then lm.created_at else null end    as k_last_message_at,
      case when ab.abierto then
        (select count(*) from public.chat_messages cm2
           where cm2.conversation_id = c.id
             and cm2.created_at > cp.last_read_at
             and (cm2.sender_id <> auth.uid() or cm2.is_system)
             and cm2.deleted_at is null
             and (cm2.hidden_at is null and cm2.retenido_at is null))
        else 0::bigint end                                     as k_unread_count,
      c.replies_open                                           as k_replies_open,
      case
        when c.type = 'channel_global' then coalesce(c.title, 'Canal Nospi')
        -- SIN coalesce(c.title, ...): el titulo guardado es el del dia en que
        -- se creo el canal y nunca se actualiza. El nombre vivo del evento es
        -- el que manda, igual que en el chat de grupo.
        when c.type = 'channel_event'  then 'Avisos · ' || coalesce(ne.nombre, 'Evento')
        when c.type = 'community'      then coalesce(c.title, 'Comunidad Nospi')
        else null
      end                                                      as k_channel_title,
      case when ab.abierto then c.estado else 'bloqueada_sin_asistencia' end as k_estado,
      c.solicitada_por                                         as k_solicitada_por
    from public.chat_participants cp
    join public.chat_conversations c on c.id = cp.conversation_id
    left join public.events e on e.id = c.event_id
    -- El nombre completo, en un solo sitio: lo usan el chat de grupo y el canal
    -- de avisos, y tienen que decir exactamente lo mismo.
    left join lateral (
      select case
        when e.name is null then null
        when coalesce(btrim(e.subtitulo), '') = '' then e.name
        else e.name || ' · ' || btrim(e.subtitulo)
      end as nombre
    ) ne on true
    left join lateral (select public.chat_abierto_por_asistencia(c.id) as abierto) ab on true
    left join lateral (
      select u.id as other_id, u.name as other_name, u.profile_photo_url as other_photo
      from public.chat_participants cp2
      join public.users u on u.id = cp2.user_id
      where cp2.conversation_id = c.id and cp2.user_id <> auth.uid() and c.type = 'direct'
      limit 1
    ) ou on true
    left join lateral (
      select
        case
          when length(btrim(cm.content)) > 0 and cm.media_kind is not null
            then public.media_label(cm.media_kind, cm.media_mime) || ' ' || cm.content
          when cm.media_kind is not null then public.media_label(cm.media_kind, cm.media_mime)
          else cm.content
        end as content,
        cm.created_at
      from public.chat_messages cm
      where cm.conversation_id = c.id
        and cm.deleted_at is null
        and (cm.sender_id = auth.uid() or (cm.hidden_at is null and cm.retenido_at is null))
      order by cm.created_at desc limit 1
    ) lm on true
    where cp.user_id = auth.uid()
      and not (c.type = 'direct' and c.estado = 'ignorada' and c.solicitada_por <> auth.uid())
      and (
        c.type in ('event_group', 'community')
        or (c.type in ('channel_global','channel_event') and lm.created_at is not null)
        or (c.type = 'direct' and (lm.created_at is not null or not ab.abierto))
      )

    union all

    -- La comunidad que todavia no le corresponde: se muestra bloqueada para que
    -- sepa que existe.
    select
      c.id, c.type, null::uuid, null::text, null::text, null::timestamptz, null::text,
      null::uuid, null::text, null::text,
      null::text, null::timestamptz, 0::bigint, c.replies_open,
      coalesce(c.title, 'Comunidad Nospi'),
      'bloqueada'::text,
      null::uuid
    from public.chat_conversations c
    where c.type = 'community'
      and not exists (
        select 1 from public.chat_participants p
        where p.conversation_id = c.id and p.user_id = auth.uid()
      )
      and not exists (
        select 1 from public.comunidad_salidas s
        where s.conversation_id = c.id and s.user_id = auth.uid()
      )
  )
  select
    k_conversation_id, k_conv_type, k_event_id, k_event_name, k_event_type,
    k_event_date, k_event_status, k_other_user_id, k_other_user_name,
    k_other_user_photo, k_last_message, k_last_message_at, k_unread_count,
    k_replies_open, k_channel_title, k_estado, k_solicitada_por
  from todo
  order by coalesce(
    k_last_message_at,
    -- Sin mensajes: vale la fecha del evento, pero solo cuando el chat ya esta
    -- abierto. Si no, un evento de dentro de una semana se treparia arriba.
    case when k_event_date <= now() + interval '30 minutes' then k_event_date end
  ) desc nulls last;
end;
$function$;
