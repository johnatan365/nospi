-- Bitacora de lo que se responde en Facebook e Instagram desde la funcion
-- redes-sociales.
--
-- Hasta ahora la memoria de "a este ya le respondi" era el propio estado del
-- comentario en Meta: oculto en Facebook, o borrado en Instagram. Eso obliga a
-- destruir informacion solo para acordarse, y no dice nunca QUE se contesto ni
-- si el envio fallo. Esta tabla guarda eso aparte, y asi otro chat (u otro dia)
-- puede retomar sin releer toda la bandeja ni arriesgarse a contestar dos veces.

create table if not exists public.redes_interacciones (
  id bigint generated always as identity primary key,
  creada_en timestamptz not null default now(),
  red text not null check (red in ('facebook', 'instagram')),
  accion text not null check (accion in ('responder', 'dm', 'ocultar', 'eliminar', 'like', 'error')),
  -- id del comentario, o del destinatario cuando el DM va a un hilo ya abierto.
  objeto_id text not null default '',
  autor text,
  texto_original text,
  texto_enviado text,
  resultado text not null default 'ok' check (resultado in ('ok', 'error')),
  detalle jsonb
);

comment on table public.redes_interacciones is
  'Cada respuesta, DM, ocultamiento o borrado hecho en Facebook/Instagram por la funcion redes-sociales, con su resultado. Sirve de memoria entre sesiones para no responder dos veces y para revisar que se dijo.';

-- La consulta normal es "que se le hizo a este comentario" y "que paso en los
-- ultimos dias". Un indice por cada una.
create index if not exists redes_interacciones_objeto_idx
  on public.redes_interacciones (objeto_id);
create index if not exists redes_interacciones_fecha_idx
  on public.redes_interacciones (creada_en desc);

-- Sin politicas a proposito: solo la service role (la funcion edge y el admin)
-- entra aca. Ningun usuario de la app tiene nada que ver con esta tabla.
alter table public.redes_interacciones enable row level security;
