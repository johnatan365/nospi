-- Hora EXACTA en que se acabaron las preguntas.
--
-- Hasta ahora se deducia de question_stats: la ultima pregunta registrada. Pero
-- el tiempo de una pregunta se guarda al pasar a la SIGUIENTE, asi que esa
-- marca es cuando entraron a la ultima, no cuando la cerraron. Medido contra la
-- primera calificacion de los 8 ultimos eventos, se quedaba corta entre 1 y 5
-- minutos.
--
-- Se resuelve con un DISPARADOR y no tocando la app, que es mejor por dos
-- razones: no hace falta build, y funciona igual para quien tenga instalada una
-- version vieja. La app ya escribe el cambio de fase en events; aqui solo se
-- anota cuando ocurre.
alter table public.events
  add column if not exists questions_ended_at timestamptz;

comment on column public.events.questions_ended_at is
  'Momento exacto en que la mesa salio de las preguntas. Lo pone un trigger al cambiar game_phase. NULL en eventos anteriores a esta migracion: para esos se sigue estimando con la ultima pregunta de question_stats.';

create or replace function public.marcar_fin_de_preguntas()
returns trigger language plpgsql as $$
BEGIN
  IF NEW.game_phase IS DISTINCT FROM OLD.game_phase THEN
    -- Salieron de las preguntas: se anota, y solo la primera vez.
    IF NEW.game_phase IN ('closing_intro', 'finished', 'free_phase')
       AND OLD.game_phase IN ('questions', 'question_active', 'level_transition')
       AND NEW.questions_ended_at IS NULL THEN
      NEW.questions_ended_at := now();
    END IF;
    -- Arrancan una tanda nueva: se borra la marca de la partida anterior.
    IF NEW.game_phase IN ('questions', 'question_active')
       AND OLD.game_phase IN ('intro', 'ready', 'rules') THEN
      NEW.questions_ended_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

drop trigger if exists trg_marcar_fin_de_preguntas on public.events;
create trigger trg_marcar_fin_de_preguntas
  before update of game_phase on public.events
  for each row execute function public.marcar_fin_de_preguntas();

-- El cierre prefiere la hora exacta y solo estima si no la hay. Devuelve
-- fin_exacto para poder decirlo en pantalla, en vez de dar por buena una
-- estimacion -- que es justo el error que se corrigio con las cancelaciones.
drop function if exists public.admin_get_cierre_evento(uuid);

create function public.admin_get_cierre_evento(p_event_id uuid)
returns table(
  primer_ingreso timestamptz, fin_dinamica timestamptz, ultima_presencia timestamptz,
  reportaron integer, total integer, siguen_ahi integer, fin_exacto boolean
)
language plpgsql security definer set search_path = public
as $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    (SELECT min(a.checked_in_at) FROM appointments a
      WHERE a.event_id = p_event_id AND a.checked_in_at IS NOT NULL),
    coalesce(
      (SELECT e.questions_ended_at FROM events e WHERE e.id = p_event_id),
      (SELECT max(q.created_at) FROM question_stats q WHERE q.event_id = p_event_id)
    ),
    (SELECT max(a.last_seen_at) FROM appointments a WHERE a.event_id = p_event_id),
    (SELECT count(*)::int FROM appointments a
      WHERE a.event_id = p_event_id AND a.last_seen_at IS NOT NULL),
    (SELECT count(*)::int FROM appointments a
      WHERE a.event_id = p_event_id AND a.status IN ('confirmada','anterior')),
    (SELECT count(*)::int FROM appointments a
      WHERE a.event_id = p_event_id AND a.last_seen_at > now() - interval '12 minutes'),
    (SELECT e.questions_ended_at IS NOT NULL FROM events e WHERE e.id = p_event_id);
END;
$$;

revoke all on function public.admin_get_cierre_evento(uuid) from public, anon;
grant execute on function public.admin_get_cierre_evento(uuid) to authenticated;
