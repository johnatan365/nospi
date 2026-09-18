import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Puente hacia los comentarios y mensajes ORGANICOS de Facebook e Instagram.
//
// Por que existe: no hay conector/MCP para comentarios ni DMs organicos. Hasta
// ahora la unica via era Meta Business Suite manejado a mano con Claude in
// Chrome, lo que obliga a tener el computador prendido y la sesion abierta.
// Esta funcion habla directo con la Graph API, asi que se puede operar desde
// cualquier lado (un chat remoto, el celular) sin depender del navegador.
//
// Solo se invoca con la service role key: publica en nombre de la marca, no
// puede quedar expuesta al cliente.
//
// TikTok NO entra aca: no expone API publica de comentarios/DMs organicos.
// Eso sigue siendo manual por TikTok Studio.

const GRAPH = "https://graph.facebook.com/v21.0";
const TOKEN = Deno.env.get("META_PAGE_TOKEN") ?? "";

// Toda accion que publique algo hacia afuera exige aplicar:true. Sin eso la
// funcion responde que haria, pero no lo hace. Es la misma idea del
// --aplicar de scripts/comprimir-fotos-perfil.sh: nada irreversible por
// accidente, porque aca lo irreversible es publico.
const ACCIONES_QUE_ESCRIBEN = ["responder", "dm", "ocultar", "eliminar", "like"];

type Red = "facebook" | "instagram";

interface Identidad {
  pageId: string;
  pageName: string;
  igId: string | null;
  igUsername: string | null;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const anyErr = err as any;
    return anyErr.message || anyErr.error?.message || JSON.stringify(err);
  }
  return String(err);
}

