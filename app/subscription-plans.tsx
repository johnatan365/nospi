
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, ActivityIndicator, Modal, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { useRouter, Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useSupabase } from '@/contexts/SupabaseContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

type PaymentMethod = 'google_pay' | 'apple_pay' | 'card' | 'pse';

export default function SubscriptionPlansScreen() {
  const router = useRouter();
  const { user } = useSupabase();
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod | null>(null);
  const [processing, setProcessing] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<number>(3678);
  const [loadingRate, setLoadingRate] = useState(true);

  useEffect(() => {
    console.log('Payment screen loaded - $5 per event');
    setSelectedPayment(null);
    setProcessing(false);
    fetchExchangeRate();
  }, []);

  const fetchExchangeRate = async () => {
    try {
      console.log('Fetching current USD to COP exchange rate');
      setLoadingRate(true);
      
      // Fetch from a reliable exchange rate API
      const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
      const data = await response.json();
      
      if (data && data.rates && data.rates.COP) {
        const rate = Math.round(data.rates.COP);
        console.log('Current exchange rate: 1 USD =', rate, 'COP');
        setExchangeRate(rate);
      } else {
        console.log('Using fallback exchange rate');
        setExchangeRate(3678);
      }
    } catch (error) {
      console.error('Error fetching exchange rate:', error);
      console.log('Using fallback exchange rate');
      setExchangeRate(3678);
    } finally {
      setLoadingRate(false);
    }
  };

  const priceUSD = 5.00;
  const priceCOP = priceUSD * exchangeRate;
  const priceUSDText = `$${priceUSD.toFixed(2)} USD`;
  const priceCOPText = `$${priceCOP.toLocaleString('es-CO')} COP`;
  const totalUSDText = `$${priceUSD.toFixed(2)} USD`;
  const totalCOPText = `$${priceCOP.toLocaleString('es-CO')} COP`;

  const handlePaymentSelect = (method: PaymentMethod) => {
    console.log('User selected payment method:', method);
    setSelectedPayment(method);
  };

  const handleContinue = async () => {
    if (!selectedPayment) {
      console.log('No payment method selected');
      return;
    }

    setProcessing(true);
    console.log('Processing $5 payment for event with method:', selectedPayment);

    try {
      const pendingEventId = await AsyncStorage.getItem('pending_event_confirmation');
      console.log('Processing payment for event:', pendingEventId);

      if (pendingEventId) {
        console.log('Creating appointment for event:', pendingEventId);
        
        const { data: existingAppointment } = await supabase
          .from('appointments')
          .select('*')
          .eq('user_id', user?.id)
          .eq('event_id', pendingEventId)
          .maybeSingle();

        if (!existingAppointment) {
          const { error: appointmentError } = await supabase
            .from('appointments')
            .insert({
              user_id: user?.id,
              event_id: pendingEventId,
              status: 'confirmada',
              payment_status: 'completed',
            });

          if (appointmentError) {
            console.error('Error creating appointment:', appointmentError);
            setProcessing(false);
            return;
          } else {
            console.log('Appointment created successfully');
            await AsyncStorage.setItem('should_check_notification_prompt', 'true');
          }
        } else {
          console.log('Appointment already exists for this event');
        }

        await AsyncStorage.removeItem('pending_event_confirmation');
        console.log('Removed pending event from AsyncStorage');
      }

      setProcessing(false);
      setShowSuccessModal(true);
    } catch (error) {
      console.error('Failed to process payment:', error);
      setProcessing(false);
    }
  };

  const handleSuccessClose = () => {
    console.log('User closed success modal, navigating to appointments');
    setShowSuccessModal(false);
    router.replace('/(tabs)/appointments');
  };

  const showGooglePay = Platform.OS === 'android' || Platform.OS === 'web';
  const showApplePay = Platform.OS === 'ios';

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
        <Text style={styles.subtitle}>
          Paga {priceUSDText} ({priceCOPText}) para confirmar tu asistencia a este evento
        </Text>

        <View style={styles.priceCard}>
          <Text style={styles.priceLabel}>Precio por evento</Text>
          <Text style={styles.priceAmount}>{priceUSDText}</Text>
          {loadingRate ? (
            <ActivityIndicator size="small" color={nospiColors.purpleMid} style={{ marginVertical: 8 }} />
          ) : (
            <Text style={styles.priceAmountCOP}>{priceCOPText}</Text>
          )}
          <Text style={styles.priceDescription}>
            Pago único por evento. Sin suscripciones ni cargos recurrentes.
          </Text>
          {!loadingRate && (
            <Text style={styles.exchangeRateNote}>
              Tasa de cambio actual: 1 USD = {exchangeRate.toLocaleString('es-CO')} COP
            </Text>
          )}
        </View>

        <View style={styles.benefitsContainer}>
          <View style={styles.benefitItem}>
            <Text style={styles.benefitIcon}>✨</Text>
            <View style={styles.benefitText}>
              <Text style={styles.benefitTitle}>Acceso al evento</Text>
              <Text style={styles.benefitDescription}>
                Confirma tu lugar en el evento seleccionado
              </Text>
            </View>
          </View>

          <View style={styles.benefitItem}>
            <Text style={styles.benefitIcon}>🎉</Text>
            <View style={styles.benefitText}>
              <Text style={styles.benefitTitle}>Conoce gente nueva</Text>
              <Text style={styles.benefitDescription}>
                Conecta con personas afines en un ambiente relajado
              </Text>
            </View>
          </View>

          <View style={styles.benefitItem}>
            <Text style={styles.benefitIcon}>💜</Text>
            <View style={styles.benefitText}>
              <Text style={styles.benefitTitle}>Experiencia única</Text>
              <Text style={styles.benefitDescription}>
                Disfruta de una experiencia social inolvidable
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.paymentSection}>
          <View style={styles.paymentTitleContainer}>
            <Text style={styles.paymentTitle}>Método de Pago</Text>
            <Text style={styles.paymentSubtitle}>⚠️ Selecciona una opción para continuar</Text>
          </View>

          {showGooglePay && (
            <TouchableOpacity
              style={[styles.paymentButton, selectedPayment === 'google_pay' && styles.paymentButtonSelected]}
              onPress={() => handlePaymentSelect('google_pay')}
              activeOpacity={0.8}
            >
              <View style={styles.paymentButtonContent}>
                {selectedPayment === 'google_pay' && (
                  <View style={styles.checkmark}>
                    <Text style={styles.checkmarkText}>✓</Text>
                  </View>
                )}
                <Image 
                  source={require('@/assets/images/a1e488fd-eb8f-46c7-9f63-2509b2c9795f.png')} 
                  style={styles.paymentIcon}
                  resizeMode="contain"
                />
              </View>
            </TouchableOpacity>
          )}

          {showApplePay && (
            <TouchableOpacity
              style={[styles.paymentButton, selectedPayment === 'apple_pay' && styles.paymentButtonSelected]}
              onPress={() => handlePaymentSelect('apple_pay')}
              activeOpacity={0.8}
            >
              <View style={styles.paymentButtonContent}>
                {selectedPayment === 'apple_pay' && (
                  <View style={styles.checkmark}>
                    <Text style={styles.checkmarkText}>✓</Text>
                  </View>
                )}
                <Image 
                  source={require('@/assets/images/ebb112d6-8a13-4a7a-9976-1e914bb86422.png')} 
                  style={styles.paymentIcon}
                  resizeMode="contain"
                />
              </View>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.paymentButton, selectedPayment === 'card' && styles.paymentButtonSelected]}
            onPress={() => handlePaymentSelect('card')}
            activeOpacity={0.8}
          >
            <View style={styles.paymentButtonContent}>
              {selectedPayment === 'card' && (
                <View style={styles.checkmark}>
                  <Text style={styles.checkmarkText}>✓</Text>
                </View>
              )}
              <Text style={styles.paymentButtonText}>💳 Tarjeta de Crédito/Débito</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.paymentButton, selectedPayment === 'pse' && styles.paymentButtonSelected]}
            onPress={() => handlePaymentSelect('pse')}
            activeOpacity={0.8}
          >
            <View style={styles.paymentButtonContent}>
              {selectedPayment === 'pse' && (
                <View style={styles.checkmark}>
                  <Text style={styles.checkmarkText}>✓</Text>
                </View>
              )}
              <Image 
                source={require('@/assets/images/96868a8c-449f-4c99-af42-39110c03f5c3.png')} 
                style={styles.paymentIcon}
                resizeMode="contain"
              />
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.summaryContainer}>
          <Text style={styles.summaryText}>Total a pagar:</Text>
          <Text style={styles.summaryAmount}>{totalUSDText}</Text>
          {!loadingRate && (
            <Text style={styles.summaryAmountCOP}>{totalCOPText}</Text>
          )}
        </View>

        <TouchableOpacity
          style={[styles.continueButton, (!selectedPayment || processing) && styles.continueButtonDisabled]}
          onPress={handleContinue}
          disabled={!selectedPayment || processing}
          activeOpacity={0.8}
        >
          {processing ? (
            <ActivityIndicator color={nospiColors.purpleDark} />
          ) : (
            <Text style={styles.continueButtonText}>Pagar {totalUSDText}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={showSuccessModal}
        transparent
        animationType="fade"
        onRequestClose={handleSuccessClose}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.successIcon}>✓</Text>
            <Text style={styles.successTitle}>¡Pago Exitoso!</Text>
            <Text style={styles.successMessage}>
              Tu asistencia al evento ha sido confirmada
            </Text>
            <TouchableOpacity
              style={styles.successButton}
              onPress={handleSuccessClose}
              activeOpacity={0.8}
            >
              <Text style={styles.successButtonText}>Ver mis citas</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 24,
    paddingBottom: 100,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: nospiColors.purpleDark,
    opacity: 0.8,
    marginBottom: 32,
    lineHeight: 24,
  },
  priceCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 32,
    marginBottom: 24,
    alignItems: 'center',
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  priceLabel: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  priceAmount: {
    fontSize: 48,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 8,
  },
  priceAmountCOP: {
    fontSize: 24,
    fontWeight: '600',
    color: nospiColors.purpleMid,
    marginBottom: 16,
  },
  priceDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 8,
  },
  exchangeRateNote: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  benefitsContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 32,
  },
  benefitItem: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  benefitIcon: {
    fontSize: 24,
    marginRight: 16,
  },
  benefitText: {
    flex: 1,
  },
  benefitTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  benefitDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  paymentSection: {
    marginBottom: 24,
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    borderRadius: 20,
    padding: 20,
    borderWidth: 3,
    borderColor: '#F59E0B',
  },
  paymentTitleContainer: {
    marginBottom: 16,
  },
  paymentTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 8,
  },
  paymentSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400E',
  },
  paymentButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 3,
    borderColor: 'transparent',
    minHeight: 70,
  },
  paymentButtonSelected: {
    borderColor: nospiColors.purpleDark,
    backgroundColor: nospiColors.white,
  },
  paymentButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: nospiColors.purpleDark,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  checkmarkText: {
    color: nospiColors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  paymentButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  paymentIcon: {
    width: 100,
    height: 40,
  },
  summaryContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    alignItems: 'center',
  },
  summaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  summaryAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 4,
  },
  summaryAmountCOP: {
    fontSize: 18,
    fontWeight: '600',
    color: nospiColors.purpleMid,
  },
  continueButton: {
    backgroundColor: nospiColors.white,
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  continueButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    shadowOpacity: 0,
    elevation: 0,
  },
  continueButtonText: {
    color: nospiColors.purpleDark,
    fontSize: 18,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: nospiColors.white,
    borderRadius: 24,
    padding: 40,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  successIcon: {
    fontSize: 80,
    color: '#4CAF50',
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 16,
    textAlign: 'center',
  },
  successMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  successButton: {
    backgroundColor: nospiColors.purpleDark,
    paddingVertical: 18,
    paddingHorizontal: 48,
    borderRadius: 16,
    width: '100%',
    alignItems: 'center',
  },
  successButtonText: {
    color: nospiColors.white,
    fontSize: 18,
    fontWeight: '700',
  },
});
