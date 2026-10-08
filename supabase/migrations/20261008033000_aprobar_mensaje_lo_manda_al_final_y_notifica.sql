-- Aplicado en produccion el 7 de octubre de 2026 (~10:20 p.m. Bogota) desde la
-- sesion de community manager. Ya esta corriendo y verificado; esta migracion
-- solo lo deja versionado. NO re-ejecutar contra produccion sin revisar:
-- registrala como aplicada.
--
-- Al aprobar un mensaje retenido por el moderador pasaban dos cosas malas:
--   1) no salia ninguna notificacion, porque trg_notify_chat_message es AFTER
--      INSERT y ademas se salta los mensajes retenidos; y
--   2) el mensaje conservaba su created_at, asi que aparecia enterrado en el
--      historial, en la hora en que se escribio.
-- Caso real del 7 de octubre: un mensaje de LuisFer escrito a las 8:28 a.m. y
-- aprobado a las 9:54 p.m. aparecio 13 horas atras en el scroll, sin aviso a
-- nadie. En la practica ese mensaje no existio.
--
-- Ahora, al aprobar, el mensaje se comporta como uno recien enviado: se mueve
-- al final del chat y dispara la misma notificacion de mensaje nuevo. La hora
-- real en que lo escribio el autor no se pierde: queda en
-- escrito_originalmente_at.
--
-- El filtro de palabras NO se toca: es decision explicita del dueno dejarlo
-- igual, aunque su tasa de falsos positivos sea alta.

alter table public.chat_messages
  add column if not exists escrito_originalmente_at timestamptz;

comment on column public.chat_messages.escrito_originalmente_at is
  'Hora en que el autor escribio el mensaje, cuando fue retenido por moderacion y luego aprobado. created_at pasa a ser la hora de aprobacion para que el mensaje salga al final del chat.';

-- BEFORE: mover el mensaje al final. Se hace en BEFORE para modificar NEW sin
-- un segundo UPDATE, que reentraria al trigger.
create or replace function public.trg_aprobado_va_al_final()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if NEW.aprobado_at is null then return NEW; end if;
  if OLD.aprobado_at is not null then return NEW; end if;  -- ya estaba aprobado
  if NEW.escrito_originalmente_at is null then
    NEW.escrito_originalmente_at := OLD.created_at;
  end if;
  NEW.created_at := now();
  return NEW;
end;
$function$;

drop trigger if exists trg_aprobado_va_al_final on public.chat_messages;
create trigger trg_aprobado_va_al_final
  before update of aprobado_at on public.chat_messages
  for each row execute function public.trg_aprobado_va_al_final();

-- AFTER: la misma notificacion que recibe un mensaje nuevo.
create or replace function public.trg_notificar_mensaje_aprobado()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if NEW.aprobado_at is null or OLD.aprobado_at is not null then return NEW; end if;
  -- Si por alguna razon sigue retenido, oculto o borrado, no se avisa.
  if NEW.retenido_at is not null or NEW.hidden_at is not null or NEW.deleted_at is not null then
    return NEW;
  end if;
  perform net.http_post(
    url := 'https://wjdiraurfbawotlcndmk.supabase.co/functions/v1/notify-chat-message',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', 'nospi_chat_wh_7f3a1c9d2e6b48f0'
    ),
    body := jsonb_build_object('message_id', NEW.id)
  );
  return NEW;
end;
$function$;

drop trigger if exists trg_notificar_mensaje_aprobado on public.chat_messages;
create trigger trg_notificar_mensaje_aprobado
  after update of aprobado_at on public.chat_messages
  for each row execute function public.trg_notificar_mensaje_aprobado();
