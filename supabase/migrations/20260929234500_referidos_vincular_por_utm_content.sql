-- Programa de referidos - parte 2: vincular al que invita sin tocar el registro.
--
-- La landing ya arrastra los UTM de la URL hasta la ficha del usuario
-- (nospi-landing/tiktok-pixel.js -> public/index.html -> utils/atribucion.ts).
-- Con nospi.co/r/<codigo>, el codigo del que invita llega en utm_content.
-- Este disparador lo lee y arma el referido solo. El amigo nunca escribe nada
-- y no hay que tocar la pantalla de registro de la app.
--
-- Guardas:
--   * El codigo de referido siempre mide 7 caracteres. Cualquier otro
--     utm_content (nombres de anuncios, campanas, basura) se ignora.
--   * Nadie se puede referir a si mismo.
--   * Un usuario solo puede tener un referidor, el primero que llegue.
--   * Si algo falla, el registro sigue. Un referido roto nunca puede
--     tumbar una cuenta nueva.

create or replace function public.vincular_referido_por_utm()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
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
$function$;

-- Va en INSERT y tambien en UPDATE de utm_content, porque en varios flujos
-- la fila se crea primero y la atribucion se escribe un instante despues.
drop trigger if exists trg_vincular_referido_por_utm on public.users;
create trigger trg_vincular_referido_por_utm
  after insert or update of utm_content on public.users
  for each row execute function public.vincular_referido_por_utm();
