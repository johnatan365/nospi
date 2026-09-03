// Precios de respaldo — SOLO se usan si app_config no responde o trae basura.
//
// Por que existe este archivo: los respaldos estaban escritos a mano en cuatro
// sitios distintos y se desincronizaron. Tres decian 30000 y uno decia 15000,
// cuando el precio real en app_config es 15000. El peor de esos tres calculaba
// el REEMBOLSO al cancelar: si app_config fallaba, se le devolvia $30.000 de
// saldo virtual a alguien que habia pagado $15.000.
//
// La fuente de verdad sigue siendo la tabla app_config (llaves event_price y
// subscription_price). Esto es solo la red por si esa consulta falla.
// Si cambias el precio en app_config, actualiza tambien estos numeros.

export const FALLBACK_EVENT_PRICE_COP = 15000;
export const FALLBACK_SUBSCRIPTION_PRICE_COP = 29900;

// Lee un precio de app_config y cae al respaldo solo si el valor no sirve.
// parseInt('') y parseInt(undefined) dan NaN, y NaN || fallback devuelve el
// fallback, que es justo lo que queremos.
export function precioDesdeConfig(valor: string | undefined | null, respaldo: number): number {
  const n = parseInt(valor ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : respaldo;
}
