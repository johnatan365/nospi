-- El invitado nunca escribe un codigo: llega por nospi.co/r/<codigo>, la
-- landing le pega el codigo en utm_content (el mismo mecanismo que ya usa la
-- pauta) y al registrarse queda en su ficha. Este disparador lo convierte en
-- un referido, sin tocar nada de la app.
--
-- Se exige largo 7 para no confundir un codigo con un nombre de anuncio, que
-- es lo otro que viaja en utm_content.
create or replace function public.vincular_referido_por_utm()
returns trigger language plpgsql security definer set search_path = public as $v$
declare v_codigo text; v_referidor uuid;
begin
  v_codigo := upper(trim(coalesce(new.utm_content, '')));
  if v_codigo = '' or length(v_codigo) <> 7 then return new; end if;

  select id into v_referidor from public.users
   where referral_code = v_codigo and id <> new.id;
  if v_referidor is null then return new; end if;

  if exists (select 1 from public.referrals where referred_id = new.id) then
    return new;
  end if;

  insert into public.referrals (referrer_id, referred_id, codigo)
  values (v_referidor, new.id, v_codigo)
  on conflict (referred_id) do nothing;

  return new;
exception when others then
  -- Un registro NUNCA se puede caer por culpa del referido.
  raise warning 'vincular_referido_por_utm fallo para el usuario %: %', new.id, sqlerrm;
  return new;
end;
$v$;

-- Tambien en UPDATE: hay rutas que crean el perfil y despues completan la
-- atribucion, y en esas el utm_content no existe todavia en el INSERT.
drop trigger if exists trg_vincular_referido_por_utm on public.users;
create trigger trg_vincular_referido_por_utm
  after insert or update of utm_content on public.users
  for each row execute function public.vincular_referido_por_utm();