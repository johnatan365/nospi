import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';
import { syncWebPush } from '@/lib/webPush';

/**
 * Pide permiso de notificaciones, obtiene el token de Expo push del dispositivo,
 * y lo guarda en la tabla push_tokens asociado al usuario logueado.
 * Base reutilizada para: recordatorios de eventos, promos/broadcast del admin,
 * y (más adelante) notificaciones de chat.
 */
/**
 * Guarda el token de Expo push del dispositivo para este usuario. Se asume que
 * el permiso YA fue concedido. Se exporta aparte porque el aviso de la pestana
 * de Chat tambien necesita registrar el token justo despues de que la persona
 * acepta, sin esperar a que la app se reinicie.
 */
export async function registerPushToken(userId: string): Promise<boolean> {
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const token = tokenResponse.data;
    if (!token) return false;

    const { error } = await supabase
      .from('push_tokens')
      .upsert(
        {
          user_id: userId,
          token,
          platform: Platform.OS,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'token' }
      );

    if (error) {
      console.warn('No se pudo guardar el push token:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Error registrando push token:', err);
    return false;
  }
}

export function usePushNotifications(userId: string | null | undefined) {
  const registeredForUserId = useRef<string | null>(null);

  // Doble check gris: cuando entra una notificacion con la app abierta, ya
  // sabemos que el mensaje llego a este telefono. Se marca recibido en el acto,
  // sin esperar a que la persona entre al chat.
  //
  // Lo que ESTO no cubre: la app cerrada del todo. Ahi el aviso lo pinta el
  // sistema operativo sin ejecutar codigo nuestro (Android puede despertarla
  // con un modulo extra; iOS no lo garantiza nunca). En ese caso el doble check
  // aparece cuando la persona vuelve a abrir la app.
  useEffect(() => {
    if (!userId || Platform.OS === 'web') return;
    const sub = Notifications.addNotificationReceivedListener(() => {
      supabase.rpc('marcar_entregado').then(() => {}, () => {});
    });
    return () => sub.remove();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    if (registeredForUserId.current === userId) return; // ya se registró para este usuario en esta sesión
    // En web el aviso lo entrega el service worker, no Expo. Aqui solo se
    // reengancha en silencio si la persona YA dio permiso antes; pedirlo de
    // golpe al abrir se ve invasivo (y Safari lo ignora si no viene de un
    // toque). El boton para activarlo esta en la pestana de Chat.
    if (Platform.OS === 'web') {
      syncWebPush(userId).then((ok) => {
        if (ok) registeredForUserId.current = userId;
      });
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== 'granted') {
          return; // el usuario no dio permiso, no insistimos aquí
        }

        if (cancelled) return;
        const ok = await registerPushToken(userId);
        if (cancelled || !ok) return;

        registeredForUserId.current = userId;
      } catch (err) {
        console.warn('Error registrando push token:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);
}
