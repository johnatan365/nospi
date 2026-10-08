-- Idiomas que la persona acepta hablar en la mesa de ESE evento.
-- Se pregunta al inscribirse (pantalla nueva entre el detalle del evento y el
-- pago) y lo usa el armado de mesas para sentar junta a la gente que escogio
-- lo mismo. Es un arreglo porque el bilingue marca los dos: {es}, {en} o {es,en}.
alter table public.appointments
  add column if not exists idiomas_mesa text[];

comment on column public.appointments.idiomas_mesa is
  'Idiomas que la persona acepta hablar en la mesa: {es}, {en} o {es,en}. NULL = inscripciones viejas, anteriores a la pregunta.';

-- Precio del cupo para quien ve la app en ingles, en dolares enteros.
-- Vive en app_config (y no en el codigo) para poder moverlo durante el test
-- sin esperar un build nuevo de iOS/Android.
insert into public.app_config (key, value, description)
values ('event_price_usd', '19', 'Precio del cupo en USD para quien ve la app en ingles. Entero, sin decimales.')
on conflict (key) do nothing;
