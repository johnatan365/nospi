
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { useSupabase } from '@/contexts/SupabaseContext';
import { useFocusEffect } from '@react-navigation/native';
import GameDynamicsScreen from '@/components/GameDynamicsScreen';

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
  game_phase: 'countdown' | 'ready' | 'in_progress' | 'free_phase';
  current_level: 'divertido' | 'sensual' | 'atrevido' | null;
  current_question_index: number | null;
  answered_users: string[] | null;
  current_question: string | null;
  current_question_starter_id: string | null;
}

interface Appointment {
  id: string;
  event_id: string;
  arrival_status: string;
  checked_in_at: string | null;
  location_confirmed: boolean;
  event: Event;
}

interface User {
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
  name: string;
  profile_photo_url: string | null;
  occupation: string;
  confirmed: boolean;
  check_in_time: string | null;
  presented: boolean;
}

export default function RompeHieloScreen() {
  const { user } = useSupabase();
  const [loading, setLoading] = useState(true);
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [countdown, setCountdown] = useState<number>(0);
  const [countdownDisplay, setCountdownDisplay] = useState<string>('');
  const [isEventDay, setIsEventDay] = useState(false);
  const [activeParticipants, setActiveParticipants] = useState<Participant[]>([]);
  const [gamePhase, setGamePhase] = useState<string>('countdown');
  const [isTimeToStart, setIsTimeToStart] = useState(false);
  const [startingExperience, setStartingExperience] = useState(false);

  const checkIfEventDay = useCallback((startTime: string) => {
    const now = new Date();
    const eventDate = new Date(startTime);
    
    const isSameDay = 
      now.getFullYear() === eventDate.getFullYear() &&
      now.getMonth() === eventDate.getMonth() &&
      now.getDate() === eventDate.getDate();
    
    setIsEventDay(isSameDay);
  }, []);

  const updateCountdown = useCallback((startTime: string) => {
    const now = new Date();
    const eventDate = new Date(startTime);
    const diff = eventDate.getTime() - now.getTime();

    setCountdown(diff);

    if (diff <= 0) {
      setCountdownDisplay('¡Es hora!');
      setIsTimeToStart(true);
      return;
    }

    setIsTimeToStart(false);
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    const countdownText = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    setCountdownDisplay(countdownText);
  }, []);

  const loadActiveParticipants = useCallback(async (eventId: string) => {
    try {
      console.log('Loading active participants for event:', eventId);
      
      // FIXED: Query appointments table instead of event_participants
      // Join with users table (not profiles) to get participant details
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          id,
          user_id,
          checked_in_at,
          location_confirmed,
          users:user_id (
            id,
            name,
            email,
            phone,
            city,
            profile_photo_url,
            interested_in
          )
        `)
        .eq('event_id', eventId)
        .eq('status', 'confirmada')
        .eq('payment_status', 'completed');

      if (error) {
        console.error('Error loading participants:', error);
        return;
      }

      console.log('Raw data from appointments:', data);

      // Transform appointments data to participant format
      const participants: Participant[] = (data || [])
        .filter(item => item.users)
        .map(item => ({
          id: item.id,
          user_id: item.user_id,
          name: (item.users as any)?.name || 'Participante',
          profile_photo_url: (item.users as any)?.profile_photo_url || null,
          occupation: (item.users as any)?.city || 'Ciudad',
          confirmed: true,
          check_in_time: item.checked_in_at,
          presented: item.location_confirmed || false
        }));

      console.log('Active participants loaded:', participants.length);
      console.log('Participants:', participants);
      setActiveParticipants(participants);
    } catch (error) {
      console.error('Failed to load participants:', error);
    }
  }, []);

  const loadAppointment = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      console.log('Loading appointment for user:', user.id);
      
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          id,
          event_id,
          arrival_status,
          checked_in_at,
          location_confirmed,
          status,
          event:events!inner (
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
            current_question_starter_id
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'confirmada')
        .eq('payment_status', 'completed')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading appointment:', error);
        setLoading(false);
        return;
      }
      
      if (!data || data.length === 0) {
        console.log('No confirmed appointments found');
        setAppointment(null);
        setLoading(false);
        return;
      }

      const now = new Date();
      
      const todayConfirmedAppointment = data.find(apt => {
        if (!apt.event?.start_time) return false;
        const eventDate = new Date(apt.event.start_time);
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const eventDayStart = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
        return eventDayStart.getTime() === todayStart.getTime();
      });

      const upcomingAppointment = data.find(apt => {
        if (!apt.event?.start_time) return false;
        const eventDate = new Date(apt.event.start_time);
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const eventDayStart = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
        return eventDayStart >= todayStart;
      });

      const appointmentData = todayConfirmedAppointment || upcomingAppointment || data[0];
      
      console.log('Appointment loaded:', appointmentData.id);
      console.log('Event state from database:', {
        game_phase: appointmentData.event?.game_phase,
        current_level: appointmentData.event?.current_level
      });
      
      if (appointmentData.event?.game_phase) {
        console.log('Setting game phase from database:', appointmentData.event.game_phase);
        setGamePhase(appointmentData.event.game_phase);
      }
      
      setAppointment(appointmentData as any);
      
      if (appointmentData.event && appointmentData.event.start_time) {
        checkIfEventDay(appointmentData.event.start_time);
      }
      
      if (appointmentData.event_id) {
        loadActiveParticipants(appointmentData.event_id);
      }
    } catch (error) {
      console.error('Failed to load appointment:', error);
    } finally {
      setLoading(false);
    }
  }, [user, checkIfEventDay, loadActiveParticipants]);

  useEffect(() => {
    if (!appointment?.event_id) return;

    console.log('Subscribing to event state changes for event:', appointment.event_id);

    const channel = supabase
      .channel(`rompe_hielo_event_${appointment.event_id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'events',
          filter: `id=eq.${appointment.event_id}`,
        },
        (payload) => {
          console.log('Event state change detected:', payload);
          const newEvent = payload.new as any;
          console.log('New state:', {
            game_phase: newEvent.game_phase,
            current_level: newEvent.current_level
          });
          
          if (newEvent.game_phase) {
            console.log('Updating game phase from realtime:', newEvent.game_phase);
            setGamePhase(newEvent.game_phase);
          }
          
          setAppointment(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              event: {
                ...prev.event,
                game_phase: newEvent.game_phase,
                current_level: newEvent.current_level,
                current_question_index: newEvent.current_question_index,
                answered_users: newEvent.answered_users,
                current_question: newEvent.current_question,
                current_question_starter_id: newEvent.current_question_starter_id
              }
            };
          });
        }
      )
      .subscribe((status) => {
        console.log('Event state subscription status:', status);
      });

    return () => {
      console.log('Unsubscribing event state');
      supabase.removeChannel(channel);
    };
  }, [appointment?.event_id]);

  useFocusEffect(
    useCallback(() => {
      console.log('Rompe Hielo screen focused');
      
      if (user) {
        loadAppointment();
      }
      
      return () => {
        console.log('Rompe Hielo screen unfocused');
      };
    }, [user, loadAppointment])
  );

  useEffect(() => {
    if (appointment && appointment.event.start_time) {
      const interval = setInterval(() => {
        updateCountdown(appointment.event.start_time!);
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [appointment, updateCountdown]);

  useEffect(() => {
    if (!appointment || !user) return;

    console.log('Setting up Realtime subscription for participants');
    
    loadActiveParticipants(appointment.event_id);

    // FIXED: Subscribe to appointments table instead of event_participants
    const channel = supabase
      .channel(`rompe_hielo_participants_${appointment.event_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `event_id=eq.${appointment.event_id}`,
        },
        (payload) => {
          console.log('Participant update:', payload.eventType);
          loadActiveParticipants(appointment.event_id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [appointment, user, loadActiveParticipants]);

  useEffect(() => {
    const checkAndTransitionToReady = async () => {
      if (!appointment?.event_id || !appointment?.event?.start_time) return;
      if (gamePhase !== 'countdown') return;

      const now = new Date();
      const eventDate = new Date(appointment.event.start_time);
      eventDate.setMinutes(eventDate.getMinutes() + 10);
      
      if (now >= eventDate) {
        console.log('Auto-transitioning to ready phase (10 min after start)');

        try {
          const { error } = await supabase
            .from('events')
            .update({
              game_phase: 'ready',
              updated_at: new Date().toISOString(),
            })
            .eq('id', appointment.event_id);

          if (error) {
            console.error('Error transitioning to ready phase:', error);
            return;
          }

          console.log('Successfully transitioned to ready phase');
        } catch (error) {
          console.error('Unexpected error during transition:', error);
        }
      }
    };

    checkAndTransitionToReady();
    
    const interval = setInterval(checkAndTransitionToReady, 60000);
    
    return () => clearInterval(interval);
  }, [appointment?.event_id, appointment?.event?.start_time, gamePhase]);

  const handleStartExperience = useCallback(async () => {
    console.log('User clicked Comenzar button');
    
    if (!appointment?.event_id || startingExperience) {
      console.warn('Cannot start - already loading or no event');
      return;
    }

    if (activeParticipants.length === 0) {
      console.warn('Cannot start - no participants');
      return;
    }

    setStartingExperience(true);
    
    try {
      console.log('Updating database to start experience...');
      
      const { error } = await supabase
        .from('events')
        .update({
          game_phase: 'ready',
          updated_at: new Date().toISOString(),
        })
        .eq('id', appointment.event_id);

      if (error) {
        console.error('Error starting experience:', error);
        setStartingExperience(false);
        return;
      }

      console.log('Successfully started experience - transitioning to ready phase');
      
    } catch (error) {
      console.error('Unexpected error:', error);
      setStartingExperience(false);
    } finally {
      setTimeout(() => {
        setStartingExperience(false);
      }, 2000);
    }
  }, [appointment, activeParticipants, startingExperience]);

  console.log('Rompe Hielo Status:', {
    activeParticipants: activeParticipants.length,
    gamePhase: gamePhase,
    isEventDay: isEventDay,
    isTimeToStart: isTimeToStart
  });

  if (loading) {
    return (
      <LinearGradient
        colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={nospiColors.purpleDark} />
        </View>
      </LinearGradient>
    );
  }

  if (!appointment) {
    return (
      <LinearGradient
        colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
          <Text style={styles.title}>Rompe Hielo</Text>
          <Text style={styles.subtitle}>Experiencia de conexión</Text>

          <View style={styles.placeholderContainer}>
            <Text style={styles.placeholderIcon}>🎯</Text>
            <Text style={styles.placeholderText}>
              No tienes ningún evento confirmado
            </Text>
            <Text style={styles.placeholderSubtext}>
              Reserva un evento para acceder a la experiencia Rompe Hielo
            </Text>
          </View>
        </ScrollView>
      </LinearGradient>
    );
  }

  if (!isEventDay) {
    const eventDateText = new Date(appointment.event.start_time!).toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    return (
      <LinearGradient
        colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
          <Text style={styles.title}>Próximo Evento</Text>
          <Text style={styles.subtitle}>Rompe Hielo</Text>

          <View style={styles.eventInfoCard}>
            <Text style={styles.eventInfoIcon}>🎉</Text>
            <Text style={styles.eventInfoTitle}>Evento confirmado</Text>
            <Text style={styles.eventInfoDate}>{eventDateText}</Text>
            <Text style={styles.eventInfoTime}>{appointment.event.time}</Text>
            <Text style={styles.eventInfoMessage}>
              La experiencia Rompe Hielo estará disponible el día del evento
            </Text>
          </View>
        </ScrollView>
      </LinearGradient>
    );
  }

  if (gamePhase === 'ready' || gamePhase === 'in_progress' || gamePhase === 'free_phase') {
    console.log('Rendering Game Dynamics Screen');
    console.log('Game phase:', gamePhase);
    console.log('Active participants count:', activeParticipants.length);
    
    return <GameDynamicsScreen appointment={appointment} activeParticipants={activeParticipants} />;
  }

  return (
    <LinearGradient
      colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
      style={styles.gradient}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.title}>Hoy es tu experiencia</Text>
        <Text style={styles.title}>Rompe Hielo</Text>
        <Text style={styles.subtitle}>¡Prepárate para conectar!</Text>

        <View style={styles.countdownCard}>
          <Text style={styles.countdownLabel}>Tiempo para el inicio</Text>
          <Text style={styles.countdownTime}>{countdownDisplay}</Text>
        </View>

        {isTimeToStart && (
          <>
            <View style={styles.participantsListCard}>
              <Text style={styles.participantsListTitle}>Participantes en este evento</Text>
              {activeParticipants.length === 0 ? (
                <Text style={styles.noParticipantsText}>No hay participantes confirmados aún</Text>
              ) : (
                activeParticipants.map((participant, index) => {
                  const displayName = participant.name;
                  
                  return (
                    <React.Fragment key={index}>
                      <View style={styles.participantListItem}>
                        {participant.profile_photo_url ? (
                          <Image
                            source={{ uri: participant.profile_photo_url }}
                            style={styles.participantListPhoto}
                          />
                        ) : (
                          <View style={styles.participantListPhotoPlaceholder}>
                            <Text style={styles.participantListPhotoText}>
                              {displayName.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <Text style={styles.participantListName}>{displayName}</Text>
                      </View>
                    </React.Fragment>
                  );
                })
              )}
            </View>

            <TouchableOpacity
              style={[styles.startButton, (startingExperience || activeParticipants.length === 0) && styles.buttonDisabled]}
              onPress={handleStartExperience}
              disabled={startingExperience || activeParticipants.length === 0}
              activeOpacity={0.8}
            >
              <Text style={styles.startButtonText}>
                {startingExperience ? '⏳ Iniciando...' : '🎉 Comenzar'}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {!isTimeToStart && (
          <View style={styles.infoCard}>
            <Text style={styles.infoText}>
              ✨ La experiencia comenzará automáticamente 10 minutos después de la hora de inicio
            </Text>
            <Text style={styles.infoTextSecondary}>
              Prepárate para romper el hielo y disfrutar
            </Text>
          </View>
        )}
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
    paddingBottom: 120,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 8,
    marginTop: 48,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: nospiColors.purpleDark,
    opacity: 0.8,
    marginBottom: 24,
    textAlign: 'center',
  },
  placeholderContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 40,
    alignItems: 'center',
  },
  placeholderIcon: {
    fontSize: 80,
    marginBottom: 24,
  },
  placeholderText: {
    fontSize: 18,
    fontWeight: '600',
    color: nospiColors.purpleDark,
    textAlign: 'center',
    marginBottom: 12,
  },
  placeholderSubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  eventInfoCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  eventInfoIcon: {
    fontSize: 60,
    marginBottom: 16,
  },
  eventInfoTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 16,
  },
  eventInfoDate: {
    fontSize: 16,
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  eventInfoTime: {
    fontSize: 18,
    fontWeight: '600',
    color: nospiColors.purpleMid,
    marginBottom: 16,
  },
  eventInfoMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  countdownCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  countdownLabel: {
    fontSize: 16,
    color: nospiColors.purpleDark,
    marginBottom: 12,
    fontWeight: '600',
  },
  countdownTime: {
    fontSize: 48,
    fontWeight: '700',
    color: nospiColors.purpleDark,
    letterSpacing: 2,
  },
  participantsListCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
  },
  participantsListTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 16,
    textAlign: 'center',
  },
  noParticipantsText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
    paddingVertical: 12,
  },
  participantListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  participantListPhoto: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  participantListPhotoPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: nospiColors.purpleLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  participantListPhotoText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
  },
  participantListName: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  startButton: {
    backgroundColor: '#FFD700',
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
    marginBottom: 16,
  },
  startButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a0b2e',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  infoCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
  },
  infoText: {
    fontSize: 18,
    fontWeight: '600',
    color: nospiColors.purpleDark,
    textAlign: 'center',
    marginBottom: 12,
  },
  infoTextSecondary: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});
