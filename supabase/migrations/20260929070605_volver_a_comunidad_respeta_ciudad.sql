-- volver_a_comunidad era la puerta de atras.
--
-- Recibe el id del grupo desde el cliente y solo comprobaba que fuera una
-- comunidad, que no lo hubiera sacado el admin y que hubiera asistido a un
-- evento cerrado. No miraba la ciudad: cualquiera podia llamarla con el id de
-- la comunidad de Medellin y entrar, justo lo que acaba de cerrarse por el
-- camino normal.
create or replace function public.volver_a_comunidad(p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ciudad_grupo text;
  v_ciudad_persona text;
begin
  select c.city into v_ciudad_grupo
  from public.chat_conversations c
  where c.id = p_conversation_id and c.type = 'community';

  if not found then
    raise exception 'no es la comunidad' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.comunidad_salidas s
    where s.conversation_id = p_conversation_id and s.user_id = auth.uid() and s.lo_saco_admin
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- Solo quien ya asistio a un evento que ademas ya cerro.
  if not exists (
    select 1 from public.appointments a
    join public.events e on e.id = a.event_id
    where a.user_id = auth.uid()
      and a.checked_in_at is not null
      and coalesce(a.status, '') <> 'cancelada'
      and e.event_status = 'closed'
  ) then
    raise exception 'todavia no has asistido a un evento cerrado' using errcode = '42501';
  end if;

  -- Y solo a la comunidad de SU ciudad, igual que por el camino normal.
  select u.city into v_ciudad_persona from public.users u where u.id = auth.uid();
  if not public.misma_ciudad(v_ciudad_grupo, v_ciudad_persona) then
    raise exception 'esa comunidad no es de tu ciudad' using errcode = '42501';
  end if;

  delete from public.comunidad_salidas
  where conversation_id = p_conversation_id and user_id = auth.uid();

  insert into public.chat_participants (conversation_id, user_id)
  values (p_conversation_id, auth.uid())
  on conflict (conversation_id, user_id) do nothing;

  return true;
end;
$function$;