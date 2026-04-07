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
// Returns true if the appointment is confirmed in DB (write or already existed), false on failure.
async function confirmAppointmentInSupabase(
  transactionId: string,
  paymentMethod: string,
  eventId: string,
  userId: string,
): Promise<boolean> {

  // Intentar upsert con todos los campos extendidos
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
    // Puede fallar si las columnas transaction_id/payment_method no existen en el schema.
    // Fallback: solo los campos base.

    const { error: upsertBaseError } = await supabase
      .from('appointments')
      .upsert(
        {
          user_id: userId,
          event_id: eventId,
          status: 'confirmada',
          payment_status: 'completed',
        },
        { onConflict: 'user_id,event_id', ignoreDuplicates: false },
      );

    if (upsertBaseError) {
      // Último recurso: update + insert por separado
      const { data: updated, error: updateError } = await supabase
        .from('appointments')
        .update({ status: 'confirmada', payment_status: 'completed' })
        .eq('user_id', userId)
        .eq('event_id', eventId)
        .select('id');

      if (updateError)

      if (!updated || updated.length === 0) {
        const { error: insertError } = await supabase.from('appointments').insert({
          user_id: userId,
          event_id: eventId,
          status: 'confirmada',
          payment_status: 'completed',
        });
        if (insertError) {
          return false;
        }
      }
    } else {
    }
  } else {
  }

  // Verificar que la fila existe y tiene status='confirmada' antes de continuar
  const { data: verification, error: verifyError } = await supabase
    .from('appointments')
    .select('id, status')
    .eq('user_id', userId)
    .eq('event_id', eventId)
    .eq('status', 'confirmada')
    .maybeSingle();

  if (verifyError || !verification) {
    return false;
  }
  await AsyncStorage.setItem('should_check_notification_prompt', 'true');
  return true;
}

