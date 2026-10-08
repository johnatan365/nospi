// Quien esta conectado, por Realtime Presence.
//
// Presence es la herramienta propia para esto: vive en memoria del servidor de
// realtime, no escribe NI UNA fila en la base, y se cae sola cuando alguien
// cierra la app o pierde la señal. Lo contrario --una columna actualizada cada
// minuto-- serian millones de escrituras al mes para un dato que vale treinta
// segundos.
//
// Va sobre el MISMO canal que ya usa cada conversacion para el "esta
// escribiendo" (`chat_thread_<id>`), para no abrir un segundo canal por chat.
//
// La reciprocidad tiene dos mitades:
//
//   · Que no me vean: si tengo el interruptor apagado no llamo a track(), asi
//     que no aparezco en el estado del canal. Esta mitad es de verdad, no
//     depende de que el cliente se porte bien.
//   · Que yo no vea: lo decide el cliente, igual que en WhatsApp. No es una
//     frontera de seguridad sino una norma social, y el dato de quien esta
//     conectado no es sensible por si mismo.

import { supabase } from './supabase';

export const canalDeConversacion = (conversationId: string) => `chat_thread_${conversationId}`;

/** Lo que se anuncia de uno mismo. El user_id va como clave de presencia. */
export interface MarcaPresencia {
  user_id: string;
  /** Para poder ordenar o depurar; no se muestra en pantalla. */
  desde: number;
}

/**
 * Saca los user_id presentes del estado que devuelve el canal, quitando el
 * propio.
 *
 * El estado viene como { claveDePresencia: [ {...}, {...} ] } -- una lista por
 * clave porque la misma persona puede tener dos dispositivos abiertos. Solo
 * interesa si esta o no, asi que se aplana a un conjunto de ids.
 */
export function idsPresentes(estado: Record<string, any[]>, miId?: string | null): string[] {
  const ids = new Set<string>();
  for (const entradas of Object.values(estado || {})) {
    for (const e of entradas || []) {
      const id = (e as any)?.user_id;
      if (id && id !== miId) ids.add(id);
    }
  }
  return Array.from(ids);
}

/**
 * Cuenta cuantos estan conectados, para el encabezado de un grupo.
 * Se dice el numero y no la lista: en la Comunidad hay 246 personas.
 */
export function textoEnLinea(cuantos: number): string {
  if (cuantos <= 0) return '';
  return cuantos === 1 ? '1 en línea' : `${cuantos} en línea`;
}

/**
 * Apunta la ultima vez. Se llama al SALIR de un chat o al mandar la app al
 * fondo, nunca en un intervalo.
 *
 * La funcion de la base no escribe nada si la persona tiene el interruptor
 * apagado, asi que no hace falta comprobarlo aqui.
 */
export function tocarUltimaVez(): void {
  supabase.rpc('tocar_ultima_vez').then(
    () => {},
    (err: unknown) => console.error('presencia: no se pudo apuntar la ultima vez', err),
  );
}

/**
 * Pide la ultima vez de varias personas. Devuelve un mapa user_id -> fecha ISO.
 *
 * La base aplica la reciprocidad: si quien pregunta tiene su propia ultima vez
 * apagada, esto vuelve vacio.
 */
export async function pedirUltimaVez(userIds: string[]): Promise<Record<string, string>> {
  if (userIds.length === 0) return {};
  const { data, error } = await supabase.rpc('get_ultima_vez', { p_user_ids: userIds });
  if (error) {
    console.error('presencia: no se pudo leer la ultima vez', error);
    return {};
  }
  const mapa: Record<string, string> = {};
  for (const fila of (data as any[]) || []) {
    if (fila?.user_id && fila?.last_seen_at) mapa[fila.user_id] = fila.last_seen_at;
  }
  return mapa;
}

// ── Presencia de un evento ──────────────────────────────────────────────────
//
// La sala de espera de la videollamada no es un chat, asi que no tiene un canal
// de conversacion donde colgarse: lleva el suyo, por evento.
//
// Lo que aporta sobre la lista que ya hay: esa dice quien CONFIRMO su
// asistencia --toco el boton-- y esto dice quien tiene la app abierta AHORA.
// Alguien puede confirmar y luego irse a hacer otra cosa, y eso es justo lo que
// quiere saber el que esta esperando solo.
export const canalDeEvento = (eventId: string) => `presencia_evento_${eventId}`;

// ── Anunciarse sin filtrarse ────────────────────────────────────────────────
//
// POR QUE ESTO EXISTE
// La promesa de arriba --"si tengo el interruptor apagado no llamo a track()"--
// estaba escrita pero no se cumplia, y la fuga era real: alguien con "en linea"
// apagado aparecia igual en la Comunidad.
//
// Eran dos agujeros, los dos por mirar el ajuste UNA sola vez:
//
//   1. La carrera del arranque. El ajuste se lee de la base (una consulta) y el
//      canal se suscribe por websocket. Son dos esperas en paralelo. Si gana el
//      websocket, track() se ejecuta con el valor por defecto --ENCENDIDO, que
//      es el de las columnas-- porque el de verdad todavia no ha llegado. Quien
//      lo tenia apagado se anunciaba, y al llegar el valor real ya era tarde:
//      nadie deshacia el anuncio.
//   2. Apagarlo con la app abierta no lo quitaba. El ajuste no era dependencia
//      del efecto, asi que el canal seguia vivo con el anuncio puesto hasta
//      cerrar la app.
//
// COMO LO EVITA
// Guardando las dos condiciones por separado y anunciando solo cuando se
// cumplen las dos. El orden en que lleguen deja de importar: el que llegue
// ultimo dispara el track(). Y un `null` --"todavia no se sabe"-- no es lo
// mismo que `false`: mientras no se sepa, se calla. Ante la duda, no aparecer.

import type { RealtimeChannel } from '@supabase/supabase-js';

export interface AnuncioDePresencia {
  /** Desde el callback de subscribe(), cuando llegue 'SUBSCRIBED'. */
  alSuscribirse(): void;
  /** Cuando cambie el ajuste --o cuando por fin se sepa--. `null` = aun no se sabe. */
  alSaberElAjuste(mostrar: boolean | null): void;
}

export function anuncioDePresencia(canal: RealtimeChannel, miId: string): AnuncioDePresencia {
  let suscrito = false;
  let mostrar: boolean | null = null;
  // Para no repetir el track() ni llamar a untrack() sin haber anunciado nada.
  let anunciado = false;

  const poner = () => {
    if (!suscrito || mostrar !== true || anunciado) return;
    anunciado = true;
    canal.track({ user_id: miId, desde: Date.now() } satisfies MarcaPresencia);
  };

  const quitar = () => {
    if (!anunciado) return;
    anunciado = false;
    canal.untrack();
  };

  return {
    alSuscribirse() { suscrito = true; poner(); },
    alSaberElAjuste(v) {
      mostrar = v;
      if (v === true) poner();
      else if (v === false) quitar();
      // Con null no se toca nada: si ya estaba anunciado es porque se sabia que
      // estaba encendido, y "dejar de saberlo" no deberia pasar nunca.
    },
  };
}
