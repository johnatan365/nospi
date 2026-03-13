
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text, Alert, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { nospiColors } from '@/constants/Colors';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

        // Check what flow type this is (register or login)
        const flowType = await AsyncStorage.getItem('oauth_flow_type');
        console.log('AuthCallbackScreen: OAuth flow type:', flowType);
        
        // Clear the flow type
        await AsyncStorage.removeItem('oauth_flow_type');

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

        // REGISTRATION FLOW: Create new profile if it doesn't exist
        if (!existingProfile && flowType === 'register') {
          console.log('AuthCallbackScreen: Registration flow - creating new profile for Google user');
          setStatus('Creando perfil...');
          
          // Get onboarding data from AsyncStorage
          const nameData = await AsyncStorage.getItem('onboarding_name');
          const birthdateData = await AsyncStorage.getItem('onboarding_birthdate');
          const ageData = await AsyncStorage.getItem('onboarding_age');
          const genderData = await AsyncStorage.getItem('onboarding_gender');
          const interestedInData = await AsyncStorage.getItem('onboarding_interested_in');
          const ageRangeData = await AsyncStorage.getItem('onboarding_age_range');
          const countryData = await AsyncStorage.getItem('onboarding_country');
          const cityData = await AsyncStorage.getItem('onboarding_city');
          const phoneData = await AsyncStorage.getItem('onboarding_phone');
          const photoData = await AsyncStorage.getItem('onboarding_photo');
          const interestsData = await AsyncStorage.getItem('onboarding_interests');
          const personalityData = await AsyncStorage.getItem('onboarding_personality');
          const compatibilityData = await AsyncStorage.getItem('onboarding_compatibility');

          const metadata = googleUser.user_metadata || {};
          const googleFullName = metadata.full_name || metadata.name || '';
          const googleEmail = googleUser.email || '';
          const googlePhotoUrl = metadata.avatar_url || metadata.picture || null;

          // Parse onboarding data
          const name = nameData || googleFullName;
          const birthdate = birthdateData || '';
          const age = ageData ? parseInt(ageData) : 18;
          const gender = genderData || 'hombre';
          const interestedIn = interestedInData || 'ambos';
          const ageRange = ageRangeData ? JSON.parse(ageRangeData) : { min: 18, max: 60 };
          const country = countryData || 'Colombia';
          const city = cityData || 'Medellín';
          const phoneInfo = phoneData ? JSON.parse(phoneData) : { phoneNumber: '' };
          
          // 🔥 PRIORITY FIX: User uploaded photo takes priority over Google photo
          // If user uploaded a photo during onboarding, use it. Otherwise, use Google photo.
          const uploadedPhoto = photoData || '';
          let finalPhoto = null;
          
          if (uploadedPhoto && uploadedPhoto.trim() !== '') {
            console.log('✅ User uploaded photo during onboarding - using uploaded photo');
            finalPhoto = uploadedPhoto;
          } else {
            console.log('ℹ️ No uploaded photo - using Google photo as fallback');
            finalPhoto = googlePhotoUrl;
          }
          
          console.log('📸 Final photo URL:', finalPhoto);
          
          const interests = interestsData ? JSON.parse(interestsData) : [];
          const personality = personalityData ? JSON.parse(personalityData) : [];
          const compatibility = compatibilityData ? parseInt(compatibilityData) : 95;

          // Create user profile
          const { error: insertError } = await supabase
            .from('users')
            .insert({
              id: googleUser.id,
              email: googleEmail,
              name: name,
              birthdate: birthdate,
              age: age,
              gender: gender,
              interested_in: interestedIn,
              age_range_min: ageRange.min,
              age_range_max: ageRange.max,
              country: country,
              city: city,
              phone: phoneInfo.phoneNumber,
              profile_photo_url: finalPhoto,
              interests: interests,
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
            console.error('AuthCallbackScreen: Error creating profile:', insertError);
            setStatus('Error al crear el perfil');
            await supabase.auth.signOut();
            
            if (Platform.OS === 'web') {
              window.alert(`Error al crear tu perfil: ${insertError.message}\n\nPor favor, intenta registrarte nuevamente.`);
            } else {
              Alert.alert('Error', `Error al crear tu perfil: ${insertError.message}\n\nPor favor, intenta registrarte nuevamente.`);
            }
            
            setTimeout(() => {
              router.replace('/onboarding/register');
            }, 2000);
            return;
          }

          console.log('AuthCallbackScreen: Profile created successfully for Google user');
          
          // Clear onboarding data
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
          ]);

          // Navigate to events screen
          console.log('AuthCallbackScreen: Navigating to events screen');
          setStatus('¡Registro exitoso!');
          setTimeout(() => {
            router.replace('/(tabs)/events');
          }, 500);
          return;
        }

        // LOGIN FLOW: Profile must exist
        if (!existingProfile && flowType === 'login') {
          console.log('AuthCallbackScreen: Login flow - No profile found for Google user. User must register first.');
          setStatus('Registro requerido');
          
          // Sign out the user
          await supabase.auth.signOut();
          
          // Show alert and redirect to register
          if (Platform.OS === 'web') {
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

        // If no flow type specified, default to login behavior
        if (!existingProfile && !flowType) {
          console.log('AuthCallbackScreen: No flow type - No profile found for Google user. User must register first.');
          setStatus('Registro requerido');
          
          await supabase.auth.signOut();
          
          if (Platform.OS === 'web') {
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

        // Profile exists (LOGIN FLOW) - DO NOT update photo automatically
        // Only update if user explicitly changes it in profile settings
        console.log('AuthCallbackScreen: Profile exists - user logged in successfully');
        console.log('ℹ️ Not updating profile photo - keeping existing photo');

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
