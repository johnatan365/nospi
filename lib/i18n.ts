// Sistema de idiomas de Nospi (español / inglés).
//
// Por que esta hecho a mano y sin libreria: agregar i18next o expo-localization
// obliga a recompilar lo nativo, y los builds de iOS/Android son justo donde
// mas se rompe esta app. Esto usa solo APIs que ya existen en el runtime
// (navigator.language en web, Intl en Hermes), asi que no toca nada nativo.
//
// La fuente de los textos es constants/Textos.ts. Aqui solo vive la maquinaria.

export type Idioma = 'es' | 'en';

export const IDIOMA_POR_DEFECTO: Idioma = 'es';

// Clave con la que se guarda la eleccion manual de la persona.
export const CLAVE_IDIOMA_GUARDADO = 'nospi_idioma';

// Detecta el idioma del dispositivo. Solo distinguimos ingles de todo lo demas:
// cualquier cosa que no sea ingles cae en español, que es el idioma base de la app.
export function detectarIdioma(): Idioma {
  // Web: el navegador lo dice directo.
  try {
    if (typeof navigator !== 'undefined') {
      const n: any = navigator;
      const etiqueta: string | undefined =
        n.language || (Array.isArray(n.languages) ? n.languages[0] : undefined);
      if (etiqueta) return etiqueta.toLowerCase().startsWith('en') ? 'en' : 'es';
    }
  } catch {}

  // iOS / Android: Hermes trae Intl completo desde React Native 0.73,
  // asi que el locale del sistema sale de aqui sin dependencias nuevas.
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    if (locale) return locale.toLowerCase().startsWith('en') ? 'en' : 'es';
  } catch {}

  return IDIOMA_POR_DEFECTO;
}

// Idioma pedido por la direccion web: app.nospi.co/?lang=en
//
// Para que sirve: el anuncio en ingles manda a la landing con ?lang=en y de
// ahi a la app con ?lang=en. Asi el extranjero que tiene el celular en
// espanol (pasa, y mucho, entre los que llevan tiempo aca) igual ve todo en
// ingles, sin tener que buscar el interruptor. Manda sobre lo guardado y
// sobre el idioma del dispositivo, porque es una peticion explicita.
//
// En iOS/Android no existe location, asi que devuelve null y no cambia nada.
export function idiomaDeUrl(): Idioma | null {
  try {
    if (typeof location === 'undefined' || !location.search) return null;
    const m = /[?&]lang=(en|es)\b/i.exec(location.search);
    return m ? (m[1].toLowerCase() as Idioma) : null;
  } catch {
    return null;
  }
}

// Reemplaza {{variable}} dentro de un texto.
// Ej: interpolar('Hola {{nombre}}', { nombre: 'Ana' }) -> 'Hola Ana'
export function interpolar(texto: string, vars?: Record<string, string | number>): string {
  if (!vars) return texto;
  return texto.replace(/\{\{(\w+)\}\}/g, (coincidencia, clave) => {
    const valor = vars[clave];
    return valor === undefined || valor === null ? coincidencia : String(valor);
  });
}

// Busca una clave en el diccionario. Si falta en ingles, cae a español; si
// tampoco esta en español, devuelve la clave misma. Nunca revienta ni muestra
// una pantalla en blanco por un texto que se nos haya olvidado traducir.
export function traducir(
  diccionario: Record<Idioma, Record<string, string>>,
  idioma: Idioma,
  clave: string,
  vars?: Record<string, string | number>
): string {
  const enIdioma = diccionario[idioma]?.[clave];
  if (typeof enIdioma === 'string') return interpolar(enIdioma, vars);

  const enEspanol = diccionario[IDIOMA_POR_DEFECTO]?.[clave];
  if (typeof enEspanol === 'string') {
    if (__DEV__) console.warn('[i18n] Falta traduccion en', idioma, 'para:', clave);
    return interpolar(enEspanol, vars);
  }

  if (__DEV__) console.warn('[i18n] Clave inexistente:', clave);
  return clave;
}

// El locale que hay que pasarle a toLocaleDateString / toLocaleTimeString.
//
// Existe porque las fechas no pasan por el diccionario: las formatea el
// runtime. Si se deja 'es-CO' fijo, un gringo ve toda la pantalla en ingles y
// "jueves 8 de octubre de 2026" en la linea que decide si reserva o no.
export function localeDe(idioma: Idioma): string {
  return idioma === 'en' ? 'en-US' : 'es-CO';
}
