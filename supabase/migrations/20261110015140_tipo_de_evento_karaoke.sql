-- Nuevo tipo de evento: karaoke. Se agrega a la lista que acepta events.type.
-- Mismo patron que cuando entro 'baile' (25 de octubre de 2026): se reemplaza
-- el CHECK con la lista completa. Aplicar fuera de horario de eventos: el
-- ALTER pide bloqueo exclusivo sobre events.
alter table public.events drop constraint events_type_check;
alter table public.events add constraint events_type_check
  check (type = any (array['bar', 'baile', 'karaoke', 'restaurante', 'caminata', 'cafe', 'bolos', 'virtual']));
