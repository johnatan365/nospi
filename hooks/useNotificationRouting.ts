import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { getAppConfig } from '@/utils/appConfig';
import { setPendingRoute, takePendingRoute } from '@/lib/pendingRoute';

type NotificationData = {
  type?: string;
  event_id?: string;
  conversation_id?: string | null;
};

// Decide a que pantalla mandar al usuario segun el 'type' que viaja en el
// payload de cada push (ver notify-chat-message y send-push-reminders).
function routeForData(data: NotificationData): string | null {
  switch (data.type) {
    case 'chat_message':
    case 'event_chat_open':
      return data.conversation_id ? `/chat/${data.conversation_id}` : '/(tabs)/chats';
    case 'event_start_dinamica':
      return '/(tabs)/dinamica';
    case 'event_location_revealed':
    case 'event_reminder_3d':
    case 'event_reminder_2h':
    case 'event_reminder_sameday':
      return '/(tabs)/appointments';
    default:
      return null;
  }
}

// semver simple (mismo criterio que ForceUpdateGate): true si current < min.
function isOutdated(current: string, min: string): boolean {
  if (!min) return false;
  const c = String(current).split('.').map((n) => parseInt(n, 10));
  const m = String(min).split('.').map((n) => parseInt(n, 10));
  const len = Math.max(c.length, m.length);
  for (let i = 0; i < len; i++) {
    const cv = Number.isFinite(c[i]) ? c[i] : 0;
    const mv = Number.isFinite(m[i]) ? m[i] : 0;
    if (cv < mv) return true;
    if (cv > mv) return false;
  }
  return false;
}

// Devuelve true si la version instalada esta por debajo de min_app_version, es
// decir, el muro de actualizacion (ForceUpdateGate) la va a bloquear. Fail-open:
// ante cualquier duda, false (igual que el gate), para no estorbar el ruteo.
async function appIsOutdated(): Promise<boolean> {
  try {
    if (Platform.OS === 'web') return false;
    const cfg = await getAppConfig();
    const min = (cfg?.min_app_version || '0.0.0').trim();
    if (!min || min === '0.0.0') return false;
    const current = Constants.expoConfig?.version || '0.0.0';
    return isOutdated(current, min);
  } catch {
    return false;
  }
}

/**
 * Escucha cuando el usuario toca una notificacion push y lo lleva a la
 * pantalla correspondiente (chat del evento, Dinamica, o Citas).
 *
 * Caso normal (app al dia): navega de una, como siempre.
 * Caso borde (app desactualizada -> muro de actualizacion obligatoria): el muro
 * tapa toda la app, asi que navegar no sirve. En vez de eso GUARDAMOS la ruta
 * (setPendingRoute). Cuando la persona actualiza desde la tienda y reabre, el
 * bloque de arranque de abajo detecta esa ruta pendiente y la lleva directo al
 * chat que intento abrir.
 *
 * Cubre:
 * - App abierta o en background: listener en vivo.
 * - App cerrada (cold start) y el reinicio POST-actualizacion: el bloque de
 *   abajo, solo despues de que 'ready' sea true (auth ya resuelto) para no
 *   pelear con la navegacion inicial de index.tsx.
 */
export function useNotificationRouting(ready: boolean) {
  const router = useRouter();
  const handledColdStart = useRef(false);

  // Taps con la app abierta o en background.
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = (response.notification.request.content.data || {}) as NotificationData;
      const route = routeForData(data);
      if (!route) return;
      appIsOutdated().then((outdated) => {
        if (outdated) {
          // El muro va a tapar todo: guardamos para despues de actualizar.
          setPendingRoute(route);
        } else {
          router.push(route as any);
        }
      });
    });

    return () => subscription.remove();
  }, [router]);

  // Arranque en frio: la app se abrio por un tap, o venimos de actualizar.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!ready || handledColdStart.current) return;
    handledColdStart.current = true;

    (async () => {
      try {
        const outdated = await appIsOutdated();
        const response = await Notifications.getLastNotificationResponseAsync();
        const data = (response?.notification.request.content.data || {}) as NotificationData;
        const route = response ? routeForData(data) : null;

        if (outdated) {
          // Sigue bloqueada: recordamos la ruta para cuando actualice y reabra.
          if (route) await setPendingRoute(route);
          return;
        }

        // App al dia:
        if (route) {
          // Tap que abrio la app: navega y descarta cualquier miga vieja.
          await takePendingRoute();
          router.push(route as any);
          return;
        }

        // No vino de un tap: puede ser el reinicio despues de actualizar, donde
        // quedo una ruta guardada desde la sesion bloqueada anterior.
        const pending = await takePendingRoute();
        if (pending) router.push(pending as any);
      } catch (err) {
        console.warn('Error en el ruteo de notificaciones:', err);
      }
    })();
  }, [ready, router]);
}
