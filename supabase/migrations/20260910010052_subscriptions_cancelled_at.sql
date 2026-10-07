-- Fecha real de cancelacion.
--
-- El problema: el admin mostraba updated_at como "Cancelada el", pero eso es la
-- ultima vez que se toco la fila POR CUALQUIER MOTIVO. Dos cosas la pisan:
--
--   1. El relleno de datos historicos del 7 de septiembre, que dejo seis filas
--      con la marca identica 2026-09-07 10:10:12.954048 al microsegundo.
--   2. El cron wompi-charge-subscriptions-daily, que corre cada 6 horas (00,
--      06, 12 y 18 UTC) y tambien toca las filas.
--
-- Resultado: de 12 personas con motivo de cancelacion, 8 mostraban una fecha
-- falsa. Se agrega la columna que faltaba.
--
-- Se sigue el mismo patron que ya uso subscription_charges para su relleno:
-- una marca que distingue el dato registrado del reconstruido.
alter table public.subscriptions
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_at_reconstruido boolean not null default false;

comment on column public.subscriptions.cancelled_at is
  'Momento en que la persona desactivo la renovacion automatica. NULL = se cancelo antes de que existiera esta columna y la fecha real se perdio; nunca debe rellenarse con updated_at.';
comment on column public.subscriptions.cancelled_at_reconstruido is
  'true = la fecha no se registro en su momento, se dedujo de updated_at. Ver la migracion 20260909_subscriptions_cancelled_at.';

-- Relleno conservador. Solo se deduce la fecha cuando updated_at NO puede venir
-- de una de las dos causas conocidas de contaminacion:
--
--   - distinta de la marca exacta del relleno del 7 de septiembre, y
--   - fuera del primer minuto de una franja del cron de cobros.
--
-- Las que no pasan el filtro se quedan en NULL a proposito: es preferible que
-- el admin diga "no hay registro" a que repita una fecha inventada, que es
-- justo el error que se esta corrigiendo.
update public.subscriptions s
set cancelled_at = s.updated_at,
    cancelled_at_reconstruido = true
where s.cancellation_reason is not null
  and s.cancelled_at is null
  and s.updated_at <> timestamptz '2026-09-07 10:10:12.954048+00'
  and not (
    extract(hour from (s.updated_at at time zone 'UTC')) in (0, 6, 12, 18)
    and extract(minute from (s.updated_at at time zone 'UTC')) = 0
  );