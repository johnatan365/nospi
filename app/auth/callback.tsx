import { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, Text, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

type Status = 'loading' | 'error';

export default function AuthCallback() {
  const router = useRouter();
  const navigated = useRef(false);
  const [status, setStatus] = useState<Status>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    console.log('[AuthCallback] mounted, platform:', Platform.OS);

    if (Platform.OS !== 'web') {
      // Native: openOAuthBrowser in AuthContext handles the callback inline.
      // This screen is only reached on a cold-start deep link — just go home.
      console.log('[AuthCallback] native — redirecting to root');
      router.replace('/');
      return;
    }

    // ── Web OAuth callback handler ─────────────────────────────────────────
    //
    // After Google/Apple redirects back, the URL is one of:
    //   /auth/callback?code=XXXX          ← PKCE flow (most common)
    //   /auth/callback#access_token=...   ← implicit flow (legacy)
    //
    // Strategy:
    //   1. Subscribe to onAuthStateChange FIRST (catches scenario B: exchange
    //      completes after subscription but before getSession check).
    //   2. Check getSession() immediately (catches scenario A: exchange already
    //      completed before this component mounted).
    //   3. If still no session, manually call exchangeCodeForSession (catches
    //      scenario C: detectSessionInUrl is still in-flight or the code verifier
    //      was stored before the client re-initialised on this page).
    //   4. 15-second timeout as last resort → show error state.

    let unsubscribe: (() => void) | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    /**
     * Check the `users` table for a profile and navigate accordingly.
     * - Profile exists  → /(tabs)/events
     * - No profile      → /onboarding/name
     */
    const navigateAfterSession = async () => {
      if (navigated.current) return;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        console.log('[AuthCallback] navigateAfterSession — userId:', userId);

        if (!userId) {
          console.warn('[AuthCallback] navigateAfterSession called but no session user');
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('id')
          .eq('id', userId)
          .maybeSingle();

        if (profileError) {
          console.error('[AuthCallback] profile check error:', profileError.message);
          // Non-fatal — fall back to root which will re-check
        }

        const destination = profile ? '/(tabs)/events' : '/onboarding/name';
        console.log('[AuthCallback] profile exists:', !!profile, '→ navigating to:', destination);

        if (navigated.current) return;
        navigated.current = true;
        if (unsubscribe) unsubscribe();
        if (timeoutId) clearTimeout(timeoutId);
        router.replace(destination as any);
      } catch (err) {
        console.error('[AuthCallback] navigateAfterSession threw:', err);
        // Fall back to root — index.tsx will handle the routing
        if (!navigated.current) {
          navigated.current = true;
          if (unsubscribe) unsubscribe();
          if (timeoutId) clearTimeout(timeoutId);
          router.replace('/');
        }
      }
    };

    const showError = (msg: string) => {
      if (navigated.current) return;
      console.error('[AuthCallback] showing error:', msg);
      if (unsubscribe) unsubscribe();
      if (timeoutId) clearTimeout(timeoutId);
      setErrorMessage(msg);
      setStatus('error');
    };

    // Step 1: subscribe before anything else to avoid missing the SIGNED_IN event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[AuthCallback] onAuthStateChange:', event, 'session:', !!session);
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        navigateAfterSession();
      } else if (event === 'SIGNED_OUT') {
        showError('La sesión fue cerrada. Por favor intenta de nuevo.');
      }
    });
    unsubscribe = () => subscription.unsubscribe();

    // Step 2: check if exchange already completed before we subscribed (scenario A)
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('[AuthCallback] initial getSession — session:', !!session);
      if (session) {
        navigateAfterSession();
        return;
      }

      // Step 3: no session yet — try manual PKCE code exchange (scenario C)
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      console.log('[AuthCallback] no session yet, ?code present:', !!code);

      if (code) {
        console.log('[AuthCallback] manually calling exchangeCodeForSession');
        supabase.auth.exchangeCodeForSession(code)
          .then(({ data, error }) => {
            if (error) {
              console.error('[AuthCallback] exchangeCodeForSession error:', error.message);
              // Don't show error yet — onAuthStateChange may still fire
            } else if (data.session) {
              console.log('[AuthCallback] manual code exchange succeeded');
              navigateAfterSession();
            }
          })
          .catch((err) => {
            console.error('[AuthCallback] exchangeCodeForSession threw:', err);
          });
      } else {
        // Check for hash fragment (implicit flow — detectSessionInUrl handles it)
        const hasHashTokens = window.location.hash.includes('access_token');
        console.log('[AuthCallback] no code param, hash has access_token:', hasHashTokens);
        if (!hasHashTokens) {
          console.warn('[AuthCallback] no code and no hash tokens — waiting for onAuthStateChange or timeout');
        }
      }
    }).catch((err) => {
      console.error('[AuthCallback] initial getSession threw:', err);
    });

    // Step 4: timeout — if nothing fires in 15 s, show error
    timeoutId = setTimeout(() => {
      console.warn('[AuthCallback] 15s timeout — no session confirmed');
      showError('El inicio de sesión tardó demasiado. Por favor intenta de nuevo.');
    }, 15000);

    return () => {
      if (unsubscribe) unsubscribe();
      if (timeoutId) clearTimeout(timeoutId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === 'error') {
    return (
      <View style={styles.container}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorTitle}>Error al iniciar sesión</Text>
        <Text style={styles.errorMessage}>{errorMessage}</Text>
        <Text
          style={styles.retryLink}
          onPress={() => {
            console.log('[AuthCallback] user tapped retry — navigating to /login');
            router.replace('/login');
          }}
        >
          Volver al inicio de sesión
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#AD1457" />
      <Text style={styles.loadingText}>Verificando sesión...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a0010',
    padding: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 10,
  },
  errorMessage: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  retryLink: {
    fontSize: 15,
    color: '#F06292',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
