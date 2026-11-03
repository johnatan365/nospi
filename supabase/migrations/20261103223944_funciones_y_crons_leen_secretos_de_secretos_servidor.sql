-- Las funciones y los crons que llaman a notify-no-show,
-- notify-strike-resolution y wompi-charge-subscriptions-cron leen ahora el
-- secreto de secretos_servidor (valores nuevos), en vez de llevarlo escrito en
-- el codigo o de sacarlo de app_config, que es publica.

create or replace function public.secreto(p_key text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select value from public.secretos_servidor where key = p_key;
$$;
revoke all on function public.secreto(text) from public, anon, authenticated;

-- Reescribe cada funcion a partir de su definicion actual, cambiando solo el
-- valor del header. Asi no se reescribe a mano ninguna (y no se pierde nada de
-- lo que ya hacen).
do $$
declare
  r record;
  v_def text;
  v_nueva text;
begin
  for r in
    select p.oid, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('admin_lift_suspension', 'admin_sacar_del_evento_modo', 'admin_waive_strike',
                        'clear_no_show_on_arrival_confirmed', 'notify_appointment_cancelled',
                        'flag_event_no_shows')
  loop
    v_def := pg_get_functiondef(r.oid);
    v_nueva := regexp_replace(v_def,
      '''x-noshow-secret''(\s*),(\s*)''[^'']*''',
      '''x-noshow-secret''\1,\2public.secreto(''noshow_secret'')', 'g');
    v_nueva := replace(v_nueva,
      'FROM public.app_config WHERE key = ''noshow_secret''',
      'FROM public.secretos_servidor WHERE key = ''noshow_secret''');
    if v_nueva = v_def then
      raise exception 'La funcion % no cambio: revisar el patron antes de seguir', r.proname;
    end if;
    execute v_nueva;
  end loop;
end $$;

-- Crons
do $$
declare
  v_job record;
  v_cmd text;
begin
  select jobid, command into v_job from cron.job where jobname = 'notify-no-show-10min';
  v_cmd := regexp_replace(v_job.command,
    '''x-noshow-secret''(\s*),(\s*)''[^'']*''',
    '''x-noshow-secret''\1,\2public.secreto(''noshow_secret'')', 'g');
  if v_cmd = v_job.command then
    raise exception 'El cron notify-no-show-10min no cambio';
  end if;
  perform cron.alter_job(v_job.jobid, command := v_cmd);

  select jobid, command into v_job from cron.job where jobname = 'wompi-charge-subscriptions-daily';
  v_cmd := replace(v_job.command,
    '(SELECT value FROM public.app_config WHERE key = ''cron_secret'')',
    'public.secreto(''cron_secret'')');
  if v_cmd = v_job.command then
    raise exception 'El cron wompi-charge-subscriptions-daily no cambio';
  end if;
  perform cron.alter_job(v_job.jobid, command := v_cmd);
end $$;
