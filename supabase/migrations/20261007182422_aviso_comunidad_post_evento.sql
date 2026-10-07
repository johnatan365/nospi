-- Aviso en el canal del evento, el dia siguiente: "ya quedaron en la comunidad".
--
-- YA APLICADA EN PRODUCCION. Otra sesion la corrio directo en Supabase el 7 de
-- octubre de 2026 y quedo registrada en supabase_migrations.schema_migrations
-- como 20261007182422 y 20261007182505. Este archivo existe para que el repo
-- diga lo mismo que la base, no para volver a correrla: el `cron.schedule` de
-- abajo chocaria con el job que ya existe. La definicion de la funcion es la
-- que devuelve pg_get_functiondef en produccion, copiada tal cual.
--
-- Dos decisiones del diseño que no hay que "arreglar" sin querer:
--
--   · Sale a las 9 a.m. y NO a las 00:05 junto con el cierre del evento. Un
--     mensaje nuevo dispara push, y a esa hora sonaria de madrugada.
--   · Dice "Los que estuvieron ya quedaron en la comunidad", en plural y no
--     "como estuviste": en el canal del evento estan TODOS los inscritos,
--     incluido quien no aparecio.
--
-- Solo publica si alguien hizo check-in, porque son los unicos que entran a la
-- comunidad (ver trg_comunidad_al_cerrar_evento).

alter table public.events
  add column if not exists aviso_comunidad_enviado_at timestamptz;

CREATE OR REPLACE FUNCTION public.enviar_aviso_comunidad_post_evento()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

-- 5 14 * * * UTC = 9:05 a.m. en Bogota.
-- OJO: ya existe en produccion. Si se corre este archivo en una base que ya lo
-- tenga, cron.schedule actualiza el job existente en vez de duplicarlo, pero
-- igual no hace falta correrlo.
select cron.schedule('aviso-comunidad-post-evento-daily', '5 14 * * *',
  'SELECT public.enviar_aviso_comunidad_post_evento();');
