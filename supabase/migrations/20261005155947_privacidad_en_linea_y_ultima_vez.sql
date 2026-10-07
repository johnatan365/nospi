-- "En linea" y "ultima vez", con sus dos interruptores.
--
-- El "en linea" NO vive aqui: va por Realtime Presence, que es efimero y no
-- escribe ni una fila. Lo unico que hace falta en la base es el interruptor,
-- porque quien lo tenga apagado simplemente no se anuncia en el canal.
--
-- La "ultima vez" si necesita guardarse. Se escribe AL SALIR de la app (o al
-- mandarla al fondo), no cada minuto: con 3.483 usuarios, cada minuto serian
-- millones de escrituras al mes; al salir son unas pocas por persona al dia.

alter table public.users
  add column if not exists last_seen_at timestamptz,
  add column if not exists mostrar_en_linea boolean not null default true,
  add column if not exists mostrar_ultima_vez boolean not null default true;

comment on column public.users.last_seen_at is
  'Ultima vez que la persona estuvo con la app abierta. Lo escribe tocar_ultima_vez() al salir, y SOLO si mostrar_ultima_vez esta en true.';
comment on column public.users.mostrar_en_linea is
  'Si esta en false, el cliente no se anuncia en el canal de presencia: nadie lo ve en linea. Y por reciprocidad, el tampoco ve a los demas.';
comment on column public.users.mostrar_ultima_vez is
  'Si esta en false no se guarda ni se muestra su ultima vez. Apagar mostrar_en_linea apaga esta tambien (lo hace guardar_privacidad).';

-- ── Apuntar la ultima vez ───────────────────────────────────────────────────
-- Si tiene el interruptor apagado no se escribe nada: no se lleva registro de
-- la actividad de quien pidio no mostrarla.
create or replace function public.tocar_ultima_vez()
returns void
language plpgsql security definer set search_path to 'public'
as $function$
begin
  update public.users
  set last_seen_at = now()
  where id = auth.uid()
    and mostrar_ultima_vez = true;
end;
$function$;

-- ── Leer la ultima vez de otros, con reciprocidad ──────────────────────────
-- Devuelve la fecha SOLO si el otro la muestra Y quien pregunta tambien la
-- muestra. Esa segunda condicion es la que impide esconderse y mirar, y va en
-- el servidor justamente para que no dependa de que el cliente se porte bien.
create or replace function public.get_ultima_vez(p_user_ids uuid[])
returns table(user_id uuid, last_seen_at timestamptz)
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_yo_muestro boolean;
begin
  if auth.uid() is null then
    return;
  end if;

  select u.mostrar_ultima_vez into v_yo_muestro
  from public.users u where u.id = auth.uid();

  if coalesce(v_yo_muestro, true) = false then
    return;   -- si yo la escondo, no veo la de nadie
  end if;

  return query
  select u.id, u.last_seen_at
  from public.users u
  where u.id = any(p_user_ids)
    and u.id <> auth.uid()
    and u.mostrar_ultima_vez = true
    and u.last_seen_at is not null;
end;
$function$;

-- ── Guardar los dos interruptores ──────────────────────────────────────────
-- Apagar "en linea" apaga tambien "ultima vez": dejar esconder el ahora pero
-- mostrar el antes no protege nada, con mirar dos veces se deduce lo mismo.
-- La regla va aqui y no solo en la pantalla, para que valga aunque la llamada
-- venga de otro lado.
create or replace function public.guardar_privacidad(
  p_en_linea boolean,
  p_ultima_vez boolean
)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update public.users
  set mostrar_en_linea = coalesce(p_en_linea, true),
      mostrar_ultima_vez = case
        when coalesce(p_en_linea, true) = false then false
        else coalesce(p_ultima_vez, true)
      end,
      -- Al apagarla se borra lo que hubiera: no tiene sentido conservar un
      -- dato que ya nadie puede ver, y si la vuelve a encender debe empezar
      -- de cero y no revelar donde estuvo mientras la tenia apagada.
      last_seen_at = case
        when coalesce(p_en_linea, true) = false or coalesce(p_ultima_vez, true) = false
        then null else last_seen_at end
  where id = auth.uid();
end;
$function$;

revoke all on function public.tocar_ultima_vez() from public, anon;
revoke all on function public.get_ultima_vez(uuid[]) from public, anon;
revoke all on function public.guardar_privacidad(boolean, boolean) from public, anon;
grant execute on function public.tocar_ultima_vez() to authenticated;
grant execute on function public.get_ultima_vez(uuid[]) to authenticated;
grant execute on function public.guardar_privacidad(boolean, boolean) to authenticated;