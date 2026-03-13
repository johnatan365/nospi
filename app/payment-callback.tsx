
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text, Platform, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { nospiColors } from '@/constants/Colors';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function PaymentCallbackScreen() {
  const router = useRouter();
  const localSearchParams = useLocalSearchParams();
  const [status, setStatus] = useState('Procesando pago...');
  const isWeb = Platform.OS === 'web';

  useEffect(() => {
    console.log('PaymentCallbackScreen: Payment callback received');
    console.log('PaymentCallbackScreen: URL params:', localSearchParams);
    console.log('PaymentCallbackScreen: Platform:', Platform.OS);
    
    const paymentStatus = localSearchParams.payment_status as string || 'unknown';
    const transactionId = localSearchParams.transaction_id as string || '';

    console.log('PaymentCallbackScreen: Payment status:', paymentStatus);
    console.log('PaymentCallbackScreen: Transaction ID:', transactionId);

    if (isWeb) {
      // Store payment info in localStorage for the app to pick up
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('nospi_payment_status', paymentStatus);
        window.localStorage.setItem('nospi_transaction_id', transactionId);
        window.localStorage.setItem('nospi_payment_time', Date.now().toString());
        console.log('PaymentCallbackScreen: Payment info stored in localStorage');
      }

      // Show success message immediately
      setStatus('¡Pago completado!');
    } else {
      // On mobile (native app), store in AsyncStorage and redirect
      console.log('PaymentCallbackScreen: Mobile platform, storing in AsyncStorage');
      
      const storeAndRedirect = async () => {
        try {
          await AsyncStorage.setItem('nospi_payment_status', paymentStatus);
          await AsyncStorage.setItem('nospi_transaction_id', transactionId);
          await AsyncStorage.setItem('nospi_payment_time', Date.now().toString());
          console.log('PaymentCallbackScreen: Payment info stored in AsyncStorage');
          
          // Redirect to subscription-plans screen
          router.replace({
            pathname: '/subscription-plans',
            params: {
              payment_status: paymentStatus,
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

  // Web-only view with clear instructions
  if (isWeb) {
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
