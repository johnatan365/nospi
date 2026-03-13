
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, Platform, ScrollView, Image } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { nospiColors } from '@/constants/Colors';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function PaymentCallbackScreen() {
  const router = useRouter();
  const localSearchParams = useLocalSearchParams();
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

  // Web-only view with beautiful Nospi branding
  if (isWeb) {
    return (
      <LinearGradient
        colors={[nospiColors.purpleDark, nospiColors.purpleMid, nospiColors.purpleLight, nospiColors.purplePale]}
        style={styles.container}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.content}>
            {/* Nospi Logo */}
            <Image 
              source={require('@/assets/images/icono Nospi.png')}
              style={styles.logo}
              resizeMode="contain"
            />

            {/* Instructions Card */}
            <View style={styles.instructionsCard}>
              <Text style={styles.instructionsTitle}>Siguiente paso:</Text>
              
              <View style={styles.stepContainer}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>1</Text>
                </View>
                <Text style={styles.stepText}>
                  Cierra esta ventana del navegador
                </Text>
              </View>

              <View style={styles.stepContainer}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>2</Text>
                </View>
                <Text style={styles.stepText}>
                  Regresa a la app de Nospi
                </Text>
              </View>

              <View style={styles.stepContainer}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>3</Text>
                </View>
                <Text style={styles.stepText}>
                  Tu pago se procesará automáticamente
                </Text>
              </View>
            </View>

            {/* Footer text */}
            <Text style={styles.footerText}>
              Gracias por confiar en Nospi 💜
            </Text>
          </View>
        </ScrollView>
      </LinearGradient>
    );
  }

  // Mobile view (should redirect automatically)
  return (
    <LinearGradient
      colors={[nospiColors.purpleDark, nospiColors.purpleMid, nospiColors.purpleLight, nospiColors.purplePale]}
      style={styles.container}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <View style={styles.content}>
        <Image 
          source={require('@/assets/images/icono Nospi.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.redirectText}>Redirigiendo...</Text>
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
    alignItems: 'center',
    padding: 24,
    minHeight: '100%',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 500,
  },
  logo: {
    width: 240,
    height: 240,
    marginBottom: 40,
  },
  instructionsCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderRadius: 24,
    padding: 32,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
    marginBottom: 32,
  },
  instructionsTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: nospiColors.purpleDark,
    marginBottom: 28,
    textAlign: 'center',
  },
  stepContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  stepNumber: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: nospiColors.purpleMid,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  stepNumberText: {
    fontSize: 18,
    fontWeight: '700',
    color: nospiColors.white,
  },
  stepText: {
    flex: 1,
    fontSize: 17,
    color: nospiColors.gray800,
    lineHeight: 24,
    fontWeight: '500',
  },
  footerText: {
    fontSize: 18,
    color: nospiColors.white,
    textAlign: 'center',
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  redirectText: {
    fontSize: 20,
    color: nospiColors.white,
    textAlign: 'center',
    fontWeight: '600',
    marginTop: 24,
  },
});
