-- Revertir el programa de referidos.
--
-- Decision del 30 de septiembre: por ahora no va. Esto desmonta todo lo que
-- montaron las migraciones 20260929230000_programa_de_referidos.sql y
-- 20260929234500_referidos_vincular_por_utm_content.sql.
--
-- Se deja el rastro de las dos migraciones originales en el repo a proposito:
-- ya estan aplicadas en produccion y borrarlas del historial solo desincroniza
-- el repo con la base. Esta migracion las deshace hacia adelante, que es como
-- se revierte una base de datos.
--
-- No se pierde nada: la tabla referrals quedo en cero filas, no se acredito
-- saldo a nadie y ningun otro pedazo del codigo usaba estas columnas.

-- 1. Los disparadores primero, para que nada se ejecute a medio desmontar.
drop trigger if exists trg_vincular_referido_por_utm on public.users;
drop trigger if exists trg_acreditar_referido       on public.appointments;
drop trigger if exists trg_users_referral_code      on public.users;

-- 2. Las funciones.
drop function if exists public.vincular_referido_por_utm();
drop function if exists public.acreditar_referido();
drop function if exists public.trg_asignar_codigo_referido();
drop function if exists public.generar_codigo_referido();
drop function if exists public.mis_referidos();
drop function if exists public.registrar_referido(text);

-- 3. La tabla (se lleva sus indices y politicas con ella).
drop table if exists public.referrals;

-- 4. La columna del codigo.
alter table public.users drop column if exists referral_code;

-- 5. El monto del premio.
delete from public.app_config where key = 'referral_reward_cop';
