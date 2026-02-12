
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useSupabase } from '@/contexts/SupabaseContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

  useEffect(() => {
    if (id) {
      loadEvent();
      checkEnrollment();
    }
  }, [id]);

  const loadEvent = async () => {
    try {
      console.log('Loading event details:', id);
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.error('Error loading event:', error);
        return;
      }

      console.log('Event loaded successfully');
      setEvent(data);
    } catch (error) {
      console.error('Failed to load event:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkEnrollment = async () => {
    if (!user?.id) return;

    try {
      console.log('Checking if user is enrolled in event:', id);
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
      console.log('User enrolled:', enrolled);
      setIsEnrolled(enrolled);
    } catch (error) {
      console.error('Failed to check enrollment:', error);
    }
  };

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
    
    console.log('Opening maps link:', event.maps_link);
    Linking.openURL(event.maps_link).catch(err => {
      console.error('Failed to open maps link:', err);
    });
  };

  const handleConfirm = async () => {
    console.log('User confirmed attendance for event:', id);
    setConfirming(true);
    
    try {
      // Check if user already has an appointment for this event
      const { data: existingAppointment } = await supabase
        .from('appointments')
        .select('*')
        .eq('user_id', user?.id)
        .eq('event_id', id)
        .maybeSingle();

      if (existingAppointment) {
        console.log('User already has an appointment for this event');
        setConfirming(false);
        router.push('/(tabs)/appointments');
        return;
      }

      // All users must pay per event - no subscription check
      console.log('Storing pending event and redirecting to payment screen');
      await AsyncStorage.setItem('pending_event_confirmation', id as string);
      console.log('Stored pending event ID:', id);
      setConfirming(false);
      router.push('/subscription-plans');
    } catch (error) {
      console.error('Failed to process confirmation:', error);
      setConfirming(false);
    }
  };

  if (loading) {
    return (
      <LinearGradient
        colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
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
      <Stack.Screen options={{ headerShown: true, title: 'Detalles del Evento', headerBackTitle: 'Atrás' }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <View style={styles.eventCard}>
          <Text style={styles.eventIcon}>{eventIcon}</Text>
          <Text style={styles.eventName}>{event.name}</Text>
          <Text style={styles.eventType}>{eventTypeText}</Text>
          
          <View style={styles.divider} />
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Fecha:</Text>
            <Text style={styles.detailValue}>{dateText}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Hora:</Text>
            <Text style={styles.detailValue}>{event.time}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Ciudad:</Text>
            <Text style={styles.detailValue}>{event.city}</Text>
          </View>

          {event.description && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Descripción:</Text>
              <Text style={styles.detailValue}>{event.description}</Text>
            </View>
          )}

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Participantes:</Text>
            <Text style={styles.detailValue}>{participantsText}</Text>
          </View>

          <View style={styles.divider} />

          {/* Location Section */}
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
                    <Text style={styles.mapsButtonText}>🗺️ Abrir en Maps</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <Text style={styles.locationPlaceholder}>
                Ubicación se revelará próximamente.
              </Text>
            )}
          </View>

          <View style={styles.divider} />

          {!isEnrolled && (
            <>
              <Text style={styles.question}>¿Deseas asistir a esta cita?</Text>
              <Text style={styles.description}>
                Al confirmar, te unirás a un grupo de {event.max_participants} personas para un encuentro en persona.
              </Text>

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
            </>
          )}

          {isEnrolled && (
            <View style={styles.enrolledBadge}>
              <Text style={styles.enrolledText}>✓ Ya estás inscrito en este evento</Text>
            </View>
          )}
        </View>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: nospiColors.purpleDark,
    textAlign: 'center',
  },
  eventCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  eventIcon: {
    fontSize: 80,
    marginBottom: 16,
  },
  eventName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 8,
    textAlign: 'center',
  },
  eventType: {
    fontSize: 20,
    color: nospiColors.purpleMid,
    fontWeight: '600',
    marginBottom: 24,
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: '#E0E0E0',
    marginVertical: 24,
  },
  detailRow: {
    width: '100%',
    marginBottom: 16,
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 16,
    color: '#333',
  },
  locationSection: {
    width: '100%',
    marginBottom: 16,
  },
  locationTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 12,
  },
  locationName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  locationAddress: {
    fontSize: 15,
    color: '#666',
    marginBottom: 16,
  },
  locationPlaceholder: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
  mapsButton: {
    backgroundColor: '#4285F4',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  mapsButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  question: {
    fontSize: 20,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    textAlign: 'center',
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 32,
  },
  confirmButton: {
    backgroundColor: nospiColors.purpleDark,
    paddingVertical: 18,
    paddingHorizontal: 48,
    borderRadius: 16,
    width: '100%',
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
    fontSize: 18,
    fontWeight: '700',
  },
  enrolledBadge: {
    backgroundColor: '#10B981',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  enrolledText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
