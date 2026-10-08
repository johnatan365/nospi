import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Notifica por push a los participantes de una conversacion de chat cuando
// llega un mensaje nuevo (menos a quien lo escribio). Invocada solo por el
// trigger trg_notify_chat_message (Postgres, via net.http_post) con un
// webhook secret compartido -- nunca directamente por el cliente.
// Envia push para chats DIRECTOS, de GRUPO de evento y CANALES.
//
// EXCEPCION: los mensajes de sistema (is_system = true, hoy solo el de
// "¡Hicieron match!") NO mandan push desde aqui. Ese mensaje va firmado por
// quien completa el match, asi que esta funcion lo excluiria a el/ella del
// aviso. De ese push se encarga notify-match, que avisa a los DOS. Si no se
// saltara aqui, la otra persona recibiria dos notificaciones por lo mismo.
//
// MEDIA: un mensaje que es solo foto, video o nota de voz tiene content = ''
// (el texto opcional funciona como pie). Sin esto la notificacion llegaria con
// el cuerpo vacio, asi que se antepone la etiqueta del tipo de archivo.
//
// MENCIONES: a quien fue mencionado se le manda un aviso distinto ("te
// mencionó"), para que destaque entre los mensajes normales del grupo.

const WEBHOOK_SECRET = "nospi_chat_wh_7f3a1c9d2e6b48f0";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const anyErr = err as any;
    return anyErr.message || anyErr.error_description || anyErr.details || JSON.stringify(err);
  }
  return String(err);
}

function mediaLabel(kind: string | null | undefined): string {
  if (kind === "video") return "🎥 Video";
  if (kind === "image") return "📷 Foto";
  if (kind === "audio") return "🎤 Nota de voz";
  return "";
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const secret = req.headers.get("x-webhook-secret") ?? "";
    if (secret !== WEBHOOK_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const messageId: string = body?.message_id;
    if (!messageId) {
      return new Response(JSON.stringify({ error: "message_id es requerido" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: message, error: messageError } = await supabase
      .from("chat_messages")
      .select("id, conversation_id, sender_id, content, is_system, media_kind, mentions, poll_id")
      .eq("id", messageId)
      .single();

    if (messageError || !message) {
      return new Response(JSON.stringify({ error: errorMessage(messageError) || "message not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Mensaje de sistema (match): el push lo manda notify-match a ambas personas.
    if ((message as any).is_system === true) {
      return new Response(JSON.stringify({ sent: 0, reason: "mensaje de sistema: lo notifica notify-match" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: sender } = await supabase
      .from("users")
      .select("name")
      .eq("id", message.sender_id)
      .single();

    const { data: conversation } = await supabase
      .from("chat_conversations")
      .select("id, type, event_id, title, events(name)")
      .eq("id", message.conversation_id)
      .single();

    // Los participantes van POR PAGINAS, no de una.
    //
    // PostgREST devuelve como mucho 1000 filas por consulta y no avisa de que
    // corto: simplemente llegan 1000. El Canal Nospi tiene 3.580 miembros, asi
    // que cada anuncio se notificaba solo a los 1000 PRIMEROS -- y como la
    // tabla va por orden de ingreso, esos son los miembros mas antiguos, que
    // son justo los que menos tienen la app instalada.
    //
    // Medido el 8 de octubre de 2026 con un anuncio real: de las 700 personas
    // del canal con notificaciones activas, solo 83 caian en esas primeras
    // 1000, y el push llego a 78 aparatos. 617 personas se quedaron sin aviso
    // sin que nada fallara ni quedara en ningun log.
    const TAMANO_PAGINA = 1000;
    const recipientIds: string[] = [];
    for (let desde = 0; ; desde += TAMANO_PAGINA) {
      const { data: pagina, error: participantsError } = await supabase
        .from("chat_participants")
        .select("user_id")
        .eq("conversation_id", message.conversation_id)
        .neq("user_id", message.sender_id)
        .range(desde, desde + TAMANO_PAGINA - 1);

      if (participantsError) {
        return new Response(JSON.stringify({ error: errorMessage(participantsError) }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      const filas = pagina ?? [];
      for (const p of filas) recipientIds.push((p as any).user_id);
      // Una pagina incompleta es la ultima. Si viene exacta, puede haber mas.
      if (filas.length < TAMANO_PAGINA) break;
    }
    if (recipientIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "sin destinatarios" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const convType = (conversation as any)?.type as string | undefined;
    const isGroup = convType === "event_group";
    const isChannel = convType === "channel_global" || convType === "channel_event";
    const eventName: string | undefined = (conversation as any)?.events?.name;
    const channelTitle: string | undefined = (conversation as any)?.title;

    const senderName: string = (sender as any)?.name || "Alguien";
    const baseTitle = isChannel
      ? (channelTitle || "Canal Nospi")
      : isGroup
      ? `${senderName} en ${eventName || "tu evento"}`
      : senderName;

    const label = mediaLabel((message as any).media_kind);
    const text = (message.content ?? "").trim();
    const isPoll = !!(message as any).poll_id;
    const rawBody = text ? (label ? `${label} ${text}` : text) : label;
    const truncated = rawBody.length > 120 ? rawBody.slice(0, 117) + "..." : rawBody;

    // Mencionados: reciben un aviso propio, mas destacado.
    const mentionIds: string[] = ((message as any).mentions ?? []).filter((id: string) =>
      recipientIds.includes(id)
    );
    const restIds = recipientIds.filter((id) => !mentionIds.includes(id));

    const data = { type: "chat_message", conversation_id: message.conversation_id };

    // Que interruptor del perfil manda en este mensaje.
    //
    // "Avisos · <evento>" (channel_event) va como 'reserva' a proposito: ahi es
    // donde se les pide confirmar asistencia y avisos del evento en curso, y no
    // debe poder apagarse. El canal global si, porque son novedades.
    const categoria =
      convType === "direct" ? "privados"
      : convType === "event_group" ? "mesa"
      : convType === "community" ? "comunidad"
      : convType === "channel_global" ? "novedades"
      : "reserva";

    const sendPush = async (ids: string[], title: string, pushBody: string) => {
      if (ids.length === 0) return { skipped: true };
      const res = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        // mentioned_user_ids va en LAS DOS llamadas: send-push lo usa para
        // decidir, persona por persona, si quien eligio "solo si me mencionan"
        // debe recibir este mensaje.
        body: JSON.stringify({
          user_ids: ids, title, body: pushBody, data,
          categoria, mentioned_user_ids: mentionIds,
        }),
      });
      return await res.json();
    };

    const normalBody = isPoll ? `📊 ${truncated.replace(/^📊\s*/, "")}` : truncated;

    const [mentionResult, normalResult] = await Promise.all([
      sendPush(
        mentionIds,
        isChannel ? baseTitle : `${senderName} te mencionó`,
        isGroup && eventName ? `En ${eventName}: ${normalBody}` : normalBody,
      ),
      sendPush(restIds, baseTitle, normalBody),
    ]);

    return new Response(
      JSON.stringify({
        ok: true,
        recipients: recipientIds.length,
        mentioned: mentionIds.length,
        isGroup,
        isChannel,
        mentionResult,
        normalResult,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: errorMessage(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
