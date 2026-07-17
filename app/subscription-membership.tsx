import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, SafeAreaView, TextInput,
  KeyboardAvoidingView, Platform, Keyboard,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { useAppConfig } from '@/contexts/AppConfigContext';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSupabase } from '@/contexts/SupabaseContext';
import { Ionicons } from '@expo/vector-icons';

const WOMPI_PUBLIC_KEY = 'pub_prod_Vvbl4VKr7Gmjd4vIIJQsBWusp4Ijl06L';
const WOMPI_API_URL = 'https://production.wompi.co/v1';
const SUPABASE_URL = 'https://wjdiraurfbawotlcndmk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqZGlyYXVyZmJhd290bGNuZG1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0MDMxMTUsImV4cCI6MjA4NTk3OTExNX0.FxMBafEjIliTDzRBRlnY59i1wEcbIx6u8ZdVf1uxuj8';

// Funciona en web Y en nativo (Alert.alert no funciona en web)
const showAlert = (title: string, message?: string) => {
  if (typeof window !== 'undefined' && !(window as any).ReactNativeWebView) {
    window.alert(title + (message ? '\n\n' + message : ''));
  } else {
    Alert.alert(title, message);
  }
};

const showConfirm = (title: string, message: string, confirmText: string, onConfirm: () => void) => {
  if (typeof window !== 'undefined' && !(window as any).ReactNativeWebView) {
    if (window.confirm(title + '\n\n' + message)) {
      onConfirm();
    }
  } else {
    Alert.alert(title, message, [
      { text: 'Volver', style: 'cancel' },
      { text: confirmText, style: 'destructive', onPress: onConfirm },
    ]);
  }
};

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

interface SubscriptionRow {
  id: string;
  status: string;
  price: number;
  end_date: string;
  next_charge_date: string | null;
  auto_renew: boolean;
}

