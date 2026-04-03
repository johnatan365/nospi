import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';

export default function AuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; access_token?: string; refresh_token?: string }>();

  useEffect(() => {
    async function handleCallback() {
      console.log('AuthCallback: handling OAuth callback, params:', JSON.stringify(params));
      try {
        const { code, access_token, refresh_token } = params;

        if (code) {
          console.log('AuthCallback: exchanging code for session');
          await supabase.auth.exchangeCodeForSession(code as string);
          console.log('AuthCallback: code exchange successful');
        } else if (access_token && refresh_token) {
          console.log('AuthCallback: setting session from tokens');
          await supabase.auth.setSession({
            access_token: access_token as string,
            refresh_token: refresh_token as string,
          });
          console.log('AuthCallback: session set successfully');
        } else {
          console.warn('AuthCallback: no code or tokens found in params');
        }
      } catch (e) {
        console.error('AuthCallback: error handling callback:', e);
      } finally {
        console.log('AuthCallback: redirecting to root');
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
