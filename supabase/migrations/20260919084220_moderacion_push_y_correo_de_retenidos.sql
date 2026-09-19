-- El push NO se manda si el mensaje quedo retenido. Sin esto la retencion no
-- serviria de nada: el texto se leeria igual en la pantalla de bloqueo del
-- celular de todo el grupo. Los mensajes normales siguen mandando push.
CREATE OR REPLACE FUNCTION public.trg_notify_chat_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if NEW.retenido_at is not null then
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

-- Correo inmediato a Nospi por cada mensaje retenido. Uno por mensaje: no son
-- comunes, y mientras no se apruebe nadie del grupo lo esta viendo.
create or replace function public.trg_avisar_mensaje_retenido()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if NEW.retenido_at is null then
    return NEW;
  end if;
  if tg_op = 'UPDATE' and OLD.retenido_at is not null then
    return NEW;
  end if;

  perform net.http_post(
    url := 'https://wjdiraurfbawotlcndmk.supabase.co/functions/v1/notify-mensaje-retenido',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', 'nospi_retenido_wh_5c1e8a4b7d29f306'
    ),
    body := jsonb_build_object('message_id', NEW.id)
  );
  return NEW;
end;
$function$;

drop trigger if exists trg_avisar_mensaje_retenido on public.chat_messages;
create trigger trg_avisar_mensaje_retenido
  after insert or update of retenido_at on public.chat_messages
  for each row execute function public.trg_avisar_mensaje_retenido();
