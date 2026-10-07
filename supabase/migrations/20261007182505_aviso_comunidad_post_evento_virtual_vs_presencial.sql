create or replace function public.enviar_aviso_comunidad_post_evento()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  v_conv uuid;
  v_saludo text;
begin
  if extract(hour from (now() at time zone 'America/Bogota')) < 9 then
    return;
  end if;

  for r in
    select e.id, e.type
    from public.events e
    where e.aviso_comunidad_enviado_at is null
      and e.event_status = 'closed'
      and (e.date at time zone 'America/Bogota')::date < (now() at time zone 'America/Bogota')::date
      and (e.date at time zone 'America/Bogota')::date >= (now() at time zone 'America/Bogota')::date - 3
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
      -- A una videollamada no se "viene".
      v_saludo := case when r.type = 'virtual'
                       then '¡Gracias por conectarse! 🙌'
                       else '¡Gracias por venir! 🙌' end;

      insert into public.chat_messages (conversation_id, sender_id, content)
      values (
        v_conv,
        '0a6fe4ae-a2dc-4a0d-a9f6-22d82bf403f1',
        v_saludo || chr(10) || chr(10) ||
        'Los que estuvieron ya quedaron en la comunidad de Nospi: ahí sigue la conversación con gente de otros eventos, no solo del suyo.' || chr(10) || chr(10) ||
        'Y si le ponen foto a su perfil, la gente de allá sabe con quién está hablando.'
      );
    end if;

    update public.events set aviso_comunidad_enviado_at = now() where id = r.id;
  end loop;
end;
$function$;
