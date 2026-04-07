/**
 * app/auth/callback.tsx
 *
 * Maneja el OAuth redirect de Google / Apple tanto en web como en nativo.
 *
 * En nativo: register.tsx navega aquí con { code } o { access_token, refresh_token }
 *   como route params de expo-router (useLocalSearchParams).
 *
 * En web: Supabase redirige el browser aquí con los params en el hash o query string.
 *   Supabase puede haber procesado los tokens automáticamente via detectSessionInUrl.
 *
 * En ambos casos, después de establecer la sesión, redirige a / donde
 * index.tsx decide a dónde ir según si existe perfil o no.
 */

import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, StyleSheet, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';

export default function AuthCallback() {
  const router = useRouter();
  const routeParams = useLocalSearchParams<{
    code?: string;
    access_token?: string;
    refresh_token?: string;
  }>();
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        let code: string | undefined;
        let accessToken: string | undefined;
        let refreshToken: string | undefined;

        if (Platform.OS !== 'web') {
          // ── Nativo: los params vienen de expo-router (register.tsx los pasó) ──
          code = routeParams.code;
          accessToken = routeParams.access_token;
          refreshToken = routeParams.refresh_token;
          console.log('[AuthCallback] Native — params from expo-router:', {
            hasCode: !!code,
            hasTokens: !!(accessToken && refreshToken),
          });
        } else {
          // ── Web: los params vienen del hash o query string del browser ──
          const search = window.location.search;
          const hash = window.location.hash;
          console.log('[AuthCallback] Web — processing URL:', window.location.href);

          const webParams: Record<string, string> = {};
          const raw = (hash.startsWith('#') ? hash.slice(1) : '') || search.slice(1);
          raw.split('&').forEach((pair) => {
            const [k, v] = pair.split('=');
            if (k && v) webParams[decodeURIComponent(k)] = decodeURIComponent(v);
          });

          console.log('[AuthCallback] Web params keys:', Object.keys(webParams));

          if (webParams.error) {
            console.error('[AuthCallback] OAuth error from provider:', webParams.error);
            setErrorMsg(webParams.error_description || 'Error en autenticación');
            setTimeout(() => router.replace('/login?error=oauth_error' as any), 2000);
            return;
          }

          code = webParams.code;
          accessToken = webParams.access_token;
          refreshToken = webParams.refresh_token;
        }

        // ── Procesar tokens o code ──────────────────────────────────────────────

        if (accessToken && refreshToken) {
          console.log('[AuthCallback] Setting session from access_token + refresh_token');
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            console.error('[AuthCallback] setSession error:', error.message);
            throw error;
          }
        } else if (code) {
          console.log('[AuthCallback] Exchanging code for session');
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.error('[AuthCallback] exchangeCodeForSession error:', error.message);
            throw error;
          }
        } else {
          // En web, Supabase puede haber procesado los tokens automáticamente
          // via detectSessionInUrl. Esperar a que la sesión esté disponible.
          console.log('[AuthCallback] No tokens/code — waiting for Supabase to process automatically');
          await new Promise(resolve => setTimeout(resolve, 600));
        }

        // ── Verificar sesión y navegar ──────────────────────────────────────────

        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          console.log('[AuthCallback] Session confirmed, navigating to /');
          router.replace('/');
          return;
        }

        // Segundo intento — Supabase puede estar procesando aún
        console.log('[AuthCallback] No session yet, waiting 1s more...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        const { data: { session: session2 } } = await supabase.auth.getSession();
        if (session2) {
          console.log('[AuthCallback] Session confirmed on second attempt, navigating to /');
          router.replace('/');
        } else {
          console.warn('[AuthCallback] No session after retries — redirecting to login');
          router.replace('/login?error=oauth_error' as any);
        }
      } catch (err: any) {
        console.error('[AuthCallback] Unexpected error:', err);
        setErrorMsg('Error al completar el inicio de sesión');
        setTimeout(() => router.replace('/login?error=oauth_error' as any), 2000);
      }
    };

    handleCallback();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container}>
      {errorMsg ? (
        <Text style={styles.errorText}>{errorMsg}</Text>
      ) : (
        <>
          <ActivityIndicator size="large" color="#AD1457" />
          <Text style={styles.loadingText}>Completando inicio de sesión...</Text>
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
