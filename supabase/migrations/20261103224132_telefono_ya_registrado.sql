-- El paso del telefono en el registro leia la tabla users sin sesion, y para
-- eso existia una politica que dejaba a cualquiera leer TODOS los usuarios.
-- Esta funcion responde solo si/no, y lleva el mismo limite por IP que
-- correo_tiene_cuenta (comparten la tabla de consultas).
create or replace function public.telefono_ya_registrado(p_telefonos text[])
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tels text[];
  v_ip   text;
  v_n    integer;
begin
  -- La app manda el mismo numero en hasta 3 formatos (+57..., 57..., 300...).
  select array_agg(distinct btrim(t)) into v_tels
  from unnest(coalesce(p_telefonos, '{}'::text[])) t
  where btrim(coalesce(t, '')) <> '';

  if v_tels is null or array_length(v_tels, 1) > 5 then
    return false;
  end if;

  begin
    v_ip := nullif(split_part(coalesce(
      current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1), '');
  exception when others then
    v_ip := null;
  end;
  v_ip := coalesce(v_ip, 'sin-ip');

  delete from public.consultas_correo where consultado_at < now() - interval '2 days';

  select count(*) into v_n
    from public.consultas_correo
   where ip = v_ip and consultado_at > now() - interval '1 hour';

  -- email_hash guarda aqui el hash del telefono, con prefijo para no mezclarlo.
  insert into public.consultas_correo (ip, email_hash)
  values (v_ip, encode(extensions.digest('tel:' || v_tels[1], 'sha256'), 'hex'));

  -- Pasado el limite se responde "no existe" (al reves que con el correo): asi
  -- nunca se le bloquea el registro a alguien real en un wifi compartido. Si el
  -- numero si existia, la regla unica users_phone_key lo frena al final del
  -- registro y la app ya muestra ese aviso.
  if v_n >= 12 then
    return false;
  end if;

  return exists (select 1 from public.users u where u.phone = any(v_tels));
end;
$$;

revoke all on function public.telefono_ya_registrado(text[]) from public;
grant execute on function public.telefono_ya_registrado(text[]) to anon, authenticated;
