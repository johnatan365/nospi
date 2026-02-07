
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useSupabase } from '@/contexts/SupabaseContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Event {
  id: string;
  type: string;
  date: string;
  time: string;
  location: string;
  max_participants: number;
  current_participants: number;
  status: string;
}

export default function EventDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { user } = useSupabase();
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (id) {
      loadEvent();
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

  const handleConfirm = async () => {
    console.log('User confirmed attendance for event:', id);
    
    if (!user) {
      console.log('User not authenticated, redirecting to login');
      router.push('/login');
      return;
    }

    setConfirming(true);
    
    try {
      // Check if user has active subscription
      const { data: subscription, error: subError } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      if (subError || !subscription) {
        console.log('User has no active subscription, redirecting to payment');
        setConfirming(false);
        // Store the event ID to confirm after payment
        await AsyncStorage.setItem('pending_event_confirmation', id as string);
        router.push('/subscription-plans');
        return;
      }

      console.log('User has active subscription, checking for existing appointment');

      // Check if user already has an appointment for this event
      const { data: existingAppointment } = await supabase
        .from('appointments')
        .select('*')
        .eq('user_id', user.id)
        .eq('event_id', id)
        .single();

      if (existingAppointment) {
        console.log('User already has an appointment for this event');
        setConfirming(false);
        router.push('/(tabs)/appointments');
        return;
      }

      // Create appointment
      console.log('Creating appointment for event:', id);
      const { error } = await supabase
        .from('appointments')
        .insert({
          user_id: user.id,
          event_id: id,
          status: 'confirmada',
          payment_status: 'completed',
        });

      if (error) {
        console.error('Error creating appointment:', error);
        setConfirming(false);
        return;
      }

      console.log('Appointment created successfully, navigating to appointments tab');
      setConfirming(false);
      router.push('/(tabs)/appointments');
    } catch (error) {
      console.error('Failed to create appointment:', error);
      setConfirming(false);
    }
  };

  if (loading) {
    return (
      <LinearGradient
        colors={[nospiColors.purpleDark, nospiColors.purpleMid, nospiColors.purpleLight]}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Stack.Screen options={{ headerShown: true, title: 'Detalles del Evento', headerBackTitle: 'Atrás' }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={nospiColors.white} />
        </View>
      </LinearGradient>
    );
  }

  if (!event) {
    return (
      <LinearGradient
        colors={[nospiColors.purpleDark, nospiColors.purpleMid, nospiColors.purpleLight]}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
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
  const spotsText = `${event.current_participants}/${event.max_participants} personas confirmadas`;

  return (
    <LinearGradient
      colors={[nospiColors.purpleDark, nospiColors.purpleMid, nospiColors.purpleLight]}
      style={styles.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <Stack.Screen options={{ headerShown: true, title: 'Detalles del Evento', headerBackTitle: 'Atrás' }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <View style={styles.eventCard}>
          <Text style={styles.eventIcon}>{eventIcon}</Text>
          <Text style={styles.eventType}>{eventTypeText}</Text>
          <Text style={styles.eventTime}>{event.time}</Text>
          
          <View style={styles.divider} />
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Fecha:</Text>
            <Text style={styles.detailValue}>{dateText}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Lugar:</Text>
            <Text style={styles.detailValue}>{event.location}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Participantes:</Text>
            <Text style={styles.detailValue}>{spotsText}</Text>
          </View>

          <View style={styles.divider} />

          <Text style={styles.question}>¿Deseas asistir a esta cita?</Text>
          <Text style={styles.description}>
            Al confirmar, te unirás a un grupo de 6 personas (3 hombres y 3 mujeres) para un encuentro en persona.
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
    color: nospiColors.white,
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
  eventType: {
    fontSize: 32,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 8,
  },
  eventTime: {
    fontSize: 24,
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  detailLabel: {
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 16,
    color: '#333',
    flex: 1,
    textAlign: 'right',
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
});
