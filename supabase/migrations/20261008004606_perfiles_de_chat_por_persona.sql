-- Poder pedir SOLO los perfiles que hacen falta, en vez del censo entero.
--
-- POR QUE
-- El Canal Nospi tiene 3.574 participantes. Abrirlo pedia el censo completo
-- --1,5 MB de JSON, con intereses, rasgos y todas las fotos de cada uno-- y eso
-- crece con cada persona que se registra.
--
-- En un canal esa lista no se muestra en NINGUNA parte: el boton de
-- "Asistentes" solo aparece cuando el chat es grupo o Comunidad (esGrupal), y
-- un canal no lo es. Lo unico que hace falta ahi es poder NOMBRAR a quien
-- escribio o reacciono, que son unos pocos.
--
--   p_user_ids null  -> todos, exactamente como antes.
--   p_user_ids lista -> solo esos, con exactamente las mismas reglas.
--
-- get_conversation_participants_v2 pasa a ser una envoltura de esta funcion,
-- para que las reglas --quien tiene derecho a ver la lista, y a quien se
-- esconde-- vivan en UN solo sitio y no se puedan separar. Su firma queda
-- intacta: la usan las apps ya publicadas.
--
-- OJO: se crea con nombre NUEVO a proposito, en vez de agregarle el parametro
-- a la de siempre. Anadir un argumento con valor por defecto no reemplaza la
-- funcion, crea una SOBRECARGA, y entonces una llamada con un solo argumento
-- queda ambigua ("could not choose the best candidate function") y revienta
-- para todo el mundo.

create or replace function public.get_chat_perfiles(
  p_conversation_id uuid,
  p_user_ids uuid[] default null
)
returns table(
  user_id uuid, name text, profile_photo_url text, edad integer,
  interests jsonb, gender text, personality_traits jsonb, city text, fotos jsonb
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_event_id uuid;
  v_etapa text;
begin
  if not public.is_chat_participant(p_conversation_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_etapa := public.chat_evento_etapa(p_conversation_id);

  -- Antes de que el chat abra no se devuelve nada, como siempre.
  if v_etapa = 'cerrado' then
    return;
  end if;

  select c.event_id into v_event_id
  from public.chat_conversations c where c.id = p_conversation_id;

  return query
  select u.id, u.name, u.profile_photo_url,
         case when u.birthdate is null then null
              else date_part('year', age(u.birthdate))::integer end,
         u.interests,
         u.gender,
         u.personality_traits,
         u.city,
         coalesce(
           (select jsonb_agg(p.url order by p.orden)
              from public.user_photos p where p.user_id = u.id),
           case when u.profile_photo_url is null then '[]'::jsonb
                else jsonb_build_array(u.profile_photo_url) end
         )
  from public.chat_participants cp
  join public.users u on u.id = cp.user_id
  where cp.conversation_id = p_conversation_id
    -- Lo UNICO que agrega esta funcion. Todo lo de abajo es igual que antes.
    and (p_user_ids is null or cp.user_id = any(p_user_ids))
    -- En la ventana previa: solo quien ya escribio. Se presenta solo.
    and (
      v_etapa <> 'sin_lista'
      or exists (
        select 1 from public.chat_messages m
        where m.conversation_id = p_conversation_id
          and m.sender_id = cp.user_id
          and m.deleted_at is null
      )
    )
    -- En un chat de evento ya pasado, solo se listan los que asistieron:
    -- quien no fue no aparece para nadie.
    and (
      v_event_id is null
      or v_etapa <> 'solo_asistentes'
      or public.asistio_al_evento(v_event_id, cp.user_id)
    );
end;
$function$;

comment on function public.get_chat_perfiles(uuid, uuid[]) is
  'Perfiles de un chat. Con p_user_ids solo devuelve a esos, con las mismas reglas de visibilidad. Para canales con miles de participantes, donde la lista completa no se muestra en ninguna parte.';

-- La de siempre, ahora delegando. Mismo nombre, misma firma, mismo resultado.
create or replace function public.get_conversation_participants_v2(p_conversation_id uuid)
returns table(
  user_id uuid, name text, profile_photo_url text, edad integer,
  interests jsonb, gender text, personality_traits jsonb, city text, fotos jsonb
)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return query select * from public.get_chat_perfiles(p_conversation_id, null);
end;
$function$;
