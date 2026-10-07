-- Sacar a alguien de un evento desde el admin, de dos maneras distintas.
--
-- Antes el boton del admin hacia "delete from appointments": la persona
-- perdia el cupo y la plata, no le llegaba ningun aviso, y de paso se borraba
-- el registro de cuanto habia pagado (ese dato vive en la misma fila).
--
-- Ahora hay dos caminos, y el admin escoge:
--   1. Con saldo  -> cancela la cita, le devuelve a la persona lo que pago en
--                    saldo virtual y le llega su correo de cancelacion.
--   2. Silencioso -> cancela la cita y ya. Ni saldo ni aviso ni amonestacion.
--                    Es para quien pide que lo saquen cuando ya pasó el plazo
--                    de las 24 horas y por tanto no tiene derecho a saldo.
-- En los dos casos la fila se conserva (queda como 'cancelada'), asi que el
-- historial de la venta no se pierde y el cupo se libera igual.

alter table public.appointments
  add column if not exists admin_cancel_silenciosa boolean not null default false;

comment on column public.appointments.admin_cancel_silenciosa is
  'true = el admin saco a la persona del evento en silencio (sin saldo, sin correo, sin amonestacion). La pone admin_sacar_del_evento.';

-- El aviso de cancelacion respeta esa marca.
create or replace function public.notify_appointment_cancelled()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_user_name text;
  v_user_email text;
  v_user_phone text;
  v_event_name text;
  v_event_date timestamptz;
  v_event_time text;
  v_event_start timestamptz;
  v_is_late boolean := false;
  v_payload jsonb;
begin
  if (NEW.status = 'cancelada' and (OLD.status is distinct from 'cancelada')) then

    -- Salida en silencio pedida por la propia persona y ejecutada por el admin:
    -- ni correo de cancelacion ni amonestacion por cancelar tarde. Sin esto, a
    -- alguien que pide por WhatsApp que lo saquen le caeria una falta (y a la
    -- segunda, suspension) por un favor que el admin le hizo.
    if coalesce(NEW.admin_cancel_silenciosa, false) then
      return NEW;
    end if;

    select name, email, phone into v_user_name, v_user_email, v_user_phone
      from public.users where id = NEW.user_id;
    select name, date, time, coalesce(start_time, date)
      into v_event_name, v_event_date, v_event_time, v_event_start
      from public.events where id = NEW.event_id;

    -- Cancelacion "en destiempo": con menos de 24h antes del inicio real del
    -- evento (o ya empezado). Se calcula en el servidor con la hora real del
    -- evento (no con datos del cliente) para que no se pueda evadir.
    v_is_late := v_event_start is not null
                 and (v_event_start - now() < interval '24 hours');

    -- Solo amonesta cuando:
    --   * fue tardia (< 24h),
    --   * la reserva estaba CONFIRMADA,
    --   * y era una reserva REAL pagada/comprometida (payment_status='completed'):
    --     eso cubre pago normal, gratis, saldo y SUSCRIPCION, pero NO reembolsos
    --     (cancelacion temprana) ni citas impagas que el admin limpia.
    if v_is_late
       and OLD.status = 'confirmada'
       and NEW.payment_status = 'completed' then
      perform net.http_post(
        url := 'https://wjdiraurfbawotlcndmk.supabase.co/functions/v1/notify-no-show',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqZGlyYXVyZmJhd290bGNuZG1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0MDMxMTUsImV4cCI6MjA4NTk3OTExNX0.FxMBafEjIliTDzRBRlnY59i1wEcbIx6u8ZdVf1uxuj8',
          'x-noshow-secret', 'nospi_noshow_wh_7f3a9c2e'
        ),
        body := jsonb_build_object('late_cancel_appointment_id', NEW.id)
      );
    else
      v_payload := jsonb_build_object(
        'userName', v_user_name,
        'userEmail', v_user_email,
        'userPhone', v_user_phone,
        'eventName', v_event_name,
        'eventDate', v_event_date,
        'eventTime', v_event_time,
        'refunded', (NEW.payment_status = 'refunded')
      );
      perform net.http_post(
        url := 'https://wjdiraurfbawotlcndmk.supabase.co/functions/v1/notify-cancellation',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-webhook-secret', 'nospi_cancel_wh_7f3d9a1c2b4e6f80'
        ),
        body := v_payload
      );
    end if;
  end if;
  return NEW;
end;
$function$;

create or replace function public.admin_sacar_del_evento(
  p_appointment_id uuid,
  p_devolver_saldo boolean
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_apt public.appointments%rowtype;
  v_precio integer;
  v_monto integer := 0;
begin
  if not exists (select 1 from public.admins where user_id = auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into v_apt from public.appointments where id = p_appointment_id;
  if not found then
    raise exception 'la cita no existe';
  end if;

  if v_apt.status = 'cancelada' then
    return jsonb_build_object('ok', true, 'ya_estaba_cancelada', true, 'monto', 0, 'con_saldo', false);
  end if;

  -- Cuanto se le debe. amount_paid_cop suele venir vacio en las citas viejas,
  -- asi que ahi se cae al precio configurado del evento. Suscripcion, cortesia
  -- y gratis valen 0 a proposito: no hubo un cobro individual que devolver, y
  -- sin esta salvedad la app le regalaria el precio de un evento a alguien que
  -- nunca lo pago.
  if coalesce(v_apt.payment_method, '') in ('subscription', 'cortesia', 'free') then
    v_monto := 0;
  elsif v_apt.amount_paid_cop is not null then
    v_monto := v_apt.amount_paid_cop;
  else
    select coalesce(nullif(value, '')::integer, 0) into v_precio
      from public.app_config where key = 'event_price';
    v_monto := coalesce(v_precio, 0);
  end if;

  if p_devolver_saldo and v_monto > 0 then
    update public.appointments
       set status = 'cancelada',
           payment_status = 'refunded',
           admin_cancel_silenciosa = false
     where id = p_appointment_id;

    update public.users
       set virtual_balance = coalesce(virtual_balance, 0) + v_monto,
           updated_at = now()
     where id = v_apt.user_id;

    return jsonb_build_object('ok', true, 'con_saldo', true, 'monto', v_monto, 'user_id', v_apt.user_id);
  end if;

  -- Silencioso: tambien es a donde caen los casos en que se pidio devolver
  -- saldo pero no hay nada que devolver (suscripcion, cortesia, gratis). El
  -- campo se pone ANTES del cambio de estado para que el trigger ya lo vea.
  update public.appointments
     set admin_cancel_silenciosa = true,
         status = 'cancelada'
   where id = p_appointment_id;

  return jsonb_build_object(
    'ok', true,
    'con_saldo', false,
    'monto', 0,
    'sin_saldo_que_devolver', (p_devolver_saldo and v_monto = 0),
    'user_id', v_apt.user_id
  );
end;
$function$;

grant execute on function public.admin_sacar_del_evento(uuid, boolean) to authenticated;