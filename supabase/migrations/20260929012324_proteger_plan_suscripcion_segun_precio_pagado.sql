-- Red de seguridad: nadie recibe menos meses de los que pagó.
--
-- Contexto: hay tres caminos que escriben en subscriptions. Dos leen bien el
-- plan (wompi-create-subscription y wompi-finalize-subscription), pero
-- wompi-webhook — el que usa Wompi cuando el pago se resuelve tarde (3DS, o
-- la persona cerró la app) — tiene el plan escrito a mano como '1_month' y
-- suma un mes fijo, porque solo conoce el monto cobrado. El 28 de septiembre
-- de 2026 eso le dio 30 días a alguien que pagó el plan de 3 meses ($59.000).
-- La misma función de renovación del webhook tiene el mismo mes fijo, así que
-- el error podía repetirse cuando los planes de 3 meses empiecen a renovar.
--
-- Este trigger corrige la fila ANTES de guardarla, mirando lo único que nunca
-- miente: cuánta plata entró. Va BEFORE, así que el trigger que registra el
-- cobro (AFTER) ya ve el plan correcto y el historial queda coherente.
--
-- Dos reglas de seguridad deliberadas:
--   1. Solo corrige HACIA ARRIBA (hacia más meses). Si mañana se cambia un
--      precio en Configuración y dos planes quedan valiendo lo mismo, este
--      trigger nunca le puede recortar el plan a nadie.
--   2. Si el precio no coincide EXACTO con ninguno de los tres precios
--      vigentes (por ejemplo, alguien que se suscribió con un precio viejo),
--      no toca nada.

create or replace function public.proteger_plan_por_precio_pagado()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_plan        text;
  v_meses       integer;
  v_meses_actual integer;
  v_base        timestamptz;
begin
  if NEW.price is null then
    return NEW;
  end if;

  -- Cuántos meses da el plan que trae la fila.
  v_meses_actual := case NEW.plan_type
                      when '1_month'  then 1
                      when '3_months' then 3
                      when '6_months' then 6
                      else 1
                    end;

  -- Qué plan corresponde de verdad al monto pagado, según los precios
  -- vigentes en Configuración. Ante empate gana el plan MÁS LARGO: nunca
  -- recortamos, y si hay ambigüedad el beneficio es para quien pagó.
  select p.clave, p.meses
    into v_plan, v_meses
  from (
    select '1_month'  as clave, 1 as meses,
           (select value::numeric from app_config where key = 'subscription_price')    as precio
    union all
    select '3_months', 3,
           (select value::numeric from app_config where key = 'subscription_price_3m')
    union all
    select '6_months', 6,
           (select value::numeric from app_config where key = 'subscription_price_6m')
  ) p
  where p.precio is not null
    and NEW.price = p.precio
  order by p.meses desc
  limit 1;

  -- Sin coincidencia exacta, o el plan ya da al menos esos meses: no se toca.
  if v_plan is null or v_meses <= v_meses_actual then
    return NEW;
  end if;

  -- Corrección. El escritor equivocado siempre calcula "inicio + 1 mes", y ese
  -- inicio es el mismo instante que deja en updated_at (tanto al crear la
  -- suscripción como al renovarla). De ahí sale la base para recalcular.
  v_base := coalesce(NEW.updated_at, NEW.start_date, now());

  NEW.plan_type := v_plan;
  NEW.end_date  := v_base + make_interval(months => v_meses);
  if NEW.next_charge_date is not null then
    NEW.next_charge_date := v_base + make_interval(months => v_meses);
  end if;

  raise warning 'proteger_plan_por_precio_pagado: suscripcion % de user % llegaba como % pagando %; se corrige a % (vence %)',
    NEW.id, NEW.user_id, v_meses_actual, NEW.price, v_plan, NEW.end_date;

  return NEW;
end;
$$;

-- El nombre empieza por "a" a propósito: los triggers BEFORE se disparan en
-- orden alfabético, y este debe correr antes que cualquier otro que llegue
-- después.
drop trigger if exists a_proteger_plan_por_precio_pagado on public.subscriptions;
create trigger a_proteger_plan_por_precio_pagado
  before insert or update on public.subscriptions
  for each row
  execute function public.proteger_plan_por_precio_pagado();