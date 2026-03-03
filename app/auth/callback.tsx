
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text, Alert, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { nospiColors } from '@/constants/Colors';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [status, setStatus] = useState('Procesando autenticación...');

  useEffect(() => {
    console.log('AuthCallbackScreen: OAuth callback received');
    console.log('AuthCallbackScreen: URL params:', params);
    console.log('AuthCallbackScreen: Platform:', Platform.OS);
    
    const handleCallback = async () => {
      try {
        // Wait a bit for Supabase to process the URL session
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Extract tokens from URL params (for native apps)
        const accessToken = params.access_token as string;
        const refreshToken = params.refresh_token as string;
        const type = params.type as string;

        console.log('AuthCallbackScreen: Token type:', type);
        console.log('AuthCallbackScreen: Has access token:', !!accessToken);
        console.log('AuthCallbackScreen: Has refresh token:', !!refreshToken);

        // Try to set session from URL tokens first (native flow)
        if (accessToken && refreshToken) {
          console.log('AuthCallbackScreen: Setting session from URL tokens (native flow)');
          
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            console.error('AuthCallbackScreen: Error setting session:', error);
            setStatus('Error al establecer la sesión');
            setTimeout(() => {
              router.replace('/welcome');
            }, 2000);
            return;
          }

          if (data.session) {
            console.log('AuthCallbackScreen: Session set successfully from tokens, user:', data.session.user.id);
            await processUserProfile(data.session.user);
            return;
          }
        }

        // Fallback: Try to get session from Supabase (web flow with detectSessionInUrl)
        console.log('AuthCallbackScreen: Checking for session from Supabase (web flow)');
        
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('AuthCallbackScreen: Error getting session:', error);
          setStatus('Error al obtener la sesión');
          setTimeout(() => {
            router.replace('/welcome');
          }, 2000);
          return;
        }

        if (session) {
          console.log('AuthCallbackScreen: Session found from Supabase, user:', session.user.id);
          await processUserProfile(session.user);
        } else {
          console.log('AuthCallbackScreen: No session found after OAuth');
          setStatus('No se encontró sesión. Por favor intenta de nuevo.');
          setTimeout(() => {
            router.replace('/welcome');
          }, 2000);
        }
      } catch (error) {
        console.error('AuthCallbackScreen: Error processing callback:', error);
        setStatus('Error al procesar la autenticación');
        setTimeout(() => {
          router.replace('/welcome');
        }, 2000);
      }
    };

    const processUserProfile = async (googleUser: any) => {
      try {
        setStatus('Verificando perfil...');

        // Check if user profile exists in users table
        const { data: existingProfile, error: profileError } = await supabase
          .from('users')
          .select('*')
          .eq('id', googleUser.id)
          .maybeSingle();

        if (profileError && profileError.code !== 'PGRST116') {
          console.error('AuthCallbackScreen: Error checking profile:', profileError);
          setStatus('Error al verificar el perfil');
          await supabase.auth.signOut();
          setTimeout(() => {
            router.replace('/welcome');
          }, 2000);
          return;
        }

        // If profile doesn't exist, user must register first
        if (!existingProfile) {
          console.log('AuthCallbackScreen: No profile found for Google user. User must register first.');
          setStatus('Registro requerido');
          
          // Sign out the user
          await supabase.auth.signOut();
          
          // Show alert and redirect to register
          if (Platform.OS === 'web') {
            // On web, use window.confirm since Alert callbacks don't work
            const shouldRegister = window.confirm(
              'Debes registrarte primero en la aplicación antes de iniciar sesión con Google. Por favor, completa el proceso de registro.\n\n¿Ir a registro?'
            );
            if (shouldRegister) {
              router.replace('/onboarding/register');
            } else {
              router.replace('/welcome');
            }
          } else {
            Alert.alert(
              'Registro Requerido',
              'Debes registrarte primero en la aplicación antes de iniciar sesión con Google. Por favor, completa el proceso de registro.',
              [
                {
                  text: 'OK',
                  onPress: () => {
                    router.replace('/onboarding/register');
                  }
                }
              ]
            );
          }
          return;
        }

        // Profile exists, update with Google data if needed
        console.log('AuthCallbackScreen: Profile exists, updating Google data if needed');
        const metadata = googleUser.user_metadata || {};
        const profilePhotoUrl = metadata.avatar_url || metadata.picture || null;
        
        const updateData: any = {};
        
        // Always update photo from Google if available and different
        if (profilePhotoUrl && profilePhotoUrl !== existingProfile.profile_photo_url) {
          updateData.profile_photo_url = profilePhotoUrl;
        }

        // Only update if there's something to update
        if (Object.keys(updateData).length > 0) {
          console.log('AuthCallbackScreen: Updating profile with:', updateData);
          
          const { error: updateError } = await supabase
            .from('users')
            .update(updateData)
            .eq('id', googleUser.id);

          if (updateError) {
            console.error('AuthCallbackScreen: Error updating profile:', updateError);
          } else {
            console.log('AuthCallbackScreen: Profile updated successfully');
          }
        }

        // Navigate to events screen
        console.log('AuthCallbackScreen: Navigating to events screen');
        setStatus('¡Bienvenido!');
        setTimeout(() => {
          router.replace('/(tabs)/events');
        }, 500);
      } catch (error) {
        console.error('AuthCallbackScreen: Error processing user profile:', error);
        setStatus('Error al procesar el perfil');
        await supabase.auth.signOut();
        setTimeout(() => {
          router.replace('/welcome');
        }, 2000);
      }
    };

    handleCallback();
  }, [router, params]);

  return (
    <LinearGradient
      colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
      style={styles.container}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <View style={styles.content}>
        <ActivityIndicator size="large" color={nospiColors.purpleDark} />
        <Text style={styles.text}>{status}</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  text: {
    marginTop: 16,
    fontSize: 16,
    color: nospiColors.purpleDark,
    textAlign: 'center',
  },
});
