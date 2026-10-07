-- v2: la v1 corregía el plan cuando el precio no cuadraba, pero no cubría el
-- segundo caso — el de una RENOVACIÓN donde el plan ya venía bien y lo corto
-- era el periodo otorgado. Ahora son dos correcciones separadas:
--   (A) el plan, según el monto pagado;
--   (B) el periodo, según el plan.
-- (B) solo se aplica cuando la escritura de verdad otorga un periodo pagado
-- (cobro APROBADO que adelanta el vencimiento), nunca en un cobro fallido,
-- pendiente o en una cancelación: ahí alargar la fecha sería regalar acceso.

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
  v_otorga_periodo boolean;
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
  -- Ante empate gana el plan MÁS LARGO, y solo se corrige hacia arriba: este
  -- trigger nunca le puede recortar el plan a nadie.
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
  -- ¿Esta escritura otorga un periodo recién pagado?
  if NEW.last_charge_status is distinct from 'APPROVED' then
    v_otorga_periodo := false;
  elsif TG_OP = 'INSERT' then
    v_otorga_periodo := true;
  else
    -- Renovación: el cobro aprobado empuja el vencimiento hacia adelante.
    v_otorga_periodo := NEW.end_date is not null
                        and OLD.end_date is not null
                        and NEW.end_date > OLD.end_date;
  end if;

  if not v_otorga_periodo or NEW.end_date is null then
    return NEW;
  end if;

  -- El escritor equivocado calcula "ahora + 1 mes", y ese "ahora" es el mismo
  -- instante que deja en updated_at. De ahí sale la base real del periodo.
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