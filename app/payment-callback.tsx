
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text, Platform, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { nospiColors } from '@/constants/Colors';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';

export default function PaymentCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [status, setStatus] = useState('Procesando pago...');
  const [showManualButton, setShowManualButton] = useState(false);

  useEffect(() => {
    console.log('PaymentCallbackScreen: Payment callback received');
    console.log('PaymentCallbackScreen: URL params:', params);
    console.log('PaymentCallbackScreen: Platform:', Platform.OS);
    
    const handleCallback = async () => {
      try {
        // Extract transaction ID from URL params
        const transactionId = params.id as string || params.transaction_id as string;
        
        console.log('PaymentCallbackScreen: Transaction ID:', transactionId);

        if (Platform.OS === 'web') {
          // On web, store the payment info in localStorage so the app can pick it up
          console.log('PaymentCallbackScreen: Web platform, storing payment info and triggering deep link');
          setStatus('Redirigiendo a la aplicación...');
          
          // Store payment info in localStorage
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem('payment_callback_status', 'success');
            window.localStorage.setItem('payment_callback_transaction_id', transactionId || '');
            window.localStorage.setItem('payment_callback_timestamp', Date.now().toString());
            console.log('PaymentCallbackScreen: Payment info stored in localStorage');
          }
          
          // Try to open the app with a simple instruction to the user
          // The app will check localStorage when it opens
          setStatus('Pago completado');
          setShowManualButton(true);
          
          // Also try to trigger the deep link automatically
          try {
            // For Expo Go, we need to use the nospi:// scheme
            const deepLinkUrl = `nospi://subscription-plans?payment_status=success&transaction_id=${transactionId || ''}`;
            console.log('PaymentCallbackScreen: Attempting to open deep link:', deepLinkUrl);
            window.location.href = deepLinkUrl;
          } catch (e) {
            console.error('PaymentCallbackScreen: Error opening deep link:', e);
          }
        } else {
          // On mobile (should not happen in Expo Go, but just in case)
          console.log('PaymentCallbackScreen: Mobile platform, using router');
          setStatus('Redirigiendo...');
          
          router.replace({
            pathname: '/subscription-plans',
            params: {
              payment_status: 'success',
              transaction_id: transactionId || ''
            }
          });
        }
      } catch (error) {
        console.error('PaymentCallbackScreen: Error processing callback:', error);
        setStatus('Error al procesar el pago');
        
        if (Platform.OS === 'web') {
          setStatus('Por favor abre la app de Nospi manualmente');
          setShowManualButton(true);
        } else {
          // Fallback to subscription-plans screen
          setTimeout(() => {
            router.replace('/subscription-plans');
          }, 2000);
        }
      }
    };

    handleCallback();
  }, [router, params]);

  const handleManualOpen = () => {
    const transactionId = params.id as string || params.transaction_id as string;
    
    // Try to open the app with the custom scheme
    const deepLinkUrl = `nospi://subscription-plans?payment_status=success&transaction_id=${transactionId || ''}`;
    
    if (Platform.OS === 'web') {
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
          {Platform.OS === 'web' 
            ? showManualButton 
              ? 'Regresa a la app de Nospi para confirmar tu cita' 
              : 'Abriendo la aplicación...'
            : 'Por favor espera un momento...'}
        </Text>
        {Platform.OS === 'web' && showManualButton && (
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
        {Platform.OS === 'web' && !showManualButton && (
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
