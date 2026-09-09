-- El admin necesita ver que respondio cada persona a "si no completamos tu mesa
-- dentro del rango elegido, prefieres asistir igual o aplazar".
--
-- Se agregan dos columnas al final del retorno: la respuesta y cuando la dio.
-- La fecha hace falta para distinguir "no respondio" de "nunca se le pregunto":
-- quien se registro antes de que existiera la pregunta no puede contar como
-- indeciso.
--
-- Hay que DROP antes de recrear: Postgres no deja cambiar el tipo de retorno de
-- una funcion existente con CREATE OR REPLACE.
drop function if exists public.get_all_users_for_admin();

create function public.get_all_users_for_admin()
returns table(
  id uuid, name text, email text, phone text, city text, country text,
  interested_in text, gender text, age integer,
  age_range_min integer, age_range_max integer,
  registered_from text, created_at timestamp with time zone, birthdate text,
  profile_photo_url text, onboarding_completed boolean,
  utm_source text, utm_campaign text, utm_medium text, click_id text,
  age_range_fallback text, age_range_confirmed_at timestamp with time zone
)
language plpgsql
security definer
as $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    u.id, u.name, u.email, u.phone, u.city, u.country, u.interested_in, u.gender,
    u.age, u.age_range_min, u.age_range_max, u.registered_from, u.created_at,
    u.birthdate::text, u.profile_photo_url, u.onboarding_completed,
    u.utm_source, u.utm_campaign, u.utm_medium, u.click_id,
    u.age_range_fallback, u.age_range_confirmed_at
  FROM public.users u
  ORDER BY u.created_at DESC;
END;
$function$;
