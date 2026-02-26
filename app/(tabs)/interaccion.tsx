
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, TextInput, Platform, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { useSupabase } from '@/contexts/SupabaseContext';
import * as Notifications from 'expo-notifications';
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
  game_phase: 'intro' | 'ready' | 'question_active' | 'match_selection' | 'level_transition' | 'finished' | 'free_phase' | 'questions';
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

type CheckInPhase = 'waiting' | 'code_entry' | 'confirmed';

// Only set notification handler on native platforms
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export default function InteraccionScreen() {
  const { user } = useSupabase();
  const [loading, setLoading] = useState(true);
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [countdown, setCountdown] = useState<number>(0);
  const [countdownDisplay, setCountdownDisplay] = useState<string>('');
  const [isEventDay, setIsEventDay] = useState(false);
  const [checkInPhase, setCheckInPhase] = useState<CheckInPhase>('waiting');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [startingExperience, setStartingExperience] = useState(false);
  
  const [activeParticipants, setActiveParticipants] = useState<Participant[]>([]);
  
  // CRITICAL: Game state derived from event_state in database
  const [gamePhase, setGamePhase] = useState<string>('intro');

  const checkIfEventDay = useCallback((startTime: string) => {
    const now = new Date();
    const eventDate = new Date(startTime);
    
    const eventDayStart = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate(), 0, 0, 0, 0);
    
    const isSameDay = 
      now.getFullYear() === eventDate.getFullYear() &&
      now.getMonth() === eventDate.getMonth() &&
      now.getDate() === eventDate.getDate();
    
    const isAfterMidnight = now >= eventDayStart;
    
    const isToday = isSameDay && isAfterMidnight;
    setIsEventDay(isToday);
  }, []);

  const updateCountdown = useCallback((startTime: string) => {
    const now = new Date();
    const eventDate = new Date(startTime);
    eventDate.setMinutes(eventDate.getMinutes() + 10);
    const diff = eventDate.getTime() - now.getTime();

    setCountdown(diff);

    if (diff <= 0) {
      setCountdownDisplay('¡Es hora!');
      
      if (!appointment?.location_confirmed && checkInPhase === 'waiting') {
        setCheckInPhase('code_entry');
      }
      return;
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    const countdownText = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    setCountdownDisplay(countdownText);
  }, [appointment, checkInPhase]);

  const requestNotificationPermissions = useCallback(async () => {
    // Skip on web - notifications not fully supported
    if (Platform.OS === 'web') {
      console.log('Notifications not available on web');
      return;
    }

    try {
      const { status } = await Notifications.requestPermissionsAsync();
      console.log('Notification permission:', status);
    } catch (error) {
      console.error('Error requesting notification permissions:', error);
    }
  }, []);

  const scheduleNotifications = useCallback(async (startTime: string) => {
    // Skip on web - notifications not fully supported
    if (Platform.OS === 'web') {
      console.log('Skipping notification scheduling on web');
      return;
    }

    try {
      const eventDate = new Date(startTime);
      const now = new Date();

      await Notifications.cancelAllScheduledNotificationsAsync();

      if (eventDate > now) {
        const sixHoursBefore = new Date(eventDate.getTime() - 6 * 60 * 60 * 1000);
        if (sixHoursBefore > now) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Tu experiencia Nospi está cerca',
              body: 'Faltan 6 horas para tu evento. ¡Prepárate!',
              sound: true,
            },
            trigger: sixHoursBefore,
          });
        }

        const oneHourBefore = new Date(eventDate.getTime() - 60 * 60 * 1000);
        if (oneHourBefore > now) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Tu experiencia Nospi comienza pronto',
              body: 'Falta 1 hora.',
              sound: true,
            },
            trigger: oneHourBefore,
          });
        }
      }
    } catch (error) {
      console.error('Error scheduling notifications:', error);
    }
  }, []);

  const loadActiveParticipants = useCallback(async (eventId: string) => {
    try {
      console.log('🔄 Loading active participants for event:', eventId);
      
      const { data, error } = await supabase
        .rpc('get_event_participants_for_interaction', { p_event_id: eventId });

      if (error) {
        console.error('❌ Error loading participants:', error);
        return;
      }

      // CRITICAL FIX: Only include participants who have confirmed (checked in with code)
      const participants: Participant[] = (data || [])
        .filter((item: any) => item.user_name && item.confirmed === true)
        .map((item: any) => ({
          id: item.id,
          user_id: item.user_id,
          event_id: item.event_id,
          confirmed: item.confirmed,
          check_in_time: item.check_in_time,
          is_presented: item.is_presented || false,
          presented_at: item.presented_at || null,
          profiles: {
            id: item.user_id,
            name: item.user_name,
            email: item.user_email || '',
            phone: item.user_phone || '',
            city: item.user_city || '',
            profile_photo_url: item.user_profile_photo_url || null,
            interested_in: item.user_interested_in || ''
          }
        }));

      console.log('✅ Active participants loaded:', participants.length);
      
      setActiveParticipants(participants);
    } catch (error) {
      console.error('❌ Failed to load participants:', error);
    }
  }, []);

  const loadAppointment = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      console.log('🔄 Loading appointment for user:', user.id);
      
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
            current_question_starter_id,
            event_status
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'confirmada')
        .eq('payment_status', 'completed')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error loading appointment:', error);
        setLoading(false);
        return;
      }
      
      if (!data || data.length === 0) {
        console.log('❌ No confirmed appointments found');
        setAppointment(null);
        setLoading(false);
        return;
      }

      const now = new Date();
      
      const todayConfirmedAppointment = data.find(apt => {
        if (apt.status !== 'confirmada') return false;
        if (!apt.event?.start_time) return false;
        const eventDate = new Date(apt.event.start_time);
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const eventDayStart = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
        return eventDayStart.getTime() === todayStart.getTime();
      });

      const upcomingAppointment = data.find(apt => {
        if (apt.status !== 'confirmada') return false;
        if (!apt.event?.start_time) return false;
        const eventDate = new Date(apt.event.start_time);
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const eventDayStart = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
        return eventDayStart >= todayStart;
      });

      const appointmentData = todayConfirmedAppointment || upcomingAppointment || data[0];
      
      console.log('✅ Appointment loaded:', appointmentData.id);
      console.log('📊 Event game_phase:', appointmentData.event?.game_phase);
      console.log('📊 Event event_status:', appointmentData.event?.event_status);
      console.log('📊 Appointment status:', appointmentData.status);
      
      // CRITICAL FIX: Check if event is closed OR if user's appointment is 'anterior'
      if (appointmentData.event?.event_status === 'closed' || appointmentData.status === 'anterior') {
        console.log('🚫 Event is closed or user finished - showing no events available');
        setAppointment(null);
        setLoading(false);
        return;
      }
      
      // CRITICAL: Set game phase from database
      if (appointmentData.event?.game_phase) {
        console.log('🎮 Setting game phase from database:', appointmentData.event.game_phase);
        setGamePhase(appointmentData.event.game_phase);
      }
      
      setAppointment(appointmentData as any);
      
      if (appointmentData.location_confirmed) {
        setCheckInPhase('confirmed');
      }
      
      if (appointmentData.event && appointmentData.event.start_time) {
        checkIfEventDay(appointmentData.event.start_time);
        scheduleNotifications(appointmentData.event.start_time);
      }
      
      if (appointmentData.event_id) {
        loadActiveParticipants(appointmentData.event_id);
      }
    } catch (error) {
      console.error('Failed to load appointment:', error);
    } finally {
      setLoading(false);
    }
  }, [user, checkIfEventDay, scheduleNotifications, loadActiveParticipants]);

  const handleCodeConfirmation = useCallback(async () => {
    if (!appointment || !user) return;

    const enteredCode = confirmationCode.trim();
    const eventCode = appointment.event.confirmation_code;
    const expectedCode = (eventCode === null || eventCode === undefined || eventCode.trim() === '') 
      ? '1986' 
      : eventCode.trim();
    
    console.log('Code validation - Expected:', expectedCode, 'Entered:', enteredCode);

    if (enteredCode !== expectedCode) {
      setCodeError('Código incorrecto.');
      return;
    }

    setCodeError('');

    try {
      const confirmedAt = new Date().toISOString();

      const { error: updateError } = await supabase
        .from('event_participants')
        .upsert({
          event_id: appointment.event_id,
          user_id: user.id,
          confirmed: true,
          check_in_time: confirmedAt,
        }, {
          onConflict: 'event_id,user_id'
        });

      if (updateError) {
        console.error('Error updating event_participants:', updateError);
        setCodeError('No se pudo registrar tu llegada.');
        return;
      }

      console.log('Check-in successful');
      
      await supabase
        .from('appointments')
        .update({
          arrival_status: 'on_time',
          checked_in_at: confirmedAt,
          location_confirmed: true,
        })
        .eq('id', appointment.id);
      
      setAppointment(prev => ({
        ...prev!,
        arrival_status: 'on_time',
        checked_in_at: confirmedAt,
        location_confirmed: true,
      }));
      
      setCheckInPhase('confirmed');
      setConfirmationCode('');
      
      loadActiveParticipants(appointment.event_id);
    } catch (error) {
      console.error('Error during check-in:', error);
      setCodeError('Ocurrió un error.');
    }
  }, [appointment, user, confirmationCode, loadActiveParticipants]);

  const handleStartExperience = useCallback(async () => {
    console.log('🚀 User clicked Continuar button');
    
    if (!appointment?.event_id || startingExperience) {
      console.warn('⚠️ Cannot start - already loading or no event');
      return;
    }

    if (activeParticipants.length < 2) {
      console.warn('⚠️ Cannot start - need at least 2 participants');
      return;
    }

    setStartingExperience(true);
    
    try {
      console.log('🎮 Starting experience - going directly to questions phase');
      
      // Select random starter
      const randomIndex = Math.floor(Math.random() * activeParticipants.length);
      const starterUserId = activeParticipants[randomIndex].user_id;
      
      // Get first question from divertido level
      const firstQuestion = '¿Cuál es tu nombre y a qué te dedicas?';
      
      console.log('🎮 Starter user:', activeParticipants[randomIndex].profiles?.name);
      console.log('🎮 First question:', firstQuestion);
      
      const { error } = await supabase
        .from('events')
        .update({
          game_phase: 'questions',
          current_level: 'divertido',
          current_question_index: 0,
          answered_users: [],
          current_question: firstQuestion,
          current_question_starter_id: starterUserId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', appointment.event_id);

      if (error) {
        console.error('❌ Error starting experience:', error);
        setStartingExperience(false);
        return;
      }

      console.log('✅ Successfully started experience - transitioning directly to questions phase');
      
    } catch (error) {
      console.error('❌ Unexpected error:', error);
      setStartingExperience(false);
    } finally {
      setTimeout(() => {
        setStartingExperience(false);
      }, 2000);
    }
  }, [appointment, activeParticipants, startingExperience]);

  // CRITICAL: Subscribe to event_state changes AND appointment status changes
  useEffect(() => {
    if (!appointment?.event_id || !user) return;

    console.log('📡 Subscribing to event_state and appointment changes for event:', appointment.event_id);

    // Subscribe to event changes
    const eventChannel = supabase
      .channel(`event_state_${appointment.event_id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'events',
          filter: `id=eq.${appointment.event_id}`,
        },
        (payload) => {
          console.log('📡 Event_state change detected');
          const newEvent = payload.new as any;
          console.log('📡 New game_phase:', newEvent.game_phase);
          console.log('📡 New event_status:', newEvent.event_status);
          
          // CRITICAL FIX: Check if event is closed
          if (newEvent.event_status === 'closed') {
            console.log('🚫 Event closed via realtime - clearing appointment');
            setAppointment(null);
            return;
          }
          
          // CRITICAL: Update game phase from database
          if (newEvent.game_phase) {
            console.log('🎮 Updating game phase from realtime:', newEvent.game_phase);
            setGamePhase(newEvent.game_phase);
          }
          
          // Update appointment with new event state
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
                current_question_starter_id: newEvent.current_question_starter_id,
                event_status: newEvent.event_status
              }
            };
          });
        }
      )
      .subscribe((status) => {
        console.log('📡 event_state subscription status:', status);
      });

    // CRITICAL FIX: Subscribe to appointment status changes
    const appointmentChannel = supabase
      .channel(`appointment_${appointment.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'appointments',
          filter: `id=eq.${appointment.id}`,
        },
        (payload) => {
          console.log('📡 Appointment status change detected');
          const newAppointment = payload.new as any;
          console.log('📡 New appointment status:', newAppointment.status);
          
          // CRITICAL: If this user's appointment changed to 'anterior', hide the event
          if (newAppointment.status === 'anterior') {
            console.log('🚫 User appointment moved to anterior - clearing appointment from view');
            setAppointment(null);
            return;
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 appointment subscription status:', status);
      });

    return () => {
      console.log('📡 Unsubscribing event_state and appointment');
      supabase.removeChannel(eventChannel);
      supabase.removeChannel(appointmentChannel);
    };
  }, [appointment?.event_id, appointment?.id, user]);

  useFocusEffect(
    useCallback(() => {
      console.log('🔄 Screen focused');
      
      if (user) {
        loadAppointment();
      }
      
      return () => {
        console.log('Screen unfocused');
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
    requestNotificationPermissions();
  }, [requestNotificationPermissions]);

  useEffect(() => {
    if (!appointment || !user) return;

    console.log('Setting up Realtime subscription for participants');
    
    loadActiveParticipants(appointment.event_id);

    const channel = supabase
      .channel(`participants_${appointment.event_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'event_participants',
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

  const canStartExperience = countdown <= 0 && activeParticipants.length >= 2;

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
          <Text style={styles.title}>Interacción</Text>
          <Text style={styles.subtitle}>Centro de experiencia del evento</Text>

          <View style={styles.placeholderContainer}>
            <Text style={styles.placeholderIcon}>📅</Text>
            <Text style={styles.placeholderText}>
              No tienes ningún evento confirmado
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
          <Text style={styles.subtitle}>Tu experiencia Nospi</Text>

          <View style={styles.eventInfoCard}>
            <Text style={styles.eventInfoIcon}>🎉</Text>
            <Text style={styles.eventInfoTitle}>Evento confirmado</Text>
            <Text style={styles.eventInfoDate}>{eventDateText}</Text>
            <Text style={styles.eventInfoTime}>{appointment.event.time}</Text>
          </View>
        </ScrollView>
      </LinearGradient>
    );
  }

  // CRITICAL: Show game dynamics based on game_phase from database
  // MATCH SELECTION DISABLED - Skip 'intro', 'ready', and 'match_selection' phases
  if (gamePhase === 'questions' || gamePhase === 'question_active' || gamePhase === 'level_transition' || gamePhase === 'finished' || gamePhase === 'free_phase') {
    console.log('🎮 Rendering GameDynamicsScreen with phase:', gamePhase);
    console.log('🎮 Active participants count:', activeParticipants.length);
    
    const transformedParticipants = activeParticipants.map(p => ({
      id: p.id,
      user_id: p.user_id,
      name: p.profiles?.name || 'Participante',
      profile_photo_url: p.profiles?.profile_photo_url || null,
      occupation: p.profiles?.city || 'Ciudad',
      confirmed: p.confirmed,
      check_in_time: p.check_in_time,
      presented: p.is_presented
    }));
    
    return <GameDynamicsScreen appointment={appointment} activeParticipants={transformedParticipants} />;
  }
  
  // MATCH SELECTION DISABLED - If somehow we're in match_selection phase, show loading
  if (gamePhase === 'match_selection') {
    console.log('⚠️ Match selection phase detected but DISABLED - showing loading');
    
    return (
      <LinearGradient
        colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={nospiColors.purpleDark} />
          <Text style={{ textAlign: 'center', marginTop: 20, color: nospiColors.purpleDark, fontSize: 16 }}>
            Cargando siguiente nivel...
          </Text>
        </View>
      </LinearGradient>
    );
  }

  const eventTypeText = appointment.event.type === 'bar' ? 'Bar' : 'Restaurante';
  const eventIcon = appointment.event.type === 'bar' ? '🍸' : '🍽️';
  
  const locationText = appointment.event.is_location_revealed && appointment.event.location_name
    ? appointment.event.location_name
    : 'Ubicación se revelará próximamente';
  
  const participantCountText = activeParticipants.length.toString();

  return (
    <LinearGradient
      colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
      style={styles.gradient}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.title}>Hoy es tu experiencia Nospi</Text>
        <Text style={styles.subtitle}>¡Prepárate para conectar!</Text>

        <View style={styles.countdownCard}>
          <Text style={styles.countdownLabel}>Tiempo para el inicio</Text>
          <Text style={styles.countdownTime}>{countdownDisplay}</Text>
        </View>

        <View style={styles.eventCard}>
          <View style={styles.eventHeader}>
            <Text style={styles.eventIconLarge}>{eventIcon}</Text>
            <View style={styles.eventHeaderText}>
              <Text style={styles.eventType}>{eventTypeText}</Text>
              <Text style={styles.eventTime}>{appointment.event.time}</Text>
            </View>
          </View>
          <Text style={styles.eventLocation}>{locationText}</Text>
        </View>

        {checkInPhase === 'code_entry' && (
          <View style={styles.codeEntryCard}>
            <Text style={styles.codeEntryTitle}>Confirma tu llegada</Text>
            <Text style={styles.codeEntrySubtitle}>Ingresa el código del encuentro</Text>
            
            <TextInput
              style={styles.codeInput}
              value={confirmationCode}
              onChangeText={(text) => {
                setConfirmationCode(text);
                setCodeError('');
              }}
              placeholder="Código"
              placeholderTextColor="#999"
              keyboardType="default"
              maxLength={10}
              autoFocus
            />

            {codeError ? (
              <Text style={styles.codeErrorText}>{codeError}</Text>
            ) : null}

            <TouchableOpacity
              style={[styles.confirmCodeButton, !confirmationCode.trim() && styles.buttonDisabled]}
              onPress={handleCodeConfirmation}
              disabled={!confirmationCode.trim()}
              activeOpacity={0.8}
            >
              <Text style={styles.confirmCodeButtonText}>Confirmar Código</Text>
            </TouchableOpacity>
          </View>
        )}

        {checkInPhase === 'confirmed' && (
          <>
            <View style={styles.confirmedCard}>
              <Text style={styles.confirmedIcon}>✅</Text>
              <Text style={styles.confirmedText}>
                ¡Llegada confirmada!
              </Text>
            </View>

            <View style={styles.participantsListCard}>
              <View style={styles.participantsListHeader}>
                <Text style={styles.participantsListTitle}>Participantes confirmados</Text>
                <View style={styles.participantCountBadge}>
                  <Text style={styles.participantCountText}>{participantCountText}</Text>
                </View>
              </View>
              
              {activeParticipants.length > 0 && (
                <View style={styles.participantsList}>
                  {activeParticipants.map((participant, index) => {
                    const displayName = participant.profiles?.name || 'Participante';
                    
                    return (
                      <React.Fragment key={index}>
                      <View style={styles.participantListItem}>
                        <View style={styles.participantListPhotoPlaceholder}>
                          <Text style={styles.participantListPhotoText}>
                            {displayName.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <Text style={styles.participantListName}>{displayName}</Text>
                      </View>
                      </React.Fragment>
                    );
                  })}
                </View>
              )}
            </View>

            {canStartExperience && (
              <>
                <View style={styles.infoCard}>
                  <Text style={styles.infoText}>
                    ✨ Hay {activeParticipants.length} participantes confirmados
                  </Text>
                  <Text style={styles.infoTextSecondary}>
                    Presiona &quot;Continuar&quot; para iniciar la experiencia
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.continueButton, startingExperience && styles.buttonDisabled]}
                  onPress={handleStartExperience}
                  disabled={startingExperience}
                  activeOpacity={0.8}
                >
                  <Text style={styles.continueButtonText}>
                    {startingExperience ? '⏳ Iniciando...' : '🚀 Continuar'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </>
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
  },
  subtitle: {
    fontSize: 16,
    color: nospiColors.purpleDark,
    opacity: 0.8,
    marginBottom: 24,
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
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
    letterSpacing: 2,
  },
  eventCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  eventIconLarge: {
    fontSize: 40,
    marginRight: 16,
  },
  eventHeaderText: {
    flex: 1,
  },
  eventType: {
    fontSize: 22,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
  },
  eventTime: {
    fontSize: 16,
    color: nospiColors.purpleMid,
    fontWeight: '600',
    marginTop: 4,
  },
  eventLocation: {
    fontSize: 14,
    color: '#666',
  },
  codeEntryCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
  },
  codeEntryTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    textAlign: 'center',
    marginBottom: 8,
  },
  codeEntrySubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  codeInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: nospiColors.purpleLight,
  },
  codeErrorText: {
    fontSize: 14,
    color: '#EF4444',
    textAlign: 'center',
    marginBottom: 12,
  },
  confirmCodeButton: {
    backgroundColor: nospiColors.purpleDark,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  confirmCodeButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  confirmedCard: {
    backgroundColor: '#D1FAE5',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  confirmedIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  confirmedText: {
    fontSize: 16,
    color: '#065F46',
    textAlign: 'center',
    fontWeight: '600',
  },
  participantsListCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
  },
  participantsListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  participantsListTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    flex: 1,
  },
  participantCountBadge: {
    backgroundColor: nospiColors.purpleMid,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    minWidth: 50,
    alignItems: 'center',
  },
  participantCountText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  participantsList: {
    marginTop: 8,
  },
  participantListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  participantListPhotoPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: nospiColors.purpleLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  participantListPhotoText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
  },
  participantListName: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  buttonDisabled: {
    opacity: 0.5,
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
  continueButton: {
    backgroundColor: '#10B981',
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 40,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 15,
    marginBottom: 16,
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  continueButtonText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});
