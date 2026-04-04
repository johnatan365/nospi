import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';

/**
 * auth-popup.tsx — legacy route kept for backward compatibility.
 *
 * On web the OAuth flow is a full browser redirect initiated directly from
 * AuthContext (signInWithGoogle / signInWithApple). This screen is NOT used
 * in the web flow. It is only kept so that any stale deep-links or bookmarks
 * don't 404.
 *
 * If somehow reached on web with a provider param, it falls through to the
 * same Supabase redirect that AuthContext would have done.
 */
export default function AuthPopupScreen() {
  const { provider } = useLocalSearchParams<{ provider: string }>();

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const validProviders = ['apple', 'google'];
    if (!provider || !validProviders.includes(provider)) {
      console.log('[AuthPopup] No valid provider param — nothing to do');
      return;
    }

    console.log('[AuthPopup] Fallback: triggering Supabase OAuth redirect for provider:', provider);
    supabase.auth.signInWithOAuth({
      provider: provider as 'google' | 'apple',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        skipBrowserRedirect: false,
      },
    }).then(({ error }) => {
      if (error) {
        console.error('[AuthPopup] OAuth error:', error.message);
      }
      // Supabase will redirect the browser to the provider, then back to /auth/callback
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
