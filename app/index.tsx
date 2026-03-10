
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View, StyleSheet, Alert, Platform } from 'react-native';
import { useSupabase } from '@/contexts/SupabaseContext';
import { nospiColors } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function Index() {
  const router = useRouter();
  const { user, loading } = useSupabase();
  const [initialCheckDone, setInitialCheckDone] = useState(false);
  const [isCheckingProfile, setIsCheckingProfile] = useState(false);

  useEffect(() => {
    console.log('Index: Checking auth state - loading:', loading, 'user:', user?.id);
    
    const checkProfileAndNavigate = async () => {
      if (!loading) {
        // Si hay un pago pendiente, no interrumpir — subscription-plans maneja la navegación
        const paymentPending = await AsyncStorage.getItem('pse_payment_pending');
        if (paymentPending === 'true') {
          setInitialCheckDone(true);
          return;
        }

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

            if (profileError && profileError.code !== 'PGRST116') {
              console.error('Index: Error checking profile:', profileError);
              
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
              // User authenticated via Google but no profile in users table
              console.log('Index: Google user authenticated but no profile found. Signing out.');
              await supabase.auth.signOut();
              
              if (Platform.OS === 'web') {
                const shouldRegister = window.confirm(
                  'Debes registrarte primero en la aplicación antes de iniciar sesión con Google.\n\n¿Ir a registro?'
                );
                if (shouldRegister) {
                  router.replace('/onboarding/register');
                } else {
                  router.replace('/welcome');
                }
              } else {
                Alert.alert(
                  'Registro Requerido',
                  'Debes registrarte primero en la aplicación antes de iniciar sesión con Google.',
                  [{ text: 'OK', onPress: () => router.replace('/onboarding/register') }]
                );
              }
              return;
            }

            console.log('Index: Profile exists, redirecting to events');
            router.replace('/(tabs)/events');
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
            setInitialCheckDone(true);
          }
        } else {
          console.log('Index: No user, redirecting to welcome');
          setInitialCheckDone(true);
          router.replace('/welcome');
        }
      }
    };

    checkProfileAndNavigate();
  }, [loading, user, router]);

  // Show loading while checking auth state or profile
  if (!initialCheckDone || isCheckingProfile) {
    console.log('Index: Showing loading indicator');
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={nospiColors.purpleDark} />
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
    backgroundColor: '#FFFFFF',
  },
});
