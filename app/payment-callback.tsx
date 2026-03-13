
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text, Platform, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { nospiColors } from '@/constants/Colors';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';

export default function PaymentCallbackScreen() {
  const router = useRouter();
  const localSearchParams = useLocalSearchParams();
  const [status, setStatus] = useState('Procesando pago...');
  const [showManualButton, setShowManualButton] = useState(false);
  const isWeb = Platform.OS === 'web';

  useEffect(() => {
    console.log('PaymentCallbackScreen: Payment callback received');
    console.log('PaymentCallbackScreen: URL params:', localSearchParams);
    console.log('PaymentCallbackScreen: Platform:', Platform.OS);
    
    if (isWeb) {
      // Extract payment details from URL parameters
      const paymentStatus = localSearchParams.payment_status as string || 'unknown';
      const transactionId = localSearchParams.transaction_id as string || '';

      console.log('PaymentCallbackScreen: Web platform, storing payment info');
      console.log('PaymentCallbackScreen: Payment status:', paymentStatus);
      console.log('PaymentCallbackScreen: Transaction ID:', transactionId);

      // Store payment info in localStorage for the app to pick up
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('nospi_payment_status', paymentStatus);
        window.localStorage.setItem('nospi_transaction_id', transactionId);
        window.localStorage.setItem('nospi_payment_time', Date.now().toString());
        console.log('PaymentCallbackScreen: Payment info stored in localStorage');
      }

      // Attempt to create a deep link URL for the app
      const appDeepLink = Linking.createURL('subscription-plans', {
        queryParams: {
          payment_status: paymentStatus,
          transaction_id: transactionId,
        },
      });

      console.log('PaymentCallbackScreen: Generated deep link:', appDeepLink);

      // CRITICAL FIX: Only attempt to redirect if the generated URL is a deep link.
      // If it's a standard web URL (e.g., https://nospi.vercel.app/subscription-plans),
      // do NOT redirect. Stay on this page and show instructions.
      if (appDeepLink.startsWith('exp://') || appDeepLink.startsWith('nospi://')) {
        console.log('PaymentCallbackScreen: Valid deep link detected, attempting automatic redirect');
        setStatus('Redirigiendo a la aplicación...');
        
        // Try to open the app automatically
        try {
          window.location.href = appDeepLink;
        } catch (e) {
          console.error('PaymentCallbackScreen: Error opening deep link:', e);
          setStatus('Pago completado');
          setShowManualButton(true);
        }
      } else {
        // If the deep link generated is a web URL, it means the browser
        // is not configured to handle deep links automatically (e.g., desktop browser).
        // In this case, we stay on the payment-callback page and let the user
        // manually open the app using the provided instructions/button.
        console.log('PaymentCallbackScreen: Deep link generated was a web URL, not attempting automatic redirect');
        console.log('PaymentCallbackScreen: User will use manual button to return to app');
        setStatus('Pago completado');
        setShowManualButton(true);
      }
    } else {
      // On mobile (should not happen in normal flow, but just in case)
      console.log('PaymentCallbackScreen: Mobile platform, using router');
      setStatus('Redirigiendo...');
      
      const paymentStatus = localSearchParams.payment_status as string || 'success';
      const transactionId = localSearchParams.transaction_id as string || '';
      
      router.replace({
        pathname: '/subscription-plans',
        params: {
          payment_status: paymentStatus,
          transaction_id: transactionId
        }
      });
    }
  }, [localSearchParams, isWeb, router]);

  const handleManualOpen = () => {
    const paymentStatus = localSearchParams.payment_status as string || 'success';
    const transactionId = localSearchParams.transaction_id as string || '';
    
    // Try to open the app with the custom scheme
    const deepLinkUrl = `nospi://subscription-plans?payment_status=${paymentStatus}&transaction_id=${transactionId}`;
    
    console.log('PaymentCallbackScreen: Manual open button clicked, deep link:', deepLinkUrl);
    
    if (isWeb && typeof window !== 'undefined') {
      window.location.href = deepLinkUrl;
    }
  };

  return (
    <LinearGradient
      colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
      style={styles.container}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <View style={styles.content}>
        {!showManualButton && (
          <ActivityIndicator size="large" color={nospiColors.purpleDark} />
        )}
        <Text style={styles.successIcon}>✅</Text>
        <Text style={styles.text}>{status}</Text>
        <Text style={styles.subtext}>
          {isWeb 
            ? showManualButton 
              ? 'Regresa a la app de Nospi para confirmar tu cita' 
              : 'Abriendo la aplicación...'
            : 'Por favor espera un momento...'}
        </Text>
        {isWeb && showManualButton && (
          <>
            <TouchableOpacity 
              style={styles.manualButton}
              onPress={handleManualOpen}
              activeOpacity={0.8}
            >
              <Text style={styles.manualButtonText}>Abrir Nospi</Text>
            </TouchableOpacity>
            <Text style={styles.instructionText}>
              O simplemente abre la app de Nospi desde tu dispositivo
            </Text>
          </>
        )}
        {isWeb && !showManualButton && (
          <Text style={styles.instructionText}>
            Si la app no se abre automáticamente, espera unos segundos...
          </Text>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  successIcon: {
    fontSize: 72,
    marginBottom: 16,
  },
  text: {
    marginTop: 16,
    fontSize: 24,
    fontWeight: '700',
    color: nospiColors.purpleDark,
    textAlign: 'center',
  },
  subtext: {
    marginTop: 12,
    fontSize: 16,
    color: nospiColors.purpleMid,
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 24,
  },
  instructionText: {
    marginTop: 16,
    fontSize: 14,
    color: nospiColors.purpleDark,
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 22,
    opacity: 0.8,
  },
  manualButton: {
    marginTop: 32,
    backgroundColor: nospiColors.purpleDark,
    paddingVertical: 18,
    paddingHorizontal: 56,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  manualButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
});
