-- Agrega al listado de asistentes del admin la respuesta de afinidad de edad:
-- si el grupo no cae en el rango que la persona pidio, dijo que va igual
-- ('attend') o que prefiere aplazar ('postpone'). Sin esto el admin muestra el
-- rango preferido pero no si es una exigencia o una preferencia, que es
-- justo lo que decide si vale la pena sentar a alguien en una mesa que no
-- le encaja del todo.
--
-- Cambia el tipo de retorno, asi que toca DROP + CREATE: CREATE OR REPLACE no
-- admite columnas nuevas en un RETURNS TABLE.

DROP FUNCTION IF EXISTS public.get_event_attendees_for_admin(uuid);

CREATE FUNCTION public.get_event_attendees_for_admin(p_event_id uuid)
RETURNS TABLE(
  id uuid, user_id uuid, event_id uuid, status text, payment_status text,
  created_at timestamp with time zone, purchase_whatsapp_sent_at timestamp with time zone,
  user_name text, user_email text, user_phone text, user_city text, user_country text,
  user_interested_in text, user_gender text, user_age integer,
  user_age_range_min integer, user_age_range_max integer,
  location_confirmed boolean, checked_in_at timestamp with time zone, arrival_status text,
  user_age_range_fallback text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admins WHERE public.admins.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT
      a.id, a.user_id, a.event_id, a.status, a.payment_status, a.created_at, a.purchase_whatsapp_sent_at,
      u.name, u.email, u.phone, u.city, u.country, u.interested_in, u.gender,
      EXTRACT(YEAR FROM AGE(u.birthdate))::integer, u.age_range_min, u.age_range_max,
      COALESCE(a.location_confirmed, false), a.checked_in_at, a.arrival_status,
      u.age_range_fallback
  FROM public.appointments a
  JOIN public.users u ON a.user_id = u.id
  WHERE a.event_id = p_event_id AND a.status <> 'cancelada'
  ORDER BY a.created_at DESC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_event_attendees_for_admin(uuid) TO authenticated, anon, service_role;