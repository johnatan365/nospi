-- Ciudades que la gente busca y NO existen en la lista (ni como apodo).
-- Es el dato para decidir donde abrir: si veinte personas escriben el mismo
-- municipio, ahi hay demanda. Se guarda solo el texto que escribieron, nada
-- mas.
create table if not exists public.city_search_misses (
  id uuid primary key default gen_random_uuid(),
  texto text not null,
  texto_normalizado text not null,
  contexto text not null default 'registro',
  user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint city_search_misses_texto_len check (char_length(texto) between 2 and 60)
);

create index if not exists city_search_misses_norm_idx
  on public.city_search_misses (texto_normalizado);
create index if not exists city_search_misses_created_idx
  on public.city_search_misses (created_at desc);

alter table public.city_search_misses enable row level security;

-- El registro ocurre ANTES de que exista el usuario, asi que el insert tiene
-- que estar permitido sin sesion. El check de longitud de arriba limita el
-- abuso y no se guarda nada identificable.
drop policy if exists city_search_misses_insert on public.city_search_misses;
create policy city_search_misses_insert
  on public.city_search_misses for insert
  to anon, authenticated
  with check (char_length(texto) between 2 and 60);

drop policy if exists city_search_misses_select on public.city_search_misses;
create policy city_search_misses_select
  on public.city_search_misses for select
  to authenticated
  using (true);