create table if not exists public.user_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  url text not null,
  storage_path text,
  orden smallint not null default 0,
  created_at timestamptz not null default now(),
  constraint user_photos_orden_rango check (orden >= 0 and orden <= 5),
  constraint user_photos_user_orden_unico unique (user_id, orden) deferrable initially deferred
);

create index if not exists user_photos_user_idx on public.user_photos(user_id, orden);

alter table public.user_photos enable row level security;

comment on table public.user_photos is
  'Fotos del perfil de cada persona. La de orden 0 es la foto de perfil y se copia sola a users.profile_photo_url.';