async function cleanupAsyncStorage(): Promise<void> {
  await AsyncStorage.multiRemove([
    'nospi_transaction_id',
    'nospi_payment_method',
    'nospi_payment_opened_time',
    'nospi_payment_status',
    'nospi_user_id',
    'nospi_access_token',
    'nospi_refresh_token',
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


    if (isWeb) {
      // On web, Wompi redirects to https://app.nospi.co/payment-callback.
      // Store the status so the web polling in subscription-plans can pick it up,
      // then show the "return to app" instructions card.
      const urlStatus = (localSearchParams.payment_status as string) || 'unknown';
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('nospi_payment_status', urlStatus);
        window.localStorage.setItem('nospi_payment_time', Date.now().toString());
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


        // Step 1: Read ALL AsyncStorage values BEFORE any cleanup.
        const storedTransactionId = await AsyncStorage.getItem('nospi_transaction_id');
        const storedPaymentMethod = await AsyncStorage.getItem('nospi_payment_method');
        const storedEventId = await AsyncStorage.getItem('pending_event_confirmation');
        const storedTime = await AsyncStorage.getItem('nospi_payment_opened_time');



        // Use URL transaction ID first, then fall back to stored one.
        const transactionId = urlTransactionId || storedTransactionId || '';
        const paymentMethod = storedPaymentMethod || 'card';
        // IMPORTANT: capture eventId from AsyncStorage BEFORE cleanup is called.
        const eventId = storedEventId || '';

        if (!transactionId) {
          setStatusMessage('No se encontró la transacción.');
          await cleanupAsyncStorage();
          router.replace('/(tabs)/appointments');
          return;
        }

        // Guard: ignore if the payment was initiated more than 10 minutes ago.
        if (storedTime) {
          const age = Date.now() - parseInt(storedTime, 10);
          if (age > 10 * 60 * 1000) {
            setStatusMessage('El pago expiró.');
            await cleanupAsyncStorage();
            router.replace('/(tabs)/appointments');
            return;
          }
        }

        // Step 2: Verify with Wompi — always confirm server-side to prevent spoofing.
        setStatusMessage('Verificando pago con Wompi...');

        const res = await fetch(`${WOMPI_API_URL}/transactions/${transactionId}`);
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Wompi API returned ${res.status}`);
        }
        const data = await res.json();
        const status: WompiStatus = data.data?.status ?? 'unknown';

        if (status === 'APPROVED') {
          setStatusMessage('¡Pago aprobado! Confirmando asistencia...');

          // Marcar que payment-callback está manejando este pago
          // para evitar que subscription-plans lo procese en paralelo.
          await AsyncStorage.setItem('nospi_payment_processing', 'true');

          // Step 3: Resolve userId con múltiples fallbacks.
          // Después de volver de un browser externo (PSE/Bancolombia), la sesión puede
          // no estar cargada todavía. Intentamos restaurarla con el token guardado.
          await supabase.auth.refreshSession().catch(() => {});

          let userId: string | undefined;

          // Fallback 1: getSession (cached en AsyncStorage por supabase-js)
          const { data: { session } } = await supabase.auth.getSession();
          userId = session?.user?.id;

          // Fallback 2: getUser (llamada de red, más confiable tras redirects externos)
          if (!userId) {
            const { data: { user: authUser } } = await supabase.auth.getUser();
            userId = authUser?.id ?? undefined;
          }

          // Fallback 3: restaurar sesión desde tokens guardados antes de abrir el browser
          if (!userId) {
            try {
              const storedAccessToken = await AsyncStorage.getItem('nospi_access_token');
              const storedRefreshToken = await AsyncStorage.getItem('nospi_refresh_token');
              if (storedAccessToken && storedRefreshToken) {
                const { data: { session: restoredSession }, error: setSessionError } = await supabase.auth.setSession({
                  access_token: storedAccessToken,
                  refresh_token: storedRefreshToken,
                });
                if (restoredSession?.user?.id) {
                  userId = restoredSession.user.id;
                } else {
                }
              }
            } catch (sessionRestoreErr) {
            }
          }

          // Fallback 4: leer userId directamente de AsyncStorage (último recurso)
          if (!userId) {
            const storedUserId = await AsyncStorage.getItem('nospi_user_id');
            userId = storedUserId ?? undefined;
          }

          // Step 4: Confirm appointment BEFORE cleanup (eventId already captured above).
          if (userId && eventId) {
            const confirmed = await confirmAppointmentInSupabase(transactionId, paymentMethod, eventId, userId);
            if (!confirmed) {
              await cleanupAsyncStorage();
              await AsyncStorage.removeItem('nospi_payment_processing');
              setStatusMessage('Tu pago fue exitoso pero hubo un error confirmando tu cita. Contacta soporte.');
              // Esperar 3 segundos para que el usuario lea el mensaje antes de navegar
              await new Promise(resolve => setTimeout(resolve, 3000));
              router.replace('/(tabs)/appointments');
              return;
            }
          } else if (eventId && !userId) {
            // Payment was approved but we cannot identify the user — do NOT silently succeed.
            await cleanupAsyncStorage();
            setStatusMessage('Tu pago fue exitoso pero no pudimos confirmar tu cita. Contacta soporte.');
            router.replace('/(tabs)/appointments');
            return;
          } else {
          }

          // Step 5: Cleanup AFTER appointment is confirmed.
          await cleanupAsyncStorage();
          await AsyncStorage.removeItem('nospi_payment_processing');
          // Garantizar que el tab de citas invalide su caché al recibir foco.
          await AsyncStorage.setItem('should_check_notification_prompt', 'true');

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
          setStatusMessage('Pago en proceso...');
          await cleanupAsyncStorage();
          router.replace('/(tabs)/appointments');

        } else if (status === 'DECLINED') {
          setStatusMessage('Pago rechazado.');
          await cleanupAsyncStorage();
          // Restore eventId so user can retry from subscription-plans.
          if (eventId) {
            await AsyncStorage.setItem('pending_event_confirmation', eventId);
          }
          router.replace('/subscription-plans');

        } else if (status === 'VOIDED') {
          setStatusMessage('Pago cancelado.');
          await cleanupAsyncStorage();
          if (eventId) {
            await AsyncStorage.setItem('pending_event_confirmation', eventId);
          }
          router.replace('/subscription-plans');

        } else {
          setStatusMessage('Error en el pago.');
          await cleanupAsyncStorage();
          router.replace('/(tabs)/appointments');
        }

      } catch (err) {
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
      if (url.includes('payment-callback')) {
        try {
          const urlObj = new URL(url);
          const status = urlObj.searchParams.get('payment_status') || urlObj.searchParams.get('status') || '';
          const txId = urlObj.searchParams.get('transaction_id') || urlObj.searchParams.get('id') || '';
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
              setStatusMessage('Verificando pago con Wompi...');

              try {
                const res = await fetch(`${WOMPI_API_URL}/transactions/${transactionId}`);
                if (!res.ok) throw new Error(`Wompi API returned ${res.status}`);
                const data = await res.json();
                const wompiStatus: WompiStatus = data.data?.status ?? 'unknown';

                if (wompiStatus === 'APPROVED') {
                  setStatusMessage('¡Pago aprobado! Confirmando asistencia...');

                  // Resolución de userId con fallbacks (igual que processPayment principal)
                  await supabase.auth.refreshSession().catch(() => {});

                  let userId: string | undefined;

                  const { data: { session } } = await supabase.auth.getSession();
                  userId = session?.user?.id;

                  if (!userId) {
                    const { data: { user: authUser } } = await supabase.auth.getUser();
                    userId = authUser?.id ?? undefined;
                  }

                  // Restaurar sesión desde tokens guardados si es necesario
                  if (!userId) {
                    try {
                      const storedAccessToken = await AsyncStorage.getItem('nospi_access_token');
                      const storedRefreshToken = await AsyncStorage.getItem('nospi_refresh_token');
                      if (storedAccessToken && storedRefreshToken) {
                        const { data: { session: restoredSession } } = await supabase.auth.setSession({
                          access_token: storedAccessToken,
                          refresh_token: storedRefreshToken,
                        });
                        if (restoredSession?.user?.id) {
                          userId = restoredSession.user.id;
                        }
                      }
                    } catch {}
                  }

                  if (!userId) {
                    const storedUserId = await AsyncStorage.getItem('nospi_user_id');
                    userId = storedUserId ?? undefined;
                  }

                  if (userId && eventId) {
                    const confirmedLinking = await confirmAppointmentInSupabase(transactionId, paymentMethod, eventId, userId);
                    if (!confirmedLinking) {
                      await cleanupAsyncStorage();
                      await AsyncStorage.removeItem('nospi_payment_processing');
                      router.replace('/(tabs)/appointments');
                      return;
                    }
                  } else if (eventId && !userId) {
                    await cleanupAsyncStorage();
                    setStatusMessage('Tu pago fue exitoso pero no pudimos confirmar tu cita. Contacta soporte.');
                    router.replace('/(tabs)/appointments');
                    return;
                  }
                  await cleanupAsyncStorage();
                  await AsyncStorage.removeItem('nospi_payment_processing');
                  await AsyncStorage.setItem('should_check_notification_prompt', 'true');
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
                await cleanupAsyncStorage();
                router.replace('/(tabs)/appointments');
              }
            };
            runProcess();
          }
        } catch (parseErr) {
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