-- Nuevo tipo de evento: escape (Escape Room). Se agrega a la lista que acepta
-- events.type. El primero es el del 13 de diciembre de 2026; la categoria queda
-- para todos los escape rooms que vengan.
alter table public.events drop constraint events_type_check;
alter table public.events add constraint events_type_check
  check (type = any (array['bar', 'baile', 'karaoke', 'rooftop', 'escape', 'restaurante', 'caminata', 'cafe', 'bolos', 'virtual']));
