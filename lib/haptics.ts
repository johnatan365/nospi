// Golpecitos al tocar: APAGADOS.
//
// Se implementaron en su momento pensando que la vibracion al tocar un boton
// hace que la app se sienta viva. En la practica no gusto: en un telefono que
// se usa mucho de noche y en la mano, vibrar en cada toque se siente molesto
// mas que cuidado. Decision del dueno de la app, tomada probandola.
//
// Por que queda el archivo en vez de borrarlo: hay seis pantallas que llaman a
// estas funciones (chat, evento, pago, supervision, barra de pestanas). Si se
// borra el archivo hay que tocar las seis, y volver a encenderlo manana seria
// otras seis. Asi, encender o apagar la vibracion de TODA la app es cambiar
// una sola linea aca abajo: poner ACTIVADO en true y descomentar las llamadas.
//
// Las funciones siguen existiendo y siguen siendo seguras de llamar: no hacen
// nada y no devuelven error. Nadie se rompe.

const ACTIVADO = false;

/** Toque normal: botones, pestanas, abrir algo. Es el que mas se usa. */
export function toque(): void {
  if (!ACTIVADO) return;
}

/** Un poco mas firme: enviar, confirmar, votar. Acciones que "cuentan". */
export function toqueFuerte(): void {
  if (!ACTIVADO) return;
}

/** Salio bien: asistencia confirmada, pago hecho, foto subida. */
export function exito(): void {
  if (!ACTIVADO) return;
}

/** Algo fallo. Se usa junto al mensaje de error, nunca en su lugar. */
export function error(): void {
  if (!ACTIVADO) return;
}

/** Aviso intermedio: falta un dato, se alcanzo un limite. */
export function aviso(): void {
  if (!ACTIVADO) return;
}
