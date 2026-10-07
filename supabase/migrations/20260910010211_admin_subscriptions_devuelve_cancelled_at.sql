-- El admin necesita la fecha REAL de cancelacion, no updated_at.
-- Se agregan las dos columnas al final del retorno.
drop function if exists public.get_all_subscriptions_for_admin();

create function public.get_all_subscriptions_for_admin()
returns table(
  id uuid, user_id uuid, plan_type text, price numeric, status text,
  start_date timestamptz, end_date timestamptz, payment_method text,
  auto_renew boolean, created_at timestamptz, updated_at timestamptz,
  next_charge_date timestamptz, last_charge_status text, failed_charge_count integer,
  cancellation_reason text, wompi_customer_email text,
  user_name text, user_email text, user_phone text,
  events_attended bigint, events_cancelled bigint, renewals_count bigint,
  first_subscribed_at timestamptz, is_returning boolean, total_charged numeric,
  is_internal boolean,
  cancelled_at timestamptz, cancelled_at_reconstruido boolean
)
language plpgsql security definer set search_path to 'public'
as $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admins WHERE public.admins.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    s.id, s.user_id, s.plan_type, s.price, s.status, s.start_date, s.end_date,
    s.payment_method, s.auto_renew, s.created_at, s.updated_at, s.next_charge_date,
    s.last_charge_status, s.failed_charge_count, s.cancellation_reason, s.wompi_customer_email,
    u.name, u.email, u.phone,
    COALESCE((SELECT count(*) FROM public.appointments a WHERE a.user_id = s.user_id AND a.payment_method = 'subscription' AND a.status <> 'cancelada'), 0),
    COALESCE((SELECT count(*) FROM public.appointments a WHERE a.user_id = s.user_id AND a.payment_method = 'subscription' AND a.status = 'cancelada'), 0),
    COALESCE(h.renovaciones, 0),
    h.primera,
    COALESCE(h.reingresos, 0) > 0,
    COALESCE(h.total, 0),
    u.is_internal,
    s.cancelled_at, s.cancelled_at_reconstruido
  FROM public.subscriptions s
  INNER JOIN public.users u ON u.id = s.user_id
  LEFT JOIN LATERAL (
    SELECT count(*) FILTER (WHERE c.kind = 'renovacion' AND c.status = 'APPROVED') AS renovaciones,
           count(*) FILTER (WHERE c.kind = 'reingreso'  AND c.status = 'APPROVED') AS reingresos,
           min(c.charged_at) FILTER (WHERE c.status = 'APPROVED')                  AS primera,
           sum(c.amount)     FILTER (WHERE c.status = 'APPROVED')                  AS total
    FROM public.subscription_charges c
    WHERE c.user_id = s.user_id
  ) h ON true
  ORDER BY s.created_at DESC;
END;
$function$;