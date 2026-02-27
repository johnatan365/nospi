
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { nospiColors } from '@/constants/Colors';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackScreen() {
  const router = useRouter();
  const [status, setStatus] = useState('Procesando autenticación...');

  useEffect(() => {
    console.log('AuthCallbackScreen: OAuth callback received, processing session...');
    
    const handleCallback = async () => {
      try {
        // Wait a moment for Supabase to process the URL
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Check if we have a session
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
          setStatus('Sesión establecida, redirigiendo...');
          
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
          console.log('AuthCallbackScreen: No session found, redirecting to welcome');
          setStatus('No se encontró sesión');
          setTimeout(() => {
            router.replace('/welcome');
          }, 1000);
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
  }, [router]);

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
