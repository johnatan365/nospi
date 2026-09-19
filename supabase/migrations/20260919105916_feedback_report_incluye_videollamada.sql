-- El cierre de un evento virtual califica 'videollamada' en vez de 'lugar' y
-- 'comida'. Sin esta columna el dato se guardaba en event_feedback pero el
-- reporte del admin no lo leia nunca: se recogia a ciegas.
--
-- Las columnas nuevas van AL FINAL para no correr las que el admin ya lee por
-- posicion en el Excel.
drop function if exists public.admin_event_feedback_report();

create function public.admin_event_feedback_report()
returns table(
  event_id uuid, event_name text, event_date timestamp with time zone, location_name text,
  user_id uuid, user_name text, user_email text,
  dinamica integer, lugar integer, comida integer, grupo integer,
  volveria text,
  motivos_dinamica text[], motivos_lugar text[], motivos_comida text[], motivos_grupo text[],
  comentario_general text, comentario_dinamica text, volveria_motivo text,
  ultima_respuesta timestamp with time zone,
  event_type text, videollamada integer, motivos_videollamada text[]
)
language plpgsql
security definer
set search_path to 'public'
as $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'no autorizado' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    e.id, e.name, e.date, NULLIF(e.location_name, ''),
    u.id, u.name, u.email,
    (SELECT f2.score FROM public.event_feedback f2 WHERE f2.event_id = e.id AND f2.user_id = u.id AND f2.item_key = 'dinamica')::integer,
    (SELECT f2.score FROM public.event_feedback f2 WHERE f2.event_id = e.id AND f2.user_id = u.id AND f2.item_key = 'lugar')::integer,
    (SELECT f2.score FROM public.event_feedback f2 WHERE f2.event_id = e.id AND f2.user_id = u.id AND f2.item_key = 'comida')::integer,
    (SELECT f2.score FROM public.event_feedback f2 WHERE f2.event_id = e.id AND f2.user_id = u.id AND f2.item_key = 'grupo')::integer,
    (SELECT f2.reasons[1] FROM public.event_feedback f2 WHERE f2.event_id = e.id AND f2.user_id = u.id AND f2.item_key = 'volveria'),
    (SELECT f2.reasons FROM public.event_feedback f2 WHERE f2.event_id = e.id AND f2.user_id = u.id AND f2.item_key = 'dinamica'),
    (SELECT f2.reasons FROM public.event_feedback f2 WHERE f2.event_id = e.id AND f2.user_id = u.id AND f2.item_key = 'lugar'),
    (SELECT f2.reasons FROM public.event_feedback f2 WHERE f2.event_id = e.id AND f2.user_id = u.id AND f2.item_key = 'comida'),
    (SELECT f2.reasons FROM public.event_feedback f2 WHERE f2.event_id = e.id AND f2.user_id = u.id AND f2.item_key = 'grupo'),
    (SELECT f2.comment FROM public.event_feedback f2 WHERE f2.event_id = e.id AND f2.user_id = u.id AND f2.item_key = '_comentario'),
    (SELECT f2.comment FROM public.event_feedback f2 WHERE f2.event_id = e.id AND f2.user_id = u.id AND f2.item_key = 'dinamica'),
    (SELECT f2.comment FROM public.event_feedback f2 WHERE f2.event_id = e.id AND f2.user_id = u.id AND f2.item_key = 'volveria'),
    MAX(f.created_at),
    e.type,
    (SELECT f2.score FROM public.event_feedback f2 WHERE f2.event_id = e.id AND f2.user_id = u.id AND f2.item_key = 'videollamada')::integer,
    (SELECT f2.reasons FROM public.event_feedback f2 WHERE f2.event_id = e.id AND f2.user_id = u.id AND f2.item_key = 'videollamada')
  FROM public.event_feedback f
  JOIN public.events e ON e.id = f.event_id
  JOIN public.users  u ON u.id = f.user_id
  GROUP BY e.id, e.name, e.date, e.location_name, e.type, u.id, u.name, u.email
  ORDER BY e.date DESC, u.name;
END;
$function$;
