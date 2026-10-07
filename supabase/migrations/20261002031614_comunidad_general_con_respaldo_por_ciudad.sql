-- Una sola comunidad para todo el pais, sin perder el modelo por ciudad.
--
-- Antes: meter_en_comunidad buscaba la comunidad de la ciudad de la persona y,
-- si su ciudad no tenia una, no entraba a ninguna. Con una sola comunidad en el
-- pais (la de Medellin) eso dejaba por fuera a todo el que no fuera de alli:
-- gente que ya pago y ya vivio una videollamada, sin ningun lugar al que volver
-- cuando la llamada se acaba.
--
-- Ahora hay dos escalones: la comunidad de TU ciudad si existe, y si no, la
-- general (la que no tiene ciudad). Hoy solo existe la general, asi que entran
-- todos a la misma sala. El dia que haya comunidad de Bogota, los de Bogota
-- empiezan a caer ahi solos y nadie tiene que migrar a mano.

comment on column public.chat_conversations.city is
  'Solo para type=community: de que ciudad es. meter_en_comunidad mete a cada persona en la de SU ciudad; si su ciudad no tiene, entra a la general, que es la que tiene city NULL.';

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

  -- 1) La comunidad de SU ciudad, si existe.
  if v_ciudad is not null and btrim(v_ciudad) <> '' then
    select c.id into v_conv
    from public.chat_conversations c
    where c.type = 'community'
      and c.city is not null
      and public.misma_ciudad(c.city, v_ciudad)
    limit 1;
  end if;

  -- 2) Respaldo: la comunidad general, la que no tiene ciudad. Aqui caen los de
  --    ciudades que todavia no tienen comunidad propia y los que no declararon
  --    ciudad. En cuanto su ciudad tenga la suya, manda el paso 1.
  if v_conv is null then
    select c.id into v_conv
    from public.chat_conversations c
    where c.type = 'community' and c.city is null
    limit 1;
  end if;

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