-- Fecha real de cancelacion.
--
-- El problema: el admin mostraba updated_at como "Cancelada el", pero eso es la
-- ultima vez que se toco la fila POR CUALQUIER MOTIVO. Dos cosas la pisan:
--
--   1. El relleno de datos historicos del 7 de septiembre, que dejo seis filas
--      con la marca identica 2026-09-07 10:10:12.954048 al microsegundo.
--   2. El cron wompi-charge-subscriptions-daily, que corre cada 6 horas (00,
--      06, 12 y 18 UTC) y tambien toca las filas.
--
-- Resultado: de 12 personas con motivo de cancelacion, 8 mostraban una fecha
-- falsa. Se agrega la columna que faltaba.
--
-- Se sigue el mismo patron que ya uso subscription_charges para su relleno:
-- una marca que distingue el dato registrado del reconstruido.
alter table public.subscriptions
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_at_reconstruido boolean not null default false;

comment on column public.subscriptions.cancelled_at is
  'Momento en que la persona desactivo la renovacion automatica. NULL = se cancelo antes de que existiera esta columna y la fecha real se perdio; nunca debe rellenarse con updated_at.';
comment on column public.subscriptions.cancelled_at_reconstruido is
  'true = la fecha no se registro en su momento, se dedujo de updated_at.';

-- Relleno conservador. Solo se deduce la fecha cuando updated_at NO puede venir
-- de una de las dos causas conocidas de contaminacion:
--
--   - distinta de la marca exacta del relleno del 7 de septiembre, y
--   - fuera del primer minuto de una franja del cron de cobros.
--
-- Las que no pasan el filtro se quedan en NULL a proposito: es preferible que
-- el admin diga "sin registro" a que repita una fecha inventada, que es justo
-- el error que se esta corrigiendo.
update public.subscriptions s
set cancelled_at = s.updated_at,
    cancelled_at_reconstruido = true
where s.cancellation_reason is not null
  and s.cancelled_at is null
  and s.updated_at <> timestamptz '2026-09-07 10:10:12.954048+00'
  and not (
    extract(hour from (s.updated_at at time zone 'UTC')) in (0, 6, 12, 18)
    and extract(minute from (s.updated_at at time zone 'UTC')) = 0
  );

-- El admin necesita esas dos columnas. Cambia el tipo de retorno, asi que hay
-- que DROP y recrear: CREATE OR REPLACE no lo permite.
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
