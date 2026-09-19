-- Tener fila en event_participants NO es lo mismo que haber confirmado.
-- Hay filas creadas sin check_in_time, y con la version anterior esa persona
-- entraba al chat de asistentes sin haber confirmado nada. Ahora se exige una
-- marca real de llegada.
create or replace function public.asistio_al_evento(p_event_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select exists(
    select 1 from public.event_participants ep
    where ep.event_id = p_event_id
      and ep.user_id = p_user_id
      and (
        ep.check_in_time is not null
        or coalesce(ep.is_presented, false)
        or coalesce(ep.presented, false)
      )
  );
$$;
