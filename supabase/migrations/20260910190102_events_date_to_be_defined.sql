alter table public.events alter column date drop not null;
alter table public.events add constraint events_undated_no_start check (date is not null or start_time is null);
comment on column public.events.date is 'Scheduled event instant. NULL means Fecha sin definir and has no start time.';
