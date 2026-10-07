-- "En Vivo" deja de cortar a las 3 horas: el evento se queda hasta que se
-- CIERRE de verdad.
--
-- Antes la ventana era (45 min antes, 3 h despues del inicio). El cierre, en
-- cambio, lo hace auto_close_past_events con el cron de las 12:05 a.m. de
-- Bogota (o el admin a mano). Entre esas dos cosas habia un hueco en el que el
-- evento seguia 'published' y no aparecia en ninguna parte: ni en vivo, ni en
-- cerrados. Para un cafe de las 3 p.m. eran SEIS horas invisibles.
--
-- Y ese hueco caia justo donde mas estorba: al cerrar, flag_event_no_shows
-- marca como inasistencia a todo el que no quedo 'on_time' y registra las
-- amonestaciones. O sea que la ventana invisible era la unica ventana para
-- corregir la asistencia antes de que se apliquen las sanciones.
--
-- Ahora la unica salida es que el evento este cerrado (ya lo filtra el
-- event_status de abajo). El techo de 36 horas es solo un seguro: si el cron de
-- cierre se cae una noche, el evento se ve un dia y medio mas --que es una
-- señal util-- y no se queda ahi para siempre.
--
-- Tambien cambia el orden DENTRO de los que estan en vivo: antes era por fecha
-- ascendente, asi que los que ya terminaron salian ARRIBA y el que de verdad
-- esta corriendo quedaba al final. Ahora los mas recientes van primero.
create or replace function public.admin_get_panel_en_vivo()
 returns table(id uuid, name text, subtitulo text, type text, date timestamp with time zone, "time" text, event_status text, estado text, minutos_para_empezar integer, max_participants integer, game_phase text, current_question_index integer, current_level text, moderator_id uuid, moderator_name text, inscritos integer, inscritos_hombres integer, inscritos_mujeres integer, en_sala integer, en_llamada integer, sala_hombres integer, sala_mujeres integer, llamada_hombres integer, llamada_mujeres integer)
 language sql
 security definer
 set search_path to 'public'
as $function$
  select
    e.id, e.name, e.subtitulo, e.type, e.date, e.time, e.event_status,
    case when now() >= e.date - interval '45 minutes' then 'vivo' else 'proximo' end,
    (extract(epoch from (e.date - now())) / 60)::int,
    e.max_participants,
    e.game_phase, e.current_question_index, e.current_level,
    e.moderator_id, mu.name,
    coalesce(r.inscritos,0)::int, coalesce(r.ins_h,0)::int, coalesce(r.ins_m,0)::int,
    coalesce(r.en_sala,0)::int, coalesce(r.en_llamada,0)::int,
    coalesce(r.sala_h,0)::int, coalesce(r.sala_m,0)::int,
    coalesce(r.llam_h,0)::int, coalesce(r.llam_m,0)::int
  from public.events e
  left join public.users mu on mu.id = e.moderator_id
  left join lateral (
    select
      count(*) as inscritos,
      count(*) filter (where u.gender = 'hombre') as ins_h,
      count(*) filter (where u.gender = 'mujer') as ins_m,
      count(*) filter (where a.location_confirmed or a.checked_in_at is not null) as en_sala,
      count(*) filter (where a.checked_in_at is not null or (a.arrival_status is not null and a.arrival_status <> 'pending')) as en_llamada,
      count(*) filter (where (a.location_confirmed or a.checked_in_at is not null) and u.gender='hombre') as sala_h,
      count(*) filter (where (a.location_confirmed or a.checked_in_at is not null) and u.gender='mujer') as sala_m,
      count(*) filter (where (a.checked_in_at is not null or (a.arrival_status is not null and a.arrival_status <> 'pending')) and u.gender='hombre') as llam_h,
      count(*) filter (where (a.checked_in_at is not null or (a.arrival_status is not null and a.arrival_status <> 'pending')) and u.gender='mujer') as llam_m
    from public.appointments a
    join public.users u on u.id = a.user_id
    where a.event_id = e.id and coalesce(a.status,'') <> 'cancelada'
  ) r on true
  where public.is_admin()
    and e.event_status is distinct from 'closed'
    and e.date is not null
    and now() >= e.date - interval '24 hours'
    -- Seguro contra un cron de cierre caido; la salida normal es el cierre.
    and now() <= e.date + interval '36 hours'
  order by
    case when now() >= e.date - interval '45 minutes' then 0 else 1 end,
    -- En vivo: lo mas reciente arriba (lo que de verdad esta corriendo).
    -- Proximos: lo mas cercano arriba.
    case when now() >= e.date - interval '45 minutes' then e.date end desc nulls last,
    case when now() <  e.date - interval '45 minutes' then e.date end asc nulls last,
    e.name asc;
$function$;