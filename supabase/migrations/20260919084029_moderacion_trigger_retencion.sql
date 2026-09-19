-- Retiene automaticamente los mensajes de grupo que parecen queja, reclamo,
-- sugerencia o algo que indisponga. Solo aplica a chats de grupo
-- (community y event_group): los chats privados entre dos personas NO se
-- revisan.
create or replace function public.trg_retener_mensaje_moderacion()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  tipo_conv text;
  motivo text;
  es_admin boolean;
begin
  if tg_op = 'UPDATE' and new.content is not distinct from old.content then
    return new;
  end if;

  select c.type into tipo_conv
  from public.chat_conversations c
  where c.id = new.conversation_id;

  if tipo_conv not in ('community', 'event_group') then
    return new;
  end if;

  if coalesce(new.is_system, false) then
    return new;
  end if;

  select exists(select 1 from public.admins a where a.user_id = new.sender_id)
    into es_admin;
  if es_admin then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.contenido_original is null then
      new.contenido_original := old.content;
    end if;
    new.edited_at := now();
  end if;

  motivo := public.detectar_mensaje_retenible(new.content);

  if motivo is not null then
    new.retenido_at := coalesce(new.retenido_at, now());
    new.retenido_motivo := motivo;
    -- Editar un mensaje ya aprobado lo devuelve a revision: si no, bastaria
    -- con publicar "hola", esperar el visto bueno y despues editarlo para
    -- dejar la queja publicada sin que nadie la revise.
    new.aprobado_at := null;
    new.aprobado_por := null;
  elsif tg_op = 'UPDATE' then
    new.retenido_at := null;
    new.retenido_motivo := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_retener_mensaje_moderacion on public.chat_messages;
create trigger trg_retener_mensaje_moderacion
  before insert or update of content on public.chat_messages
  for each row execute function public.trg_retener_mensaje_moderacion();
