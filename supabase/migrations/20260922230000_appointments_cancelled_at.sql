-- Cuando alguien cancela no queda registro de CUANDO. Se pone status='cancelada'
-- y nada mas: de las 108 canceladas que habia al 22 de septiembre de 2026, 105
-- tenian updated_at identico a created_at, o sea que ese campo tampoco se toca.
-- Esas 108 se quedan sin fecha porque el dato nunca existio y no se puede deducir.
--
-- Se marca con un trigger y no editando los puntos donde se cancela, porque hoy
-- son cuatro (la app, el admin, admin_sacar_del_evento_modo y lo que venga) y
-- basta que uno se quede por fuera para que el dato vuelva a ser incompleto.
-- Con el trigger da igual quien haga el UPDATE.

ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

COMMENT ON COLUMN public.appointments.cancelled_at IS
  'Cuando la cita paso a cancelada. La llena un trigger. NULL en las canceladas anteriores al 22/09/2026, cuando el dato no se guardaba.';

CREATE OR REPLACE FUNCTION public.trg_marcar_cancelacion()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'cancelada' AND NEW.cancelled_at IS NULL THEN
      NEW.cancelled_at := now();
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelada' AND OLD.status IS DISTINCT FROM 'cancelada' THEN
    NEW.cancelled_at := now();

  -- Sale de cancelada: se limpia. Pasa de verdad — admin_mover_cita reactiva una
  -- cita cancelada cuando alguien se devuelve a un evento donde ya habia estado,
  -- y dejarle la fecha vieja la haria ver cancelada en la pantalla nueva.
  ELSIF NEW.status IS DISTINCT FROM 'cancelada' AND OLD.status = 'cancelada' THEN
    NEW.cancelled_at := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_appointments_cancelled_at ON public.appointments;
CREATE TRIGGER trg_appointments_cancelled_at
  BEFORE INSERT OR UPDATE OF status ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.trg_marcar_cancelacion();
