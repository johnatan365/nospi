import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text, Alert, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { nospiColors } from '@/constants/Colors';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';

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
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 1. Intentar obtener tokens de los params de la ruta
        let accessToken = params.access_token as string;
        let refreshToken = params.refresh_token as string;

        // 2. Si no hay tokens en params, buscar en la URL inicial (Android deep link con hash)
        if (!accessToken || !refreshToken) {
          const initialUrl = await Linking.getInitialURL();
          console.log('AuthCallbackScreen: Initial URL:', initialUrl);

          if (initialUrl) {
            // Tokens pueden venir en hash fragment: nospi://auth/callback#access_token=...
            const hashPart = initialUrl.split('#')[1] || '';
            const queryPart = initialUrl.split('?')[1]?.split('#')[0] || '';

            const parseParams = (str: string) => {
              const result: Record<string, string> = {};
              str.split('&').forEach(pair => {
                const [k, v] = pair.split('=');
                if (k && v) result[decodeURIComponent(k)] = decodeURIComponent(v);
              });
              return result;
            };

            const hashParams = parseParams(hashPart);
            const queryParams = parseParams(queryPart);

            accessToken = accessToken || hashParams.access_token || queryParams.access_token;
            refreshToken = refreshToken || hashParams.refresh_token || queryParams.refresh_token;

            console.log('AuthCallbackScreen: Parsed from URL - access_token:', !!accessToken, 'refresh_token:', !!refreshToken);
          }
        }

        // 3. Si tenemos tokens, establecer sesión directamente
        if (accessToken && refreshToken) {
          console.log('AuthCallbackScreen: Setting session from tokens');
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            console.error('AuthCallbackScreen: Error setting session:', error);
            // Intentar getSession como fallback
          } else if (data.session) {
            console.log('AuthCallbackScreen: Session set successfully, user:', data.session.user.id);
            await processUserProfile(data.session.user);
            return;
          }
        }

        // 4. Fallback: esperar y obtener sesión de Supabase (maneja el hash automáticamente en web)
        console.log('AuthCallbackScreen: Fallback - waiting for Supabase session...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error('AuthCallbackScreen: Error getting session:', sessionError);
          setStatus('Error al obtener la sesión');
          setTimeout(() => router.replace('/welcome'), 2000);
          return;
        }

        if (session) {
          console.log('AuthCallbackScreen: Session found, user:', session.user.id);
          await processUserProfile(session.user);
        } else {
          // 5. Último recurso: escuchar cambios de auth state
          console.log('AuthCallbackScreen: No session yet, listening for auth state change...');
          setStatus('Esperando confirmación...');

          const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
            console.log('AuthCallbackScreen: Auth state change:', event);
            if (newSession) {
              subscription.unsubscribe();
              await processUserProfile(newSession.user);
            }
          });

          // Timeout de 8 segundos
          setTimeout(() => {
            subscription.unsubscribe();
            setStatus('No se encontró sesión. Por favor intenta de nuevo.');
            setTimeout(() => router.replace('/welcome'), 2000);
          }, 8000);
        }
      } catch (error) {
        console.error('AuthCallbackScreen: Error processing callback:', error);
        setStatus('Error al procesar la autenticación');
        setTimeout(() => router.replace('/welcome'), 2000);
      }
    };

    const processUserProfile = async (googleUser: any) => {
      try {
        setStatus('Verificando perfil...');
        const flowType = await AsyncStorage.getItem('oauth_flow_type');
        console.log('AuthCallbackScreen: OAuth flow type:', flowType);
        await AsyncStorage.removeItem('oauth_flow_type');

        const { data: existingProfile, error: profileError } = await supabase
          .from('users')
          .select('*')
          .eq('id', googleUser.id)
          .maybeSingle();

        if (profileError && profileError.code !== 'PGRST116') {
          console.error('AuthCallbackScreen: Error checking profile:', profileError);
          setStatus('Error al verificar el perfil');
          await supabase.auth.signOut();
          setTimeout(() => router.replace('/welcome'), 2000);
          return;
        }

        // REGISTRO: crear perfil si no existe
        if (!existingProfile && flowType === 'register') {
          console.log('AuthCallbackScreen: Registration flow - creating new profile');
          setStatus('Creando perfil...');

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
          const name = nameData || metadata.full_name || metadata.name || '';
          const googlePhotoUrl = metadata.avatar_url || metadata.picture || null;
          const uploadedPhoto = photoData || '';
          const finalPhoto = uploadedPhoto.trim() !== '' ? uploadedPhoto : googlePhotoUrl;

          const { error: insertError } = await supabase.from('users').insert({
            id: googleUser.id,
            email: googleUser.email || '',
            name,
            birthdate: birthdateData || '',
            age: ageData ? parseInt(ageData) : 18,
            gender: genderData || 'hombre',
            interested_in: interestedInData || 'ambos',
            age_range_min: ageRangeData ? JSON.parse(ageRangeData).min : 18,
            age_range_max: ageRangeData ? JSON.parse(ageRangeData).max : 60,
            country: countryData || 'Colombia',
            city: cityData || 'Medellín',
            phone: phoneData ? JSON.parse(phoneData).phoneNumber : '',
            profile_photo_url: finalPhoto,
            interests: interestsData ? JSON.parse(interestsData) : [],
            personality_traits: personalityData ? JSON.parse(personalityData) : [],
            compatibility_percentage: compatibilityData ? parseInt(compatibilityData) : 95,
            notification_preferences: { whatsapp: false, email: true, sms: false, push: true },
          });

          if (insertError) {
            console.error('AuthCallbackScreen: Error creating profile:', insertError);
            setStatus('Error al crear el perfil');
            await supabase.auth.signOut();
            Alert.alert('Error', `Error al crear tu perfil: ${insertError.message}`);
            setTimeout(() => router.replace('/onboarding/register'), 2000);
            return;
          }

          await AsyncStorage.multiRemove([
            'onboarding_interests', 'onboarding_personality', 'onboarding_name',
            'onboarding_birthdate', 'onboarding_age', 'onboarding_gender',
            'onboarding_interested_in', 'onboarding_age_range', 'onboarding_country',
            'onboarding_city', 'onboarding_phone', 'onboarding_photo', 'onboarding_compatibility',
          ]);

          setStatus('¡Registro exitoso!');
          setTimeout(() => router.replace('/(tabs)/events'), 500);
          return;
        }

        // LOGIN: perfil debe existir
        if (!existingProfile) {
          console.log('AuthCallbackScreen: No profile found - must register first');
          setStatus('Registro requerido');
          await supabase.auth.signOut();
          Alert.alert(
            'Registro Requerido',
            'Debes registrarte primero antes de iniciar sesión con Google.',
            [{ text: 'OK', onPress: () => router.replace('/onboarding/register') }]
          );
          return;
        }

        // Perfil existe — login exitoso
        console.log('AuthCallbackScreen: Login successful');
        setStatus('¡Bienvenido!');
        setTimeout(() => router.replace('/(tabs)/events'), 500);

      } catch (error) {
        console.error('AuthCallbackScreen: Error processing profile:', error);
        setStatus('Error al procesar el perfil');
        await supabase.auth.signOut();
        setTimeout(() => router.replace('/welcome'), 2000);
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
  container: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  text: { marginTop: 16, fontSize: 16, color: nospiColors.purpleDark, textAlign: 'center' },
});