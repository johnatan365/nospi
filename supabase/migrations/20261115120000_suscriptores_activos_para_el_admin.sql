-- Corona de premium en el admin.
--
-- El admin necesita saber, en cualquier lista donde aparezca una persona
-- (inscritos de un evento, la tabla En vivo, la pestana Usuarios, los modales
-- de WhatsApp, Reconciliacion, No-shows, Dividir...), si esa persona tiene una
-- suscripcion activa. Pedirlo lista por lista seria una consulta por pantalla;
-- esta funcion devuelve el conjunto entero una sola vez y el panel lo cruza en
-- memoria.
--
-- "Activa" es EXACTAMENTE la misma condicion de has_active_subscription(): la
-- que usa reservar_evento() para dejar reservar con suscripcion. Si la corona
-- usara otra regla, el admin veria corona en alguien a quien la app no deja
-- reservar (o al reves), que es peor que no tener corona.
--
-- Devuelve plan, vencimiento y renovacion para el tooltip: con eso el admin
-- sabe ademas cuanto le queda y si se renueva sola, sin abrir Suscripciones.

create or replace function public.get_active_subscribers_for_admin()
returns table (user_id uuid, plan_type text, end_date timestamptz, auto_renew boolean)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  select distinct on (s.user_id) s.user_id, s.plan_type, s.end_date, coalesce(s.auto_renew, false)
    from public.subscriptions s
   where s.status = 'active'
     and s.end_date > now()
   order by s.user_id, s.end_date desc;
end;
$$;

revoke all on function public.get_active_subscribers_for_admin() from public, anon;
grant execute on function public.get_active_subscribers_for_admin() to authenticated;
