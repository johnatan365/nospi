-- Resumen de TODOS los eventos que estan corriendo ahora, en una sola consulta.
--
-- El panel de En vivo miraba un evento a la vez y tocaba cambiar el selector
-- para ver los otros. Cuando hay varios a la misma hora (tres videollamadas, o
-- un cafe partido en dos mesas) eso obliga a ir y volver justo en el momento de
-- mas afan. Con esto el admin pinta un muro con todos de un golpe, sin disparar
-- cuatro consultas por evento cada diez segundos.
--
-- "En vivo" = no cerrado y dentro de la ventana: desde 45 minutos antes de la
-- hora de inicio hasta 3 horas despues. Los dos numeros estan aqui y en ningun
-- otro lado, para poder moverlos sin tocar la app.

create or replace function public.admin_get_eventos_en_vivo()
returns table (
  id uuid,
  name text,
  subtitulo text,
  type text,
  date timestamptz,
  "time" text,
  event_status text,
  game_phase text,
  current_question_index integer,
  current_level text,
  moderator_id uuid,
  moderator_name text,
  inscritos integer,
  en_sala integer,
  en_llamada integer,
  sala_hombres integer,
  sala_mujeres integer,
  llamada_hombres integer,
  llamada_mujeres integer
)
language sql
security definer
set search_path to 'public'
as $function$
  select
    e.id, e.name, e.subtitulo, e.type, e.date, e.time, e.event_status,
    e.game_phase, e.current_question_index, e.current_level,
    e.moderator_id, mu.name as moderator_name,
    coalesce(r.inscritos, 0)::int,
    coalesce(r.en_sala, 0)::int,
    coalesce(r.en_llamada, 0)::int,
    coalesce(r.sala_hombres, 0)::int,
    coalesce(r.sala_mujeres, 0)::int,
    coalesce(r.llamada_hombres, 0)::int,
    coalesce(r.llamada_mujeres, 0)::int
  from public.events e
  left join public.users mu on mu.id = e.moderator_id
  left join lateral (
    select
      count(*) as inscritos,
      -- La sala incluye a quien ya entro a la llamada: nadie llega al Meet sin
      -- pasar por ahi, y si no se contara saldria gente "desapareciendo" de la
      -- sala al entrar.
      count(*) filter (where a.location_confirmed or a.checked_in_at is not null) as en_sala,
      count(*) filter (where a.checked_in_at is not null
                          or (a.arrival_status is not null and a.arrival_status <> 'pending')) as en_llamada,
      count(*) filter (where (a.location_confirmed or a.checked_in_at is not null) and u.gender = 'hombre') as sala_hombres,
      count(*) filter (where (a.location_confirmed or a.checked_in_at is not null) and u.gender = 'mujer') as sala_mujeres,
      count(*) filter (where (a.checked_in_at is not null
                          or (a.arrival_status is not null and a.arrival_status <> 'pending')) and u.gender = 'hombre') as llamada_hombres,
      count(*) filter (where (a.checked_in_at is not null
                          or (a.arrival_status is not null and a.arrival_status <> 'pending')) and u.gender = 'mujer') as llamada_mujeres
    from public.appointments a
    join public.users u on u.id = a.user_id
    where a.event_id = e.id
      and coalesce(a.status, '') <> 'cancelada'
  ) r on true
  where public.is_admin()
    and e.event_status is distinct from 'closed'
    and e.date is not null
    and now() >= e.date - interval '45 minutes'
    and now() <= e.date + interval '3 hours'
  order by e.date asc, e.name asc;
$function$;

grant execute on function public.admin_get_eventos_en_vivo() to authenticated;