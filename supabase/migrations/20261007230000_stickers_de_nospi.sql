-- Stickers propios de Nospi: catalogo que el admin sube y todos pueden mandar.
--
-- POR QUE UN BUCKET APARTE Y NO chat-media
-- Un sticker lo manda muchisima gente, muchas veces. Si el archivo viviera en
-- chat-media, la limpieza mensual (get_expired_chat_media) lo borraria a los 30
-- dias y TODOS los mensajes que lo usaron quedarian rotos de golpe -- no solo
-- los viejos. El catalogo no es media de una conversacion: es contenido de la
-- app, como el logo.
--
-- COMO SE MANDA
-- Igual que un GIF de GIPHY: el mensaje guarda la URL publica en media_path con
-- media_kind = 'image'. La limpieza ya se salta todo lo que empiece por http
-- (ver 20260917055048_excluir_gifs_externos_de_la_limpieza), asi que los
-- stickers quedan fuera sin tocar esa funcion.
--
-- Y OJO con media_kind: tiene que seguir siendo 'image'. Si alguien lo cambia a
-- 'sticker' para distinguirlos, se caen de esa consulta -- da igual aqui porque
-- son URL, pero rompe la regla en el dia que alguien suba un sticker al bucket
-- del chat. La advertencia ya esta puesta en mediaFileInfo.

-- ── paquetes ────────────────────────────────────────────────────────────────

create table if not exists public.sticker_packs (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  orden      integer not null default 0,
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.sticker_packs is
  'Paquetes de stickers de Nospi. El orden es el que ve la gente en las pestañas del selector.';

-- ── stickers ────────────────────────────────────────────────────────────────

create table if not exists public.stickers (
  id           uuid primary key default gen_random_uuid(),
  pack_id      uuid not null references public.sticker_packs(id) on delete cascade,
  url          text not null,
  storage_path text,
  etiqueta     text,
  orden        integer not null default 0,
  activo       boolean not null default true,
  created_at   timestamptz not null default now(),
  constraint stickers_url_unica unique (url)
);

comment on column public.stickers.url is
  'URL publica del archivo. Es lo que se guarda en chat_messages.media_path al mandarlo.';
comment on column public.stickers.storage_path is
  'Ruta dentro del bucket `stickers`, para poder borrar el archivo al quitar el sticker.';
comment on column public.stickers.etiqueta is
  'Para que sirve el sticker ("ya voy", "brindis"). Se usa de texto alternativo, no se muestra.';

create index if not exists idx_stickers_pack on public.stickers(pack_id, orden) where activo;

-- ── quien ve y quien toca ───────────────────────────────────────────────────
--
-- Leer: cualquiera con sesion, y solo lo activo. El catalogo no es secreto pero
-- tampoco tiene por que estar abierto a anonimos.
-- Escribir: solo admin.

alter table public.sticker_packs enable row level security;
alter table public.stickers      enable row level security;

drop policy if exists "todos ven los paquetes activos" on public.sticker_packs;
create policy "todos ven los paquetes activos" on public.sticker_packs
  for select to authenticated using (activo or public.is_admin());

drop policy if exists "solo el admin toca los paquetes" on public.sticker_packs;
create policy "solo el admin toca los paquetes" on public.sticker_packs
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "todos ven los stickers activos" on public.stickers;
create policy "todos ven los stickers activos" on public.stickers
  for select to authenticated using (activo or public.is_admin());

drop policy if exists "solo el admin toca los stickers" on public.stickers;
create policy "solo el admin toca los stickers" on public.stickers
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ── el bucket ───────────────────────────────────────────────────────────────
--
-- Publico a proposito: el sticker se pinta dentro de un mensaje y firmar un
-- enlace por cada sticker de cada mensaje seria una peticion por burbuja.
-- Mismo criterio que las fotos de perfil.
--
-- 512 KB es de sobra para un PNG de 512x512 con transparencia, y es un tope que
-- evita que alguien suba una foto de 8 MB por equivocacion: un sticker pesado
-- se siente lento justo en el momento en que tiene que sentirse instantaneo.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('stickers', 'stickers', true, 524288, array['image/png','image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 524288,
      allowed_mime_types = array['image/png','image/webp'];

drop policy if exists "cualquiera ve los stickers" on storage.objects;
create policy "cualquiera ve los stickers" on storage.objects
  for select using (bucket_id = 'stickers');

drop policy if exists "solo el admin sube stickers" on storage.objects;
create policy "solo el admin sube stickers" on storage.objects
  for insert to authenticated with check (bucket_id = 'stickers' and public.is_admin());

drop policy if exists "solo el admin borra stickers" on storage.objects;
create policy "solo el admin borra stickers" on storage.objects
  for delete to authenticated using (bucket_id = 'stickers' and public.is_admin());

-- ── el paquete inicial ──────────────────────────────────────────────────────

insert into public.sticker_packs (nombre, orden)
select 'Nospi', 1
where not exists (select 1 from public.sticker_packs);
