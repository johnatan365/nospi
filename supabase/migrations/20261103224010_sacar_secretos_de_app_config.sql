-- app_config la leen la app y la landing con la llave publica. Los secretos ya
-- viven en secretos_servidor; aqui no deben quedar.
delete from public.app_config where key in ('cron_secret', 'noshow_secret');
