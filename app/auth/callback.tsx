import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';

export default function AuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; access_token?: string; refresh_token?: string }>();

  useEffect(() => {
    console.log('[AuthCallback] mounted, platform:', Platform.OS);

    async function handleCallback() {
      try {
        if (Platform.OS === 'web') {
          // With detectSessionInUrl: true, Supabase auto-exchanges the PKCE code
          // when the client initialises on this page. We just wait for SIGNED_IN.
          const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            console.log('[AuthCallback] auth state change:', event, 'session:', !!session);
            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
              console.log('[AuthCallback] signed in — redirecting to root');
              subscription.unsubscribe();
              router.replace('/');
            }
          });

          // Fallback: if no SIGNED_IN fires within 5 s, redirect anyway
          const timeout = setTimeout(() => {
            console.warn('[AuthCallback] timeout — redirecting to root without confirmed session');
            subscription.unsubscribe();
            router.replace('/');
          }, 5000);

          return () => {
            subscription.unsubscribe();
            clearTimeout(timeout);
          };
        } else {
          // Native fallback: openOAuthBrowser in AuthContext handles the callback
          // inline via result.url. This screen is only reached if the deep link
          // somehow bypasses that flow (e.g. cold-start from a background tap).
          console.log('[AuthCallback] native fallback — params:', JSON.stringify(params));
          const { code, access_token, refresh_token } = params;
          if (code) {
            console.log('[AuthCallback] exchanging PKCE code for session');
            await supabase.auth.exchangeCodeForSession(code);
          } else if (access_token && refresh_token) {
            console.log('[AuthCallback] setting session from tokens');
            await supabase.auth.setSession({ access_token, refresh_token });
          } else {
            console.warn('[AuthCallback] native — no code or tokens, redirecting to root');
          }
          router.replace('/');
        }
      } catch (e) {
        console.error('[AuthCallback] error:', e);
        router.replace('/');
      }
    }

    handleCallback();
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#AD1457" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a0010',
  },
});
