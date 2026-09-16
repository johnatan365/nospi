// Buscador de GIFs del chat.
//
// Se usa Tenor (de Google) y no Giphy a proposito: Tenor es EL MISMO catalogo
// que usa WhatsApp cuando la persona toca el boton de GIF, y el mismo del
// teclado de iOS. O sea, lo que la gente ya esta acostumbrada a encontrar
// buscando "abrazo" o "jajaja" en WhatsApp lo va a encontrar igual aca.
//
// Lo que NO se puede hacer, y conviene tenerlo claro: los GIFs marcados como
// favoritos DENTRO de WhatsApp viven en el almacenamiento privado de esa app y
// ningun programa externo puede leerlos. Por eso la lista de "Recientes" de
// aca se construye sola: guarda en el telefono los ultimos GIFs que la persona
// mando por Nospi, y con el uso termina siendo su propia lista de favoritos.

import Constants from 'expo-constants';

// La llave se lee de app.json (extra.tenorApiKey), igual que las de Supabase,
// con respaldo por variable de entorno por si algun dia se saca de ahi.
// Es una llave PUBLICA de cliente: Tenor esta disenado asi, la app la manda en
// cada peticion y no hay forma de esconderla. Lo que si hay que hacer es
// restringirla en Google Cloud para que SOLO sirva para la API de Tenor; asi,
// aunque alguien la copie del repo, no puede usarla para nada mas.
const TENOR_KEY =
  (Constants.expoConfig?.extra as any)?.tenorApiKey ||
  process.env.EXPO_PUBLIC_TENOR_API_KEY ||
  '';
const TENOR_BASE = 'https://tenor.googleapis.com/v2';

// Identifica a la app ante Tenor. Sirve para que las sugerencias y el historial
// de busqueda sean coherentes entre peticiones de un mismo producto.
const CLIENT_KEY = 'nospi_app';

// Contenido apto: Tenor clasifica sus GIFs y por defecto trae de todo. El chat
// de Nospi es grupal y con gente que apenas se esta conociendo, asi que se pide
// solo el nivel mas suave. Vale mas quedarse corto que meter una groseria en un
// grupo de 150 personas.
const CONTENT_FILTER = 'high';

// Formatos que se piden. 'tinygif' es la miniatura liviana para la grilla (no
// tiene sentido bajar 3 MB por cada casilla de una cuadricula), 'gif' es el
// archivo bueno, y 'mediumgif' es el respaldo para cuando el bueno resulta
// demasiado pesado para el tope del chat.
const MEDIA_FILTER = 'tinygif,mediumgif,gif';

// Por encima de esto se manda la version mediana en vez de la original. Son
// GIFs: la diferencia de nitidez no se nota, pero la de peso si, sobre todo
// con datos moviles.
const PESO_MAXIMO_GIF = 8 * 1024 * 1024;

export type TenorGif = {
  id: string;
  /** Texto descriptivo: se usa como alternativa accesible y como nombre de archivo. */
  description: string;
  /** Miniatura liviana para pintar la grilla. */
  previewUrl: string;
  previewWidth: number;
  previewHeight: number;
  /** El GIF de verdad, el que se envia. */
  fullUrl: string;
  fullSize: number;
};

// Una llave de Google siempre empieza por "AIza". Se comprueba asi para que un
// texto de relleno olvidado en app.json cuente como "sin configurar" y el boton
// de GIF ni siquiera aparezca, en vez de aparecer y fallar al tocarlo.
export function tenorConfigurado(): boolean {
  return TENOR_KEY.startsWith('AIza');
}

function pickFormat(gif: any, name: string) {
  const f = gif?.media_formats?.[name];
  if (!f?.url) return null;
  const dims = Array.isArray(f.dims) ? f.dims : [];
  return {
    url: f.url as string,
    width: Number(dims[0]) || 0,
    height: Number(dims[1]) || 0,
    size: Number(f.size) || 0,
  };
}

function normalize(raw: any): TenorGif | null {
  const preview = pickFormat(raw, 'tinygif') || pickFormat(raw, 'gif');
  const original = pickFormat(raw, 'gif');
  const mediano = pickFormat(raw, 'mediumgif');
  // Se manda el original salvo que pese demasiado; ahi entra el mediano.
  const full =
    original && original.size > PESO_MAXIMO_GIF && mediano
      ? mediano
      : original || mediano || preview;
  if (!preview || !full) return null;
  return {
    id: String(raw.id || full.url),
    description: String(raw.content_description || 'GIF'),
    previewUrl: preview.url,
    previewWidth: preview.width || 200,
    previewHeight: preview.height || 200,
    fullUrl: full.url,
    fullSize: full.size,
  };
}

async function pedir(path: string, params: Record<string, string>): Promise<TenorGif[]> {
  if (!TENOR_KEY) return [];
  const qs = new URLSearchParams({
    key: TENOR_KEY,
    client_key: CLIENT_KEY,
    contentfilter: CONTENT_FILTER,
    media_filter: MEDIA_FILTER,
    country: 'CO',
    locale: 'es_CO',
    ...params,
  });
  const res = await fetch(`${TENOR_BASE}/${path}?${qs.toString()}`);
  if (!res.ok) throw new Error(`Tenor respondio ${res.status}`);
  const json = await res.json();
  const results = Array.isArray(json?.results) ? json.results : [];
  return results.map(normalize).filter(Boolean) as TenorGif[];
}

/** Lo que esta sonando ahora mismo. Es lo que se ve al abrir el selector. */
export function tenorTendencias(limite = 30): Promise<TenorGif[]> {
  return pedir('featured', { limit: String(limite) });
}

/** Busqueda por texto. */
export function tenorBuscar(consulta: string, limite = 30): Promise<TenorGif[]> {
  const q = consulta.trim();
  if (!q) return tenorTendencias(limite);
  return pedir('search', { q, limit: String(limite), random: 'false' });
}

/**
 * Sugerencias mientras se escribe ("abra" -> "abrazo", "abrazos"). Es lo que
 * hace que buscar en espanol no sea una loteria.
 */
export async function tenorSugerencias(consulta: string, limite = 8): Promise<string[]> {
  const q = consulta.trim();
  if (!TENOR_KEY || !q) return [];
  const qs = new URLSearchParams({
    key: TENOR_KEY,
    client_key: CLIENT_KEY,
    q,
    limit: String(limite),
    country: 'CO',
    locale: 'es_CO',
  });
  try {
    const res = await fetch(`${TENOR_BASE}/autocomplete?${qs.toString()}`);
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json?.results) ? json.results.map(String) : [];
  } catch {
    return [];
  }
}

/**
 * Le avisa a Tenor cual GIF se termino enviando. No es opcional por capricho:
 * los terminos de uso lo piden, y ademas es lo que hace que con el tiempo los
 * resultados de busqueda se acomoden a lo que la gente de aca realmente manda.
 * Si falla, no pasa nada: nunca debe tumbar el envio de un mensaje.
 */
export function tenorRegistrarEnvio(gifId: string, consulta: string): void {
  if (!TENOR_KEY || !gifId) return;
  const qs = new URLSearchParams({
    key: TENOR_KEY,
    client_key: CLIENT_KEY,
    id: gifId,
    q: consulta.trim(),
    country: 'CO',
    locale: 'es_CO',
  });
  fetch(`${TENOR_BASE}/registershare?${qs.toString()}`).catch(() => {});
}
