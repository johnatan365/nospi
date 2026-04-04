import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';

export default function AuthPopupScreen() {
  const { provider } = useLocalSearchParams<{ provider: string }>();

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const validProviders = ['apple', 'google'];
    if (!provider || !validProviders.includes(provider)) {
      console.log('[AuthPopup] Invalid provider:', provider);
      window.opener?.postMessage({ type: 'oauth-error', error: 'Invalid provider' }, window.location.origin);
      return;
    }

    console.log('[AuthPopup] Starting OAuth with provider:', provider);
    supabase.auth.signInWithOAuth({
      provider: provider as 'google' | 'apple',
      options: {
        redirectTo: `${window.location.origin}/auth-callback`,
        skipBrowserRedirect: false,
      },
    }).then(({ error }) => {
      if (error) {
        console.log('[AuthPopup] OAuth error:', error.message);
        window.opener?.postMessage({ type: 'oauth-error', error: error.message }, window.location.origin);
      }
      // Supabase will redirect the popup window to Google/Apple, then back to /auth-callback
    });
  }, [provider]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#AD1457" />
      <Text style={styles.text}>Redirigiendo...</Text>
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
  text: {
    marginTop: 20,
    fontSize: 16,
    color: '#fff',
  },
});
