
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, Platform, ScrollView, Image, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { nospiColors } from '@/constants/Colors';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

const WOMPI_API_URL = 'https://production.wompi.co/v1';

type WompiStatus = 'APPROVED' | 'PENDING' | 'DECLINED' | 'ERROR' | 'VOIDED' | 'unknown';

// Confirm the appointment in Supabase once payment is verified as APPROVED.
async function confirmAppointmentInSupabase(
  transactionId: string,
  paymentMethod: string,
  eventId: string,
  userId: string,
): Promise<void> {
  console.log('payment-callback: confirmAppointment', { transactionId, paymentMethod, eventId, userId });
  const { data: existing } = await supabase
    .from('appointments')
    .select('id, payment_status')
    .eq('user_id', userId)
    .eq('event_id', eventId)
    .maybeSingle();

  if (!existing) {
    console.log('payment-callback: inserting new appointment');
    await supabase.from('appointments').insert({
      user_id: userId,
      event_id: eventId,
      status: 'confirmada',
      payment_status: 'completed',
    });
    await AsyncStorage.setItem('should_check_notification_prompt', 'true');
  } else if (existing.payment_status !== 'completed') {
    console.log('payment-callback: updating existing appointment to completed');
    await supabase
      .from('appointments')
      .update({ status: 'confirmada', payment_status: 'completed' })
      .eq('user_id', userId)
      .eq('event_id', eventId);
  } else {
    console.log('payment-callback: appointment already confirmed, nothing to do');
  }
}

async function cleanupAsyncStorage(): Promise<void> {
  await AsyncStorage.multiRemove([
    'nospi_transaction_id',
    'nospi_payment_method',
    'nospi_payment_opened_time',
    'nospi_payment_status',
    'pending_event_confirmation',
  ]);
}

