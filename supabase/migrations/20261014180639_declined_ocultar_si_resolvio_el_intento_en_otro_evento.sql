-- Regla de negocio (Johnatan, 14 oct 2026): no hay que molestar a alguien cuyo
-- pago se cayo pero que reintento y SI logro entrar a un evento, aunque haya
-- sido a otro distinto del que intento primero. Para esa persona el tema ya
-- quedo resuelto y escribirle se siente como un cobro de algo que ya pago.
--
-- Pero si la persona pago hace meses y ahora tiene un rechazo sin resolver, SI
-- hay que avisarle: es un cliente recurrente que se esta quedando por fuera.
--
-- Por eso la condicion no es "alguna vez pago algo", sino "pago algo a raiz de
-- ESE intento": un APPROVED entre 2 horas antes y 24 horas despues del rechazo.

CREATE OR REPLACE FUNCTION public.get_declined_payments_global()
 RETURNS TABLE(user_id uuid, event_id uuid, transaction_id text, payment_method text, status text, amount integer, last_attempt_at timestamp with time zone, user_name text, user_email text, user_phone text, event_name text, event_date timestamp with time zone, event_time text, declined_whatsapp_sent_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_role text;
BEGIN
  v_role := coalesce(current_setting('request.jwt.claims', true)::json ->> 'role', '');

  IF v_role <> 'service_role'
     AND NOT EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH latest_attempt AS (
    SELECT DISTINCT ON (pa.user_id, pa.event_id) pa.*
    FROM public.payment_attempts pa
    ORDER BY pa.user_id, pa.event_id, pa.created_at DESC
  )
  SELECT
    la.user_id, la.event_id, la.transaction_id, la.payment_method,
    la.status, la.amount, la.created_at, u.name, u.email, u.phone,
    e.name, e.date, e.time, la.declined_whatsapp_sent_at
  FROM latest_attempt la
  JOIN public.users u ON u.id = la.user_id
  JOIN public.events e ON e.id = la.event_id
  WHERE la.status IN ('DECLINED', 'ERROR', 'VOIDED')
    AND la.created_at < now() - interval '1 hour'
    AND NOT EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.user_id = la.user_id AND a.event_id = la.event_id AND a.status = 'confirmada'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.payment_attempts ok
      WHERE ok.user_id = la.user_id
        AND ok.status = 'APPROVED'
        AND ok.created_at BETWEEN la.created_at - interval '2 hours'
                              AND la.created_at + interval '24 hours'
    )
  ORDER BY la.created_at DESC;
END;
$function$;
