import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackScreen() {
  const [message, setMessage] = useState('Procesando autenticación...');

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    handleCallback();
  }, []);

  const handleCallback = async () => {
    try {
      console.log('[AuthCallback] Processing OAuth callback');
      const url = window.location.href;
      const hashParams: Record<string, string> = {};
      const queryParams: Record<string, string> = {};

      const fragment = url.includes('#') ? url.split('#')[1] : '';
      const query = url.includes('?') ? url.split('?')[1]?.split('#')[0] : '';

      fragment.split('&').forEach(pair => {
        const [k, v] = pair.split('=');
        if (k && v) hashParams[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
      });
      query.split('&').forEach(pair => {
        const [k, v] = pair.split('=');
        if (k && v) queryParams[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
      });

      let session = null;

      if (hashParams.access_token && hashParams.refresh_token) {
        console.log('[AuthCallback] Setting session from hash params (implicit flow)');
        const { data, error } = await supabase.auth.setSession({
          access_token: hashParams.access_token,
          refresh_token: hashParams.refresh_token,
        });
        if (error) throw error;
        session = data.session;
      } else if (queryParams.code) {
        console.log('[AuthCallback] Exchanging code for session (PKCE flow)');
        const { data, error } = await supabase.auth.exchangeCodeForSession(queryParams.code);
        if (error) throw error;
        session = data.session;
      } else {
        console.log('[AuthCallback] Letting Supabase detect session from URL');
        const { data } = await supabase.auth.getSession();
        session = data.session;
      }

      if (session) {
        console.log('[AuthCallback] Session established successfully');
        setMessage('¡Autenticación exitosa!');
        if (window.opener) {
          window.opener.postMessage(
            { type: 'oauth-success', token: session.access_token },
            window.location.origin
          );
          setTimeout(() => window.close(), 500);
        } else {
          window.location.href = '/';
        }
      } else {
        throw new Error('No session established');
      }
    } catch (err: any) {
      console.error('[AuthCallback] Auth callback error:', err);
      setMessage('Error de autenticación');
      if (window.opener) {
        window.opener.postMessage(
          { type: 'oauth-error', error: err?.message || 'Authentication failed' },
          window.location.origin
        );
        setTimeout(() => window.close(), 1500);
      } else {
        setTimeout(() => { window.location.href = '/login'; }, 2000);
      }
    }
  };

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#AD1457" />
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#1a0010',
  },
  message: {
    fontSize: 18,
    marginTop: 20,
    textAlign: 'center',
    color: '#fff',
  },
});
