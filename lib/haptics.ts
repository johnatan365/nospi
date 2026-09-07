import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

// Golpecitos al tocar.
//
// Por que existe: hasta ahora la app no vibraba NUNCA (habia una sola llamada
// en todo el codigo, y era para un error). La mano espera esa respuesta al
// tocar un boton, y cuando no llega la app se siente dibujada en vez de viva.
// Es lo que mas separa una app que se siente cuidada de una que no.
//
// Dos reglas que se respetan aqui:
//
// 1. NUNCA se espera (await). Vibrar tarda unos milisegundos, y si se espera
//    se retrasa justo la accion que se quiere sentir instantanea. Se dispara y
//    se sigue. Si falla, no pasa nada: no se rompe la interaccion.
//
// 2. En web NO se hace nada. El navegador no tiene esto, y expo-haptics
//    ensucia la consola con avisos en cada toque.

const activo = Platform.OS === 'ios' || Platform.OS === 'android';

function disparar(fn: () => Promise<void>): void {
  if (!activo) return;
  // El catch vacio es intencional: un fallo al vibrar jamas debe interrumpir
  // lo que la persona estaba haciendo.
  fn().catch(() => {});
}

/** Toque normal: botones, pestanas, abrir algo. Es el que mas se usa. */
export function toque(): void {
  disparar(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Un poco mas firme: enviar, confirmar, votar. Acciones que "cuentan". */
export function toqueFuerte(): void {
  disparar(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

/** Salio bien: asistencia confirmada, pago hecho, foto subida. */
export function exito(): void {
  disparar(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** Algo fallo. Se usa junto al mensaje de error, nunca en su lugar. */
export function error(): void {
  disparar(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}

/** Aviso intermedio: falta un dato, se alcanzo un limite. */
export function aviso(): void {
  disparar(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}
