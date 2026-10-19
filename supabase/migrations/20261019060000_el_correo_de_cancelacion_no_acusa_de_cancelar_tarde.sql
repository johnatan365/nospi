-- El correo de cancelacion acusaba de cancelar tarde a quien cancelo a tiempo.
--
-- notify_appointment_cancelled solo le mandaba al Edge Function el campo
-- `refunded` (= payment_status es 'refunded'). El correo entendia "sin
-- reembolso" como "cancelo con menos de 24 horas" y se lo escribia a la
-- persona, y a soporte en la copia interna.
--
-- Eso es falso para todo el que cancela a tiempo pero no tiene plata que
-- recuperar: los suscriptores (su cupo va incluido en la suscripcion y nunca
-- genera saldo) y las cortesias. 28 personas, todas suscriptoras, recibieron
-- ese correo. Una escribio a soporte a reclamar: habia cancelado con seis
-- dias de anticipacion.
--
-- Ahora el trigger manda tambien el dato real -- si fue tardia (calculado en
-- el servidor con la hora de inicio del evento) y si el cupo era de
-- suscripcion -- y el correo escoge el texto con eso. Ver tambien la version
-- 18 del Edge Function notify-cancellation.

CREATE OR REPLACE FUNCTION public.notify_appointment_cancelled()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- ni correo de cancelacion ni amonestacion por cancelar tarde.
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
        'refunded', (NEW.payment_status = 'refunded'),
        'isLate', v_is_late,
        'isSubscription', (NEW.payment_method = 'subscription')
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
