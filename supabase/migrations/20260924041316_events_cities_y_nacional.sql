-- Un evento puede verse en varias ciudades, o en todo el pais.
-- La columna vieja `city` se deja intacta a proposito: las apps ya
-- publicadas en las tiendas la siguen leyendo, y romperla dejaria sin
-- eventos a quien no haya actualizado.
alter table public.events add column if not exists cities text[] not null default '{}'::text[];
alter table public.events add column if not exists nacional boolean not null default false;

-- Normalizar la tilde: `events.city` decia "Medellin" y `users.city` dice
-- "Medellín". Un filtro con = mostraria cero eventos a todo el mundo.
update public.events set city = 'Medellín' where city = 'Medellin';

-- Cada evento existente arranca con su unica ciudad dentro de la lista.
update public.events
set cities = array[btrim(city)]
where cities = '{}'::text[] and city is not null and btrim(city) <> '';

create index if not exists events_cities_idx on public.events using gin (cities);