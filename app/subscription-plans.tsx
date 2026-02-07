
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { useRouter, Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useSupabase } from '@/contexts/SupabaseContext';

type PlanType = '1_month' | '3_months' | '6_months';
type PaymentMethod = 'google_pay' | 'apple_pay' | 'card' | 'pse';

export default function SubscriptionPlansScreen() {
  const router = useRouter();
  const { user } = useSupabase();
  const [selectedPlan, setSelectedPlan] = useState<PlanType>('3_months');
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod | null>(null);
  const [processing, setProcessing] = useState(false);

  const plans = [
    {
      type: '1_month' as PlanType,
      duration: '1 Mes',
      price: 8.49,
      pricePerWeek: 2.12,
      savings: null,
    },
    {
      type: '3_months' as PlanType,
      duration: '3 Meses',
      price: 19.99,
      originalPrice: 25.47,
      pricePerWeek: 1.67,
      savings: '22%',
    },
    {
      type: '6_months' as PlanType,
      duration: '6 Meses',
      price: 26.99,
      originalPrice: 50.94,
      pricePerWeek: 1.12,
      savings: '47%',
    },
  ];

  const benefits = [
    {
      icon: '✨',
      title: 'Acceso ilimitado',
      description: 'Conoce nuevas personas a través de cenas, bebidas y experiencias exclusivas de Nospi que ocurren cada semana. Tu ciudad se volvió mucho más social.',
    },
    {
      icon: '🎉',
      title: 'Siempre algo nuevo',
      description: 'Lugares frescos, caras nuevas, nuevas vibras - cada semana se siente diferente.',
    },
    {
      icon: '💜',
      title: 'Conexiones reales',
      description: 'Después de cada evento, conecta y mantente en contacto con personas con las que realmente conectaste.',
    },
    {
      icon: '🔄',
      title: 'Flexibilidad total',
      description: 'Cancela en cualquier momento. Cambia tu plan u obtén un reembolso dentro de 14 días - sin ataduras.',
    },
    {
      icon: '🚀',
      title: 'Y apenas estamos comenzando',
      description: 'Pronto: chats grupales, mapas, nuevos tipos de eventos y más formas de hacer que tu ciudad se sienta como en casa.',
    },
  ];

  const handlePlanSelect = (planType: PlanType) => {
    console.log('User selected plan:', planType);
    setSelectedPlan(planType);
  };

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
    console.log('Processing payment for plan:', selectedPlan, 'with method:', selectedPayment);

    try {
      const selectedPlanData = plans.find(p => p.type === selectedPlan);
      if (!selectedPlanData) return;

      const startDate = new Date();
      const endDate = new Date();
      
      if (selectedPlan === '1_month') {
        endDate.setMonth(endDate.getMonth() + 1);
      } else if (selectedPlan === '3_months') {
        endDate.setMonth(endDate.getMonth() + 3);
      } else if (selectedPlan === '6_months') {
        endDate.setMonth(endDate.getMonth() + 6);
      }

      const { error } = await supabase
        .from('subscriptions')
        .insert({
          user_id: user?.id,
          plan_type: selectedPlan,
          price: selectedPlanData.price,
          status: 'active',
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          payment_method: selectedPayment,
          auto_renew: true,
        });

      if (error) {
        console.error('Error creating subscription:', error);
        return;
      }

      console.log('Subscription created successfully');
      router.push('/(tabs)/profile');
    } catch (error) {
      console.error('Failed to create subscription:', error);
    } finally {
      setProcessing(false);
    }
  };

  const selectedPlanData = plans.find(p => p.type === selectedPlan);
  const showGooglePay = Platform.OS === 'android' || Platform.OS === 'web';
  const showApplePay = Platform.OS === 'ios';

  return (
    <LinearGradient
      colors={[nospiColors.purpleDark, nospiColors.purpleMid, nospiColors.purpleLight]}
      style={styles.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <Stack.Screen options={{ headerShown: true, title: 'Nuestros Planes', headerBackTitle: 'Atrás' }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.title}>Nuestros planes</Text>
        <Text style={styles.subtitle}>
          Los miembros tienen hasta un 93% más de probabilidades de encontrar conexiones duraderas
        </Text>

        <View style={styles.plansContainer}>
          {plans.map((plan) => {
            const isSelected = selectedPlan === plan.type;
            const pricePerWeekText = `$${plan.pricePerWeek}/semana`;
            const priceText = `$${plan.price}`;
            const originalPriceText = plan.originalPrice ? `$${plan.originalPrice}` : null;

            return (
              <TouchableOpacity
                key={plan.type}
                style={[styles.planCard, isSelected && styles.planCardSelected]}
                onPress={() => handlePlanSelect(plan.type)}
                activeOpacity={0.8}
              >
                <View style={styles.planHeader}>
                  <View style={styles.planRadio}>
                    {isSelected && <View style={styles.planRadioInner} />}
                  </View>
                  <View style={styles.planInfo}>
                    <Text style={styles.planDuration}>{plan.duration}</Text>
                    {originalPriceText && (
                      <Text style={styles.planOriginalPrice}>{originalPriceText}</Text>
                    )}
                    <Text style={styles.planPrice}>{priceText}</Text>
                  </View>
                  <View style={styles.planRight}>
                    {plan.savings && (
                      <View style={styles.savingsBadge}>
                        <Text style={styles.savingsText}>Ahorra {plan.savings}</Text>
                      </View>
                    )}
                    <Text style={styles.planPricePerWeek}>{pricePerWeekText}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.benefitsContainer}>
          {benefits.map((benefit, index) => (
            <View key={index} style={styles.benefitItem}>
              <Text style={styles.benefitIcon}>{benefit.icon}</Text>
              <View style={styles.benefitText}>
                <Text style={styles.benefitTitle}>{benefit.title}</Text>
                <Text style={styles.benefitDescription}>{benefit.description}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.paymentSection}>
          <Text style={styles.paymentTitle}>Método de Pago</Text>

          {showGooglePay && (
            <TouchableOpacity
              style={[styles.paymentButton, selectedPayment === 'google_pay' && styles.paymentButtonSelected]}
              onPress={() => handlePaymentSelect('google_pay')}
              activeOpacity={0.8}
            >
              <Text style={styles.paymentButtonText}>Google Pay</Text>
            </TouchableOpacity>
          )}

          {showApplePay && (
            <TouchableOpacity
              style={[styles.paymentButton, selectedPayment === 'apple_pay' && styles.paymentButtonSelected]}
              onPress={() => handlePaymentSelect('apple_pay')}
              activeOpacity={0.8}
            >
              <Text style={styles.paymentButtonText}>Apple Pay</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.paymentButton, selectedPayment === 'card' && styles.paymentButtonSelected]}
            onPress={() => handlePaymentSelect('card')}
            activeOpacity={0.8}
          >
            <Text style={styles.paymentButtonText}>Tarjeta de Crédito/Débito</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.paymentButton, selectedPayment === 'pse' && styles.paymentButtonSelected]}
            onPress={() => handlePaymentSelect('pse')}
            activeOpacity={0.8}
          >
            <Text style={styles.paymentButtonText}>PSE</Text>
          </TouchableOpacity>
        </View>

        {selectedPlanData && (
          <View style={styles.summaryContainer}>
            <Text style={styles.summaryText}>
              ${selectedPlanData.price} cada {selectedPlan === '1_month' ? 'mes' : selectedPlan === '3_months' ? '3 meses' : '6 meses'}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.continueButton, (!selectedPayment || processing) && styles.continueButtonDisabled]}
          onPress={handleContinue}
          disabled={!selectedPayment || processing}
          activeOpacity={0.8}
        >
          <Text style={styles.continueButtonText}>
            {processing ? 'Procesando...' : 'Continuar'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
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
    color: nospiColors.white,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: nospiColors.white,
    opacity: 0.9,
    marginBottom: 32,
    lineHeight: 24,
  },
  plansContainer: {
    marginBottom: 32,
  },
  planCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  planCardSelected: {
    borderColor: nospiColors.purpleDark,
    backgroundColor: nospiColors.white,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  planRadio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: nospiColors.purpleDark,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  planRadioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: nospiColors.purpleDark,
  },
  planInfo: {
    flex: 1,
  },
  planDuration: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  planOriginalPrice: {
    fontSize: 14,
    color: '#999',
    textDecorationLine: 'line-through',
    marginBottom: 2,
  },
  planPrice: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  planRight: {
    alignItems: 'flex-end',
  },
  savingsBadge: {
    backgroundColor: '#4CAF50',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  savingsText: {
    color: nospiColors.white,
    fontSize: 12,
    fontWeight: '600',
  },
  planPricePerWeek: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
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
  },
  paymentTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: nospiColors.white,
    marginBottom: 16,
  },
  paymentButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  paymentButtonSelected: {
    borderColor: nospiColors.purpleDark,
    backgroundColor: nospiColors.white,
  },
  paymentButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  summaryContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    alignItems: 'center',
  },
  summaryText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
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
});
