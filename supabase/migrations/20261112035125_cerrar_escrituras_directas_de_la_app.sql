-- Cierra los permisos de escritura directa sobre citas, usuarios y suscripciones.
--
-- Del 4 al 10 de noviembre de 2026 este disparador solo anotaba en
-- escrituras_observadas. Se anotaron 25 escrituras y todas venian del codigo
-- viejo que trae el instalador 1.0.53 antes de aplicar la OTA. Dos de ellas
-- eran un usuario cambiandose su propio saldo a favor desde el celular. El
-- codigo actual reserva, cancela y confirma pagos con funciones SECURITY
-- DEFINER (reservar_evento, cancelar_mi_cita, cambiar_renovacion_suscripcion,
-- borrar_usuario_completo, confirmar-pago-evento con service role), que corren
-- como su dueno y no pasan por este bloqueo.
--
-- Desde aqui, lo que antes se anotaba se RECHAZA con 42501 (PostgREST lo
-- devuelve como 403). Como la excepcion deshace la transaccion, la fila de
-- escrituras_observadas tambien se deshace: el registro de cada rechazo queda
-- en los logs de Postgres (buscar 'escritura directa bloqueada').
--
-- Excepcion deliberada: solo_suscripcion se permite al CREAR la fila propia.
-- El registro web desde /?plan=sub (puerta 2) la manda en true, ver
-- utils/atribucion.ts. Ponerla en true solo restringe al usuario. Cambiarla
-- despues sigue bloqueado.
create or replace function public.trg_observar_escrituras()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  c_cita_libres constant text[] := array['checked_in_at', 'arrival_status', 'location_confirmed',
    'ratings_submitted_at', 'last_seen_at', 'updated_at'];
  c_usuario_sensibles constant text[] := array['virtual_balance', 'reservas_suspendidas_hasta',
    'is_internal', 'solo_suscripcion'];
  v_cols   text[];
  v_fuera  text[];
  v_motivo text;
  v_nuevo  jsonb;
begin
  if current_user not in ('anon', 'authenticated') then
    return coalesce(NEW, OLD);
  end if;
  if public.is_admin() then
    return coalesce(NEW, OLD);
  end if;

  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key) into v_cols
      from jsonb_each(to_jsonb(NEW)) n
      join jsonb_each(to_jsonb(OLD)) o using (key)
     where n.value is distinct from o.value;
    if v_cols is null then
      return NEW;
    end if;
  end if;

  if tg_table_name = 'appointments' then
    if tg_op <> 'UPDATE' then
      v_motivo := 'cita: ' || lower(tg_op) || ' directo';
    else
      select array_agg(c) into v_fuera from unnest(v_cols) c
       where c <> all (c_cita_libres)
         and not (c = 'status' and NEW.status = 'anterior');
      if v_fuera is not null then
        v_motivo := 'cita: columnas fuera de llegada/calificacion: ' || array_to_string(v_fuera, ', ');
      end if;
    end if;

  elsif tg_table_name = 'subscriptions' then
    v_motivo := 'suscripcion: ' || lower(tg_op) || ' directo';

  elsif tg_table_name = 'users' then
    if tg_op = 'UPDATE' then
      select array_agg(c) into v_fuera from unnest(v_cols) c where c = any (c_usuario_sensibles);
      if v_fuera is not null then
        v_motivo := 'usuario: ' || array_to_string(v_fuera, ', ');
      end if;
    elsif tg_op = 'INSERT' then
      v_nuevo := to_jsonb(NEW);
      if auth.uid() is null or NEW.id is distinct from auth.uid() then
        v_motivo := 'usuario: alta de una fila que no es la propia';
      end if;
      select array_agg(c) into v_fuera from unnest(c_usuario_sensibles) c
       where c <> 'solo_suscripcion'
         and v_nuevo ? c
         and v_nuevo -> c not in ('null'::jsonb, '0'::jsonb, 'false'::jsonb);
      if v_fuera is not null then
        v_motivo := concat_ws(' | ', v_motivo, 'usuario: alta con ' || array_to_string(v_fuera, ', '));
      end if;
      v_cols := array(select jsonb_object_keys(v_nuevo));
    else
      v_motivo := 'usuario: borrado directo';
    end if;
  end if;

  if v_motivo is not null then
    -- RAISE LOG queda en los logs de Postgres aunque la excepcion deshaga todo.
    raise log 'escritura directa bloqueada | tabla=% op=% fila=% user=% motivo=%',
      tg_table_name, tg_op, to_jsonb(coalesce(NEW, OLD)) ->> 'id', auth.uid(), v_motivo;
    raise exception using
      errcode = '42501',
      message = 'Esta version de la app esta desactualizada. Cierra la app por completo y vuelve a abrirla.',
      detail  = format('escritura directa bloqueada | tabla=%s op=%s fila=%s user=%s motivo=%s columnas=%s',
                       tg_table_name, tg_op, to_jsonb(coalesce(NEW, OLD)) ->> 'id', auth.uid(), v_motivo,
                       array_to_string(coalesce(v_cols, '{}'), ','));
  end if;
  return coalesce(NEW, OLD);
end;
$function$;
