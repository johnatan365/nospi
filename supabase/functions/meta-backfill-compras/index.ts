import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Reenvia a Meta las compras aprobadas que nunca llegaron, con su fecha y hora
// ORIGINAL, para que aparezcan en el dia que de verdad ocurrieron y las
// campanas se puedan evaluar.
//
// Por que hizo falta: el 18 de septiembre el META_CONVERSIONS_TOKEN quedo
// invalidado (OAuthException 190 / subcode 460) y desde entonces meta-purchase
// y wompi-webhook devuelven 500 en cada compra. Meta no vio ni una.
//
// Se manda el mismo event_id que habria mandado meta-purchase
// (purchase_<transaction_id>), asi que si alguna alcanzo a llegar, Meta la
// deduplica sola: este backfill no puede inflar los numeros.

const PIXEL_ID = "956701276734114";
const GRAPH = "https://graph.facebook.com/v21.0";

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Prueba de solo lectura: si el token puede ver el pixel, sirve para mandarle
// eventos. No escribe nada.
async function tokenSirve(token: string): Promise<{ ok: boolean; detalle: string }> {
  if (!token) return { ok: false, detalle: "no esta configurado" };
  const res = await fetch(`${GRAPH}/${PIXEL_ID}?fields=id,name`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const d = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, detalle: `ve el pixel "${d.name ?? PIXEL_ID}"` };
  const e = d?.error ?? {};
  return { ok: false, detalle: `${e.message ?? "error"}${e.code ? ` (code ${e.code}/${e.error_subcode ?? "-"})` : ""}` };
}

Deno.serve(async (req: Request) => {
  try {
    const secreto = (req.headers.get("x-redes-secret") ?? "").trim();
    if (!secreto || secreto !== (Deno.env.get("REDES_SECRET") ?? "")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const desde = String(body.desde ?? "2026-09-18T00:00:00-05:00");
    const aplicar = body.aplicar === true;

    const conversions = Deno.env.get("META_CONVERSIONS_TOKEN") ?? "";
    const page = Deno.env.get("META_PAGE_TOKEN") ?? "";

    const pruebas = {
      META_CONVERSIONS_TOKEN: await tokenSirve(conversions),
      META_PAGE_TOKEN: await tokenSirve(page),
    };

    // Se prefiere el token dedicado; si murio, se cae al de Pagina.
    const token = pruebas.META_CONVERSIONS_TOKEN.ok ? conversions
                : pruebas.META_PAGE_TOKEN.ok ? page : "";
    const cual = pruebas.META_CONVERSIONS_TOKEN.ok ? "META_CONVERSIONS_TOKEN"
               : pruebas.META_PAGE_TOKEN.ok ? "META_PAGE_TOKEN" : null;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: pagos, error } = await supabase
      .from("payment_attempts")
      .select("id, transaction_id, amount, created_at, user_id, event_id, users!inner ( email, phone )")
      .in("status", ["APPROVED", "approved"])
      .gte("created_at", desde)
      .order("created_at", { ascending: true });

    if (error) return json({ error: error.message }, 500);

    const resumen = {
      tokens: pruebas,
      token_elegido: cual,
      compras_encontradas: (pagos ?? []).length,
      desde,
    };

    if (!cual) {
      return json({ ...resumen, error: "Ningun token puede escribirle al pixel. Hay que generar uno nuevo." }, 200);
    }
    if (!aplicar) {
      return json({
        ...resumen,
        simulacion: true,
        nota: "Nada se envio a Meta. Repetir con aplicar:true.",
        muestra: (pagos ?? []).slice(0, 3).map((p: any) => ({
          transaction_id: p.transaction_id, monto: p.amount, fecha: p.created_at,
        })),
      });
    }

    // Meta acepta hasta 1000 eventos por llamada; aca son decenas, va en una.
    const eventos = [];
    for (const p of pagos ?? []) {
      const u = (p as any).users ?? {};
      const user_data: Record<string, unknown> = {};
      if (u.email) user_data.em = [await sha256(String(u.email).toLowerCase().trim())];
      if (u.phone) {
        const tel = String(u.phone).replace(/\D/g, "");
        if (tel) user_data.ph = [await sha256(tel)];
      }
      if (p.user_id) user_data.external_id = [await sha256(String(p.user_id))];

      eventos.push({
        event_name: "Purchase",
        // La hora REAL de la compra: por eso aparece en el dia correcto y las
        // campanas de esos dias quedan bien evaluadas.
        event_time: Math.floor(new Date(p.created_at).getTime() / 1000),
        // Mismo id que habria usado meta-purchase -> Meta deduplica sola.
        event_id: `purchase_${p.transaction_id}`,
        action_source: "system_generated",
        custom_data: {
          value: p.amount ?? 15000,
          currency: "COP",
          content_type: "product",
          content_ids: [p.event_id ?? "nospi_event"],
        },
        user_data,
      });
    }

    const res = await fetch(`${GRAPH}/${PIXEL_ID}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ data: eventos }),
    });
    const meta = await res.json().catch(() => ({}));

    return json({ ...resumen, enviados: eventos.length, ok: res.ok, meta }, res.ok ? 200 : 500);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
}
