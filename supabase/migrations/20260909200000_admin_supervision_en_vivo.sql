-- Supervision en vivo desde el telefono.
--
-- Devuelve, para una fecha, el estado de la dinamica de cada mesa y el chat que
-- le corresponde. Una mesa es un evento propio: dividir un evento le cambia el
-- event_id a cada cita, asi que cada mesa lleva su propio game_phase y su
-- propia pregunta actual.
--
-- Es SOLO LECTURA. No inserta filas en chat_participants ni toca nada: quien
-- mira no aparece en el grupo, no altera el contador de miembros ni los
-- "no leidos" de nadie.
create or replace function public.admin_get_live_dynamic(p_date date default null)
returns table(
  event_id uuid, mesa text, ciudad text, tipo text, empieza timestamptz,
  fase text, pregunta_num integer, pregunta_nivel text, pregunta text,
  segundos_en_pregunta integer, personas integer, llegaron integer,
  conversation_id uuid, mensajes integer, ultimo_mensaje timestamptz
)
language plpgsql security definer set search_path = public
as $$
DECLARE v_dia date;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  -- Sin fecha, hoy en Bogota. Importante la zona horaria: una cena de las
  -- 7 p.m. se guarda como medianoche UTC del dia siguiente, y en UTC "hoy" la
  -- dejaria fuera.
  v_dia := coalesce(p_date, (now() AT TIME ZONE 'America/Bogota')::date);
  RETURN QUERY
  SELECT e.id, coalesce(e.name, e.type || ' · ' || coalesce(e.city, '')), e.city, e.type, e.date,
    e.game_phase, e.current_question_index, e.current_question_level, e.current_question,
    CASE WHEN e.current_question_started_at IS NULL THEN NULL
         ELSE extract(epoch FROM (now() - e.current_question_started_at))::int END,
    (SELECT count(*)::int FROM appointments a WHERE a.event_id = e.id AND a.status IN ('confirmada','anterior')),
    (SELECT count(*)::int FROM appointments a WHERE a.event_id = e.id AND a.checked_in_at IS NOT NULL),
    c.id,
    (SELECT count(*)::int FROM chat_messages m WHERE m.conversation_id = c.id),
    (SELECT max(m.created_at) FROM chat_messages m WHERE m.conversation_id = c.id)
  FROM events e
  LEFT JOIN chat_conversations c ON c.event_id = e.id AND c.type = 'event_group'
  WHERE (e.date AT TIME ZONE 'America/Bogota')::date = v_dia
    AND coalesce(e.event_status, '') <> 'cancelled'
  ORDER BY e.date, e.name;
END;
$$;

-- Lee una conversacion con el nombre de quien escribio.
-- Las politicas RLS de chat_messages ya dejan leer a is_admin(), pero el join a
-- users para los nombres no se resuelve comodo desde el cliente. Aqui si.
create or replace function public.admin_read_conversation(
  p_conversation_id uuid, p_limit integer default 200
)
returns table(
  id uuid, sender_id uuid, autor text, contenido text,
  media_kind text, media_expired boolean, poll_id uuid, created_at timestamptz
)
language plpgsql security definer set search_path = public
as $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT m.id, m.sender_id, coalesce(u.name, 'Alguien'),
         m.content, m.media_kind, m.media_expired, m.poll_id, m.created_at
  FROM chat_messages m
  LEFT JOIN users u ON u.id = m.sender_id
  WHERE m.conversation_id = p_conversation_id
  ORDER BY m.created_at DESC
  LIMIT greatest(1, least(p_limit, 500));
END;
$$;

revoke all on function public.admin_get_live_dynamic(date) from public, anon;
revoke all on function public.admin_read_conversation(uuid, integer) from public, anon;
grant execute on function public.admin_get_live_dynamic(date) to authenticated;
grant execute on function public.admin_read_conversation(uuid, integer) to authenticated;
