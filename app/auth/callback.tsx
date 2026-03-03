
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text, Alert } from 'react-native';
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
    
    const handleCallback = async () => {
      try {
        // Extract tokens from URL params
        const accessToken = params.access_token as string;
        const refreshToken = params.refresh_token as string;
        const type = params.type as string;

        console.log('AuthCallbackScreen: Token type:', type);
        console.log('AuthCallbackScreen: Has access token:', !!accessToken);
        console.log('AuthCallbackScreen: Has refresh token:', !!refreshToken);

        // If we have tokens in the URL, set the session manually
        if (accessToken && refreshToken) {
          console.log('AuthCallbackScreen: Setting session from URL tokens');
          
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
            console.log('AuthCallbackScreen: Session set successfully, user:', data.session.user.id);
            setStatus('Verificando perfil...');

            const googleUser = data.session.user;

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
            return;
          }
        }

        // Fallback: Try to get session normally
        console.log('AuthCallbackScreen: No tokens in URL, checking for existing session');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
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
          console.log('AuthCallbackScreen: Session found, user:', session.user.id);
          setStatus('Verificando perfil...');
          
          const googleUser = session.user;

          // Check if user profile exists
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
          router.replace('/(tabs)/events');
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
