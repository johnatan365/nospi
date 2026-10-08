// Preferencias de notificacion, en un solo sitio.
//
// Vive aparte porque la pantalla de perfil esta DUPLICADA (profile.tsx y
// profile.ios.tsx son archivos distintos). Ya paso en este proyecto que un
// arreglo se hizo en uno y no en el otro, y quedo roto en iPhone sin que nadie
// lo notara. Con los textos y los valores aca, cambiar algo los cambia en los
// dos a la vez.
//
// Antes esto eran cuatro opciones por CANAL -- whatsapp, email, sms, push -- y
// de esas cuatro solo `push` la leia alguien. Las otras tres no las consultaba
// ninguna funcion de envio: la gente elegia y le llegaba igual. Ahora son por
// CONTENIDO, que es lo que de verdad le importa a quien recibe.

/** Para los chats: cuanto quiere que le llegue. */
export type ModoChat = 'todos' | 'menciones' | 'ninguno';

export interface PreferenciasNotificacion {
  /** Mensajes directos de otra persona. */
  privados: boolean;
  /** El grupo de su mesa en cada evento. */
  mesa: ModoChat;
  /** Comunidad Nospi: todo el mundo, siempre. Es lo mas ruidoso que hay. */
  comunidad: ModoChat;
  /** Canal de Nospi y avisos de eventos nuevos o cupos libres. */
  novedades: boolean;
  /** Descuentos y campanas. Separado a proposito: ver nota abajo. */
  promociones: boolean;
}

/**
 * Lo que recibe alguien que no ha tocado nada. Todo encendido, igual que hoy,
 * para que estrenar la pantalla no cambie lo que ya le llegaba.
 */
export const PREFERENCIAS_POR_DEFECTO: PreferenciasNotificacion = {
  privados: true,
  mesa: 'todos',
  comunidad: 'todos',
  novedades: true,
  promociones: true,
};

/**
 * Acepta lo que venga de la base -- incluido el formato viejo por canal, o un
 * valor a medias -- y devuelve algo con el que se pueda pintar la pantalla.
 *
 * Ante la duda deja todo ENCENDIDO: es preferible una notificacion de mas que
 * dejar a alguien sin enterarse de su evento por un dato incompleto. La unica
 * senal que se respeta del formato viejo es push:false, que era la forma de
 * decir "no quiero notificaciones".
 */
export function normalizarPreferencias(raw: any): PreferenciasNotificacion {
  if (!raw || typeof raw !== 'object') return { ...PREFERENCIAS_POR_DEFECTO };

  // Formato viejo: solo tenia sentido `push`.
  if (!('privados' in raw) && 'push' in raw) {
    return raw.push === false
      ? { privados: false, mesa: 'ninguno', comunidad: 'ninguno', novedades: false, promociones: false }
      : { ...PREFERENCIAS_POR_DEFECTO };
  }

  const modo = (v: any): ModoChat =>
    v === 'ninguno' || v === 'menciones' || v === 'todos' ? v : 'todos';

  return {
    privados: raw.privados !== false,
    mesa: modo(raw.mesa),
    comunidad: modo(raw.comunidad),
    novedades: raw.novedades !== false,
    promociones: raw.promociones !== false,
  };
}

// OJO: `titulo`, `ayuda` y `etiqueta` ya NO son el texto, son la LLAVE del
// diccionario de constants/Textos.ts. La pantalla pinta t(o.titulo).
// Se hizo asi para que el texto se traduzca en profile.tsx y profile.ios.tsx
// a la vez, que es la razon por la que este archivo existe.

/** Los interruptores de si/no, en el orden en que se muestran. */
export const INTERRUPTORES: {
  clave: 'privados' | 'novedades' | 'promociones';
  titulo: string;
  ayuda: string;
}[] = [
  {
    clave: 'privados',
    titulo: 'notif.privadosTitulo',
    ayuda: 'notif.privadosAyuda',
  },
  {
    clave: 'novedades',
    titulo: 'notif.novedadesTitulo',
    ayuda: 'notif.novedadesAyuda',
  },
  {
    clave: 'promociones',
    titulo: 'notif.promocionesTitulo',
    ayuda: 'notif.promocionesAyuda',
  },
];

/** Los dos chats, que ademas del si/no tienen "solo si me mencionan". */
export const CHATS: { clave: 'mesa' | 'comunidad'; titulo: string; ayuda: string }[] = [
  {
    clave: 'mesa',
    titulo: 'notif.mesaTitulo',
    ayuda: 'notif.mesaAyuda',
  },
  {
    clave: 'comunidad',
    titulo: 'notif.comunidadTitulo',
    ayuda: 'notif.comunidadAyuda',
  },
];

export const OPCIONES_CHAT: { valor: ModoChat; etiqueta: string }[] = [
  { valor: 'todos', etiqueta: 'notif.modoTodos' },
  { valor: 'menciones', etiqueta: 'notif.modoMenciones' },
  { valor: 'ninguno', etiqueta: 'notif.modoNinguno' },
];

/**
 * Lo que llega siempre, sin interruptor. Se muestra en la pantalla para que
 * nadie crea que apagando algo se queda sin enterarse de su propio evento.
 *
 * No es una decision de diseno: quien se pierde el aviso de su evento no
 * aparece, y eso deja la mesa coja para los otros cinco.
 */
export const AVISO_SIEMPRE = 'notif.siempreLlegan';
