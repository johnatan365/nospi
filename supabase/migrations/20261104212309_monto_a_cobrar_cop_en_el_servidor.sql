-- Cuanto se le cobra a una persona por un cupo, calculado en el servidor.
-- Hasta hoy las funciones de pago con Wompi (tarjeta, PSE, Nequi, Bancolombia)
-- cobraban el monto que mandaba el celular, y el webhook confirmaba la cita sin
-- compararlo con el precio: se podia comprar un cupo por el minimo de Wompi.
-- Ahora esas funciones y el webhook preguntan aqui.
--
-- Misma cuenta que reservar_evento y la app (constants/Pricing.ts):
--   precio del evento (o app_config.event_price, o 15000);
--   en ingles, USD = pesos en miles, cobrado a app_config.usd_cop_rate;
--   menos el descuento de un codigo promocional ya redimido.
-- El codigo se redime en la app ANTES de pagar (redeem_promo_code), asi que el
-- descuento ya esta en promo_code_redemptions cuando llega el cobro.

create or replace function public.monto_a_cobrar_cop(
  p_event_id uuid,
  p_user_id  uuid,
  p_idioma   text default 'es'
) returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c_tasa_respaldo constant integer := 3239;
  v_precio    integer := public.precio_cupo_cop(p_event_id);
  v_usd       integer;
  v_tasa      integer;
  v_descuento integer;
begin
  if p_idioma = 'en' then
    v_usd := round(v_precio / 1000.0);
    select nullif(substring(c.value from '^\s*(\d+)')::integer, 0) into v_tasa
      from public.app_config c where c.key = 'usd_cop_rate';
    if v_usd > 0 then
      v_precio := v_usd * coalesce(v_tasa, c_tasa_respaldo);
    end if;
  end if;

  select coalesce(max(r.discount_percent_applied), 0) into v_descuento
    from public.promo_code_redemptions r
   where r.user_id = p_user_id
     and (r.event_id = p_event_id or r.event_id is null);

  return greatest(0, round(v_precio * (1 - least(v_descuento, 100) / 100.0)))::integer;
end;
$$;
revoke all on function public.monto_a_cobrar_cop(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.monto_a_cobrar_cop(uuid, uuid, text) to service_role;