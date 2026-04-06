/**
 * app/auth/callback.tsx
 *
 * Web-only route that handles the OAuth redirect from Google / Apple.
 * Supabase redirects to https://app.nospi.co/auth/callback?code=...
 * This page exchanges the code for a session and sends the user to /
 * where index.tsx takes over (checks profile, routes to events or error).
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
      // This route only makes sense on web
      router.replace('/');
      return;
    }

    const handleCallback = async () => {
      try {
        const url = window.location.href;
        console.log('[AuthCallback] Processing OAuth callback:', url);

        const params: Record<string, string> = {};

        // Try fragment first (implicit flow), then query string (PKCE flow)
        const fragment = url.includes('#') ? url.split('#')[1] : '';
        const query = url.includes('?') ? url.split('?')[1].split('#')[0] : '';
        const raw = fragment || query;

        raw.split('&').forEach((pair) => {
          const [k, v] = pair.split('=');
          if (k && v) params[decodeURIComponent(k)] = decodeURIComponent(v);
        });

        console.log('[AuthCallback] Params keys:', Object.keys(params));

        if (params.error) {
          console.error('[AuthCallback] OAuth error:', params.error, params.error_description);
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
          console.warn('[AuthCallback] No tokens or code found');
          router.replace('/login?error=oauth_error');
          return;
        }

        console.log('[AuthCallback] Session established, redirecting to /');
        router.replace('/');
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
