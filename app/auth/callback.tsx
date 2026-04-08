/**
 * app/auth/callback.tsx
 *
 * Web-only route que maneja el OAuth redirect de Google / Apple.
 * Con implicit flow, Supabase procesa los tokens del hash automáticamente
 * via detectSessionInUrl. Este componente solo espera que la sesión
 * se confirme y redirige a / donde index.tsx toma el control.
 */

import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

export default function AuthCallback() {
  const router = useRouter();
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (Platform.OS !== 'web') {
      router.replace('/');
      return;
    }

    const handleCallback = async () => {
      try {
        const url = window.location.href;
        console.log('[AuthCallback] Processing OAuth callback:', url);

        const search = window.location.search;
        const hash = window.location.hash;

        // Verificar si hay error explícito en la URL
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

        // Con implicit flow, Supabase ya procesó los tokens via detectSessionInUrl.
        // Solo necesitamos esperar a que la sesión esté disponible.
        // Si hay tokens o code en la URL, intercambiarlos manualmente como fallback.
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
          // No hay tokens ni code — puede que Supabase ya los procesó.
          // Esperar un momento y verificar si hay sesión activa.
          console.log('[AuthCallback] No tokens in URL — checking if Supabase already processed them');
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Verificar si hay sesión (ya sea procesada por nosotros o por Supabase)
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          console.log('[AuthCallback] Session confirmed, redirecting to /');
          router.replace('/');
        } else {
          // Esperar un poco más — Supabase puede estar procesando aún
          console.log('[AuthCallback] No session yet, waiting...');
          await new Promise(resolve => setTimeout(resolve, 1000));
          const { data: { session: session2 } } = await supabase.auth.getSession();
          if (session2) {
            console.log('[AuthCallback] Session confirmed after wait, redirecting to /');
            router.replace('/');
          } else {
            console.warn('[AuthCallback] No session after wait, redirecting to login');
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
