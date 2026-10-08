import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const WEBHOOK_TOKEN = "7bb46a6e95dfdc543cab8eaf1e072e81ec9cbb7e11e7ac6d";

// Headers de navegador. Google suele servir la pagina directa (con coords) a un
// User-Agent de navegador, en vez de mandar a la pagina de consentimiento.
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  "Accept-Language": "es-CO,es;q=0.9",
};

// Allow-list de hosts de Google Maps para el maps_link. Evita SSRF: solo se
// hace fetch a enlaces cuyo host este permitido (o sea subdominio de
// google.com / goo.gl).
function isAllowedMapsHost(link: string): boolean {
  let host: string;
  try {
    host = new URL(link).hostname.toLowerCase();
  } catch {
    return false;
  }
  const allowed = new Set([
    "maps.google.com",
    "www.google.com",
    "google.com",
    "goo.gl",
    "maps.app.goo.gl",
    "maps.googleapis.com",
  ]);
  if (allowed.has(host)) return true;
  if (host === "google.com" || host.endsWith(".google.com")) return true;
  if (host === "goo.gl" || host.endsWith(".goo.gl")) return true;
  return false;
}

function extractCoordsFromUrl(finalUrl: string): { lat: number; lng: number } | null {
  const placeMatch = finalUrl.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (placeMatch) {
    return { lat: parseFloat(placeMatch[1]), lng: parseFloat(placeMatch[2]) };
  }
  const atMatch = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atMatch) {
    return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };
  }
  const qMatch = finalUrl.match(/[?&](?:q|ll)=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (qMatch) {
    return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };
  }
  return null;
}

// Extrae coords de los parametros anidados de una URL/string. Google usa
// consent.google.com?continue=<URL_de_maps_con_coords> (u otros params como
// q/url/link/daddr) para envolver el destino real. Se decodifica cada valor y
// se corre extractCoordsFromUrl sobre el.
function extractFromNested(u: string | URL): { lat: number; lng: number } | null {
  const raw = typeof u === "string" ? u : u.toString();
  const nestedKeys = ["continue", "q", "url", "link", "daddr"];
  const candidates: string[] = [];

  // Via URLSearchParams (mas confiable cuando la URL parsea bien).
  try {
    const parsed = new URL(raw);
    for (const key of nestedKeys) {
      const val = parsed.searchParams.get(key);
      if (val) candidates.push(val);
    }
  } catch {
    // ignorar: cae al metodo por regex de abajo
  }

  // Via regex sobre el string crudo (captura params aunque no parsee como URL,
  // o params anidados dentro de un valor ya decodificado).
  for (const key of nestedKeys) {
    const re = new RegExp("[?&]" + key + "=([^&]+)", "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw)) !== null) {
      candidates.push(m[1]);
    }
  }

  for (const candidate of candidates) {
    let decoded = candidate;
    try {
      decoded = decodeURIComponent(candidate.replace(/\+/g, " "));
    } catch {
      decoded = candidate;
    }
    const coords = extractCoordsFromUrl(decoded);
    if (coords) return coords;
    // A veces el valor decodificado vuelve a traer params anidados (doble encode).
    const nested = extractCoordsFromUrl(candidate);
    if (nested) return nested;
  }
  return null;
}

// Sigue la cadena de redirects manualmente (hasta 6 saltos). En cada salto
// intenta extraer coords de: la URL actual, el header Location, y los params
// anidados del Location. Valida el host de cada salto contra la allow-list
// (SSRF) antes de seguirlo. Devuelve las coords apenas las encuentre, y el
// ultimo finalUrl resuelto para diagnostico.
async function followRedirectsManually(
  startUrl: string
): Promise<{ coords: { lat: number; lng: number } | null; finalUrl: string }> {
  let current = startUrl;
  const maxHops = 6;

  for (let hop = 0; hop < maxHops; hop++) {
    // (a) coords en la URL actual
    const fromCurrent = extractCoordsFromUrl(current) ?? extractFromNested(current);
    if (fromCurrent) return { coords: fromCurrent, finalUrl: current };

    if (!isAllowedMapsHost(current)) {
      // No seguimos hacia un host no permitido.
      return { coords: null, finalUrl: current };
    }

    let resp: Response;
    try {
      resp = await fetch(current, { redirect: "manual", headers: BROWSER_HEADERS });
    } catch {
      return { coords: null, finalUrl: current };
    }
    // Drenar el cuerpo para no dejar conexiones colgadas.
    await resp.arrayBuffer().catch(() => {});

    const loc = resp.headers.get("location");
    if (!loc) {
      // No hay mas redirects: intento final sobre la URL actual.
      const fromFinal = extractCoordsFromUrl(current) ?? extractFromNested(current);
      return { coords: fromFinal, finalUrl: current };
    }

    // (b) + (c) coords en el header Location y en sus params anidados.
    const fromLoc = extractCoordsFromUrl(loc) ?? extractFromNested(loc);
    if (fromLoc) return { coords: fromLoc, finalUrl: loc };

    // Resolver Location relativo contra la URL actual.
    let next: string;
    try {
      next = new URL(loc, current).toString();
    } catch {
      return { coords: null, finalUrl: current };
    }

    // Validar el host del proximo salto (SSRF) antes de seguirlo.
    if (!isAllowedMapsHost(next)) {
      return { coords: null, finalUrl: next };
    }
    current = next;
  }

  return { coords: null, finalUrl: current };
}

