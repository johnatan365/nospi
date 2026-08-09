import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Linking, Modal, Platform, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useSupabase } from '@/contexts/SupabaseContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { formatTimeAmPm } from '@/utils/formatTime';

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
  registration_closed_men?: boolean;
  registration_closed_women?: boolean;
  event_status: 'draft' | 'published' | 'closed';
  price: number | null;
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
  // Exoneración de responsabilidad para caminatas autogestionadas: el checkbox
  // aparece solo cuando el evento es type='caminata' y debe marcarse
  // activamente (nunca premarcado) para habilitar el botón de unirse.
  const [waiverAccepted, setWaiverAccepted] = useState(false);

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

      // Igual que en el listado de eventos: si el admin apagó este evento
      // para el género del usuario (para balancear hombres/mujeres), se
      // trata como si no existiera — sin mensaje especial, mismo estado
      // que "Evento no encontrado" (cubre el caso de acceso directo por
      // link a un evento que ya no aparece en el listado).
      if (user?.id && (data?.registration_closed_men || data?.registration_closed_women)) {
        const { data: userRow } = await supabase.from('users').select('gender').eq('id', user.id).maybeSingle();
        const userGender = userRow?.gender || '';
        if ((userGender === 'hombre' && data.registration_closed_men) || (userGender === 'mujer' && data.registration_closed_women)) {
          setEvent(null);
          return;
        }
      }

      setEvent(data);
    } catch (error) {
      console.error('Failed to load event:', error);
    } finally {
      setLoading(false);
    }
  }, [id, user?.id]);

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
    if (event?.type === 'caminata' && !waiverAccepted) return;
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
      // Se guarda junto al evento pendiente; el punto de confirmación final
      // (subscription-plans.tsx / payment-callback.tsx) lo lee para setear
      // appointments.waiver_accepted_at al crear/actualizar la cita.
      if (event?.type === 'caminata') {
        await AsyncStorage.setItem('pending_waiver_accepted', 'true');
      } else {
        await AsyncStorage.removeItem('pending_waiver_accepted');
      }
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

  const eventTypeText = event.type === 'bar' ? 'Bar' : event.type === 'caminata' ? 'Caminata' : 'Restaurante';
  const eventIcon = event.type === 'bar' ? '🍸' : event.type === 'caminata' ? '🚶' : event.type === 'cafe' ? '☕' : '🍽️';
  const dateText = formatDate(event.date);
  // Etiqueta del grupo sin revelar cantidad. Si el registro de un genero esta
  // cerrado, el evento es del otro genero (ej. eventos solo de mujeres);
  // si ambos estan abiertos, es mixto.
  const participantsText =
    event.registration_closed_men && !event.registration_closed_women
      ? 'Mujeres'
      : event.registration_closed_women && !event.registration_closed_men
      ? 'Hombres'
      : 'Hombres y mujeres';
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
            {event.type === 'caminata' ? (
              <Image source={require('@/assets/images/icon-caminata.png')} style={{ width: 156, height: 132, marginBottom: 12, tintColor: '#6B6B6B' }} resizeMode="contain" />
            ) : event.type === 'bar' ? (
              <Image source={require('@/assets/images/icon-bar.png')} style={{ width: 156, height: 132, marginBottom: 12, tintColor: '#6B6B6B' }} resizeMode="contain" />
            ) : event.type === 'restaurante' ? (
              <Image source={require('@/assets/images/icon-restaurante.png')} style={{ width: 156, height: 132, marginBottom: 12, tintColor: '#6B6B6B' }} resizeMode="contain" />
            ) : event.type === 'cafe' ? (
              <Image source={require('@/assets/images/icon-cafe.png')} style={{ width: 156, height: 132, marginBottom: 12, tintColor: '#6B6B6B' }} resizeMode="contain" />
            ) : (
              <Text style={styles.eventIcon}>{eventIcon}</Text>
            )}
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
              <Text style={styles.infoValue}>{formatTimeAmPm(event.time)}</Text>
            </View>

            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>🌆 Ciudad</Text>
              <Text style={styles.infoValue}>{event.city}</Text>
            </View>

            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>👥 Grupo</Text>
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
                Ubicación se revelará un día antes del evento
              </Text>
            )}
          </View>

          {/* Action Section */}
          {!isEnrolled && (
            <View style={styles.actionSection}>
              {event.price === 0 && (
                <View style={styles.freeBadge}>
                  <Text style={styles.freeBadgeText}>Gratis</Text>
                </View>
              )}
              <Text style={styles.question}>¿Deseas asistir?</Text>

              {event.type === 'caminata' && (
                <TouchableOpacity
                  style={styles.waiverRow}
                  onPress={() => setWaiverAccepted(prev => !prev)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.checkbox, waiverAccepted && styles.checkboxActive]}>
                    {waiverAccepted && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.waiverText}>
                    Leí la información anterior y acepto participar bajo mi propia responsabilidad.
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[
                  styles.confirmButton,
                  (confirming || (event.type === 'caminata' && !waiverAccepted)) && styles.confirmButtonDisabled,
                ]}
                onPress={handleConfirm}
                disabled={confirming || (event.type === 'caminata' && !waiverAccepted)}
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
  waiverRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#AAA',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    marginTop: 1,
  },
  checkboxActive: {
    backgroundColor: nospiColors.purpleDark,
    borderColor: nospiColors.purpleDark,
  },
  checkmark: {
    color: nospiColors.white,
    fontSize: 14,
    fontWeight: 'bold',
  },
  waiverText: {
    flex: 1,
    fontSize: 13.5,
    color: '#555',
    lineHeight: 18,
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
  freeBadge: {
    alignSelf: 'center',
    backgroundColor: '#D1FAE5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 10,
  },
  freeBadgeText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#059669',
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
