import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState, useRef } from 'react';
import { ActivityIndicator, View, StyleSheet, Platform, Alert } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import * as Sentry from '@sentry/react-native';
import { supabase } from '@/lib/supabase';
import * as SplashScreen from 'expo-splash-screen';

// Lee los datos del onboarding desde localStorage (web) o AsyncStorage (nativo)
async function readOnboardingData() {
  if (Platform.OS === 'web') {
    const raw = localStorage.getItem('onboarding_data');
    const data = raw ? JSON.parse(raw) : {};
    return data;
  } else {
    const keys = [
      'onboarding_name', 'onboarding_birthdate', 'onboarding_age',
      'onboarding_gender', 'onboarding_interested_in', 'onboarding_age_range',
      'onboarding_country', 'onboarding_city', 'onboarding_phone',
      'onboarding_photo', 'onboarding_interests', 'onboarding_personality',
      'onboarding_compatibility',
    ];
    const pairs = await AsyncStorage.multiGet(keys);
    const data: Record<string, string> = {};
    for (const [k, v] of pairs) { if (v !== null) data[k] = v; }
    return data;
  }
}

async function clearOnboardingData() {
  if (Platform.OS === 'web') {
    localStorage.removeItem('onboarding_data');
    localStorage.removeItem('oauth_flow_type');
  } else {
    await AsyncStorage.multiRemove([
      'onboarding_name', 'onboarding_birthdate', 'onboarding_age',
      'onboarding_gender', 'onboarding_interested_in', 'onboarding_age_range',
      'onboarding_country', 'onboarding_city', 'onboarding_phone',
      'onboarding_photo', 'onboarding_interests', 'onboarding_personality',
      'onboarding_compatibility', 'oauth_flow_type',
    ]);
  }
}

// Oculta el splash screen — solo en nativo, web no lo usa
async function hideSplash() {
  if (Platform.OS !== 'web') {
    try {
      await SplashScreen.hideAsync();
    } catch (_) {
      // Ignorar si ya fue ocultado
    }
  }
}

