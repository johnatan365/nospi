import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

// Doble check gris cuando la app esta CERRADA.
//
// El resto del tiempo el "entregado" se marca solo: al abrir la app, al recibir
// una notificacion con la app abierta o al llegar un mensaje por tiempo real.
// Faltaba el caso de siempre: el telefono en el bolsillo y la app cerrada.
//
// Aqui expo-notifications despierta la app un instante cuando entra la
// notificacion, corre esta tarea y la vuelve a dormir. Marcar entregado es una
// sola llamada, asi que el gasto de bateria es despreciable.
//
// Lo honesto sobre cada plataforma:
//   - Android: funciona casi siempre (el sistema despierta la app al recibir).
//   - iPhone: Apple decide si despierta la app segun bateria, uso y si la
//     cerraron a la fuerza; ademas exige que el envio lleve _contentAvailable
//     (lo pone la funcion send-push). Cuando no despierta, el doble check
//     aparece igual en cuanto la persona vuelve a abrir la app.
//
// Si el telefono esta sin senal o apagado, la notificacion no llega y no se
// marca nada: un solo check, que es exactamente lo que debe verse.

export const TAREA_ENTREGA = 'nospi-marcar-entregado';

// defineTask va en el cuerpo del modulo, no dentro de una funcion: el sistema
// puede arrancar la app directo en esta tarea, sin pasar por ninguna pantalla,
// y para entonces la tarea ya tiene que estar definida.
TaskManager.defineTask(TAREA_ENTREGA, async () => {
  try {
    // La sesion vive en el almacenamiento del telefono; hay que esperar a que
    // se lea antes de llamar a nada, porque la tarea arranca en frio.
    const { data } = await supabase.auth.getSession();
    if (!data?.session) return;
    await supabase.rpc('marcar_entregado');
  } catch {
    // Si falla, no pasa nada: el doble check aparecera cuando abra la app.
  }
});

export async function registrarEntregaEnSegundoPlano(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.registerTaskAsync(TAREA_ENTREGA);
  } catch {
    // En Expo Go esto no existe y tira error; en la app compilada si funciona.
  }
}
