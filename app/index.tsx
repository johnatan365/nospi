import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState, useRef } from 'react';
import { ActivityIndicator, View, StyleSheet, Platform, Alert } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

async function readOnboardingData() {
  if (Platform.OS === 'web') {
    const raw = localStorage.getItem('onboarding_data');
    return raw ? JSON.parse(raw) : {};
  } else {
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
}

async function clearOnboardingData() {
  if (Platform.OS === 'web') {
    localStorage.removeItem('onboarding_data');
    localStorage.removeItem('oauth_flow_type');
  } else {
    await AsyncStorage.multiRemove([
      'onboarding_name', 'onboarding_birthdate', 'onboarding_age',
      'onboarding_gender', 'onboarding_interested_in', 'onboarding_age_range',
      'onboarding_country', 'onboarding_city', 'onboarding_phone',
      'onboarding_photo', 'onboarding_interests', 'onboarding_personality',
      'onboarding_compatibility', 'oauth_flow_type',
    ]);
  }
}

async function uploadOnboardingPhoto(userId: string, photoUri: string): Promise<string | null> {
  if (!photoUri) return null;
  try {
    const fileExt = Platform.OS === 'web' ? 'jpg' : (photoUri.split('.').pop()?.toLowerCase() || 'jpg');
    const timestamp = Date.now();
    const filePath = `${userId}/${userId}-${timestamp}.${fileExt}`;

    const response = await fetch(photoUri);
    const blob = await response.blob();
    const uploadData = await new Response(blob).arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from('profile-photos')
      .upload(filePath, uploadData, { contentType: `image/${fileExt}`, upsert: true });

    if (uploadError) return null;

    const { data: urlData } = supabase.storage.from('profile-photos').getPublicUrl(filePath);
    return urlData.publicUrl;
  } catch {
    return null;
  }
}

export default function Index() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [isCheckingProfile, setIsCheckingProfile] = useState(false);

  // Ref para evitar que checkProfileAndNavigate corra en paralelo
  const isNavigatingRef = useRef(false);
  // Ref para caso no_profile — evita re-ejecución tras SIGNED_OUT event
  const redirectingToLoginRef = useRef(false);

  useEffect(() => {
    // Mientras loading está resolviendo, no hacer nada
    if (loading) return;

    // Evitar ejecuciones paralelas
    if (isNavigatingRef.current) return;
    // Si ya redirigimos a login por no_profile, no volver a ejecutar
    if (redirectingToLoginRef.current) return;

    const checkProfileAndNavigate = async () => {
      isNavigatingRef.current = true;
      try {
        // Si no hay user en el context, intentar obtener sesión directamente
        // (puede pasar cuando el context aún no actualizó tras OAuth)
        let resolvedUser = user;

        if (!resolvedUser) {
          if (Platform.OS === 'web') {
            const search = window.location.search;
            const hash = window.location.hash;

            if (search.includes('code=')) {
              router.replace(('/auth/callback' + search) as any);
              return;
            }
            if (hash.includes('access_token')) {
              router.replace(('/auth/callback' + hash) as any);
              return;
            }
            if (window.location.pathname.includes('/auth/')) {
              return;
            }
          }

          if (Platform.OS === 'web') {
            // En web, los tokens/code ya fueron manejados arriba.
            // Si llegamos aquí sin user, no hay sesión activa.
            router.replace('/welcome');
            return;
          }

          // Nativo: esperar hasta 4s a que el context tenga el user.
          // Cubre el lag entre signInWithIdToken (Apple) y el evento SIGNED_IN.
          const start = Date.now();
          while (Date.now() - start < 4000) {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
              resolvedUser = session.user;
              break;
            }
            await new Promise(r => setTimeout(r, 200));
          }

          if (!resolvedUser) {
            router.replace('/welcome');
            return;
          }
        }

        setIsCheckingProfile(true);

        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('id, name, email')
          .eq('id', resolvedUser.id)
          .maybeSingle();

        if (profileError) {
          if (Platform.OS === 'web') {
            window.alert('Error al verificar tu perfil. Por favor, intenta de nuevo.');
          } else {
            Alert.alert('Error', 'Error al verificar tu perfil. Por favor, intenta de nuevo.');
          }
          router.replace('/welcome');
          return;
        }

        if (!profile) {
          // Sin perfil — verificar si es flujo de registro
          let isRegisterFlow = false;
          if (Platform.OS === 'web') {
            isRegisterFlow = localStorage.getItem('oauth_flow_type') === 'register';
          } else {
            const flowType = await AsyncStorage.getItem('oauth_flow_type');
            isRegisterFlow = flowType === 'register';
          }

          if (isRegisterFlow) {
            // Verificar si la cuenta OAuth ya tenía perfil (ya estaba registrada)
            const { data: existingProfile } = await supabase
              .from('users')
              .select('id')
              .eq('id', resolvedUser.id)
              .maybeSingle();

            if (existingProfile) {
              await clearOnboardingData();
              try { await supabase.auth.signOut(); } catch { /* ignorar */ }
              router.replace('/login?error=account_exists');
              return;
            }

            try {
              const d = await readOnboardingData();
              const interests = d['onboarding_interests'] ? JSON.parse(d['onboarding_interests']) : [];
              const personality = d['onboarding_personality'] ? JSON.parse(d['onboarding_personality']) : [];
              const ageRange = d['onboarding_age_range'] ? JSON.parse(d['onboarding_age_range']) : { min: 18, max: 60 };
              const phoneInfo = d['onboarding_phone'] ? JSON.parse(d['onboarding_phone']) : { phoneNumber: '' };

              let photoUrl: string | null = null;
              if (d['onboarding_photo']) {
                photoUrl = await uploadOnboardingPhoto(resolvedUser.id, d['onboarding_photo']);
              }

              const { error: insertError } = await supabase.from('users').upsert({
                id: resolvedUser.id,
                email: resolvedUser.email,
                name: d['onboarding_name'] || '',
                birthdate: d['onboarding_birthdate'] || '',
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
                if (Platform.OS === 'web') {
                  window.alert('Error al crear tu perfil. Por favor intenta de nuevo.');
                } else {
                  Alert.alert('Error', 'Error al crear tu perfil. Por favor intenta de nuevo.');
                }
                await supabase.auth.signOut();
                router.replace('/welcome');
                return;
              }

              await clearOnboardingData();
              router.replace('/(tabs)/events');
            } catch {
              await supabase.auth.signOut();
              router.replace('/welcome');
            }
          } else {
            // Login con cuenta no registrada:
            // 1. Borrar el usuario de auth.users via Edge Function
            // 2. Hacer signOut
            // 3. Mostrar error en login
            try {
              const { data: { session } } = await supabase.auth.getSession();
              if (session?.access_token) {
                await fetch(
                  'https://wjdiraurfbawotlcndmk.supabase.co/functions/v1/delete-unregistered-user',
                  {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${session.access_token}`,
                      'Content-Type': 'application/json',
                    },
                  }
                );
              }
            } catch { /* ignorar */ }
            // Marcar inmediatamente para bloquear cualquier re-ejecución
            redirectingToLoginRef.current = true;
            isNavigatingRef.current = true;
            try { await supabase.auth.signOut(); } catch { /* ignorar */ }
            // Pequeño delay para que el SIGNED_OUT event no interfiera con la navegación
            await new Promise(r => setTimeout(r, 300));
            router.replace('/login?error=no_profile');
            return;
          }
          return;
        }

        // Perfil existe → verificar pagos pendientes y navegar
        let hasPendingPayment = false;
        let paymentStatus = '';
        let transactionId = '';

        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          const urlParams = new URLSearchParams(window.location.search);
          paymentStatus = urlParams.get('payment_status') || '';
          transactionId = urlParams.get('transaction_id') || '';
          if (paymentStatus) hasPendingPayment = true;
        }

        if (!hasPendingPayment) {
          const pending = await AsyncStorage.getItem('pse_payment_pending');
          if (pending === 'true') hasPendingPayment = true;
        }

        if (hasPendingPayment) {
          let target = '/subscription-plans';
          if (paymentStatus) {
            target += '?payment_status=' + paymentStatus;
            if (transactionId) target += '&transaction_id=' + transactionId;
          }
          router.replace(target as any);
        } else {
          router.replace('/(tabs)/events');
        }
      } catch {
        if (Platform.OS === 'web') {
          window.alert('Ocurrió un error inesperado. Por favor, intenta de nuevo.');
        } else {
          Alert.alert('Error', 'Ocurrió un error inesperado. Por favor, intenta de nuevo.');
        }
        router.replace('/welcome');
      } finally {
        setIsCheckingProfile(false);
        // Solo limpiar si no estamos redirigiendo a login por no_profile
        // (si lo limpiamos, el SIGNED_OUT event re-dispara el effect)
        if (!redirectingToLoginRef.current) {
          isNavigatingRef.current = false;
        }
      }
    };

    checkProfileAndNavigate();
  }, [loading, user, router]);

  if (loading || isCheckingProfile) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#AD1457" />
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
    backgroundColor: '#1a0010',
  },
});
