import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

/**
 * Registra en que plataforma (web/ios/android) esta usando la app cada
 * usuario logueado, sin depender de si acepto notificaciones push (a
 * diferencia de usePushNotifications). Se usa para saber en el admin donde
 * se registro alguien vs. que plataformas usa actualmente y cuando fue la
 * ultima vez.
 */
export function useDeviceActivity(userId: string | null | undefined) {
  const registeredForKey = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    const key = `${userId}:${Platform.OS}`;
    if (registeredForKey.current === key) return; // ya se registró en esta sesión

    (async () => {
      try {
        const { error } = await supabase
          .from('user_platform_activity')
          .upsert(
            {
              user_id: userId,
              platform: Platform.OS,
              last_seen_at: new Date().toISOString(),
              app_version: Constants.expoConfig?.version ?? null,
            },
            { onConflict: 'user_id,platform' }
          );

        if (error) {
          console.warn('No se pudo registrar actividad de plataforma:', error.message);
          return;
        }

        registeredForKey.current = key;
      } catch (err) {
        console.warn('Error registrando actividad de plataforma:', err);
      }
    })();
  }, [userId]);
}
