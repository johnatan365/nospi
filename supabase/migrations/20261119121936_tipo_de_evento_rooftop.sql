-- Nuevo tipo de evento: rooftop. Se agrega a la lista que acepta events.type.
-- El primero es la Alborada del 30 de noviembre de 2026; la categoria queda
-- para todos los rooftops que vengan.
alter table public.events drop constraint events_type_check;
alter table public.events add constraint events_type_check
  check (type = any (array['bar', 'baile', 'karaoke', 'rooftop', 'restaurante', 'caminata', 'cafe', 'bolos', 'virtual']));
