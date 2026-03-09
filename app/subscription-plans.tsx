import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Modal, Alert, SafeAreaView, AppState, Image
} from 'react-native';
import { WebView } from 'react-native-webview';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors, PRECIO_EVENTO_COP } from '@/constants/Colors';
import { useRouter, Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useSupabase } from '@/contexts/SupabaseContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

const MP_PUBLIC_KEY = 'APP_USR-4e9db236-57b7-4258-89da-2ea273d4505f';
const SUPABASE_URL = 'https://wjdiraurfbawotlcndmk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqZGlyYXVyZmJhd290bGNuZG1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0MDMxMTUsImV4cCI6MjA4NTk3OTExNX0.FxMBafEjIliTDzRBRlnY59i1wEcbIx6u8ZdVf1uxuj8';

type PaymentMethod = 'card' | 'nequi' | 'pse' | 'virtual_balance';

function generateBricksHTML(preferenceId: string, method: PaymentMethod, publicKey: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <title>Pago Nospi</title>
  <script src="https://sdk.mercadopago.com/js/v2"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #f5f5f5; padding: 16px; }
    .header { background: white; border-radius: 12px; padding: 16px; margin-bottom: 16px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header h2 { color: #6B21A8; font-size: 18px; margin-bottom: 4px; }
    .header p { color: #666; font-size: 14px; }
    .price { font-size: 28px; font-weight: bold; color: #6B21A8; margin: 8px 0; }
    #brick-container { background: white; border-radius: 12px; padding: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); min-height: 200px; }
    .loading { text-align: center; padding: 40px; color: #666; font-size: 14px; }
    .error { background: #FEE2E2; border-radius: 8px; padding: 16px; color: #DC2626; text-align: center; margin: 16px 0; font-size: 14px; }
  </style>
</head>
<body>
  <div class="header">
    <h2>Pago del Evento</h2>
    <p>Nospi — Acceso al evento</p>
    <div class="price">$10.000 COP</div>
  </div>
  <div id="brick-container">
    <div class="loading">Cargando formulario de pago...</div>
  </div>

  <script>
    const mp = new MercadoPago('${publicKey}', { locale: 'es-CO' });
    const bricksBuilder = mp.bricks();
    const method = '${method}';

    async function renderBrick() {
      try {
        if (method === 'card') {
          await bricksBuilder.create('cardPayment', 'brick-container', {
            initialization: { amount: 10000, payer: { email: '' } },
            customization: {
              visual: { style: { theme: 'default' } },
              paymentMethods: { maxInstallments: 1 }
            },
            callbacks: {
              onReady: () => {},
              onSubmit: async (cardFormData) => {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'PROCESSING' }));
                try {
                  const response = await fetch('${SUPABASE_URL}/functions/v1/process-card-payment', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': 'Bearer ${SUPABASE_ANON_KEY}',
                    },
                    body: JSON.stringify({ formData: cardFormData, amount: 10000 }),
                  });
                  const result = await response.json();
                  if (result.status === 'approved') {
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'PAYMENT_SUCCESS' }));
                  } else if (result.status === 'in_process' || result.status === 'pending') {
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'PAYMENT_PENDING' }));
                  } else {
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'PAYMENT_ERROR', message: result.message || 'Pago rechazado. Intenta con otra tarjeta.' }));
                  }
                } catch (err) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'PAYMENT_ERROR', message: 'Error de conexión. Intenta de nuevo.' }));
                }
              },
              onError: (error) => { console.error(error); }
            }
          });
        } else {
          // Nequi y PSE usan Wallet Brick con preferenceId
          await bricksBuilder.create('wallet', 'brick-container', {
            initialization: { preferenceId: '${preferenceId}', redirectMode: 'self' },
            customization: { texts: { valueProp: 'smart_option' } },
            callbacks: {
              onReady: () => {},
              onSubmit: () => {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'WALLET_OPENED' }));
              },
              onError: (error) => { console.error(error); }
            }
          });
        }
      } catch (error) {
        document.getElementById('brick-container').innerHTML = '<div class="error">Error al cargar el formulario. Por favor cierra e intenta de nuevo.</div>';
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'BRICK_ERROR', message: error.message }));
      }
    }

    renderBrick();
  </script>
