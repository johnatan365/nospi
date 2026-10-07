-- Cada quien entra a la comunidad de SU ciudad, o a ninguna.
--
-- El problema: meter_en_comunidad tomaba la PRIMERA comunidad que encontrara
-- ("limit 1"), sin mirar de donde era la persona. Con los eventos virtuales
-- abiertos a todo el pais, al cerrar el primero habrian caido en "Comunidad
-- Nospi Medellin" gente de Bogota, Barranquilla, Cali y Villavicencio.
--
-- Por que importa aunque hoy sean 7 personas: esa comunidad no es para charlar,
-- es donde proponen PLANES ("dia de sol con piscina", "o picnic"). Eso solo
-- sirve si pueden verse. Quien esta en Barranquilla ve planes a los que nunca
-- podra ir, y quien esta en Medellin recibe propuestas que no puede atender.
-- El grupo no se satura: se vuelve ignorable, y de eso no se vuelve.
--
-- Se decidio a proposito NO crear comunidades nuevas todavia. De fuera de
-- Medellin hay 7 inscritos repartidos en 4 ciudades: cualquier grupo que se
-- abriera hoy nace muerto. Cuando una ciudad junte gente, se crea su
-- comunidad con `city` y la regla la empieza a usar sola, sin tocar codigo.
alter table public.chat_conversations
  add column if not exists city text;

comment on column public.chat_conversations.city is
  'Solo para type=community: de que ciudad es. meter_en_comunidad mete a cada persona en la de SU ciudad. NULL en una comunidad significa que no recibe a nadie automaticamente.';

-- La unica que existe hoy.
update public.chat_conversations
set city = 'Medellín'
where type = 'community' and city is null;

-- Compara ciudades sin que una tilde o una mayuscula dejen a alguien afuera.
-- Las ciudades salen de una lista fija en la app y hoy vienen bien escritas,
-- pero si eso cambia no puede romperse quien entra a que grupo.
create or replace function public.misma_ciudad(a text, b text)
returns boolean
language sql
immutable
as $$
  select a is not null and b is not null
     and translate(lower(trim(a)), 'áéíóúüñ', 'aeiouun')
       = translate(lower(trim(b)), 'áéíóúüñ', 'aeiouun');
$$;

create or replace function public.meter_en_comunidad(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_conv uuid;
  v_ciudad text;
begin
  select u.city into v_ciudad from public.users u where u.id = p_user_id;

  -- Sin ciudad no hay a donde mandarlo. Antes entraba igual a la de Medellin.
  if v_ciudad is null or trim(v_ciudad) = '' then
    return false;
  end if;

  -- La comunidad de SU ciudad. Si su ciudad no tiene, no entra a ninguna: es
  -- mejor que quedar en un grupo donde se organizan planes a 500 km.
  select c.id into v_conv
  from public.chat_conversations c
  where c.type = 'community'
    and public.misma_ciudad(c.city, v_ciudad)
  limit 1;

  if v_conv is null then return false; end if;

  -- Si se salio a proposito, o lo saco el admin, no se le vuelve a meter.
  if exists (
    select 1 from public.comunidad_salidas s
    where s.conversation_id = v_conv and s.user_id = p_user_id
  ) then
    return false;
  end if;

  -- Ojo: aqui NO se filtra por is_internal. Esa marca es solo para las
  -- estadisticas de plata; usarla para decidir quien entra al grupo fue lo que
  -- dejo al dueno por fuera.
  insert into public.chat_participants (conversation_id, user_id)
  values (v_conv, p_user_id)
  on conflict (conversation_id, user_id) do nothing;

  return true;
end;
$function$;