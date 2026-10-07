-- Aviso automatico de que la videollamada se cierra sola, y como volver.
--
-- POR QUE
-- Google Meet corta las llamadas de 3 o mas personas al cumplir una hora.
-- Las dinamicas de Nospi duran entre 57 y 119 minutos (medido sobre los
-- ultimos eventos), asi que el corte llega casi siempre. Visto desde adentro
-- parece que la app fallo o que el evento se acabo, y la gente no vuelve.
--
-- Avisarlo ANTES lo convierte de falla en intermedio: se sabe que va a pasar y
-- se sabe que hacer. Sale 45 minutos despues de la hora de inicio, con tiempo
-- de sobra antes del corte (la llamada arranca 5-15 min despues de la hora).
alter table public.events
  add column if not exists aviso_fin_llamada_enviado_at timestamptz;

comment on column public.events.aviso_fin_llamada_enviado_at is
  'Cuando se publico en el canal el aviso de que la videollamada se cierra a la hora. NULL = no se ha enviado.';
