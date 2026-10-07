create table if not exists public.invitaciones_cortesia (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  telefono text not null,
  nombre text,
  fecha_invitacion date,
  evento text,
  respuesta_literal text,
  resultado text not null check (resultado in ('acepto','acepto_pero_cancelo','rechazo_directo','rechazo_temporal','sin_respuesta','nunca_invitado')),
  no_invitar_mas boolean not null default false,
  volver_a_intentar_despues_de date,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists invitaciones_cortesia_telefono_idx on public.invitaciones_cortesia (telefono);
create index if not exists invitaciones_cortesia_user_idx on public.invitaciones_cortesia (user_id);
alter table public.invitaciones_cortesia enable row level security;
comment on table public.invitaciones_cortesia is 'Historial de invitaciones por cortesia enviadas por WhatsApp y su resultado, para aplicar cooldown y no volver a invitar a quien dijo que no o no respondio.';