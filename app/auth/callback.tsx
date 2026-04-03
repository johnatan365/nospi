import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';

export default function AuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams();

  useEffect(() => {
    const handleCallback = async () => {
      console.log('AuthCallback: processing OAuth callback, platform:', Platform.OS);

      if (Platform.OS === 'web') {
        // On web, Supabase's detectSessionInUrl automatically parses the code/tokens
        // from the URL and establishes the session. We just need to wait for it.
        console.log('AuthCallback: web — waiting for Supabase to detect session from URL...');
        try {
          // Give Supabase a moment to process the URL params, then check the session.
          const { data, error } = await supabase.auth.getSession();
          if (error) {
            console.error('AuthCallback: web getSession error:', error);
          }
          if (data?.session) {
            console.log('AuthCallback: web session detected, navigating to events');
            router.replace('/(tabs)/events');
          } else {
            // Session not yet ready — subscribe to auth state change and wait
            console.log('AuthCallback: web session not yet ready, subscribing to auth state...');
            const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
              console.log('AuthCallback: web auth state change:', event);
              if (session) {
                subscription.unsubscribe();
                console.log('AuthCallback: web session established via state change, navigating');
                router.replace('/(tabs)/events');
              } else if (event === 'SIGNED_OUT') {
                subscription.unsubscribe();
                router.replace('/login');
              }
            });

            // Timeout fallback — if no session after 10s, redirect to login
            setTimeout(() => {
              subscription.unsubscribe();
              console.warn('AuthCallback: web session timeout, redirecting to login');
              router.replace('/login');
            }, 10000);
          }
        } catch (err) {
          console.error('AuthCallback: web unexpected error:', err);
          router.replace('/login');
        }
        return;
      }

      // Native: params are passed explicitly from login.tsx via router.push
      console.log('AuthCallback: native — params:', JSON.stringify(params));
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