export default function PaymentCallbackScreen() {
  const router = useRouter();
  const localSearchParams = useLocalSearchParams();
  const isWeb = Platform.OS === 'web';

  // Web-only: show instructions card (user must return to app manually).
  // Mobile: process the payment immediately and navigate to the event detail.
  const [statusMessage, setStatusMessage] = useState('Verificando pago...');

  useEffect(() => {
    console.log('payment-callback: screen mounted, platform:', Platform.OS);
    console.log('payment-callback: URL params:', localSearchParams);

    if (isWeb) {
      // On web, Wompi redirects to https://nospi.vercel.app/payment-callback.
      // Store the status so the web polling in subscription-plans can pick it up,
      // then show the "return to app" instructions card.
      const urlStatus = (localSearchParams.payment_status as string) || 'unknown';
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('nospi_payment_status', urlStatus);
        window.localStorage.setItem('nospi_payment_time', Date.now().toString());
        console.log('payment-callback (web): stored status in localStorage:', urlStatus);
      }
      return;
    }

    // ── MOBILE PATH ──────────────────────────────────────────────────────────
    // Wompi redirected to nospi://payment-callback?payment_status=...&transaction_id=...
    // We have the transaction ID both in the URL params AND in AsyncStorage.
    // Prefer the URL param (most authoritative), fall back to AsyncStorage.
    const processPayment = async () => {
      try {
        const urlPaymentStatus = (localSearchParams.payment_status as string) || '';
        const urlTransactionId = (localSearchParams.transaction_id as string) || '';

        console.log('payment-callback (mobile): urlPaymentStatus:', urlPaymentStatus);
        console.log('payment-callback (mobile): urlTransactionId:', urlTransactionId);

        // Read stored values — do NOT overwrite them here.
        const storedTransactionId = await AsyncStorage.getItem('nospi_transaction_id');
        const storedPaymentMethod = await AsyncStorage.getItem('nospi_payment_method');
        const storedEventId = await AsyncStorage.getItem('pending_event_confirmation');
        const storedTime = await AsyncStorage.getItem('nospi_payment_opened_time');

        console.log('payment-callback (mobile): storedTransactionId:', storedTransactionId);
        console.log('payment-callback (mobile): storedPaymentMethod:', storedPaymentMethod);
        console.log('payment-callback (mobile): storedEventId:', storedEventId);

        // Use URL transaction ID first, then fall back to stored one.
        const transactionId = urlTransactionId || storedTransactionId || '';
        const paymentMethod = storedPaymentMethod || 'card';
        const eventId = storedEventId || '';

        if (!transactionId) {
          console.warn('payment-callback (mobile): no transaction ID found anywhere, going to appointments');
          setStatusMessage('No se encontró la transacción.');
          await cleanupAsyncStorage();
          router.replace('/(tabs)/appointments');
          return;
        }

        // Guard: ignore if the payment was initiated more than 10 minutes ago.
        if (storedTime) {
          const age = Date.now() - parseInt(storedTime, 10);
          if (age > 10 * 60 * 1000) {
            console.warn('payment-callback (mobile): stored payment too old, ignoring');
            setStatusMessage('El pago expiró.');
            await cleanupAsyncStorage();
            router.replace('/(tabs)/appointments');
            return;
          }
        }

        // Verify with Wompi — the URL status param is a hint but we always confirm
        // server-side to prevent spoofing.
        console.log('payment-callback (mobile): verifying transaction with Wompi:', transactionId);
        setStatusMessage('Verificando pago con Wompi...');

        const res = await fetch(`${WOMPI_API_URL}/transactions/${transactionId}`);
        if (!res.ok) {
          const text = await res.text();
          console.error('payment-callback (mobile): Wompi API error:', res.status, text);
          throw new Error(`Wompi API returned ${res.status}`);
        }
        const data = await res.json();
        const status: WompiStatus = data.data?.status ?? 'unknown';

        console.log('payment-callback (mobile): Wompi status:', status);

        if (status === 'APPROVED') {
          setStatusMessage('¡Pago aprobado! Confirmando asistencia...');

          // Refresh session so Supabase RLS sees the current user.
          try { await supabase.auth.refreshSession(); } catch {}

          const { data: { session } } = await supabase.auth.getSession();
          const userId = session?.user?.id;

          if (userId && eventId) {
            await confirmAppointmentInSupabase(transactionId, paymentMethod, eventId, userId);
          } else {
            console.warn('payment-callback (mobile): missing userId or eventId for appointment confirmation', { userId, eventId });
          }

          await cleanupAsyncStorage();

          console.log('payment-callback (mobile): navigating to event-details with paymentSuccess=true, eventId:', eventId);

          if (eventId) {
            router.replace({
              pathname: '/event-details/[id]',
              params: { id: eventId, paymentSuccess: 'true' },
            });
          } else {
            // No event ID — fall back to appointments tab.
            router.replace('/(tabs)/appointments');
          }

        } else if (status === 'PENDING') {
          console.log('payment-callback (mobile): payment PENDING');
          setStatusMessage('Pago en proceso...');
          await cleanupAsyncStorage();
          router.replace('/(tabs)/appointments');

        } else if (status === 'DECLINED') {
          console.log('payment-callback (mobile): payment DECLINED');
          setStatusMessage('Pago rechazado.');
          await cleanupAsyncStorage();
          // Navigate back to subscription-plans so the user can retry.
          if (eventId) {
            await AsyncStorage.setItem('pending_event_confirmation', eventId);
          }
          router.replace('/subscription-plans');

        } else if (status === 'VOIDED') {
          console.log('payment-callback (mobile): payment VOIDED (cancelled)');
          setStatusMessage('Pago cancelado.');
          await cleanupAsyncStorage();
          if (eventId) {
            await AsyncStorage.setItem('pending_event_confirmation', eventId);
          }
          router.replace('/subscription-plans');

        } else {
          console.log('payment-callback (mobile): unknown/error status:', status);
          setStatusMessage('Error en el pago.');
          await cleanupAsyncStorage();
          router.replace('/(tabs)/appointments');
        }

      } catch (err) {
        console.error('payment-callback (mobile): unexpected error:', err);
        setStatusMessage('Error verificando el pago.');
        await cleanupAsyncStorage();
        router.replace('/(tabs)/appointments');
      }
    };

    processPayment();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── WEB VIEW ─────────────────────────────────────────────────────────────
  if (isWeb) {
    return (
      <LinearGradient
        colors={[nospiColors.purpleDark, nospiColors.purpleMid, nospiColors.purpleLight, nospiColors.purplePale]}
        style={styles.container}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.content}>
            <Image
              source={require('@/assets/images/icono Nospi.png')}
              style={styles.logo}
              resizeMode="contain"
            />

            <View style={styles.instructionsCard}>
              <Text style={styles.instructionsTitle}>Siguiente paso:</Text>

              <View style={styles.stepContainer}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>1</Text>
                </View>
                <Text style={styles.stepText}>Cierra esta ventana del navegador</Text>
              </View>

              <View style={styles.stepContainer}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>2</Text>
                </View>
                <Text style={styles.stepText}>Regresa a la app de Nospi</Text>
              </View>

              <View style={styles.stepContainer}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>3</Text>
                </View>
                <Text style={styles.stepText}>Tu pago se procesará automáticamente</Text>
              </View>
            </View>

            <Text style={styles.footerText}>Gracias por confiar en Nospi 💜</Text>
          </View>
        </ScrollView>
      </LinearGradient>
    );
  }

  // ── MOBILE VIEW (auto-redirects, shows status while processing) ───────────
  return (
    <LinearGradient
      colors={[nospiColors.purpleDark, nospiColors.purpleMid, nospiColors.purpleLight, nospiColors.purplePale]}
      style={styles.container}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <View style={styles.content}>
        <Image
          source={require('@/assets/images/icono Nospi.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <ActivityIndicator size="large" color={nospiColors.white} style={{ marginBottom: 16 }} />
        <Text style={styles.redirectText}>{statusMessage}</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    minHeight: '100%',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 500,
    padding: 24,
  },
  logo: {
    width: 200,
    height: 200,
    marginBottom: 32,
  },
  instructionsCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderRadius: 24,
    padding: 32,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
    marginBottom: 32,
  },
  instructionsTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: nospiColors.purpleDark,
    marginBottom: 28,
    textAlign: 'center',
  },
  stepContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  stepNumber: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: nospiColors.purpleMid,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  stepNumberText: {
    fontSize: 18,
    fontWeight: '700',
    color: nospiColors.white,
  },
  stepText: {
    flex: 1,
    fontSize: 17,
    color: nospiColors.gray800,
    lineHeight: 24,
    fontWeight: '500',
  },
  footerText: {
    fontSize: 18,
    color: nospiColors.white,
    textAlign: 'center',
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  redirectText: {
    fontSize: 18,
    color: nospiColors.white,
    textAlign: 'center',
    fontWeight: '600',
    marginTop: 8,
  },
});
