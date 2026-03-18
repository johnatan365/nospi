import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

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
        let code = params.code as string | undefined;

        if (!code) {
          const initialUrl = await Linking.getInitialURL();
          console.log('AuthCallbackScreen: Initial URL:', initialUrl);
          if (initialUrl) {
            const parsed = new URL(initialUrl);
            code = parsed.searchParams.get('code') ?? undefined;
            if (!code) {
              const hash = initialUrl.split('#')[1] || '';
              const hashParams = new URLSearchParams(hash);
              code = hashParams.get('code') ?? undefined;
            }
            console.log('AuthCallbackScreen: Code from initial URL:', !!code);
          }
        }

        let accessToken = params.access_token as string | undefined;
        let refreshToken = params.refresh_token as string | undefined;

        if (code) {
          console.log('AuthCallbackScreen: Exchanging PKCE code for session...');
          setStatus('Verificando código...');
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.error('AuthCallbackScreen: Error exchanging code:', error);
          } else if (data.session) {
            console.log('AuthCallbackScreen: Session obtained via code exchange, user:', data.session.user.id);
            await processUserProfile(data.session.user);
            return;
          }
        }

        if (accessToken && refreshToken) {
          console.log('AuthCallbackScreen: Setting session from tokens');
          setStatus('Estableciendo sesión...');
          const { data, error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (error) {
            console.error('AuthCallbackScreen: Error setting session from tokens:', error);
          } else if (data.session) {
            console.log('AuthCallbackScreen: Session set from tokens, user:', data.session.user.id);
            await processUserProfile(data.session.user);
            return;
          }
        }

        console.log('AuthCallbackScreen: Fallback — polling getSession...');
        setStatus('Esperando sesión...');
        await new Promise(resolve => setTimeout(resolve, 1500));
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          console.error('AuthCallbackScreen: Error getting session:', sessionError);
          setStatus('Error al obtener la sesión');
          setTimeout(() => router.replace('/welcome'), 2000);
          return;
        }
        if (session) {
          console.log('AuthCallbackScreen: Session found via getSession, user:', session.user.id);
          await processUserProfile(session.user);
          return;
        }

        console.log('AuthCallbackScreen: No session yet, listening for auth state change...');
        setStatus('Esperando confirmación...');
        let resolved = false;
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
          console.log('AuthCallbackScreen: Auth state change:', event);
          if (newSession && !resolved) {
            resolved = true;
            subscription.unsubscribe();
            await processUserProfile(newSession.user);
          }
        });
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            subscription.unsubscribe();
            console.warn('AuthCallbackScreen: Timed out waiting for session');
            setStatus('No se encontró sesión. Por favor intenta de nuevo.');
            setTimeout(() => router.replace('/welcome'), 2000);
          }
        }, 10000);
      } catch (error) {
        console.error('AuthCallbackScreen: Unexpected error processing callback:', error);
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
          .from('users').select('*').eq('id', googleUser.id).maybeSingle();

        if (profileError && profileError.code !== 'PGRST116') {
          console.error('AuthCallbackScreen: Error checking profile:', profileError);
          setStatus('Error al verificar el perfil');
          await supabase.auth.signOut();
          setTimeout(() => router.replace('/welcome'), 2000);
          return;
        }

        if (!existingProfile && flowType === 'register') {
          console.log('AuthCallbackScreen: Registration flow — creating new profile');
          setStatus('Creando perfil...');
          const [nameData, birthdateData, ageData, genderData, interestedInData, ageRangeData, countryData, cityData, phoneData, photoData, interestsData, personalityData, compatibilityData] = await Promise.all([
            AsyncStorage.getItem('onboarding_name'), AsyncStorage.getItem('onboarding_birthdate'), AsyncStorage.getItem('onboarding_age'), AsyncStorage.getItem('onboarding_gender'), AsyncStorage.getItem('onboarding_interested_in'), AsyncStorage.getItem('onboarding_age_range'), AsyncStorage.getItem('onboarding_country'), AsyncStorage.getItem('onboarding_city'), AsyncStorage.getItem('onboarding_phone'), AsyncStorage.getItem('onboarding_photo'), AsyncStorage.getItem('onboarding_interests'), AsyncStorage.getItem('onboarding_personality'), AsyncStorage.getItem('onboarding_compatibility'),
          ]);
          const metadata = googleUser.user_metadata || {};
          const name = nameData || metadata.full_name || metadata.name || '';
          const googlePhotoUrl = metadata.avatar_url || metadata.picture || null;
          const uploadedPhoto = photoData || '';
          const finalPhoto = uploadedPhoto.trim() !== '' ? uploadedPhoto : googlePhotoUrl;
          const { error: insertError } = await supabase.from('users').insert({
            id: googleUser.id, email: googleUser.email || '', name, birthdate: birthdateData || '', age: ageData ? parseInt(ageData) : 18, gender: genderData || 'hombre', interested_in: interestedInData || 'ambos', age_range_min: ageRangeData ? JSON.parse(ageRangeData).min : 18, age_range_max: ageRangeData ? JSON.parse(ageRangeData).max : 60, country: countryData || 'Colombia', city: cityData || 'Medellín', phone: phoneData ? JSON.parse(phoneData).phoneNumber : '', profile_photo_url: finalPhoto, interests: interestsData ? JSON.parse(interestsData) : [], personality_traits: personalityData ? JSON.parse(personalityData) : [], compatibility_percentage: compatibilityData ? parseInt(compatibilityData) : 95, notification_preferences: { whatsapp: false, email: true, sms: false, push: true },
          });
          if (insertError) {
            console.error('AuthCallbackScreen: Error creating profile:', insertError);
            setStatus('Error al crear el perfil');
            await supabase.auth.signOut();
            setTimeout(() => router.replace('/onboarding/register'), 2000);
            return;
          }
          await AsyncStorage.multiRemove(['onboarding_interests','onboarding_personality','onboarding_name','onboarding_birthdate','onboarding_age','onboarding_gender','onboarding_interested_in','onboarding_age_range','onboarding_country','onboarding_city','onboarding_phone','onboarding_photo','onboarding_compatibility']);
          console.log('AuthCallbackScreen: Profile created, navigating to events');
          setStatus('¡Registro exitoso!');
          setTimeout(() => router.replace('/(tabs)/events'), 500);
          return;
        }

        if (!existingProfile) {
          console.log('AuthCallbackScreen: No profile found — must register first');
          setStatus('Registro requerido');
          await supabase.auth.signOut();
          setTimeout(() => router.replace('/onboarding/register'), 2000);
          return;
        }

        console.log('AuthCallbackScreen: Login successful, navigating to events');
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
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <ActivityIndicator size="large" color="#880E4F" />
        <Text style={styles.text}>{status}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  text: { marginTop: 16, fontSize: 16, color: '#1a0010', textAlign: 'center' },
});
