-- users.age se calcula UNA sola vez, en app/onboarding/birthdate.tsx, cuando la
-- persona se registra. Despues nadie la vuelve a tocar: no hay trigger ni tarea
-- que la recalcule. Cada cumpleanos que pasa la deja un ano atrasada y nunca se
-- corrige sola.
--
-- Al 22 de septiembre de 2026: 291 de 3.095 personas con fecha de nacimiento
-- (9,4%) tenian la edad mal, 290 de ellas por exactamente un ano. Ninguna estaba
-- adelantada, que es la firma de este problema.
--
-- Importa porque casi todo el panel lee la columna guardada: la tabla de
-- Usuarios, los CSV, los codigos promocionales, y las consultas con que se arman
-- los grupos y las listas de invitacion. El unico que ya salia bien era el modal
-- de asistentes, que calcula desde birthdate — por eso los dos numeros no
-- cuadraban.
--
-- No gatea nada: en la app del usuario la edad solo se muestra en el perfil.
-- Corregirla no deja a nadie por fuera de ningun evento.

CREATE OR REPLACE FUNCTION public.recalcular_edades()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_filas integer;
BEGIN
  UPDATE public.users u
  SET age = EXTRACT(YEAR FROM AGE(u.birthdate))::integer
  WHERE u.birthdate IS NOT NULL
    AND u.age IS DISTINCT FROM EXTRACT(YEAR FROM AGE(u.birthdate))::integer;

  GET DIAGNOSTICS v_filas = ROW_COUNT;
  RETURN v_filas;
END;
$function$;

REVOKE ALL ON FUNCTION public.recalcular_edades() FROM public, anon, authenticated;

-- 00:10 hora de Bogota, justo despues de medianoche, para que a quien cumple
-- anos le quede bien desde el mismo dia. Va detras de auto-close-past-events,
-- que corre a las 00:05, para no pisarse.
SELECT cron.schedule(
  'recalcular-edades-daily',
  '10 5 * * *',
  $$SELECT public.recalcular_edades();$$
);
