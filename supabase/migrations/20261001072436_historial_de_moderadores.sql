create table if not exists public.event_moderadores (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  user_id    uuid not null references public.users(id)  on delete cascade,
  desde      timestamptz not null default now(),
  hasta      timestamptz
);

comment on table public.event_moderadores is
  'Un renglon por turno de moderador. hasta IS NULL es el turno vigente. Lo llena solo el disparador trg_registrar_cambio_de_moderador; nadie escribe aqui a mano.';

create index if not exists event_moderadores_evento_idx
  on public.event_moderadores (event_id, desde desc);

create unique index if not exists event_moderadores_un_turno_abierto
  on public.event_moderadores (event_id) where hasta is null;

alter table public.event_moderadores enable row level security;

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
  if NEW.moderator_id is not distinct from OLD.moderator_id then
    return NEW;
  end if;

  update public.event_moderadores
     set hasta = now()
   where event_id = NEW.id
     and hasta is null;

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