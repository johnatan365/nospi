import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Modal, Alert, SafeAreaView, AppState,
  Image, TextInput, KeyboardAvoidingView, Platform, Keyboard
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors, PRECIO_EVENTO_COP } from '@/constants/Colors';
import { useRouter, Stack, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useSupabase } from '@/contexts/SupabaseContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';

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

export default function SubscriptionPlansScreen() {
  const router = useRouter();
  const { user } = useSupabase();

  const [processingMethod, setProcessingMethod] = useState<string | null>(null);
  const processing = processingMethod !== null;
  const isProcessing = (m: string) => processingMethod === m;

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [virtualBalance, setVirtualBalance] = useState(0);
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [userProfile, setUserProfile] = useState<{ email: string; name: string } | null>(null);

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
  const [showBankPicker, setShowBankPicker] = useState(false);

  const PSE_BANKS = [
    { code: '1040', name: 'Banco Agrario' },
    { code: '1052', name: 'Banco AV Villas' },
    { code: '1032', name: 'Banco Caja Social' },
    { code: '1004', name: 'Bancolombia' },
    { code: '1059', name: 'Bancamía' },
    { code: '1013', name: 'BBVA Colombia' },
    { code: '1006', name: 'Davivienda' },
    { code: '1801', name: 'Daviplata' },
    { code: '1051', name: 'Banco de Bogotá' },
    { code: '1009', name: 'Banco de Occidente' },
    { code: '1062', name: 'Banco Falabella' },
    { code: '1069', name: 'Banco Finandina' },
    { code: '1022', name: 'Itaú' },
    { code: '1637', name: 'IRIS' },
    { code: '1507', name: 'Nequi' },
    { code: '1060', name: 'Banco Pichincha' },
    { code: '1002', name: 'Banco Popular' },
    { code: '1019', name: 'Scotiabank Colpatria' },
    { code: '1065', name: 'Banco Santander Colombia' },
    { code: '1247', name: 'Banco Mundo Mujer' },
    { code: '1066', name: 'Banco Cooperativo Coopcentral' },
    { code: '1292', name: 'Confiar Cooperativa Financiera' },
    { code: '1303', name: 'Coofinep Cooperativa Financiera' },
    { code: '1289', name: 'Cotrafa Cooperativa Financiera' },
    { code: '1370', name: 'Coltefinanciera' },
    { code: '1283', name: 'CFA Cooperativa Financiera' },
    { code: '1558', name: 'Banco Credifinanciera' },
    { code: '1063', name: 'Banco Fincomercio' },
  ];

  const priceCOP = PRECIO_EVENTO_COP;

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

  const { payment_status, transaction_id: urlTransactionId } = useLocalSearchParams<{ payment_status?: string, transaction_id?: string }>();

  // Handle return from Bancolombia/PSE web redirect
  useEffect(() => {
    if (payment_status === 'success') {
      const handleWebPaymentReturn = async () => {
        // transactionId viene del parámetro URL (capturado por nospi-redirect desde Wompi)
        // o del localStorage (web) — en nativo ya no dependemos de esto
        let transactionId = (urlTransactionId as string)
          || (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage
              ? window.localStorage.getItem('wompi_transaction_id')
              : null)
          || await AsyncStorage.getItem('wompi_transaction_id');

        const cleanup = async () => {
          await AsyncStorage.removeItem('pse_payment_pending');
          await AsyncStorage.removeItem('wompi_transaction_id');
          if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.removeItem('pse_payment_pending');
            window.localStorage.removeItem('wompi_transaction_id');
          }
        };

        if (!transactionId) {
          // Sin transactionId — confirmar cita directamente (Wompi ya confirmó con payment_status=success)
          await cleanup();
          try { await supabase.auth.refreshSession(); } catch {}
          await confirmAppointment();
          setShowSuccessModal(true);
          return;
        }

        // Verificar estado con Wompi
        try {
          const res = await fetch(`${WOMPI_API_URL}/transactions/${transactionId}`);
          const data = await res.json();
          const status = data.data?.status;

          if (status === 'APPROVED') {
            await cleanup();
            try { await supabase.auth.refreshSession(); } catch {}
            await confirmAppointment();
            setShowSuccessModal(true);
          } else if (status === 'PENDING' || !status) {
            // Pago pendiente — confirmar igualmente porque Wompi redirigió con success
            await cleanup();
            try { await supabase.auth.refreshSession(); } catch {}
            await confirmAppointment();
            setShowSuccessModal(true);
          } else {
            await cleanup();
            showAlert('Pago no completado', 'El pago no fue aprobado.');
          }
        } catch (e) {
          // Error de red — confirmar igualmente porque Wompi redirigió con success
          await cleanup();
          try { await supabase.auth.refreshSession(); } catch {}
          await confirmAppointment();
          setShowSuccessModal(true);
        }
      };
      handleWebPaymentReturn();
    }
  }, [payment_status]);

  useEffect(() => {
    let appWasBackground = false;
    const handleAppStateChange = async (nextState: string) => {
      if (nextState === 'background' || nextState === 'inactive') {
        appWasBackground = true;
      } else if (nextState === 'active' && appWasBackground) {
        appWasBackground = false;
        const pending = await AsyncStorage.getItem('pse_payment_pending');
        if (pending !== 'true') return;

        // Verify transaction before confirming
        const transactionId = await AsyncStorage.getItem('wompi_transaction_id');
        if (transactionId) {
          try {
            const res = await fetch(`${WOMPI_API_URL}/transactions/${transactionId}`);
            const data = await res.json();
            const status = data.data?.status;
            if (status !== 'APPROVED') {
              await AsyncStorage.removeItem('pse_payment_pending');
              await AsyncStorage.removeItem('wompi_transaction_id');
              showAlert('Pago no completado', 'El pago no fue aprobado.');
              return;
            }
          } catch (e) {
            console.error('Error verifying transaction on AppState:', e);
          }
        }

        await AsyncStorage.removeItem('pse_payment_pending');
        await AsyncStorage.removeItem('wompi_transaction_id');
        try { await supabase.auth.refreshSession(); } catch {}
        await confirmAppointment();
        setShowSuccessModal(true);
      }
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, []);

  const confirmAppointment = async () => {
    try {
      const pendingEventId = await AsyncStorage.getItem('pending_event_confirmation');
      if (!pendingEventId) return;
      // Get user from session directly in case context hasn't loaded yet
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id || user?.id;
      if (!userId) { console.error('confirmAppointment: no userId'); return; }
      const { data: existing } = await supabase.from('appointments').select('id').eq('user_id', userId).eq('event_id', pendingEventId).maybeSingle();
      if (!existing) {
        await supabase.from('appointments').insert({ user_id: userId, event_id: pendingEventId, status: 'confirmada', payment_status: 'completed' });
        await AsyncStorage.setItem('should_check_notification_prompt', 'true');
      }
      await AsyncStorage.removeItem('pending_event_confirmation');
    } catch (e) { console.error('Error confirmando cita:', e); }
  };

  const handleSuccess = async () => {
    await confirmAppointment();
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

  // ─── VIRTUAL BALANCE ─────────────────────────────────────────
  const handlePayWithVirtualBalance = async () => {
    setProcessingMethod('virtual');
    try {
      await supabase.from('users').update({ virtual_balance: virtualBalance - priceCOP }).eq('id', user?.id);
      await handleSuccess();
    } catch { showAlert('Error', 'No se pudo procesar el pago con saldo virtual.'); }
    finally { setProcessingMethod(null); }
  };

  // ─── TARJETA ─────────────────────────────────────────────────
  const handleCardPayment = async () => {
    if (!cardNumber || !cardExpiry || !cardCvc || !cardHolder) {
      showAlert('Error', 'Por favor completa todos los datos de la tarjeta.');
      return;
    }
    if (cardHolder.trim().length < 5) {
      showAlert('Error', 'El nombre del titular debe tener al menos 5 caracteres.');
      return;
    }
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
        body: JSON.stringify({ cardToken, acceptanceToken, personalDataToken, installments: parseInt(cardInstallments), amountCOP: priceCOP, userEmail: userProfile?.email || currentUser.email || '', userId: currentUser.id, eventId: pendingEventId }),
      });
      const result = await response.json();
      if (!response.ok || result.error) throw new Error(result.error || 'Error al procesar el pago');

      if (result.status === 'APPROVED' || result.status === 'PENDING') {
        setShowCardForm(false);
        await handleSuccess();
      } else {
        throw new Error('Pago rechazado. Intenta con otra tarjeta.');
      }
    } catch (error: any) {
      showAlert('Error en tarjeta', error.message);
    } finally { setProcessingMethod(null); }
  };

  // ─── NEQUI ───────────────────────────────────────────────────
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
        body: JSON.stringify({ phoneNumber: cleanPhone, acceptanceToken, personalDataToken, amountCOP: priceCOP, userEmail: userProfile?.email || currentUser.email || '', userId: currentUser.id, eventId: pendingEventId }),
      });
      const result = await response.json();
      if (!response.ok || result.error) throw new Error(result.error || 'Error al procesar Nequi');

      setNequiStatus('waiting');
      let attempts = 0;
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
            await handleSuccess();
          } else if (['DECLINED', 'ERROR', 'VOIDED'].includes(status) || attempts >= 24) {
            clearInterval(poll);
            setProcessingMethod(null);
            setNequiStatus('idle');
            showAlert(attempts >= 24 ? 'Tiempo agotado' : 'Pago rechazado', attempts >= 24 ? 'No se recibió confirmación de Nequi.' : 'El pago fue rechazado.');
          }
        } catch (e) { if (attempts >= 24) { clearInterval(poll); setProcessingMethod(null); setNequiStatus('idle'); } }
      }, 5000);
    } catch (error: any) {
      showAlert('Error Nequi', error.message);
      setProcessingMethod(null);
    }
  };

  // ─── BANCOLOMBIA ─────────────────────────────────────────────
  const handleBancolombiaPayment = async () => {
    setProcessingMethod('bancolombia');
    try {
      const currentUser = await getSession();
      if (!currentUser) throw new Error('Sesión no encontrada');
      const pendingEventId = await AsyncStorage.getItem('pending_event_confirmation');
      if (!pendingEventId) throw new Error('No se encontró el evento pendiente');

      const { acceptanceToken, personalDataToken } = await getWompiTokens();
      if (!acceptanceToken) throw new Error('No se pudo obtener token de aceptación');

      const response = await fetch(`${SUPABASE_URL}/functions/v1/wompi-bancolombia-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ acceptanceToken, personalDataToken, amountCOP: priceCOP, userEmail: userProfile?.email || currentUser.email || '', userId: currentUser.id, eventId: pendingEventId }),
      });
      const result = await response.json();
      if (!response.ok || result.error) throw new Error(result.error || 'Error al procesar Bancolombia');

      // Guardar transactionId antes de abrir navegador
      const bancolombiaTransactionId = result.transactionId;
      await AsyncStorage.setItem('pse_payment_pending', 'true');
      await AsyncStorage.setItem('wompi_transaction_id', bancolombiaTransactionId);
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('pse_payment_pending', 'true');
        window.localStorage.setItem('wompi_transaction_id', bancolombiaTransactionId);
      }

      // Abrir URL de Bancolombia en navegador externo
      await Linking.openURL(result.redirectUrl);

      // En nativo: iniciar polling para detectar cuando el pago sea aprobado
      // (AppState puede no dispararse en Expo Go)
      if (Platform.OS !== 'web' && bancolombiaTransactionId) {
        let pollAttempts = 0;
        const maxAttempts = 24; // 2 minutos
        const pollInterval = setInterval(async () => {
          pollAttempts++;
          try {
            const pending = await AsyncStorage.getItem('pse_payment_pending');
            if (pending !== 'true') { clearInterval(pollInterval); return; }

            const res = await fetch(`${WOMPI_API_URL}/transactions/${bancolombiaTransactionId}`);
            const data = await res.json();
            const status = data.data?.status;

            if (status === 'APPROVED') {
              clearInterval(pollInterval);
              await AsyncStorage.removeItem('pse_payment_pending');
              await AsyncStorage.removeItem('wompi_transaction_id');
              try { await supabase.auth.refreshSession(); } catch {}
              await confirmAppointment();
              setProcessingMethod(null);
              setShowSuccessModal(true);
            } else if (['DECLINED', 'ERROR', 'VOIDED'].includes(status) || pollAttempts >= maxAttempts) {
              clearInterval(pollInterval);
              await AsyncStorage.removeItem('pse_payment_pending');
              await AsyncStorage.removeItem('wompi_transaction_id');
              setProcessingMethod(null);
              if (pollAttempts < maxAttempts) {
                showAlert('Pago no completado', 'El pago fue rechazado o cancelado.');
              }
            }
          } catch (e) {
            if (pollAttempts >= maxAttempts) {
              clearInterval(pollInterval);
              setProcessingMethod(null);
            }
          }
        }, 5000);
      }
    } catch (error: any) {
      showAlert('Error Bancolombia', error.message);
    } finally { setProcessingMethod(null); }
  };

  // ─── PSE ─────────────────────────────────────────────────────
  const handlePSEPayment = async () => {
    const cleanPhone = psePhone.replace(/\D/g, '');
    const cleanLegalId = pseLegalId.replace(/\D/g, '');
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

      const response = await fetch(`${SUPABASE_URL}/functions/v1/wompi-pse-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({
          acceptanceToken,
          personalDataToken,
          amountCOP: priceCOP,
          userEmail: userProfile?.email || currentUser.email || '',
          userId: currentUser.id,
          eventId: pendingEventId,
          userFullName: userProfile?.name || currentUser.email || '',
          userPhone: cleanPhone,
          userLegalId: cleanLegalId,
          userLegalIdType: pseLegalIdType,
          financialInstitutionCode: pseBankCode,
        }),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || 'Error al crear pago PSE');
      if (!data.redirectUrl) throw new Error('No se obtuvo URL de pago PSE');

      await AsyncStorage.setItem('pse_payment_pending', 'true');
      await AsyncStorage.setItem('wompi_transaction_id', data.transactionId);
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('pse_payment_pending', 'true');
        window.localStorage.setItem('wompi_transaction_id', data.transactionId);
      }
      await Linking.openURL(data.redirectUrl);

      // Polling igual que Bancolombia
      if (Platform.OS !== 'web' && data.transactionId) {
        let pollAttempts = 0;
        const maxAttempts = 24;
        const pollInterval = setInterval(async () => {
          pollAttempts++;
          try {
            const pending = await AsyncStorage.getItem('pse_payment_pending');
            if (pending !== 'true') { clearInterval(pollInterval); return; }
            const res = await fetch(`${WOMPI_API_URL}/transactions/${data.transactionId}`);
            const txData = await res.json();
            const status = txData.data?.status;
            if (status === 'APPROVED') {
              clearInterval(pollInterval);
              await AsyncStorage.removeItem('pse_payment_pending');
              await AsyncStorage.removeItem('wompi_transaction_id');
              try { await supabase.auth.refreshSession(); } catch {}
              await confirmAppointment();
              setProcessingMethod(null);
              setShowSuccessModal(true);
            } else if (['DECLINED', 'ERROR', 'VOIDED'].includes(status) || pollAttempts >= maxAttempts) {
              clearInterval(pollInterval);
              await AsyncStorage.removeItem('pse_payment_pending');
              await AsyncStorage.removeItem('wompi_transaction_id');
              setProcessingMethod(null);
              if (pollAttempts < maxAttempts) showAlert('Pago no completado', 'El pago fue rechazado o cancelado.');
            }
          } catch (e) {
            if (pollAttempts >= maxAttempts) { clearInterval(pollInterval); setProcessingMethod(null); }
          }
        }, 5000);
      }
    } catch (error: any) {
      showAlert('Error PSE', error.message);
    } finally { setProcessingMethod(null); }
  };

  // ─── CARD FORM ────────────────────────────────────────────────
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
              <Text style={styles.formAmount}>{`$${priceCOP.toLocaleString('es-CO')} COP`}</Text>
              <Text style={styles.inputLabel}>Nombre del titular</Text>
              <TextInput style={styles.input} placeholder="Como aparece en la tarjeta" value={cardHolder} onChangeText={setCardHolder} autoCapitalize="characters" returnKeyType="next" />
              <Text style={styles.inputLabel}>Número de tarjeta</Text>
              <TextInput style={styles.input} placeholder="0000 0000 0000 0000" value={cardNumber}
                onChangeText={(t) => { const c = t.replace(/\D/g, '').slice(0, 16); setCardNumber(c.replace(/(.{4})/g, '$1 ').trim()); }}
                keyboardType="numeric" maxLength={19} returnKeyType="next" />
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
                {isProcessing('card') ? <ActivityIndicator color="#fff" /> : <Text style={styles.payBtnText}>{`Pagar $${priceCOP.toLocaleString('es-CO')} COP`}</Text>}
              </TouchableOpacity>
              <Text style={styles.secureNote}>🔒 Pago seguro procesado por Wompi</Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ─── NEQUI FORM ───────────────────────────────────────────────
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
                <Text style={styles.formAmount}>{`$${priceCOP.toLocaleString('es-CO')} COP`}</Text>
                <Text style={styles.nequiDescription}>Ingresa tu número de celular registrado en Nequi. Recibirás una notificación push para aprobar el pago.</Text>
                <Text style={styles.inputLabel}>Número de celular Nequi</Text>
                <TextInput style={styles.input} placeholder="3001234567" value={nequiPhone}
                  onChangeText={(t) => setNequiPhone(t.replace(/\D/g, '').slice(0, 10))}
                  keyboardType="phone-pad" maxLength={10} />
                <TouchableOpacity
                  style={[styles.payBtn, { backgroundColor: '#7C3AED' }, isProcessing('nequi') && styles.payBtnDisabled]}
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
                <Text style={styles.waitingDesc}>Aprueba el pago de <Text style={{ fontWeight: 'bold' }}>{`$${priceCOP.toLocaleString('es-CO')} COP`}</Text> desde tu app Nequi.</Text>
                <ActivityIndicator size="large" color="#7C3AED" style={{ marginTop: 24 }} />
                <Text style={styles.waitingHint}>Esperando confirmación...</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── PSE FORM ─────────────────────────────────────────────────
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
              <Text style={styles.formAmount}>{`$${priceCOP.toLocaleString('es-CO')} COP`}</Text>

              <Text style={styles.inputLabel}>Banco</Text>
              <TouchableOpacity
                style={[styles.input, { justifyContent: 'center' }]}
                onPress={() => setShowBankPicker(true)}
              >
                <Text style={{ fontSize: 16, color: pseBankName ? '#111' : '#aaa' }}>
                  {pseBankName || 'Selecciona tu banco'}
                </Text>
              </TouchableOpacity>

              {showBankPicker && (
                <View style={styles.bankPickerContainer}>
                  <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled>
                    {PSE_BANKS.map((bank) => (
                      <TouchableOpacity
                        key={bank.code + bank.name}
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
                  : <Text style={styles.payBtnText}>{`Pagar $${priceCOP.toLocaleString('es-CO')} COP`}</Text>
                }
              </TouchableOpacity>
              <Text style={styles.secureNote}>🔒 Pago seguro procesado por Wompi</Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ─── PANTALLA PRINCIPAL ───────────────────────────────────────
  return (
    <LinearGradient colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]} style={styles.gradient} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}>
      <Stack.Screen options={{ headerShown: true, title: 'Pago del Evento', headerBackTitle: 'Atrás' }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>

        <Text style={styles.title}>Pago del Evento</Text>
        <Text style={styles.subtitle}>{`Confirma tu asistencia pagando $${priceCOP.toLocaleString('es-CO')} COP`}</Text>

        <View style={styles.priceCard}>
          <Text style={styles.priceLabel}>Total a pagar</Text>
          <Text style={styles.priceAmount}>{`$${priceCOP.toLocaleString('es-CO')}`}</Text>
          <Text style={styles.priceAmountCOP}>Pesos colombianos</Text>
        </View>

        <View style={styles.benefitsCard}>
          <View style={styles.benefitRow}>
            <Text style={styles.benefitIcon}>🌟</Text>
            <View style={styles.benefitTextWrap}>
              <Text style={styles.benefitTitle}>Acceso al evento</Text>
              <Text style={styles.benefitDesc}>Confirma tu lugar en el evento seleccionado</Text>
            </View>
          </View>
          <View style={styles.benefitRow}>
            <Text style={styles.benefitIcon}>🎉</Text>
            <View style={styles.benefitTextWrap}>
              <Text style={styles.benefitTitle}>Conoce gente nueva</Text>
              <Text style={styles.benefitDesc}>Conecta con personas afines en un ambiente relajado.</Text>
            </View>
          </View>
          <View style={[styles.benefitRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.benefitIcon}>💜</Text>
            <View style={styles.benefitTextWrap}>
              <Text style={styles.benefitTitle}>Experiencia única</Text>
              <Text style={styles.benefitDesc}>Disfruta de una experiencia social inolvidable.</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>¿Cómo quieres pagar?</Text>

        {!loadingBalance && virtualBalance >= priceCOP && (
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

        <TouchableOpacity style={styles.paymentBtn} onPress={() => setShowPSEForm(true)} disabled={processing} activeOpacity={0.85}>
          <View style={styles.btnInner}>
            <Image source={require('@/assets/images/logo_380.png')} style={styles.btnLogo} resizeMode="contain" />
            <View style={styles.btnTextWrap}>
              <Text style={styles.btnTitle}>PSE</Text>
              <Text style={styles.btnSub}>Todos los bancos colombianos</Text>
            </View>
            {isProcessing('pse') ? <ActivityIndicator color="#1a1a1a" size="small" /> : <Text style={styles.btnArrow}>›</Text>}
          </View>
        </TouchableOpacity>

        <Text style={styles.secureFooter}>🔒 Pagos seguros procesados por Wompi</Text>
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
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  container: { flex: 1 },
  contentContainer: { padding: 24, paddingBottom: 60 },
  formContainer: { flex: 1, backgroundColor: '#f5f5f5' },
  formContent: { padding: 20, paddingBottom: 120 },
  formCard: { backgroundColor: '#fff', borderRadius: 20, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
  formTitle: { fontSize: 22, fontWeight: '800', color: nospiColors.purpleDark, marginBottom: 4 },
  formAmount: { fontSize: 28, fontWeight: 'bold', color: nospiColors.purpleDark, marginBottom: 20 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#444', marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, padding: 14, fontSize: 16, backgroundColor: '#FAFAFA', color: '#111' },
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
  title: { fontSize: 30, fontWeight: 'bold', color: nospiColors.purpleDark, marginBottom: 8 },
  subtitle: { fontSize: 15, color: nospiColors.purpleDark, opacity: 0.8, marginBottom: 24, lineHeight: 22 },
  priceCard: { backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 20, padding: 24, marginBottom: 20, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 4 },
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