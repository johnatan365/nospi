create table if not exists public.redes_interacciones (
  id bigint generated always as identity primary key,
  creada_en timestamptz not null default now(),
  red text not null check (red in ('facebook', 'instagram')),
  accion text not null check (accion in ('responder', 'dm', 'ocultar', 'eliminar', 'like', 'error')),
  objeto_id text not null default '',
  autor text,
  texto_original text,
  texto_enviado text,
  resultado text not null default 'ok' check (resultado in ('ok', 'error')),
  detalle jsonb
);

comment on table public.redes_interacciones is
  'Cada respuesta, DM, ocultamiento o borrado hecho en Facebook/Instagram por la funcion redes-sociales, con su resultado. Sirve de memoria entre sesiones para no responder dos veces y para revisar que se dijo.';

create index if not exists redes_interacciones_objeto_idx
  on public.redes_interacciones (objeto_id);
create index if not exists redes_interacciones_fecha_idx
  on public.redes_interacciones (creada_en desc);

alter table public.redes_interacciones enable row level security;