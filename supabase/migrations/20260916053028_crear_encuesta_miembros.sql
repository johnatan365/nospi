-- Encuestas creadas por cualquier miembro, desde el chat de la app.
--
-- Hasta hoy solo el equipo de Nospi podia publicar encuestas, desde el panel.
-- La regla de permiso que se usa aca es la mas simple posible y la mas facil de
-- explicar: SI PUEDES ESCRIBIR EN ESA CONVERSACION, PUEDES LANZAR UNA ENCUESTA
-- EN ELLA. Ni mas ni menos. Asi no hay que inventar una regla aparte que dentro
-- de seis meses nadie recuerde, y un canal de solo lectura sigue siendo de solo
-- lectura tambien para las encuestas.
--
-- Limites a proposito: 2 a 5 opciones (mas no cabe en la tarjeta del chat sin
-- volverse ilegible) y textos cortos, para que la notificacion no salga con un
-- parrafo. Solo encuestas de opciones: las de estrellas las sigue publicando
-- el equipo, porque son para calificar el evento.

create or replace function public.crear_encuesta(
  p_conversation_id uuid,
  p_question text,
  p_options text[]
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_yo      uuid := auth.uid();
  v_tipo    text;
  v_abierto boolean;
  v_limpias text[];
  v_poll    uuid;
begin
  if v_yo is null then
    raise exception 'Tienes que iniciar sesión.';
  end if;

  -- Participar en la conversacion es el requisito de base.
  if not exists (
    select 1 from public.chat_participants
    where conversation_id = p_conversation_id and user_id = v_yo
  ) then
    raise exception 'No estás en esa conversación.';
  end if;

  select c.type, coalesce(c.replies_open, true)
    into v_tipo, v_abierto
  from public.chat_conversations c
  where c.id = p_conversation_id;

  if v_tipo is null then
    raise exception 'Esa conversación no existe.';
  end if;

  -- Un canal es un tablon de anuncios: ahi solo publica el equipo. Si algun dia
  -- se abren las respuestas, tambien se abren las encuestas.
  if v_tipo in ('channel_global', 'channel_event') and not v_abierto and not public.is_admin() then
    raise exception 'En este canal solo publica el equipo de Nospi.';
  end if;

  if length(btrim(coalesce(p_question, ''))) < 3 then
    raise exception 'Escribe la pregunta.';
  end if;
  if length(btrim(p_question)) > 200 then
    raise exception 'La pregunta es muy larga: máximo 200 caracteres.';
  end if;

  -- Se descartan las opciones vacias antes de contar, para que dejar un campo
  -- en blanco no cree una opcion fantasma que nadie pueda votar.
  select array_agg(btrim(o))
    into v_limpias
  from unnest(coalesce(p_options, '{}'::text[])) as o
  where length(btrim(o)) > 0;

  if coalesce(array_length(v_limpias, 1), 0) < 2 then
    raise exception 'Una encuesta necesita al menos 2 opciones.';
  end if;
  if array_length(v_limpias, 1) > 5 then
    raise exception 'Máximo 5 opciones.';
  end if;
  if exists (select 1 from unnest(v_limpias) as o where length(o) > 80) then
    raise exception 'Alguna opción es muy larga: máximo 80 caracteres.';
  end if;

  insert into public.chat_polls (conversation_id, created_by, kind, question, options, anonymous)
  values (p_conversation_id, v_yo, 'choice', btrim(p_question), v_limpias, false)
  returning id into v_poll;

  insert into public.chat_messages (conversation_id, sender_id, content, poll_id)
  values (p_conversation_id, v_yo, '📊 ' || btrim(p_question), v_poll);

  return v_poll;
end;
$$;

revoke all on function public.crear_encuesta(uuid, text, text[]) from public;
grant execute on function public.crear_encuesta(uuid, text, text[]) to authenticated;

comment on function public.crear_encuesta(uuid, text, text[]) is
  'Deja que un miembro lance una encuesta de opciones donde ya tiene permiso de escribir. La usa el boton "Crear encuesta" del chat.';