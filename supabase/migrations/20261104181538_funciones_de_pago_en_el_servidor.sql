-- Parte B, paso 2: el servidor hace las cuentas de saldo, reservas sin
-- pasarela, cancelaciones y renovacion de la suscripcion. Hoy las hace el
-- celular escribiendo directo en users, appointments y subscriptions.
-- Esta migracion SOLO agrega funciones y una tabla: no cierra ningun permiso,
-- asi que las versiones actuales de la app siguen funcionando igual.

-- Libro del saldo: cada peso que entra o sale, con su motivo.
create table if not exists public.saldo_movimientos (
  id              bigserial primary key,
  created_at      timestamptz not null default now(),
  user_id         uuid not null,
  monto           numeric not null,          -- positivo entra, negativo sale
  saldo_despues   numeric not null,
  motivo          text not null,             -- 'reembolso_cancelacion', 'pago_evento', 'ajuste_admin'
  appointment_id  uuid,
  event_id        uuid
);
create index if not exists saldo_movimientos_user_idx on public.saldo_movimientos (user_id, created_at desc);
alter table public.saldo_movimientos enable row level security;
revoke all on public.saldo_movimientos from anon, authenticated;
create policy "cada quien ve sus movimientos de saldo" on public.saldo_movimientos
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
grant select on public.saldo_movimientos to authenticated;

-- Precio del cupo en pesos: el del evento, si no el de app_config, si no 15000
-- (el mismo orden que usa la app en subscription-plans.tsx).
create or replace function public.precio_cupo_cop(p_event_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select e.price from public.events e where e.id = p_event_id),
    (select nullif(substring(c.value from '^\s*(\d+)')::integer, 0)
       from public.app_config c where c.key = 'event_price'),
    15000);
$$;
revoke all on function public.precio_cupo_cop(uuid) from public, anon;
grant execute on function public.precio_cupo_cop(uuid) to authenticated, service_role;

-- Reserva sin pasarela de pago: con saldo, con suscripcion, evento sin costo o
-- codigo promocional del 100%. Todo en una transaccion: si la cita no se puede
-- crear, no se descuenta nada.
create or replace function public.reservar_evento(
  p_event_id   uuid,
  p_metodo     text,             -- 'virtual_balance' | 'subscription' | 'free' | 'promo_code'
  p_idiomas    text[]  default null,
  p_zonas      text[]  default null,
  p_zona_otra  text    default null,
  p_waiver     boolean default false
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
revoke all on function public.reservar_evento(uuid, text, text[], text[], text, boolean) from public, anon;
grant execute on function public.reservar_evento(uuid, text, text[], text[], text, boolean) to authenticated;

-- Cancelar mi cita. El servidor decide el reembolso con las mismas reglas que
-- hoy aplica appointments.tsx: solo si faltan mas de 24 h, nunca en citas por
-- suscripcion, y por lo que de verdad se pago (amount_paid_cop, o el precio
-- del cupo en citas viejas que no lo guardaron).
create or replace function public.cancelar_mi_cita(p_appointment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_cita     record;
  v_inicio   timestamptz;
  v_reembolso numeric := 0;
  v_saldo    numeric;
  v_en_ventana boolean;
begin
  select a.*, coalesce(e.start_time, e.date) as inicio, e.date as fecha
    into v_cita
    from public.appointments a join public.events e on e.id = a.event_id
   where a.id = p_appointment_id and a.user_id = v_uid
   for update of a;
  if not found then
    return jsonb_build_object('success', false, 'error', 'no_existe');
  end if;
  if v_cita.status = 'cancelada' then
    return jsonb_build_object('success', true, 'ya_cancelada', true, 'reembolso', 0);
  end if;

  v_en_ventana := v_cita.payment_method is distinct from 'subscription'
                  and (v_cita.fecha is null or v_cita.inicio > now() + interval '24 hours');

  update public.appointments
     set status = 'cancelada',
         payment_status = case
           when v_cita.payment_method = 'subscription' then v_cita.payment_status
           when v_en_ventana then 'refunded'
           else 'completed' end,
         updated_at = now()
   where id = p_appointment_id;

  -- Solo se reembolsa lo que estaba pagado; una cita pendiente no genera saldo.
  if v_en_ventana and v_cita.payment_status = 'completed' then
    v_reembolso := coalesce(v_cita.amount_paid_cop, public.precio_cupo_cop(v_cita.event_id));
    if v_reembolso > 0 then
      update public.users set virtual_balance = coalesce(virtual_balance, 0) + v_reembolso, updated_at = now()
       where id = v_uid returning virtual_balance into v_saldo;
      insert into public.saldo_movimientos (user_id, monto, saldo_despues, motivo, appointment_id, event_id)
      values (v_uid, v_reembolso, v_saldo, 'reembolso_cancelacion', p_appointment_id, v_cita.event_id);
    end if;
  end if;

  return jsonb_build_object('success', true, 'reembolso', v_reembolso);
end;
$$;
revoke all on function public.cancelar_mi_cita(uuid) from public, anon;
grant execute on function public.cancelar_mi_cita(uuid) to authenticated;

-- Renovacion de la suscripcion (subscription-membership.tsx): cancelar con
-- motivo o reactivar. Solo toca esas columnas; nunca el estado, las fechas,
-- el precio ni la tarjeta guardada.
create or replace function public.cambiar_renovacion_suscripcion(p_activar boolean, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_n   integer;
begin
  if not p_activar and nullif(btrim(coalesce(p_motivo, '')), '') is null then
    return jsonb_build_object('success', false, 'error', 'falta_motivo');
  end if;

  update public.subscriptions
     set auto_renew = p_activar,
         cancellation_reason = case when p_activar then null else left(btrim(p_motivo), 500) end,
         cancelled_at = case when p_activar then null else now() end,
         cancelled_at_reconstruido = false
   where user_id = v_uid;
  get diagnostics v_n = row_count;

  if v_n = 0 then
    return jsonb_build_object('success', false, 'error', 'sin_suscripcion');
  end if;
  return jsonb_build_object('success', true);
end;
$$;
revoke all on function public.cambiar_renovacion_suscripcion(boolean, text) from public, anon;
grant execute on function public.cambiar_renovacion_suscripcion(boolean, text) to authenticated;
