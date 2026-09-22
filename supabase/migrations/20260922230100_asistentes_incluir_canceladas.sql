-- El listado de asistentes excluye a los cancelados, y asi debe seguir: quien
-- cancela desaparece de la mesa y no tiene por que hacer ruido ahi. Pero en
-- Gestion de eventos hace falta poder verlos aparte, con la fecha en que
-- cancelaron.
--
-- Se agrega un parametro en vez de una funcion nueva, y por defecto se comporta
-- igual que antes, asi que ninguna pantalla que ya la llama cambia.

DROP FUNCTION IF EXISTS public.get_event_attendees_for_admin(uuid);

CREATE FUNCTION public.get_event_attendees_for_admin(
  p_event_id uuid,
  p_incluir_canceladas boolean DEFAULT false
)
RETURNS TABLE(
  id uuid, user_id uuid, event_id uuid, status text, payment_status text,
  created_at timestamp with time zone, purchase_whatsapp_sent_at timestamp with time zone,
  user_name text, user_email text, user_phone text, user_city text, user_country text,
  user_interested_in text, user_gender text, user_age integer,
  user_age_range_min integer, user_age_range_max integer,
  location_confirmed boolean, checked_in_at timestamp with time zone, arrival_status text,
  user_age_range_fallback text, user_created_at timestamp with time zone,
  cancelled_at timestamp with time zone
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
      u.age_range_fallback, u.created_at, a.cancelled_at
  FROM public.appointments a
  JOIN public.users u ON a.user_id = u.id
  WHERE a.event_id = p_event_id
    AND (
      CASE WHEN p_incluir_canceladas
           THEN a.status = 'cancelada'
           ELSE a.status <> 'cancelada'
      END
    )
  ORDER BY
    CASE WHEN p_incluir_canceladas THEN a.cancelled_at END DESC NULLS LAST,
    a.created_at DESC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_event_attendees_for_admin(uuid, boolean) TO authenticated, anon, service_role;
