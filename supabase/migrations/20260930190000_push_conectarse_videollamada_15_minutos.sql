-- Candado del push de "ya puedes conectarte" de las videollamadas.
--
-- El cron corre cada 5 minutos y la ventana de disparo es de 15 minutos antes
-- del evento: sin esta columna la misma persona recibiria el aviso tres veces.
-- Mismo patron que las otras columnas *_push_sent_at de esta tabla.
alter table public.appointments
  add column if not exists virtual_connect_push_sent_at timestamptz;

comment on column public.appointments.virtual_connect_push_sent_at is
  'Cuando se envio el push de "ya puedes conectarte" (15 min antes, solo videollamadas). NULL = todavia no. Lo escribe send-push-reminders.';

create index if not exists appointments_virtual_connect_push_pendiente_idx
  on public.appointments (event_id)
  where virtual_connect_push_sent_at is null and status = 'confirmada';
