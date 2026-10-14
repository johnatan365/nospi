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

// Tasa de respaldo USD -> COP. La real vive en app_config.usd_cop_rate y se
// edita en Supabase sin tocar codigo; esto solo cubre el instante de carga.
export const FALLBACK_USD_COP_RATE = 3239;

// Cuanto se le COBRA a Wompi, segun el idioma de la app.
//
// Wompi liquida siempre en pesos: no existe un cobro "en dolares". Para quien
// ve la app en ingles se cobra el equivalente en pesos del precio en dolares
// (event_price_usd x usd_cop_rate), y el banco del visitante le factura
// aproximadamente esa cifra en su moneda, a su propia tasa.
//
// Esto ANTES no existia: la app mostraba "USD 19" y le mandaba a Wompi los
// 15.000 pesos del precio colombiano, o sea ~USD 4,63. El extranjero veia un
// precio y le cobraban otro.
//
// Va atado al IDIOMA DE LA APP, igual que el texto del precio.
export function montoACobrarCOP(
  idioma: 'es' | 'en',
  cop: number,
  usd: number,
  tasaUsdCop: number,
): number {
  if (idioma !== 'en') return cop;
  const convertido = Math.round(usd * tasaUsdCop);
  // Si la tasa viene en basura, es mas seguro cobrar el precio colombiano que
  // cobrar 0 o un numero absurdo.
  return Number.isFinite(convertido) && convertido > 0 ? convertido : cop;
}

// Como se MUESTRA un precio segun el idioma de la app. El numero en dolares es
// el de app_config (event_price_usd, subscription_price_usd, etc.), no una
// division de los pesos.
//
// Va atado al IDIOMA DE LA APP a proposito, no a la mesa ni al pais: si
// dependiera de la mesa, un colombiano que quiere practicar ingles tendria que
// pagar el precio alto y no entraria ninguno.
//
// Ojo: esto es solo el TEXTO. Lo que se cobra lo decide montoACobrarCOP.
export function textoPrecio(idioma: 'es' | 'en', cop: number, usd: number): string {
  return idioma === 'en' ? `USD ${usd}` : `$${cop.toLocaleString('es-CO')}`;
}
