-- Zonas de la ciudad donde a la persona le gustaria que fuera el evento.
-- Se pregunta junto con el idioma, al inscribirse, y SOLO en eventos
-- presenciales (en una videollamada no tiene sentido).
--
-- OJO: esto NO decide donde es el evento. Es un dato de demanda, igual que
-- city_search_misses: sirve para saber a que zonas vale la pena abrir. A la
-- persona se le dice eso en la misma pantalla para que no se frustre si marca
-- una zona donde Nospi todavia no hace nada.
alter table public.appointments
  add column if not exists zonas_preferidas text[];

-- Texto libre cuando marca "Otra". Es lo que de verdad da el dato nuevo:
-- en vez de adivinar una lista de barrios, la gente escribe el suyo.
alter table public.appointments
  add column if not exists zona_otra text;

comment on column public.appointments.zonas_preferidas is
  'Zonas preferidas al inscribirse: {poblado}, {laureles}, {envigado}, {otra}. Preferencia, NO el lugar del evento. NULL = inscripciones anteriores a la pregunta.';

comment on column public.appointments.zona_otra is
  'Texto libre de la zona cuando marco "Otra". Maximo 40 caracteres desde la app.';

alter table public.appointments
  drop constraint if exists appointments_zona_otra_largo;
alter table public.appointments
  add constraint appointments_zona_otra_largo
  check (zona_otra is null or char_length(zona_otra) <= 60);
