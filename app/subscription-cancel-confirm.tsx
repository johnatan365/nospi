
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useSupabase } from '@/contexts/SupabaseContext';

const HEADING = '#1a0010';
const MUTED = '#555555';
const ACCENT = '#880E4F';

export default function SubscriptionCancelConfirmScreen() {
  const router = useRouter();
  const { user } = useSupabase();
  const [cancelling, setCancelling] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const benefits = [
    'Acceso ilimitado a eventos semanales',
    'Conoce personas reales en encuentros grupales',
    'Conexiones auténticas cada viernes',
    'Lugares frescos y caras nuevas cada semana',
    'Chats grupales y mapas (próximamente)',
  ];

  const handleCancelSubscription = async () => {
    setCancelling(true);
    console.log('User confirmed subscription cancellation');
    try {
      const { error } = await supabase.from('subscriptions').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('user_id', user?.id).eq('status', 'active');
      if (error) { console.error('Error cancelling subscription:', error); return; }
      console.log('Subscription cancelled successfully');
      setShowSuccessModal(true);
    } catch (error) {
      console.error('Failed to cancel subscription:', error);
    } finally {
      setCancelling(false);
    }
  };

  const handleKeepSubscription = () => {
    console.log('User decided to keep subscription');
    router.back();
  };

  const handleSuccessClose = () => {
    setShowSuccessModal(false);
    router.replace('/(tabs)/profile');
  };

  const titleText = '¿Estás seguro de cancelar tu plan?';
  const subtitleText = 'Al cancelar tu suscripción, perderás acceso a estos beneficios:';
  const keepButtonText = 'Mantener mi Plan';
  const cancelButtonText = 'Sí, Cancelar Plan';
  const successTitleText = 'Plan Cancelado';
  const successMessageText = 'Tu suscripción ha sido cancelada. Puedes volver a suscribirte en cualquier momento.';
  const successButtonText = 'Entendido';

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: true, title: 'Cancelar Plan', headerBackTitle: 'Atrás' }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <View style={styles.iconContainer}>
          <Text style={styles.warningIcon}>⚠️</Text>
        </View>

        <Text style={styles.title}>{titleText}</Text>
        <Text style={styles.subtitle}>{subtitleText}</Text>

        <View style={styles.benefitsContainer}>
          {benefits.map((benefit, index) => (
            <View key={index} style={styles.benefitItem}>
              <Text style={styles.benefitBullet}>•</Text>
              <Text style={styles.benefitText}>{benefit}</Text>
            </View>
          ))}
        </View>

        <View style={styles.buttonsContainer}>
          <View style={styles.keepButtonWrapper}>
            <LinearGradient colors={['#1a0010', '#880E4F', '#AD1457']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.keepButtonGradient}>
              <TouchableOpacity style={styles.keepButtonInner} onPress={handleKeepSubscription} activeOpacity={0.8} disabled={cancelling}>
                <Text style={styles.keepButtonText}>{keepButtonText}</Text>
              </TouchableOpacity>
            </LinearGradient>
          </View>

          <TouchableOpacity
            style={[styles.cancelButton, cancelling && styles.cancelButtonDisabled]}
            onPress={handleCancelSubscription}
            activeOpacity={0.8}
            disabled={cancelling}
          >
            {cancelling ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.cancelButtonText}>{cancelButtonText}</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={showSuccessModal} transparent animationType="fade" onRequestClose={handleSuccessClose}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.successIcon}>✓</Text>
            <Text style={styles.modalTitle}>{successTitleText}</Text>
            <Text style={styles.modalMessage}>{successMessageText}</Text>
            <View style={styles.modalButtonWrapper}>
              <LinearGradient colors={['#1a0010', '#880E4F', '#AD1457']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.modalButtonGradient}>
                <TouchableOpacity style={styles.modalButtonInner} onPress={handleSuccessClose} activeOpacity={0.8}>
                  <Text style={styles.modalButtonText}>{successButtonText}</Text>
                </TouchableOpacity>
              </LinearGradient>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { flex: 1 },
  contentContainer: { padding: 24, paddingBottom: 100 },
  iconContainer: { alignItems: 'center', marginTop: 20, marginBottom: 24 },
  warningIcon: { fontSize: 80 },
  title: { fontSize: 28, fontWeight: 'bold', color: HEADING, marginBottom: 16, textAlign: 'center' },
  subtitle: { fontSize: 18, color: MUTED, marginBottom: 32, textAlign: 'center', lineHeight: 26 },
  benefitsContainer: { backgroundColor: '#F9FAFB', borderRadius: 20, padding: 24, marginBottom: 32, borderWidth: 1, borderColor: '#E5E7EB' },
  benefitItem: { flexDirection: 'row', marginBottom: 16, alignItems: 'flex-start' },
  benefitBullet: { fontSize: 20, color: ACCENT, marginRight: 12, fontWeight: 'bold' },
  benefitText: { flex: 1, fontSize: 16, color: '#333333', lineHeight: 24 },
  buttonsContainer: { gap: 16 },
  keepButtonWrapper: { borderRadius: 16, overflow: 'hidden' },
  keepButtonGradient: { borderRadius: 16 },
  keepButtonInner: { paddingVertical: 18, alignItems: 'center' },
  keepButtonText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  cancelButton: { backgroundColor: '#F44336', paddingVertical: 18, borderRadius: 16, alignItems: 'center' },
  cancelButtonDisabled: { backgroundColor: 'rgba(244, 67, 54, 0.6)' },
  cancelButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalContent: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 32, width: '100%', maxWidth: 400, alignItems: 'center' },
  successIcon: { fontSize: 64, color: '#4CAF50', marginBottom: 16 },
  modalTitle: { fontSize: 24, fontWeight: 'bold', color: HEADING, marginBottom: 12, textAlign: 'center' },
  modalMessage: { fontSize: 16, color: MUTED, marginBottom: 24, textAlign: 'center', lineHeight: 24 },
  modalButtonWrapper: { borderRadius: 12, overflow: 'hidden', width: '100%' },
  modalButtonGradient: { borderRadius: 12 },
  modalButtonInner: { paddingVertical: 14, paddingHorizontal: 32, alignItems: 'center' },
  modalButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
