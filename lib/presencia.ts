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
