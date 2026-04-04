import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View, StyleSheet, Platform, Alert } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

/**
 * Read all onboarding keys from AsyncStorage in one shot.
 */
async function readOnboardingData() {
  const keys = [
    'onboarding_interests',
    'onboarding_personality',
    'onboarding_name',
    'onboarding_birthdate',
    'onboarding_age',
    'onboarding_gender',
    'onboarding_interested_in',
    'onboarding_age_range',
    'onboarding_country',
    'onboarding_city',
    'onboarding_phone',
    'onboarding_photo',
    'onboarding_compatibility',
  ];
  const pairs = await AsyncStorage.multiGet(keys);
  const map: Record<string, string | null> = {};
  for (const [k, v] of pairs) map[k] = v;
  return map;
}

/**
 * Clear all onboarding keys + the oauth flow flag from AsyncStorage.
 */
async function clearOnboardingData() {
  await AsyncStorage.multiRemove([
    'onboarding_interests',
    'onboarding_personality',
    'onboarding_name',
    'onboarding_birthdate',
    'onboarding_age',
    'onboarding_gender',
    'onboarding_interested_in',
    'onboarding_age_range',
    'onboarding_country',
    'onboarding_city',
    'onboarding_phone',
    'onboarding_photo',
    'onboarding_compatibility',
    'oauth_flow_type',
  ]);
}

export default function Index() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [isCheckingProfile, setIsCheckingProfile] = useState(false);
  const [waitingForContext, setWaitingForContext] = useState(false);

  useEffect(() => {
    console.log('Index: Checking auth state - loading:', loading, 'user:', user?.id, 'waitingForContext:', waitingForContext);

    // If we were waiting for context and user has now arrived, clear the flag.
    if (waitingForContext && user) {
      setWaitingForContext(false);
    }

    if (loading) return;

    const checkProfileAndNavigate = async () => {
      if (user) {
        console.log('Index: User authenticated, checking profile existence');
        setIsCheckingProfile(true);

        try {
          const { data: profile, error: profileError } = await supabase
            .from('users')
            .select('id, name, email')
            .eq('id', user.id)
            .maybeSingle();

          if (profileError) {
            console.error('Index: Error fetching profile:', profileError);
            if (Platform.OS === 'web') {
              window.alert('Error al verificar tu perfil. Por favor, intenta de nuevo.');
            } else {
              Alert.alert('Error', 'Error al verificar tu perfil. Por favor, intenta de nuevo.');
            }
            router.replace('/welcome');
            return;
          }

          if (!profile) {
            // Check whether the user was mid-registration when they signed in via OAuth.
            // If so, we have locally-stored onboarding data — use it to create the profile
            // right here instead of sending them back to the name screen.
            const oauthFlowType = await AsyncStorage.getItem('oauth_flow_type');
            console.log('Index: No profile found, oauth_flow_type:', oauthFlowType);

            if (oauthFlowType === 'register') {
              console.log('Index: OAuth register flow detected — creating profile from onboarding data');
              const stored = await readOnboardingData();

              // User-entered data takes priority; OAuth provider metadata is the fallback.
              const oauthMeta = user.user_metadata ?? {};
              const oauthName: string = oauthMeta.full_name || oauthMeta.name || '';
              const oauthPhoto: string = oauthMeta.avatar_url || oauthMeta.picture || '';

              const name: string = stored['onboarding_name'] || oauthName;
              const photo: string | null = stored['onboarding_photo'] || oauthPhoto || null;
              const birthdate: string = stored['onboarding_birthdate'] || '';
              const age: number = stored['onboarding_age'] ? parseInt(stored['onboarding_age']!) : 18;
              const gender: string = stored['onboarding_gender'] || 'hombre';
              const interestedIn: string = stored['onboarding_interested_in'] || 'ambos';
              const ageRange = stored['onboarding_age_range']
                ? JSON.parse(stored['onboarding_age_range']!)
                : { min: 18, max: 60 };
              const country: string = stored['onboarding_country'] || 'Colombia';
              const city: string = stored['onboarding_city'] || 'Medellín';
              const phoneInfo = stored['onboarding_phone']
                ? JSON.parse(stored['onboarding_phone']!)
                : { phoneNumber: '' };
              const interests: string[] = stored['onboarding_interests']
                ? JSON.parse(stored['onboarding_interests']!)
                : [];
              const personality: string[] = stored['onboarding_personality']
                ? JSON.parse(stored['onboarding_personality']!)
                : [];
              const compatibility: number = stored['onboarding_compatibility']
                ? parseInt(stored['onboarding_compatibility']!)
                : 95;

              console.log('Index: Creating profile — name:', name, 'photo from user:', !!stored['onboarding_photo'], 'photo from oauth:', !!oauthPhoto);

              const { error: insertError } = await supabase.from('users').insert({
                id: user.id,
                email: user.email ?? '',
                name,
                birthdate,
                age,
                gender,
                interested_in: interestedIn,
                age_range_min: ageRange.min,
                age_range_max: ageRange.max,
                country,
                city,
                phone: phoneInfo.phoneNumber || '',
                profile_photo_url: photo,
                interests,
                personality_traits: personality,
                compatibility_percentage: compatibility,
                notification_preferences: {
                  whatsapp: false,
                  email: true,
                  sms: false,
                  push: true,
                },
              });

              if (insertError) {
                console.error('Index: Profile insert error:', insertError.message);
                // If it's a duplicate (race condition), just proceed to events
                if (!insertError.message.includes('duplicate') && !insertError.message.includes('already exists')) {
                  if (Platform.OS === 'web') {
                    window.alert('Error al crear tu perfil. Por favor, intenta de nuevo.');
                  } else {
                    Alert.alert('Error', 'Error al crear tu perfil. Por favor, intenta de nuevo.');
                  }
                  router.replace('/welcome');
                  return;
                }
              } else {
                console.log('Index: Profile created successfully from onboarding data');
              }

              await clearOnboardingData();
              console.log('Index: Onboarding data cleared, navigating to events');
              router.replace('/(tabs)/events');
              return;
            }

            // No pending registration data — send to normal onboarding start
            console.log('Index: No profile and no pending registration, redirecting to onboarding/name');
            router.replace('/onboarding/name');
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
            router.replace(target as any);
          } else {
            console.log('Index: No pending payment, redirecting to events');
            router.replace('/(tabs)/events');
          }
        } catch (error) {
          console.error('Index: Unexpected error during profile check:', error);
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
          // On web, check if we're on the auth callback page or if URL has OAuth params.
          // If so, Supabase's detectSessionInUrl is still processing — don't redirect yet.
          const currentPath = window.location.pathname;
          const hasOAuthParams =
            window.location.search.includes('code=') ||
            window.location.hash.includes('access_token');
          if (currentPath.includes('auth') || hasOAuthParams) {
            console.log('Index: Web OAuth callback in progress — skipping redirect');
            return;
          }
        }

        // Double-check with Supabase directly — SupabaseContext may not have
        // propagated the SIGNED_IN event yet (race after OAuth callback).
        console.log('Index: user=null in context, verifying with supabase.auth.getSession()');
        const { data: { session: directSession } } = await supabase.auth.getSession();
        if (directSession?.user) {
          console.log('Index: Direct session found, waiting for context to catch up...');
          // Show spinner and wait — SupabaseContext will fire SIGNED_IN and
          // re-trigger this effect with user !== null.
          setWaitingForContext(true);
          return;
        }
        console.log('Index: No session found, redirecting to welcome');
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
