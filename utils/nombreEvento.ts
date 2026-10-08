// El nombre de un evento puede venir partido en dos renglones: `name` y
// `subtitulo`. La tarjeta de la app los muestra uno debajo del otro, pero en
// todo lo demas (el WhatsApp, el detalle del evento, los correos) hace falta
// el nombre completo en una sola linea. De ahi este helper: una sola forma de
// unirlos, en vez de repetir la misma concatenacion en cada sitio.

export function nombreLargoEvento(
  evento: { name?: string | null; subtitulo?: string | null } | null | undefined,
): string {
  const nombre = (evento?.name || '').trim();
  const segundo = (evento?.subtitulo || '').trim();
  if (!segundo) return nombre;
  if (!nombre) return segundo;
  return nombre + ' ' + segundo;
}

// ---------------------------------------------------------------------------
// El nombre y la descripcion del evento en el idioma de la persona.
//
// Por que NO se traduce el texto guardado en la base: el nombre en espanol
// ("Cena (28 de octubre)") es el que ve el equipo en el admin, el que sale en
// los reportes y el que arma el titulo de los canales de avisos. Si se
// tradujera alla, se perderia para todo eso.
//
// Como se resuelve entonces: el nombre casi siempre es "<tipo> (<fecha>)", y
// el tipo y la fecha YA son datos estructurados del evento. Asi que en ingles
// se arma solo: "Dinner · Wed, Oct 28". No hay que llenar nada, y un evento
// creado manana aparece bien en ingles sin que nadie se acuerde de traducirlo.
//
// Las columnas name_en / description_en son la salida de emergencia para los
// eventos con nombre propio ("Sala de Despecho"), donde la gracia esta en el
// nombre: si estan llenas, mandan.

import type { Idioma } from '@/lib/i18n';

type EventoTexto = {
  name?: string | null;
  subtitulo?: string | null;
  name_en?: string | null;
  description?: string | null;
  description_en?: string | null;
  type?: string | null;
  date?: string | null;
};

const TIPOS_CON_CLAVE = ['bar', 'caminata', 'cafe', 'bolos', 'virtual'];

function claveTipo(tipo?: string | null): string {
  return TIPOS_CON_CLAVE.includes(tipo || '') ? `evento.tipo.${tipo}` : 'evento.tipo.restaurante';
}

// "Wed, Oct 28". Siempre en la zona de Bogota: la fecha del evento es la de
// aca, y sin fijarla un gringo en otro huso veria el dia anterior.
function fechaCorta(fecha?: string | null): string {
  if (!fecha) return '';
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return '';
  try {
    return d.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Bogota',
    });
  } catch {
    return '';
  }
}

/** Nombre del evento para mostrar, en el idioma activo. */
export function nombreEventoIdioma(
  evento: EventoTexto | null | undefined,
  idioma: Idioma,
  t: (clave: string, vars?: Record<string, string | number>) => string,
): string {
  if (idioma !== 'en') return nombreLargoEvento(evento);

  const propio = (evento?.name_en || '').trim();
  if (propio) return propio;

  const tipo = t(claveTipo(evento?.type));
  const fecha = fechaCorta(evento?.date);
  if (fecha) return `${tipo} · ${fecha}`;
  // Sin fecha utilizable preferimos el tipo solo antes que el nombre en
  // espanol: "Dinner" dice menos que "Cena (28 de octubre)", pero al menos
  // no deja a la persona leyendo un idioma que no entiende.
  return tipo || nombreLargoEvento(evento);
}

/** Descripcion del evento para mostrar, en el idioma activo. */
export function descripcionEventoIdioma(
  evento: EventoTexto | null | undefined,
  idioma: Idioma,
  t: (clave: string, vars?: Record<string, string | number>) => string,
): string {
  const original = (evento?.description || '').trim();
  if (idioma !== 'en') return original;

  const propia = (evento?.description_en || '').trim();
  if (propia) return propia;

  // Si el evento no tiene descripcion en espanol tampoco inventamos una en
  // ingles: hay tipos (el cafe) que a proposito van sin texto.
  if (!original) return '';

  return t(`evento.desc.${evento?.type || 'restaurante'}`);
}
