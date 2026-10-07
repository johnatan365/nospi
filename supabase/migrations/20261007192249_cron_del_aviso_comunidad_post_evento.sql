-- El cron del aviso post-evento se programó a mano el 7 de oct de 2026, por
-- fuera de una migración, así que no quedó versionado en ninguna parte: un
-- entorno reconstruido desde las migraciones creaba la columna y la función
-- pero nunca el cron, y el aviso no habría salido jamás. Las otras 7 tareas
-- programadas del proyecto sí viven en migraciones; esta se alinea con eso.
-- cron.schedule reemplaza por nombre, así que aplicarla donde el cron ya
-- existe no lo duplica.
select cron.schedule(
  'aviso-comunidad-post-evento-daily',
  '5 14 * * *',
  'SELECT public.enviar_aviso_comunidad_post_evento();'
);