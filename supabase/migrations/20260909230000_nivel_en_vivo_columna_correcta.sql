-- Correccion: el nivel se leia de la columna equivocada y salia siempre vacio.
--
-- events tiene DOS columnas parecidas: current_level y current_question_level.
-- La app escribe current_level (dinamica.tsx, al arrancar y al cambiar de
-- nivel). current_question_level no la escribe nadie: estaba NULL en los 31
-- eventos que han jugado.
--
-- Se deja el coalesce por si algun dia se empieza a escribir la otra, pero la
-- buena es current_level.
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
  v_dia := coalesce(p_date, (now() AT TIME ZONE 'America/Bogota')::date);
  RETURN QUERY
  SELECT e.id, coalesce(e.name, e.type || ' · ' || coalesce(e.city, '')), e.city, e.type, e.date,
    e.game_phase, e.current_question_index,
    coalesce(e.current_level, e.current_question_level),
    e.current_question,
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
