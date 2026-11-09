-- Rastro de pasos y errores de la app.
--
-- Por que existe: el 8 de noviembre de 2026 alguien reporto que la pantalla de
-- recuperar contrasena se quedaba en negro en Android. En el servidor se veia
-- que el correo SI salia — tres veces, porque ella no veia confirmacion y
-- volvia a intentar. Del lado del celular no habia ningun rastro, y ademas no
-- era un crash de React (el ErrorBoundary habria mostrado su pantalla), asi
-- que no quedaba nada que leer. Se termino publicando por OTA un arreglo a
-- ciegas que no sirvio.
--
-- Esta tabla existe para que no haya que adivinar: que pantalla, que paso,
-- que version y que dispositivo.

CREATE TABLE IF NOT EXISTS public.errores_app (
  id          bigserial PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  tipo        text NOT NULL DEFAULT 'error' CHECK (tipo IN ('error','rastro')),
  user_id     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  pantalla    text,
  mensaje     text NOT NULL,
  stack       text,
  plataforma  text,
  version_app text,
  version_so  text,
  extra       jsonb,
  revisado    boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS errores_app_created_at_idx
  ON public.errores_app (created_at DESC);
CREATE INDEX IF NOT EXISTS errores_app_sin_revisar_idx
  ON public.errores_app (created_at DESC) WHERE tipo = 'error' AND NOT revisado;

ALTER TABLE public.errores_app ENABLE ROW LEVEL SECURITY;

-- Insertar: cualquiera, incluso sin sesion. Los errores de login y de
-- registro ocurren antes de que exista usuario y son justo los mas caros.
-- El abuso se acota con los limites de tamano del trigger, no cerrando la
-- puerta y quedandose ciego donde mas duele.
DROP POLICY IF EXISTS "cualquiera puede dejar rastro" ON public.errores_app;
CREATE POLICY "cualquiera puede dejar rastro"
  ON public.errores_app FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Leer: solo admins. Un stack puede arrastrar datos de la persona.
DROP POLICY IF EXISTS "solo admins leen el rastro" ON public.errores_app;
CREATE POLICY "solo admins leen el rastro"
  ON public.errores_app FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "solo admins marcan revisado" ON public.errores_app;
CREATE POLICY "solo admins marcan revisado"
  ON public.errores_app FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.recortar_error_app()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  NEW.mensaje     := left(coalesce(NEW.mensaje, ''), 2000);
  NEW.stack       := left(NEW.stack, 8000);
  NEW.pantalla    := left(NEW.pantalla, 200);
  NEW.plataforma  := left(NEW.plataforma, 60);
  NEW.version_app := left(NEW.version_app, 40);
  NEW.version_so  := left(NEW.version_so, 120);

  IF NEW.mensaje = '' THEN
    RAISE EXCEPTION 'Un rastro sin mensaje no sirve de nada';
  END IF;

  -- El user_id sale de la sesion, no de lo que mande el celular: asi nadie
  -- puede atribuirle errores a otra persona.
  NEW.user_id := auth.uid();

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_recortar_error_app ON public.errores_app;
CREATE TRIGGER trg_recortar_error_app
  BEFORE INSERT ON public.errores_app
  FOR EACH ROW EXECUTE FUNCTION public.recortar_error_app();

COMMENT ON TABLE public.errores_app IS
  'Rastro de pasos y errores de la app. PRIMER sitio donde mirar cuando alguien reporta una pantalla en blanco o negro, antes de tocar codigo.';
