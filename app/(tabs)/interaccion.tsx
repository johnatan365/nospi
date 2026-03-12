
import { supabase } from '@/lib/supabase';
import { useSupabase } from '@/contexts/SupabaseContext';
import * as Notifications from 'expo-notifications';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, TextInput, Platform, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import GameDynamicsScreen from '@/components/GameDynamicsScreen';
import { nospiColors } from '@/constants/Colors';
import React, { useEffect, useState, useCallback, useRef } from 'react';

interface Event {
  id: string;
  type: string;
  date: string;
  time: string;
  location: string;
  location_name: string;
  location_address: string;
  maps_link: string;
  is_location_revealed: boolean;
  address: string | null;
  start_time: string | null;
  max_participants: number;
  current_participants: number;
  status: string;
  confirmation_code: string | null;
  game_phase: 'intro' | 'ready' | 'question_active' | 'level_transition' | 'finished' | 'free_phase' | 'questions';
  current_level: string | null;
  current_question_index: number | null;
  answered_users: string[] | null;
  current_question: string | null;
  current_question_starter_id: string | null;
  event_status?: 'draft' | 'published' | 'closed';
}

interface Appointment {
  id: string;
  event_id: string;
  arrival_status: string;
  checked_in_at: string | null;
  location_confirmed: boolean;
  status: string;
  event: Event;
}

interface Profile {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  profile_photo_url: string | null;
  interested_in?: string;
}

interface Participant {
  id: string;
  user_id: string;
  event_id: string;
  confirmed: boolean;
  check_in_time: string | null;
  is_presented: boolean;
  presented_at: string | null;
  profiles: Profile | null;
}

type CheckInPhase = 'not_started' | 'location_confirmation' | 'arrival_confirmation' | 'completed';

