// Preferencia de edad para armar las mesas.
//
// OJO CON EL ENCUADRE: esto es una PREFERENCIA que se tiene en cuenta, no un
// compromiso. Antes habia una segunda pantalla que preguntaba "si no
// completamos tu mesa dentro del rango, prefieres asistir igual o aplazar", y
// 312 personas eligieron aplazar -- o sea que quedaron esperando un aviso "al
// menos un dia antes" que nadie estaba mandando. Se quito por eso: no se
// promete lo que no se puede cumplir.
//
// Tambien se quito el minimo de 10 anos. Con ese minimo, 249 personas eligieron
// exactamente 10: no era su preferencia, era el piso que les ofrecia la
// pantalla. Ahora quien no tiene preferencia lo dice, y quien la tiene la
// expresa de verdad.

/** Limites de los deslizadores. Fuera de esto no se guarda nada. */
export const EDAD_MIN = 18;
export const EDAD_MAX = 60;

/** "La edad me da igual" se guarda como el rango completo: sin restriccion. */
export const RANGO_ABIERTO = { min: EDAD_MIN, max: EDAD_MAX };

export function esRangoAbierto(r: { min: number; max: number } | null | undefined): boolean {
  return !!r && r.min <= EDAD_MIN && r.max >= EDAD_MAX;
}

/**
 * Un rango es valido si son enteros dentro de los limites y el minimo no pasa
 * al maximo. Ya NO se exige una amplitud minima.
 */
export function validAgeRange(value: unknown): value is { min: number; max: number } {
  const r = value as { min?: number; max?: number } | null;
  return !!r && Number.isInteger(r.min) && Number.isInteger(r.max)
    && r.min! >= EDAD_MIN && r.max! <= EDAD_MAX && r.min! <= r.max!;
}

/**
 * Mueve un extremo del rango arrastrando el otro solo si hace falta para que no
 * se crucen. Antes empujaba 10 anos, que era lo que fabricaba el rango minimo.
 */
export function moveAgeBound(range: { min: number; max: number }, bound: 'min' | 'max', value: number) {
  const v = Math.min(EDAD_MAX, Math.max(EDAD_MIN, Math.round(value)));
  if (bound === 'min') return { min: v, max: Math.max(range.max, v) };
  return { min: Math.min(range.min, v), max: v };
}
