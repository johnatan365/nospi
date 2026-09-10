-- Cuanto duro la dinamica: de la primera pregunta a la ultima.
--
-- El inicio se guarda con el mismo disparador que ya anota el final. Para los
-- eventos anteriores se estima: la primera fila de question_stats sabe cuanto
-- duro esa pregunta, asi que restando su duracion a su hora de registro se
-- llega al arranque. Comprobado contra los 8 ultimos eventos: da horas
-- coherentes, siempre despues del primer ingreso.
alter table public.events
  add column if not exists questions_started_at timestamptz;

comment on column public.events.questions_started_at is
  'Momento exacto en que la mesa arranco con la primera pregunta. Lo pone un trigger al cambiar game_phase. NULL en eventos anteriores: para esos se estima desde question_stats.';

create or replace function public.marcar_fin_de_preguntas()
returns trigger language plpgsql as $$
BEGIN
  IF NEW.game_phase IS DISTINCT FROM OLD.game_phase THEN
    -- Salieron de las preguntas: se anota el final, solo la primera vez.
    IF NEW.game_phase IN ('closing_intro', 'finished', 'free_phase')
       AND OLD.game_phase IN ('questions', 'question_active', 'level_transition')
       AND NEW.questions_ended_at IS NULL THEN
      NEW.questions_ended_at := now();
    END IF;
    -- Arrancan: se anota el inicio y se borra el final de una tanda anterior.
    IF NEW.game_phase IN ('questions', 'question_active')
       AND OLD.game_phase IN ('intro', 'ready', 'rules') THEN
      NEW.questions_started_at := now();
      NEW.questions_ended_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

drop function if exists public.admin_get_cierre_evento(uuid);

create function public.admin_get_cierre_evento(p_event_id uuid)
returns table(
  primer_ingreso timestamptz,
  inicio_dinamica timestamptz, inicio_exacto boolean,
  fin_dinamica timestamptz, fin_exacto boolean,
  preguntas integer,
  ultima_presencia timestamptz,
  reportaron integer, total integer, siguen_ahi integer
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
      (SELECT e.questions_started_at FROM events e WHERE e.id = p_event_id),
      -- Estimacion: hora en que se registro la primera pregunta menos lo que
      -- esa pregunta duro.
      (SELECT q.created_at - make_interval(secs => q.seconds)
         FROM question_stats q WHERE q.event_id = p_event_id
         ORDER BY q.created_at ASC LIMIT 1)
    ),
    (SELECT e.questions_started_at IS NOT NULL FROM events e WHERE e.id = p_event_id),
    coalesce(
      (SELECT e.questions_ended_at FROM events e WHERE e.id = p_event_id),
      (SELECT max(q.created_at) FROM question_stats q WHERE q.event_id = p_event_id)
    ),
    (SELECT e.questions_ended_at IS NOT NULL FROM events e WHERE e.id = p_event_id),
    (SELECT count(*)::int FROM question_stats q WHERE q.event_id = p_event_id),
    (SELECT max(a.last_seen_at) FROM appointments a WHERE a.event_id = p_event_id),
    (SELECT count(*)::int FROM appointments a
      WHERE a.event_id = p_event_id AND a.last_seen_at IS NOT NULL),
    (SELECT count(*)::int FROM appointments a
      WHERE a.event_id = p_event_id AND a.status IN ('confirmada','anterior')),
    (SELECT count(*)::int FROM appointments a
      WHERE a.event_id = p_event_id AND a.last_seen_at > now() - interval '12 minutes');
END;
$$;

revoke all on function public.admin_get_cierre_evento(uuid) from public, anon;
grant execute on function public.admin_get_cierre_evento(uuid) to authenticated;
