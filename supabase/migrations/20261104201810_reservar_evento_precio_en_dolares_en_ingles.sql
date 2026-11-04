-- Pagar con saldo con la app en ingles: el cupo vale en dolares el mismo
-- numero que en pesos, en miles ($15.000 -> USD 15), y se cobra su equivalente
-- en pesos (USD x app_config.usd_cop_rate), igual que la app con Wompi.
-- reservar_evento recibe el idioma de la app; si no llega (versiones viejas),
-- cobra el precio en pesos como antes. Se cambia la firma, por eso el drop.

drop function if exists public.reservar_evento(uuid, text, text[], text[], text, boolean);

create or replace function public.reservar_evento(
  p_event_id   uuid,
  p_metodo     text,             -- 'virtual_balance' | 'subscription' | 'free' | 'promo_code'
  p_idiomas    text[]  default null,
  p_zonas      text[]  default null,
  p_zona_otra  text    default null,
  p_waiver     boolean default false,
  p_idioma     text    default 'es'   -- idioma de la app: 'en' cobra el precio en dolares
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_evento    record;
  v_usuario   record;
  v_cita      record;
  v_precio    integer;
  v_descuento integer := 0;
  v_cobro     integer := 0;
  v_tx        text;
  v_cita_id   uuid;
  v_tasa      integer;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'sin_sesion');
  end if;
  if p_metodo not in ('virtual_balance', 'subscription', 'free', 'promo_code') then
    return jsonb_build_object('success', false, 'error', 'metodo_invalido');
  end if;

  select * into v_evento from public.events where id = p_event_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'evento_no_existe');
  end if;

  select * into v_usuario from public.users where id = v_uid for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'sin_perfil');
  end if;
  if v_usuario.reservas_suspendidas_hasta is not null and v_usuario.reservas_suspendidas_hasta > now() then
    return jsonb_build_object('success', false, 'error', 'suspendido');
  end if;

  select * into v_cita from public.appointments
   where user_id = v_uid and event_id = p_event_id for update;
  if found and v_cita.status = 'confirmada' and v_cita.payment_status = 'completed' then
    -- Ya tenia cupo: no se cobra dos veces. La app lo trata como exito.
    return jsonb_build_object('success', true, 'ya_tenia_cupo', true, 'appointment_id', v_cita.id);
  end if;

  v_precio := public.precio_cupo_cop(p_event_id);
  -- Misma cuenta que la app (constants/Pricing.ts, usdDelEvento y
  -- montoACobrarCOP): en ingles el cupo vale en dolares el mismo numero que en
  -- pesos, en miles ($15.000 -> USD 15), y se cobra su equivalente en pesos a
  -- la tasa de app_config.usd_cop_rate.
  if p_idioma = 'en' then
    select nullif(substring(c.value from '^\s*(\d+)')::integer, 0) into v_tasa
      from public.app_config c where c.key = 'usd_cop_rate';
    if round(v_precio / 1000.0) * coalesce(v_tasa, 3239) > 0 then
      v_precio := (round(v_precio / 1000.0) * coalesce(v_tasa, 3239))::integer;
    end if;
  end if;

  -- Descuento de un codigo ya redimido para este evento (redeem_promo_code).
  select coalesce(max(r.discount_percent_applied), 0) into v_descuento
    from public.promo_code_redemptions r
   where r.user_id = v_uid and r.event_id = p_event_id;

  if p_metodo = 'subscription' then
    if not public.has_active_subscription(v_uid) then
      return jsonb_build_object('success', false, 'error', 'sin_suscripcion');
    end if;
    v_tx := 'suscripcion_activa';
  elsif p_metodo = 'free' then
    if coalesce(v_evento.price, -1) <> 0 then
      return jsonb_build_object('success', false, 'error', 'evento_con_costo');
    end if;
    v_tx := 'evento_gratis';
  elsif p_metodo = 'promo_code' then
    if v_descuento < 100 then
      return jsonb_build_object('success', false, 'error', 'codigo_no_cubre');
    end if;
    select 'PROMO-' || upper(pc.code) into v_tx
      from public.promo_code_redemptions r join public.promo_codes pc on pc.id = r.promo_code_id
     where r.user_id = v_uid and r.event_id = p_event_id
     order by r.discount_percent_applied desc limit 1;
    v_cobro := 0;
  else -- virtual_balance
    v_cobro := greatest(0, round(v_precio * (1 - v_descuento / 100.0))::integer);
    if coalesce(v_usuario.virtual_balance, 0) < v_cobro then
      return jsonb_build_object('success', false, 'error', 'saldo_insuficiente',
                                'saldo', coalesce(v_usuario.virtual_balance, 0), 'precio', v_cobro);
    end if;
    v_tx := '';
  end if;

  -- La cita primero: si un trigger la rechaza (p. ej. inscripcion cerrada para
  -- un genero), la excepcion deshace todo y el saldo queda intacto.
  insert into public.appointments as a (
    user_id, event_id, status, payment_status, transaction_id, payment_method,
    amount_paid_cop, confirmed_at, waiver_accepted_at, idiomas_mesa, zonas_preferidas, zona_otra)
  values (
    v_uid, p_event_id, 'confirmada', 'completed', v_tx, p_metodo,
    v_cobro, now(),
    case when p_waiver then now() end,
    nullif(p_idiomas, '{}'),
    nullif(p_zonas, '{}'),
    case when p_zonas is not null and cardinality(p_zonas) > 0
         then left(nullif(btrim(p_zona_otra), ''), 60) end)
  on conflict (user_id, event_id) do update set
    status = 'confirmada', payment_status = 'completed',
    transaction_id = excluded.transaction_id, payment_method = excluded.payment_method,
    amount_paid_cop = excluded.amount_paid_cop, confirmed_at = now(),
    waiver_accepted_at = coalesce(excluded.waiver_accepted_at, a.waiver_accepted_at),
    idiomas_mesa = coalesce(excluded.idiomas_mesa, a.idiomas_mesa),
    zonas_preferidas = coalesce(excluded.zonas_preferidas, a.zonas_preferidas),
    zona_otra = coalesce(excluded.zona_otra, a.zona_otra),
    updated_at = now()
  returning id into v_cita_id;

  if p_metodo = 'virtual_balance' and v_cobro > 0 then
    update public.users set virtual_balance = virtual_balance - v_cobro, updated_at = now()
     where id = v_uid;
    insert into public.saldo_movimientos (user_id, monto, saldo_despues, motivo, appointment_id, event_id)
    values (v_uid, -v_cobro, v_usuario.virtual_balance - v_cobro, 'pago_evento', v_cita_id, p_event_id);
  end if;

  return jsonb_build_object('success', true, 'appointment_id', v_cita_id, 'cobrado', v_cobro);
exception
  when sqlstate 'P0001' then
    return jsonb_build_object('success', false, 'error', 'inscripcion_cerrada', 'detalle', sqlerrm);
end;
$$;
revoke all on function public.reservar_evento(uuid, text, text[], text[], text, boolean, text) from public, anon;
grant execute on function public.reservar_evento(uuid, text, text[], text[], text, boolean, text) to authenticated;