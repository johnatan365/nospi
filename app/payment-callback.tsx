
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text, Platform, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { nospiColors } from '@/constants/Colors';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function PaymentCallbackScreen() {
  const router = useRouter();
  const localSearchParams = useLocalSearchParams();
  const [status, setStatus] = useState('Procesando...');
  const [paymentStatus, setPaymentStatus] = useState<'APPROVED' | 'PENDING' | 'DECLINED' | 'ERROR' | 'VOIDED' | 'unknown'>('unknown');
  const isWeb = Platform.OS === 'web';

  useEffect(() => {
    console.log('PaymentCallbackScreen: Payment callback received');
    console.log('PaymentCallbackScreen: URL params:', localSearchParams);
    console.log('PaymentCallbackScreen: Platform:', Platform.OS);
    
    const urlPaymentStatus = localSearchParams.payment_status as string || 'unknown';
    const transactionId = localSearchParams.transaction_id as string || '';

    console.log('PaymentCallbackScreen: Payment status:', urlPaymentStatus);
    console.log('PaymentCallbackScreen: Transaction ID:', transactionId);

    // Determine the actual payment status
    let actualStatus: 'APPROVED' | 'PENDING' | 'DECLINED' | 'ERROR' | 'VOIDED' | 'unknown' = 'unknown';
    
    if (urlPaymentStatus === 'success' || urlPaymentStatus === 'APPROVED') {
      actualStatus = 'APPROVED';
    } else if (urlPaymentStatus === 'PENDING') {
      actualStatus = 'PENDING';
    } else if (urlPaymentStatus === 'DECLINED') {
      actualStatus = 'DECLINED';
    } else if (urlPaymentStatus === 'ERROR') {
      actualStatus = 'ERROR';
    } else if (urlPaymentStatus === 'VOIDED') {
      actualStatus = 'VOIDED';
    }

    setPaymentStatus(actualStatus);

    if (isWeb) {
      // Store payment info in localStorage for the app to pick up
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('nospi_payment_status', actualStatus);
        window.localStorage.setItem('nospi_transaction_id', transactionId);
        window.localStorage.setItem('nospi_payment_time', Date.now().toString());
        console.log('PaymentCallbackScreen: Payment info stored in localStorage');
      }

      // Set appropriate status message
      if (actualStatus === 'APPROVED') {
        setStatus('¡Pago completado!');
      } else if (actualStatus === 'PENDING') {
        setStatus('Pago en proceso');
      } else if (actualStatus === 'DECLINED') {
        setStatus('Pago rechazado');
      } else if (actualStatus === 'ERROR') {
        setStatus('Error en el pago');
      } else if (actualStatus === 'VOIDED') {
        setStatus('Pago cancelado');
      } else {
        setStatus('Estado desconocido');
      }
    } else {
      // On mobile (native app), store in AsyncStorage and redirect
      console.log('PaymentCallbackScreen: Mobile platform, storing in AsyncStorage');
      
      const storeAndRedirect = async () => {
        try {
          await AsyncStorage.setItem('nospi_payment_status', actualStatus);
          await AsyncStorage.setItem('nospi_transaction_id', transactionId);
          await AsyncStorage.setItem('nospi_payment_time', Date.now().toString());
          console.log('PaymentCallbackScreen: Payment info stored in AsyncStorage');
          
          // Redirect to subscription-plans screen
          router.replace({
            pathname: '/subscription-plans',
            params: {
              payment_status: actualStatus,
              transaction_id: transactionId
            }
          });
        } catch (error) {
          console.error('PaymentCallbackScreen: Error storing payment info:', error);
        }
      };
      
      storeAndRedirect();
    }
  }, [localSearchParams, isWeb, router]);

  // Web-only view with clear instructions based on payment status
  if (isWeb) {
    // APPROVED - Payment successful
    if (paymentStatus === 'APPROVED') {
      return (
        <LinearGradient
          colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
          style={styles.container}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        >
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.content}>
              <Text style={styles.successIcon}>✅</Text>
              <Text style={styles.text}>{status}</Text>
              
              <View style={styles.instructionsCard}>
                <Text style={styles.instructionsTitle}>Siguiente paso:</Text>
                <Text style={styles.instructionsText}>
                  1. Cierra esta ventana del navegador
                </Text>
                <Text style={styles.instructionsText}>
                  2. Regresa a la app de Nospi en tu dispositivo
                </Text>
                <Text style={styles.instructionsText}>
                  3. Tu cita se confirmará automáticamente
                </Text>
              </View>

              <View style={styles.infoCard}>
                <Text style={styles.infoIcon}>💡</Text>
                <Text style={styles.infoText}>
                  La app detectará tu pago automáticamente cuando regreses. No necesitas hacer nada más.
                </Text>
              </View>

              <View style={styles.warningCard}>
                <Text style={styles.warningIcon}>⚠️</Text>
                <Text style={styles.warningText}>
                  <Text style={styles.warningBold}>Importante:</Text> No cierres la app de Nospi. Solo cierra esta ventana del navegador y regresa a la app.
                </Text>
              </View>
            </View>
          </ScrollView>
        </LinearGradient>
      );
    }

    // PENDING - Payment is being processed
    if (paymentStatus === 'PENDING') {
      return (
        <LinearGradient
          colors={['#FFFFFF', '#FEF3C7', '#FDE68A', '#FCD34D', '#FBBF24']}
          style={styles.container}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        >
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.content}>
              <Text style={styles.pendingIcon}>⏳</Text>
              <Text style={styles.text}>{status}</Text>
              
              <View style={styles.instructionsCard}>
                <Text style={styles.instructionsTitle}>Tu pago está siendo procesado</Text>
                <Text style={styles.instructionsText}>
                  1. Cierra esta ventana del navegador
                </Text>
                <Text style={styles.instructionsText}>
                  2. Regresa a la app de Nospi en tu dispositivo
                </Text>
                <Text style={styles.instructionsText}>
                  3. Te notificaremos cuando se confirme el pago
                </Text>
              </View>

              <View style={[styles.infoCard, { backgroundColor: 'rgba(251, 191, 36, 0.15)' }]}>
                <Text style={styles.infoIcon}>ℹ️</Text>
                <Text style={[styles.infoText, { color: '#92400e' }]}>
                  El banco está procesando tu pago. Esto puede tomar unos minutos. Revisa tu sección de Citas para ver el estado actualizado.
                </Text>
              </View>
            </View>
          </ScrollView>
        </LinearGradient>
      );
    }

    // DECLINED, ERROR, VOIDED - Payment failed or canceled
    if (paymentStatus === 'DECLINED' || paymentStatus === 'ERROR' || paymentStatus === 'VOIDED') {
      const errorTitle = paymentStatus === 'VOIDED' ? 'Pago cancelado' : paymentStatus === 'DECLINED' ? 'Pago rechazado' : 'Error en el pago';
      const errorMessage = paymentStatus === 'VOIDED' 
        ? 'Cancelaste el proceso de pago en el banco.'
        : paymentStatus === 'DECLINED'
        ? 'El banco rechazó tu pago. Esto puede deberse a fondos insuficientes o límites de transacción.'
        : 'Ocurrió un error al procesar tu pago.';

      return (
        <LinearGradient
          colors={['#FFFFFF', '#FEE2E2', '#FECACA', '#FCA5A5', '#F87171']}
          style={styles.container}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        >
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.content}>
              <Text style={styles.errorIcon}>❌</Text>
              <Text style={styles.text}>{errorTitle}</Text>
              
              <View style={styles.instructionsCard}>
                <Text style={styles.instructionsTitle}>¿Qué pasó?</Text>
                <Text style={[styles.instructionsText, { textAlign: 'center', paddingLeft: 0 }]}>
                  {errorMessage}
                </Text>
              </View>

              <View style={styles.instructionsCard}>
                <Text style={styles.instructionsTitle}>Siguiente paso:</Text>
                <Text style={styles.instructionsText}>
                  1. Cierra esta ventana del navegador
                </Text>
                <Text style={styles.instructionsText}>
                  2. Regresa a la app de Nospi en tu dispositivo
                </Text>
                <Text style={styles.instructionsText}>
                  3. Intenta realizar el pago nuevamente
                </Text>
              </View>

              <View style={[styles.infoCard, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
                <Text style={styles.infoIcon}>💡</Text>
                <Text style={[styles.infoText, { color: '#991b1b' }]}>
                  Puedes intentar con otro método de pago o verificar con tu banco si hay algún problema con tu cuenta.
                </Text>
              </View>
            </View>
          </ScrollView>
        </LinearGradient>
      );
    }

    // UNKNOWN - Status not recognized
    return (
      <LinearGradient
        colors={['#FFFFFF', '#F3F4F6', '#E5E7EB', '#D1D5DB', '#9CA3AF']}
        style={styles.container}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.content}>
            <Text style={styles.unknownIcon}>❓</Text>
            <Text style={styles.text}>Estado desconocido</Text>
            
            <View style={styles.instructionsCard}>
              <Text style={styles.instructionsTitle}>No pudimos determinar el estado del pago</Text>
              <Text style={[styles.instructionsText, { textAlign: 'center', paddingLeft: 0 }]}>
                Por favor, verifica el estado de tu pago en la sección de Citas de la app.
              </Text>
            </View>

            <View style={styles.instructionsCard}>
              <Text style={styles.instructionsTitle}>Siguiente paso:</Text>
              <Text style={styles.instructionsText}>
                1. Cierra esta ventana del navegador
              </Text>
              <Text style={styles.instructionsText}>
                2. Regresa a la app de Nospi en tu dispositivo
              </Text>
              <Text style={styles.instructionsText}>
                3. Revisa tu sección de Citas
              </Text>
            </View>
          </View>
        </ScrollView>
      </LinearGradient>
    );
  }

  // Mobile view (should redirect automatically)
  return (
    <LinearGradient
      colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
      style={styles.container}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <View style={styles.content}>
        <ActivityIndicator size="large" color={nospiColors.purpleDark} />
        <Text style={styles.successIcon}>✅</Text>
        <Text style={styles.text}>Redirigiendo...</Text>
        <Text style={styles.subtext}>Por favor espera un momento...</Text>
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
    padding: 24,
  },
  content: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  successIcon: {
    fontSize: 80,
    marginBottom: 24,
  },
  pendingIcon: {
    fontSize: 80,
    marginBottom: 24,
  },
  errorIcon: {
    fontSize: 80,
    marginBottom: 24,
  },
  unknownIcon: {
    fontSize: 80,
    marginBottom: 24,
  },
  text: {
    fontSize: 28,
    fontWeight: '800',
    color: nospiColors.purpleDark,
    textAlign: 'center',
    marginBottom: 32,
  },
  subtext: {
    marginTop: 12,
    fontSize: 16,
    color: nospiColors.purpleMid,
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 24,
  },
  instructionsCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  instructionsTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: nospiColors.purpleDark,
    marginBottom: 16,
    textAlign: 'center',
  },
  instructionsText: {
    fontSize: 16,
    color: '#333',
    lineHeight: 28,
    marginBottom: 8,
    paddingLeft: 8,
  },
  infoCard: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    width: '100%',
    maxWidth: 400,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  infoIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: nospiColors.purpleDark,
    lineHeight: 22,
  },
  warningCard: {
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.3)',
  },
  warningIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    color: '#92400e',
    lineHeight: 22,
  },
  warningBold: {
    fontWeight: '700',
  },
});
