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

// Medios con que se paga un cupo suelto. NULL son las citas de julio y agosto
// de 2026, de antes de que se guardara el medio: tambien eran compras por
// evento. Debe coincidir con app/subscription-plans.tsx (fetchVirtualBalance).
const FILTRO_COMPRAS_POR_EVENTO =
  'payment_method.is.null,payment_method.in.(card,pse,nequi,bancolombia,banc,virtual_balance,directo,promo_code)';

/**
 * false si el interruptor "Pago por evento" del admin esta en oculto
 * (app_config.ocultar_pago_por_evento = 'true') y esta persona nunca ha
 * comprado un cupo suelto ni tiene saldo a favor. Es el mismo criterio con el
 * que la app esconde la opcion; aqui se aplica tambien a quien tiene una
 * version vieja de la app o la OTA sin aplicar (paso el 7 de noviembre de
 * 2026: una usuaria nueva compro por evento en su primera sesion, con el
 * codigo que traia el instalador).
 *
 * Ante cualquier error deja pasar: es preferible vender un cupo suelto de mas
 * que bloquearle la compra a un cliente antiguo.
 */
export async function pagoPorEventoPermitido(servidor: SupabaseClient, userId: string): Promise<boolean> {
  try {
    const { data: conf, error: errConf } = await servidor
      .from('app_config').select('value').eq('key', 'ocultar_pago_por_evento').maybeSingle();
    if (errConf || conf?.value !== 'true') return true;

    const { count, error } = await servidor
      .from('appointments').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).or(FILTRO_COMPRAS_POR_EVENTO);
    if (error || (count ?? 0) > 0) return true;

    const { data: u, error: errU } = await servidor
      .from('users').select('virtual_balance').eq('id', userId).maybeSingle();
    if (errU || !u) return true;
    return Number(u.virtual_balance || 0) > 0;
  } catch {
    return true;
  }
}

/** Texto para quien ya no puede comprar un cupo suelto. */
export const MENSAJE_SOLO_SUSCRIPCION =
  'Para reservar ahora necesitas una suscripcion. Cierra la app por completo y vuelve a abrirla para ver los planes.';

/** Texto para la persona cuando el monto no cuadra. Sin detalles internos. */
export const MENSAJE_MONTO_INVALIDO =
  'El valor no coincide con el precio del evento. Cierra la pantalla de pago y vuelve a intentarlo.';
