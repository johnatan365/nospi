import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Linking, Modal, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useSupabase } from '@/contexts/SupabaseContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';

interface Event {
  id: string;
  name: string;
  city: string;
  description: string;
  type: string;
  date: string;
  time: string;
  location_name: string;
  location_address: string;
  maps_link: string;
  is_location_revealed: boolean;
  max_participants: number;
  event_status: 'draft' | 'published' | 'closed';
}

export default function EventDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { user } = useSupabase();
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const loadEvent = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.error('Error loading event:', error);
        return;
      }

      setEvent(data);
    } catch (error) {
      console.error('Failed to load event:', error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const checkEnrollment = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('appointments')
        .select('id')
        .eq('user_id', user.id)
        .eq('event_id', id)
        .maybeSingle();

      if (error) {
        console.error('Error checking enrollment:', error);
        return;
      }

      const enrolled = !!data;
      setIsEnrolled(enrolled);
    } catch (error) {
      console.error('Failed to check enrollment:', error);
    }
  }, [user?.id, id]);

  useEffect(() => {
    if (id) {
      loadEvent();
      checkEnrollment();
    }
  }, [id, loadEvent, checkEnrollment]);

  // Re-check enrollment whenever the screen comes back into focus (e.g. after payment)
  useFocusEffect(
    useCallback(() => {
      if (id) {
        console.log('EventDetails: screen focused, re-checking enrollment for event:', id);
        checkEnrollment();
      }
    }, [id, checkEnrollment])
  );

  // Show success modal if navigated back with paymentSuccess param.
  // Wait 1 second before checking enrollment to allow DB propagation on Android.
  const { paymentSuccess } = useLocalSearchParams<{ paymentSuccess?: string }>();
  useEffect(() => {
    if (paymentSuccess === 'true') {
      console.log('EventDetails: paymentSuccess param detected, waiting 1s then checking enrollment');
      const timer = setTimeout(() => {
        checkEnrollment();
        setShowSuccessModal(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [paymentSuccess, checkEnrollment]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const options: Intl.DateTimeFormatOptions = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    };
    return date.toLocaleDateString('es-ES', options);
  };

  const handleOpenMaps = () => {
    if (!event?.maps_link) return;
    
    Linking.openURL(event.maps_link).catch(err => {
      console.error('Failed to open maps link:', err);
    });
  };

  const handleCancel = () => {
    console.log('User pressed Cancelar in event details');
    router.back();
  };

  const handleConfirm = async () => {
    setConfirming(true);
    
    try {
      const { data: existingAppointment } = await supabase
        .from('appointments')
        .select('*')
        .eq('user_id', user?.id)
        .eq('event_id', id)
        .maybeSingle();

      if (existingAppointment) {
        if (existingAppointment.status === 'confirmada' || existingAppointment.payment_status === 'completed') {
          setConfirming(false);
          router.replace('/(tabs)/appointments');
          return;
        }
      }

      const eventId = Array.isArray(id) ? id[0] : id as string;
      await AsyncStorage.setItem('pending_event_confirmation', eventId);
      setConfirming(false);
      // En web, router.push puede pasar por index.tsx causando pantalla en blanco.
      // router.replace navega directamente sin re-evaluar la ruta raíz.
      if (Platform.OS === 'web') {
        router.replace('/subscription-plans');
      } else {
        router.push('/subscription-plans');
      }
    } catch (error) {
      console.error('Failed to process confirmation:', error);
      setConfirming(false);
    }
  };

  if (loading) {
    return (
      <LinearGradient
        colors={['#1a0010', '#880E4F', '#AD1457']}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <Stack.Screen options={{ headerShown: true, title: 'Detalles del Evento', headerBackTitle: 'Atrás' }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={nospiColors.purpleDark} />
        </View>
      </LinearGradient>
    );
  }

  if (!event) {
    return (
      <LinearGradient
        colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <Stack.Screen options={{ headerShown: true, title: 'Detalles del Evento', headerBackTitle: 'Atrás' }} />
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>Evento no encontrado</Text>
        </View>
      </LinearGradient>
    );
  }

  const eventTypeText = event.type === 'bar' ? 'Bar' : 'Restaurante';
  const eventIcon = event.type === 'bar' ? '🍸' : '🍽️';
  const dateText = formatDate(event.date);
  const participantsText = `${event.max_participants} participantes`;
  const showLocation = isEnrolled && event.is_location_revealed;

  return (
    <LinearGradient
      colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
      style={styles.gradient}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <Stack.Screen options={{
        headerShown: true,
        title: 'Detalles del Evento',
        headerLeft: () => (
          <TouchableOpacity onPress={handleCancel} style={{ paddingHorizontal: 8 }}>
            <Text style={{ color: '#880E4F', fontSize: 16, fontWeight: '500' }}>Cancelar</Text>
          </TouchableOpacity>
        ),
      }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <View style={styles.eventCard}>
          {/* Header - Icon and Title */}
          <View style={styles.headerSection}>
            <Text style={styles.eventIcon}>{eventIcon}</Text>
            <Text style={styles.eventName}>{event.name}</Text>
            <Text style={styles.eventType}>{eventTypeText}</Text>
          </View>
          
          {/* Info Grid - Compact 2-column layout */}
          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>📅 Fecha</Text>
              <Text style={styles.infoValue}>{dateText}</Text>
            </View>

            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>🕐 Hora</Text>
              <Text style={styles.infoValue}>{event.time}</Text>
            </View>

            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>🌆 Ciudad</Text>
              <Text style={styles.infoValue}>{event.city}</Text>
            </View>

            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>👥 Personas</Text>
              <Text style={styles.infoValue}>{participantsText}</Text>
            </View>
          </View>

          {event.description && (
            <View style={styles.descriptionSection}>
              <Text style={styles.descriptionText}>{event.description}</Text>
            </View>
          )}

          {/* Location Section - Compact */}
          <View style={styles.locationSection}>
            <Text style={styles.locationTitle}>📍 Ubicación</Text>
            {showLocation ? (
              <>
                <Text style={styles.locationName}>{event.location_name}</Text>
                <Text style={styles.locationAddress}>{event.location_address}</Text>
                {event.maps_link && (
                  <TouchableOpacity
                    style={styles.mapsButton}
                    onPress={handleOpenMaps}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.mapsButtonText}>🗺️ Abrir Maps</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <Text style={styles.locationPlaceholder}>
                Ubicación se revelará 48 horas antes del evento
              </Text>
            )}
          </View>

          {/* Action Section */}
          {!isEnrolled && (
            <View style={styles.actionSection}>
              <Text style={styles.question}>¿Deseas asistir?</Text>
              <TouchableOpacity
                style={[styles.confirmButton, confirming && styles.confirmButtonDisabled]}
                onPress={handleConfirm}
                disabled={confirming}
                activeOpacity={0.8}
              >
                {confirming ? (
                  <ActivityIndicator color={nospiColors.white} />
                ) : (
                  <Text style={styles.confirmButtonText}>Confirmar Asistencia</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {isEnrolled && (
            <View style={styles.enrolledBadge}>
              <Text style={styles.enrolledText}>✓ Ya estás inscrito</Text>
            </View>
          )}
        </View>
      </ScrollView>

      <Modal visible={showSuccessModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.successIcon}>✅</Text>
            <Text style={styles.successTitle}>¡Pago Exitoso!</Text>
            <Text style={styles.successMessage}>Tu asistencia al evento ha sido confirmada</Text>
            <TouchableOpacity
              style={styles.successButton}
              onPress={() => {
                console.log('EventDetails: success modal dismissed, navigating to appointments');
                setShowSuccessModal(false);
                router.replace('/(tabs)/appointments');
              }}
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
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  eventCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 20,
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  eventIcon: {
    fontSize: 60,
    marginBottom: 12,
  },
  eventName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 6,
    textAlign: 'center',
  },
  eventType: {
    fontSize: 18,
    color: nospiColors.purpleMid,
    fontWeight: '600',
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingTop: 16,
  },
  infoItem: {
    width: '50%',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 13,
    color: '#666',
    fontWeight: '600',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  descriptionSection: {
    marginBottom: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  descriptionText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  locationSection: {
    marginBottom: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  locationTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 8,
  },
  locationName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  locationAddress: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  locationPlaceholder: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
  mapsButton: {
    backgroundColor: '#4285F4',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
  },
  mapsButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: 'bold',
  },
  actionSection: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  question: {
    fontSize: 18,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    textAlign: 'center',
    marginBottom: 16,
  },
  confirmButton: {
    backgroundColor: nospiColors.purpleDark,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  confirmButtonDisabled: {
    backgroundColor: nospiColors.purpleMid,
    opacity: 0.6,
  },
  confirmButtonText: {
    color: nospiColors.white,
    fontSize: 17,
    fontWeight: '700',
  },
  enrolledBadge: {
    backgroundColor: '#10B981',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
  },
  enrolledText: {
    color: 'white',
    fontSize: 15,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  successIcon: {
    fontSize: 56,
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: nospiColors.purpleDark,
    marginBottom: 8,
    textAlign: 'center',
  },
  successMessage: {
    fontSize: 16,
    color: '#555',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  successButton: {
    backgroundColor: nospiColors.purpleDark,
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 14,
    alignItems: 'center',
  },
  successButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});