</body>
</html>
  `;
}

export default function SubscriptionPlansScreen() {
  const router = useRouter();
  const { user } = useSupabase();
  const webViewRef = useRef<any>(null);

  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod | null>(null);
  const [showWebView, setShowWebView] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [webViewLoading, setWebViewLoading] = useState(true);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [virtualBalance, setVirtualBalance] = useState<number>(0);
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [userProfile, setUserProfile] = useState<{ email: string; name: string } | null>(null);
  const [bricksHTML, setBricksHTML] = useState<string>('');
  const [currentMethod, setCurrentMethod] = useState<PaymentMethod | null>(null);

  const priceCOP = PRECIO_EVENTO_COP;

  const fetchVirtualBalance = useCallback(async () => {
    try {
      setLoadingBalance(true);
      const { data } = await supabase
        .from('users')
        .select('virtual_balance, email, name')
        .eq('id', user?.id)
        .single();
      setVirtualBalance(data?.virtual_balance || 0);
      if (data) setUserProfile({ email: data.email || '', name: data.name || '' });
    } catch {
      setVirtualBalance(0);
    } finally {
      setLoadingBalance(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchVirtualBalance();
  }, [fetchVirtualBalance]);

  // Escucha deep link nospi://payment/success cuando la app se abre desde payment-return
  // Deep link listener - solo activo DESPUES de que el browser PSE se cierra
  // No usamos getInitialURL porque en iOS puede contener URLs viejas de OAuth de Google
  useEffect(() => {
    const handleUrl = ({ url }: { url: string }) => {
      if (url.includes('nospi://payment/success')) {
        AsyncStorage.setItem('pse_payment_pending', 'true');
        router.replace('/(tabs)/appointments');
      }
    };
    const sub = Linking.addEventListener('url', handleUrl);
    return () => sub.remove();
  }, []);

  const confirmAppointment = async () => {
    try {
      const pendingEventId = await AsyncStorage.getItem('pending_event_confirmation');
      if (!pendingEventId) return;

      const { data: existing } = await supabase
        .from('appointments')
        .select('id')
        .eq('user_id', user?.id)
        .eq('event_id', pendingEventId)
        .maybeSingle();

      if (!existing) {
        await supabase.from('appointments').insert({
          user_id: user?.id,
          event_id: pendingEventId,
          status: 'confirmada',
          payment_status: 'completed',
        });
        await AsyncStorage.setItem('should_check_notification_prompt', 'true');
      }
      await AsyncStorage.removeItem('pending_event_confirmation');
    } catch (error) {
      console.error('Error confirmando cita:', error);
    }
  };

  const handlePayWithVirtualBalance = async () => {
    setProcessing(true);
    try {
      const newBalance = virtualBalance - priceCOP;
      const { error } = await supabase.from('users').update({ virtual_balance: newBalance }).eq('id', user?.id);
      if (error) throw error;
      await confirmAppointment();
      setShowSuccessModal(true);
    } catch {
      Alert.alert('Error', 'No se pudo procesar el pago con saldo virtual.');
    } finally {
      setProcessing(false);
    }
  };

  const handleOpenBricks = async (method: PaymentMethod) => {
    console.log('[BRICKS 1] handleOpenBricks iniciado. method:', method);
    console.log('[BRICKS 1] user:', user ? `id=${user.id}, email=${user.email}` : 'NULL - SIN USUARIO');

    if (!user) {
      console.log('[BRICKS ERROR] Sin usuario — saliendo');
      return;
    }
    setProcessing(true);
    try {
      const pendingEventId = await AsyncStorage.getItem('pending_event_confirmation');
      console.log('[BRICKS 2] pending_event_confirmation en AsyncStorage:', pendingEventId);

      if (!pendingEventId) {
        console.log('[BRICKS ERROR] pendingEventId es null/vacío — mostrando Alert y saliendo');
        Alert.alert('Error', 'No se encontró el evento. Por favor vuelve a la pantalla del evento e intenta de nuevo.');
        setProcessing(false);
        return;
      }

      const bodyPayload = {
        eventId: pendingEventId || 'test-event',
        userId: user.id,
        userEmail: userProfile?.email || user.email || (user as any).user_metadata?.email || '',
        userName: userProfile?.name || (user as any).user_metadata?.full_name || (user as any).user_metadata?.name || 'Usuario',
        paymentMethod: method,
        amountCOP: priceCOP,
      };
      console.log('[BRICKS 3] Llamando a create-payment con body:', JSON.stringify(bodyPayload));

      const response = await fetch(`${SUPABASE_URL}/functions/v1/create-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify(bodyPayload),
      });

      console.log('[BRICKS 4] Respuesta HTTP de create-payment. status:', response.status, 'ok:', response.ok);

      const data = await response.json();
      console.log('[BRICKS 5] Body de respuesta create-payment:', JSON.stringify(data));

      if (!response.ok || data.error) {
        console.log('[BRICKS ERROR] create-payment devolvió error:', data.error);
        throw new Error(data.error || 'Error al crear preferencia');
      }
      if (!data.initPoint && !data.preferenceId) {
        console.log('[BRICKS ERROR] Sin initPoint ni preferenceId. Keys recibidas:', Object.keys(data).join(','));
        throw new Error('MP no devolvió URL de pago. Intenta de nuevo.');
      }

      console.log('[BRICKS 6] initPoint:', data.initPoint ?? 'N/A', '| preferenceId:', data.preferenceId ?? 'N/A');

      const bricksParams = new URLSearchParams({
        method,
        preferenceId: data.preferenceId || '',
        publicKey: MP_PUBLIC_KEY,
        supabaseUrl: SUPABASE_URL,
        supabaseKey: SUPABASE_ANON_KEY,
        redirectSuccess: 'nospi://payment/success',
        redirectFailure: 'nospi://payment/failure',
      });
      const bricksUrl = `${SUPABASE_URL}/functions/v1/payment-page?${bricksParams.toString()}`;
      
      if (method === 'card') {
        console.log('[BRICKS 7] Método TARJETA — cargando HTML desde bricksUrl');
        // Tarjeta usa Bricks via WebView
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const htmlResponse = await fetch(bricksUrl, {
          headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        console.log('[BRICKS 8] htmlResponse status:', htmlResponse.status);
        if (!htmlResponse.ok) throw new Error('No se pudo cargar la pantalla de pago. Intenta de nuevo.');
        const htmlContent = await htmlResponse.text();
        console.log('[BRICKS 9] htmlContent length:', htmlContent?.length ?? 0);
        if (!htmlContent || htmlContent.length < 100) throw new Error('Página de pago vacía. Intenta de nuevo.');
        setBricksHTML(htmlContent);
        setCurrentMethod(method);
        setWebViewLoading(true);
        setShowWebView(true);
        console.log('[BRICKS 10] setShowWebView(true) ejecutado — WebView debería mostrarse');
      } else {
        console.log('[BRICKS 7] Método PSE/Bancolombia — abriendo browser con initPoint');
        // PSE/Bancolombia
        if (!data.initPoint) {
          console.log('[BRICKS ERROR] initPoint es null para PSE. preferenceId:', data.preferenceId, 'Keys:', Object.keys(data).join(','));
          throw new Error(`MP no devolvió URL. preferenceId: ${data.preferenceId}, keys: ${Object.keys(data).join(',')}`);
        }
        console.log('[BRICKS 8] Guardando pse_payment_pending y abriendo:', data.initPoint);
        await AsyncStorage.setItem('pse_payment_pending', 'true');
        console.log('[BRICKS 9] Llamando WebBrowser.openBrowserAsync...');
        await WebBrowser.openBrowserAsync(data.initPoint);
        console.log('[BRICKS 10] WebBrowser cerrado (usuario volvió). Navegando a appointments...');
        router.replace('/(tabs)/appointments');
      }

    } catch (error: any) {
      console.log('[BRICKS CATCH] Error capturado:', error?.message, '| Stack:', error?.stack);
      Alert.alert('Error de pago', `${error.message}\n\nDetalles: ${JSON.stringify(error)}`);
    } finally {
      console.log('[BRICKS FINALLY] setProcessing(false)');
      setProcessing(false);
    }
  };

  const handleContinue = async () => {
    if (!selectedPayment) return;
    if (selectedPayment === 'virtual_balance') {
      await handlePayWithVirtualBalance();
    } else {
      await handleOpenBricks(selectedPayment);
    }
  };

  const handleWebViewMessage = async (event: any) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);

      switch (message.type) {
        case 'PAYMENT_SUCCESS':
          setShowWebView(false);
          await confirmAppointment();
          setShowSuccessModal(true);
          break;
        case 'PAYMENT_PENDING':
          setShowWebView(false);
          Alert.alert('Pago pendiente', 'Tu pago está siendo procesado. Te notificaremos cuando se confirme.',
            [{ text: 'OK', onPress: () => router.replace('/(tabs)/appointments') }]);
          break;
        case 'PAYMENT_ERROR':
          setShowWebView(false);
          Alert.alert('Pago rechazado', message.message || 'No se pudo procesar el pago. Intenta con otra tarjeta.');
          break;
        case 'BRICK_ERROR':
          setShowWebView(false);
          Alert.alert('Error', 'No se pudo cargar el formulario de pago.');
          break;
      }
    } catch (e) {
      console.error('Error parsing WebView message:', e);
    }
  };

  const webViewTitle = currentMethod === 'card' ? 'Pagar con Tarjeta' : currentMethod === 'nequi' ? 'Pagar con Nequi' : 'Pagar con PSE';

  if (showWebView) {
    return (
      <SafeAreaView style={styles.webViewContainer}>
        <Stack.Screen options={{
          headerShown: true,
          title: webViewTitle,
          headerLeft: () => (
            <TouchableOpacity onPress={() => setShowWebView(false)} style={{ paddingHorizontal: 16 }}>
              <Text style={{ color: nospiColors.purpleDark, fontSize: 16 }}>Cancelar</Text>
            </TouchableOpacity>
          ),
        }} />
        {webViewLoading && (
          <View style={styles.webViewLoadingOverlay}>
            <ActivityIndicator size="large" color={nospiColors.purpleDark} />
            <Text style={styles.webViewLoadingText}>Cargando formulario de pago...</Text>
          </View>
        )}
        <WebView
          ref={webViewRef}
          source={{ html: bricksHTML }}
          style={styles.webView}
          onLoadEnd={() => setWebViewLoading(false)}
          onMessage={handleWebViewMessage}
          onNavigationStateChange={async (navState) => {
            const url = navState.url || '';
            if (url.includes('payment/success') || url.includes('collection_status=approved')) {
              setShowWebView(false);
              await confirmAppointment();
              setShowSuccessModal(true);
            } else if (url.includes('payment/failure') || url.includes('collection_status=rejected')) {
              setShowWebView(false);
              Alert.alert('Pago fallido', 'No se pudo procesar el pago. Intenta de nuevo.');
            } else if (url.includes('payment/pending')) {
              setShowWebView(false);
              Alert.alert('Pago pendiente', 'Tu pago está siendo procesado.',
                [{ text: 'OK', onPress: () => router.replace('/(tabs)/appointments') }]);
            }
          }}
          javaScriptEnabled
          domStorageEnabled
          mixedContentMode="always"
          originWhitelist={['*']}
        />
      </SafeAreaView>
    );
  }

  return (
    <LinearGradient
      colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
      style={styles.gradient}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <Stack.Screen options={{ headerShown: true, title: 'Pago del Evento', headerBackTitle: 'Atrás' }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>

        <Text style={styles.title}>Pago del Evento</Text>
        <Text style={styles.subtitle}>{`Confirma tu asistencia pagando $${priceCOP.toLocaleString('es-CO')} COP`}</Text>

        <View style={styles.priceCard}>
          <Text style={styles.priceLabel}>Precio por evento</Text>
          <Text style={styles.priceAmount}>{`$${priceCOP.toLocaleString('es-CO')}`}</Text>
          <Text style={styles.priceAmountCOP}>Pesos colombianos</Text>
          <Text style={styles.priceDescription}>Pago único por evento. Sin suscripciones ni cargos recurrentes.</Text>
        </View>

        <View style={styles.benefitsContainer}>
          {[
            { icon: '✨', title: 'Acceso al evento', desc: 'Confirma tu lugar en el evento seleccionado' },
            { icon: '🎉', title: 'Conoce gente nueva', desc: 'Conecta con personas afines en un ambiente relajado' },
            { icon: '💜', title: 'Experiencia única', desc: 'Disfruta de una experiencia social inolvidable' },
          ].map((b, i) => (
            <View key={i} style={styles.benefitItem}>
              <Text style={styles.benefitIcon}>{b.icon}</Text>
              <View style={styles.benefitText}>
                <Text style={styles.benefitTitle}>{b.title}</Text>
                <Text style={styles.benefitDescription}>{b.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.paymentSection}>
          <Text style={styles.paymentTitle}>Método de Pago</Text>
          <Text style={styles.paymentSubtitle}>⚠️ Selecciona una opción para continuar</Text>

          {!loadingBalance && virtualBalance >= priceCOP && (
            <TouchableOpacity
              style={[styles.paymentButton, styles.virtualBalanceButton, selectedPayment === 'virtual_balance' && styles.paymentButtonSelected]}
              onPress={() => setSelectedPayment('virtual_balance')}
              activeOpacity={0.8}
            >
              <View style={styles.paymentButtonContent}>
                {selectedPayment === 'virtual_balance' && <View style={styles.checkmark}><Text style={styles.checkmarkText}>✓</Text></View>}
                <View>
                  <Text style={styles.virtualBalanceTitle}>💰 Saldo Virtual</Text>
                  <Text style={styles.virtualBalanceAmount}>Disponible: ${virtualBalance.toLocaleString('es-CO')} COP</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.paymentButton, selectedPayment === 'card' && styles.paymentButtonSelected]}
            onPress={() => setSelectedPayment('card')}
            activeOpacity={0.8}
          >
            <View style={styles.paymentButtonContent}>
              {selectedPayment === 'card' && <View style={styles.checkmark}><Text style={styles.checkmarkText}>✓</Text></View>}
              <View style={styles.paymentMethodInfo}>
                <Text style={styles.paymentMethodIcon}>💳</Text>
                <View>
                  <Text style={styles.paymentMethodTitle}>Tarjeta Crédito / Débito</Text>
                  <Text style={styles.paymentMethodSubtitle}>Visa, Mastercard, Amex</Text>
                </View>
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.paymentButton, selectedPayment === 'pse' && styles.paymentButtonSelected]}
            onPress={() => setSelectedPayment('pse')}
            activeOpacity={0.8}
          >
            <View style={styles.paymentButtonContent}>
              {selectedPayment === 'pse' && <View style={styles.checkmark}><Text style={styles.checkmarkText}>✓</Text></View>}
              <View style={styles.paymentMethodInfo}>
                <Image source={require('@/assets/images/logo_380.png')} style={styles.pseLogoImage} resizeMode="contain" />
                <View>
                  <Text style={styles.paymentMethodTitle}>PSE</Text>
                  <Text style={styles.paymentMethodSubtitle}>Transferencia bancaria — todos los bancos</Text>
                </View>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.summaryContainer}>
          <Text style={styles.summaryText}>Total a pagar:</Text>
          <Text style={styles.summaryAmount}>{`$${priceCOP.toLocaleString('es-CO')} COP`}</Text>
        </View>

        <TouchableOpacity
          style={[styles.continueButton, (!selectedPayment || processing) && styles.continueButtonDisabled]}
          onPress={handleContinue}
          disabled={!selectedPayment || processing}
          activeOpacity={0.8}
        >
          {processing
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.continueButtonText}>
                {selectedPayment === 'virtual_balance' ? 'Pagar con Saldo Virtual' : 'Continuar con el pago'}
              </Text>
          }
        </TouchableOpacity>

        <Text style={styles.mpNote}>🔒 Pagos procesados de forma segura por Mercado Pago</Text>

      </ScrollView>

      <Modal visible={showSuccessModal} transparent animationType="fade" onRequestClose={() => { setShowSuccessModal(false); router.replace('/(tabs)/appointments'); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.successIcon}>✅</Text>
            <Text style={styles.successTitle}>¡Pago Exitoso!</Text>
            <Text style={styles.successMessage}>Tu asistencia al evento ha sido confirmada</Text>
            <TouchableOpacity style={styles.successButton} onPress={() => { setShowSuccessModal(false); router.replace('/(tabs)/appointments'); }} activeOpacity={0.8}>
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
  contentContainer: { padding: 24, paddingBottom: 100 },
  webViewContainer: { flex: 1, backgroundColor: '#f5f5f5' },
  webView: { flex: 1 },
  webViewLoadingOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.95)', justifyContent: 'center', alignItems: 'center', zIndex: 10,
  },
  webViewLoadingText: { marginTop: 12, color: '#666', fontSize: 14 },
  title: { fontSize: 32, fontWeight: 'bold', color: nospiColors.purpleDark, marginBottom: 12 },
  subtitle: { fontSize: 16, color: nospiColors.purpleDark, opacity: 0.8, marginBottom: 32, lineHeight: 24 },
  priceCard: {
    backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 20, padding: 32, marginBottom: 24, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 5,
  },
  priceLabel: { fontSize: 16, color: '#666', marginBottom: 8 },
  priceAmount: { fontSize: 48, fontWeight: 'bold', color: nospiColors.purpleDark, marginBottom: 8 },
  priceAmountCOP: { fontSize: 24, fontWeight: '600', color: nospiColors.purpleMid, marginBottom: 16 },
  priceDescription: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 20, marginBottom: 8 },
  benefitsContainer: { backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 20, padding: 20, marginBottom: 24 },
  benefitItem: { flexDirection: 'row', marginBottom: 20 },
  benefitIcon: { fontSize: 24, marginRight: 16 },
  benefitText: { flex: 1 },
  benefitTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  benefitDescription: { fontSize: 14, color: '#666', lineHeight: 20 },
  paymentSection: {
    marginBottom: 24, backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 20, padding: 20, borderWidth: 2, borderColor: nospiColors.purpleLight,
  },
  paymentTitle: { fontSize: 20, fontWeight: 'bold', color: nospiColors.purpleDark, marginBottom: 4 },
  paymentSubtitle: { fontSize: 13, fontWeight: '600', color: '#92400E', marginBottom: 16 },
  paymentButton: {
    backgroundColor: '#F9F9F9', paddingVertical: 16, paddingHorizontal: 20,
    borderRadius: 14, marginBottom: 12, borderWidth: 2, borderColor: '#E5E7EB',
  },
  paymentButtonSelected: { borderColor: nospiColors.purpleDark, backgroundColor: '#F3E8FF' },
  paymentButtonContent: { flexDirection: 'row', alignItems: 'center' },
  checkmark: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: nospiColors.purpleDark,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  checkmarkText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  paymentMethodInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  paymentMethodIcon: { fontSize: 28, marginRight: 14 },
  paymentMethodTitle: { fontSize: 16, fontWeight: '700', color: '#222' },
  paymentMethodSubtitle: { fontSize: 13, color: '#888', marginTop: 2 },
  virtualBalanceButton: { backgroundColor: 'rgba(147,51,234,0.08)', borderColor: nospiColors.purpleMid },
  pseLogoImage: {
    width: 48, height: 48, marginRight: 14, borderRadius: 24,
  },
  virtualBalanceTitle: { fontSize: 16, fontWeight: 'bold', color: nospiColors.purpleDark },
  virtualBalanceAmount: { fontSize: 13, color: nospiColors.purpleMid, marginTop: 2 },
  summaryContainer: {
    backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 16,
    padding: 16, marginBottom: 16, alignItems: 'center',
  },
  summaryText: { fontSize: 16, fontWeight: '600', color: '#666', marginBottom: 8 },
  summaryAmount: { fontSize: 24, fontWeight: 'bold', color: nospiColors.purpleDark, marginBottom: 4 },
  continueButton: {
    backgroundColor: nospiColors.purpleDark, paddingVertical: 18, borderRadius: 16, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5, marginBottom: 12,
  },
  continueButtonDisabled: { backgroundColor: '#C4B5FD', shadowOpacity: 0, elevation: 0 },
  continueButtonText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  mpNote: { fontSize: 13, color: '#FFFFFF', textAlign: 'center', marginBottom: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalContent: { backgroundColor: '#fff', borderRadius: 24, padding: 40, width: '100%', maxWidth: 400, alignItems: 'center' },
  successIcon: { fontSize: 72, marginBottom: 24 },
  successTitle: { fontSize: 28, fontWeight: 'bold', color: nospiColors.purpleDark, marginBottom: 16, textAlign: 'center' },
  successMessage: { fontSize: 16, color: '#666', textAlign: 'center', lineHeight: 24, marginBottom: 32 },
  successButton: { backgroundColor: nospiColors.purpleDark, paddingVertical: 18, paddingHorizontal: 48, borderRadius: 16, width: '100%', alignItems: 'center' },
  successButtonText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});
