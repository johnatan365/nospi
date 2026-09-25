-- A qué tipo de evento aplica cada pregunta del banco.
--   'todos'      → cualquier evento (lo de siempre)
--   'virtual'    → solo videollamadas (p. ej. "Carrera por la casa", que no
--                  tiene sentido en una cena)
--   'presencial' → solo eventos en persona
-- Al sortear las preguntas de un evento, el admin descarta las que no aplican
-- a su tipo ANTES de poner las fijadas y llenar con azar. Así una pregunta
-- "solo videollamada" + fijada sale siempre en su posición en todas las
-- videollamadas, aunque se re-sortee, y nunca cae en una cena o unos bolos.
alter table public.event_questions
  add column if not exists applies_to text not null default 'todos';

alter table public.event_questions
  drop constraint if exists event_questions_applies_to_check;
alter table public.event_questions
  add constraint event_questions_applies_to_check
  check (applies_to in ('todos', 'virtual', 'presencial'));
