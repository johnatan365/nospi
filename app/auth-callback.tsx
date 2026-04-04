import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';

/**
 * /auth-callback — legacy route kept so old deep-links don't 404.
 *
 * The real OAuth callback handler lives at /auth/callback (app/auth/callback.tsx).
 * On web, forward any query/hash params there so Supabase can exchange the code.
 * On native, just go home — AuthContext handles the deep-link inline.
 */
export default function AuthCallbackRedirect() {
  const router = useRouter();

  useEffect(() => {
    console.log('[auth-callback] mounted — forwarding to /auth/callback, platform:', Platform.OS);

    if (Platform.OS === 'web') {
      // Preserve query string and hash so Supabase can exchange the PKCE code
      const search = window.location.search || '';
      const hash = window.location.hash || '';
      const target = '/auth/callback' + search + hash;
      console.log('[auth-callback] web redirect to:', target);
      window.location.replace(target);
    } else {
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
