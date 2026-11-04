-- events tenia INSERT, UPDATE y DELETE abiertos a cualquiera (rol public,
-- condicion true): sin iniciar sesion se podia editar o borrar un evento, y al
-- borrarlo se iban en cascada sus citas, calificaciones y chat.
--
-- Paso 1 (ya): crear y borrar, solo el admin. Editar, solo con sesion.
-- Paso 2 (esta semana): "modo observacion". No bloquea nada: anota cada
-- edicion hecha directo desde la app que la regla final NO dejaria pasar
-- (no es admin, no tiene cita activa en ese evento, o toca columnas que no
-- son del juego). Con lo anotado se decide el bloqueo.

drop policy if exists "Allow event creation" on public.events;
drop policy if exists "Allow event deletion" on public.events;
drop policy if exists "Allow event updates"  on public.events;

create policy "admin crea eventos" on public.events
  for insert to authenticated with check (public.is_admin());

create policy "admin borra eventos" on public.events
  for delete to authenticated using (public.is_admin());

-- Temporal, mientras dura la observacion: igual que antes pero sin anonimos.
create policy "con sesion editan eventos (en observacion)" on public.events
  for update to authenticated using (true) with check (true);

create table if not exists public.events_cambios_observados (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  event_id    uuid,
  user_id     uuid,
  operacion   text,
  columnas    text[],
  motivo      text
);
alter table public.events_cambios_observados enable row level security;
revoke all on public.events_cambios_observados from anon, authenticated;

-- Decide y anota. SECURITY DEFINER para poder ver todas las citas y escribir
-- en la tabla de observacion; solo hace algo si la llama el trigger.
create or replace function public.observar_cambio_evento(
  p_operacion text, p_event_id uuid, p_columnas text[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c_juego constant text[] := array['game_phase', 'current_level', 'current_question',
    'current_question_index', 'answered_users', 'moderator_id', 'updated_at'];
  v_uid uuid := auth.uid();
  v_motivos text[] := '{}';
  v_fuera text[];
begin
  if pg_trigger_depth() = 0 then
    return;
  end if;
  if public.is_admin() then
    return;
  end if;

  if p_operacion <> 'UPDATE' then
    v_motivos := v_motivos || ('operacion ' || p_operacion);
  end if;

  if not exists (
    select 1 from public.appointments a
     where a.event_id = p_event_id and a.user_id = v_uid
       and coalesce(a.status, '') <> 'cancelada'
  ) then
    v_motivos := v_motivos || 'sin cita activa en el evento'::text;
  end if;

  select array_agg(c) into v_fuera from unnest(p_columnas) c where c <> all (c_juego);
  if v_fuera is not null then
    v_motivos := v_motivos || ('columnas fuera del juego: ' || array_to_string(v_fuera, ', '));
  end if;

  if array_length(v_motivos, 1) > 0 then
    insert into public.events_cambios_observados (event_id, user_id, operacion, columnas, motivo)
    values (p_event_id, v_uid, p_operacion, p_columnas, array_to_string(v_motivos, ' | '));
  end if;
end;
$$;
revoke all on function public.observar_cambio_evento(text, uuid, text[]) from public;
grant execute on function public.observar_cambio_evento(text, uuid, text[]) to anon, authenticated;

-- El trigger es SECURITY INVOKER a proposito: asi current_user dice si el
-- cambio viene directo de la app (anon/authenticated) o de una funcion del
-- servidor, que corre como dueno y no se observa.
create or replace function public.trg_observar_cambios_events()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_cols text[];
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'UPDATE' then
      select array_agg(n.key order by n.key) into v_cols
        from jsonb_each(to_jsonb(NEW)) n
        join jsonb_each(to_jsonb(OLD)) o using (key)
       where n.value is distinct from o.value;
    end if;
    perform public.observar_cambio_evento(tg_op, coalesce(NEW.id, OLD.id), coalesce(v_cols, '{}'));
  end if;
  return coalesce(NEW, OLD);
end;
$$;

-- Nombre con "a_" para que corra antes que los demas BEFORE y vea solo lo que
-- cambio la app, no lo que agregan los otros triggers.
drop trigger if exists a_observar_cambios_events on public.events;
create trigger a_observar_cambios_events
  before insert or update or delete on public.events
  for each row execute function public.trg_observar_cambios_events();
