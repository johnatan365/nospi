alter table public.event_questions
  add column if not exists applies_to text not null default 'todos';
alter table public.event_questions
  drop constraint if exists event_questions_applies_to_check;
alter table public.event_questions
  add constraint event_questions_applies_to_check
  check (applies_to in ('todos', 'virtual', 'presencial'));