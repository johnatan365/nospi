// "En linea" y "ultima vez": textos, valores por defecto y el formato de la
// fecha.
//
// Vive aparte por lo mismo que constants/Notificaciones.ts: la pantalla de
// perfil esta DUPLICADA (profile.tsx y profile.ios.tsx son archivos distintos).
// Ya paso en este proyecto que un arreglo se hizo en uno y no en el otro y
// quedo roto en iPhone sin que nadie lo notara.

export interface Privacidad {
  /** Los demas ven un punto verde cuando tienes la app abierta. */
  enLinea: boolean;
  /** Los demas ven cuando fue la ultima vez que estuviste. */
  ultimaVez: boolean;
}

/** Lo que trae alguien que no ha tocado nada: las dos encendidas. */
export const PRIVACIDAD_POR_DEFECTO: Privacidad = {
  enLinea: true,
  ultimaVez: true,
};

/**
 * Acepta lo que venga de la base --incluido un valor a medias-- y devuelve algo
 * con lo que se pueda pintar la pantalla.
 *
 * Ante la duda deja ENCENDIDO, que es el valor por defecto de las columnas.
 */
export function normalizarPrivacidad(raw: any): Privacidad {
  if (!raw || typeof raw !== 'object') return { ...PRIVACIDAD_POR_DEFECTO };
  const enLinea = raw.mostrar_en_linea !== false;
  return {
    enLinea,
    // Apagar "en linea" apaga tambien la otra. La regla esta en la base
    // (guardar_privacidad), y se repite aqui para que la pantalla no muestre
    // un estado imposible mientras llega la respuesta.
    ultimaVez: enLinea && raw.mostrar_ultima_vez !== false,
  };
}

export const PRIVACIDAD_TITULO = 'priv.titulo';
export const PRIVACIDAD_SUBTITULO = 'priv.subtitulo';

/**
 * El aviso de reciprocidad. Es lo que hace que esto no se sienta vigilancia:
 * nadie puede esconderse y a la vez mirar.
 */
export const PRIVACIDAD_RECIPROCIDAD = 'priv.reciprocidad';

export const OPCIONES_PRIVACIDAD: {
  clave: keyof Privacidad;
  titulo: string;
  ayuda: string;
}[] = [
  {
    clave: 'enLinea',
    titulo: 'priv.enLineaTitulo',
    ayuda: 'priv.enLineaAyuda',
  },
  {
    clave: 'ultimaVez',
    titulo: 'priv.ultimaVezTitulo',
    ayuda: 'priv.ultimaVezAyuda',
  },
];

/** Devuelve la LLAVE del diccionario, no el texto. La pantalla hace t(...). */
export function resumenPrivacidad(p: Privacidad): string {
  if (!p.enLinea) return 'priv.resumenTodoApagado';
  if (!p.ultimaVez) return 'priv.resumenSinUltimaVez';
  return 'priv.resumenTodoEncendido';
}

// ── El formato de la ultima vez ─────────────────────────────────────────────
//
// Mismo criterio que WhatsApp: entre mas viejo, menos preciso. La hora exacta
// solo tiene sentido el mismo dia; de la semana pasada lo que importa es el
// dia, no si fue a las 8:05 o a las 8:40.

// Los dias, los meses y el a.m./p.m. salen del diccionario, porque en ingles
// no son una traduccion palabra por palabra: 'last seen on March 5', no
// 'el 5 de March'. Por eso hay dos plantillas distintas, no una sola con
// las piezas cambiadas.
type Traductor = (clave: string, vars?: Record<string, string | number>) => string;
const T_ESPANOL: Traductor = (clave) => clave;

function hora12(d: Date, t: Traductor): string {
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const suf = h >= 12 ? t('priv.pm') : t('priv.am');
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${suf}`;
}

/** Devuelve el texto completo, listo para pintar. Cadena vacia si no hay dato. */
export function textoUltimaVez(
  iso?: string | null,
  ahora: Date = new Date(),
  t: Traductor = T_ESPANOL,
): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';

  const segundos = Math.floor((ahora.getTime() - d.getTime()) / 1000);
  // Un reloj desfasado puede dar negativo. Se trata como "ahora mismo" en vez
  // de escribir una fecha del futuro.
  if (segundos < 60) return t('priv.ultimaVezAhora');
  if (segundos < 3600) {
    const min = Math.floor(segundos / 60);
    return t('priv.ultimaVezMinutos', { n: min, unidad: t(min === 1 ? 'priv.minuto' : 'priv.minutos') });
  }

  // Se compara por DIA del calendario, no por horas transcurridas: a las 00:30
  // algo de las 23:00 fue "ayer", aunque hayan pasado solo 90 minutos.
  const soloDia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = Math.round((soloDia(ahora) - soloDia(d)) / 86400000);

  const hora = hora12(d, t);
  if (dias <= 0) return t('priv.ultimaVezHoy', { hora });
  if (dias === 1) return t('priv.ultimaVezAyer', { hora });
  if (dias < 7) return t('priv.ultimaVezDia', { dia: t('priv.dias').split(',')[d.getDay()], hora });
  return t('priv.ultimaVezFecha', { dia: d.getDate(), mes: t('priv.meses').split(',')[d.getMonth()] });
}
