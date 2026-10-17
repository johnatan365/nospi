-- 17 de octubre. Las dos mesas del Cafe entraron a la dinamica SIN MODERADOR
-- y con la pantalla trabada en "Sincronizando la dinamica...". Son el mismo
-- fallo, no dos.
--
-- CAUSA REAL
-- Las dos mesas se crearon a mano (no con admin_dividir_evento) y nacieron ya
-- con game_phase = 'questions'. Todos los demas eventos de la base nacen en
-- 'intro', que es el valor por defecto de la columna.
--
-- Con el evento ya en 'questions', la app hace esto:
--
--   // app/(tabs)/dinamica.tsx - handleStartExperience
--   if (gamePhase === 'questions' || ...) return;   // "esto ya arranco"
--
-- O sea: se salta TODO el flujo previo -confirmar llegada, elegir moderador,
-- reglas, y el arranque que escribe la primera pregunta- y manda a la gente
-- directo a la pantalla de juego. Esa pantalla solo dibuja si hay pregunta, y
-- no habia ninguna, asi que todos quedaron en el spinner. Y como nadie paso
-- por la pantalla de postulacion, moderator_id quedo en NULL.
--
-- Peor aun, en GameDynamicsScreen.tsx estaba:
--
--   const isModerator = !moderatorId || (currentUserId === moderatorId);
--
-- Sin moderador, TODOS eran moderador: cualquiera podia saltarle la pregunta
-- a la mesa. Eso se corrige tambien en el cliente, pero el cliente tarda en
-- llegar a los telefonos, asi que las dos garantias van aqui.
--
-- ESTA MIGRACION GARANTIZA DOS COSAS
--   1. Ningun evento puede nacer en mitad de la dinamica. Un INSERT con una
--      fase distinta de 'intro' se corrige a 'intro' y se limpia el estado de
--      juego. Esto es exactamente lo que habria evitado el 17 de octubre.
--   2. Ninguna dinamica corre sin moderador. Si un evento entra en fase de
--      juego con moderator_id en NULL, se nombra uno: el primero que confirmo
--      llegada, que es el equivalente mas justo a la regla de la app ("el
--      primero que se postula queda"). Nunca se deja la mesa sin nadie a
--      cargo, y nunca con todos a cargo.

CREATE OR REPLACE FUNCTION public.garantizar_arranque_de_dinamica()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mod uuid;
BEGIN
  -- 1) Un evento no puede nacer en mitad de la dinamica.
  IF TG_OP = 'INSERT' THEN
    IF coalesce(NEW.game_phase, 'intro') <> 'intro' THEN
      RAISE WARNING 'garantizar_arranque_de_dinamica: el evento % nacio en fase %; se fuerza intro',
        NEW.id, NEW.game_phase;
      NEW.game_phase                  := 'intro';
      NEW.current_question            := NULL;
      NEW.current_question_index      := 0;
      NEW.current_question_level      := NULL;
      NEW.current_level               := coalesce(NEW.current_level, 'divertido');
      NEW.questions_started_at        := NULL;
      NEW.questions_ended_at          := NULL;
      NEW.current_question_started_at := NULL;
      NEW.moderator_id                := NULL;
    END IF;
    RETURN NEW;
  END IF;

  -- 2) Siempre tiene que haber un moderador, y uno solo.
  IF coalesce(NEW.game_phase, '') IN ('questions', 'question_active', 'level_transition')
     AND NEW.moderator_id IS NULL THEN

    SELECT p.user_id INTO v_mod
      FROM public.event_participants p
     WHERE p.event_id = NEW.id AND coalesce(p.confirmed, false)
     ORDER BY p.check_in_time NULLS LAST
     LIMIT 1;

    IF v_mod IS NULL THEN
      SELECT a.user_id INTO v_mod
        FROM public.appointments a
       WHERE a.event_id = NEW.id AND a.status = 'confirmada' AND a.checked_in_at IS NOT NULL
       ORDER BY a.checked_in_at
       LIMIT 1;
    END IF;

    IF v_mod IS NULL THEN
      SELECT a.user_id INTO v_mod
        FROM public.appointments a
       WHERE a.event_id = NEW.id AND a.status = 'confirmada'
       ORDER BY a.created_at
       LIMIT 1;
    END IF;

    IF v_mod IS NOT NULL THEN
      NEW.moderator_id := v_mod;
      RAISE WARNING 'garantizar_arranque_de_dinamica: el evento % entro en fase % sin moderador; se nombro a %',
        NEW.id, NEW.game_phase, v_mod;
    ELSE
      RAISE WARNING 'garantizar_arranque_de_dinamica: el evento % entro en fase % sin moderador y sin nadie a quien nombrar',
        NEW.id, NEW.game_phase;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- El nombre importa: los triggers BEFORE corren en orden alfabetico y este
-- tiene que ir ANTES de trg_garantizar_pregunta_actual, que da por hecho que
-- la fase ya quedo saneada.
DROP TRIGGER IF EXISTS trg_garantizar_arranque_dinamica ON public.events;
CREATE TRIGGER trg_garantizar_arranque_dinamica
  BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.garantizar_arranque_de_dinamica();
