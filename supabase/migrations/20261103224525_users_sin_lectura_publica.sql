-- "Allow phone check" dejaba a cualquiera, sin iniciar sesion, leer todas las
-- columnas de todos los usuarios (correo, telefono, fecha de nacimiento...).
-- Solo la usaba el paso del telefono del registro, que ahora pregunta con
-- telefono_ya_registrado(). Las versiones viejas de la app no se rompen: su
-- consulta devuelve "no existe" y la regla unica users_phone_key frena el
-- telefono repetido al final del registro, con el aviso que la app ya muestra.
drop policy if exists "Allow phone check" on public.users;