// Todas las llamadas a Meta pasan por aca para que el token nunca se arme a
// mano en cada sitio y para que un error de Meta llegue siempre igual.
async function graph(
  path: string,
  opciones: { metodo?: string; params?: Record<string, string>; body?: Record<string, unknown> } = {},
): Promise<any> {
  const { metodo = "GET", params = {}, body } = opciones;
  const url = new URL(`${GRAPH}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  // El token va en el header, no en el query string: asi no queda escrito en
  // los logs de acceso de Meta ni en los nuestros.
  const res = await fetch(url.toString(), {
    method: metodo,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = datos?.error ?? {};
    throw new Error(
      `Meta ${res.status} en ${metodo} ${path}: ${e.message ?? "sin detalle"}` +
        (e.code ? ` (code ${e.code}${e.error_subcode ? `/${e.error_subcode}` : ""})` : ""),
    );
  }
  return datos;
}

// El token es de Pagina, asi que /me ya es la Pagina. De ahi cuelga la cuenta
// de Instagram vinculada, que es la que manda para todo lo de IG.
let identidadCache: Identidad | null = null;
async function identidad(): Promise<Identidad> {
  if (identidadCache) return identidadCache;
  const p = await graph("me", {
    params: { fields: "id,name,instagram_business_account{id,username}" },
  });
  identidadCache = {
    pageId: p.id,
    pageName: p.name,
    igId: p.instagram_business_account?.id ?? null,
    igUsername: p.instagram_business_account?.username ?? null,
  };
  return identidadCache;
}

// ---------------------------------------------------------------- bandeja

// Un comentario esta PENDIENTE si no lo escribio la propia cuenta, no esta
// oculto, y no tiene ya una respuesta nuestra colgando. Ese ultimo chequeo es
// el que evita volver a contestar lo mismo en cada revision.
function pendiente(c: any, propioId: string, propioUser: string | null): boolean {
  if (c.oculto) return false;
  if (c.autor_id && c.autor_id === propioId) return false;
  if (propioUser && c.autor === propioUser) return false;
  return !c.respondido_por_nosotros;
}

async function comentariosFacebook(id: Identidad, limite: number) {
  const campos =
    "id,message,created_time,permalink_url," +
    "comments.limit(50){id,message,created_time,from,is_hidden,like_count,comments.limit(25){id,from,message}}";

  // Los Reels de Facebook no salen en /posts, van por su propio borde. Este es
  // exactamente el punto ciego que tiene Meta Business Suite y por el que se
  // pasaron comentarios reales: aca se piden los dos a proposito.
  const [posts, reels] = await Promise.all([
    graph(`${id.pageId}/posts`, { params: { fields: campos, limit: String(limite) } }).catch((e) => ({
      data: [],
      _error: errorMessage(e),
    })),
    graph(`${id.pageId}/video_reels`, { params: { fields: campos, limit: String(limite) } }).catch((e) => ({
      data: [],
      _error: errorMessage(e),
    })),
  ]);

  const salida: any[] = [];
  for (const [origen, lote] of [["post", posts], ["reel", reels]] as const) {
    for (const pub of lote.data ?? []) {
      for (const c of pub.comments?.data ?? []) {
        const respuestas = c.comments?.data ?? [];
        const item = {
          red: "facebook" as Red,
          tipo_publicacion: origen,
          publicacion_id: pub.id,
          publicacion_texto: (pub.message ?? "").slice(0, 120),
          enlace: pub.permalink_url ?? null,
          comentario_id: c.id,
          autor: c.from?.name ?? null,
          autor_id: c.from?.id ?? null,
          texto: c.message ?? "",
          fecha: c.created_time,
          likes: c.like_count ?? 0,
          oculto: !!c.is_hidden,
          respondido_por_nosotros: respuestas.some((r: any) => r.from?.id === id.pageId),
        };
        if (pendiente(item, id.pageId, null)) salida.push(item);
      }
    }
  }
  const errores = [(posts as any)._error, (reels as any)._error].filter(Boolean);
  return { comentarios: salida, errores };
}

async function comentariosInstagram(id: Identidad, limite: number) {
  if (!id.igId) return { comentarios: [], errores: ["La Pagina no tiene cuenta de Instagram vinculada."] };

  // En Instagram los Reels SI vienen dentro de /media (media_product_type lo
  // distingue), asi que con un solo borde alcanza.
  const media = await graph(`${id.igId}/media`, {
    params: {
      fields:
        "id,caption,media_type,media_product_type,permalink,timestamp," +
        "comments.limit(50){id,text,timestamp,username,hidden,like_count,replies.limit(25){id,username,text}}",
      limit: String(limite),
    },
  }).catch((e) => ({ data: [], _error: errorMessage(e) }));

  const salida: any[] = [];
  for (const m of (media as any).data ?? []) {
    for (const c of m.comments?.data ?? []) {
      const respuestas = c.replies?.data ?? [];
      const item = {
        red: "instagram" as Red,
        tipo_publicacion: (m.media_product_type ?? m.media_type ?? "").toLowerCase(),
        publicacion_id: m.id,
        publicacion_texto: (m.caption ?? "").slice(0, 120),
        enlace: m.permalink ?? null,
        comentario_id: c.id,
        autor: c.username ?? null,
        autor_id: null,
        texto: c.text ?? "",
        fecha: c.timestamp,
        likes: c.like_count ?? 0,
        oculto: !!c.hidden,
        respondido_por_nosotros: respuestas.some((r: any) => r.username === id.igUsername),
      };
      if (pendiente(item, "", id.igUsername)) salida.push(item);
    }
  }
  const err = (media as any)._error;
  return { comentarios: salida, errores: err ? [err] : [] };
}

// Los DMs de las dos redes salen del mismo borde de la Pagina, cambiando
// platform. unread_count es lo que marca cuales estan sin leer.
async function conversaciones(id: Identidad, red: Red, limite: number) {
  const plataforma = red === "facebook" ? "messenger" : "instagram";
  const datos = await graph(`${id.pageId}/conversations`, {
    params: {
      platform: plataforma,
      fields: "id,updated_time,unread_count,participants,messages.limit(8){id,created_time,from,message}",
      limit: String(limite),
    },
  });
  return (datos.data ?? []).map((c: any) => ({
    red,
    conversacion_id: c.id,
    actualizada: c.updated_time,
    sin_leer: c.unread_count ?? 0,
    // El participante que no es la Pagina es la persona. Su id es el que sirve
    // para responder en el hilo.
    persona: (c.participants?.data ?? []).find((p: any) => p.id !== id.pageId) ?? null,
    mensajes: (c.messages?.data ?? []).map((m: any) => ({
      de: m.from?.name ?? m.from?.username ?? null,
      de_id: m.from?.id ?? null,
      texto: m.message ?? "",
      fecha: m.created_time,
    })),
  }));
}

// ---------------------------------------------------------------- acciones

async function responder(red: Red, comentarioId: string, texto: string) {
  // Instagram cuelga las respuestas de /replies; Facebook las trata como un
  // comentario hijo. Mismo efecto, bordes distintos.
  if (red === "instagram") {
    return await graph(`${comentarioId}/replies`, { metodo: "POST", body: { message: texto } });
  }
  return await graph(`${comentarioId}/comments`, { metodo: "POST", body: { message: texto } });
}

// Respuesta privada a un comentario: abre el DM sin que la persona tenga que
// escribir primero. Es justo lo que pide la regla de negocio de no invitar en
// publico a escribir por interno. Meta solo lo permite una vez por comentario
// y dentro de los 7 dias siguientes.
async function mensajePrivado(
  id: Identidad,
  red: Red,
  texto: string,
  comentarioId?: string,
  destinatarioId?: string,
) {
  if (!comentarioId && !destinatarioId) {
    throw new Error("Falta comentario_id (respuesta privada) o destinatario_id (hilo ya abierto).");
  }
  const recipient = comentarioId ? { comment_id: comentarioId } : { id: destinatarioId };
  // Instagram manda por el id de la cuenta de IG; Facebook por el de la Pagina.
  const emisor = red === "instagram" ? (id.igId ?? id.pageId) : id.pageId;
  return await graph(`${emisor}/messages`, {
    metodo: "POST",
    body: {
      recipient,
      message: { text: texto },
      ...(destinatarioId ? { messaging_type: "RESPONSE" } : {}),
    },
  });
}

// Ocultar deja el comentario visible para quien lo escribio (no percibe
// bloqueo) y conserva la interaccion para el algoritmo. Es reversible, a
// diferencia de eliminar. En Instagram esto NO existe en Business Suite (solo
// en la app del celular), pero la Graph API si lo expone.
async function ocultar(red: Red, comentarioId: string) {
  const body = red === "instagram" ? { hide: true } : { is_hidden: true };
  return await graph(comentarioId, { metodo: "POST", body });
}

async function eliminar(comentarioId: string) {
  return await graph(comentarioId, { metodo: "DELETE" });
}

// Dar like es el acuse de recibo para reacciones simples (un emoji, un chiste)
// que no ameritan respuesta. Instagram no expone un borde para esto.
async function darLike(red: Red, comentarioId: string) {
  if (red === "instagram") {
    throw new Error("Instagram no permite dar like a comentarios por API. Solo Facebook.");
  }
  return await graph(`${comentarioId}/likes`, { metodo: "POST" });
}

// Prueba cada permiso por separado contra la API real, en vez de confiar en lo
// que diga el token. Es lo primero que hay que correr despues de crearlo: dice
// exactamente que falta y donde.
async function diagnostico() {
  const resultado: Record<string, unknown> = {};
  if (!TOKEN) {
    return { ok: false, error: "Falta el secreto META_PAGE_TOKEN. Ver supabase/REDES-SOCIALES.md" };
  }

  const id = await identidad();
  resultado.pagina = { id: id.pageId, nombre: id.pageName };
  resultado.instagram = id.igId ? { id: id.igId, usuario: id.igUsername } : "sin cuenta vinculada";

  const permisos = await graph("me/permissions").catch((e) => ({ data: [], _error: errorMessage(e) }));
  resultado.permisos_concedidos = ((permisos as any).data ?? [])
    .filter((p: any) => p.status === "granted")
    .map((p: any) => p.permission);

  // Cada prueba es de solo lectura y se reporta aparte: si una falla, las
  // demas siguen y se ve cual es el hueco real.
  const pruebas: Array<[string, () => Promise<unknown>]> = [
    ["leer publicaciones facebook", () => graph(`${id.pageId}/posts`, { params: { limit: "1" } })],
    ["leer reels facebook", () => graph(`${id.pageId}/video_reels`, { params: { limit: "1" } })],
    ["leer dms facebook", () => graph(`${id.pageId}/conversations`, { params: { platform: "messenger", limit: "1" } })],
    ["leer dms instagram", () => graph(`${id.pageId}/conversations`, { params: { platform: "instagram", limit: "1" } })],
  ];
  if (id.igId) {
    pruebas.push(["leer publicaciones instagram", () => graph(`${id.igId}/media`, { params: { limit: "1" } })]);
  }

  const capacidades: Record<string, string> = {};
  for (const [nombre, fn] of pruebas) {
    try {
      await fn();
      capacidades[nombre] = "ok";
    } catch (e) {
      capacidades[nombre] = errorMessage(e);
    }
  }
  resultado.capacidades = capacidades;

  // Un token de corta duracion se vence en horas y deja todo tirado sin aviso.
  // Mejor saberlo aca que a mitad de una tanda de respuestas.
  try {
    const info = await graph("debug_token", { params: { input_token: TOKEN } });
    const d = info.data ?? {};
    resultado.token = {
      tipo: d.type,
      vence: d.expires_at ? new Date(d.expires_at * 1000).toISOString() : "nunca (larga duracion)",
      valido: d.is_valid,
    };
  } catch (e) {
    resultado.token = `no se pudo inspeccionar: ${errorMessage(e)}`;
  }

  return { ok: true, ...resultado };
}

// ---------------------------------------------------------------- handler

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    // verify_jwt por si solo NO alcanza: la anon key tambien es un JWT valido y
    // va dentro de la app publicada (los cron de este proyecto la usan para
    // llamar funciones). Con eso cualquiera podria publicar en nombre de la
    // marca, asi que aca se exige una credencial de verdad.
    //
    // Se aceptan dos, igual que el resto del proyecto:
    //   - la service role key, para el admin y la app
    //   - el header x-redes-secret, para llamadas desde pg_net/cron, que no
    //     tienen la service role key a mano (mismo patron que x-cron-secret
    //     en wompi-charge-subscriptions-cron y x-webhook-secret en
    //     cleanup-expired-chat-media)
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const redesSecret = Deno.env.get("REDES_SECRET") ?? "";
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    const secretoRecibido = (req.headers.get("x-redes-secret") ?? "").trim();

    const porServiceRole = serviceRoleKey !== "" && jwt === serviceRoleKey;
    const porSecreto = redesSecret !== "" && secretoRecibido === redesSecret;
    if (!porServiceRole && !porSecreto) {
      return json({ error: "Unauthorized: falta la service role key o el header x-redes-secret" }, 401);
    }

    if (!TOKEN) {
      return json({ error: "Falta el secreto META_PAGE_TOKEN. Ver supabase/REDES-SOCIALES.md" }, 500);
    }

    const cuerpo = await req.json().catch(() => ({}));
    const accion = String(cuerpo.accion ?? "");
    const red: Red = cuerpo.red === "facebook" ? "facebook" : "instagram";
    const limite = Math.min(Number(cuerpo.limite ?? 15), 50);
    const aplicar = cuerpo.aplicar === true;

    if (accion === "diagnostico") return json(await diagnostico());

    const id = await identidad();

    if (accion === "bandeja") {
      const [fb, ig] = await Promise.all([comentariosFacebook(id, limite), comentariosInstagram(id, limite)]);
      const [dmFb, dmIg] = await Promise.all([
        conversaciones(id, "facebook", limite).catch((e) => ({ _error: errorMessage(e) })),
        conversaciones(id, "instagram", limite).catch((e) => ({ _error: errorMessage(e) })),
      ]);
      return json({
        cuenta: { pagina: id.pageName, instagram: id.igUsername },
        comentarios_pendientes: [...fb.comentarios, ...ig.comentarios].sort((a, b) =>
          String(b.fecha).localeCompare(String(a.fecha)),
        ),
        conversaciones: { facebook: dmFb, instagram: dmIg },
        avisos: [...fb.errores, ...ig.errores],
      });
    }

    if (accion === "conversaciones") {
      return json({ conversaciones: await conversaciones(id, red, limite) });
    }

    if (!ACCIONES_QUE_ESCRIBEN.includes(accion)) {
      return json({ error: `Accion desconocida: "${accion}"`, disponibles: ["diagnostico", "bandeja", "conversaciones", ...ACCIONES_QUE_ESCRIBEN] }, 400);
    }

    const comentarioId = cuerpo.comentario_id ? String(cuerpo.comentario_id) : undefined;
    const destinatarioId = cuerpo.destinatario_id ? String(cuerpo.destinatario_id) : undefined;
    const texto = cuerpo.texto ? String(cuerpo.texto) : "";

    if (["responder", "dm"].includes(accion) && !texto.trim()) {
      return json({ error: "Falta el texto del mensaje." }, 400);
    }
    if (accion !== "dm" && !comentarioId) {
      return json({ error: "Falta comentario_id." }, 400);
    }

    if (!aplicar) {
      return json({
        simulacion: true,
        nota: "Nada se publico. Repetir con aplicar:true para ejecutarlo de verdad.",
        haria: { accion, red, comentario_id: comentarioId, destinatario_id: destinatarioId, texto },
      });
    }

    let respuesta: unknown;
    switch (accion) {
      case "responder": respuesta = await responder(red, comentarioId!, texto); break;
      case "dm": respuesta = await mensajePrivado(id, red, texto, comentarioId, destinatarioId); break;
      case "ocultar": respuesta = await ocultar(red, comentarioId!); break;
      case "eliminar": respuesta = await eliminar(comentarioId!); break;
      case "like": respuesta = await darLike(red, comentarioId!); break;
    }

    await registrar({
      red,
      accion,
      objeto_id: comentarioId ?? destinatarioId ?? "",
      autor: cuerpo.autor ?? null,
      texto_original: cuerpo.texto_original ?? null,
      texto_enviado: texto || null,
      resultado: "ok",
      detalle: respuesta,
    });

    return json({ ok: true, accion, resultado: respuesta });
  } catch (err) {
    const mensaje = errorMessage(err);
    console.error("redes-sociales:", mensaje);
    // El fallo tambien queda en la tabla: si una respuesta no salio, tiene que
    // notarse despues, no perderse en los logs.
    await registrar({
      red: "facebook",
      accion: "error",
      objeto_id: "",
      resultado: "error",
      detalle: { mensaje },
    }).catch(() => {});
    return json({ error: mensaje }, 500);
  }
});

function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Deja constancia de cada accion. Sin esto no hay forma de saber, desde otro
// chat o dias despues, a quien ya se le respondio y con que.
async function registrar(fila: Record<string, unknown>): Promise<void> {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    await supabase.from("redes_interacciones").insert(fila);
  } catch (e) {
    console.error("no se pudo registrar la interaccion:", errorMessage(e));
  }
}
