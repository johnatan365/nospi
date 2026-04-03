import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { useSupabase } from '@/contexts/SupabaseContext';
import { supabase } from '@/lib/supabase';

export default function Index() {
  const router = useRouter();
  const { user, loading } = useSupabase();
  const [isCheckingProfile, setIsCheckingProfile] = useState(false);

  useEffect(() => {
    console.log('Index: Checking auth state - loading:', loading, 'user:', user?.id);

    // Do not navigate while auth is still loading — OAuth session may still be arriving
    if (loading) return;

    const checkProfileAndNavigate = async () => {
      if (user) {
        console.log('Index: User authenticated, checking profile existence');
        setIsCheckingProfile(true);

        try {
          // Check if user profile exists in users table
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
            await supabase.auth.signOut();
            router.replace('/welcome');
            return;
          }

          if (!profile) {
            // User authenticated via Google/Apple but hasn't completed onboarding yet
            console.log('Index: No profile found, redirecting to onboarding to complete registration');
            router.replace('/onboarding/name');
            return;
          }

          console.log('Index: Profile exists, checking for pending payment...');

          // Verificar si hay pago pendiente de Bancolombia/PSE
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

          await supabase.auth.signOut();
          router.replace('/welcome');
        } finally {
          setIsCheckingProfile(false);
        }
      } else {
        console.log('Index: No user, redirecting to welcome');
        router.replace('/welcome');
      }
    };

    checkProfileAndNavigate();
  }, [loading, user, router]);

  // Show loading while auth state is being resolved or profile is being checked.
  // IMPORTANT: while loading === true we must NOT navigate — the OAuth session
  // may still be arriving (SIGNED_IN fires after INITIAL_SESSION null).
  if (loading || isCheckingProfile) {
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