// Ultimo recurso antes de geocodificar: descarga el body y busca coords en el
// texto HTML de Maps, que casi siempre trae las coords ahi aunque la URL no. Solo
// patrones anclados (!3d!4d y @lat,lng) para evitar falsos positivos.
async function extractCoordsFromBody(
  mapsLink: string
): Promise<{ coords: { lat: number; lng: number } | null; finalUrl: string }> {
  let resp: Response;
  try {
    resp = await fetch(mapsLink, { redirect: "follow", headers: BROWSER_HEADERS });
  } catch {
    return { coords: null, finalUrl: mapsLink };
  }
  const finalUrl = resp.url || mapsLink;
  let body = "";
  try {
    body = await resp.text();
  } catch {
    return { coords: null, finalUrl };
  }

  const placeMatch = body.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (placeMatch) {
    return {
      coords: { lat: parseFloat(placeMatch[1]), lng: parseFloat(placeMatch[2]) },
      finalUrl,
    };
  }
  const atMatch = body.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atMatch) {
    return {
      coords: { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) },
      finalUrl,
    };
  }
  return { coords: null, finalUrl };
}

async function geocodeAddressFromUrl(finalUrl: string): Promise<{ lat: number; lng: number } | null> {
  const addressMatch = finalUrl.match(/[?&](?:q|daddr)=([^&]+)/);
  if (!addressMatch) return null;

  const rawAddress = decodeURIComponent(addressMatch[1].replace(/\+/g, " "));
  const searchUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(rawAddress)}`;

  const resp = await fetch(searchUrl, {
    headers: { "User-Agent": "Nospi-EventLocationResolver/1.0 (nospisocial@gmail.com)" },
  });
  if (!resp.ok) return null;
  const results = await resp.json();
  if (!Array.isArray(results) || results.length === 0) return null;

  const lat = parseFloat(results[0].lat);
  const lng = parseFloat(results[0].lon);
  if (isNaN(lat) || isNaN(lng)) return null;
  return { lat, lng };
}

// Orquesta el orden de intento:
//   (a) cadena de redirects manual (URL / Location / anidados)
//   (b) fetch follow + finalUrl + anidados
//   (c) parseo del body (patrones anclados)
//   (d) geocodificacion de direccion (q= / daddr=)
// Devuelve coords apenas alguna etapa las encuentre, y el finalUrl resuelto.
async function resolveCoords(
  mapsLink: string
): Promise<{ coords: { lat: number; lng: number } | null; finalUrl: string }> {
  // (a) Cadena de redirects manual.
  const manual = await followRedirectsManually(mapsLink);
  let finalUrl = manual.finalUrl;
  if (manual.coords) return { coords: manual.coords, finalUrl };

  // (b) fetch follow + finalUrl + params anidados.
  try {
    const resp = await fetch(mapsLink, { redirect: "follow", headers: BROWSER_HEADERS });
    await resp.arrayBuffer().catch(() => {});
    finalUrl = resp.url || finalUrl;
    const fromUrl = extractCoordsFromUrl(finalUrl) ?? extractFromNested(finalUrl);
    if (fromUrl) return { coords: fromUrl, finalUrl };
  } catch {
    // continuar con las siguientes etapas
  }

  // (c) Parseo del body.
  const bodyResult = await extractCoordsFromBody(mapsLink);
  if (bodyResult.finalUrl) finalUrl = bodyResult.finalUrl;
  if (bodyResult.coords) return { coords: bodyResult.coords, finalUrl };

  // (d) Geocodificacion de direccion.
  const geo = await geocodeAddressFromUrl(finalUrl);
  if (geo) return { coords: geo, finalUrl };

  return { coords: null, finalUrl };
}

Deno.serve(async (req: Request) => {
  try {
    const token = req.headers.get("x-webhook-token");
    if (token !== WEBHOOK_TOKEN) {
      return new Response(JSON.stringify({ success: false, error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { id, maps_link } = await req.json();
    if (!id || !maps_link) {
      return new Response(JSON.stringify({ success: false, error: "missing id or maps_link" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Validar host del maps_link contra la allow-list antes de hacer fetch.
    if (!isAllowedMapsHost(maps_link)) {
      return new Response(JSON.stringify({ success: false, error: "host no permitido" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { coords, finalUrl } = await resolveCoords(maps_link);
    if (!coords) {
      return new Response(
        JSON.stringify({ success: false, error: "no se pudieron extraer coordenadas", finalUrl }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { error } = await supabase
      .from("events")
      .update({ latitude: coords.lat, longitude: coords.lng })
      .eq("id", id);

    if (error) {
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, ...coords }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
