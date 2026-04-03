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
            console.log('Index: No profile found, redirecting to onboarding');
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
