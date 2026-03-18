
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, Platform, ScrollView, Image, ActivityIndicator, Linking } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

const WOMPI_API_URL = 'https://production.wompi.co/v1';
type WompiStatus = 'APPROVED' | 'PENDING' | 'DECLINED' | 'ERROR' | 'VOIDED' | 'unknown';

async function confirmAppointmentInSupabase(transactionId: string, paymentMethod: string, eventId: string, userId: string): Promise<void> {
  console.log('payment-callback: confirmAppointment', { transactionId, paymentMethod, eventId, userId });
  const { error: upsertError } = await supabase.from('appointments').upsert(
    { user_id: userId, event_id: eventId, status: 'confirmada', payment_status: 'completed', transaction_id: transactionId, payment_method: paymentMethod, confirmed_at: new Date().toISOString() },
    { onConflict: 'user_id,event_id', ignoreDuplicates: false }
  );
  if (upsertError) {
    console.warn('payment-callback: upsert failed, falling back to update+insert:', upsertError.message);
    const { data: updated, error: updateError } = await supabase.from('appointments').update({ status: 'confirmada', payment_status: 'completed' }).eq('user_id', userId).eq('event_id', eventId).select('id');
    if (updateError) console.error('payment-callback: update failed:', updateError.message);
    if (!updated || updated.length === 0) {
      const { error: insertError } = await supabase.from('appointments').insert({ user_id: userId, event_id: eventId, status: 'confirmada', payment_status: 'completed' });
      if (insertError) console.error('payment-callback: insert failed:', insertError.message);
      else await AsyncStorage.setItem('should_check_notification_prompt', 'true');
    } else {
      console.log('payment-callback: updated existing appointment to completed');
    }
  } else {
    console.log('payment-callback: upsert succeeded');
    await AsyncStorage.setItem('should_check_notification_prompt', 'true');
  }
}

async function cleanupAsyncStorage(): Promise<void> {
  await AsyncStorage.multiRemove(['nospi_transaction_id', 'nospi_payment_method', 'nospi_payment_opened_time', 'nospi_payment_status', 'pending_event_confirmation']);
}

export default function PaymentCallbackScreen() {
  const router = useRouter();
  const localSearchParams = useLocalSearchParams();
  const isWeb = Platform.OS === 'web';
  const [statusMessage, setStatusMessage] = useState('Verificando pago...');

  useEffect(() => {
    console.log('payment-callback: screen mounted, platform:', Platform.OS);
    console.log('payment-callback: URL params:', localSearchParams);

    if (isWeb) {
      const urlStatus = (localSearchParams.payment_status as string) || 'unknown';
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('nospi_payment_status', urlStatus);
        window.localStorage.setItem('nospi_payment_time', Date.now().toString());
        console.log('payment-callback (web): stored status in localStorage:', urlStatus);
      }
      return;
    }

    const processPayment = async (overrideTransactionId?: string, overrideStatus?: string) => {
      try {
        const urlPaymentStatus = overrideStatus || (localSearchParams.payment_status as string) || '';
        const urlTransactionId = overrideTransactionId || (localSearchParams.transaction_id as string) || '';
        console.log('payment-callback (mobile): urlPaymentStatus:', urlPaymentStatus);
        console.log('payment-callback (mobile): urlTransactionId:', urlTransactionId);

        const storedTransactionId = await AsyncStorage.getItem('nospi_transaction_id');
        const storedPaymentMethod = await AsyncStorage.getItem('nospi_payment_method');
        const storedEventId = await AsyncStorage.getItem('pending_event_confirmation');
        const storedTime = await AsyncStorage.getItem('nospi_payment_opened_time');

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
          try { await supabase.auth.refreshSession(); } catch {}
          const { data: { session } } = await supabase.auth.getSession();
          const userId = session?.user?.id;
          if (userId && eventId) {
            await confirmAppointmentInSupabase(transactionId, paymentMethod, eventId, userId);
          } else {
            console.warn('payment-callback (mobile): missing userId or eventId', { userId, eventId });
          }
          await cleanupAsyncStorage();
          console.log('payment-callback (mobile): navigating to event-details with paymentSuccess=true, eventId:', eventId);
          if (eventId) {
            router.replace({ pathname: '/event-details/[id]', params: { id: eventId, paymentSuccess: 'true' } });
          } else {
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
          if (eventId) await AsyncStorage.setItem('pending_event_confirmation', eventId);
          router.replace('/subscription-plans');
        } else if (status === 'VOIDED') {
          console.log('payment-callback (mobile): payment VOIDED (cancelled)');
          setStatusMessage('Pago cancelado.');
          await cleanupAsyncStorage();
          if (eventId) await AsyncStorage.setItem('pending_event_confirmation', eventId);
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
                  try { await supabase.auth.refreshSession(); } catch {}
                  const { data: { session } } = await supabase.auth.getSession();
                  const userId = session?.user?.id;
                  if (userId && eventId) await confirmAppointmentInSupabase(transactionId, paymentMethod, eventId, userId);
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

  if (isWeb) {
    return (
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.content}>
            <Image source={require('@/assets/images/icono Nospi.png')} style={styles.logo} resizeMode="contain" />
            <View style={styles.instructionsCard}>
              <Text style={styles.instructionsTitle}>Siguiente paso:</Text>
              <View style={styles.stepContainer}>
                <View style={styles.stepNumber}><Text style={styles.stepNumberText}>1</Text></View>
                <Text style={styles.stepText}>Cierra esta ventana del navegador</Text>
              </View>
              <View style={styles.stepContainer}>
                <View style={styles.stepNumber}><Text style={styles.stepNumberText}>2</Text></View>
                <Text style={styles.stepText}>Regresa a la app de Nospi</Text>
              </View>
              <View style={styles.stepContainer}>
                <View style={styles.stepNumber}><Text style={styles.stepNumberText}>3</Text></View>
                <Text style={styles.stepText}>Tu pago se procesará automáticamente</Text>
              </View>
            </View>
            <Text style={styles.footerText}>Gracias por confiar en Nospi 💜</Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        <Image source={require('@/assets/images/icono Nospi.png')} style={styles.logo} resizeMode="contain" />
        <ActivityIndicator size="large" color="#880E4F" style={{ marginBottom: 16 }} />
        <Text style={styles.redirectText}>{statusMessage}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24, minHeight: '100%' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', width: '100%', maxWidth: 500, padding: 24 },
  logo: { width: 200, height: 200, marginBottom: 32 },
  instructionsCard: { backgroundColor: '#F9FAFB', borderRadius: 24, padding: 32, width: '100%', borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 32 },
  instructionsTitle: { fontSize: 26, fontWeight: '800', color: '#1a0010', marginBottom: 28, textAlign: 'center' },
  stepContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  stepNumber: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#880E4F', alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  stepNumberText: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  stepText: { flex: 1, fontSize: 17, color: '#333333', lineHeight: 24, fontWeight: '500' },
  footerText: { fontSize: 18, color: '#555555', textAlign: 'center', fontWeight: '600' },
  redirectText: { fontSize: 18, color: '#1a0010', textAlign: 'center', fontWeight: '600', marginTop: 8 },
});
