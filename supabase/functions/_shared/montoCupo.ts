// Cuanto debe costar un cupo, segun el servidor. Lo usan las funciones que
// cobran con Wompi (tarjeta, PSE, Nequi, Bancolombia), el webhook y
// confirmar-pago-evento.
//
// Por que existe: hasta noviembre de 2026 esas funciones cobraban el monto que
// mandaba el celular (amountCOP), y nadie lo comparaba con el precio. Con la
// llave publica de la app se podia pagar un cupo por el minimo de Wompi y,
// cancelando, quedarse con el precio completo como saldo.
//
// La cuenta vive en SQL (monto_a_cobrar_cop) para que la app, reservar_evento
// y estas funciones no tengan tres versiones distintas del precio.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Margen por redondeos entre la app y el servidor. Un 1% de 15.000 son 150
// pesos: no alcanza para nada y evita rechazar a alguien por un peso.
const MARGEN = 0.99;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ValidacionMonto =
  | { ok: true; minimo: number }
  | { ok: false; error: 'datos_invalidos' | 'monto_insuficiente' | 'sin_precio'; minimo?: number };

/**
 * Minimo aceptable para el cupo de `userId` en `eventId`: el precio en
 * espanol, con el descuento de un codigo ya redimido. En ingles se cobra mas,
 * asi que tambien pasa.
 */
export async function validarMontoCupo(
  servidor: SupabaseClient,
  userId: unknown,
  eventId: unknown,
  montoCOP: unknown,
): Promise<ValidacionMonto> {
  const monto = Number(montoCOP);
  if (typeof userId !== 'string' || !UUID.test(userId)) return { ok: false, error: 'datos_invalidos' };
  if (typeof eventId !== 'string' || !UUID.test(eventId)) return { ok: false, error: 'datos_invalidos' };
  if (!Number.isFinite(monto) || monto <= 0) return { ok: false, error: 'datos_invalidos' };

  const { data: minimo, error } = await servidor.rpc('monto_a_cobrar_cop', {
    p_event_id: eventId,
    p_user_id: userId,
    p_idioma: 'es',
  });
  if (error || typeof minimo !== 'number') return { ok: false, error: 'sin_precio' };

  if (monto < Math.floor(minimo * MARGEN)) return { ok: false, error: 'monto_insuficiente', minimo };
  return { ok: true, minimo };
}

/** Texto para la persona cuando el monto no cuadra. Sin detalles internos. */
export const MENSAJE_MONTO_INVALIDO =
  'El valor no coincide con el precio del evento. Cierra la pantalla de pago y vuelve a intentarlo.';
