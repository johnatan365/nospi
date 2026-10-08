import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Avisa por correo a Nospi cuando el filtro retiene un mensaje de grupo.
//
// Se dispara desde el trigger trg_avisar_mensaje_retenido (Postgres, via
// net.http_post) con un secreto compartido — nunca desde el cliente.
//
// Va uno por mensaje y al instante, no en resumen: estos mensajes no son
// comunes, y mientras no se apruebe NADIE del grupo lo esta viendo. Si el
// aviso se demora, la persona queda hablando sola sin saberlo.

const WEBHOOK_SECRET = "nospi_retenido_wh_5c1e8a4b7d29f306";
const ADMIN_EMAIL = "nospisocial@gmail.com";

function escapar(s: string): string {
  return (s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
    }
    if ((req.headers.get("x-webhook-secret") ?? "") !== WEBHOOK_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const { message_id } = await req.json().catch(() => ({}));
    if (!message_id) {
      return new Response(JSON.stringify({ error: "message_id es requerido" }), { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: m } = await supabase
      .from("chat_messages")
      .select("id, content, retenido_motivo, created_at, edited_at, conversation_id, sender_id")
      .eq("id", message_id)
      .single();
    if (!m) return new Response(JSON.stringify({ error: "no encontrado" }), { status: 404 });

    const [{ data: autor }, { data: conv }] = await Promise.all([
      supabase.from("users").select("name, email, phone").eq("id", m.sender_id).single(),
      supabase.from("chat_conversations").select("type, title, events(name)").eq("id", m.conversation_id).single(),
    ]);

    const donde = (conv as any)?.title || (conv as any)?.events?.name || "Chat de grupo";
    const nombre = (autor as any)?.name || "Alguien";
    const cuando = new Date(m.created_at).toLocaleString("es-CO", { timeZone: "America/Bogota" });

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "falta RESEND_API_KEY" }), { status: 500 });
    }

    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px">
        <p style="font-size:13px;color:#B45309;font-weight:700;margin:0 0 4px">MENSAJE RETENIDO — ESPERA TU APROBACIÓN</p>
        <p style="font-size:14px;color:#374151;margin:0 0 16px">
          Nadie del grupo lo está viendo. ${escapar(nombre)} sí lo ve, como si se hubiera publicado.
        </p>
        <table style="font-size:14px;color:#374151;border-collapse:collapse">
          <tr><td style="padding:3px 12px 3px 0;color:#6b7280">Quién</td><td><b>${escapar(nombre)}</b></td></tr>
          <tr><td style="padding:3px 12px 3px 0;color:#6b7280">Dónde</td><td>${escapar(donde)}</td></tr>
          <tr><td style="padding:3px 12px 3px 0;color:#6b7280">Cuándo</td><td>${escapar(cuando)}</td></tr>
          <tr><td style="padding:3px 12px 3px 0;color:#6b7280">Se activó por</td><td><code>${escapar(m.retenido_motivo || "")}</code></td></tr>
        </table>
        <blockquote style="margin:16px 0;padding:12px 14px;background:#FAF8F9;border-left:3px solid #880E4F;font-size:15px;color:#1f2937;white-space:pre-wrap">${escapar(m.content || "(sin texto)")}</blockquote>
        <p style="font-size:14px">
          <a href="https://app.nospi.co/admin" style="background:#880E4F;color:#fff;text-decoration:none;padding:10px 18px;border-radius:20px;display:inline-block;font-weight:700">Revisar en el panel</a>
        </p>
        <p style="font-size:12px;color:#9ca3af">Panel → pestaña Chats → Pendientes de aprobación</p>
      </div>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Nospi <noreply@nospi.co>",
        to: [ADMIN_EMAIL],
        subject: `Mensaje retenido de ${nombre} — ${donde}`,
        html,
      }),
    });

    if (!res.ok) {
      const detalle = await res.text();
      console.error("Resend:", res.status, detalle);
      return new Response(JSON.stringify({ error: "no se pudo enviar el correo" }), { status: 500 });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("notify-mensaje-retenido:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
