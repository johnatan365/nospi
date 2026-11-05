-- Los secretos con que los triggers y crons llaman a las Edge Functions de
-- avisos estaban escritos en el codigo (funciones SQL, crons y los index.ts),
-- y el repositorio es publico: quedaron publicados. Esta migracion hace que
-- las funciones SQL y los crons los lean de public.secretos_servidor con
-- public.secreto('<clave>'), igual que ya hacen noshow_secret y cron_secret.
-- Las Edge Functions leen la misma fila (_shared/secretoServidor.ts).
--
-- Los valores NO estan en este archivo. Se generan dentro de la base, antes de
-- aplicar esto, con gen_random_bytes; nadie los ve. Si alguna clave falta, la
-- migracion se detiene sin cambiar nada.
--
-- Claves: purchase_wh, cancel_wh, chat_wh, gender_wh, match_wh, retenido_wh,
-- recon_wh, cleanup_wh.

do $$
declare
  c_claves constant text[] := array['purchase_wh', 'cancel_wh', 'chat_wh', 'gender_wh',
                                    'match_wh', 'retenido_wh', 'recon_wh', 'cleanup_wh'];
  c_literal constant text := '''nospi_([a-z_]+)_wh_[A-Za-z0-9]+''';
  c_reemplazo constant text := 'public.secreto(''\1_wh'')';
  v_faltan text[];
  r record;
  v_def text;
  v_nueva text;
begin
  select array_agg(k) into v_faltan
    from unnest(c_claves) k
   where not exists (select 1 from public.secretos_servidor s where s.key = k and length(s.value) >= 32);
  if v_faltan is not null then
    raise exception 'Faltan secretos en secretos_servidor: %', v_faltan;
  end if;

  -- Funciones SQL (triggers de avisos). Se reescribe solo el literal.
  for r in select p.oid, p.proname
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prosrc ~ 'nospi_[a-z_]+_wh_' loop
    v_def := pg_get_functiondef(r.oid);
    v_nueva := regexp_replace(v_def, c_literal, c_reemplazo, 'g');
    if v_nueva = v_def or v_nueva ~ 'nospi_[a-z_]+_wh_' then
      raise exception 'No se pudo reemplazar el secreto en %', r.proname;
    end if;
    execute v_nueva;
  end loop;

  -- Crons que llaman Edge Functions.
  for r in select jobid, jobname, command from cron.job where command ~ 'nospi_[a-z_]+_wh_' loop
    v_nueva := regexp_replace(r.command, c_literal, c_reemplazo, 'g');
    if v_nueva ~ 'nospi_[a-z_]+_wh_' then
      raise exception 'No se pudo reemplazar el secreto en el cron %', r.jobname;
    end if;
    perform cron.alter_job(r.jobid, command := v_nueva);
  end loop;
end $$;
