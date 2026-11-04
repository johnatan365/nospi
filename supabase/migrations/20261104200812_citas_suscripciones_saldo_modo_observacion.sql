-- Parte B, paso 4: "modo observacion" para citas, suscripciones y saldo.
-- No bloquea nada. Anota cada escritura hecha directo desde la app (rol anon o
-- authenticated, sin ser admin) que la regla final NO dejaria pasar. Las
-- funciones del servidor (reservar_evento, cancelar_mi_cita,
-- cambiar_renovacion_suscripcion, confirmar-pago-evento, wompi-webhook) corren
-- como dueno o service_role y no se anotan.
--
-- Lo que la app SI podra seguir escribiendo directo (no se anota):
--   appointments: llegada y calificaciones (checked_in_at, arrival_status,
--     location_confirmed, ratings_submitted_at, last_seen_at, updated_at) y
--     pasar su propia cita a status 'anterior' al cerrar la dinamica.
--   users: todo su perfil MENOS virtual_balance, reservas_suspendidas_hasta,
--     is_internal y solo_suscripcion.
--   subscriptions: nada (cancelar/reactivar va por cambiar_renovacion_suscripcion).
-- En una semana se mira la tabla y se decide el bloqueo (paso 5).

create table if not exists public.escrituras_observadas (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  tabla       text not null,
  fila_id     uuid,
  user_id     uuid,
  rol         text,
  operacion   text,
  columnas    text[],
  motivo      text
);
create index if not exists escrituras_observadas_created_idx on public.escrituras_observadas (created_at desc);
alter table public.escrituras_observadas enable row level security;
revoke all on public.escrituras_observadas from anon, authenticated;

-- Anota. SECURITY DEFINER para poder escribir en la tabla de observacion; solo
-- hace algo si la llama un trigger.
create or replace function public.anotar_escritura_observada(
  p_tabla text, p_fila_id uuid, p_operacion text, p_columnas text[], p_motivo text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() = 0 then
    return;
  end if;
  insert into public.escrituras_observadas (tabla, fila_id, user_id, rol, operacion, columnas, motivo)
  values (p_tabla, p_fila_id, auth.uid(), coalesce(auth.role(), current_user), p_operacion, p_columnas, p_motivo);
end;
$$;
revoke all on function public.anotar_escritura_observada(text, uuid, text, text[], text) from public;
grant execute on function public.anotar_escritura_observada(text, uuid, text, text[], text) to anon, authenticated;

-- El trigger es SECURITY INVOKER a proposito: current_user dice si el cambio
-- viene directo de la app (anon/authenticated) o de una funcion del servidor.
create or replace function public.trg_observar_escrituras()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  c_cita_libres constant text[] := array['checked_in_at', 'arrival_status', 'location_confirmed',
    'ratings_submitted_at', 'last_seen_at', 'updated_at'];
  c_usuario_sensibles constant text[] := array['virtual_balance', 'reservas_suspendidas_hasta',
    'is_internal', 'solo_suscripcion'];
  v_cols   text[];
  v_fuera  text[];
  v_motivo text;
  v_nuevo  jsonb;
begin
  if current_user not in ('anon', 'authenticated') then
    return coalesce(NEW, OLD);
  end if;
  if public.is_admin() then
    return coalesce(NEW, OLD);
  end if;

  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key) into v_cols
      from jsonb_each(to_jsonb(NEW)) n
      join jsonb_each(to_jsonb(OLD)) o using (key)
     where n.value is distinct from o.value;
    if v_cols is null then
      return NEW;
    end if;
  end if;

  if tg_table_name = 'appointments' then
    if tg_op <> 'UPDATE' then
      v_motivo := 'cita: ' || lower(tg_op) || ' directo';
    else
      select array_agg(c) into v_fuera from unnest(v_cols) c
       where c <> all (c_cita_libres)
         and not (c = 'status' and NEW.status = 'anterior');
      if v_fuera is not null then
        v_motivo := 'cita: columnas fuera de llegada/calificacion: ' || array_to_string(v_fuera, ', ');
      end if;
    end if;

  elsif tg_table_name = 'subscriptions' then
    v_motivo := 'suscripcion: ' || lower(tg_op) || ' directo';

  elsif tg_table_name = 'users' then
    if tg_op = 'UPDATE' then
      select array_agg(c) into v_fuera from unnest(v_cols) c where c = any (c_usuario_sensibles);
      if v_fuera is not null then
        v_motivo := 'usuario: ' || array_to_string(v_fuera, ', ');
      end if;
    elsif tg_op = 'INSERT' then
      v_nuevo := to_jsonb(NEW);
      if auth.uid() is null or NEW.id is distinct from auth.uid() then
        v_motivo := 'usuario: alta de una fila que no es la propia';
      end if;
      select array_agg(c) into v_fuera from unnest(c_usuario_sensibles) c
       where v_nuevo ? c
         and v_nuevo -> c not in ('null'::jsonb, '0'::jsonb, 'false'::jsonb);
      if v_fuera is not null then
        v_motivo := concat_ws(' | ', v_motivo, 'usuario: alta con ' || array_to_string(v_fuera, ', '));
      end if;
      v_cols := array(select jsonb_object_keys(v_nuevo));
    else
      v_motivo := 'usuario: borrado directo';
    end if;
  end if;

  if v_motivo is not null then
    perform public.anotar_escritura_observada(
      tg_table_name, (to_jsonb(coalesce(NEW, OLD)) ->> 'id')::uuid, tg_op, coalesce(v_cols, '{}'), v_motivo);
  end if;
  return coalesce(NEW, OLD);
end;
$$;

-- "a_" para correr antes que los demas BEFORE y ver solo lo que cambio la app.
drop trigger if exists a_observar_escrituras on public.appointments;
create trigger a_observar_escrituras
  before insert or update or delete on public.appointments
  for each row execute function public.trg_observar_escrituras();

drop trigger if exists a_observar_escrituras on public.subscriptions;
create trigger a_observar_escrituras
  before insert or update or delete on public.subscriptions
  for each row execute function public.trg_observar_escrituras();

drop trigger if exists a_observar_escrituras on public.users;
create trigger a_observar_escrituras
  before insert or update or delete on public.users
  for each row execute function public.trg_observar_escrituras();