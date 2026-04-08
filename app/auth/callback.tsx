/**
 * app/auth/callback.tsx
 *
 * En nativo + flujo de REGISTRO: crea el perfil aquí directamente y navega
 * a events sin pasar por index.tsx (elimina race conditions).
 * En web o LOGIN: navega a / para que index.tsx maneje.
 */

import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, StyleSheet, Platform, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

async function readOnboardingData() {
  const keys = [
    'onboarding_name', 'onboarding_birthdate', 'onboarding_age',
    'onboarding_gender', 'onboarding_interested_in', 'onboarding_age_range',
    'onboarding_country', 'onboarding_city', 'onboarding_phone',
    'onboarding_photo', 'onboarding_interests', 'onboarding_personality',
    'onboarding_compatibility',
  ];
  const pairs = await AsyncStorage.multiGet(keys);
  const data: Record<string, string> = {};
  for (const [k, v] of pairs) { if (v !== null) data[k] = v; }
  return data;
}

async function clearOnboardingData() {
  await AsyncStorage.multiRemove([
    'onboarding_name', 'onboarding_birthdate', 'onboarding_age',
    'onboarding_gender', 'onboarding_interested_in', 'onboarding_age_range',
    'onboarding_country', 'onboarding_city', 'onboarding_phone',
    'onboarding_photo', 'onboarding_interests', 'onboarding_personality',
    'onboarding_compatibility', 'oauth_flow_type',
  ]);
}

async function uploadPhoto(userId: string, photoUri: string): Promise<string | null> {
  try {
    const fileExt = photoUri.split('.').pop()?.toLowerCase() || 'jpg';
    const filePath = `${userId}/${userId}-${Date.now()}.${fileExt}`;
    const response = await fetch(photoUri);
    const blob = await response.blob();
    const uploadData = await new Response(blob).arrayBuffer();
    const { error } = await supabase.storage
      .from('profile-photos')
      .upload(filePath, uploadData, { contentType: `image/${fileExt}`, upsert: true });
    if (error) return null;
    const { data } = supabase.storage.from('profile-photos').getPublicUrl(filePath);
    return data.publicUrl;
  } catch {
    return null;
  }
}

export default function AuthCallback() {
  const router = useRouter();
  const routeParams = useLocalSearchParams<{
    code?: string;
    access_token?: string;
    refresh_token?: string;
  }>();
  const [statusMsg, setStatusMsg] = useState('Completando inicio de sesión...');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        let code: string | undefined;
        let accessToken: string | undefined;
        let refreshToken: string | undefined;

        if (Platform.OS !== 'web') {
          code = routeParams.code;
          accessToken = routeParams.access_token;
          refreshToken = routeParams.refresh_token;
        } else {
          const search = window.location.search;
          const hash = window.location.hash;
          const webParams: Record<string, string> = {};
          const raw = (hash.startsWith('#') ? hash.slice(1) : '') || search.slice(1);
          raw.split('&').forEach((pair) => {
            const [k, v] = pair.split('=');
            if (k && v) webParams[decodeURIComponent(k)] = decodeURIComponent(v);
          });
          if (webParams.error) {
            setErrorMsg(webParams.error_description || 'Error en autenticación');
            setTimeout(() => router.replace('/login?error=oauth_error' as any), 2000);
            return;
          }
          code = webParams.code;
          accessToken = webParams.access_token;
          refreshToken = webParams.refresh_token;
        }

        // Establecer sesión
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (error) throw error;
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          await new Promise(resolve => setTimeout(resolve, 600));
        }

        // Verificar sesión
        let session = (await supabase.auth.getSession()).data.session;
        if (!session) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          session = (await supabase.auth.getSession()).data.session;
        }
        if (!session?.user) {
          router.replace('/login?error=oauth_error' as any);
          return;
        }

        const userId = session.user.id;
        const userEmail = session.user.email;

        // Web: dejar que index.tsx maneje
        if (Platform.OS === 'web') {
          router.replace('/');
          return;
        }

        // Nativo: verificar si es flujo de registro
        const flowType = await AsyncStorage.getItem('oauth_flow_type');
        const isRegisterFlow = flowType === 'register';

        if (!isRegisterFlow) {
          // Login normal
          router.replace('/');
          return;
        }

        // REGISTRO: crear perfil aquí directamente
        setStatusMsg('Creando tu perfil...');

        const { data: existingProfile } = await supabase
          .from('users').select('id').eq('id', userId).maybeSingle();

        if (existingProfile) {
          await clearOnboardingData();
          router.replace('/login?error=account_exists' as any);
          return;
        }

        const d = await readOnboardingData();
        const interests = d['onboarding_interests'] ? JSON.parse(d['onboarding_interests']) : [];
        const personality = d['onboarding_personality'] ? JSON.parse(d['onboarding_personality']) : [];
        const ageRange = d['onboarding_age_range'] ? JSON.parse(d['onboarding_age_range']) : { min: 18, max: 60 };
        const phoneInfo = d['onboarding_phone'] ? JSON.parse(d['onboarding_phone']) : { phoneNumber: '' };

        let photoUrl: string | null = null;
        if (d['onboarding_photo']) {
          setStatusMsg('Subiendo foto de perfil...');
          photoUrl = await uploadPhoto(userId, d['onboarding_photo']);
        }

        setStatusMsg('Guardando tu información...');
        const { error: insertError } = await supabase.from('users').upsert({
          id: userId,
          email: userEmail,
          name: d['onboarding_name'] || '',
          birthdate: d['onboarding_birthdate'] || null,
          age: d['onboarding_age'] ? parseInt(d['onboarding_age']) : 18,
          gender: d['onboarding_gender'] || 'hombre',
          interested_in: d['onboarding_interested_in'] || 'ambos',
          age_range_min: ageRange.min,
          age_range_max: ageRange.max,
          country: d['onboarding_country'] || 'Colombia',
          city: d['onboarding_city'] || 'Medellín',
          phone: phoneInfo.phoneNumber || null,
          profile_photo_url: photoUrl,
          interests,
          personality_traits: personality,
          compatibility_percentage: d['onboarding_compatibility'] ? parseInt(d['onboarding_compatibility']) : 95,
          notification_preferences: {
            whatsapp: false,
            email: true,
            sms: false,
            push: true,
          },
        });

        if (insertError) {
          Alert.alert('Error', 'Error al crear tu perfil. Por favor intenta de nuevo.');
          await supabase.auth.signOut();
          router.replace('/welcome');
          return;
        }

        await clearOnboardingData();
        // Flag para bloquear re-ejecución de index.tsx por eventos SIGNED_IN tardíos
        await AsyncStorage.setItem('registration_just_completed', 'true');
        setTimeout(() => AsyncStorage.removeItem('registration_just_completed'), 30000);

        // Navegar directo a events — sin pasar por index.tsx
        router.replace('/(tabs)/events' as any);

      } catch (err: any) {
        setErrorMsg('Error al completar el inicio de sesión');
        setTimeout(() => router.replace('/login?error=oauth_error' as any), 2000);
      }
    };

    handleCallback();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container}>
      {errorMsg ? (
        <Text style={styles.errorText}>{errorMsg}</Text>
      ) : (
        <>
          <ActivityIndicator size="large" color="#AD1457" />
          <Text style={styles.loadingText}>{statusMsg}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a0010',
    gap: 16,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
