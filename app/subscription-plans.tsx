import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Modal, Alert, SafeAreaView,
  Image, TextInput, KeyboardAvoidingView, Platform, Keyboard, AppState
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { useAppConfig } from '@/contexts/AppConfigContext';
import { useRouter, Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useSupabase } from '@/contexts/SupabaseContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';

// Dispara el evento Purchase — píxel en web, API de Conversiones en mobile.
// Usa las constantes SUPABASE_URL / SUPABASE_ANON_KEY ya declaradas más abajo en este archivo.
// Duplicado de la misma función en payment-callback.tsx (ese archivo es una screen
// distinta y no exporta la función para reuso).
async function trackMetaPurchase(
  transactionId: string,
  eventId: string = '',
  userEmail: string = '',
  userPhone: string = '',
  amount: number = 9900
) {
  if (Platform.OS === 'web') {
    try {
      const win = window as any;
      console.log('[Nospi Meta Debug] trackMetaPurchase llamado. fbq disponible:', typeof win.fbq === 'function', '| transactionId:', transactionId);
      if (typeof win.fbq === 'function') {
        win.fbq('track', 'Purchase', {
          value: amount,
          currency: 'COP',
          content_type: 'product',
          content_ids: [eventId || 'nospi_event'],
        }, { eventID: 'purchase_' + transactionId });
        console.log('[Nospi Meta Debug] fbq Purchase disparado con eventID:', 'purchase_' + transactionId);
      } else {
        console.warn('[Nospi Meta Debug] window.fbq NO es una funcion, Purchase no se disparo');
      }
    } catch (e) { console.error('[Nospi Meta Debug] Error disparando Purchase:', e); }

    // Además del píxel del navegador, mandamos el mismo evento por la API de
    // Conversiones (servidor) — mismo eventID ('purchase_' + transactionId)
    // para que Meta los deduplique como un solo evento. Sin esto, Meta solo
    // veía el evento del navegador (que puede perderse por bloqueadores de
    // anuncios, Safari ITP, etc.) y penalizaba la "cobertura" del píxel.
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/meta-purchase`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          transactionId,
          amount,
          currency: 'COP',
          eventId,
          userEmail,
          userPhone,
        }),
      });
    } catch (e) { /* silencioso */ }
    return;
  }

  try {
    await fetch(`${SUPABASE_URL}/functions/v1/meta-purchase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        transactionId,
        amount,
        currency: 'COP',
        eventId,
        userEmail,
        userPhone,
      }),
    });
  } catch (e) { /* silencioso */ }
}

// Card brand detection
function getCardBrand(rawNumber: string): 'visa' | 'mastercard' | 'amex' | 'diners' | 'discover' | null {
  const n = rawNumber.replace(/\D/g, '');
  if (!n) return null;
  if (n.startsWith('4')) return 'visa';
  if (/^3[47]/.test(n)) return 'amex';
  if (/^30[0-5]/.test(n) || /^36/.test(n) || /^38/.test(n)) return 'diners';
  if (/^6011/.test(n) || /^65/.test(n) || /^64[4-9]/.test(n)) return 'discover';
  const num6 = parseInt(n.slice(0, 6), 10);
  if (/^5[1-5]/.test(n)) return 'mastercard';
  if (n.length >= 4) {
    const num4 = parseInt(n.slice(0, 4), 10);
    if (num4 >= 2221 && num4 <= 2720) return 'mastercard';
  }
  if (n.length >= 6 && num6 >= 622126 && num6 <= 622925) return 'discover';
  return null;
}

const CARD_BRAND_COLORS: Record<string, string> = {
  visa: '#1A1F71',
  mastercard: '#EB001B',
  amex: '#007BC1',
  diners: '#004A97',
  discover: '#FF6600',
};

const CARD_BRAND_LABELS: Record<string, string> = {
  visa: 'VISA',
  mastercard: 'MASTERCARD',
  amex: 'AMEX',
  diners: 'DINERS',
  discover: 'DISCOVER',
};

function renderCardBrandMark(brand: 'visa' | 'mastercard' | 'amex' | 'diners' | 'discover') {
  if (brand === 'visa') {
    return (
      <View style={styles.cardBrandMark}>
        <Text style={{ fontStyle: 'italic', fontWeight: '800', fontSize: 15, color: '#1A1F71', letterSpacing: 0.5 }}>VISA</Text>
      </View>
    );
  }
  if (brand === 'mastercard') {
    return (
      <View style={[styles.cardBrandMark, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }]}>
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#EB001B' }} />
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#F79E1B', marginLeft: -8, opacity: 0.85 }} />
      </View>
    );
  }
  if (brand === 'amex') {
    return (
      <View style={[styles.cardBrandMark, { backgroundColor: '#2E77BC' }]}>
        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 0.3 }}>AMEX</Text>
      </View>
    );
  }
  return (
    <View style={[styles.cardBrandBadge, { backgroundColor: CARD_BRAND_COLORS[brand] }]}>
      <Text style={styles.cardBrandBadgeText}>{CARD_BRAND_LABELS[brand]}</Text>
    </View>
  );
}

// Funciona en web Y en nativo
const showAlert = (title: string, message?: string) => {
  if (typeof window !== 'undefined' && !window.ReactNativeWebView) {
    window.alert(title + (message ? '\n\n' + message : ''));
  } else {
    Alert.alert(title, message);
  }
};

const WOMPI_PUBLIC_KEY = 'pub_prod_Vvbl4VKr7Gmjd4vIIJQsBWusp4Ijl06L';
const WOMPI_API_URL = 'https://production.wompi.co/v1';
const SUPABASE_URL = 'https://wjdiraurfbawotlcndmk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqZGlyYXVyZmJhd290bGNuZG1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0MDMxMTUsImV4cCI6MjA4NTk3OTExNX0.FxMBafEjIliTDzRBRlnY59i1wEcbIx6u8ZdVf1uxuj8';

// Wompi redirect URLs:
// - Web: must be HTTPS (Wompi requirement)
// - Native (iOS/Android): must use the app scheme so the OS routes it back into the app.
//   https:// redirects on mobile open the browser, NOT the app, unless App Links are
//   fully configured with a verified domain. nospi:// is always safe on native.
const WEB_REDIRECT_URL = 'https://app.nospi.co/payment-callback';
const NATIVE_REDIRECT_URL = 'nospi://payment-callback';

