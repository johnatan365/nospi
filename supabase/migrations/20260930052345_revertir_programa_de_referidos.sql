drop trigger if exists trg_vincular_referido_por_utm on public.users;
drop trigger if exists trg_acreditar_referido       on public.appointments;
drop trigger if exists trg_users_referral_code      on public.users;

drop function if exists public.vincular_referido_por_utm();
drop function if exists public.acreditar_referido();
drop function if exists public.trg_asignar_codigo_referido();
drop function if exists public.generar_codigo_referido();
drop function if exists public.mis_referidos();
drop function if exists public.registrar_referido(text);

drop table if exists public.referrals;

alter table public.users drop column if exists referral_code;

delete from public.app_config where key = 'referral_reward_cop';