-- Aviso en el canal del evento, el dia siguiente a las 9 a.m. (Bogota):
-- recuerda que los que asistieron ya quedaron en la comunidad e invita a
-- poner foto de perfil. No se dispara a las 00:05 junto con el cierre del
-- evento a proposito: un mensaje nuevo manda push y sonaria de madrugada.
alter table public.events
  add column if not exists aviso_comunidad_enviado_at timestamptz;

create or replace function public.enviar_aviso_comunidad_post_evento()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  v_conv uuid;
begin
  -- Guard de hora: nunca antes de las 9 a.m. Bogota, aunque el cron se corra a mano.
  if extract(hour from (now() at time zone 'America/Bogota')) < 9 then
    return;
  end if;

  for r in
    select e.id
    from public.events e
    where e.aviso_comunidad_enviado_at is null
      and e.event_status = 'closed'
      -- el dia anterior, con 3 dias de gracia por si el cron estuvo caido
      and (e.date at time zone 'America/Bogota')::date < (now() at time zone 'America/Bogota')::date
      and (e.date at time zone 'America/Bogota')::date >= (now() at time zone 'America/Bogota')::date - 3
      -- solo si alguien de verdad llego: son los unicos que entraron a la comunidad
      and exists (
        select 1 from public.appointments a
        where a.event_id = e.id
          and a.checked_in_at is not null
          and coalesce(a.status, '') <> 'cancelada'
      )
  loop
    select c.id into v_conv
    from public.chat_conversations c
    where c.type = 'channel_event' and c.event_id = r.id
    limit 1;

    if v_conv is not null then
      insert into public.chat_messages (conversation_id, sender_id, content)
      values (
        v_conv,
        '0a6fe4ae-a2dc-4a0d-a9f6-22d82bf403f1',
        '¡Gracias por venir! 🙌' || chr(10) || chr(10) ||
        'Los que estuvieron ya quedaron en la comunidad de Nospi: ahí sigue la conversación con gente de otros eventos, no solo del suyo.' || chr(10) || chr(10) ||
        'Y si le ponen foto a su perfil, la gente de allá sabe con quién está hablando.'
      );
    end if;

    -- Se marca igual si no habia canal, para no reintentarlo cada corrida.
    update public.events set aviso_comunidad_enviado_at = now() where id = r.id;
  end loop;
end;
$function$;