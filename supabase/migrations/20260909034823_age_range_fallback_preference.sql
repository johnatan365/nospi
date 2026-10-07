-- Additive change. Existing users remain undecided; no automatic postponements.
alter table public.users
  add column if not exists age_range_fallback text,
  add column if not exists age_range_confirmed_at timestamptz;

alter table public.users add constraint users_age_range_fallback_valid
  check (age_range_fallback is null or age_range_fallback in ('attend', 'postpone'));

comment on column public.users.age_range_fallback is
  'Explicit age-group preference: attend outside the chosen range, or postpone with at least one day notice and coordinate the new date. NULL means not answered.';
comment on column public.users.age_range_confirmed_at is
  'Client-reported time of explicit range/fallback confirmation; not an authorization or security field.';
