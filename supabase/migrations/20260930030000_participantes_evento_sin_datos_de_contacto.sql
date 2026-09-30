-- Esta funcion devolvia el CORREO y el TELEFONO de los asistentes de cualquier
-- evento, y no comprobaba quien la llamaba. Al ser SECURITY DEFINER, cualquier
-- persona con sesion iniciada podia pedir la lista de un evento al que no va y
-- quedarse con los datos de contacto de todos.
--
-- La app nunca los mostraba: los mapeaba a un objeto y ahi quedaban. Asi que se
-- dejan de devolver, que es lo que corresponde -- para hablarle a alguien esta
-- el chat, no su telefono.
--
-- Se agrega ademas la comprobacion de quien llama, y la edad y los intereses,
-- que son los que muestra la ficha de una persona (los mismos que ya enseña el
-- chat al tocar una foto).
drop function if exists public.get_event_participants_for_interaction(uuid);

create function public.get_event_participants_for_interaction(p_event_id uuid)
returns table(
  id uuid, event_id uuid, user_id uuid, confirmed boolean,
  check_in_time timestamptz, is_presented boolean, presented_at timestamptz,
  user_name text, user_city text, user_profile_photo_url text,
  user_edad integer, user_interests jsonb
)
language plpgsql security definer set search_path to 'public'
as $function$
BEGIN
  -- Solo quien va a ese evento ve a los demas. Antes no habia ninguna
  -- comprobacion: bastaba con conocer el id del evento.
  IF NOT public.is_admin() AND NOT EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.event_id = p_event_id
      AND a.user_id = auth.uid()
      AND coalesce(a.status, '') <> 'cancelada'
  ) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    ep.id, ep.event_id, ep.user_id, ep.confirmed,
    ep.check_in_time, ep.is_presented, ep.presented_at,
    u.name, u.city, u.profile_photo_url,
    case when u.birthdate is null then null
         else date_part('year', age(u.birthdate))::integer end,
    u.interests
  FROM public.event_participants ep
  LEFT JOIN public.users u ON ep.user_id = u.id
  WHERE ep.event_id = p_event_id
    AND ep.confirmed = true
  ORDER BY ep.check_in_time ASC NULLS LAST;
END;
$function$;

revoke all on function public.get_event_participants_for_interaction(uuid) from public, anon;
grant execute on function public.get_event_participants_for_interaction(uuid) to authenticated;
