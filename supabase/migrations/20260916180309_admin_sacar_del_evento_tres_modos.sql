-- Tercera forma de sacar a alguien de un evento: sacarlo Y amonestarlo.
--
-- El caso real: la persona pide por WhatsApp que la saquen cuando ya pasaron
-- las 24 horas. A veces da una razon de peso (se enfermo, se le murio alguien)
-- y castigarla seria injusto; otras veces simplemente no va a ir. Quien decide
-- eso es una persona, no una regla de tiempo, asi que el admin escoge:
--
--   'saldo'     -> cancelacion a tiempo: le devuelve el saldo y le llega el
--                  correo normal de cancelacion.
--   'silencio'  -> tarde pero con buen motivo: sale y ya. Sin saldo, sin correo
--                  y sin falta.
--   'amonestar' -> tarde y sin motivo: sin saldo y CON la falta de siempre
--                  (correo + push + la escalera 1a aviso / 2a 15 dias / 3a 60).
--
-- El modo 'amonestar' llama a notify-no-show directamente en vez de dejarselo
-- al trigger, por dos razones: el trigger solo amonesta si faltan menos de 24
-- horas (aca manda la decision del admin, no el reloj) y asi no hay forma de
-- que salgan dos correos por lo mismo.

create or replace function public.admin_sacar_del_evento_modo(
  p_appointment_id uuid,
  p_modo text
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

  if p_modo not in ('saldo', 'silencio', 'amonestar') then
    raise exception 'modo invalido: %', p_modo;
  end if;

  select * into v_apt from public.appointments where id = p_appointment_id;
  if not found then
    raise exception 'la cita no existe';
  end if;

  if v_apt.status = 'cancelada' then
    return jsonb_build_object('ok', true, 'ya_estaba_cancelada', true, 'monto', 0, 'modo', p_modo);
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

  if p_modo = 'saldo' and v_monto > 0 then
    update public.appointments
       set status = 'cancelada',
           payment_status = 'refunded',
           admin_cancel_silenciosa = false
     where id = p_appointment_id;

    update public.users
       set virtual_balance = coalesce(virtual_balance, 0) + v_monto,
           updated_at = now()
     where id = v_apt.user_id;

    return jsonb_build_object('ok', true, 'modo', 'saldo', 'con_saldo', true, 'monto', v_monto, 'user_id', v_apt.user_id);
  end if;

  -- Los otros dos modos comparten el mismo cambio: la cita queda cancelada y el
  -- trigger de avisos no hace nada. La diferencia la pone el llamado de abajo.
  -- (Aqui tambien cae 'saldo' cuando no habia nada que devolver.)
  update public.appointments
     set admin_cancel_silenciosa = true,
         status = 'cancelada'
   where id = p_appointment_id;

  if p_modo = 'amonestar' then
    perform net.http_post(
      url := 'https://wjdiraurfbawotlcndmk.supabase.co/functions/v1/notify-no-show',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqZGlyYXVyZmJhd290bGNuZG1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0MDMxMTUsImV4cCI6MjA4NTk3OTExNX0.FxMBafEjIliTDzRBRlnY59i1wEcbIx6u8ZdVf1uxuj8',
        'x-noshow-secret', 'nospi_noshow_wh_7f3a9c2e'
      ),
      body := jsonb_build_object('late_cancel_appointment_id', p_appointment_id)
    );

    return jsonb_build_object('ok', true, 'modo', 'amonestar', 'con_saldo', false, 'monto', 0, 'user_id', v_apt.user_id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'modo', p_modo,
    'con_saldo', false,
    'monto', 0,
    'sin_saldo_que_devolver', (p_modo = 'saldo' and v_monto = 0),
    'user_id', v_apt.user_id
  );
end;
$function$;

grant execute on function public.admin_sacar_del_evento_modo(uuid, text) to authenticated;

-- La version anterior (dos modos) se queda funcionando y delega, para que la
-- pantalla de admin que ya esta publicada no se rompa mientras sale la nueva.
create or replace function public.admin_sacar_del_evento(
  p_appointment_id uuid,
  p_devolver_saldo boolean
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  return public.admin_sacar_del_evento_modo(
    p_appointment_id,
    case when p_devolver_saldo then 'saldo' else 'silencio' end
  );
end;
$function$;