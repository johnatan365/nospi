-- Historial de quien modero cada dinamica, y desde cuando.
--
-- El problema: `events.moderator_id` guarda SOLO al moderador actual. Y el rol
-- cambia: en la pantalla de preguntas el boton "🔄 Cambiar moderador" lo puede
-- tocar cualquiera, cuantas veces quiera, SIN candado (a diferencia del
-- "Quiero ser el moderador" del arranque, que solo funciona si el puesto esta
-- libre). Cada cambio pisa al anterior y no queda ningun rastro: ni de quien
-- iba antes, ni de a que hora se paso el microfono.
--
-- Eso importa porque que el rol rote tres veces en una noche casi siempre
-- significa que algo paso -- el moderador se fue, se quedo sin bateria, o
-- nadie quiere el papel -- y hoy el admin no tiene forma de verlo.
--
-- Aqui NO se cambia ningun comportamiento de la app: solo se empieza a anotar
-- lo que ya ocurre. Por eso va todo en la base (tabla + disparador) y no en el
-- codigo del cliente: asi registra desde el momento en que se aplica, sin
-- esperar a que salga un build nuevo a las tiendas.
--
-- No se rellenan los 27 eventos que ya tienen moderador: de esos no existe la
-- hora en ninguna parte, y una hora inventada es peor que un hueco. El admin
-- muestra el nombre y dice que es anterior a este registro.

create table if not exists public.event_moderadores (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  user_id    uuid not null references public.users(id)  on delete cascade,
  desde      timestamptz not null default now(),
  -- NULL = es el turno que sigue abierto ahora mismo.
  hasta      timestamptz
);

comment on table public.event_moderadores is
  'Un renglon por turno de moderador. hasta IS NULL es el turno vigente. Lo llena solo el disparador trg_registrar_cambio_de_moderador; nadie escribe aqui a mano.';

create index if not exists event_moderadores_evento_idx
  on public.event_moderadores (event_id, desde desc);

-- Un evento no puede tener dos turnos abiertos a la vez. Es la regla que hace
-- que el historial se pueda leer sin ambiguedad, y ademas protege de que dos
-- cambios casi simultaneos dejen la tabla en un estado imposible.
create unique index if not exists event_moderadores_un_turno_abierto
  on public.event_moderadores (event_id) where hasta is null;

alter table public.event_moderadores enable row level security;

-- Solo lectura, y solo para el admin: es historial de operacion, no algo que
-- la app necesite. El disparador escribe con SECURITY DEFINER, asi que no hace
-- falta ninguna politica de escritura.
drop policy if exists "admins leen el historial de moderadores" on public.event_moderadores;
create policy "admins leen el historial de moderadores"
  on public.event_moderadores for select
  using (public.is_admin());

create or replace function public.registrar_cambio_de_moderador()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- `AFTER UPDATE OF moderator_id` tambien dispara cuando la columna viene en
  -- el SET con el MISMO valor (la app manda la fila entera). Sin esta guarda,
  -- cada toque de pantalla abriria un turno nuevo con el mismo moderador.
  if NEW.moderator_id is not distinct from OLD.moderator_id then
    return NEW;
  end if;

  -- Se cierra el turno que estuviera abierto, sea quien sea.
  update public.event_moderadores
     set hasta = now()
   where event_id = NEW.id
     and hasta is null;

  -- Y se abre el nuevo. Si moderator_id paso a NULL (la mesa se quedo sin
  -- moderador) no se abre ninguno: queda el anterior cerrado y ya.
  if NEW.moderator_id is not null then
    insert into public.event_moderadores (event_id, user_id, desde)
    values (NEW.id, NEW.moderator_id, now());
  end if;

  return NEW;
end;
$function$;

drop trigger if exists trg_registrar_cambio_de_moderador on public.events;
create trigger trg_registrar_cambio_de_moderador
  after update of moderator_id on public.events
  for each row
  execute function public.registrar_cambio_de_moderador();

-- Lo que lee el admin: el historial con nombres, del mas reciente al mas
-- viejo. Una sola llamada, sin depender de que la lista de inscritos ya este
-- cargada en la pantalla.
create or replace function public.admin_get_moderadores(p_event_id uuid)
returns table(user_id uuid, nombre text, desde timestamptz, hasta timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  select m.user_id,
         coalesce(u.name, 'Sin nombre')::text,
         m.desde,
         m.hasta
  from public.event_moderadores m
  left join public.users u on u.id = m.user_id
  where m.event_id = p_event_id
  order by m.desde desc;
end;
$function$;
