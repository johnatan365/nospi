-- Dos bugs en get_declined_payments_global():
--
-- 1) DISTINCT ON (pa.user_id) tomaba SOLO el ultimo intento de pago de cada
--    persona en TODA su historia. Si alguien tuvo un pago rechazado para el
--    evento A y despues pago bien el evento B, su "ultimo intento" es el
--    APPROVED de B, asi que el rechazo de A desaparecia de la lista y nadie
--    se enteraba. Debe ser por (user_id, event_id): un rechazo por evento.
--
-- 2) La funcion exigia que auth.uid() estuviera en public.admins. La Edge
--    Function send-declined-payment-whatsapp (cron cada hora) la llama con la
--    service_role key, donde auth.uid() es NULL, asi que SIEMPRE reventaba con
--    'not authorized' y el aviso automatico nunca se podia enviar.
--
-- NOTA: esta version la reemplaza 20261014180639, que ademas oculta a quien
-- resolvio el intento pagando otro evento dentro de 24 horas.

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
  ORDER BY la.created_at DESC;
END;
$function$;
