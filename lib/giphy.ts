// Buscador de GIFs del chat.
//
// HISTORIA, para que nadie repita el error: esto estuvo escrito contra Tenor,
// que era el catalogo de WhatsApp. Google cerro esa API el 30 de junio de 2026
// y de paso rompio los buscadores de GIF de Discord, X y Bluesky. Ya no existe
// forma de sacar una llave de Tenor. Por eso ahora va contra GIPHY.
//
// GIPHY da una llave gratis, al instante y sin pedir permiso, con un tope de
// 100 peticiones por hora PARA TODA LA APP (no por persona). Ese tope es el que
// manda en el diseno de este archivo:
//
//   - Se guarda en memoria lo que ya se busco (cache), asi que repetir una
//     busqueda no gasta una peticion.
//   - La pantalla del chat espera a que la persona deje de escribir antes de
//     llamar; sin eso se gastaria una peticion por cada letra.
//   - Si aun asi se llena el cupo, GIPHY responde 429 y aca se traduce a un
//     mensaje que la persona entiende, en vez de dejar la pantalla en blanco.
//
// GIPHY exige dar credito visible ("Powered by GIPHY"). La pantalla del chat lo
// muestra; no lo quites, es parte de las condiciones de la llave gratis.

import Constants from 'expo-constants';
import appJson from '@/app.json';

// Llave PUBLICA de cliente: GIPHY esta disenado asi, la app la manda en cada
// peticion y no hay forma de esconderla. Se lee de app.json igual que las de
// Supabase.
//
// Se buscan VARIOS sitios a proposito. 'expoConfig' es el moderno, pero segun
// la plataforma y la version de Expo la misma configuracion aparece bajo
// 'manifest' o anidada en 'manifest2'. Leer solo uno funciona en el celular y
// deja la llave vacia en la web (o al reves), y el sintoma es de los que cuesta
// encontrar: la funcion simplemente no aparece, sin ningun error.
//
// Y se lee TAMBIEN de app.json directamente, que es lo que al final salvo el
// dia. Comprobado en la web publicada: expo-constants no lee app.json cuando
// la app corre, sino una copia que se congela al compilar; el build de Vercel
// reuso una copia vieja (de antes de que existiera esta llave) y entrego un
// extra con supabaseUrl y supabaseAnonKey pero SIN giphyApiKey. Por eso
// Supabase funcionaba y el buscador de GIFs decia "no esta configurado".
// Importar app.json no pesa nada extra (la pantalla de bienvenida y el perfil
// ya lo importan) y no depende de ningun cache de compilacion.
const C = Constants as any;
const A = appJson as any;
const GIPHY_KEY: string = String(
  C?.expoConfig?.extra?.giphyApiKey ||
  C?.manifest?.extra?.giphyApiKey ||
  C?.manifest2?.extra?.expoClient?.extra?.giphyApiKey ||
  C?.manifestExtra?.giphyApiKey ||
  A?.expo?.extra?.giphyApiKey ||
  process.env.EXPO_PUBLIC_GIPHY_API_KEY ||
  ''
).trim();
const GIPHY_BASE = 'https://api.giphy.com/v1/gifs';

// Clasificacion de contenido. El chat de Nospi es grupal y con gente que apenas
// se esta conociendo: vale mas quedarse corto que meter una groseria en un
// grupo de 150 personas. 'pg' deja pasar humor pero no contenido subido de tono.
const RATING = 'pg';

// Cuantos GIFs se piden por busqueda. Mas de esto no cabe en la pantalla sin
// desplazarse un buen rato, y cada uno pesa.
const LIMITE = 30;

// Cuanto dura lo guardado en memoria. Media hora: suficiente para que abrir y
// cerrar el buscador varias veces seguidas no gaste ni una peticion, y poco
// como para que las tendencias no se queden viejas.
const CACHE_MS = 30 * 60 * 1000;

export type Gif = {
  id: string;
  /** Texto descriptivo: alternativa accesible y nombre del archivo. */
  description: string;
  /** Miniatura liviana para pintar la grilla. */
  previewUrl: string;
  previewWidth: number;
  previewHeight: number;
  /** El GIF de verdad, el que se envia. */
  fullUrl: string;
  fullSize: number;
};

