
import { useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, View, StyleSheet, Alert, Platform } from 'react-native';
import { useSupabase } from '@/contexts/SupabaseContext';
import { nospiColors } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function Index() {
  const router = useRouter();
  const { user, loading } = useSupabase();
  const hasNavigated = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (hasNavigated.current) return;

    const checkAndNavigate = async () => {
      // Si hay pago pendiente, no interrumpir — subscription-plans maneja la navegación
      const paymentPending = await AsyncStorage.getItem('pse_payment_pending');
      if (paymentPending === 'true') return;

      if (user) {
        try {
          const { data: profile, error: profileError } = await supabase
            .from('users')
            .select('id')
            .eq('id', user.id)
            .maybeSingle();

          if (profileError && profileError.code !== 'PGRST116') {
            await supabase.auth.signOut();
            hasNavigated.current = true;
            router.replace('/welcome');
            return;
          }

          if (!profile) {
            await supabase.auth.signOut();
            hasNavigated.current = true;
            if (Platform.OS === 'web') {
              router.replace('/onboarding/register');
            } else {
              Alert.alert(
                'Registro Requerido',
                'Debes registrarte primero en la aplicación antes de iniciar sesión con Google.',
                [{ text: 'OK', onPress: () => router.replace('/onboarding/register') }]
              );
            }
            return;
          }

          hasNavigated.current = true;
          router.replace('/(tabs)/events');
        } catch (error) {
          await supabase.auth.signOut();
          hasNavigated.current = true;
          router.replace('/welcome');
        }
      } else {
        hasNavigated.current = true;
        router.replace('/welcome');
      }
    };

    checkAndNavigate();
  }, [loading, user]);

  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={nospiColors.purpleDark} />
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
});
