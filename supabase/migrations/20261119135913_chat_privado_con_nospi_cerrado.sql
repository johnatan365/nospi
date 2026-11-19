-- El chat privado con el equipo de Nospi no es un canal de soporte.
--
-- El 19 de noviembre de 2026 habia usuarios escribiendole a la cuenta de Nospi
-- por privado (uno desde el 25 de octubre) sin respuesta: nadie revisa ese
-- chat. El soporte oficial es WhatsApp y correo (app_config support_whatsapp y
-- support_email). Desde aqui, quien no es admin no puede escribir en un chat
-- privado donde el otro participante es admin. Lo que Nospi escribio ahi se
-- sigue viendo; la app muestra el aviso con WhatsApp y correo en vez del campo
-- de escribir.
create or replace function public.puede_escribir_en_directo(p_conversation_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  SELECT CASE
    -- Los grupos y canales los gobiernan otras reglas.
    WHEN (SELECT type FROM public.chat_conversations WHERE id = p_conversation_id) <> 'direct'
      THEN true
    WHEN NOT public.is_chat_participant(p_conversation_id)
      THEN false
    -- Al equipo de Nospi no se le escribe por privado: soporte va por
    -- WhatsApp o correo. Los admins si pueden escribir.
    WHEN NOT public.is_admin() AND EXISTS (
      SELECT 1 FROM public.chat_participants p
        JOIN public.admins a ON a.user_id = p.user_id
       WHERE p.conversation_id = p_conversation_id
         AND p.user_id <> auth.uid()
    )
      THEN false
    WHEN (SELECT estado FROM public.chat_conversations WHERE id = p_conversation_id) = 'aceptada'
      THEN true
    WHEN (SELECT estado FROM public.chat_conversations WHERE id = p_conversation_id) = 'ignorada'
      THEN false
    -- Pendiente: solo quien la envio, y solo UN mensaje. El segundo se cae
    -- aca, no en la pantalla, para que no se pueda insistir saltandose la app.
    ELSE (SELECT solicitada_por FROM public.chat_conversations WHERE id = p_conversation_id) = auth.uid()
         AND NOT EXISTS (
           SELECT 1 FROM public.chat_messages m WHERE m.conversation_id = p_conversation_id
         )
  END;
$function$;
