-- Secretos que solo usa el servidor. Antes vivian en app_config, que la app y
-- la landing leen con la llave publica, asi que cualquiera podia verlos.
-- Esta tabla no tiene politicas: solo la leen service_role (Edge Functions) y
-- las funciones y crons de la base, que corren como dueno.
create table if not exists public.secretos_servidor (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
alter table public.secretos_servidor enable row level security;
revoke all on public.secretos_servidor from anon, authenticated;

-- Valores NUEVOS generados aqui mismo, para que no queden escritos en ningun
-- archivo: el repo es publico.
insert into public.secretos_servidor (key, value) values
  ('cron_secret',   encode(extensions.gen_random_bytes(32), 'hex')),
  ('noshow_secret', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;
