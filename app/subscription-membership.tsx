import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, SafeAreaView, TextInput,
  KeyboardAvoidingView, Platform, Keyboard,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { useAppConfig } from '@/contexts/AppConfigContext';
import { useRouter, Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSupabase } from '@/contexts/SupabaseContext';
import { Ionicons } from '@expo/vector-icons';

const WOMPI_PUBLIC_KEY = 'pub_prod_Vvbl4VKr7Gmjd4vIIJQsBWusp4Ijl06L';
const WOMPI_API_URL = 'https://production.wompi.co/v1';
const SUPABASE_URL = 'https://wjdiraurfbawotlcndmk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqZGlyYXVyZmJhd290bGNuZG1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0MDMxMTUsImV4cCI6MjA4NTk3OTExNX0.FxMBafEjIliTDzRBRlnY59i1wEcbIx6u8ZdVf1uxuj8';

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
  const subscriptionPrice = parseInt(appConfig.subscription_price, 10) || 29900;
  const eventPrice = parseInt(appConfig.event_price, 10) || 15000;

  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [showCardForm, setShowCardForm] = useState(false);
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
      Alert.alert('Error', 'Por favor completa todos los datos de la tarjeta.');
      return;
    }
    if (cardHolder.trim().length < 5) {
      Alert.alert('Error', 'El nombre del titular debe tener al menos 5 caracteres.');
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
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo procesar la suscripción');

      setShowCardForm(false);
      setCardNumber(''); setCardExpiry(''); setCardCvc(''); setCardHolder('');
      await loadSubscription();

      const pendingEventId = await AsyncStorage.getItem('pending_event_confirmation');
      if (pendingEventId) {
        Alert.alert('¡Listo!', 'Tu suscripción quedó activa. Vamos a confirmar tu asistencia sin costo.', [
          { text: 'Continuar', onPress: () => router.replace('/subscription-plans') },
        ]);
      } else {
        Alert.alert('¡Listo!', 'Tu suscripción quedó activa. Ya puedes ir a todos los eventos del mes.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo procesar la suscripción');
    } finally {
      setProcessing(false);
    }
  };

  const handleCancel = async () => {
    if (!subscription) return;
    Alert.alert(
      'Cancelar suscripción',
      'Dejarás de renovar automáticamente. Conservas el acceso hasta el final del período ya pagado.',
      [
        { text: 'Volver', style: 'cancel' },
        {
          text: 'Cancelar suscripción',
          style: 'destructive',
          onPress: async () => {
            setCancelling(true);
            const { error } = await supabase
              .from('subscriptions')
              .update({ auto_renew: false })
              .eq('id', subscription.id);
            setCancelling(false);
            if (error) {
              Alert.alert('Error', 'No se pudo cancelar. Intenta de nuevo.');
            } else {
              await loadSubscription();
            }
          },
        },
      ],
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
            <Text style={styles.introTitle}>Acceso ilimitado</Text>
            <Text style={styles.introSubtitle}>Ve a todos los eventos del mes sin volver a pagar por separado</Text>

            <View style={styles.planCardFeatured}>
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

              {!showCardForm ? (
                <TouchableOpacity style={styles.subscribeButton} onPress={() => setShowCardForm(true)} activeOpacity={0.85}>
                  <Text style={styles.subscribeButtonText}>Suscribirme</Text>
                </TouchableOpacity>
              ) : (
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                  <TextInput style={styles.input} placeholder="Número de tarjeta" placeholderTextColor={nospiColors.gray400} keyboardType="number-pad" value={cardNumber} onChangeText={setCardNumber} autoComplete="cc-number" textContentType="creditCardNumber" importantForAutofill="yes" />
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TextInput style={[styles.input, { flex: 1 }]} placeholder="MM/AA" placeholderTextColor={nospiColors.gray400} value={cardExpiry} onChangeText={setCardExpiry} autoComplete="cc-exp" importantForAutofill="yes" />
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
  footnote: { fontSize: 12, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginTop: 18 },
  activeCard: { backgroundColor: '#fff', borderRadius: 20, padding: 28, alignItems: 'center', marginTop: 40 },
  activeTitle: { fontSize: 18, fontWeight: '800', color: nospiColors.gray900, marginBottom: 8, textAlign: 'center' },
  activeSubtitle: { fontSize: 13, color: nospiColors.gray500, textAlign: 'center', marginBottom: 4 },
  cancelLink: { marginTop: 20 },
  cancelLinkText: { color: nospiColors.error, fontSize: 13, fontWeight: '600' },
});