/** Error con nombre propio para el cupo lleno, que la pantalla trata distinto. */
export class GiphySinCupo extends Error {
  constructor() {
    super('cupo de GIPHY lleno');
    this.name = 'GiphySinCupo';
  }
}

// Sirve para EXPLICAR, no para esconder. El boton de GIF se muestra siempre:
// si la llave falta, quien lo toque ve un mensaje que lo dice. Antes este
// chequeo decidia si el boton existia, y cuando fallo por lo de arriba el
// boton se esfumo sin dejar rastro ni error. Un boton que explica que le falta
// algo es mil veces mas facil de arreglar que un boton que no esta.
export function giphyConfigurado(): boolean {
  return /^[A-Za-z0-9]{20,}$/.test(GIPHY_KEY);
}

const cache = new Map<string, { t: number; gifs: Gif[] }>();

function pick(im: any, ...nombres: string[]) {
  for (const n of nombres) {
    const f = im?.[n];
    if (f?.url) {
      return {
        url: String(f.url).split('?')[0],
        width: Number(f.width) || 0,
        height: Number(f.height) || 0,
        size: Number(f.size) || 0,
      };
    }
  }
  return null;
}

function normalize(raw: any): Gif | null {
  const im = raw?.images;
  // La miniatura va downsampled a proposito: son 200px de ancho y bastantes
  // menos cuadros, o sea una fraccion del peso (~70 KB medidos contra la API).
  // Bajar el GIF bueno por cada casilla de la grilla se comeria los datos de la
  // persona.
  const preview = pick(im, 'fixed_width_downsampled', 'fixed_width_small', 'fixed_width', 'downsized');
  // El que se envia es 'downsized', que GIPHY garantiza por debajo de 2 MB.
  // OJO con el orden: 'downsized_medium' NO va primero aunque suene a termino
  // medio; midiendolo contra la API resulto pesar lo mismo que el original (4+
  // MB). 'downsized' da entre 250 KB y 1.8 MB con 220-480px de ancho, que es
  // justo lo que necesita una burbuja de chat.
  const full = pick(im, 'downsized', 'fixed_width', 'downsized_medium', 'original');
  if (!preview || !full) return null;
  return {
    id: String(raw.id || full.url),
    description: String(raw.title || raw.alt_text || 'GIF'),
    previewUrl: preview.url,
    previewWidth: preview.width || 200,
    previewHeight: preview.height || 200,
    fullUrl: full.url,
    fullSize: full.size,
  };
}

async function pedir(clave: string, path: string, params: Record<string, string>): Promise<Gif[]> {
  if (!giphyConfigurado()) return [];

  const guardado = cache.get(clave);
  if (guardado && Date.now() - guardado.t < CACHE_MS) return guardado.gifs;

  // Sin 'bundle'. El bundle 'messaging_non_clips' suena hecho a la medida para
  // un chat, pero recorta la respuesta a 7 formatos y entre los que quita esta
  // 'downsized': deja solo miniaturas de 200px o el original de 4 MB, o sea
  // GIFs borrosos o GIFs pesadisimos. Comprobado llamando a la API.
  const qs = new URLSearchParams({
    api_key: GIPHY_KEY,
    limit: String(LIMITE),
    rating: RATING,
    ...params,
  });

  const res = await fetch(`${GIPHY_BASE}/${path}?${qs.toString()}`);
  if (res.status === 429) throw new GiphySinCupo();
  if (!res.ok) throw new Error(`GIPHY respondio ${res.status}`);

  const json = await res.json();
  const gifs = (Array.isArray(json?.data) ? json.data : [])
    .map(normalize)
    .filter(Boolean) as Gif[];

  cache.set(clave, { t: Date.now(), gifs });
  return gifs;
}

/** Lo que esta sonando ahora. Es lo que se ve al abrir el buscador. */
export function gifsTendencia(): Promise<Gif[]> {
  return pedir('__trending__', 'trending', {});
}

/** Busqueda por texto, en espanol. */
export function gifsBuscar(consulta: string): Promise<Gif[]> {
  const q = consulta.trim();
  if (!q) return gifsTendencia();
  return pedir(`q:${q.toLowerCase()}`, 'search', { q, lang: 'es' });
}