export default function InteraccionScreen() {
  const { user } = useSupabase();
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkInPhase, setCheckInPhase] = useState<CheckInPhase>('not_started');
  const [activeParticipants, setActiveParticipants] = useState<Participant[]>([]);
  const [countdown, setCountdown] = useState<string>('');
  const [showGameDynamics, setShowGameDynamics] = useState(false);

  const loadActiveParticipants = useCallback(async () => {
    if (!appointment?.event_id) return;

    console.log('Loading active participants for event:', appointment.event_id);
    try {
      const { data, error } = await supabase
        .from('event_participants')
        .select(`
          id,
          user_id,
          event_id,
          confirmed,
          check_in_time,
          is_presented,
          presented_at,
          profiles:user_id (
            id,
            name,
            email,
            phone,
            city,
            profile_photo_url,
            interested_in
          )
        `)
        .eq('event_id', appointment.event_id)
        .eq('confirmed', true);

      if (error) {
        console.error('Error loading participants:', error);
        return;
      }

      console.log('Active participants loaded:', data?.length || 0);
      setActiveParticipants(data || []);
    } catch (err) {
      console.error('Exception loading participants:', err);
    }
  }, [appointment?.event_id]);

  const loadAppointment = useCallback(async () => {
    if (!user) {
      console.log('No user, skipping appointment load');
      return;
    }

    console.log('Loading appointment for user:', user.id);
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          id,
          event_id,
          arrival_status,
          checked_in_at,
          location_confirmed,
          status,
          events:event_id (
            id,
            type,
            date,
            time,
            location,
            location_name,
            location_address,
            maps_link,
            is_location_revealed,
            address,
            start_time,
            max_participants,
            current_participants,
            status,
            confirmation_code,
            game_phase,
            current_level,
            current_question_index,
            answered_users,
            current_question,
            current_question_starter_id,
            event_status
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'confirmed')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        console.error('Error loading appointment:', error);
        setAppointment(null);
        return;
      }

      if (data && data.events) {
        console.log('Appointment loaded:', data.id, 'Event:', data.events.id);
        const appointmentData: Appointment = {
          id: data.id,
          event_id: data.event_id,
          arrival_status: data.arrival_status || 'pending',
          checked_in_at: data.checked_in_at,
          location_confirmed: data.location_confirmed || false,
          status: data.status,
          event: data.events as Event,
        };
        setAppointment(appointmentData);

        // Determine check-in phase
        if (!appointmentData.location_confirmed) {
          setCheckInPhase('location_confirmation');
        } else if (appointmentData.arrival_status === 'pending') {
          setCheckInPhase('arrival_confirmation');
        } else if (appointmentData.arrival_status === 'arrived') {
          setCheckInPhase('completed');
          setShowGameDynamics(true);
        }
      } else {
        console.log('No active appointment found');
        setAppointment(null);
      }
    } catch (err) {
      console.error('Exception loading appointment:', err);
      setAppointment(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // 🚨 MODIFIED: Only request notification permissions in development builds, not Expo Go
  const requestNotificationPermissions = useCallback(async () => {
    // Skip notification setup in Expo Go to avoid the warning
    if (__DEV__ && Platform.OS === 'android') {
      console.log('Skipping notification permissions in Expo Go (Android)');
      return;
    }

    try {
      console.log('Requesting notification permissions');
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Notification permissions not granted');
        return;
      }

      console.log('Notification permissions granted');
    } catch (error) {
      console.error('Error requesting notification permissions:', error);
    }
  }, []);

  useEffect(() => {
    requestNotificationPermissions();
  }, [requestNotificationPermissions]);

  useEffect(() => {
    loadAppointment();
  }, [loadAppointment]);

  useEffect(() => {
    loadActiveParticipants();
  }, [appointment, user, loadActiveParticipants]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!appointment?.event_id || !appointment?.id || !user) return;

    console.log('Setting up realtime subscription for event:', appointment.event_id);

    const eventChannel = supabase
      .channel(`event-${appointment.event_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'events',
          filter: `id=eq.${appointment.event_id}`,
        },
        (payload) => {
          console.log('Event update received:', payload);
          loadAppointment();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'event_participants',
          filter: `event_id=eq.${appointment.event_id}`,
        },
        (payload) => {
          console.log('Participant update received:', payload);
          loadActiveParticipants();
        }
      )
      .subscribe();

    return () => {
      console.log('Cleaning up realtime subscription');
      supabase.removeChannel(eventChannel);
    };
  }, [appointment?.event_id, appointment?.id, user]);

  useFocusEffect(
    useCallback(() => {
      console.log('InteraccionScreen focused, reloading data');
      loadAppointment();
      loadActiveParticipants();
    }, [loadAppointment, loadActiveParticipants])
  );

  const updateCountdown = useCallback(() => {
    if (!appointment?.event) return;

    const eventDate = new Date(appointment.event.date);
    const now = new Date();
    const diff = eventDate.getTime() - now.getTime();

    if (diff <= 0) {
      setCountdown('¡El evento ha comenzado!');
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    setCountdown(`${days}d ${hours}h ${minutes}m`);
  }, [appointment]);

  useEffect(() => {
    updateCountdown();
    const interval = setInterval(updateCountdown, 60000); // Update every minute
    return () => clearInterval(interval);
  }, [appointment, updateCountdown]);

  const handleConfirmLocation = async () => {
    if (!appointment) return;

    console.log('User confirming location for appointment:', appointment.id);
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ location_confirmed: true })
        .eq('id', appointment.id);

      if (error) {
        console.error('Error confirming location:', error);
        return;
      }

      console.log('Location confirmed successfully');
      setCheckInPhase('arrival_confirmation');
      loadAppointment();
    } catch (err) {
      console.error('Exception confirming location:', err);
    }
  };

  const handleConfirmArrival = async () => {
    if (!appointment) return;

    console.log('User confirming arrival for appointment:', appointment.id);
    try {
      const { error } = await supabase
        .from('appointments')
        .update({
          arrival_status: 'arrived',
          checked_in_at: new Date().toISOString(),
        })
        .eq('id', appointment.id);

      if (error) {
        console.error('Error confirming arrival:', error);
        return;
      }

      console.log('Arrival confirmed successfully');
      setCheckInPhase('completed');
      setShowGameDynamics(true);
      loadAppointment();
    } catch (err) {
      console.error('Exception confirming arrival:', err);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={nospiColors.primary} />
      </View>
    );
  }

  if (!appointment) {
    return (
      <View style={styles.container}>
        <Text style={styles.noAppointmentText}>No tienes citas confirmadas</Text>
        <Text style={styles.noAppointmentSubtext}>
          Confirma tu asistencia a un evento para ver la información aquí
        </Text>
      </View>
    );
  }

  if (showGameDynamics && checkInPhase === 'completed') {
    return (
      <GameDynamicsScreen
        appointment={appointment}
        activeParticipants={activeParticipants}
      />
    );
  }

  return (
    <ScrollView style={styles.container}>
      <LinearGradient
        colors={[nospiColors.primary, nospiColors.secondary]}
        style={styles.header}
      >
        <Text style={styles.headerTitle}>Tu Próxima Cita</Text>
        <Text style={styles.countdown}>{countdown}</Text>
      </LinearGradient>

      <View style={styles.content}>
        <View style={styles.eventCard}>
          <Text style={styles.eventType}>{appointment.event.type}</Text>
          <Text style={styles.eventDate}>{appointment.event.date}</Text>
          <Text style={styles.eventTime}>{appointment.event.time}</Text>
        </View>

        {checkInPhase === 'location_confirmation' && (
          <View style={styles.checkInCard}>
            <Text style={styles.checkInTitle}>Confirma la ubicación</Text>
            <Text style={styles.checkInText}>
              {appointment.event.location_name}
            </Text>
            <Text style={styles.checkInAddress}>
              {appointment.event.location_address}
            </Text>
            <TouchableOpacity
              style={styles.confirmButton}
              onPress={handleConfirmLocation}
            >
              <Text style={styles.confirmButtonText}>Confirmar Ubicación</Text>
            </TouchableOpacity>
          </View>
        )}

        {checkInPhase === 'arrival_confirmation' && (
          <View style={styles.checkInCard}>
            <Text style={styles.checkInTitle}>¿Ya llegaste?</Text>
            <Text style={styles.checkInText}>
              Confirma tu llegada cuando estés en el lugar
            </Text>
            <TouchableOpacity
              style={styles.confirmButton}
              onPress={handleConfirmArrival}
            >
              <Text style={styles.confirmButtonText}>Confirmar Llegada</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.participantsCard}>
          <Text style={styles.participantsTitle}>
            Participantes Confirmados: {activeParticipants.length}
          </Text>
          {activeParticipants.map((participant, index) => (
            <View key={index} style={styles.participantItem}>
              <Text style={styles.participantName}>
                {participant.profiles?.name || 'Usuario'}
              </Text>
              {participant.is_presented && (
                <Text style={styles.presentedBadge}>✓ Presente</Text>
              )}
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    padding: 24,
    paddingTop: 60,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  countdown: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  content: {
    padding: 16,
  },
  eventCard: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  eventType: {
    fontSize: 20,
    fontWeight: 'bold',
    color: nospiColors.primary,
    marginBottom: 8,
  },
  eventDate: {
    fontSize: 16,
    color: '#333',
    marginBottom: 4,
  },
  eventTime: {
    fontSize: 16,
    color: '#666',
  },
  checkInCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: nospiColors.primary,
  },
  checkInTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: nospiColors.primary,
    marginBottom: 8,
  },
  checkInText: {
    fontSize: 16,
    color: '#333',
    marginBottom: 8,
  },
  checkInAddress: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  confirmButton: {
    backgroundColor: nospiColors.primary,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  participantsCard: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
  },
  participantsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: nospiColors.primary,
    marginBottom: 12,
  },
  participantItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  participantName: {
    fontSize: 16,
    color: '#333',
  },
  presentedBadge: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: 'bold',
  },
  noAppointmentText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  noAppointmentSubtext: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
