// Lo que esta app ya marco como leido, aunque el servidor todavia no lo
// refleje.
//
// Al salir de un chat pasan dos cosas a la vez: la pantalla del chat escribe
// la marca de lectura (mark_conversation_read) y la pestana de Chats recarga
// su lista. Son dos peticiones en paralelo, y la de la lista suele ganar: trae
// el last_read_at viejo, el globo de mensajes sin leer reaparece, y se queda
// ahi hasta la siguiente recarga.
//
// Eso no se arregla haciendo el servidor mas rapido, porque no es lentitud
// sino una carrera. Lo que hace falta es que la lista sepa lo que esta misma
// app acaba de dar por leido, y no vuelva a pintar como pendiente algo que ya
// resolvimos.
//
// Vive en memoria del modulo a proposito: es un desfase de segundos entre dos
// pantallas de la misma sesion, no algo que valga la pena guardar en disco.
// Si la app se reinicia, el servidor ya respondio y no hace falta.
const marcas = new Map<string, string>();

/** Deja constancia de hasta donde marcamos leida una conversacion. */
export function anotarLeidoHasta(conversationId: string, hasta: string): void {
  const previo = marcas.get(conversationId);
  // Nunca hacia atras: dos salidas seguidas no pueden desmarcar lo ya leido.
  if (!previo || hasta > previo) marcas.set(conversationId, hasta);
}

/**
 * Si lo ultimo que llego a la conversacion no es mas nuevo que nuestra marca,
 * esta leida — por mas que la fila del servidor venga diciendo lo contrario.
 *
 * Las fechas son ISO de la misma base, asi que se comparan como texto sin
 * construir un Date por fila.
 */
export function yaLeidoLocalmente(
  conversationId: string,
  ultimoMensajeAt: string | null | undefined,
): boolean {
  if (!ultimoMensajeAt) return false;
  const marca = marcas.get(conversationId);
  return !!marca && marca >= ultimoMensajeAt;
}
