import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, Text, Platform, ScrollView, Image, ActivityIndicator, Linking } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { nospiColors } from '@/constants/Colors';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

const WOMPI_API_URL = 'https://production.wompi.co/v1';

type WompiStatus = 'APPROVED' | 'PENDING' | 'DECLINED' | 'ERROR' | 'VOIDED' | 'unknown';

// Confirm the appointment in Supabase once payment is verified as APPROVED.
// Uses upsert to handle both insert and update cases atomically.
async function confirmAppointmentInSupabase(
  transactionId: string,
  paymentMethod: string,
  eventId: string,
  userId: string,
): Promise<void> {
  console.log('payment-callback: confirmAppointment', { transactionId, paymentMethod, eventId, userId });

  // Try upsert first (handles both insert and update in one call)
  const { error: upsertError } = await supabase
    .from('appointments')
    .upsert(
      {
        user_id: userId,
        event_id: eventId,
        status: 'confirmada',
        payment_status: 'completed',
        transaction_id: transactionId,
        payment_method: paymentMethod,
        confirmed_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,event_id', ignoreDuplicates: false },
    );

  if (upsertError) {
    // Upsert failed (e.g. schema doesn't have transaction_id/payment_method columns yet).
    // Fall back to UPDATE then INSERT.
    console.warn('payment-callback: upsert failed, falling back to update+insert:', upsertError.message);

    const { data: updated, error: updateError } = await supabase
      .from('appointments')
      .update({ status: 'confirmada', payment_status: 'completed' })
      .eq('user_id', userId)
      .eq('event_id', eventId)
      .select('id');

    if (updateError) {
      console.error('payment-callback: update failed:', updateError.message);
    }

    if (!updated || updated.length === 0) {
      console.log('payment-callback: no existing row, inserting new appointment');
      const { error: insertError } = await supabase.from('appointments').insert({
        user_id: userId,
        event_id: eventId,
        status: 'confirmada',
        payment_status: 'completed',
      });
      if (insertError) {
        console.error('payment-callback: insert failed:', insertError.message);
      } else {
        await AsyncStorage.setItem('should_check_notification_prompt', 'true');
      }
    } else {
      console.log('payment-callback: updated existing appointment to completed');
    }
  } else {
    console.log('payment-callback: upsert succeeded');
    await AsyncStorage.setItem('should_check_notification_prompt', 'true');
  }
}

async function cleanupAsyncStorage(): Promise<void> {
  await AsyncStorage.multiRemove([
    'nospi_transaction_id',
    'nospi_payment_method',
    'nospi_payment_opened_time',
    'nospi_payment_status',
    'nospi_user_id',
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
      // On web, Wompi redirects to https://app.nospi.co/payment-callback.
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
    const processPayment = async (overrideTransactionId?: string, overrideStatus?: string) => {
      try {
        const urlPaymentStatus = overrideStatus || (localSearchParams.payment_status as string) || '';
        const urlTransactionId = overrideTransactionId || (localSearchParams.transaction_id as string) || '';

        console.log('payment-callback (mobile): urlPaymentStatus:', urlPaymentStatus);
        console.log('payment-callback (mobile): urlTransactionId:', urlTransactionId);

        // Step 1: Read ALL AsyncStorage values BEFORE any cleanup.
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
        // IMPORTANT: capture eventId from AsyncStorage BEFORE cleanup is called.
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

        // Step 2: Verify with Wompi — always confirm server-side to prevent spoofing.
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

          // Marcar que payment-callback está manejando este pago
          // para evitar que subscription-plans lo procese en paralelo.
          await AsyncStorage.setItem('nospi_payment_processing', 'true');

          // Step 3: Resolve userId with 3 fallbacks so bank redirects never lose the session.
          await supabase.auth.refreshSession().catch(() => {});

          let userId: string | undefined;

          // Fallback 1: getSession (cached)
          const { data: { session } } = await supabase.auth.getSession();
          userId = session?.user?.id;

          // Fallback 2: getUser (network call, more reliable after external redirects)
          if (!userId) {
            console.log('payment-callback (mobile): getSession returned no userId, trying getUser');
            const { data: { user: authUser } } = await supabase.auth.getUser();
            userId = authUser?.id ?? undefined;
          }

          // Fallback 3: read userId from AsyncStorage (stored at payment initiation)
          if (!userId) {
            console.log('payment-callback (mobile): getUser returned no userId, trying AsyncStorage');
            const storedUserId = await AsyncStorage.getItem('nospi_user_id');
            userId = storedUserId ?? undefined;
          }

          console.log('payment-callback (mobile): resolved userId:', userId, 'eventId:', eventId);

          // Step 4: Confirm appointment BEFORE cleanup (eventId already captured above).
          if (userId && eventId) {
            await confirmAppointmentInSupabase(transactionId, paymentMethod, eventId, userId);
          } else if (eventId && !userId) {
            // Payment was approved but we cannot identify the user — do NOT silently succeed.
            console.error('payment-callback (mobile): userId still undefined after all fallbacks — cannot confirm appointment');
            await cleanupAsyncStorage();
            setStatusMessage('Tu pago fue exitoso pero no pudimos confirmar tu cita. Contacta soporte.');
            router.replace('/(tabs)/appointments');
            return;
          } else {
            console.warn('payment-callback (mobile): missing userId or eventId for appointment confirmation', { userId, eventId });
          }

          // Step 5: Cleanup AFTER appointment is confirmed.
          await cleanupAsyncStorage();
          await AsyncStorage.removeItem('nospi_payment_processing');
          // Garantizar que el tab de citas invalide su caché al recibir foco.
          await AsyncStorage.setItem('should_check_notification_prompt', 'true');

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
          // Restore eventId so user can retry from subscription-plans.
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

  // Issue 5: Fallback Linking listener for Android — sometimes URL params arrive
  // via a Linking event rather than the initial route params.
  useEffect(() => {
    if (isWeb) return;

    const subscription = Linking.addEventListener('url', ({ url }) => {
      console.log('payment-callback: Linking url event received:', url);
      if (url.includes('payment-callback')) {
        try {
          const urlObj = new URL(url);
          const status = urlObj.searchParams.get('payment_status') || urlObj.searchParams.get('status') || '';
          const txId = urlObj.searchParams.get('transaction_id') || urlObj.searchParams.get('id') || '';
          console.log('payment-callback: Linking fallback — status:', status, 'txId:', txId);
          if (txId) {
            // Re-run processPayment with the params from the Linking event.
            // We define a local async wrapper to avoid stale closure issues.
            const runProcess = async () => {
              const storedTransactionId = await AsyncStorage.getItem('nospi_transaction_id');
              const storedPaymentMethod = await AsyncStorage.getItem('nospi_payment_method');
              const storedEventId = await AsyncStorage.getItem('pending_event_confirmation');
              const storedTime = await AsyncStorage.getItem('nospi_payment_opened_time');

              const transactionId = txId || storedTransactionId || '';
              const paymentMethod = storedPaymentMethod || 'card';
              const eventId = storedEventId || '';

              if (!transactionId) return;

              if (storedTime) {
                const age = Date.now() - parseInt(storedTime, 10);
                if (age > 10 * 60 * 1000) return;
              }

              console.log('payment-callback: Linking fallback verifying with Wompi:', transactionId);
              setStatusMessage('Verificando pago con Wompi...');

              try {
                const res = await fetch(`${WOMPI_API_URL}/transactions/${transactionId}`);
                if (!res.ok) throw new Error(`Wompi API returned ${res.status}`);
                const data = await res.json();
                const wompiStatus: WompiStatus = data.data?.status ?? 'unknown';
                console.log('payment-callback: Linking fallback Wompi status:', wompiStatus);

                if (wompiStatus === 'APPROVED') {
                  setStatusMessage('¡Pago aprobado! Confirmando asistencia...');

                  // 3-fallback userId resolution (same as main processPayment path)
                  await supabase.auth.refreshSession().catch(() => {});

                  let userId: string | undefined;

                  // Fallback 1: getSession (cached)
                  const { data: { session } } = await supabase.auth.getSession();
                  userId = session?.user?.id;

                  // Fallback 2: getUser (network call, more reliable after external redirects)
                  if (!userId) {
                    console.log('payment-callback (Linking): getSession returned no userId, trying getUser');
                    const { data: { user: authUser } } = await supabase.auth.getUser();
                    userId = authUser?.id ?? undefined;
                  }

                  // Fallback 3: read userId from AsyncStorage (stored at payment initiation)
                  if (!userId) {
                    console.log('payment-callback (Linking): getUser returned no userId, trying AsyncStorage');
                    const storedUserId = await AsyncStorage.getItem('nospi_user_id');
                    userId = storedUserId ?? undefined;
                  }

                  console.log('payment-callback (Linking): resolved userId:', userId, 'eventId:', eventId);

                  if (userId && eventId) {
                    await confirmAppointmentInSupabase(transactionId, paymentMethod, eventId, userId);
                  } else if (eventId && !userId) {
                    console.error('payment-callback (Linking): userId still undefined after all fallbacks — cannot confirm appointment');
                    await cleanupAsyncStorage();
                    setStatusMessage('Tu pago fue exitoso pero no pudimos confirmar tu cita. Contacta soporte.');
                    router.replace('/(tabs)/appointments');
                    return;
                  }
                  await cleanupAsyncStorage();
                  if (eventId) {
                    router.replace({ pathname: '/event-details/[id]', params: { id: eventId, paymentSuccess: 'true' } });
                  } else {
                    router.replace('/(tabs)/appointments');
                  }
                } else if (wompiStatus === 'DECLINED' || wompiStatus === 'VOIDED') {
                  await cleanupAsyncStorage();
                  if (eventId) await AsyncStorage.setItem('pending_event_confirmation', eventId);
                  router.replace('/subscription-plans');
                } else {
                  await cleanupAsyncStorage();
                  router.replace('/(tabs)/appointments');
                }
              } catch (err) {
                console.error('payment-callback: Linking fallback error:', err);
                await cleanupAsyncStorage();
                router.replace('/(tabs)/appointments');
              }
            };
            runProcess();
          }
        } catch (parseErr) {
          console.error('payment-callback: failed to parse Linking url:', parseErr);
        }
      }
    });

    return () => subscription.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWeb]);

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
              source={require('@/assets/images/fa137ca3-b552-4ac8-9f1e-8268723ace00.png')}
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

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={styles.footerText}>Gracias por confiar en Nospi </Text>
              <Text style={{ fontSize: 18, color: '#F06292' }}>❤️</Text>
            </View>
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
          source={require('@/assets/images/fa137ca3-b552-4ac8-9f1e-8268723ace00.png')}
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