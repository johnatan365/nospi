-- Evento de videollamada: un tipo nuevo y el enlace del Meet.
--
-- El enlace va en una columna PROPIA, no en maps_link, a proposito. maps_link
-- lo imprimen como texto el correo de la vispera, el del mismo dia y los dos
-- WhatsApp equivalentes: si el Meet viviera ahi, saldria escrito en un correo,
-- se reenviaria por WhatsApp y se entraria sin pasar por la app. Y entrar por
-- la app es justamente lo que registra la asistencia. Con una columna nueva
-- ninguna plantilla existente puede filtrarlo por accidente, porque ninguna
-- la conoce.

alter table public.events drop constraint if exists events_type_check;
alter table public.events add constraint events_type_check
  check (type = any (array['bar','restaurante','caminata','cafe','bolos','virtual']));

alter table public.events add column if not exists meet_link text;

comment on column public.events.meet_link is
  'Enlace de la videollamada (Google Meet) para eventos type=virtual. NO se envia '
  'por correo ni WhatsApp: solo se abre desde el boton dentro de la app, y ese '
  'boton es el que registra checked_in_at.';
