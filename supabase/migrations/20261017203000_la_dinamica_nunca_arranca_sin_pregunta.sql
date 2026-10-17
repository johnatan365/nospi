-- 17 de octubre, 3:15 p.m. Las dos mesas del Cafe se quedaron en
-- "Sincronizando la dinamica..." con la gente sentada esperando. Ningun
-- telefono salia de ahi y no habia forma de arreglarlo desde la app.
--
-- Causa: los dos eventos quedaron con game_phase = 'questions' pero
-- current_question = NULL. La pantalla del juego solo se dibuja cuando hay
-- fase Y pregunta:
--
--   // components/GameDynamicsScreen.tsx
--   if (gamePhase === 'questions' && currentQuestion) { ... }
--
-- Sin pregunta cae al bloque final, que es justamente el spinner de
-- "Sincronizando". Es un estado del que no se sale solo.
--
-- Por que no basta con arreglarlo en el cliente: la gente tiene builds viejos
-- instalados y la version web puede quedar cacheada. No se puede obligar a una
-- mesa de ocho personas a actualizar la app en mitad de una cena. La unica
-- capa por la que pasan todos los telefonos, sin importar su version, es la
-- base de datos. Por eso la garantia va aqui.
--
-- Lo que hace el trigger: si algo intenta dejar un evento en fase de preguntas
-- sin pregunta, la rellena en el momento, buscando en cascada:
--   1. la pregunta del evento que corresponde al indice actual
--   2. la primera de ese nivel (por si el indice se paso del final)
--   3. cualquiera del evento, aunque sea de otro nivel
--   4. el banco por defecto (event_id IS NULL)
--   5. una generica, como ultimo recurso
--
-- Preferimos una pregunta imperfecta a una mesa mirando un spinner.

CREATE OR REPLACE FUNCTION public.garantizar_pregunta_actual()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_level text;
  v_idx   int;
  v_texto text;
BEGIN
  -- coalesce a proposito: con game_phase NULL, "NULL NOT IN (...)" da NULL y
  -- el IF no entra, asi que sin esto el trigger se metia en eventos que ni
  -- siquiera han arrancado, borradores incluidos.
  IF coalesce(NEW.game_phase, '') NOT IN ('questions', 'question_active') THEN
    RETURN NEW;
  END IF;

  IF NEW.current_question IS NOT NULL AND btrim(NEW.current_question) <> '' THEN
    RETURN NEW;
  END IF;

  v_level := coalesce(NEW.current_level, NEW.current_question_level, 'divertido');
  v_idx   := greatest(coalesce(NEW.current_question_index, 0), 0);

  SELECT q.question_text INTO v_texto
    FROM public.event_questions q
   WHERE q.event_id = NEW.id AND q.level = v_level
   ORDER BY q.question_order OFFSET v_idx LIMIT 1;

  IF v_texto IS NULL THEN
    SELECT q.question_text INTO v_texto FROM public.event_questions q
     WHERE q.event_id = NEW.id AND q.level = v_level ORDER BY q.question_order LIMIT 1;
  END IF;

  IF v_texto IS NULL THEN
    SELECT q.question_text INTO v_texto FROM public.event_questions q
     WHERE q.event_id = NEW.id ORDER BY q.question_order LIMIT 1;
  END IF;

  IF v_texto IS NULL THEN
    SELECT q.question_text INTO v_texto FROM public.event_questions q
     WHERE q.event_id IS NULL AND q.level = v_level ORDER BY q.question_order LIMIT 1;
  END IF;

  v_texto := coalesce(v_texto, '¿Cuál es tu nombre y a qué te dedicas?');

  NEW.current_question       := v_texto;
  NEW.current_level          := v_level;
  NEW.current_question_level := coalesce(NEW.current_question_level, v_level);
  NEW.questions_started_at   := coalesce(NEW.questions_started_at, now());

  -- Queda en los logs de Postgres para poder investigar que cliente lo hizo.
  RAISE WARNING 'garantizar_pregunta_actual: evento % entro en fase % sin pregunta; relleno nivel % indice %',
    NEW.id, NEW.game_phase, v_level, v_idx;

  RETURN NEW;
END;
$function$;

-- El nombre importa. Los triggers BEFORE de una misma tabla corren en orden
-- alfabetico, y "trg_g..." va antes que "trg_log_question_display_time", que
-- necesita ver la pregunta ya puesta para poder cronometrarla.
DROP TRIGGER IF EXISTS trg_garantizar_pregunta_actual ON public.events;
CREATE TRIGGER trg_garantizar_pregunta_actual
  BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.garantizar_pregunta_actual();
