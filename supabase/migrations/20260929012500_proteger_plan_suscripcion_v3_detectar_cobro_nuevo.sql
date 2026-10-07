-- v3: la v2 detectaba "periodo recién pagado" mirando si el vencimiento
-- avanzaba (NEW.end_date > OLD.end_date). Eso dejaba fuera justo el caso
-- dañino: cuando el escritor equivocado ACORTA un vencimiento que ya estaba
-- más lejos. Ahora la señal es la misma que usa el trigger que registra los
-- cobros: un cobro APROBADO nuevo (transacción distinta, o una que estaba
-- PENDING y acaba de aprobarse, o una compra nueva que reescribe start_date).

create or replace function public.proteger_plan_por_precio_pagado()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_plan          text;
  v_meses         integer;
  v_meses_actual  integer;
  v_base          timestamptz;
  v_fin_correcto  timestamptz;
  v_cobro_nuevo   boolean;
begin
  if NEW.price is null then
    return NEW;
  end if;

  v_meses_actual := case NEW.plan_type
                      when '1_month'  then 1
                      when '3_months' then 3
                      when '6_months' then 6
                      else 1
                    end;

  -- ---------- (A) El plan, según lo que se pagó ----------
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

  if v_plan is not null and v_meses > v_meses_actual then
    raise warning 'proteger_plan_por_precio_pagado: suscripcion % de user % llegaba como % pagando %; se corrige el plan a %',
      NEW.id, NEW.user_id, NEW.plan_type, NEW.price, v_plan;
    NEW.plan_type  := v_plan;
    v_meses_actual := v_meses;
  end if;

  -- ---------- (B) El periodo, según el plan ----------
  -- Solo cuando hay un cobro APROBADO nuevo. En un cobro fallido, uno
  -- pendiente, una cancelación o una edición manual no se toca la fecha:
  -- alargarla ahí sería regalar acceso.
  if NEW.last_charge_status is distinct from 'APPROVED' then
    v_cobro_nuevo := false;
  elsif TG_OP = 'INSERT' then
    v_cobro_nuevo := true;
  else
    v_cobro_nuevo := NEW.last_charge_transaction_id is distinct from OLD.last_charge_transaction_id
                     or OLD.last_charge_status is distinct from NEW.last_charge_status
                     or NEW.start_date is distinct from OLD.start_date;
  end if;

  if not v_cobro_nuevo or NEW.end_date is null then
    return NEW;
  end if;

  v_base := coalesce(NEW.updated_at, NEW.start_date, now());
  v_fin_correcto := v_base + make_interval(months => v_meses_actual);

  -- Margen de un día: no tocamos diferencias por husos horarios o redondeos.
  if NEW.end_date >= v_fin_correcto - interval '1 day' then
    return NEW;
  end if;

  raise warning 'proteger_plan_por_precio_pagado: suscripcion % de user % (plan %) solo otorgaba hasta %; se extiende a %',
    NEW.id, NEW.user_id, NEW.plan_type, NEW.end_date, v_fin_correcto;

  NEW.end_date := v_fin_correcto;
  if NEW.next_charge_date is not null then
    NEW.next_charge_date := v_fin_correcto;
  end if;

  return NEW;
end;
$$;