export default function Index() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [isCheckingProfile, setIsCheckingProfile] = useState(false);
  const [waitingForContext, setWaitingForContext] = useState(false);
  // Evita que index.tsx se re-ejecute cuando la app vuelve del background
  const hasNavigated = useRef(false);

  useEffect(() => {
    console.log('Index: Checking auth state - loading:', loading, 'user:', user?.id, 'waitingForContext:', waitingForContext);

    if (waitingForContext && user) {
      setWaitingForContext(false);
    }

    if (loading) return;

    // Resetear hasNavigated cuando el usuario cierra sesión (user pasa a null)
    // para que un nuevo login pueda navegar correctamente
    if (!user && !loading) {
      hasNavigated.current = false;
    }

    // Si ya navegamos una vez (ej: app volvió del background), no re-ejecutar
    if (hasNavigated.current) return;

    const checkProfileAndNavigate = async () => {
      if (user) {
        console.log('Index: User authenticated, checking profile existence');
        Sentry.addBreadcrumb({ message: 'Index: user authenticated', data: { userId: user.id, email: user.email } });
        setIsCheckingProfile(true);

        try {
          const { data: profile, error: profileError } = await supabase
            .from('users')
            .select('id, name, email')
            .eq('id', user.id)
            .maybeSingle();

          if (profileError) {
            console.error('Index: Error fetching profile:', profileError);
            await hideSplash();
            if (Platform.OS === 'web') {
              window.alert('Error al verificar tu perfil. Por favor, intenta de nuevo.');
            } else {
              Alert.alert('Error', 'Error al verificar tu perfil. Por favor, intenta de nuevo.');
            }
            router.replace('/welcome');
            return;
          }

          if (!profile) {
            let isRegisterFlow = false;
            if (Platform.OS === 'web') {
              isRegisterFlow = localStorage.getItem('oauth_flow_type') === 'register';
            } else {
              const flowType = await AsyncStorage.getItem('oauth_flow_type');
              isRegisterFlow = flowType === 'register';
            }
            Sentry.addBreadcrumb({ message: 'Index: no profile found', data: { isRegisterFlow, platform: Platform.OS } });

            if (isRegisterFlow) {
              console.log('Index: No profile — register flow, creating profile from onboarding data');
              try {
                const d = await readOnboardingData();

                const interests = d['onboarding_interests'] ? JSON.parse(d['onboarding_interests']) : [];
                const personality = d['onboarding_personality'] ? JSON.parse(d['onboarding_personality']) : [];
                const ageRange = d['onboarding_age_range'] ? JSON.parse(d['onboarding_age_range']) : { min: 18, max: 60 };
                const phoneInfo = d['onboarding_phone'] ? JSON.parse(d['onboarding_phone']) : { phoneNumber: '' };

                const { error: insertError } = await supabase.from('users').upsert({
                  id: user.id,
                  email: user.email,
                  name: d['onboarding_name'] || '',
                  birthdate: d['onboarding_birthdate'] || null,
                  age: d['onboarding_age'] ? parseInt(d['onboarding_age']) : 18,
                  gender: d['onboarding_gender'] || 'hombre',
                  interested_in: d['onboarding_interested_in'] || 'ambos',
                  age_range_min: ageRange.min,
                  age_range_max: ageRange.max,
                  country: d['onboarding_country'] || 'Colombia',
                  city: d['onboarding_city'] || 'Medellín',
                  phone: phoneInfo.phoneNumber || null,
                  profile_photo_url: d['onboarding_photo'] || null,
                  interests,
                  personality_traits: personality,
                  compatibility_percentage: d['onboarding_compatibility'] ? parseInt(d['onboarding_compatibility']) : 95,
                  notification_preferences: {
                    whatsapp: false,
                    email: true,
                    sms: false,
                    push: true,
                  },
                });

                if (insertError) {
                  console.error('Index: Error creating profile:', insertError);
                  await hideSplash();
                  if (Platform.OS === 'web') {
                    window.alert('Error al crear tu perfil. Por favor intenta de nuevo.');
                  } else {
                    Alert.alert('Error', 'Error al crear tu perfil. Por favor intenta de nuevo.');
                  }
                  await supabase.auth.signOut();
                  router.replace('/welcome');
                  return;
                }

                await clearOnboardingData();
                console.log('Index: Profile created successfully, redirecting to events');
                hasNavigated.current = true;
                await hideSplash();
                router.replace('/(tabs)/events');
              } catch (createErr) {
                console.error('Index: Unexpected error creating profile:', createErr);
                await hideSplash();
                await supabase.auth.signOut();
                router.replace('/welcome');
              }
            } else {
              console.log('Index: No profile — login flow, signing out and showing error');
              Sentry.captureMessage('Index: no_profile flow triggered', { level: 'warning', extra: { userId: user.id, platform: Platform.OS } });
              if (Platform.OS !== 'web') {
                await new Promise(r => setTimeout(r, 1500));
                const { data: retryProfile } = await supabase
                  .from('users')
                  .select('id')
                  .eq('id', user.id)
                  .maybeSingle();
                if (retryProfile) {
                  console.log('Index: Profile found on retry — navigating to events');
                  hasNavigated.current = true;
                  await hideSplash();
                  router.replace('/(tabs)/events');
                  return;
                }
              }
              try {
                await supabase.auth.signOut();
              } catch (signOutError) {
                console.error('Index: Error signing out:', signOutError);
              }
              hasNavigated.current = true;
              await hideSplash();
              router.replace('/login?error=no_profile');
            }
            return;
          }

          console.log('Index: Profile exists, checking for pending payment...');

          let hasPendingPayment = false;
          let paymentStatus = '';
          let transactionId = '';

          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            const urlParams = new URLSearchParams(window.location.search);
            paymentStatus = urlParams.get('payment_status') || '';
            transactionId = urlParams.get('transaction_id') || '';
            if (paymentStatus) hasPendingPayment = true;
          }

          if (!hasPendingPayment) {
            const pending = await AsyncStorage.getItem('pse_payment_pending');
            if (pending === 'true') hasPendingPayment = true;
          }

          if (hasPendingPayment) {
            console.log('Index: Pending payment detected, redirecting to subscription-plans');
            let target = '/subscription-plans';
            if (paymentStatus) {
              target += '?payment_status=' + paymentStatus;
              if (transactionId) target += '&transaction_id=' + transactionId;
            }
            hasNavigated.current = true;
            await hideSplash();
            router.replace(target as any);
          } else {
            console.log('Index: No pending payment, redirecting to events');
            hasNavigated.current = true;
            await hideSplash();
            router.replace('/(tabs)/events');
          }
        } catch (error) {
          console.error('Index: Unexpected error during profile check:', error);
          await hideSplash();
          if (Platform.OS === 'web') {
            window.alert('Ocurrió un error inesperado. Por favor, intenta de nuevo.');
          } else {
            Alert.alert('Error', 'Ocurrió un error inesperado. Por favor, intenta de nuevo.');
          }
          router.replace('/welcome');
        } finally {
          setIsCheckingProfile(false);
        }
      } else {
        if (Platform.OS === 'web') {
          const search = window.location.search;
          const hash = window.location.hash;

          if (search.includes('code=')) {
            console.log('Index: OAuth code detected at root — forwarding to /auth/callback');
            router.replace(('/auth/callback' + search) as any);
            return;
          }

          if (hash.includes('access_token')) {
            console.log('Index: OAuth tokens detected at root — forwarding to /auth/callback');
            router.replace(('/auth/callback' + hash) as any);
            return;
          }

          if (window.location.pathname.includes('/auth/')) {
            console.log('Index: Already on auth route — skipping redirect');
            return;
          }
        }

        console.log('Index: user=null in context, verifying with supabase.auth.getSession()');
        const { data: { session: directSession } } = await supabase.auth.getSession();
        if (directSession?.user) {
          console.log('Index: Direct session found, waiting for context to catch up...');
          setWaitingForContext(true);
          return;
        }
        console.log('Index: No session found, redirecting to welcome');
        hasNavigated.current = true;
        await hideSplash();
        router.replace('/welcome');
      }
    };

    checkProfileAndNavigate();
  }, [loading, user, router, waitingForContext]);

  if (loading || isCheckingProfile || waitingForContext) {
    console.log('Index: Showing loading indicator — loading:', loading, 'checkingProfile:', isCheckingProfile);
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#AD1457" />
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a0010',
  },
});
