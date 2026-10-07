-- Programa de referidos de Nospi.
-- Quien invita gana saldo cuando su invitado PAGA (no cuando se registra).
-- El monto sale de app_config.referral_reward_cop.

insert into public.app_config (key, value, description)
values ('referral_reward_cop', '15000',
        'Saldo en COP que recibe quien invita cuando su invitado paga su primer evento')
on conflict (key) do nothing;

alter table public.users add column if not exists referral_code text;

create unique index if not exists users_referral_code_key
  on public.users (referral_code) where referral_code is not null;

-- Alfabeto sin caracteres que se confunden al dictar: sin 0/O, sin 1/I/L.
create or replace function public.generar_codigo_referido()
returns text language plpgsql as $f1$
declare
  alfabeto constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  intento text; i int;
begin
  loop
    intento := '';
    for i in 1..7 loop
      intento := intento || substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1);
    end loop;
    exit when not exists (select 1 from public.users where referral_code = intento);
  end loop;
  return intento;
end;
$f1$;

create or replace function public.trg_asignar_codigo_referido()
returns trigger language plpgsql as $f2$
begin
  if new.referral_code is null then
    new.referral_code := public.generar_codigo_referido();
  end if;
  return new;
end;
$f2$;

drop trigger if exists trg_users_referral_code on public.users;
create trigger trg_users_referral_code before insert on public.users
  for each row execute function public.trg_asignar_codigo_referido();

-- Fila por fila a proposito: en un UPDATE masivo los codigos recien puestos no
-- son visibles para el chequeo de unicidad de las filas siguientes.
do $bf$
declare u record;
begin
  for u in select id from public.users where referral_code is null loop
    update public.users set referral_code = public.generar_codigo_referido() where id = u.id;
  end loop;
end;
$bf$;

create table if not exists public.referrals (
  id             uuid primary key default gen_random_uuid(),
  referrer_id    uuid not null references public.users(id) on delete cascade,
  referred_id    uuid not null references public.users(id) on delete cascade,
  codigo         text not null,
  estado         text not null default 'pendiente',
  appointment_id uuid references public.appointments(id) on delete set null,
  recompensa_cop integer,
  acreditado_at  timestamptz,
  created_at     timestamptz not null default now(),
  constraint referrals_no_autoreferido      check (referrer_id <> referred_id),
  constraint referrals_estado_valido        check (estado in ('pendiente','acreditado')),
  constraint referrals_una_vez_por_invitado unique (referred_id)
);

create index if not exists referrals_referrer_idx on public.referrals (referrer_id);
create index if not exists referrals_estado_idx   on public.referrals (estado);

alter table public.referrals enable row level security;

drop policy if exists "referrals: ver los mios" on public.referrals;
create policy "referrals: ver los mios" on public.referrals
  for select to authenticated
  using (referrer_id = auth.uid() or referred_id = auth.uid() or is_admin());

-- 'free', 'cortesia' y 'virtual_balance' no son plata nueva: si premiaramos
-- esos, el saldo se fabricaria solo.
create or replace function public.acreditar_referido()
returns trigger language plpgsql security definer set search_path = public as $f3$
declare v_ref public.referrals%rowtype; v_premio integer;
begin
  if new.payment_status is distinct from 'completed' then return new; end if;
  if new.payment_method is null
     or new.payment_method in ('free','cortesia','virtual_balance') then return new; end if;

  select * into v_ref from public.referrals
   where referred_id = new.user_id and estado = 'pendiente' limit 1;
  if not found then return new; end if;

  select nullif(value,'')::integer into v_premio
    from public.app_config where key = 'referral_reward_cop';
  v_premio := coalesce(v_premio, 15000);

  update public.users
     set virtual_balance = coalesce(virtual_balance,0) + v_premio
   where id = v_ref.referrer_id;

  update public.referrals
     set estado='acreditado', appointment_id=new.id,
         recompensa_cop=v_premio, acreditado_at=now()
   where id = v_ref.id;

  return new;
exception when others then
  -- Una compra NUNCA se puede caer por culpa del referido.
  raise warning 'acreditar_referido fallo para la cita %: %', new.id, sqlerrm;
  return new;
end;
$f3$;

drop trigger if exists trg_acreditar_referido on public.appointments;
create trigger trg_acreditar_referido after insert or update on public.appointments
  for each row execute function public.acreditar_referido();

create or replace function public.registrar_referido(p_codigo text)
returns jsonb language plpgsql security definer set search_path = public as $f4$
declare
  v_yo uuid := auth.uid();
  v_referidor uuid;
  v_codigo text := upper(trim(coalesce(p_codigo, '')));
begin
  if v_yo is null then return jsonb_build_object('ok', false, 'motivo', 'sin_sesion'); end if;
  if v_codigo = '' then return jsonb_build_object('ok', false, 'motivo', 'codigo_vacio'); end if;

  select id into v_referidor from public.users where referral_code = v_codigo;
  if v_referidor is null then return jsonb_build_object('ok', false, 'motivo', 'codigo_no_existe'); end if;
  if v_referidor = v_yo then return jsonb_build_object('ok', false, 'motivo', 'es_tu_propio_codigo'); end if;
  if exists (select 1 from public.referrals where referred_id = v_yo) then
    return jsonb_build_object('ok', false, 'motivo', 'ya_tienes_referidor');
  end if;
  if exists (select 1 from public.appointments
              where user_id = v_yo and payment_status = 'completed') then
    return jsonb_build_object('ok', false, 'motivo', 'ya_habias_comprado');
  end if;

  insert into public.referrals (referrer_id, referred_id, codigo)
  values (v_referidor, v_yo, v_codigo);

  return jsonb_build_object('ok', true);
end;
$f4$;

revoke all on function public.registrar_referido(text) from public;
grant execute on function public.registrar_referido(text) to authenticated;

create or replace function public.mis_referidos()
returns jsonb language plpgsql security definer set search_path = public as $f5$
declare v_yo uuid := auth.uid(); v_codigo text; v_premio integer;
begin
  if v_yo is null then return jsonb_build_object('ok', false, 'motivo', 'sin_sesion'); end if;

  select referral_code into v_codigo from public.users where id = v_yo;
  select nullif(value,'')::integer into v_premio
    from public.app_config where key = 'referral_reward_cop';
  v_premio := coalesce(v_premio, 15000);

  return jsonb_build_object(
    'ok', true,
    'codigo', v_codigo,
    'premio_cop', v_premio,
    'invitados', (select count(*) from public.referrals where referrer_id = v_yo),
    'pagaron',   (select count(*) from public.referrals
                   where referrer_id = v_yo and estado = 'acreditado'),
    'ganado_cop',(select coalesce(sum(recompensa_cop),0) from public.referrals
                   where referrer_id = v_yo and estado = 'acreditado')
  );
end;
$f5$;

revoke all on function public.mis_referidos() from public;
grant execute on function public.mis_referidos() to authenticated;