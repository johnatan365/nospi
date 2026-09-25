-- Ranking de preguntas: las eliminadas siguen apareciendo (por estadistica),
-- pero marcadas con en_banco = false, para que el admin sepa que ya no tiene
-- que hacer nada con ellas. Antes se veian igual que las vivas, con su boton
-- "Eliminar", y parecia que seguian saliendo.
drop function if exists public.admin_get_question_ranking();
create function public.admin_get_question_ranking()
 returns table(question_text text, level text, up integer, down integer, mesas integer, avg_seconds integer, seg_por_persona numeric, puntaje integer, veredicto text, en_banco boolean)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  WITH universo AS (
    SELECT DISTINCT q.question_text, q.level
    FROM public.event_questions q WHERE q.event_id IS NULL
    UNION
    SELECT t.question_text, NULL FROM public.question_stats_summary t
    WHERE NOT EXISTS (SELECT 1 FROM public.event_questions q2
                      WHERE q2.event_id IS NULL AND q2.question_text = t.question_text)
    UNION
    -- Votadas que ya no estan en el banco (ni tienen tiempos): tambien salen.
    SELECT v.question_text, NULL FROM public.question_votes_summary v
    WHERE NOT EXISTS (SELECT 1 FROM public.event_questions q3
                      WHERE q3.event_id IS NULL AND q3.question_text = v.question_text)
      AND NOT EXISTS (SELECT 1 FROM public.question_stats_summary t2
                      WHERE t2.question_text = v.question_text)
  ),
  base AS (
    SELECT u.question_text, u.level,
           COALESCE(v.up,0) AS up, COALESCE(v.down,0) AS down,
           COALESCE(t.mesas,0) AS mesas,
           COALESCE(t.avg_seconds,0) AS avg_seconds,
           COALESCE(t.avg_seconds_persona,0) AS seg_persona,
           EXISTS (SELECT 1 FROM public.event_questions b
                   WHERE b.event_id IS NULL AND b.question_text = u.question_text) AS en_banco
    FROM universo u
    LEFT JOIN public.question_votes_summary v ON v.question_text = u.question_text
    LEFT JOIN public.question_stats_summary t ON t.question_text = u.question_text
  ),
  calc AS (
    SELECT b.*, (b.up + b.down) AS n,
      -- Limite inferior de Wilson: 5 de 5 pesa mas que 1 de 1.
      CASE WHEN (b.up + b.down) = 0 THEN 0::numeric
        ELSE ((b.up + 1.9208)/(b.up+b.down)
              - 1.96*sqrt((b.up*b.down)::numeric/(b.up+b.down) + 0.9604)/(b.up+b.down))
             / (1 + 3.8416/(b.up+b.down))
      END AS voto,
      LEAST(b.seg_persona / 30.0, 1.0) AS tiempo,   -- 30 s por persona = excelente
      b.mesas / (b.mesas + 3.0) AS confianza        -- las mesas son confianza, no calidad
    FROM base b
  )
  SELECT c.question_text, c.level, c.up, c.down, c.mesas, c.avg_seconds, c.seg_persona,
    GREATEST(ROUND((0.55*GREATEST(c.voto,0) + 0.45*c.tiempo) * c.confianza * 100), 0)::int AS puntaje,
    CASE
      WHEN c.n >= 3 AND c.down > c.up THEN 'eliminar'
      WHEN c.mesas >= 5 AND c.seg_persona < 6 AND c.up <= c.down THEN 'eliminar'
      WHEN c.up >= 3 AND c.down = 0 THEN 'dejar'
      WHEN c.mesas >= 5 AND c.seg_persona >= 20 THEN 'dejar'
      WHEN c.mesas >= 3 OR c.n >= 3 THEN 'observar'
      ELSE 'sin_datos'
    END AS veredicto,
    c.en_banco
  FROM calc c
  ORDER BY 8 DESC, c.mesas DESC;
$function$;
grant execute on function public.admin_get_question_ranking() to authenticated, service_role;

-- Borrar una pregunta ya no toca los eventos que ya pasaron aunque no esten
-- "closed": ahi es historial de lo que se jugo, y borrarlo falseaba el ranking.
create or replace function public.admin_delete_question_by_text(p_question_text text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  v_global int := 0;
  v_eventos int := 0;
  v_fijada boolean := false;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo el equipo de Nospi puede eliminar preguntas';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.event_questions
    WHERE question_text = p_question_text AND is_pinned = true
  ) INTO v_fijada;

  DELETE FROM public.event_questions
  WHERE question_text = p_question_text AND event_id IS NULL;
  GET DIAGNOSTICS v_global = ROW_COUNT;

  DELETE FROM public.event_questions q
  USING public.events e
  WHERE q.event_id = e.id
    AND q.question_text = p_question_text
    AND e.event_status <> 'closed'
    AND e.date > now();
  GET DIAGNOSTICS v_eventos = ROW_COUNT;

  RETURN jsonb_build_object(
    'banco', v_global,
    'eventos_abiertos', v_eventos,
    'estaba_fijada', v_fijada
  );
END $function$;