export default function SubscriptionMembershipScreen() {
  const router = useRouter();
  const { user } = useSupabase();
  const { appConfig } = useAppConfig();
  const { startCardForm } = useLocalSearchParams<{ startCardForm?: string }>();
  const subscriptionPrice = parseInt(appConfig.subscription_price, 10) || 29900;
  const eventPrice = parseInt(appConfig.event_price, 10) || 15000;

  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [showCardForm, setShowCardForm] = useState(startCardForm === '1');
  const [processing, setProcessing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [cardHolder, setCardHolder] = useState('');

  const loadSubscription = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('subscriptions')
      .select('id, status, price, end_date, next_charge_date, auto_renew')
      .eq('user_id', user.id)
      .maybeSingle();
    setSubscription(data as SubscriptionRow | null);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { loadSubscription(); }, [loadSubscription]);

  const isActive = subscription?.status === 'active' && subscription?.end_date && new Date(subscription.end_date) > new Date();

  const getWompiTokens = async () => {
    const res = await fetch(`${WOMPI_API_URL}/merchants/${WOMPI_PUBLIC_KEY}`);
    const data = await res.json();
    return {
      acceptanceToken: data.data?.presigned_acceptance?.acceptance_token,
      personalDataToken: data.data?.presigned_personal_data_auth?.acceptance_token,
    };
  };

  const handleSubscribe = async () => {
    if (!cardNumber || !cardExpiry || !cardCvc || !cardHolder) {
      showAlert('Error', 'Por favor completa todos los datos de la tarjeta.');
      return;
    }
    if (cardHolder.trim().length < 5) {
      showAlert('Error', 'El nombre del titular debe tener al menos 5 caracteres.');
      return;
    }
    setProcessing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const currentUser = session?.user ?? user;
      if (!currentUser) throw new Error('Sesión no encontrada');

      const [expMonthRaw, expYearRaw] = cardExpiry.split('/');
      const expMonth = (expMonthRaw || '').trim();
      const expYearTrimmed = (expYearRaw || '').trim();
      if (!expMonth || !expYearTrimmed) {
        throw new Error('Fecha de vencimiento inválida. Usa el formato MM/AA.');
      }
      const expYearFull = expYearTrimmed.length === 4 ? expYearTrimmed.slice(2) : expYearTrimmed;

      const tokenRes = await fetch(`${WOMPI_API_URL}/tokens/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${WOMPI_PUBLIC_KEY}` },
        body: JSON.stringify({
          number: cardNumber.replace(/\s/g, ''),
          exp_month: expMonth,
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

      const response = await fetch(`${SUPABASE_URL}/functions/v1/wompi-create-subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({
          cardToken,
          acceptanceToken,
          personalDataToken,
          userId: currentUser.id,
          userEmail: currentUser.email || '',
          planType: '1_month',
          redirectUrl: 'https://app.nospi.co/payment-callback',
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        const errorText = typeof result.error === 'string' ? result.error : JSON.stringify(result.error);
        let bankDetail = '';
        try {
          if (result.bankResponse) bankDetail = JSON.stringify(result.bankResponse).slice(0, 600);
        } catch {}
        const fullMsg = [errorText, bankDetail].filter(Boolean).join(' — ');
        throw new Error(fullMsg || 'No se pudo procesar la suscripción');
      }

      if (result.status !== 'APPROVED') {
        // Estado intermedio: el banco pidió una verificación adicional (3DS) y
        // todavía no se activó la suscripción. No mostramos éxito falso.
        if (result.status === 'PENDING' && result.threeDsUrl && typeof window !== 'undefined') {
          showAlert('Verificación requerida', 'Tu banco pidió una verificación adicional. Te vamos a redirigir para completarla.');
          window.location.href = result.threeDsUrl;
          return;
        }
        showAlert('Pago en verificación', 'Tu pago está siendo verificado por el banco. Si no se activa en unos minutos, intenta de nuevo o usa otra tarjeta.');
        return;
      }

      setShowCardForm(false);
      setCardNumber(''); setCardExpiry(''); setCardCvc(''); setCardHolder('');
      await loadSubscription();

      const pendingEventId = await AsyncStorage.getItem('pending_event_confirmation');
      if (pendingEventId) {
        showAlert('¡Listo!', 'Tu suscripción quedó activa. Vamos a confirmar tu asistencia sin costo.');
        router.replace('/subscription-plans');
      } else {
        showAlert('¡Listo!', 'Tu suscripción quedó activa. Ya puedes ir a todos los eventos del mes.');
      }
    } catch (e: any) {
      showAlert('Error', e.message || 'No se pudo procesar la suscripción');
    } finally {
      setProcessing(false);
    }
  };

  const handleCancel = async () => {
    if (!subscription) return;
    showConfirm(
      'Cancelar suscripción',
      'Dejarás de renovar automáticamente. Conservas el acceso hasta el final del período ya pagado.',
      'Cancelar suscripción',
      async () => {
        setCancelling(true);
        const { error } = await supabase
          .from('subscriptions')
          .update({ auto_renew: false })
          .eq('id', subscription.id);
        setCancelling(false);
        if (error) {
          showAlert('Error', 'No se pudo cancelar. Intenta de nuevo.');
        } else {
          await loadSubscription();
        }
      },
    );
  };

  const breakEvenEvents = Math.ceil(subscriptionPrice / eventPrice);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.centered}><ActivityIndicator size="large" color={nospiColors.purpleMid} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={[nospiColors.gradientDark, nospiColors.gradientMid, nospiColors.gradientLight]} style={StyleSheet.absoluteFill} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Suscripción mensual Nospi</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {isActive && subscription ? (
          <View style={styles.activeCard}>
            <Ionicons name="ribbon" size={40} color={nospiColors.purpleMid} style={{ marginBottom: 10 }} />
            <Text style={styles.activeTitle}>Tu suscripción está activa</Text>
            <Text style={styles.activeSubtitle}>
              Acceso ilimitado hasta el {new Date(subscription.end_date).toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })}
            </Text>
            <Text style={styles.activeSubtitle}>
              {subscription.auto_renew ? 'Se renueva automáticamente cada mes' : 'No se renovará — termina en la fecha indicada'}
            </Text>
            {subscription.auto_renew && (
              <TouchableOpacity style={styles.cancelLink} onPress={handleCancel} disabled={cancelling}>
                {cancelling ? <ActivityIndicator color={nospiColors.error} /> : <Text style={styles.cancelLinkText}>Cancelar renovación automática</Text>}
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <>
            {startCardForm !== '1' && (
              <>
                <Text style={styles.introTitle}>Acceso ilimitado</Text>
                <Text style={styles.introSubtitle}>Ve a todos los eventos del mes sin volver a pagar por separado</Text>
              </>
            )}

            <View style={styles.planCardFeatured}>
              {startCardForm !== '1' && (
                <>
                  <View style={styles.badge}><Text style={styles.badgeText}>Recomendado</Text></View>
                  <View style={styles.planHeaderRow}>
                    <Ionicons name="ribbon-outline" size={20} color={nospiColors.purpleMid} />
                    <Text style={styles.planName}>Suscripción mensual Nospi</Text>
                  </View>
                  <Text style={styles.planPrice}>${subscriptionPrice.toLocaleString('es-CO')} <Text style={styles.planPriceUnit}>COP / mes</Text></Text>
                  <Text style={styles.planDesc}>Eventos ilimitados, todos los que hagamos este mes.</Text>

                  <View style={styles.featureRow}><Ionicons name="checkmark" size={16} color={nospiColors.purpleMid} /><Text style={styles.featureText}>Acceso sin límite a todos los eventos del mes</Text></View>
                  <View style={styles.featureRow}><Ionicons name="checkmark" size={16} color={nospiColors.purpleMid} /><Text style={styles.featureText}>Sin pagar cada evento por separado</Text></View>
                  <View style={styles.featureRow}><Ionicons name="checkmark" size={16} color={nospiColors.purpleMid} /><Text style={styles.featureText}>Cancela cuando quieras</Text></View>

                  <Text style={styles.breakEvenText}>Te conviene si vas a {breakEvenEvents}+ eventos al mes</Text>
                </>
              )}

              {startCardForm === '1' && (
                <Text style={[styles.planPrice, { marginBottom: 14 }]}>
                  ${subscriptionPrice.toLocaleString('es-CO')} <Text style={styles.planPriceUnit}>COP / mes</Text>
                </Text>
              )}

              {!showCardForm ? (
                <TouchableOpacity style={styles.subscribeButton} onPress={() => setShowCardForm(true)} activeOpacity={0.85}>
                  <Text style={styles.subscribeButtonText}>Suscribirme</Text>
                </TouchableOpacity>
              ) : (
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                  <View style={styles.cardNumberRow}>
                    <TextInput
                      style={[styles.input, styles.cardNumberInput]}
                      placeholder="Número de tarjeta"
                      placeholderTextColor={nospiColors.gray400}
                      keyboardType="number-pad"
                      value={cardNumber}
                      onChangeText={(t) => { const digits = t.replace(/\D/g, '').slice(0, 16); setCardNumber(digits.replace(/(.{4})/g, '$1 ').trim()); }}
                      maxLength={19}
                      autoComplete="cc-number"
                      textContentType="creditCardNumber"
                      importantForAutofill="yes"
                    />
                    {(() => {
                      const brand = getCardBrand(cardNumber.replace(/\s/g, ''));
                      if (!brand) return null;
                      return (
                        <View style={[styles.cardBrandBadge, { backgroundColor: CARD_BRAND_COLORS[brand] }]}>
                          <Text style={styles.cardBrandBadgeText}>{CARD_BRAND_LABELS[brand]}</Text>
                        </View>
                      );
                    })()}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      placeholder="MM/AA"
                      placeholderTextColor={nospiColors.gray400}
                      value={cardExpiry}
                      onChangeText={(t) => { const digits = t.replace(/\D/g, '').slice(0, 4); setCardExpiry(digits.length >= 2 ? digits.slice(0, 2) + '/' + digits.slice(2) : digits); }}
                      keyboardType="number-pad"
                      maxLength={5}
                      autoComplete="cc-exp"
                      importantForAutofill="yes"
                    />
                    <TextInput style={[styles.input, { flex: 1 }]} placeholder="CVC" placeholderTextColor={nospiColors.gray400} keyboardType="number-pad" maxLength={4} value={cardCvc} onChangeText={setCardCvc} autoComplete="cc-csc" importantForAutofill="yes" />
                  </View>
                  <TextInput style={styles.input} placeholder="Nombre del titular" placeholderTextColor={nospiColors.gray400} value={cardHolder} onChangeText={setCardHolder} autoComplete="cc-name" importantForAutofill="yes" />
                  <TouchableOpacity
                    style={styles.subscribeButton}
                    onPress={() => { Keyboard.dismiss(); handleSubscribe(); }}
                    disabled={processing}
                    activeOpacity={0.85}
                  >
                    {processing
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={styles.subscribeButtonText}>Pagar ${subscriptionPrice.toLocaleString('es-CO')} y activar</Text>}
                  </TouchableOpacity>
                </KeyboardAvoidingView>
              )}
            </View>

            <Text style={styles.footnote}>Renovación automática mensual. Cancela cuando quieras desde tu perfil.</Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: nospiColors.gradientDark },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  scrollContent: { padding: 20, paddingBottom: 60 },
  introTitle: { fontSize: 24, fontWeight: '800', color: '#fff', textAlign: 'center', marginTop: 8 },
  introSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.75)', textAlign: 'center', marginBottom: 24 },
  planCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 14 },
  planCardFeatured: { backgroundColor: '#fff', borderRadius: 16, padding: 20, borderWidth: 2, borderColor: nospiColors.purpleMid, position: 'relative' },
  badge: { position: 'absolute', top: -12, left: 16, backgroundColor: nospiColors.purplePale, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 12, fontWeight: '700', color: nospiColors.purpleDark },
  planHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, marginTop: 4 },
  planName: { fontSize: 15, fontWeight: '700', color: nospiColors.gray900 },
  planPrice: { fontSize: 26, fontWeight: '800', color: nospiColors.gray900, marginBottom: 4 },
  planPriceUnit: { fontSize: 13, fontWeight: '500', color: nospiColors.gray400 },
  planDesc: { fontSize: 13, color: nospiColors.gray500, marginBottom: 12 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  featureText: { fontSize: 13, color: nospiColors.gray700 },
  breakEvenText: { fontSize: 12, color: nospiColors.purpleMid, fontWeight: '700', marginTop: 8, marginBottom: 14 },
  subscribeButton: { backgroundColor: nospiColors.purpleMid, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 6 },
  subscribeButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  input: { backgroundColor: nospiColors.gray50, borderWidth: 1, borderColor: nospiColors.gray200, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, marginBottom: 10, color: nospiColors.gray900 },
  cardNumberRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: nospiColors.gray200, borderRadius: 10, paddingHorizontal: 14, marginBottom: 10, backgroundColor: nospiColors.gray50 },
  cardNumberInput: { flex: 1, borderWidth: 0, marginBottom: 0, paddingHorizontal: 0, backgroundColor: 'transparent' },
  cardBrandBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 8 },
  cardBrandBadgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  footnote: { fontSize: 12, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginTop: 18 },
  activeCard: { backgroundColor: '#fff', borderRadius: 20, padding: 28, alignItems: 'center', marginTop: 40 },
  activeTitle: { fontSize: 18, fontWeight: '800', color: nospiColors.gray900, marginBottom: 8, textAlign: 'center' },
  activeSubtitle: { fontSize: 13, color: nospiColors.gray500, textAlign: 'center', marginBottom: 4 },
  cancelLink: { marginTop: 20 },
  cancelLinkText: { color: nospiColors.error, fontSize: 13, fontWeight: '600' },
});
