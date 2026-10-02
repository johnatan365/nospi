-- Pestana Suscripciones: separar la asistencia CON suscripcion de la de SIN
-- suscripcion, y dejar visible desde cuando esta suscrita la persona.
--
-- Problema: get_subscription_events_for_admin filtraba
-- `where a.payment_method = 'subscription'`, asi que en la ficha de cada
-- suscriptor solo salian los eventos que la suscripcion habia cubierto. Todo
-- lo que la persona habia reservado ANTES de suscribirse desaparecia del
-- panel. Caso real: Sofia Caro se suscribio el 2 de octubre de 2026 y su ficha
-- mostraba solo los dos eventos posteriores; las tres reservas anteriores (una
-- por Bancolombia y dos con saldo virtual) no aparecian en ninguna parte.
--
-- Esta funcion nueva devuelve TODO el historial de reservas de cada suscriptor
-- y marca cada fila, sin filtrar nada en el servidor:
--   con_suscripcion      -> la cubrio la suscripcion (payment_method = 'subscription')
--   antes_de_suscripcion -> se reservo antes de que la persona se suscribiera
--   suscrito_at          -> el instante de la PRIMERA suscripcion
--   payment_method / amount_paid_cop -> con que se pago cada una
--
-- Por que suscrito_at NO sale de subscriptions.start_date: start_date es el
-- inicio del ciclo ACTUAL y se sobrescribe en cada renovacion y en cada
-- reingreso. Para alguien que lleva meses suscrito daria una fecha muy
-- posterior a la real y marcaria como "antes de suscribirse" eventos que si
-- fueron con suscripcion. Se usa el primer cobro APROBADO de
-- subscription_charges, que es historial y no se pisa; solo si esa persona no
-- tiene cobros registrados se cae a start_date.
--
-- Ojo con las dos banderas: NO son opuestas. Alguien ya suscrito puede pagar
-- un evento con saldo virtual o tarjeta (Sofia lo hizo 10 minutos antes de
-- suscribirse), asi que una reserva puede ser "sin suscripcion" sin ser
-- "antes de la suscripcion". El admin las muestra como tres grupos distintos.
--
-- Por que una funcion NUEVA en vez de reemplazar la vieja: el tipo de retorno
-- cambia, asi que haria falta DROP FUNCTION, y los DROP/DELETE de este
-- proyecto se quedan colgados (timeout) cuando se ejecutan por el MCP de
-- Supabase. Se deja get_subscription_events_for_admin en su lugar, ya sin
-- usuarios en la app, para no bloquear el despliegue; se puede borrar a mano
-- desde el SQL editor cuando sea.

create or replace function public.get_subscription_user_events_for_admin()
returns table (
  appointment_id uuid,
  user_id uuid,
  event_id uuid,
  status text,
  confirmed_at timestamptz,
  created_at timestamptz,
  event_name text,
  event_date timestamptz,
  event_time text,
  payment_method text,
  amount_paid_cop integer,
  con_suscripcion boolean,
  antes_de_suscripcion boolean,
  suscrito_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not exists (select 1 from public.admins where public.admins.user_id = auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  with subs as (
    -- Hoy subscriptions tiene una sola fila por persona, pero el min() deja la
    -- consulta a prueba de que algun dia haya varias y se dupliquen los eventos.
    select s.user_id,
           min(coalesce(
             (select min(c.charged_at)
                from public.subscription_charges c
               where c.user_id = s.user_id
                 and c.status = 'APPROVED'),
             s.start_date
           )) as suscrito_at
      from public.subscriptions s
     group by s.user_id
  )
  select a.id,
         a.user_id,
         a.event_id,
         a.status,
         a.confirmed_at,
         a.created_at,
         e.name,
         e.date,
         e.time,
         a.payment_method,
         a.amount_paid_cop,
         (a.payment_method = 'subscription') as con_suscripcion,
         (sb.suscrito_at is not null and a.created_at < sb.suscrito_at) as antes_de_suscripcion,
         sb.suscrito_at
    from public.appointments a
    inner join public.events e on e.id = a.event_id
    inner join subs sb on sb.user_id = a.user_id
   order by e.date desc, a.created_at desc;
end;
$function$;

comment on function public.get_subscription_events_for_admin() is
  'OBSOLETA: solo devolvia los eventos pagados con la suscripcion. Usar get_subscription_user_events_for_admin, que trae todo el historial con banderas con_suscripcion / antes_de_suscripcion.';
