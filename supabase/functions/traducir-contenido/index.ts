import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

// Traduce al ingles el contenido que escribe el equipo de Nospi: el nombre y la
// descripcion de un evento, las preguntas de la dinamica, los mensajes y
// encuestas de los canales y la comunidad, y la frase que cada persona escribe
// sobre si misma en su perfil.
//
// Los interruptores viven en app_config (traducir_comunidad, traducir_canales,
// traducir_eventos, traducir_preguntas, traducir_bios).

const WEBHOOK_TOKEN = "7bb46a6e95dfdc543cab8eaf1e072e81ec9cbb7e11e7ac6d";
const MAX_POR_LLAMADA = 120;

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

type Proveedor = "deepl" | "google" | null;

function proveedor(): Proveedor {
  if (Deno.env.get("DEEPL_API_KEY")) return "deepl";
  if (Deno.env.get("GOOGLE_TRANSLATE_API_KEY")) return "google";
  return null;
}

async function prendido(supabase: SupabaseClient, clave: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("app_config").select("value").eq("key", clave).maybeSingle();
    if (!data) return true;
    return String(data.value).trim().toLowerCase() !== "false";
  } catch {
    return true;
  }
}

function deeplHost(key: string): string {
  return key.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";
}

async function traducirDeepl(textos: string[]): Promise<string[]> {
  const key = Deno.env.get("DEEPL_API_KEY")!;
  const resp = await fetch(`${deeplHost(key)}/v2/translate`, {
    method: "POST",
    headers: {
      "Authorization": `DeepL-Auth-Key ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: textos,
      source_lang: "ES",
      target_lang: "EN-US",
      preserve_formatting: true,
    }),
  });
  if (!resp.ok) throw new Error(`deepl ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  return (data.translations ?? []).map((t: { text: string }) => t.text);
}

async function traducirGoogle(textos: string[]): Promise<string[]> {
  const key = Deno.env.get("GOOGLE_TRANSLATE_API_KEY")!;
  const resp = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: textos, source: "es", target: "en", format: "text" }),
    },
  );
  if (!resp.ok) throw new Error(`google ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  return (data?.data?.translations ?? []).map((t: { translatedText: string }) => t.translatedText);
}

async function traducir(textos: string[], quien: Proveedor): Promise<string[]> {
  const salida: string[] = [];
  for (let i = 0; i < textos.length; i += 50) {
    const lote = textos.slice(i, i + 50);
    const r = quien === "deepl" ? await traducirDeepl(lote) : await traducirGoogle(lote);
    if (r.length !== lote.length) throw new Error("el traductor devolvio otra cantidad de textos");
    salida.push(...r);
  }
  return salida;
}

function camposPendientes(
  ev: Record<string, unknown>,
  soloVacios: boolean,
): { nombre: boolean; desc: boolean } {
  const nombre = (ev.name as string ?? "").trim();
  const desc = (ev.description as string ?? "").trim();
  return {
    nombre: !!nombre && !ev.name_en_manual && (!soloVacios || !ev.name_en),
    desc: !!desc && !ev.description_en_manual && (!soloVacios || !ev.description_en),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }
  try {
    if (req.headers.get("x-webhook-token") !== WEBHOOK_TOKEN) {
      return json({ success: false, error: "unauthorized" }, 401);
    }

    const quien = proveedor();
    const body = await req.json().catch(() => ({}));
    const tipo = String(body?.tipo ?? "");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (tipo === "uso") {
      if (quien !== "deepl") {
        return json({ success: true, proveedor: quien ?? "ninguno", disponible: false });
      }
      const key = Deno.env.get("DEEPL_API_KEY")!;
      const resp = await fetch(`${deeplHost(key)}/v2/usage`, {
        headers: { "Authorization": `DeepL-Auth-Key ${key}` },
      });
      if (!resp.ok) {
        return json({ success: false, error: `deepl ${resp.status}` }, 200);
      }
      const u = await resp.json();
      return json({
        success: true,
        proveedor: "deepl",
        disponible: true,
        usados: u.character_count ?? null,
        tope: u.character_limit ?? null,
      });
    }

    if (!quien) {
      return json({ success: true, skipped: "sin llave de traduccion configurada", tipo });
    }

    const CAMPOS_EVENTO = "id, name, description, name_en, description_en, name_en_manual, description_en_manual";

    if (tipo === "evento") {
      if (!(await prendido(supabase, "traducir_eventos"))) {
        return json({ success: true, apagado: "traducir_eventos" });
      }
      const id = body?.id;
      if (!id) return json({ success: false, error: "falta id" }, 400);

      const { data: ev, error } = await supabase
        .from("events").select(CAMPOS_EVENTO).eq("id", id).single();
      if (error || !ev) return json({ success: false, error: error?.message ?? "evento no encontrado" }, 404);

      const falta = camposPendientes(ev as Record<string, unknown>, false);
      const piezas: string[] = [];
      if (falta.nombre) piezas.push((ev.name ?? "").trim());
      if (falta.desc) piezas.push((ev.description ?? "").trim());
      if (piezas.length === 0) return json({ success: true, nada: true, tipo, id });

      const trad = await traducir(piezas, quien);
      const cambios: Record<string, string> = {};
      let i = 0;
      if (falta.nombre) cambios.name_en = trad[i++];
      if (falta.desc) cambios.description_en = trad[i++];

      const { error: e2 } = await supabase.from("events").update(cambios).eq("id", id);
      if (e2) return json({ success: false, error: e2.message }, 500);
      return json({ success: true, tipo, id, campos: Object.keys(cambios) });
    }

    if (tipo === "pregunta") {
      if (!(await prendido(supabase, "traducir_preguntas"))) {
        return json({ success: true, apagado: "traducir_preguntas" });
      }
      const id = body?.id;
      if (!id) return json({ success: false, error: "falta id" }, 400);

      const { data: pq, error } = await supabase
        .from("event_questions").select("id, question_text").eq("id", id).single();
      if (error || !pq) return json({ success: false, error: error?.message ?? "pregunta no encontrada" }, 404);

      const texto = (pq.question_text ?? "").trim();
      if (!texto) return json({ success: true, nada: true });

      const [trad] = await traducir([texto], quien);
      const { error: e2 } = await supabase
        .from("event_questions").update({ question_text_en: trad }).eq("question_text", texto);
      if (e2) return json({ success: false, error: e2.message }, 500);
      return json({ success: true, tipo, texto, trad });
    }

    // ---- la bio de un perfil ----
    //
    // Se retraduce aunque ya haya ingles, igual que un evento: el trigger solo
    // dispara cuando la bio cambio, asi que el ingles que hubiera ya no sirve.
    // El trigger se encarga del caso contrario --si la borran, pone bio_en en
    // null-- y por eso aqui no hay que limpiar nada.
    if (tipo === "bio") {
      if (!(await prendido(supabase, "traducir_bios"))) {
        return json({ success: true, apagado: "traducir_bios" });
      }
      const id = body?.id;
      if (!id) return json({ success: false, error: "falta id" }, 400);

      const { data: u, error } = await supabase
        .from("users").select("id, bio").eq("id", id).single();
      if (error || !u) return json({ success: false, error: error?.message ?? "persona no encontrada" }, 404);

      const texto = (u.bio ?? "").trim();
      if (!texto) return json({ success: true, nada: true });

      const [trad] = await traducir([texto], quien);
      const { error: e2 } = await supabase.from("users").update({ bio_en: trad }).eq("id", id);
      if (e2) return json({ success: false, error: e2.message }, 500);
      return json({ success: true, tipo, id });
    }

    if (tipo === "mensaje") {
      const id = body?.id;
      if (!id) return json({ success: false, error: "falta id" }, 400);

      const { data: m, error } = await supabase
        .from("chat_messages")
        .select("id, content, conversation_id, chat_conversations!inner(type)")
        .eq("id", id).single();
      if (error || !m) return json({ success: false, error: error?.message ?? "mensaje no encontrado" }, 404);

      const tipoConv = (m as Record<string, any>).chat_conversations?.type ?? "";
      const clave = tipoConv === "community" ? "traducir_comunidad" : "traducir_canales";
      if (!(await prendido(supabase, clave))) {
        return json({ success: true, apagado: clave });
      }

      const texto = (m.content ?? "").trim();
      if (!texto) return json({ success: true, nada: true });

      const [trad] = await traducir([texto], quien);
      const { error: e2 } = await supabase
        .from("chat_messages").update({ content_en: trad }).eq("id", id);
      if (e2) return json({ success: false, error: e2.message }, 500);
      return json({ success: true, tipo, id });
    }

    if (tipo === "encuesta") {
      const id = body?.id;
      if (!id) return json({ success: false, error: "falta id" }, 400);

      const { data: p, error } = await supabase
        .from("chat_polls")
        .select("id, question, options, conversation_id, chat_conversations!inner(type)")
        .eq("id", id).single();
      if (error || !p) return json({ success: false, error: error?.message ?? "encuesta no encontrada" }, 404);

      const tipoConv = (p as Record<string, any>).chat_conversations?.type ?? "";
      const clave = tipoConv === "community" ? "traducir_comunidad" : "traducir_canales";
      if (!(await prendido(supabase, clave))) {
        return json({ success: true, apagado: clave });
      }

      const pregunta = (p.question ?? "").trim();
      const opciones: string[] = Array.isArray(p.options) ? p.options : [];
      const piezas = [pregunta, ...opciones].filter((x) => (x ?? "").trim().length > 0);
      if (piezas.length === 0) return json({ success: true, nada: true });

      const trad = await traducir(piezas, quien);
      const cambios: Record<string, unknown> = {};
      let i = 0;
      if (pregunta) cambios.question_en = trad[i++];
      if (opciones.length) cambios.options_en = opciones.map(() => trad[i++]);

      const { error: e2 } = await supabase.from("chat_polls").update(cambios).eq("id", id);
      if (e2) return json({ success: false, error: e2.message }, 500);
      return json({ success: true, tipo, id, opciones: opciones.length });
    }

    if (tipo === "barrido" || tipo === "preguntas") {
      const { data: filas, error } = await supabase
        .from("event_questions").select("question_text")
        .is("question_text_en", null).not("question_text", "is", null).limit(5000);
      if (error) return json({ success: false, error: error.message }, 500);

      const distintos = [...new Set((filas ?? []).map((f) => (f.question_text ?? "").trim()).filter(Boolean))];
      const lote = distintos.slice(0, MAX_POR_LLAMADA);
      if (lote.length === 0) return json({ success: true, listo: true, restantes: 0 });

      const trad = await traducir(lote, quien);
      let escritas = 0;
      for (let i = 0; i < lote.length; i++) {
        const { error: e2 } = await supabase
          .from("event_questions").update({ question_text_en: trad[i] }).eq("question_text", lote[i]);
        if (!e2) escritas++;
      }
      return json({
        success: true, tipo: "barrido", traducidas: escritas,
        restantes: Math.max(0, distintos.length - lote.length),
      });
    }

    if (tipo === "eventos") {
      const { data: evs, error } = await supabase
        .from("events").select(CAMPOS_EVENTO)
        .or("name_en.is.null,description_en.is.null").limit(MAX_POR_LLAMADA);
      if (error) return json({ success: false, error: error.message }, 500);

      let hechos = 0;
      for (const ev of evs ?? []) {
        const falta = camposPendientes(ev as Record<string, unknown>, true);
        const piezas: string[] = [];
        if (falta.nombre) piezas.push((ev.name ?? "").trim());
        if (falta.desc) piezas.push((ev.description ?? "").trim());
        if (piezas.length === 0) continue;

        const trad = await traducir(piezas, quien);
        const cambios: Record<string, string> = {};
        let i = 0;
        if (falta.nombre) cambios.name_en = trad[i++];
        if (falta.desc) cambios.description_en = trad[i++];
        const { error: e2 } = await supabase.from("events").update(cambios).eq("id", ev.id);
        if (!e2) hechos++;
      }
      return json({ success: true, tipo: "eventos", traducidos: hechos });
    }

    // ---- barrido de bios sin ingles ----
    if (tipo === "bios") {
      if (!(await prendido(supabase, "traducir_bios"))) {
        return json({ success: true, apagado: "traducir_bios" });
      }
      const { data: gente, error } = await supabase
        .from("users").select("id, bio")
        .is("bio_en", null).not("bio", "is", null).limit(MAX_POR_LLAMADA);
      if (error) return json({ success: false, error: error.message }, 500);

      const utiles = (gente ?? []).filter((u) => (u.bio ?? "").trim().length > 0);
      if (utiles.length === 0) return json({ success: true, listo: true, restantes: 0 });

      const trad = await traducir(utiles.map((u) => (u.bio ?? "").trim()), quien);
      let escritas = 0;
      for (let i = 0; i < utiles.length; i++) {
        const { error: e2 } = await supabase
          .from("users").update({ bio_en: trad[i] }).eq("id", utiles[i].id);
        if (!e2) escritas++;
      }
      return json({ success: true, tipo: "bios", traducidas: escritas });
    }

    if (tipo === "mensajes") {
      const tipos: string[] = [];
      if (await prendido(supabase, "traducir_canales")) tipos.push("channel_global", "channel_event");
      if (await prendido(supabase, "traducir_comunidad")) tipos.push("community");
      if (tipos.length === 0) return json({ success: true, apagado: "todo" });

      const { data: convs } = await supabase
        .from("chat_conversations").select("id").in("type", tipos);
      const ids = (convs ?? []).map((c) => c.id);
      if (ids.length === 0) return json({ success: true, listo: true, restantes: 0 });

      const { data: msgs, error } = await supabase
        .from("chat_messages").select("id, content")
        .in("conversation_id", ids)
        .is("content_en", null).not("content", "is", null)
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) return json({ success: false, error: error.message }, 500);

      const utiles = (msgs ?? []).filter((m) => (m.content ?? "").trim().length > 0);
      if (utiles.length === 0) return json({ success: true, listo: true, restantes: 0 });

      const trad = await traducir(utiles.map((m) => (m.content ?? "").trim()), quien);
      let escritos = 0;
      for (let i = 0; i < utiles.length; i++) {
        const { error: e2 } = await supabase
          .from("chat_messages").update({ content_en: trad[i] }).eq("id", utiles[i].id);
        if (!e2) escritos++;
      }
      return json({ success: true, tipo: "mensajes", traducidos: escritos });
    }

    return json({ success: false, error: `tipo desconocido: ${tipo}` }, 400);
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
});
