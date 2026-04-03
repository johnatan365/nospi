import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';

export default function AuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams();

  useEffect(() => {
    const handleCallback = async () => {
      console.log('AuthCallback: processing OAuth callback, params:', JSON.stringify(params));
      try {
        const code = params.code as string | undefined;
        const accessToken = params.access_token as string | undefined;
        const refreshToken = params.refresh_token as string | undefined;

        if (code) {
          console.log('AuthCallback: exchanging PKCE code for session...');
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.error('AuthCallback: code exchange error:', error);
            router.replace('/login');
            return;
          }
          console.log('AuthCallback: session established, navigating to events');
          router.replace('/(tabs)/events');
        } else if (accessToken && refreshToken) {
          console.log('AuthCallback: setting session from implicit tokens...');
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            console.error('AuthCallback: set session error:', error);
            router.replace('/login');
            return;
          }
          console.log('AuthCallback: session set, navigating to events');
          router.replace('/(tabs)/events');
        } else {
          console.warn('AuthCallback: no code or tokens in params, navigating to events (session may already be set)');
          router.replace('/(tabs)/events');
        }
      } catch (err) {
        console.error('AuthCallback: unexpected error:', err);
        router.replace('/login');
      }
    };

    handleCallback();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#880E4F" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});
