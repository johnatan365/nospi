-- Cualquiera, sin iniciar sesion, podia leer quien califico a quien y a que
-- eventos fue cada persona. Los usuarios siguen viendo lo de SU evento con las
-- politicas que ya existian ("Users can view participants of their events",
-- "Users can view ratings for their events"); el admin, con estas nuevas.
drop policy if exists "Allow all to read event_ratings" on public.event_ratings;
drop policy if exists "Allow all to read event_participants" on public.event_participants;

create policy "admin lee todas las calificaciones" on public.event_ratings
  for select to authenticated using (public.is_admin());

create policy "admin lee toda la asistencia" on public.event_participants
  for select to authenticated using (public.is_admin());
