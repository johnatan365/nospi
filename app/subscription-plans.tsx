
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
import Toast from 'react-native-toast-message';
import { useFocusEffect } from '@react-navigation/native';

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

// URL de redirección web que Wompi acepta (debe ser HTTPS)
const WEB_REDIRECT_URL = 'https://nospi.vercel.app/payment-callback';

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
  const [checkingPaymentStatus, setCheckingPaymentStatus] = useState(false);

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

  const handlePaymentCallback = useCallback(async (transactionId: string, paymentMethod: 'bancolombia' | 'pse' | 'card' | 'nequi' | 'virtual_balance') => {
    console.log('Payment callback received for transaction:', transactionId, 'method:', paymentMethod);
    
    const cleanup = async () => {
      await AsyncStorage.removeItem('nospi_payment_opened_time');
      await AsyncStorage.removeItem('nospi_payment_method');
      await AsyncStorage.removeItem('nospi_transaction_id');
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem('nospi_payment_opened_time');
        window.localStorage.removeItem('nospi_payment_method');
        window.localStorage.removeItem('nospi_transaction_id');
        window.localStorage.removeItem('nospi_payment_status');
        window.localStorage.removeItem('nospi_payment_time');
      }
    };

    if (!transactionId) {
      console.log('No transaction ID provided');
      await cleanup();
      return;
    }

    try {
      console.log('Verifying transaction status with Wompi:', transactionId);
      const res = await fetch(`${WOMPI_API_URL}/transactions/${transactionId}`);
      const data = await res.json();
      const status = data.data?.status;

      console.log('Wompi transaction status:', status);

      if (status === 'APPROVED') {
        await cleanup();
        try { await supabase.auth.refreshSession(); } catch {}
        const eventId = await AsyncStorage.getItem('pending_event_confirmation');
        await confirmAppointment(transactionId, paymentMethod);
        console.log('Payment approved, navigating to event detail with paymentSuccess');
        if (eventId) {
          router.replace({ pathname: '/event-details/[id]', params: { id: eventId, paymentSuccess: 'true' } });
        } else {
          setShowSuccessModal(true);
        }
      } else if (status === 'PENDING') {
        console.log('Payment is pending, showing info message');
        await cleanup();
        Toast.show({
          type: 'info',
          text1: 'Pago en proceso',
          text2: 'Tu pago está siendo procesado. Te notificaremos cuando se confirme.',
          visibilityTime: 5000,
          position: 'top',
        });
        router.replace('/(tabs)/appointments');
      } else if (status === 'DECLINED') {
        console.log('Payment declined by bank');
        await cleanup();
        showAlert('Pago rechazado', 'El banco rechazó tu pago. Esto puede deberse a fondos insuficientes o límites de transacción. Por favor, inténtalo de nuevo.');
      } else if (status === 'VOIDED') {
        console.log('Payment was canceled by user');
        await cleanup();
        showAlert('Pago cancelado', 'Cancelaste el proceso de pago. Si deseas confirmar tu asistencia al evento, por favor intenta realizar el pago nuevamente.');
      } else if (status === 'ERROR') {
        console.log('Payment had an error');
        await cleanup();
        showAlert('Error en el pago', 'Ocurrió un error al procesar tu pago. Por favor, inténtalo de nuevo o contacta a soporte si el problema persiste.');
      } else {
        console.log('Unknown transaction status:', status);
        await cleanup();
        showAlert('Estado desconocido', 'No se pudo determinar el estado del pago. Por favor, verifica tu cita en la sección de Citas.');
        router.replace('/(tabs)/appointments');
      }
    } catch (e) {
      console.error('Error verifying transaction:', e);
      await cleanup();
      showAlert('Error de verificación', 'No se pudo verificar el estado del pago. Por favor, verifica tu cita en la sección de Citas.');
      router.replace('/(tabs)/appointments');
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      const checkStoredPayment = async () => {
        if (Platform.OS === 'web') return;

        const storedTransactionId = await AsyncStorage.getItem('nospi_transaction_id');
        const storedPaymentMethod = await AsyncStorage.getItem('nospi_payment_method') as 'bancolombia' | 'pse' | 'card' | 'nequi' | 'virtual_balance' | null;
        const storedTime = await AsyncStorage.getItem('nospi_payment_opened_time');

        if (!storedTransactionId || !storedPaymentMethod || !storedTime) return;

        const paymentTime = parseInt(storedTime, 10);
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);

        if (paymentTime <= fiveMinutesAgo) {
          console.log('Stored payment is too old, clearing');
          await AsyncStorage.multiRemove(['nospi_transaction_id', 'nospi_payment_method', 'nospi_payment_opened_time', 'nospi_payment_status']);
          return;
        }

        console.log('useFocusEffect: Found recent payment in AsyncStorage:', { storedTransactionId, storedPaymentMethod });
        setCheckingPaymentStatus(true);
        // Pass copies of the values before clearing so handlePaymentCallback has them
        const txId = storedTransactionId;
        const method = storedPaymentMethod;
        // Clear keys AFTER capturing values — handlePaymentCallback will also call cleanup()
        await handlePaymentCallback(txId, method);
        setCheckingPaymentStatus(false);
      };

      checkStoredPayment();
    }, [handlePaymentCallback])
  );

  // Handle the case where payment-callback.tsx navigated here with payment_status param.
  // The real transaction ID is still in AsyncStorage (payment-callback no longer overwrites it).
  useEffect(() => {
    if (!payment_status) return;
    console.log('URL param payment_status received:', payment_status);

    const handleFromUrlParam = async () => {
      const storedTransactionId = await AsyncStorage.getItem('nospi_transaction_id');
      const storedPaymentMethod = await AsyncStorage.getItem('nospi_payment_method') as 'bancolombia' | 'pse' | 'card' | 'nequi' | 'virtual_balance' | null;
      const storedTime = await AsyncStorage.getItem('nospi_payment_opened_time');

      if (!storedTransactionId || !storedPaymentMethod) {
        console.log('URL param handler: no stored transaction ID or method, skipping');
        return;
      }

      const paymentTime = storedTime ? parseInt(storedTime, 10) : 0;
      const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
      if (paymentTime <= fiveMinutesAgo) {
        console.log('URL param handler: stored payment is too old, clearing');
        await AsyncStorage.multiRemove(['nospi_transaction_id', 'nospi_payment_method', 'nospi_payment_opened_time', 'nospi_payment_status']);
        return;
      }

      console.log('URL param handler: processing stored transaction:', storedTransactionId, 'method:', storedPaymentMethod);
      setCheckingPaymentStatus(true);
      await handlePaymentCallback(storedTransactionId, storedPaymentMethod);
      setCheckingPaymentStatus(false);
    };

    handleFromUrlParam();
  }, [payment_status, handlePaymentCallback]);

  useEffect(() => {
    const handleDeepLink = (event: { url: string }) => {
      console.log('Deep link received:', event.url);
      const url = Linking.parse(event.url);
      const txId = url.queryParams?.transaction_id as string;
      
      if (txId) {
        console.log('Deep link transaction detected');
        const getPaymentMethodAndHandle = async () => {
          const method = await AsyncStorage.getItem('nospi_payment_method') as 'bancolombia' | 'pse' | 'card' | 'nequi' | 'virtual_balance' | null;
          if (method) {
            handlePaymentCallback(txId, method);
          }
        };
        getPaymentMethodAndHandle();
      }
    };

    const subscription = Linking.addEventListener('url', handleDeepLink);

    Linking.getInitialURL().then((url) => {
      if (url) {
        console.log('App opened with URL:', url);
        const parsed = Linking.parse(url);
        const txId = parsed.queryParams?.transaction_id as string;
        
        if (txId) {
          console.log('Initial URL transaction detected');
          const getPaymentMethodAndHandle = async () => {
            const method = await AsyncStorage.getItem('nospi_payment_method') as 'bancolombia' | 'pse' | 'card' | 'nequi' | 'virtual_balance' | null;
            if (method) {
              handlePaymentCallback(txId, method);
            }
          };
          getPaymentMethodAndHandle();
        }
      }
    });

    return () => subscription.remove();
  }, [handlePaymentCallback]);

  useEffect(() => {
    let appWasBackground = false;
    const handleAppStateChange = async (nextState: string) => {
      if (nextState === 'background' || nextState === 'inactive') {
        appWasBackground = true;
      } else if (nextState === 'active' && appWasBackground) {
        appWasBackground = false;

        const transactionId = await AsyncStorage.getItem('nospi_transaction_id');
        const paymentMethod = await AsyncStorage.getItem('nospi_payment_method') as 'bancolombia' | 'pse' | 'card' | 'nequi' | 'virtual_balance' | null;
        const paymentOpenedTime = await AsyncStorage.getItem('nospi_payment_opened_time');

        if (!transactionId || !paymentMethod) return;

        console.log('App returned to foreground after payment, checking status');

        if (paymentOpenedTime && Date.now() - parseInt(paymentOpenedTime, 10) < 3000) {
          console.log('App returned too quickly after opening payment, ignoring immediate status check.');
          return;
        }

        await new Promise(resolve => setTimeout(resolve, 2000));

        await handlePaymentCallback(transactionId, paymentMethod);
      }
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [handlePaymentCallback]);

  const confirmAppointment = async (transactionId: string, paymentMethod: 'bancolombia' | 'pse' | 'card' | 'nequi' | 'virtual_balance') => {
    try {
      console.log('Confirming appointment for transaction:', transactionId, 'method:', paymentMethod);
      const pendingEventId = await AsyncStorage.getItem('pending_event_confirmation');
      if (!pendingEventId) {
        console.log('No pending event ID found');
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id || user?.id;
      if (!userId) { 
        console.error('confirmAppointment: no userId'); 
        return; 
      }
      const { data: existing } = await supabase.from('appointments').select('id').eq('user_id', userId).eq('event_id', pendingEventId).maybeSingle();
      if (!existing) {
        console.log('Creating appointment for event:', pendingEventId);
        await supabase.from('appointments').insert({ 
          user_id: userId, 
          event_id: pendingEventId, 
          status: 'confirmada', 
          payment_status: 'completed' 
        });
        await AsyncStorage.setItem('should_check_notification_prompt', 'true');
      } else {
        console.log('Appointment already exists');
      }
      await AsyncStorage.removeItem('pending_event_confirmation');
    } catch (e) { 
      console.error('Error confirmando cita:', e); 
    }
  };

  const handleSuccess = async () => {
    await confirmAppointment('', 'virtual_balance');
    console.log('Appointment confirmed, showing success modal');
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
      await supabase.from('users').update({ virtual_balance: virtualBalance - priceCOP }).eq('id', user?.id);
      await handleSuccess();
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

      if (result.status === 'APPROVED') {
        setShowCardForm(false);
        await handleSuccess();
      } else if (result.status === 'PENDING') {
        setShowCardForm(false);
        Toast.show({
          type: 'info',
          text1: 'Pago en proceso',
          text2: 'Tu pago está siendo procesado. Te notificaremos cuando se confirme.',
          visibilityTime: 5000,
          position: 'top',
        });
        router.replace('/(tabs)/appointments');
      } else {
        throw new Error('Pago rechazado. Intenta con otra tarjeta.');
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

  const handleBancolombiaPayment = async () => {
    setProcessingMethod('bancolombia');
    try {
      console.log('Starting Bancolombia payment...');
      const currentUser = await getSession();
      if (!currentUser) throw new Error('Sesión no encontrada');
      const pendingEventId = await AsyncStorage.getItem('pending_event_confirmation');
      if (!pendingEventId) throw new Error('No se encontró el evento pendiente');

      const { acceptanceToken, personalDataToken } = await getWompiTokens();
      if (!acceptanceToken) throw new Error('No se pudo obtener token de aceptación');

      console.log('Bancolombia redirect URL:', WEB_REDIRECT_URL);

      const response = await fetch(`${SUPABASE_URL}/functions/v1/wompi-bancolombia-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ 
          acceptanceToken, 
          personalDataToken, 
          amountCOP: priceCOP, 
          userEmail: userProfile?.email || currentUser.email || '', 
          userId: currentUser.id, 
          eventId: pendingEventId,
          redirectUrl: WEB_REDIRECT_URL
        }),
      });
      const result = await response.json();
      if (!response.ok || result.error) throw new Error(result.error || 'Error al procesar Bancolombia');

      console.log('Bancolombia payment created, transaction ID:', result.transactionId);

      const bancolombiaTransactionId = result.transactionId;
      await AsyncStorage.setItem('nospi_transaction_id', bancolombiaTransactionId);
      await AsyncStorage.setItem('nospi_payment_method', 'bancolombia');
      await AsyncStorage.setItem('nospi_payment_opened_time', Date.now().toString());
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('nospi_transaction_id', bancolombiaTransactionId);
        window.localStorage.setItem('nospi_payment_method', 'bancolombia');
        window.localStorage.setItem('nospi_payment_opened_time', Date.now().toString());
      }

      console.log('Opening Bancolombia URL...');
      
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
      
      return;
    } catch (error: any) {
      console.error('Error in Bancolombia payment:', error);
      showAlert('Error Bancolombia', error.message);
      setProcessingMethod(null);
    }
  };

  const startWebPolling = useCallback((transactionId: string, paymentMethod: 'bancolombia' | 'pse') => {
    let attempts = 0;
    const maxAttempts = 24;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`${WOMPI_API_URL}/transactions/${transactionId}`);
        const data = await res.json();
        const status = data.data?.status;
        console.log(`Web ${paymentMethod} polling attempt ${attempts}: ${status}`);
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
          await confirmAppointment(transactionId, paymentMethod);
          setShowSuccessModal(true);
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
        console.error('Web polling error:', e);
        if (attempts >= maxAttempts) clearInterval(interval);
      }
    }, 5000);
  }, [confirmAppointment, showAlert, router]);

  const handlePSEPayment = async () => {
    const cleanPhone = psePhone.replace(/\D/g, '');
    const cleanLegalId = pseLegalId.replace(/\D/g, '');
    if (!pseEmail || !pseEmail.includes('@')) { showAlert('Error', 'Ingresa tu correo registrado en PSE.'); return; }
    if (cleanPhone.length !== 10) { showAlert('Error', 'Ingresa un número de celular válido de 10 dígitos.'); return; }
    if (cleanLegalId.length < 5) { showAlert('Error', 'Ingresa un número de documento válido.'); return; }
    if (!pseBankCode) { showAlert('Error', 'Selecciona tu banco.'); return; }

    setProcessingMethod('pse');
    try {
      console.log('Starting PSE payment...');
      const currentUser = await getSession();
      if (!currentUser) throw new Error('Sesión no encontrada');
      const pendingEventId = await AsyncStorage.getItem('pending_event_confirmation');
      if (!pendingEventId) throw new Error('No se encontró el evento pendiente');

      const { acceptanceToken, personalDataToken } = await getWompiTokens();
      if (!acceptanceToken) throw new Error('No se pudo obtener token de aceptación');

      console.log('PSE redirect URL:', WEB_REDIRECT_URL);

      const response = await fetch(`${SUPABASE_URL}/functions/v1/wompi-pse-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({
          acceptanceToken,
          personalDataToken,
          amountCOP: priceCOP,
          userEmail: pseEmail,
          userId: currentUser.id,
          eventId: pendingEventId,
          userFullName: userProfile?.name || currentUser.email || '',
          userPhone: cleanPhone,
          userLegalId: cleanLegalId,
          userLegalIdType: pseLegalIdType,
          financialInstitutionCode: pseBankCode,
          redirectUrl: WEB_REDIRECT_URL
        }),
      });
      const data = await response.json();
      
      if (!response.ok) {
        console.error('PSE payment error:', data);
        throw new Error(data.error || 'Error al crear pago PSE');
      }
      
      if (!data.redirectUrl) throw new Error('No se obtuvo URL de pago PSE');

      console.log('PSE payment created, transaction ID:', data.transactionId);

      await AsyncStorage.setItem('nospi_transaction_id', data.transactionId);
      await AsyncStorage.setItem('nospi_payment_method', 'pse');
      await AsyncStorage.setItem('nospi_payment_opened_time', Date.now().toString());
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('nospi_transaction_id', data.transactionId);
        window.localStorage.setItem('nospi_payment_method', 'pse');
        window.localStorage.setItem('nospi_payment_opened_time', Date.now().toString());
      }

      console.log('Opening PSE URL...');
      
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
      
      return;


    } catch (error: any) {
      console.error('Error in PSE payment:', error);
      showAlert('Error PSE', error.message);
      setProcessingMethod(null);
    }
  };

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

  return (
    <LinearGradient colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]} style={styles.gradient} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}>
      <Stack.Screen options={{ headerShown: true, title: 'Pago del Evento', headerBackTitle: 'Atrás' }} />
      
      {checkingPaymentStatus && (
        <View style={styles.checkingStatusBanner}>
          <ActivityIndicator size="small" color="#fff" style={{ marginRight: 12 }} />
          <Text style={styles.checkingStatusText}>Verificando estado del pago...</Text>
        </View>
      )}
      
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
