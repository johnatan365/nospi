
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
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
            setStatus('Sesión establecida correctamente');

            // Check if user profile exists
            const { data: existingProfile, error: profileError } = await supabase
              .from('users')
              .select('*')
              .eq('id', data.session.user.id)
              .maybeSingle();

            if (profileError) {
              console.error('AuthCallbackScreen: Error checking profile:', profileError);
            }

            // If profile doesn't exist, create a basic one
            if (!existingProfile) {
              console.log('AuthCallbackScreen: Creating new profile for OAuth user');
              
              const { error: createProfileError } = await supabase
                .from('users')
                .insert({
                  id: data.session.user.id,
                  email: data.session.user.email,
                  name: data.session.user.user_metadata?.full_name || data.session.user.user_metadata?.name || '',
                  birthdate: '',
                  age: 18,
                  gender: 'hombre',
                  interested_in: 'ambos',
                  age_range_min: 18,
                  age_range_max: 60,
                  country: 'Colombia',
                  city: 'Medellín',
                  phone: '',
                  profile_photo_url: data.session.user.user_metadata?.avatar_url || data.session.user.user_metadata?.picture || null,
                  interests: [],
                  personality_traits: [],
                  compatibility_percentage: 95,
                  notification_preferences: {
                    whatsapp: false,
                    email: true,
                    sms: false,
                    push: true,
                  },
                });

              if (createProfileError) {
                console.error('AuthCallbackScreen: Error creating profile:', createProfileError);
              } else {
                console.log('AuthCallbackScreen: Profile created successfully');
              }
            }

            // Navigate to events screen
            console.log('AuthCallbackScreen: Navigating to events screen');
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
          setStatus('Sesión encontrada, redirigiendo...');
          
          // Check if user profile exists
          const { data: existingProfile, error: profileError } = await supabase
            .from('users')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();

          if (profileError) {
            console.error('AuthCallbackScreen: Error checking profile:', profileError);
          }

          // If profile doesn't exist, create a basic one
          if (!existingProfile) {
            console.log('AuthCallbackScreen: Creating new profile for OAuth user');
            
            const { error: createProfileError } = await supabase
              .from('users')
              .insert({
                id: session.user.id,
                email: session.user.email,
                name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || '',
                birthdate: '',
                age: 18,
                gender: 'hombre',
                interested_in: 'ambos',
                age_range_min: 18,
                age_range_max: 60,
                country: 'Colombia',
                city: 'Medellín',
                phone: '',
                profile_photo_url: session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture || null,
                interests: [],
                personality_traits: [],
                compatibility_percentage: 95,
                notification_preferences: {
                  whatsapp: false,
                  email: true,
                  sms: false,
                  push: true,
                },
              });

            if (createProfileError) {
              console.error('AuthCallbackScreen: Error creating profile:', createProfileError);
            } else {
              console.log('AuthCallbackScreen: Profile created successfully');
            }
          }

          // Navigate to events screen
          console.log('AuthCallbackScreen: Navigating to events screen');
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
