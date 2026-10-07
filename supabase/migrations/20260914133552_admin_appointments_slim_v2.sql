-- La version original repetia nombre, correo, telefono, ciudad y pais del
-- usuario y todos los datos del evento EN CADA CITA: 926 KB de JSON para 544
-- filas. El panel ya tiene los usuarios y los eventos cargados aparte, asi que
-- aqui solo se devuelven las columnas propias de la cita y el panel arma el
-- resto en memoria. Mismo conjunto de filas (los INNER JOIN se conservan para
-- excluir citas huerfanas), pero una fraccion del peso.

create or replace function public.get_all_appointments_for_admin_v2()
 returns table(
   id uuid,
   user_id uuid,
   event_id uuid,
   status text,
   payment_status text,
   created_at timestamp with time zone,
   purchase_whatsapp_sent_at timestamp with time zone,
   reminder_48h_sent_at timestamp with time zone,
   sameday_reminder_sent_at timestamp with time zone
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
  select
    a.id, a.user_id, a.event_id, a.status, a.payment_status, a.created_at,
    a.purchase_whatsapp_sent_at, a.reminder_48h_sent_at, a.sameday_reminder_sent_at
  from public.appointments a
  inner join public.users u on a.user_id = u.id
  inner join public.events e on a.event_id = e.id
  order by a.created_at desc;
end;
$function$;