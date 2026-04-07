import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View, StyleSheet, Platform, Alert } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

export default function Index() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [isCheckingProfile, setIsCheckingProfile] = useState(false);
  const [waitingForContext, setWaitingForContext] = useState(false);

  useEffect(() => {
    console.log('Index: Checking auth state - loading:', loading, 'user:', user?.id, 'waitingForContext:', waitingForContext);

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
            // Verificar si viene de un flujo de registro
            let isRegisterFlow = false;
            if (Platform.OS === 'web') {
              isRegisterFlow = localStorage.getItem('oauth_flow_type') === 'register';
              localStorage.removeItem('oauth_flow_type');
            } else {
              const flowType = await AsyncStorage.getItem('oauth_flow_type');
              isRegisterFlow = flowType === 'register';
              await AsyncStorage.removeItem('oauth_flow_type');
            }

            if (isRegisterFlow) {
              console.log('Index: No profile — register flow, redirecting to onboarding');
              router.replace('/onboarding/name');
            } else {
              console.log('Index: No profile — login flow, signing out and showing error');
              try {
                await supabase.auth.signOut();
              } catch (signOutError) {
                console.error('Index: Error signing out:', signOutError);
              }
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
