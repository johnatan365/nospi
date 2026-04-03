import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    console.log('[AuthCallback] mounted, platform:', Platform.OS);

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
      // Native: the deep-link is handled inside AuthContext / openOAuthBrowser.
      // This route should not normally be reached on native, but redirect just in case.
      console.log('[AuthCallback] native — redirecting to root');
      router.replace('/');
    }
  }, [router]);

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