export default function SubscriptionPlansScreen() {
  const router = useRouter();
  const { user } = useSupabase();
  const { appConfig } = useAppConfig();

  const [processingMethod, setProcessingMethod] = useState<string | null>(null);
  const processing = processingMethod !== null;
  const isProcessing = (m: string) => processingMethod === m;

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  // Modal aparte para cuando el usuario YA tiene suscripcion activa y solo
  // confirma su cupo a un evento pendiente -- no hubo ningun pago en este
  // momento, asi que NO debe mostrar el modal de "Pago Exitoso".
  const [showSubscriptionConfirmModal, setShowSubscriptionConfirmModal] = useState(false);
  const [showEventMethods, setShowEventMethods] = useState(false);

  // Código promocional — link "¿Tienes un código promocional?" en la pantalla de plan
  const [showPromoInput, setShowPromoInput] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [applyingPromo, setApplyingPromo] = useState(false);
  const [promoApplied, setPromoApplied] = useState<{ discountPercent: number; label?: string } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [showPromoConfirmModal, setShowPromoConfirmModal] = useState(false);

  const threeDsPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [virtualBalance, setVirtualBalance] = useState(0);
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [userProfile, setUserProfile] = useState<{ email: string; name: string } | null>(null);

  // Suscripción: si el usuario tiene una suscripción activa, se confirma la
  // asistencia gratis sin pasar por ningún método de pago.
  const [checkingSubscription, setCheckingSubscription] = useState(true);
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  const [autoConfirmError, setAutoConfirmError] = useState(false);

  // Card form
  const [showCardForm, setShowCardForm] = useState(false);
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [cardInstallments, setCardInstallments] = useState('1');

  // Nequi form
  const [showNequiForm, setShowNequiForm] = useState(false);
  const [nequiPhone, setNequiPhone] = useState('');
  const [nequiStatus, setNequiStatus] = useState<'idle' | 'waiting'>('idle');

  // PSE form
  const [showPSEForm, setShowPSEForm] = useState(false);
  const [psePhone, setPsePhone] = useState('');
  const [pseLegalId, setPseLegalId] = useState('');
  const [pseLegalIdType, setPseLegalIdType] = useState('CC');
  const [pseBankCode, setPseBankCode] = useState('');
  const [pseBankName, setPseBankName] = useState('');
  const [pseEmail, setPseEmail] = useState('');
  const [showBankPicker, setShowBankPicker] = useState(false);
  const [pseBanks, setPseBanks] = useState<{ code: string; name: string }[]>([]);
  const [loadingBanks, setLoadingBanks] = useState(false);

  const loadPSEBanks = useCallback(async () => {
    if (pseBanks.length > 0) return;
    setLoadingBanks(true);
    try {
      const res = await fetch(`${WOMPI_API_URL}/pse/financial_institutions`, {
        headers: { 'Authorization': `Bearer ${WOMPI_PUBLIC_KEY}` },
      });
      const data = await res.json();
      const banks = (data.data || [])
        .filter((b: any) => b.financial_institution_code !== '0')
        .map((b: any) => ({ code: b.financial_institution_code, name: b.financial_institution_name }));
      setPseBanks(banks);
    } catch {
      setPseBanks([
        { code: '1007', name: 'BANCOLOMBIA' },
        { code: '1051', name: 'BANCO DAVIVIENDA' },
        { code: '1001', name: 'BANCO DE BOGOTA' },
        { code: '1013', name: 'BANCO BBVA COLOMBIA S.A.' },
        { code: '1507', name: 'NEQUI' },
        { code: '1551', name: 'DAVIPLATA' },
        { code: '1023', name: 'BANCO DE OCCIDENTE' },
        { code: '1032', name: 'BANCO CAJA SOCIAL' },
        { code: '1052', name: 'BANCO AV VILLAS' },
        { code: '1002', name: 'BANCO POPULAR' },
      ]);
    } finally {
      setLoadingBanks(false);
    }
  }, [pseBanks]);

  const priceCOP = parseInt(appConfig.event_price, 10) || 30000;
  const subscriptionPriceCOP = parseInt(appConfig.subscription_price, 10) || 29900;
  const breakEvenEventsCOP = Math.ceil(subscriptionPriceCOP / priceCOP);

  // Precio final a cobrar, ya con el descuento del código promocional aplicado (si hay uno).
  // Sin código aplicado, es igual a priceCOP — no cambia ningún comportamiento existente.
  const effectivePriceCOP = promoApplied
    ? Math.max(0, Math.round(priceCOP * (1 - promoApplied.discountPercent / 100)))
    : priceCOP;

  const fetchVirtualBalance = useCallback(async () => {
    try {
      setLoadingBalance(true);
      const { data } = await supabase.from('users').select('virtual_balance, email, name').eq('id', user?.id).single();
      setVirtualBalance(data?.virtual_balance || 0);
      if (data) setUserProfile({ email: data.email || '', name: data.name || '' });
    } catch { setVirtualBalance(0); }
    finally { setLoadingBalance(false); }
  }, [user?.id]);

  useEffect(() => { fetchVirtualBalance(); }, [fetchVirtualBalance]);

  // Definida con useCallback y colocada antes de los useEffects que la referencian
  // para evitar el error "Cannot access before initialization".
  const confirmAppointment = useCallback(async (transactionId: string, paymentMethod: 'bancolombia' | 'pse' | 'card' | 'nequi' | 'virtual_balance' | 'subscription' | 'promo_code', eventIdParam?: string, amountPaidCOP?: number): Promise<boolean> => {
    try {
      const pendingEventId = eventIdParam || await AsyncStorage.getItem('pending_event_confirmation');
      if (!pendingEventId) return false;

      // Refrescar sesión — puede haber expirado mientras el usuario estaba en browser externo
      try { await supabase.auth.refreshSession(); } catch {}

      let userId: string | null = null;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        userId = session?.user?.id || null;
      } catch {}
      if (!userId) {
        try {
          const { data: { user: authUser } } = await supabase.auth.getUser();
          userId = authUser?.id || null;
        } catch {}
      }
      if (!userId) userId = user?.id || null;
      if (!userId) return false;

      const appointmentData = {
        user_id: userId,
        event_id: pendingEventId,
        status: 'confirmada',
        payment_status: 'completed',
        transaction_id: transactionId,
        payment_method: paymentMethod, amount_paid_cop: amountPaidCOP ?? 0,
        confirmed_at: new Date().toISOString(),
      };

      // Verificar si ya existe una cita para este usuario y evento
      const { data: existing } = await supabase
        .from('appointments')
        .select('id')
        .eq('user_id', userId)
        .eq('event_id', pendingEventId)
        .maybeSingle();

      let writeError = null;

      if (existing) {
        // Ya existe — actualizar
        const { error } = await supabase
          .from('appointments')
          .update(appointmentData)
          .eq('user_id', userId)
          .eq('event_id', pendingEventId);
        writeError = error;
      } else {
        // No existe — insertar
        const { error } = await supabase
          .from('appointments')
          .insert(appointmentData);
        writeError = error;
      }

      if (writeError) return false;

      // Verificar que quedó confirmada
      const { data: verification } = await supabase
        .from('appointments')
        .select('id')
        .eq('user_id', userId)
        .eq('event_id', pendingEventId)
        .eq('status', 'confirmada')
        .maybeSingle();

      if (!verification) return false;

      await AsyncStorage.removeItem('pending_event_confirmation');
      await AsyncStorage.setItem('should_check_notification_prompt', 'true');

      // Disparar evento Purchase — cubre card, nequi, PSE y bancolombia
      // ya que todos pasan por este mismo punto de confirmación.
      try {
        console.log('[Nospi Meta Debug] Iniciando tracking de Purchase para transactionId:', transactionId);
        const { data: { session: purchaseSession } } = await supabase.auth.getSession();
        const purchaseEmail = purchaseSession?.user?.email || '';
        let purchasePhone = '';
        if (userId) {
          const { data: purchaseUserRow } = await supabase
            .from('users')
            .select('phone')
            .eq('id', userId)
            .maybeSingle();
          purchasePhone = purchaseUserRow?.phone || '';
        }
        console.log('[Nospi Meta Debug] Datos listos, llamando trackMetaPurchase. email:', purchaseEmail, '| phone:', purchasePhone);
        trackMetaPurchase(transactionId, pendingEventId, purchaseEmail, purchasePhone, 9900);
      } catch (e) { console.error('[Nospi Meta Debug] Error ANTES de llamar trackMetaPurchase:', e); }

      return true;
    } catch {
      return false;
    }
  }, [user?.id]);

  // Valida y redime un código promocional. Si el descuento es del 100%, confirma
  // el cupo directo sin pasar por Wompi (mismo patrón que la suscripción activa).
  const handleApplyPromoCode = async () => {
    if (!promoCode.trim() || applyingPromo) return;
    setApplyingPromo(true);
    setPromoError(null);
    try {
      const pendingEventId = await AsyncStorage.getItem('pending_event_confirmation');
      const { data, error } = await supabase.rpc('redeem_promo_code', {
        p_code: promoCode.trim(),
        p_user_id: user?.id,
        p_event_id: pendingEventId || null,
      });

      if (error || !data?.success) {
        const errorMessages: Record<string, string> = {
          not_found: 'Código no válido o expirado.',
          inactive: 'Código no válido o expirado.',
          expired: 'Código no válido o expirado.',
          max_uses_reached: 'Este código ya alcanzó su límite de usos.',
          already_used: 'Ya usaste este código antes.',
        };
        setPromoError(errorMessages[data?.error] || 'No pudimos validar el código. Intenta de nuevo.');
        return;
      }

      setPromoApplied({ discountPercent: data.discount_percent, label: data.label });

      if (data.discount_percent >= 100) {
        const ok = await confirmAppointment(`PROMO-${promoCode.trim().toUpperCase()}`, 'promo_code', pendingEventId || undefined, effectivePriceCOP);
        if (ok) {
          setShowPromoConfirmModal(true);
        } else {
          setPromoError('El código se aplicó pero no pudimos confirmar tu cupo. Escríbenos por soporte.');
        }
      }
    } catch {
      setPromoError('No pudimos validar el código. Intenta de nuevo.');
    } finally {
      setApplyingPromo(false);
    }
  };

  useEffect(() => {
    const checkSubscriptionAndAutoConfirm = async () => {
      if (!user?.id) { setCheckingSubscription(false); return; }
      try {
        const { data, error } = await supabase.rpc('has_active_subscription', { p_user_id: user.id });
        const active = !error && data === true;
        setHasActiveSubscription(active);

        if (active) {
          const pendingEventId = await AsyncStorage.getItem('pending_event_confirmation');
          if (pendingEventId) {
            const ok = await confirmAppointment('suscripcion_activa', 'subscription', pendingEventId, 0);
            if (ok) {
              setShowSubscriptionConfirmModal(true);
            } else {
              setAutoConfirmError(true);
            }
          }
        }
      } catch {
        setHasActiveSubscription(false);
      } finally {
        setCheckingSubscription(false);
      }
    };
    checkSubscriptionAndAutoConfirm();
  }, [user?.id, confirmAppointment]);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const handleAppStateChange = async (nextAppState: string) => {
      if (nextAppState === 'active') {
        const storedTxId = await AsyncStorage.getItem('nospi_transaction_id');
        const storedMethod = await AsyncStorage.getItem('nospi_payment_method');
        const storedTime = await AsyncStorage.getItem('nospi_payment_opened_time');

        if (!storedTxId || !storedMethod) return;

        // En Android, dar 500ms al polling para que procese primero
        // (el AppState 'active' y el polling pueden disparar simultáneamente)
        if (Platform.OS === 'android') {
          await new Promise(r => setTimeout(r, 500));
          // Verificar de nuevo después del delay — el polling pudo haber limpiado el txId
          const txIdAfterDelay = await AsyncStorage.getItem('nospi_transaction_id');
          if (!txIdAfterDelay) return;
        }

        if (storedTime) {
          const age = Date.now() - parseInt(storedTime, 10);
          if (age > 10 * 60 * 1000) return;
        }



        try {
          const res = await fetch(`${WOMPI_API_URL}/transactions/${storedTxId}`);
          const data = await res.json();
          const status = data.data?.status;


          if (status === 'APPROVED') {
            // Si el polling nativo o payment-callback ya están manejando este pago, no duplicar.
            const alreadyHandled = await AsyncStorage.getItem('nospi_payment_processing');
            if (alreadyHandled === 'true') {
              return;
            }
            // Verificar que el txId sigue en AsyncStorage (si ya fue eliminado, el polling lo procesó)
            const currentTxId = await AsyncStorage.getItem('nospi_transaction_id');
            if (!currentTxId) {
              return;
            }
            // Marcar como en proceso para que el polling no duplique
            await AsyncStorage.setItem('nospi_payment_processing', 'true');
            await AsyncStorage.removeItem('nospi_transaction_id');
            await AsyncStorage.removeItem('nospi_payment_method');
            await AsyncStorage.removeItem('nospi_payment_opened_time');
            const pendingEventId = await AsyncStorage.getItem('pending_event_confirmation');
            const success = await confirmAppointment(storedTxId, storedMethod as any, pendingEventId || undefined, effectivePriceCOP);
            await AsyncStorage.removeItem('nospi_payment_processing');
            if (success) {
              if (pendingEventId) {
                router.replace({
                  pathname: '/event-details/[id]',
                  params: { id: pendingEventId, paymentSuccess: 'true' },
                });
              } else {
                setShowSuccessModal(true);
              }
            } else {
              showAlert('Error al confirmar cita', 'Tu pago fue procesado pero hubo un error al confirmar tu cita. Por favor contacta soporte.');
              router.replace('/(tabs)/appointments');
            }
          } else if (status === 'DECLINED' || status === 'VOIDED' || status === 'ERROR') {
            await AsyncStorage.multiRemove([
              'nospi_transaction_id',
              'nospi_payment_method',
              'nospi_payment_opened_time',
              'nospi_access_token',
              'nospi_refresh_token',
            ]);
            showAlert('Pago rechazado', 'Tu pago fue rechazado. Por favor intenta de nuevo.');
          } else if (status === 'PENDING' && storedMethod === 'card') {
            // The app was backgrounded during 3DS — the polling interval may have been killed.
            // Restart a short-interval poll (3s, max 10 attempts) to catch the APPROVED status.
            if (threeDsPollRef.current) {

              return;
            }

            let resumeAttempts = 0;
            const maxResumeAttempts = 10;
            threeDsPollRef.current = setInterval(async () => {
              resumeAttempts++;
              try {
                const pollRes = await fetch(`${WOMPI_API_URL}/transactions/${storedTxId}`);
                const pollData = await pollRes.json();
                const pollStatus = pollData.data?.status;


                if (pollStatus === 'APPROVED') {
                  clearInterval(threeDsPollRef.current!);
                  threeDsPollRef.current = null;
                  await AsyncStorage.multiRemove([
                    'nospi_transaction_id',
                    'nospi_payment_method',
                    'nospi_payment_opened_time',
                    'nospi_access_token',
                    'nospi_refresh_token',
                  ]);
                  const pendingEventId = await AsyncStorage.getItem('pending_event_confirmation');
                  const success = await confirmAppointment(storedTxId, 'card', pendingEventId || undefined, effectivePriceCOP);
                  if (success) {
                    if (pendingEventId) {
                      router.replace({
                        pathname: '/event-details/[id]',
                        params: { id: pendingEventId, paymentSuccess: 'true' },
                      });
                    } else {
                      setShowSuccessModal(true);
                    }
                  } else {
                    showAlert('Error al confirmar cita', 'Tu pago fue procesado pero hubo un error al confirmar tu cita. Por favor contacta soporte.');
                    router.replace('/(tabs)/appointments');
                  }
                } else if (pollStatus === 'DECLINED' || pollStatus === 'VOIDED' || pollStatus === 'ERROR') {
                  clearInterval(threeDsPollRef.current!);
                  threeDsPollRef.current = null;
                  await AsyncStorage.multiRemove([
                    'nospi_transaction_id',
                    'nospi_payment_method',
                    'nospi_payment_opened_time',
                    'nospi_access_token',
                    'nospi_refresh_token',
                  ]);
                  showAlert('Pago rechazado', 'Tu tarjeta fue rechazada. Por favor verifica los datos e intenta de nuevo.');
                } else if (resumeAttempts >= maxResumeAttempts) {
                  clearInterval(threeDsPollRef.current!);
                  threeDsPollRef.current = null;

                }
              } catch (e) {

                if (resumeAttempts >= maxResumeAttempts) {
                  clearInterval(threeDsPollRef.current!);
                  threeDsPollRef.current = null;
                }
              }
            }, 3000);
          }
          // For non-card PENDING: payment-callback handles it on browser return
        } catch (e) {

        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [confirmAppointment, router]);

  // ── Recuperación de pagos PSE/Bancolombia en web ──
  // PSE/Bancolombia abren el banco en una pestaña nueva; el polling que detecta
  // la aprobación corre en la pestaña original. Si el usuario cierra esa pestaña
  // antes de que el polling termine (muy común — la gente cree que ya terminó
  // al salir del banco), el pago queda aprobado en Wompi pero la cita nunca se
  // confirma. Este efecto revisa el pago pendiente cada vez que la pestaña
  // recupera el foco o se vuelve visible de nuevo, sin depender de que el
  // temporizador original siga vivo.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const checkPendingWebPayment = async () => {
      try {
        const storedTxId = window.localStorage.getItem('nospi_transaction_id');
        const storedMethod = window.localStorage.getItem('nospi_payment_method');
        const storedTime = window.localStorage.getItem('nospi_payment_opened_time');
        if (!storedTxId || !storedMethod) return;

        if (storedTime) {
          const age = Date.now() - parseInt(storedTime, 10);
          // No revisar pagos con más de 60 minutos — probablemente abandonados.
          if (age > 60 * 60 * 1000) return;
        }

        const alreadyHandled = await AsyncStorage.getItem('nospi_payment_processing');
        if (alreadyHandled === 'true') return;

        const res = await fetch(`${WOMPI_API_URL}/transactions/${storedTxId}`);
        const data = await res.json();
        const status = data.data?.status;

        if (status === 'APPROVED') {
          window.localStorage.removeItem('nospi_transaction_id');
          window.localStorage.removeItem('nospi_payment_method');
          window.localStorage.removeItem('nospi_payment_opened_time');
          await AsyncStorage.setItem('nospi_payment_processing', 'true');
          const pendingEventId = await AsyncStorage.getItem('pending_event_confirmation');
          const success = await confirmAppointment(storedTxId, storedMethod as any, pendingEventId || undefined, effectivePriceCOP);
          await AsyncStorage.removeItem('nospi_payment_processing');
          if (success) {
            if (pendingEventId) {
              router.replace({
                pathname: '/event-details/[id]',
                params: { id: pendingEventId, paymentSuccess: 'true' },
              });
            } else {
              setShowSuccessModal(true);
            }
          }
        } else if (status === 'DECLINED' || status === 'VOIDED' || status === 'ERROR') {
          window.localStorage.removeItem('nospi_transaction_id');
          window.localStorage.removeItem('nospi_payment_method');
          window.localStorage.removeItem('nospi_payment_opened_time');
        }
        // Si sigue PENDING, no hacemos nada — se revisará la próxima vez
        // que la pestaña recupere el foco.
      } catch (e) { /* silencioso */ }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkPendingWebPayment();
    };

    // Revisar también al montar, por si el usuario cerró la app y volvió más tarde.
    checkPendingWebPayment();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', checkPendingWebPayment);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', checkPendingWebPayment);
    };
  }, [confirmAppointment, router]);

  // subscription-plans.tsx only initiates payments.
  // All callback processing is handled exclusively in payment-callback.tsx.

  const handleSuccess = async () => {
    await confirmAppointment('', 'virtual_balance', undefined, effectivePriceCOP);

    await AsyncStorage.setItem('should_check_notification_prompt', 'true');
    setShowSuccessModal(true);
  };

  const getSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user ?? user;
  };

  const getWompiTokens = async () => {
    const res = await fetch(`${WOMPI_API_URL}/merchants/${WOMPI_PUBLIC_KEY}`);
    const data = await res.json();
    return {
      acceptanceToken: data.data?.presigned_acceptance?.acceptance_token,
      personalDataToken: data.data?.presigned_personal_data_auth?.acceptance_token,
    };
  };

  const handlePayWithVirtualBalance = async () => {

    setProcessingMethod('virtual');
    try {
      await supabase.from('users').update({ virtual_balance: virtualBalance - effectivePriceCOP }).eq('id', user?.id);

      const pendingEventId = await AsyncStorage.getItem('pending_event_confirmation');
      await confirmAppointment('', 'virtual_balance', undefined, effectivePriceCOP);
      if (pendingEventId) {

        router.replace({
          pathname: '/event-details/[id]',
          params: { id: pendingEventId, paymentSuccess: 'true' },
        });
      } else {

        setShowSuccessModal(true);
      }
    } catch { showAlert('Error', 'No se pudo procesar el pago con saldo virtual.'); }
    finally { setProcessingMethod(null); }
  };

  const handleCardPayment = async () => {
    if (!cardNumber || !cardExpiry || !cardCvc || !cardHolder) {
      showAlert('Error', 'Por favor completa todos los datos de la tarjeta.');
      return;
    }
    if (cardHolder.trim().length < 5) {
      showAlert('Error', 'El nombre del titular debe tener al menos 5 caracteres.');
      return;
    }
    // Limpiar cualquier transacción anterior antes de iniciar un nuevo intento.
    // Esto evita que el AppState handler encuentre un ID obsoleto y muestre alertas fantasma.
    await AsyncStorage.multiRemove([
      'nospi_transaction_id',
      'nospi_payment_method',
      'nospi_payment_opened_time',
      'nospi_access_token',
      'nospi_refresh_token',
    ]);
    setProcessingMethod('card');
    try {
      const currentUser = await getSession();
      if (!currentUser) throw new Error('Sesión no encontrada');
      const pendingEventId = await AsyncStorage.getItem('pending_event_confirmation');
      if (!pendingEventId) throw new Error('No se encontró el evento pendiente');

      const [expMonth, expYear] = cardExpiry.split('/');
      const expYearFull = expYear?.trim().length === 4 ? expYear.trim().slice(2) : expYear?.trim();

      const tokenRes = await fetch(`${WOMPI_API_URL}/tokens/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${WOMPI_PUBLIC_KEY}` },
        body: JSON.stringify({
          number: cardNumber.replace(/\s/g, ''),
          exp_month: expMonth?.trim(),
          exp_year: expYearFull,
          cvc: cardCvc,
          card_holder: cardHolder,
        }),
      });
      const tokenData = await tokenRes.json();


      if (!tokenRes.ok || !tokenData.data?.id) {
        const msgs = tokenData.error?.messages;
        const readable = msgs ? Object.values(msgs).flat().join(', ') : JSON.stringify(tokenData.error);
        throw new Error(readable || 'Datos de tarjeta inválidos');
      }
      const cardToken = tokenData.data.id;

      const { acceptanceToken, personalDataToken } = await getWompiTokens();
      if (!acceptanceToken) throw new Error('No se pudo obtener token de aceptación de Wompi');

      const response = await fetch(`${SUPABASE_URL}/functions/v1/wompi-card-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({
          cardToken,
          acceptanceToken,
          personalDataToken,
          installments: parseInt(cardInstallments),
          amountCOP: effectivePriceCOP,
          userEmail: userProfile?.email || currentUser.email || '',
          userId: currentUser.id,
          eventId: pendingEventId,
          // redirect_url es REQUERIDO por Wompi para transacciones que necesiten 3DS.
          // Wompi solo acepta URLs https:// — el deep link nospi:// causa INPUT_VALIDATION_ERROR.
          // Siempre usamos la URL web; payment-callback.tsx maneja el retorno en ambas plataformas.
          redirectUrl: WEB_REDIRECT_URL,
        }),
      });
      const result = await response.json();

      if (!response.ok || result.error) throw new Error(result.error || `Error al procesar el pago (HTTP ${response.status})`);

      if (result.status === 'APPROVED') {
        setShowCardForm(false);

        const pendingEventId = await AsyncStorage.getItem('pending_event_confirmation');

        await confirmAppointment(result.transactionId || '', 'card', pendingEventId || undefined, effectivePriceCOP);
        if (pendingEventId) {

          router.replace({
            pathname: '/event-details/[id]',
            params: { id: pendingEventId, paymentSuccess: 'true' },
          });
        } else {

          setShowSuccessModal(true);
        }
      } else if (result.status === 'PENDING') {
        // Card payment is pending — puede requerir autenticación 3DS en mobile.


        setShowCardForm(false);

        // Detectar si Wompi requiere 3DS (redirect de autenticación).
        // En mobile la URL llega en diferentes campos según la versión de la API.
        const threeDsUrl =
          result.redirectUrl ||
          result.redirect_url ||
          result.payment_method?.extra?.async_payment_url ||
          result.data?.payment_method?.extra?.async_payment_url ||
          null;

        if (threeDsUrl && Platform.OS !== 'web') {
          // En mobile: abrir la URL de 3DS en el browser nativo.
          // Wompi redirigirá de vuelta a WEB_REDIRECT_URL (HTTPS) after 3DS.
          // The AppState 'active' event fires when the user returns to the app.

          await AsyncStorage.setItem('nospi_transaction_id', result.transactionId || '');
          await AsyncStorage.setItem('nospi_payment_method', 'card');
          await AsyncStorage.setItem('nospi_payment_opened_time', Date.now().toString());
          try {
            const { data: { session: currentSession } } = await supabase.auth.getSession();
            if (currentSession?.access_token) {
              await AsyncStorage.setItem('nospi_access_token', currentSession.access_token);
              await AsyncStorage.setItem('nospi_refresh_token', currentSession.refresh_token || '');
            }
          } catch {}
          await Linking.openURL(threeDsUrl);

          // Start a background poll (5s, max 36 attempts = 3 min) so that if the
          // AppState event fires before 3DS completes, the poll will catch APPROVED.
          if (threeDsPollRef.current) {
            clearInterval(threeDsPollRef.current);
            threeDsPollRef.current = null;
          }
          const bgTxId = result.transactionId || '';
          let bgAttempts = 0;
          const bgMaxAttempts = 36;

          threeDsPollRef.current = setInterval(async () => {
            bgAttempts++;
            try {
              const bgRes = await fetch(`${WOMPI_API_URL}/transactions/${bgTxId}`);
              const bgData = await bgRes.json();
              const bgStatus = bgData.data?.status;


              if (bgStatus === 'APPROVED') {
                clearInterval(threeDsPollRef.current!);
                threeDsPollRef.current = null;
                await AsyncStorage.multiRemove([
                  'nospi_transaction_id',
                  'nospi_payment_method',
                  'nospi_payment_opened_time',
                  'nospi_access_token',
                  'nospi_refresh_token',
                ]);
                const pendingEventId = await AsyncStorage.getItem('pending_event_confirmation');
                const success = await confirmAppointment(bgTxId, 'card', pendingEventId || undefined, effectivePriceCOP);
                if (success) {
                  if (pendingEventId) {
                    router.replace({
                      pathname: '/event-details/[id]',
                      params: { id: pendingEventId, paymentSuccess: 'true' },
                    });
                  } else {
                    setShowSuccessModal(true);
                  }
                } else {
                  showAlert('Error al confirmar cita', 'Tu pago fue procesado pero hubo un error al confirmar tu cita. Por favor contacta soporte.');
                  router.replace('/(tabs)/appointments');
                }
              } else if (bgStatus === 'DECLINED' || bgStatus === 'VOIDED' || bgStatus === 'ERROR') {
                clearInterval(threeDsPollRef.current!);
                threeDsPollRef.current = null;
                await AsyncStorage.multiRemove([
                  'nospi_transaction_id',
                  'nospi_payment_method',
                  'nospi_payment_opened_time',
                  'nospi_access_token',
                  'nospi_refresh_token',
                ]);
                showAlert('Pago rechazado', 'Tu tarjeta fue rechazada. Por favor verifica los datos e intenta de nuevo.');
              } else if (bgAttempts >= bgMaxAttempts) {
                clearInterval(threeDsPollRef.current!);
                threeDsPollRef.current = null;

                showAlert('Pago en proceso', 'Tu pago sigue siendo procesado. Te confirmaremos cuando se complete.');
                router.replace('/(tabs)/appointments');
              }
            } catch (e) {

              if (bgAttempts >= bgMaxAttempts) {
                clearInterval(threeDsPollRef.current!);
                threeDsPollRef.current = null;
              }
            }
          }, 5000);

          setProcessingMethod(null);
          return;
        }

        showAlert('Procesando pago', 'Tu pago con tarjeta está siendo verificado. Por favor espera...');

        let cardAttempts = 0;
        // En mobile sin 3DS url: aumentar el intervalo y los intentos para dar más tiempo.
        const pollInterval = Platform.OS === 'web' ? 3000 : 5000;
        const maxAttempts = Platform.OS === 'web' ? 20 : 36; // 36 × 5s = 3 minutos en mobile
        const cardPoll = setInterval(async () => {
          cardAttempts++;
          try {
            const res = await fetch(`${WOMPI_API_URL}/transactions/${result.transactionId}`);
            const data = await res.json();
            const status = data.data?.status;


            // Verificar si apareció URL de 3DS durante el polling (a veces llega tarde)
            const pollingThreeDsUrl =
              data.data?.payment_method?.extra?.async_payment_url ||
              data.data?.redirect_url ||
              null;

            if (pollingThreeDsUrl && Platform.OS !== 'web' && cardAttempts <= 3) {
              clearInterval(cardPoll);
              setProcessingMethod(null);

              await AsyncStorage.setItem('nospi_transaction_id', result.transactionId || '');
              await AsyncStorage.setItem('nospi_payment_method', 'card');
              await AsyncStorage.setItem('nospi_payment_opened_time', Date.now().toString());
              try {
                const { data: { session: cs } } = await supabase.auth.getSession();
                if (cs?.access_token) {
                  await AsyncStorage.setItem('nospi_access_token', cs.access_token);
                  await AsyncStorage.setItem('nospi_refresh_token', cs.refresh_token || '');
                }
              } catch {}
              await Linking.openURL(pollingThreeDsUrl);
              return;
            }

            if (status === 'APPROVED') {
              clearInterval(cardPoll);
              setProcessingMethod(null);

              const pendingEventId = await AsyncStorage.getItem('pending_event_confirmation');
              await confirmAppointment(result.transactionId || '', 'card', pendingEventId || undefined, effectivePriceCOP);
              if (pendingEventId) {
                router.replace({
                  pathname: '/event-details/[id]',
                  params: { id: pendingEventId, paymentSuccess: 'true' },
                });
              } else {
                setShowSuccessModal(true);
              }
            } else if (['DECLINED', 'ERROR', 'VOIDED'].includes(status)) {
              clearInterval(cardPoll);
              setProcessingMethod(null);
              // Limpiar AsyncStorage para que el AppState handler no dispare
              // un alert fantasma la próxima vez que la app vuelva al primer plano.
              await AsyncStorage.removeItem('nospi_transaction_id');
              await AsyncStorage.removeItem('nospi_payment_method');
              await AsyncStorage.removeItem('nospi_payment_opened_time');
              await AsyncStorage.removeItem('nospi_access_token');
              await AsyncStorage.removeItem('nospi_refresh_token');
              showAlert('Pago rechazado', 'Tu tarjeta fue rechazada. Por favor verifica los datos e intenta de nuevo.');
            } else if (cardAttempts >= maxAttempts) {
              clearInterval(cardPoll);
              setProcessingMethod(null);
              showAlert('Pago en proceso', 'Tu pago sigue siendo procesado. Te confirmaremos cuando se complete.');
              router.replace('/(tabs)/appointments');
            }
          } catch (e) {

            if (cardAttempts >= maxAttempts) {
              clearInterval(cardPoll);
              setProcessingMethod(null);
            }
          }
        }, pollInterval);
        return; // Don't call setProcessingMethod in finally
      } else {
        throw new Error(`Pago rechazado (${result.status || 'sin estado'}). Detalle: ${JSON.stringify(result.error || result.message || result)}`);
      }
    } catch (error: any) {

      showAlert('Error en tarjeta', error.message);
    } finally { setProcessingMethod(null); }
  };

  const handleNequiPayment = async () => {
    const cleanPhone = nequiPhone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) { showAlert('Error', 'Ingresa un número de celular válido de 10 dígitos.'); return; }
    setProcessingMethod('nequi');
    try {
      const currentUser = await getSession();
      if (!currentUser) throw new Error('Sesión no encontrada');
      const pendingEventId = await AsyncStorage.getItem('pending_event_confirmation');
      if (!pendingEventId) throw new Error('No se encontró el evento pendiente');

      const { acceptanceToken, personalDataToken } = await getWompiTokens();
      if (!acceptanceToken) throw new Error('No se pudo obtener token de aceptación');

      const response = await fetch(`${SUPABASE_URL}/functions/v1/wompi-nequi-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ phoneNumber: cleanPhone, acceptanceToken, personalDataToken, amountCOP: effectivePriceCOP, userEmail: userProfile?.email || currentUser.email || '', userId: currentUser.id, eventId: pendingEventId }),
      });
      const result = await response.json();
      if (!response.ok || result.error) throw new Error(result.error || 'Error al procesar Nequi');

      setNequiStatus('waiting');
      let attempts = 0;
      const maxNequiAttempts = 80; // 80 × 3s = 4 minutos
      const poll = setInterval(async () => {
        attempts++;
        try {
          const res = await fetch(`${WOMPI_API_URL}/transactions/${result.transactionId}`);
          const data = await res.json();
          const status = data.data?.status;
          if (status === 'APPROVED') {
            clearInterval(poll);
            setProcessingMethod(null);
            setShowNequiForm(false);
            setNequiStatus('idle');
            const pendingEventId = await AsyncStorage.getItem('pending_event_confirmation');
            await confirmAppointment(result.transactionId || '', 'nequi', pendingEventId || undefined, effectivePriceCOP);
            if (pendingEventId) {
              router.replace({
                pathname: '/event-details/[id]',
                params: { id: pendingEventId, paymentSuccess: 'true' },
              });
            } else {
              setShowSuccessModal(true);
            }
          } else if (['DECLINED', 'ERROR', 'VOIDED'].includes(status) || attempts >= maxNequiAttempts) {
            clearInterval(poll);
            setProcessingMethod(null);
            setNequiStatus('idle');
            showAlert(
              attempts >= maxNequiAttempts ? 'Tiempo agotado' : 'Pago rechazado',
              attempts >= maxNequiAttempts
                ? 'No recibimos confirmación de Nequi. Abre la app de Nequi y aprueba la notificación, luego vuelve aquí e intenta de nuevo.'
                : 'El pago fue rechazado por Nequi.'
            );
          }
        } catch (e) { if (attempts >= maxNequiAttempts) { clearInterval(poll); setProcessingMethod(null); setNequiStatus('idle'); } }
      }, 3000);
    } catch (error: any) {
      showAlert('Error Nequi', error.message);
      setProcessingMethod(null);
    }
  };

  const handleBancolombiaPayment = async () => {
    setProcessingMethod('bancolombia');
    try {

      const currentUser = await getSession();
      if (!currentUser) throw new Error('Sesión no encontrada');
      const pendingEventId = await AsyncStorage.getItem('pending_event_confirmation');
      if (!pendingEventId) throw new Error('No se encontró el evento pendiente');

      const { acceptanceToken, personalDataToken } = await getWompiTokens();
      if (!acceptanceToken) throw new Error('No se pudo obtener token de aceptación');

      const bancolombiaRedirectUrl = WEB_REDIRECT_URL; // Use HTTPS so Wompi accepts it and payment-callback page loads


      const response = await fetch(`${SUPABASE_URL}/functions/v1/wompi-bancolombia-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({
          acceptanceToken,
          personalDataToken,
          amountCOP: effectivePriceCOP,
          userEmail: userProfile?.email || currentUser.email || '',
          userId: currentUser.id,
          eventId: pendingEventId,
          redirectUrl: bancolombiaRedirectUrl
        }),
      });
      const result = await response.json();
      if (!response.ok || result.error) throw new Error(result.error || 'Error al procesar Bancolombia');



      const bancolombiaTransactionId = result.transactionId;
      await AsyncStorage.setItem('nospi_transaction_id', bancolombiaTransactionId);
      await AsyncStorage.setItem('nospi_payment_method', 'bancolombia');
      await AsyncStorage.setItem('nospi_payment_opened_time', Date.now().toString());
      if (currentUser?.id) {
        await AsyncStorage.setItem('nospi_user_id', currentUser.id);
      }
      // Guardar el token de sesión para que payment-callback pueda restaurar la sesión
      // cuando el usuario vuelve del browser externo (PSE/Bancolombia abren un navegador).
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (currentSession?.access_token) {
          await AsyncStorage.setItem('nospi_access_token', currentSession.access_token);
          await AsyncStorage.setItem('nospi_refresh_token', currentSession.refresh_token || '');
        }
      } catch {}
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('nospi_transaction_id', bancolombiaTransactionId);
        window.localStorage.setItem('nospi_payment_method', 'bancolombia');
        window.localStorage.setItem('nospi_payment_opened_time', Date.now().toString());
      }



      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('nospi_transaction_id', bancolombiaTransactionId);
          window.localStorage.setItem('nospi_payment_method', 'bancolombia');
          window.localStorage.setItem('nospi_payment_opened_time', Date.now().toString());
        }
        window.open(result.redirectUrl, '_blank');
        setProcessingMethod(null);
        startWebPolling(bancolombiaTransactionId, 'bancolombia');
        return;
      }

      await Linking.openURL(result.redirectUrl);

      setProcessingMethod(null);

      Toast.show({
        type: 'info',
        text1: 'Completa tu pago en Bancolombia',
        text2: 'Cuando termines, regresa a esta pantalla. Tu pago se verificará automáticamente.',
        visibilityTime: 8000,
        position: 'top',
        topOffset: 60,
      });

      startNativePolling(bancolombiaTransactionId, 'bancolombia');

      return;
    } catch (error: any) {

      showAlert('Error Bancolombia', error.message);
      setProcessingMethod(null);
    }
  };

  const startNativePolling = useCallback((transactionId: string, paymentMethod: 'bancolombia' | 'pse') => {
    let attempts = 0;
    const maxAttempts = 60; // 60 × 2s = 2 minutos — intervalo más frecuente para detectar APPROVED rápido
    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`${WOMPI_API_URL}/transactions/${transactionId}`);
        const data = await res.json();
        const status = data.data?.status;


        if (status === 'APPROVED') {
          clearInterval(interval);
          setProcessingMethod(null);
          // Verificar si ya fue procesado por otro handler (AppState o payment-callback)
          const alreadyHandled = await AsyncStorage.getItem('nospi_payment_processing');
          if (alreadyHandled === 'true') {
            const pendingEventId = await AsyncStorage.getItem('pending_event_confirmation');
            if (pendingEventId) {
              router.replace({ pathname: '/event-details/[id]', params: { id: pendingEventId, paymentSuccess: 'true' } });
            } else {
              router.replace('/(tabs)/appointments');
            }
            return;
          }
          // Marcar como en proceso para que AppState handler no duplique
          await AsyncStorage.setItem('nospi_payment_processing', 'true');
          await AsyncStorage.removeItem('nospi_transaction_id');
          await AsyncStorage.removeItem('nospi_payment_method');
          await AsyncStorage.removeItem('nospi_payment_opened_time');
          const pendingEventId = await AsyncStorage.getItem('pending_event_confirmation');
          const success = await confirmAppointment(transactionId, paymentMethod, pendingEventId || undefined, effectivePriceCOP);
          await AsyncStorage.removeItem('nospi_payment_processing');
          if (success) {
            if (pendingEventId) {
              router.replace({
                pathname: '/event-details/[id]',
                params: { id: pendingEventId, paymentSuccess: 'true' },
              });
            } else {
              setShowSuccessModal(true);
            }
          } else {
            showAlert('Error al confirmar cita', 'Tu pago fue procesado pero hubo un error al confirmar tu cita. Por favor contacta soporte.');
            router.replace('/(tabs)/appointments');
          }
        } else if (status === 'DECLINED' || status === 'VOIDED') {
          clearInterval(interval);
          setProcessingMethod(null);
          showAlert('Pago rechazado', 'Tu pago fue rechazado. Por favor intenta de nuevo.');
        } else if (status === 'ERROR') {
          clearInterval(interval);
          setProcessingMethod(null);
          showAlert('Error en el pago', 'Ocurrió un error procesando tu pago. Contacta soporte si el dinero fue debitado.');
        } else if (attempts >= maxAttempts) {
          clearInterval(interval);
          setProcessingMethod(null);
          Toast.show({
            type: 'info',
            text1: 'Verificando pago',
            text2: 'Tu pago sigue siendo procesado. Te confirmaremos cuando se complete.',
            visibilityTime: 6000,
            position: 'top',
            topOffset: 60,
          });
          router.replace('/(tabs)/appointments');
        }
      } catch (e) {

        if (attempts >= maxAttempts) {
          clearInterval(interval);
          setProcessingMethod(null);
        }
      }
    }, 2000);
  }, [confirmAppointment, router]);

  const startWebPolling = useCallback((transactionId: string, paymentMethod: 'bancolombia' | 'pse') => {
    let attempts = 0;
    // 180 intentos × 5s = 15 minutos. La autenticación real con el banco (login,
    // OTP, etc.) puede tardar más de los 2 minutos que había antes — con eso el
    // polling se rendía justo antes de que Wompi confirmara el pago, dejando al
    // cliente pagado pero sin la cita confirmada.
    const maxAttempts = 180;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`${WOMPI_API_URL}/transactions/${transactionId}`);
        const data = await res.json();
        const status = data.data?.status;

        if (status === 'APPROVED') {
          clearInterval(interval);
          if (typeof window !== 'undefined') {
            window.localStorage.removeItem('nospi_transaction_id');
            window.localStorage.removeItem('nospi_payment_method');
            window.localStorage.removeItem('nospi_payment_opened_time');
          }
          await AsyncStorage.removeItem('nospi_transaction_id');
          await AsyncStorage.removeItem('nospi_payment_method');
          await AsyncStorage.removeItem('nospi_payment_opened_time');
          try { await supabase.auth.refreshSession(); } catch {}
          const success = await confirmAppointment(transactionId, paymentMethod, undefined, effectivePriceCOP);
          if (success) {
            setShowSuccessModal(true);
          } else {
            showAlert('Error al confirmar cita', 'Tu pago fue procesado pero hubo un error al confirmar tu cita. Por favor contacta soporte.');
            router.replace('/(tabs)/appointments');
          }
        } else if (status === 'PENDING') {
          if (attempts >= maxAttempts) {
            clearInterval(interval);
            if (typeof window !== 'undefined') {
              window.localStorage.removeItem('nospi_transaction_id');
              window.localStorage.removeItem('nospi_payment_method');
              window.localStorage.removeItem('nospi_payment_opened_time');
            }
            await AsyncStorage.removeItem('nospi_transaction_id');
            await AsyncStorage.removeItem('nospi_payment_method');
            await AsyncStorage.removeItem('nospi_payment_opened_time');
            Toast.show({
              type: 'info',
              text1: 'Pago en proceso',
              text2: 'Tu pago está siendo procesado. Te notificaremos cuando se confirme.',
              visibilityTime: 5000,
              position: 'top',
            });
            router.replace('/(tabs)/appointments');
          }
        } else if (status === 'DECLINED' || status === 'ERROR' || status === 'VOIDED') {
          clearInterval(interval);
          if (typeof window !== 'undefined') {
            window.localStorage.removeItem('nospi_transaction_id');
            window.localStorage.removeItem('nospi_payment_method');
            window.localStorage.removeItem('nospi_payment_opened_time');
          }
          await AsyncStorage.removeItem('nospi_transaction_id');
          await AsyncStorage.removeItem('nospi_payment_method');
          await AsyncStorage.removeItem('nospi_payment_opened_time');

          if (status === 'VOIDED') {
            showAlert('Pago cancelado', 'Cancelaste el proceso de pago. Si deseas confirmar tu asistencia al evento, por favor intenta realizar el pago nuevamente.');
          } else if (status === 'DECLINED') {
            showAlert('Pago rechazado', 'El banco rechazó tu pago. Por favor, inténtalo de nuevo.');
          } else {
            showAlert('Error en el pago', 'Ocurrió un error al procesar tu pago. Por favor, inténtalo de nuevo.');
          }
        } else if (attempts >= maxAttempts) {
          clearInterval(interval);
          showAlert('Tiempo agotado', 'No se pudo confirmar el pago. Si realizaste el pago, contacta soporte.');
        }
      } catch (e) {

        if (attempts >= maxAttempts) clearInterval(interval);
      }
    }, 5000);
  }, [confirmAppointment, router]);

    // ========== TEST PAYMENT HANDLER - DELETE BEFORE PRODUCTION ==========
  const handleTestPayment = async () => {

    try {
      const pendingEventId = await AsyncStorage.getItem('pending_event_confirmation');
      if (!pendingEventId) {
        showAlert('Test', 'No hay evento pendiente. Ve a un evento y presiona Confirmar primero.');
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) {
        showAlert('Test', 'No hay sesión activa.');
        return;
      }

      // Check if appointment already exists
      const { data: existing } = await supabase
        .from('appointments')
        .select('id')
        .eq('user_id', userId)
        .eq('event_id', pendingEventId)
        .maybeSingle();

      if (existing) {

        const { error: updateError } = await supabase
          .from('appointments')
          .update({
            status: 'confirmada',
            payment_status: 'completed',
          })
          .eq('id', existing.id);
        if (updateError) {

          showAlert('Test Error', updateError.message);
          return;
        }
      } else {

        const { error: insertError } = await supabase
          .from('appointments')
          .insert({
            user_id: userId,
            event_id: pendingEventId,
            status: 'confirmada',
            payment_status: 'completed',
          });
        if (insertError) {

          showAlert('Test Error', insertError.message);
          return;
        }
      }

      await AsyncStorage.removeItem('pending_event_confirmation');

      await new Promise(resolve => setTimeout(resolve, 500));

      router.replace({
        pathname: '/event-details/[id]',
        params: { id: pendingEventId, paymentSuccess: 'true' },
      });
    } catch (e: any) {

      showAlert('Test Error', e.message);
    }
  };
  // ========== END TEST PAYMENT HANDLER ==========

	const handlePSEPayment = async () => {
    const cleanPhone = psePhone.replace(/\D/g, '');
    const cleanLegalId = pseLegalId.replace(/\D/g, '');
    if (!pseEmail || !pseEmail.includes('@')) { showAlert('Error', 'Ingresa tu correo registrado en PSE.'); return; }
    if (cleanPhone.length !== 10) { showAlert('Error', 'Ingresa un número de celular válido de 10 dígitos.'); return; }
    if (cleanLegalId.length < 5) { showAlert('Error', 'Ingresa un número de documento válido.'); return; }
    if (!pseBankCode) { showAlert('Error', 'Selecciona tu banco.'); return; }

    setProcessingMethod('pse');
    try {

      const currentUser = await getSession();
      if (!currentUser) throw new Error('Sesión no encontrada');
      const pendingEventId = await AsyncStorage.getItem('pending_event_confirmation');
      if (!pendingEventId) throw new Error('No se encontró el evento pendiente');

      const { acceptanceToken, personalDataToken } = await getWompiTokens();
      if (!acceptanceToken) throw new Error('No se pudo obtener token de aceptación');

      const pseRedirectUrl = WEB_REDIRECT_URL; // Wompi PSE requires HTTPS on all platforms


      const response = await fetch(`${SUPABASE_URL}/functions/v1/wompi-pse-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({
          acceptanceToken,
          personalDataToken,
          amountCOP: effectivePriceCOP,
          userEmail: pseEmail,
          userId: currentUser.id,
          eventId: pendingEventId,
          userFullName: userProfile?.name || currentUser.email || '',
          userPhone: cleanPhone,
          userLegalId: cleanLegalId,
          userLegalIdType: pseLegalIdType,
          financialInstitutionCode: pseBankCode,
          redirectUrl: pseRedirectUrl
        }),
      });
      const data = await response.json();

      if (!response.ok) {

        throw new Error(data.error || 'Error al crear pago PSE');
      }

      if (!data.redirectUrl) throw new Error('No se obtuvo URL de pago PSE');



      await AsyncStorage.setItem('nospi_transaction_id', data.transactionId);
      await AsyncStorage.setItem('nospi_payment_method', 'pse');
      await AsyncStorage.setItem('nospi_payment_opened_time', Date.now().toString());
      if (currentUser?.id) {
        await AsyncStorage.setItem('nospi_user_id', currentUser.id);
      }
      // Guardar el token de sesión para que payment-callback pueda restaurar la sesión
      // cuando el usuario vuelve del browser externo (PSE/Bancolombia abren un navegador).
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (currentSession?.access_token) {
          await AsyncStorage.setItem('nospi_access_token', currentSession.access_token);
          await AsyncStorage.setItem('nospi_refresh_token', currentSession.refresh_token || '');
        }
      } catch {}
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('nospi_transaction_id', data.transactionId);
        window.localStorage.setItem('nospi_payment_method', 'pse');
        window.localStorage.setItem('nospi_payment_opened_time', Date.now().toString());
      }



      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('nospi_transaction_id', data.transactionId);
          window.localStorage.setItem('nospi_payment_method', 'pse');
          window.localStorage.setItem('nospi_payment_opened_time', Date.now().toString());
        }
        window.open(data.redirectUrl, '_blank');
        setProcessingMethod(null);
        setShowPSEForm(false);
        startWebPolling(data.transactionId, 'pse');
        return;
      }

      await Linking.openURL(data.redirectUrl);

      setProcessingMethod(null);
      setShowPSEForm(false);

      Toast.show({
        type: 'info',
        text1: 'Completa tu pago en tu banco',
        text2: 'Cuando termines, regresa a esta pantalla. Tu pago se verificará automáticamente.',
        visibilityTime: 8000,
        position: 'top',
        topOffset: 60,
      });

      startNativePolling(data.transactionId, 'pse');

      return;

    } catch (error: any) {

      showAlert('Error PSE', error.message);
      setProcessingMethod(null);
    }
  };

  if (checkingSubscription) {
    return (
      <LinearGradient colors={['#1a0010', '#880E4F', '#AD1457']} style={[styles.gradient, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={{ color: '#fff', marginTop: 16, fontSize: 15 }}>Verificando tu cuenta…</Text>
      </LinearGradient>
    );
  }

  if (hasActiveSubscription && !autoConfirmError && !showSuccessModal && !showSubscriptionConfirmModal) {
    return (
      <LinearGradient colors={['#1a0010', '#880E4F', '#AD1457']} style={[styles.gradient, { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }]}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={{ color: '#fff', marginTop: 16, fontSize: 15, textAlign: 'center' }}>
          Tienes suscripción activa — confirmando tu asistencia sin costo…
        </Text>
      </LinearGradient>
    );
  }

  if (showCardForm) {
    return (
      <SafeAreaView style={styles.formContainer}>
        <Stack.Screen options={{ headerShown: true, title: 'Pagar con Tarjeta', headerLeft: () => (
          <TouchableOpacity onPress={() => setShowCardForm(false)} style={{ paddingHorizontal: 16 }}>
            <Text style={{ color: nospiColors.purpleDark, fontSize: 16 }}>Cancelar</Text>
          </TouchableOpacity>
        )}} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>💳 Datos de la tarjeta</Text>
              <Text style={styles.formAmount}>{`$${effectivePriceCOP.toLocaleString('es-CO')} COP`}</Text>
              <Text style={styles.inputLabel}>Nombre del titular</Text>
              <TextInput style={styles.input} placeholder="Como aparece en la tarjeta" value={cardHolder} onChangeText={setCardHolder} autoCapitalize="characters" returnKeyType="next" />
              <Text style={styles.inputLabel}>Número de tarjeta</Text>
              <View style={styles.cardNumberRow}>
                <TextInput style={[styles.input, { flex: 1, borderWidth: 0, padding: 0 }]} placeholder="0000 0000 0000 0000" value={cardNumber}
                  onChangeText={(t) => { const c = t.replace(/\D/g, '').slice(0, 16); setCardNumber(c.replace(/(.{4})/g, '$1 ').trim()); }}
                  keyboardType="numeric" maxLength={19} returnKeyType="next" />
                {(() => {
                  const brand = getCardBrand(cardNumber.replace(/\s/g, ''));
                  if (!brand) return null;
                  return renderCardBrandMark(brand);
                })()}
              </View>
              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.inputLabel}>Vencimiento</Text>
                  <TextInput style={styles.input} placeholder="MM/AA" value={cardExpiry}
                    onChangeText={(t) => { const c = t.replace(/\D/g, '').slice(0, 4); setCardExpiry(c.length >= 2 ? c.slice(0, 2) + '/' + c.slice(2) : c); }}
                    keyboardType="numeric" maxLength={5} returnKeyType="next" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>CVV</Text>
                  <TextInput style={styles.input} placeholder="123" value={cardCvc}
                    onChangeText={(t) => setCardCvc(t.replace(/\D/g, '').slice(0, 4))}
                    keyboardType="numeric" maxLength={4} secureTextEntry returnKeyType="done" />
                </View>
              </View>
              <Text style={styles.inputLabel}>Cuotas</Text>
              <View style={styles.installmentsContainer}>
                {['1', '3', '6', '12'].map((q) => (
                  <TouchableOpacity key={q} style={[styles.installmentBtn, cardInstallments === q && styles.installmentBtnSelected]} onPress={() => setCardInstallments(q)}>
                    <Text style={[styles.installmentText, cardInstallments === q && styles.installmentTextSelected]}>{q === '1' ? 'Sin cuotas' : `${q} cuotas`}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={[styles.payBtn, isProcessing('card') && styles.payBtnDisabled]}
                onPress={() => { Keyboard.dismiss(); handleCardPayment(); }}
                disabled={isProcessing('card')}
                activeOpacity={0.7}
              >
                {isProcessing('card') ? <ActivityIndicator color="#fff" /> : <Text style={styles.payBtnText}>{`Pagar $${effectivePriceCOP.toLocaleString('es-CO')} COP`}</Text>}
              </TouchableOpacity>
              <Text style={styles.secureNote}>🔒 Pago seguro procesado por Wompi</Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  if (showNequiForm) {
    return (
      <SafeAreaView style={styles.formContainer}>
        <Stack.Screen options={{ headerShown: true, title: 'Pagar con Nequi', headerLeft: () => (
          <TouchableOpacity onPress={() => { setShowNequiForm(false); setNequiStatus('idle'); setProcessingMethod(null); }} style={{ paddingHorizontal: 16 }}>
            <Text style={{ color: nospiColors.purpleDark, fontSize: 16 }}>Cancelar</Text>
          </TouchableOpacity>
        )}} />
        <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
          <View style={styles.formCard}>
            {nequiStatus === 'idle' ? (
              <>
                <Image source={require('@/assets/images/logo-nequi.png')} style={styles.methodLogoLarge} resizeMode="contain" />
                <Text style={styles.formAmount}>{`$${effectivePriceCOP.toLocaleString('es-CO')} COP`}</Text>
                <Text style={styles.nequiDescription}>Ingresa tu número de celular registrado en Nequi. Recibirás una notificación push para aprobar el pago.</Text>
                <Text style={styles.inputLabel}>Número de celular Nequi</Text>
                <TextInput style={styles.input} placeholder="3001234567" value={nequiPhone}
                  onChangeText={(t) => setNequiPhone(t.replace(/\D/g, '').slice(0, 10))}
                  keyboardType="phone-pad" maxLength={10} />
                <TouchableOpacity
                  style={[styles.payBtn, isProcessing('nequi') && styles.payBtnDisabled]}
                  onPress={handleNequiPayment}
                  disabled={isProcessing('nequi')}
                  activeOpacity={0.7}
                >
                  {isProcessing('nequi') ? <ActivityIndicator color="#fff" /> : <Text style={styles.payBtnText}>Enviar solicitud de pago</Text>}
                </TouchableOpacity>
                <Text style={styles.secureNote}>🔒 Pago seguro procesado por Wompi</Text>
              </>
            ) : (
              <View style={styles.waitingContainer}>
                <Image source={require('@/assets/images/logo-nequi.png')} style={styles.methodLogoLarge} resizeMode="contain" />
                <Text style={styles.waitingTitle}>Revisa tu app de Nequi</Text>
                <Text style={styles.waitingDesc}>Aprueba el pago de <Text style={{ fontWeight: 'bold' }}>{`$${effectivePriceCOP.toLocaleString('es-CO')} COP`}</Text> desde tu app Nequi.</Text>
                <ActivityIndicator size="large" color="#7C3AED" style={{ marginTop: 24 }} />
                <Text style={styles.waitingHint}>Esperando confirmación...</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (showPSEForm) {
    return (
      <SafeAreaView style={styles.formContainer}>
        <Stack.Screen options={{ headerShown: true, title: 'Pagar con PSE', headerLeft: () => (
          <TouchableOpacity onPress={() => { setShowPSEForm(false); setProcessingMethod(null); }} style={{ paddingHorizontal: 16 }}>
            <Text style={{ color: nospiColors.purpleDark, fontSize: 16 }}>Cancelar</Text>
          </TouchableOpacity>
        )}} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
            <View style={styles.formCard}>
              <Image source={require('@/assets/images/logo_380.png')} style={styles.methodLogoLarge} resizeMode="contain" />
              <Text style={styles.formAmount}>{`$${effectivePriceCOP.toLocaleString('es-CO')} COP`}</Text>

              <Text style={styles.inputLabel}>Banco</Text>
              <TouchableOpacity
                style={[styles.input, { justifyContent: 'center' }]}
                onPress={() => !loadingBanks && setShowBankPicker(true)}
              >
                {loadingBanks
                  ? <ActivityIndicator size="small" color={nospiColors.purpleDark} />
                  : <Text style={{ fontSize: 16, color: pseBankName ? '#111' : '#aaa' }}>
                      {pseBankName || 'Selecciona tu banco'}
                    </Text>
                }
              </TouchableOpacity>

              {showBankPicker && (
                <View style={styles.bankPickerContainer}>
                  <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled>
                    {pseBanks.map((bank) => (
                      <TouchableOpacity
                        key={bank.code}
                        style={styles.bankOption}
                        onPress={() => { setPseBankCode(bank.code); setPseBankName(bank.name); setShowBankPicker(false); }}
                      >
                        <Text style={[styles.bankOptionText, pseBankCode === bank.code && { color: nospiColors.purpleDark, fontWeight: '700' }]}>
                          {bank.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              <Text style={styles.inputLabel}>Correo registrado en PSE</Text>
              <TextInput
                style={styles.input}
                placeholder="tucorreo@gmail.com"
                value={pseEmail}
                onChangeText={setPseEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                returnKeyType="next"
              />

              <Text style={styles.inputLabel}>Tipo de documento</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
                {['CC', 'CE', 'NIT', 'PP'].map((tipo) => (
                  <TouchableOpacity
                    key={tipo}
                    style={[styles.installmentBtn, pseLegalIdType === tipo && styles.installmentBtnSelected]}
                    onPress={() => setPseLegalIdType(tipo)}
                  >
                    <Text style={[styles.installmentText, pseLegalIdType === tipo && styles.installmentTextSelected]}>{tipo}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Número de documento</Text>
              <TextInput
                style={styles.input}
                placeholder="123456789"
                value={pseLegalId}
                onChangeText={(t) => setPseLegalId(t.replace(/\D/g, '').slice(0, 15))}
                keyboardType="numeric"
                maxLength={15}
                returnKeyType="next"
              />

              <Text style={styles.inputLabel}>Celular</Text>
              <TextInput
                style={styles.input}
                placeholder="3001234567"
                value={psePhone}
                onChangeText={(t) => setPsePhone(t.replace(/\D/g, '').slice(0, 10))}
                keyboardType="phone-pad"
                maxLength={10}
                returnKeyType="done"
              />

              <TouchableOpacity
                style={[styles.payBtn, isProcessing('pse') && styles.payBtnDisabled]}
                onPress={() => { Keyboard.dismiss(); handlePSEPayment(); }}
                disabled={isProcessing('pse')}
                activeOpacity={0.7}
              >
                {isProcessing('pse')
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.payBtnText}>{`Pagar $${effectivePriceCOP.toLocaleString('es-CO')} COP`}</Text>
                }
              </TouchableOpacity>
              <Text style={styles.secureNote}>🔒 Pago seguro procesado por Wompi</Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <LinearGradient colors={['#1a0010', '#880E4F', '#AD1457']} style={styles.gradient} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}>
      <Stack.Screen options={{
        headerShown: true,
        title: showEventMethods ? 'Pagar este evento' : 'Confirma tu asistencia',
        headerBackTitle: 'Atrás',
        headerLeft: () => (
          <TouchableOpacity
            onPress={() => {

              router.back();
            }}
            style={{ paddingHorizontal: 8 }}
          >
            <Text style={{ color: nospiColors.purpleDark, fontSize: 16, fontWeight: '500' }}>Cancelar</Text>
          </TouchableOpacity>
        ),
      }} />


      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>

        {!showEventMethods ? (
          <>
            <Text style={styles.title}>¿Cómo quieres ir?</Text>
            <Text style={styles.subtitle}>Confirma tu asistencia</Text>

            <TouchableOpacity
              style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 14 }}
              onPress={() => setShowEventMethods(true)}
              activeOpacity={0.85}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Ionicons name="ticket-outline" size={18} color="#1a1a1a" />
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#1a1a1a' }}>Por evento</Text>
              </View>
              <Text style={{ fontSize: 26, fontWeight: '800', color: '#1a1a1a', marginBottom: 4 }}>
                {`$${priceCOP.toLocaleString('es-CO')}`} <Text style={{ fontSize: 13, fontWeight: '400', color: '#9CA3AF' }}>COP / evento</Text>
              </Text>
              <Text style={{ fontSize: 13, color: '#6B7280' }}>Pagas cada vez que vengas a un evento.</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{ backgroundColor: '#fff', borderRadius: 16, borderWidth: 2, borderColor: nospiColors.purpleMid, padding: 20, marginBottom: 14, position: 'relative' }}
              onPress={() => router.push('/subscription-membership?startCardForm=1')}
              activeOpacity={0.85}
            >
              <View style={{ position: 'absolute', top: -11, left: 16, backgroundColor: nospiColors.purplePale, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: nospiColors.purpleDark }}>Recomendado</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, marginTop: 4 }}>
                <Ionicons name="ribbon-outline" size={18} color={nospiColors.purpleDark} />
                <Text style={{ fontSize: 15, fontWeight: '700', color: nospiColors.purpleDark }}>Suscripción mensual Nospi</Text>
              </View>
              <Text style={{ fontSize: 26, fontWeight: '800', color: '#1a1a1a', marginBottom: 4 }}>
                {`$${subscriptionPriceCOP.toLocaleString('es-CO')}`} <Text style={{ fontSize: 13, fontWeight: '400', color: '#9CA3AF' }}>COP / mes</Text>
              </Text>
              <Text style={{ fontSize: 13, color: '#6B7280', marginBottom: 12 }}>Eventos ilimitados, todos los que hagamos este mes.</Text>

              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <Text style={{ color: nospiColors.purpleMid, fontSize: 14, marginRight: 8 }}>✓</Text>
                <Text style={{ fontSize: 13, color: '#374151' }}>Acceso sin límite a todos los eventos del mes</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <Text style={{ color: nospiColors.purpleMid, fontSize: 14, marginRight: 8 }}>✓</Text>
                <Text style={{ fontSize: 13, color: '#374151' }}>Sin pagar cada evento por separado</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <Text style={{ color: nospiColors.purpleMid, fontSize: 14, marginRight: 8 }}>✓</Text>
                <Text style={{ fontSize: 13, color: '#374151' }}>Cancela cuando quieras</Text>
              </View>

              <Text style={{ fontSize: 12, color: nospiColors.purpleMid, fontWeight: '700', marginBottom: 4 }}>
                {`Te conviene si vas a ${breakEvenEventsCOP}+ eventos al mes`}
              </Text>
            </TouchableOpacity>

            {!promoApplied && !showPromoInput && (
              <TouchableOpacity
                onPress={() => setShowPromoInput(true)}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 }}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 14, fontWeight: '500', color: '#fff', textDecorationLine: 'underline' }}>¿Tienes un código promocional?</Text>
              </TouchableOpacity>
            )}

            {showPromoInput && !promoApplied && (
              <View style={{ backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 16, padding: 18, marginTop: 4 }}>
                <Text style={{ fontSize: 12, color: '#666', fontWeight: '500', marginBottom: 8 }}>Código promocional</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    style={{ flex: 1, height: 42, borderRadius: 10, borderWidth: 1.5, borderColor: '#E5E7EB', paddingHorizontal: 12, fontSize: 14, textTransform: 'uppercase' }}
                    placeholder="Ingresa tu código"
                    value={promoCode}
                    onChangeText={(t) => { setPromoCode(t); setPromoError(null); }}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={handleApplyPromoCode}
                    editable={!applyingPromo}
                  />
                  <TouchableOpacity
                    onPress={handleApplyPromoCode}
                    disabled={applyingPromo || !promoCode.trim()}
                    style={{ width: 78, height: 42, borderRadius: 10, backgroundColor: nospiColors.purpleDark, alignItems: 'center', justifyContent: 'center', opacity: applyingPromo || !promoCode.trim() ? 0.6 : 1 }}
                    activeOpacity={0.8}
                  >
                    {applyingPromo ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Aplicar</Text>}
                  </TouchableOpacity>
                </View>
                {!!promoError && (
                  <Text style={{ fontSize: 12, color: '#A32D2D', marginTop: 8 }}>{promoError}</Text>
                )}
              </View>
            )}

            {promoApplied && promoApplied.discountPercent >= 100 && (
              <View style={{ backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 16, padding: 18, marginTop: 4, alignItems: 'center' }}>
                <Text style={{ fontSize: 22, color: nospiColors.purpleMid }}>✓</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: nospiColors.purpleDark, marginTop: 4 }}>Código aplicado</Text>
                <Text style={{ fontSize: 12.5, color: '#666', marginTop: 2, textAlign: 'center' }}>Tu inscripción a este evento queda gratis.</Text>
              </View>
            )}

            {promoApplied && promoApplied.discountPercent < 100 && (
              <View style={{ backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 16, padding: 18, marginTop: 4, alignItems: 'center' }}>
                <Text style={{ fontSize: 22, color: nospiColors.purpleMid }}>✓</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: nospiColors.purpleDark, marginTop: 4 }}>{`Código aplicado — ${promoApplied.discountPercent}% de descuento`}</Text>
                <Text style={{ fontSize: 12.5, color: '#666', marginTop: 2, textAlign: 'center' }}>Se descontará del total al elegir tu método de pago.</Text>
              </View>
            )}
          </>
        ) : (
          <>
        <TouchableOpacity onPress={() => setShowEventMethods(false)} style={{ marginBottom: 12 }}>
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>‹ Volver</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Pagar este evento</Text>
        <Text style={styles.subtitle}>{`$${effectivePriceCOP.toLocaleString('es-CO')} COP · elige tu método`}</Text>

        <Text style={styles.sectionTitle}>¿Cómo quieres pagar?</Text>

        {!loadingBalance && virtualBalance >= effectivePriceCOP && (
          <TouchableOpacity style={styles.paymentBtn} onPress={handlePayWithVirtualBalance} disabled={processing} activeOpacity={0.85}>
            <View style={styles.btnInner}>
              <Text style={styles.btnIcon}>💰</Text>
              <View style={styles.btnTextWrap}>
                <Text style={styles.btnTitle}>Saldo Virtual</Text>
                <Text style={styles.btnSub}>{`Disponible: $${virtualBalance.toLocaleString('es-CO')} COP`}</Text>
              </View>
              {isProcessing('virtual') ? <ActivityIndicator color="#1a1a1a" size="small" /> : <Text style={styles.btnArrow}>›</Text>}
            </View>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.paymentBtn} onPress={() => setShowCardForm(true)} disabled={processing} activeOpacity={0.85}>
          <View style={styles.btnInner}>
            <Text style={styles.btnIcon}>💳</Text>
            <View style={styles.btnTextWrap}>
              <Text style={styles.btnTitle}>Tarjeta de Crédito</Text>
              <Text style={styles.btnSub}>Visa • Mastercard • Amex</Text>
            </View>
            <Text style={styles.btnArrow}>›</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.paymentBtn} onPress={() => setShowNequiForm(true)} disabled={processing} activeOpacity={0.85}>
          <View style={styles.btnInner}>
            <Image source={require('@/assets/images/logo-nequi.png')} style={styles.btnLogo} resizeMode="contain" />
            <View style={styles.btnTextWrap}>
              <Text style={styles.btnTitle}>Nequi</Text>
              <Text style={styles.btnSub}>Sin salir de la app</Text>
            </View>
            <Text style={styles.btnArrow}>›</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.paymentBtn} onPress={handleBancolombiaPayment} disabled={processing} activeOpacity={0.85}>
          <View style={styles.btnInner}>
            <Image source={require('@/assets/images/LogoBancolombia.png')} style={styles.btnLogo} resizeMode="contain" />
            <View style={styles.btnTextWrap}>
              <Text style={styles.btnTitle}>Bancolombia</Text>
              <Text style={styles.btnSub}>Transferencia desde tu app</Text>
            </View>
            {isProcessing('bancolombia') ? <ActivityIndicator color="#1a1a1a" size="small" /> : <Text style={styles.btnArrow}>›</Text>}
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.paymentBtn} onPress={() => { setShowPSEForm(true); loadPSEBanks(); }} disabled={processing} activeOpacity={0.85}>
          <View style={styles.btnInner}>
            <Image source={require('@/assets/images/logo_380.png')} style={styles.btnLogo} resizeMode="contain" />
            <View style={styles.btnTextWrap}>
              <Text style={styles.btnTitle}>PSE</Text>
              <Text style={styles.btnSub}>Todos los bancos colombianos</Text>
            </View>
            {isProcessing('pse') ? <ActivityIndicator color="#1a1a1a" size="small" /> : <Text style={styles.btnArrow}>›</Text>}
          </View>
        </TouchableOpacity>

              {/* ========== TEST BUTTON - controlado desde admin web ========== */}
        {appConfig.test_payment_enabled === 'true' && (
          <TouchableOpacity
            style={testPaymentStyles.btn}
            onPress={handleTestPayment}
            activeOpacity={0.7}
          >
            <Text style={testPaymentStyles.btnText}>🧪 Pago de Prueba (TEST)</Text>
          </TouchableOpacity>
        )}
        {/* ========== END TEST BUTTON ========== */}

				<Text style={styles.secureFooter}>🔒 Pagos seguros procesados por Wompi</Text>
          </>
        )}

      </ScrollView>

      <Modal visible={showSuccessModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.successIcon}>✅</Text>
            <Text style={styles.successTitle}>¡Pago Exitoso!</Text>
            <Text style={styles.successMessage}>Tu asistencia al evento ha sido confirmada</Text>
            <TouchableOpacity style={styles.successButton} onPress={() => { setShowSuccessModal(false); router.replace('/(tabs)/appointments'); }}>
              <Text style={styles.successButtonText}>Ver mis citas</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showSubscriptionConfirmModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.successIcon}>🎟️</Text>
            <Text style={styles.successTitle}>¡Cupo confirmado!</Text>
            <Text style={styles.successMessage}>Tu suscripción cubre este evento — ya tienes tu lugar asegurado</Text>
            <TouchableOpacity style={styles.successButton} onPress={() => { setShowSubscriptionConfirmModal(false); router.replace('/(tabs)/appointments'); }}>
              <Text style={styles.successButtonText}>Ver mis citas</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showPromoConfirmModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.successIcon}>🎟️</Text>
            <Text style={styles.successTitle}>¡Cupo confirmado gratis!</Text>
            <Text style={styles.successMessage}>Tu código promocional cubrió este evento — ya tienes tu lugar asegurado</Text>
            <TouchableOpacity style={styles.successButton} onPress={() => { setShowPromoConfirmModal(false); router.replace('/(tabs)/appointments'); }}>
              <Text style={styles.successButtonText}>Ver mis citas</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Toast />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  container: { flex: 1 },
  contentContainer: { padding: 24, paddingBottom: 60 },
  checkingStatusBanner: {
    backgroundColor: nospiColors.purpleDark,
    paddingVertical: 12,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkingStatusText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  formContainer: { flex: 1, backgroundColor: '#f5f5f5' },
  formContent: { padding: 20, paddingBottom: 120 },
  formCard: { backgroundColor: '#fff', borderRadius: 20, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
  formTitle: { fontSize: 22, fontWeight: '800', color: nospiColors.purpleDark, marginBottom: 4 },
  formAmount: { fontSize: 28, fontWeight: 'bold', color: nospiColors.purpleDark, marginBottom: 20 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#444', marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, padding: 14, fontSize: 16, backgroundColor: '#FAFAFA', color: '#111' },
  cardNumberRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 2, backgroundColor: '#FAFAFA' },
  cardBrandBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 8 },
  cardBrandMark: { width: 44, height: 30, borderRadius: 6, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  cardBrandBadgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  row: { flexDirection: 'row' },
  installmentsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  installmentBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#F9F9F9' },
  installmentBtnSelected: { borderColor: nospiColors.purpleDark, backgroundColor: '#F3E8FF' },
  installmentText: { fontSize: 13, color: '#666', fontWeight: '600' },
  installmentTextSelected: { color: nospiColors.purpleDark },
  payBtn: { backgroundColor: nospiColors.purpleDark, paddingVertical: 18, borderRadius: 14, alignItems: 'center', marginTop: 24 },
  payBtnDisabled: { backgroundColor: '#C4B5FD' },
  payBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  secureNote: { fontSize: 12, color: '#999', textAlign: 'center', marginTop: 12 },
  methodLogoLarge: { width: 120, height: 60, alignSelf: 'center', marginBottom: 12 },
  nequiDescription: { fontSize: 14, color: '#666', lineHeight: 22, marginBottom: 8 },
  waitingContainer: { alignItems: 'center', padding: 16 },
  waitingTitle: { fontSize: 22, fontWeight: '800', color: nospiColors.purpleDark, marginBottom: 12 },
  waitingDesc: { fontSize: 15, color: '#555', textAlign: 'center', lineHeight: 24 },
  waitingHint: { fontSize: 13, color: '#999', marginTop: 12 },
  title: { fontSize: 30, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#FFFFFF', opacity: 0.9, marginBottom: 24, lineHeight: 22 },
  priceCard: { backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 20, padding: 24, marginBottom: 20, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 4 },
  priceLabel: { fontSize: 15, color: '#666', marginBottom: 6 },
  priceAmount: { fontSize: 44, fontWeight: 'bold', color: nospiColors.purpleDark },
  priceAmountCOP: { fontSize: 18, fontWeight: '600', color: nospiColors.purpleMid, marginTop: 4 },
  benefitsCard: { backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 20, marginBottom: 28, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F3E8FF' },
  benefitIcon: { fontSize: 28, marginRight: 16 },
  benefitTextWrap: { flex: 1 },
  benefitTitle: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', marginBottom: 2 },
  benefitDesc: { fontSize: 13, color: '#666', lineHeight: 18 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 14 },
  paymentBtn: { borderRadius: 16, marginBottom: 12, paddingVertical: 16, paddingHorizontal: 18, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E5E7EB', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2 },
  btnInner: { flexDirection: 'row', alignItems: 'center' },
  btnLogo: { width: 44, height: 44, marginRight: 14, borderRadius: 8 },
  btnTextWrap: { flex: 1 },
  btnTitle: { fontSize: 17, fontWeight: '700', color: '#1a1a1a' },
  btnSub: { fontSize: 13, color: '#666', marginTop: 2 },
  btnArrow: { fontSize: 26, color: '#999', fontWeight: '300' },
  btnIcon: { fontSize: 32, marginRight: 14 },
  secureFooter: { fontSize: 13, color: 'rgba(255,255,255,0.8)', textAlign: 'center', marginTop: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalContent: { backgroundColor: '#fff', borderRadius: 24, padding: 40, width: '100%', maxWidth: 400, alignItems: 'center' },
  successIcon: { fontSize: 72, marginBottom: 24 },
  successTitle: { fontSize: 28, fontWeight: 'bold', color: nospiColors.purpleDark, marginBottom: 16, textAlign: 'center' },
  successMessage: { fontSize: 16, color: '#666', textAlign: 'center', lineHeight: 24, marginBottom: 32 },
  successButton: { backgroundColor: nospiColors.purpleDark, paddingVertical: 18, paddingHorizontal: 48, borderRadius: 16, width: '100%', alignItems: 'center' },
  bankPickerContainer: { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, backgroundColor: '#fff', marginTop: 4, marginBottom: 8, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 3 },
  bankOption: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  bankOptionText: { fontSize: 15, color: '#333' },
  successButtonText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});

// ========== TEST BUTTON STYLES - DELETE BEFORE PRODUCTION ==========
const testPaymentStyles = StyleSheet.create({
  btn: {
    backgroundColor: '#1a1a1a',
    borderWidth: 2,
    borderColor: '#ff0',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
    marginHorizontal: 16,
  },
  btnText: {
    color: '#ff0',
    fontWeight: '700',
    fontSize: 16,
  },
});
// ========== END TEST BUTTON STYLES ==========
