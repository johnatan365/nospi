import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';

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

/**
 * Escucha cuando el usuario toca una notificacion push y lo lleva a la
 * pantalla correspondiente (chat del evento, Dinamica, o Citas).
 * Cubre dos casos:
 * - App abierta o en background: listener en vivo.
 * - App cerrada del todo (cold start): revisa con getLastNotificationResponseAsync
 *   si la app se abrio por un tap, pero solo despues de que 'ready' sea true
 *   (auth ya resuelto) para no pelear con la navegacion inicial de index.tsx.
 */
export function useNotificationRouting(ready: boolean) {
  const router = useRouter();
  const handledColdStart = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = (response.notification.request.content.data || {}) as NotificationData;
      const route = routeForData(data);
      if (route) router.push(route as any);
    });

    return () => subscription.remove();
  }, [router]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!ready || handledColdStart.current) return;
    handledColdStart.current = true;

    (async () => {
      try {
        const response = await Notifications.getLastNotificationResponseAsync();
        if (!response) return;
        const data = (response.notification.request.content.data || {}) as NotificationData;
        const route = routeForData(data);
        if (route) router.push(route as any);
      } catch (err) {
        console.warn('Error leyendo la notificacion que abrio la app:', err);
      }
    })();
  }, [ready, router]);
}
