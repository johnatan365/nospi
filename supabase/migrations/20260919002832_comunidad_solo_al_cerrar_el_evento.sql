-- Entrar a la Comunidad Nospi: solo DESPUES de que el evento se cierra.
--
-- Antes la puerta se abria en el mismo instante del check-in, o sea durante el
-- evento: la gente estaba sentada en la mesa y ya tenia el grupo grande
-- encima. La llave sigue siendo la misma -haber confirmado asistencia,
-- checked_in_at- pero ahora la puerta la abre el cierre del evento.

-- Un solo lugar decide como se mete a alguien, para que los dos caminos
-- (cerrar el evento, y el check-in tardio) no se desincronicen.
create or replace function public.meter_en_comunidad(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_conv uuid;
begin
  select id into v_conv from public.chat_conversations where type = 'community' limit 1;
  if v_conv is null then return false; end if;

  -- Si se salio a proposito, o lo saco el admin, no se le vuelve a meter.
  if exists (
    select 1 from public.comunidad_salidas s
    where s.conversation_id = v_conv and s.user_id = p_user_id
  ) then
    return false;
  end if;

  -- Ojo: aqui NO se filtra por is_internal. Esa marca es solo para las
  -- estadisticas de plata; usarla para decidir quien entra al grupo fue lo que
  -- dejo al dueno por fuera.
  insert into public.chat_participants (conversation_id, user_id)
  values (v_conv, p_user_id)
  on conflict (conversation_id, user_id) do nothing;

  return true;
end;
$function$;

-- Camino principal: al cerrar el evento entran todos los que confirmaron
-- asistencia en el.
create or replace function public.trg_comunidad_al_cerrar_evento()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if NEW.event_status is distinct from 'closed' then return NEW; end if;
  if OLD.event_status is not distinct from NEW.event_status then return NEW; end if;

  perform public.meter_en_comunidad(a.user_id)
  from public.appointments a
  where a.event_id = NEW.id
    and a.checked_in_at is not null
    and coalesce(a.status, '') <> 'cancelada';

  return NEW;
end;
$function$;

drop trigger if exists trg_comunidad_al_cerrar_evento on public.events;
create trigger trg_comunidad_al_cerrar_evento
after update of event_status on public.events
for each row execute function public.trg_comunidad_al_cerrar_evento();

-- La cita ya no mete a nadie por si sola. Se queda para el caso del check-in
-- tardio: el admin marca la llegada de alguien cuando el evento YA esta
-- cerrado, y esa persona tambien tiene que entrar.
create or replace function public.trg_entrar_a_comunidad()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if NEW.checked_in_at is null then return NEW; end if;
  if TG_OP = 'UPDATE' and OLD.checked_in_at is not null then return NEW; end if;
  if coalesce(NEW.status, '') = 'cancelada' then return NEW; end if;

  -- Si el evento sigue abierto no entra todavia: lo va a meter
  -- trg_comunidad_al_cerrar_evento cuando se cierre.
  if not exists (
    select 1 from public.events e
    where e.id = NEW.event_id and e.event_status = 'closed'
  ) then
    return NEW;
  end if;

  perform public.meter_en_comunidad(NEW.user_id);
  return NEW;
end;
$function$;

-- Volver a entrar despues de haberse salido pide lo mismo: una asistencia
-- confirmada en un evento YA cerrado. Si no, quien se salio podria reentrar a
-- mitad del evento y saltarse la regla.
create or replace function public.volver_a_comunidad(p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if (select type from public.chat_conversations where id = p_conversation_id) <> 'community' then
    raise exception 'no es la comunidad' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.comunidad_salidas s
    where s.conversation_id = p_conversation_id and s.user_id = auth.uid() and s.lo_saco_admin
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  -- Solo quien ya asistio a un evento que ademas ya cerro.
  if not exists (
    select 1 from public.appointments a
    join public.events e on e.id = a.event_id
    where a.user_id = auth.uid()
      and a.checked_in_at is not null
      and coalesce(a.status, '') <> 'cancelada'
      and e.event_status = 'closed'
  ) then
    raise exception 'todavia no has asistido a un evento cerrado' using errcode = '42501';
  end if;

  delete from public.comunidad_salidas
  where conversation_id = p_conversation_id and user_id = auth.uid();

  insert into public.chat_participants (conversation_id, user_id)
  values (p_conversation_id, auth.uid())
  on conflict (conversation_id, user_id) do nothing;

  return true;
end;
$function$;
