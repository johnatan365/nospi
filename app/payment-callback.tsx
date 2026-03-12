
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { nospiColors } from '@/constants/Colors';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';

export default function PaymentCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [status, setStatus] = useState('Procesando pago...');

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
          // On web, redirect to subscription-plans with payment_status
          console.log('PaymentCallbackScreen: Web platform, redirecting to subscription-plans');
          setStatus('Redirigiendo...');
          
          setTimeout(() => {
            router.replace({
              pathname: '/subscription-plans',
              params: {
                payment_status: 'success',
                transaction_id: transactionId || ''
              }
            });
          }, 500);
        } else {
          // On mobile, trigger deep link to open the app
          console.log('PaymentCallbackScreen: Mobile platform, triggering deep link');
          setStatus('Abriendo la aplicación...');
          
          // Create deep link URL
          const deepLinkUrl = Linking.createURL('subscription-plans', {
            queryParams: {
              payment_status: 'success',
              transaction_id: transactionId || ''
            }
          });
          
          console.log('PaymentCallbackScreen: Deep link URL:', deepLinkUrl);
          
          // Try to open the deep link
          const canOpen = await Linking.canOpenURL(deepLinkUrl);
          
          if (canOpen) {
            await Linking.openURL(deepLinkUrl);
            console.log('PaymentCallbackScreen: Deep link opened successfully');
          } else {
            console.log('PaymentCallbackScreen: Cannot open deep link, using router');
            router.replace({
              pathname: '/subscription-plans',
              params: {
                payment_status: 'success',
                transaction_id: transactionId || ''
              }
            });
          }
        }
      } catch (error) {
        console.error('PaymentCallbackScreen: Error processing callback:', error);
        setStatus('Error al procesar el pago');
        
        // Fallback to subscription-plans screen
        setTimeout(() => {
          router.replace('/subscription-plans');
        }, 2000);
      }
    };

    handleCallback();
  }, [router, params]);

  return (
    <LinearGradient
      colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
      style={styles.container}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <View style={styles.content}>
        <ActivityIndicator size="large" color={nospiColors.purpleDark} />
        <Text style={styles.text}>{status}</Text>
        <Text style={styles.subtext}>Por favor espera un momento...</Text>
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
  text: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: nospiColors.purpleDark,
    textAlign: 'center',
  },
  subtext: {
    marginTop: 8,
    fontSize: 14,
    color: nospiColors.purpleMid,
    textAlign: 'center',
  },
});
