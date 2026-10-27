-- "Olvide mi contrasena" decia SIEMPRE "revisa tu correo", existiera la cuenta
-- o no. Quien se equivocaba al escribir quedaba esperando un enlace que nunca
-- iba a llegar.
--
-- Paso el 27 de octubre de 2026: una usuaria lo intento cuatro veces y
-- termino escribiendo a soporte. En los registros se ve que las cuatro
-- peticiones respondieron 200 pero ninguna genero el evento de recuperacion,
-- porque el correo que escribia no correspondia a ninguna cuenta.
--
-- EL COSTO, QUE SE ACEPTO A PROPOSITO
-- Decir "ese correo no esta registrado" revela quien tiene cuenta en Nospi.
-- En una app para conocer gente eso es delicado: cualquiera podria averiguar
-- si su ex o un companero de trabajo esta aqui.
--
-- Lo que lo hace aceptable es el limite: a partir de 12 consultas por hora
-- desde el mismo origen, la funcion responde SIEMPRE que si existe. Quien
-- este probando una lista de correos deja de obtener informacion real, y a
-- una persona que se equivoco trece veces solo le vuelve el mensaje generico.
--
-- El correo se guarda en huella (sha256), nunca en claro: esta tabla no tiene
-- por que volverse una lista de los correos de quienes intentaron entrar.

CREATE TABLE IF NOT EXISTS public.consultas_correo (
  id            bigserial PRIMARY KEY,
  ip            text,
  email_hash    text NOT NULL,
  consultado_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS consultas_correo_ip_fecha
  ON public.consultas_correo (ip, consultado_at DESC);

-- Nadie entra a esta tabla desde la app: solo la funcion, que corre con
-- permisos propios. Sin politicas, queda cerrada para todos.
ALTER TABLE public.consultas_correo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.consultas_correo FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.correo_tiene_cuenta(p_email text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_ip    text;
  v_n     integer;
BEGIN
  IF v_email = '' OR position('@' in v_email) = 0 THEN
    RETURN false;
  END IF;

  -- La IP llega en las cabeceras cuando la llamada entra por la API. Desde una
  -- conexion directa a la base no hay cabeceras: ahi todo cuenta en un cajon.
  BEGIN
    v_ip := nullif(split_part(coalesce(
      current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1), '');
  EXCEPTION WHEN others THEN
    v_ip := NULL;
  END;
  v_ip := coalesce(v_ip, 'sin-ip');

  DELETE FROM public.consultas_correo WHERE consultado_at < now() - interval '2 days';

  SELECT count(*) INTO v_n
    FROM public.consultas_correo
   WHERE ip = v_ip AND consultado_at > now() - interval '1 hour';

  -- digest va con el esquema por delante: pgcrypto vive en "extensions" y esta
  -- funcion tiene el search_path fijado en "public", asi que sin el prefijo no
  -- lo encuentra y revienta al ejecutarse. Se probo en vivo: fallaba.
  INSERT INTO public.consultas_correo (ip, email_hash)
  VALUES (v_ip, encode(extensions.digest(v_email, 'sha256'), 'hex'));

  IF v_n >= 12 THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM auth.users u
     WHERE lower(u.email) = v_email AND u.deleted_at IS NULL
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.correo_tiene_cuenta(text) TO anon, authenticated;
