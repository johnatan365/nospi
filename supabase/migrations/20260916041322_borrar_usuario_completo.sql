-- Borrado TOTAL de una persona, en un solo lugar.
--
-- Por que existe: hasta hoy el borrado se hacia con un simple
-- `delete from users where id = ...` desde la funcion delete-user-account, sin
-- mirar si habia fallado. Y fallaba: cuatro tablas apuntan a users con
-- ON DELETE NO ACTION, o sea que BLOQUEAN el borrado. Resultado: se borraba la
-- cuenta de acceso pero el perfil quedaba vivo. Habia 8 perfiles fantasma asi,
-- contando en las estadisticas y saliendo en las listas del admin.
--
-- Esta funcion suelta esos cuatro amarres antes de borrar y devuelve un
-- resumen de lo que hizo, para que quien la llame pueda mostrarlo o registrarlo.
--
-- Quien puede llamarla: la propia persona (borrando su cuenta desde el perfil)
-- o un admin (desde la pestana de Usuarios). Nadie mas.

create or replace function public.borrar_usuario_completo(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_admin        boolean := public.is_admin();
  v_es_uno_mismo boolean := (auth.uid() = p_user_id);
  v_correo       text;
  v_nombre       text;
  v_pagos        int := 0;
  v_mensajes     int := 0;
  v_eventos      int := 0;
  v_encuestas    int := 0;
begin
  if p_user_id is null then
    raise exception 'Falta el usuario a borrar.';
  end if;

  if not (v_admin or v_es_uno_mismo) then
    raise exception 'No tienes permiso para borrar esta cuenta.';
  end if;

  -- La cuenta de sistema (la que firma los avisos de Nospi) no se borra nunca:
  -- si desapareciera, todos los mensajes automaticos quedarian sin remitente.
  if p_user_id = '00000000-0000-0000-0000-000000000099'::uuid then
    raise exception 'Esa es la cuenta del sistema y no se puede borrar.';
  end if;

  -- Un admin tampoco se borra desde aca, ni a si mismo ni a otro. Se quita
  -- primero de la tabla de admins a proposito, para que no pase por accidente.
  if exists (select 1 from public.admins where user_id = p_user_id) then
    raise exception 'Es una cuenta de administrador. Quitale primero el rol de admin.';
  end if;

  select u.email, u.name into v_correo, v_nombre
  from public.users u where u.id = p_user_id;

  if v_correo is null and not exists (select 1 from public.users where id = p_user_id) then
    raise exception 'Ese usuario ya no existe.';
  end if;

  select count(*) into v_mensajes  from public.chat_messages     where sender_id = p_user_id;
  select count(*) into v_eventos   from public.event_participants where user_id  = p_user_id;

  -- ── Los cuatro amarres que bloqueaban el borrado ─────────────────────────

  -- 1. Intentos de pago: el movimiento se CONSERVA pero se queda sin dueno.
  --    Monto, fecha y numero de transaccion siguen ahi para cuadrar cuentas con
  --    la pasarela; de la persona no queda ni el id.
  update public.payment_attempts set user_id = null where user_id = p_user_id;
  get diagnostics v_pagos = row_count;

  -- 2. Registro de correos de promocion: es solo una bitacora de envios, no
  --    tiene valor contable y ademas guarda el correo de la persona. Se borra.
  delete from public.promo_wednesday_email_log where user_id = p_user_id;

  -- 3. Encuestas que haya creado. El mensaje que las contiene se va de todas
  --    formas al borrar sus mensajes, asi que dejar la encuesta suelta no
  --    serviria de nada.
  delete from public.chat_polls where created_by = p_user_id;
  get diagnostics v_encuestas = row_count;

  -- 4. Puntero de "a quien le toca leer la pregunta" en un evento en curso.
  --    Es un dato de momento, no historia: se deja vacio.
  update public.events set current_question_starter_id = null
  where current_question_starter_id = p_user_id;

  -- ── Y ahora si, el perfil. En cascada se lleva mensajes, reacciones,
  --    participaciones, citas, matches, afinidades, calificaciones, encuestas
  --    votadas, suscripciones, cobros, strikes, tokens de notificacion,
  --    redenciones de promo y actividad de plataforma.
  delete from public.users where id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'nombre', v_nombre,
    'email', v_correo,
    'mensajes_borrados', v_mensajes,
    'eventos_borrados', v_eventos,
    'encuestas_borradas', v_encuestas,
    'pagos_anonimizados', v_pagos
  );
end;
$$;

revoke all on function public.borrar_usuario_completo(uuid) from public;
grant execute on function public.borrar_usuario_completo(uuid) to authenticated, service_role;

comment on function public.borrar_usuario_completo(uuid) is
  'Borra TODO lo personal de un usuario. Conserva el intento de pago sin dueno para contabilidad. La llama la persona desde su perfil o un admin desde la pestana de Usuarios. No borra la cuenta de acceso: de eso se encarga la funcion delete-user-account.';