/**
 * app/auth/callback.tsx
 *
 * Web: maneja el OAuth redirect de Google / Apple, y el link de "olvidé mi
 * contraseña" (type=recovery) cuando cae directo en /auth/callback.
 * Android: la sesión ya fue establecida en register.tsx — redirige inmediatamente a /.
 *   Excepción: un link de recovery sí debe pasar por acá (no hay registro en curso).
 */

import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { supabase, RECOVERY_FLOW_DETECTED_ON_LOAD } from '@/lib/supabase';
import { dejarRastro } from '@/lib/rastro';

import { useIdioma } from '@/contexts/IdiomaContext';
export default function AuthCallback() {
  const { t } = useIdioma();
  const router = useRouter();
  const [errorMsg, setErrorMsg] = useState('');
  const navegoRef = React.useRef(false);

  // Red de seguridad: pase lo que pase, nadie se queda en esta pantalla.
  // Si a los 10 segundos nadie navego, se sale al login con un aviso. Vale
  // mil veces mas un "el enlace no se pudo abrir" que un rectangulo mudo.
  React.useEffect(() => {
    const reloj = setTimeout(() => {
      if (navegoRef.current) return;
      dejarRastro('auth/callback', 'me quede atascado 10s, salgo al login');
      navegoRef.current = true;
      router.replace('/login?error=oauth_error');
    }, 10000);
    return () => clearTimeout(reloj);
  }, [router]);

  React.useEffect(() => {
    dejarRastro('auth/callback', 'monto la pantalla', { plataforma: Platform.OS });
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      // Lee los parametros venga como vengan: despues del '#' (flow implicit,
      // que es como llega hoy el link de recuperar contrasena) o despues del
      // '?' (flow PKCE, como llegaba antes y como siguen llegando los links
      // pedidos desde una version vieja de la app).
      const parseParams = (url: string): Record<string, string> => {
        const out: Record<string, string> = {};
        const trozos = [
          url.includes('#') ? url.split('#')[1] : '',
          url.includes('?') ? url.split('?')[1].split('#')[0] : '',
        ];
        for (const trozo of trozos) {
          trozo.split('&').forEach((pair) => {
            const [k, v] = pair.split('=');
            if (k && v) out[decodeURIComponent(k)] = decodeURIComponent(v);
          });
        }
        return out;
      };

      const handleUrl = async (incomingUrl: string) => {
        const params = parseParams(incomingUrl);

        // Un link de recuperacion se reconoce por 'type=recovery' (implicit).
        // Antes solo se miraba eso, y los links PKCE — que traen '?code=' y
        // NINGUN 'type=recovery' — se colaban sin ser detectados: la app abria
        // y no pasaba nada. Por eso ahora un '?code=' que aterrice en esta
        // pantalla tambien cuenta como recuperacion.
        const isRecovery = incomingUrl.includes('type=recovery') || !!params.code;

        if (isRecovery) {
          if (params.access_token && params.refresh_token) {
            await supabase.auth.setSession({
              access_token: params.access_token,
              refresh_token: params.refresh_token,
            });
          } else if (params.code) {
            // Link PKCE: el code_verifier quedo guardado en el AsyncStorage de
            // la app, asi que el canje SOLO puede hacerse aqui adentro.
            const { error } = await supabase.auth.exchangeCodeForSession(params.code);
            if (error) {
              console.warn('callback.tsx: nativo — falló el canje del code:', error.message);
            }
          }
          navegoRef.current = true;
          dejarRastro('auth/callback', 'voy a reset-password');
          router.replace('/reset-password');
          return;
        }

        // Si llegamos aquí desde un login (no registro), esperar la sesión y navegar.
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          navegoRef.current = true;
          router.replace('/');
        }
        // Si no hay sesión, register.tsx está procesando — no hacer nada
      };

      // getInitialURL solo devuelve el link cuando la app arranca en frio. Si
      // ya estaba abierta en segundo plano — el caso normal de quien acaba de
      // pedir el correo desde la app — el link llegaba por el evento 'url' y
      // se ignoraba por completo. Hay que escuchar los dos.
      (async () => {
        const initial = (await Linking.getInitialURL()) || '';
        if (initial) await handleUrl(initial);
      })();

      const sub = Linking.addEventListener('url', ({ url }) => {
        if (url) handleUrl(url);
      });
      return () => sub.remove();
    }

    // Web: manejar el OAuth redirect normalmente
    const handleCallback = async () => {
      try {
        const url = window.location.href;
        console.log('[AuthCallback] Processing OAuth callback:', url);
        // No basta con mirar el hash. El cliente principal usa
        // detectSessionInUrl en web, asi que Supabase consume y LIMPIA
        // '#access_token=...&type=recovery' de forma asincrona, a veces antes
        // de que este efecto lo lea. Cuando eso pasaba, isRecovery quedaba en
        // false, el destino era '/' y la persona terminaba dentro de la app
        // sin haber puesto nunca su contrasena nueva — que es justo lo que
        // paso el 8 de noviembre: abrio el enlace tres veces, quedo con sesion
        // y la clave siguio siendo la vieja.
        //
        // RECOVERY_FLOW_DETECTED_ON_LOAD se calcula una sola vez al importar
        // lib/supabase.ts, antes de que createClient() toque el hash. Existia
        // desde hace tiempo para esto, pero esta pantalla no lo usaba.
        const isRecovery =
          url.includes('type=recovery') || RECOVERY_FLOW_DETECTED_ON_LOAD;

        const search = window.location.search;
        const hash = window.location.hash;

        const params: Record<string, string> = {};
        const raw = (hash.startsWith('#') ? hash.slice(1) : '') || search.slice(1);
        raw.split('&').forEach((pair) => {
          const [k, v] = pair.split('=');
          if (k && v) params[decodeURIComponent(k)] = decodeURIComponent(v);
        });

        console.log('[AuthCallback] Params keys:', Object.keys(params));

        if (params.error) {
          console.error('[AuthCallback] OAuth error:', params.error);
          setErrorMsg(params.error_description || 'Error en autenticación');
          setTimeout(() => router.replace('/login?error=oauth_error'), 2000);
          return;
        }

        if (params.access_token && params.refresh_token) {
          console.log('[AuthCallback] Setting session from tokens');
          const { error } = await supabase.auth.setSession({
            access_token: params.access_token,
            refresh_token: params.refresh_token,
          });
          if (error) throw error;
        } else if (params.code) {
          console.log('[AuthCallback] Exchanging code for session');
          const { error } = await supabase.auth.exchangeCodeForSession(params.code);
          if (error) throw error;
        } else {
          console.log('[AuthCallback] No tokens in URL — checking if Supabase already processed them');
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        const destination = isRecovery ? '/reset-password' : '/';

        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          console.log('[AuthCallback] Session confirmed, redirecting to', destination);
          navegoRef.current = true;
            dejarRastro('auth/callback', 'navego a ' + destination);
            router.replace(destination as any);
        } else {
          console.log('[AuthCallback] No session yet, waiting...');
          await new Promise(resolve => setTimeout(resolve, 1000));
          const { data: { session: session2 } } = await supabase.auth.getSession();
          if (session2) {
            console.log('[AuthCallback] Session confirmed after wait, redirecting to', destination);
            navegoRef.current = true;
            dejarRastro('auth/callback', 'navego a ' + destination);
            router.replace(destination as any);
          } else {
            console.warn('[AuthCallback] No session after wait, redirecting to login');
            navegoRef.current = true;
            router.replace('/login?error=oauth_error');
          }
        }
      } catch (err: any) {
        console.error('[AuthCallback] Unexpected error:', err);
        setErrorMsg('Error al completar el inicio de sesión');
        setTimeout(() => router.replace('/login?error=oauth_error'), 2000);
      }
    };

    handleCallback();
  }, []);

  // ANTES esta rama devolvia <View style={styles.container} /> — una pantalla
  // entera del color #1a0010, es decir negra, con NADA encima: ni spinner, ni
  // texto, ni salida. El comentario decia "redirige inmediatamente", y mientras
  // el redirect ocurre eso se ve bien. El problema es cuando NO ocurre: si
  // getInitialURL() viene vacio y el evento 'url' no llega, la persona se queda
  // mirando un rectangulo negro para siempre.
  //
  // Eso es exactamente la "pantalla negra" que se reporto el 8 y el 9 de
  // noviembre de 2026 al abrir el enlace de recuperar contrasena. No era un
  // crash (el ErrorBoundary nunca se disparo) ni la pantalla de forgot-password
  // (esa pinta bien): era esta.
  //
  // Ahora pinta lo mismo que en web, y el temporizador de abajo garantiza que
  // nadie se quede encerrado.

  return (
    <View style={styles.container}>
      {errorMsg ? (
        <Text style={styles.errorText}>{errorMsg}</Text>
      ) : (
        <>
          <ActivityIndicator size="large" color="#AD1457" />
          <Text style={styles.loadingText}>{t('auth.completando')}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a0010',
    gap: 16,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
