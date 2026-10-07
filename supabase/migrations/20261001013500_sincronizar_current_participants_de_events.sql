
-- events.current_participants siempre nacia en 0 y nadie lo volvia a tocar:
-- ni el codigo de la app, ni un trigger, ni un cron. Quedaba en 0 para
-- siempre, incluso en eventos con 16 o 22 cupos vendidos. Cualquiera que
-- mirara la tabla (el admin, otro chat, una consulta) leia "0 participantes"
-- en un evento lleno. Aca se vuelve un contador de verdad, mantenido por la
-- base.
--
-- Definicion: cupos pagados que NO se cancelaron, o sea status en
-- ('confirmada','anterior'). Se incluye 'anterior' a proposito: cuando un
-- evento se cierra, el trigger cascade_event_closed_to_appointments pasa las
-- citas de 'confirmada' a 'anterior'. Si solo contaramos 'confirmada', todos
-- los eventos pasados volverian a marcar 0 y el historico seria inservible.

create or replace function public.recalcular_current_participants(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_n integer;
begin
  if p_event_id is null then
    return;
  end if;

  select count(*) into v_n
  from public.appointments a
  where a.event_id = p_event_id
    and a.status in ('confirmada', 'anterior');

  -- El "is distinct from" no es cosmetico: sin el, cada cambio en una cita
  -- dispararia un UPDATE sobre events aunque el numero no cambie, y eso mueve
  -- updated_at y vuelve a correr todos los demas triggers de events.
  update public.events
  set current_participants = v_n
  where id = p_event_id
    and current_participants is distinct from v_n;
end;
$$;

create or replace function public.trg_sync_current_participants()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalcular_current_participants(old.event_id);
    return old;
  end if;

  perform public.recalcular_current_participants(new.event_id);

  -- Si una cita se mueve de evento, hay que recontar tambien el que la perdio.
  if tg_op = 'UPDATE' and old.event_id is distinct from new.event_id then
    perform public.recalcular_current_participants(old.event_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_appointments_sync_current_participants on public.appointments;

-- Solo status y event_id: son las dos unicas columnas que pueden cambiar el
-- conteo. Escuchar todo el UPDATE haria trabajo de mas en cada check-in,
-- cada calificacion y cada cambio de arrival_status.
create trigger trg_appointments_sync_current_participants
after insert or delete or update of status, event_id on public.appointments
for each row execute function public.trg_sync_current_participants();
