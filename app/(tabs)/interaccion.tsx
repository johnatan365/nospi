
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, TextInput, Platform, Image, Animated, Easing } from 'react-native';
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
  game_phase: 'intro' | 'ready' | 'waiting_for_spin' | 'show_result' | 'question' | 'playing' | 'finished';
  current_turn_index: number;
  current_round: number;
  started_at: string | null;
  selected_participant_id: string | null;
  selected_participant_name: string | null;
  current_question: string | null;
  current_question_level: string | null;
}

interface Appointment {
  id: string;
  event_id: string;
  arrival_status: string;
  checked_in_at: string | null;
  location_confirmed: boolean;
  experience_started: boolean;
  presented: boolean;
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

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

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
  
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [showRitualModal, setShowRitualModal] = useState(false);
  const [experienceStarted, setExperienceStarted] = useState(false);
  const [activeParticipants, setActiveParticipants] = useState<Participant[]>([]);
  const [userPresented, setUserPresented] = useState(false);
  const [allPresented, setAllPresented] = useState(false);
  const [ritualAnimation] = useState(new Animated.Value(0));
  const [gameStarted, setGameStarted] = useState(false);

  // Toast notification states
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTranslateY = useRef(new Animated.Value(-50)).current;
  
  const shownConfirmations = useRef(new Set<string>()).current;

  const showToastNotification = useCallback((message: string) => {
    console.log('Toast:', message);
    setToastMessage(message);
    setToastVisible(true);

    toastOpacity.setValue(0);
    toastTranslateY.setValue(-50);

    Animated.parallel([
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.spring(toastTranslateY, {
        toValue: 0,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();

    setTimeout(() => {
      Animated.parallel([
        Animated.timing(toastOpacity, {
          toValue: 0,
          duration: 300,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(toastTranslateY, {
          toValue: -50,
          duration: 300,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start(() => {
        setToastVisible(false);
      });
    }, 2000);
  }, [toastOpacity, toastTranslateY]);

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
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      console.log('Notification permission:', status);
    } catch (error) {
      console.error('Error requesting notification permissions:', error);
    }
  }, []);

  const scheduleNotifications = useCallback(async (startTime: string) => {
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
      console.log('Loading participants for event:', eventId);
      
      const { data, error } = await supabase
        .rpc('get_event_participants_for_interaction', { p_event_id: eventId });

      if (error) {
        console.error('Error loading participants:', error);
        return;
      }

      const participants: Participant[] = (data || [])
        .filter((item: any) => item.user_name)
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

      console.log('Participants loaded:', participants.length);
      
      setActiveParticipants(participants);
      
      const allHavePresented = participants.length > 0 && participants.every(p => p.is_presented);
      setAllPresented(allHavePresented);
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
          experience_started,
          presented,
          event:events (
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
            current_turn_index,
            current_round,
            started_at,
            selected_participant_id,
            selected_participant_name,
            current_question,
            current_question_level
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
        setAppointment(null);
        setLoading(false);
        return;
      }

      const now = new Date();
      const upcomingAppointment = data.find(apt => {
        if (!apt.event?.start_time) return false;
        const eventDate = new Date(apt.event.start_time);
        return eventDate >= new Date(now.getFullYear(), now.getMonth(), now.getDate());
      });

      const appointmentData = upcomingAppointment || data[0];
      console.log('Appointment loaded:', appointmentData.id);
      console.log('Game phase:', appointmentData.event?.game_phase);
      
      // Check if game is active
      if (appointmentData.event?.game_phase === 'waiting_for_spin' || 
          appointmentData.event?.game_phase === 'show_result' ||
          appointmentData.event?.game_phase === 'question') {
        console.log('Game is active');
        setGameStarted(true);
      }
      
      setAppointment(appointmentData as any);
      
      if (appointmentData.location_confirmed) {
        setCheckInPhase('confirmed');
      }
      
      setExperienceStarted(appointmentData.experience_started || false);
      setUserPresented(appointmentData.presented || false);
      
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

  const handleStartExperience = useCallback(() => {
    console.log('Starting experience');
    setGameStarted(true);
    setShowRitualModal(true);
    
    Animated.timing(ritualAnimation, {
      toValue: 1,
      duration: 2000,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [ritualAnimation]);

  const handleBeginExperience = useCallback(async () => {
    if (!appointment) return;

    try {
      console.log('Begin experience');
      setGameStarted(true);
      
      const { error } = await supabase
        .from('appointments')
        .update({ experience_started: true })
        .eq('id', appointment.id);

      if (error) {
        console.error('Error updating experience_started:', error);
        return;
      }

      setShowRitualModal(false);
      setShowWelcomeModal(true);
    } catch (error) {
      console.error('Error starting experience:', error);
    }
  }, [appointment]);

  const handleContinueToPresentation = useCallback(() => {
    console.log('Continue to presentation');
    setGameStarted(true);
    setShowWelcomeModal(false);
    setExperienceStarted(true);
  }, []);

  const handleUserPresented = useCallback(async () => {
    if (!appointment || !user) return;

    try {
      console.log('User marked as presented');
      
      const presentedAt = new Date().toISOString();
      
      const { error } = await supabase
        .from('event_participants')
        .update({ 
          is_presented: true,
          presented_at: presentedAt
        })
        .eq('event_id', appointment.event_id)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error updating presented status:', error);
        return;
      }

      await supabase
        .from('appointments')
        .update({ presented: true })
        .eq('id', appointment.id);

      setUserPresented(true);
      
      loadActiveParticipants(appointment.event_id);
    } catch (error) {
      console.error('Error marking user as presented:', error);
    }
  }, [appointment, user, loadActiveParticipants]);

  useFocusEffect(
    useCallback(() => {
      console.log('Screen focused');
      
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

    console.log('Setting up Realtime subscription');
    
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
          
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const newParticipant = payload.new as any;
            
            if (newParticipant.is_presented && newParticipant.user_id !== user.id) {
              const presentationKey = `presented_${newParticipant.user_id}_${newParticipant.event_id}`;
              
              if (!shownConfirmations.has(presentationKey)) {
                shownConfirmations.add(presentationKey);
                
                supabase
                  .from('users')
                  .select('name')
                  .eq('id', newParticipant.user_id)
                  .single()
                  .then(({ data }) => {
                    const userName = data?.name || 'Alguien';
                    showToastNotification(`${userName} se ha presentado.`);
                  });
              }
            }
          }
          
          loadActiveParticipants(appointment.event_id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [appointment, user, loadActiveParticipants, showToastNotification, shownConfirmations]);

  useEffect(() => {
    if (!appointment) return;

    console.log('Setting up game state subscription');

    const channel = supabase
      .channel(`game_${appointment.event_id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'events',
          filter: `id=eq.${appointment.event_id}`,
        },
        (payload) => {
          console.log('Game state update:', payload);
          
          const newEvent = payload.new as any;
          
          if (newEvent.game_phase === 'waiting_for_spin' || 
              newEvent.game_phase === 'show_result' ||
              newEvent.game_phase === 'question') {
            console.log('Game is active');
            setGameStarted(true);
          }
          
          loadAppointment();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [appointment, loadAppointment]);

  const canStartExperience = countdown <= 0 && activeParticipants.length >= 2;

  const ritualOpacity = ritualAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const ritualScale = ritualAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0.8, 1],
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

  // Show presentation phase
  if (experienceStarted && !allPresented && !gameStarted) {
    const presentedCount = activeParticipants.filter(p => p.is_presented).length;
    const totalCount = activeParticipants.length;
    const progressText = `${presentedCount} de ${totalCount}`;

    return (
      <LinearGradient
        colors={[nospiColors.purpleDark, nospiColors.purpleMid, nospiColors.purpleLight]}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
          <Text style={styles.titleWhite}>Presentación Guiada</Text>
          <Text style={styles.subtitleWhite}>Antes de iniciar el juego</Text>

          <View style={styles.phaseCard}>
            <Text style={styles.phaseMessage}>
              Cada uno diga su nombre y a qué se dedica.
            </Text>
          </View>

          <View style={styles.progressCard}>
            <Text style={styles.progressTitle}>Progreso</Text>
            <Text style={styles.progressText}>{progressText}</Text>
          </View>

          <View style={styles.participantsSection}>
            <Text style={styles.participantsTitleWhite}>Participantes</Text>
            {activeParticipants.map((participant, index) => {
              const displayName = participant.profiles?.name || 'Participante';
              const displayCity = participant.profiles?.city || 'Ciudad';
              
              return (
                <React.Fragment key={index}>
                <View style={styles.participantCard}>
                  <View style={styles.participantInfo}>
                    {participant.profiles?.profile_photo_url ? (
                      <Image 
                        source={{ uri: participant.profiles.profile_photo_url }} 
                        style={styles.participantPhoto}
                      />
                    ) : (
                      <View style={styles.participantPhotoPlaceholder}>
                        <Text style={styles.participantPhotoPlaceholderText}>
                          {displayName.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={styles.participantDetails}>
                      <Text style={styles.participantName}>{displayName}</Text>
                      <Text style={styles.participantOccupation}>{displayCity}</Text>
                    </View>
                  </View>
                  {participant.is_presented && (
                    <View style={styles.presentedBadge}>
                      <Text style={styles.presentedBadgeText}>✓</Text>
                    </View>
                  )}
                </View>
                </React.Fragment>
              );
            })}
          </View>

          {!userPresented && (
            <TouchableOpacity
              style={styles.presentedButton}
              onPress={handleUserPresented}
              activeOpacity={0.8}
            >
              <Text style={styles.presentedButtonText}>Ya me presenté</Text>
            </TouchableOpacity>
          )}

          {userPresented && !allPresented && (
            <View style={styles.waitingCard}>
              <Text style={styles.waitingText}>
                ✓ Esperando a que todos se presenten...
              </Text>
            </View>
          )}
        </ScrollView>
      </LinearGradient>
    );
  }

  // Show game dynamics once all presented or game started
  if (allPresented || gameStarted) {
    console.log('Rendering GameDynamicsScreen');
    
    return <GameDynamicsScreen appointment={appointment} activeParticipants={activeParticipants.map(p => ({
      id: p.id,
      user_id: p.user_id,
      name: p.profiles?.name || 'Participante',
      profile_photo_url: p.profiles?.profile_photo_url || null,
      occupation: p.profiles?.city || 'Ciudad',
      confirmed: p.confirmed,
      check_in_time: p.check_in_time,
      presented: p.is_presented
    }))} />;
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

        {checkInPhase === 'confirmed' && !experienceStarted && (
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
                        {participant.profiles?.profile_photo_url ? (
                          <Image 
                            source={{ uri: participant.profiles.profile_photo_url }} 
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
                  })}
                </View>
              )}
            </View>

            {canStartExperience && (
              <TouchableOpacity
                style={styles.startButton}
                onPress={handleStartExperience}
                activeOpacity={0.8}
              >
                <Text style={styles.startButtonText}>🎉 Iniciar Experiencia</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>

      {toastVisible && (
        <Animated.View
          style={[
            styles.toastContainer,
            {
              opacity: toastOpacity,
              transform: [{ translateY: toastTranslateY }],
            },
          ]}
        >
          <View style={styles.toastContent}>
            <Text style={styles.toastIcon}>✨</Text>
            <Text style={styles.toastText}>{toastMessage}</Text>
          </View>
        </Animated.View>
      )}

      <Modal
        visible={showRitualModal}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={styles.modalOverlay}>
          <Animated.View 
            style={[
              styles.ritualModalContent,
              { opacity: ritualOpacity, transform: [{ scale: ritualScale }] }
            ]}
          >
            <Text style={styles.ritualIcon}>✨</Text>
            <Text style={styles.ritualTitle}>La experiencia comienza ahora.</Text>
            <Text style={styles.ritualText}>
              Los primeros minutos son cruciales para crear una mejor experiencia.
            </Text>
            <TouchableOpacity
              style={styles.ritualButton}
              onPress={handleBeginExperience}
              activeOpacity={0.8}
            >
              <Text style={styles.ritualButtonText}>Continuar</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>

      <Modal
        visible={showWelcomeModal}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.welcomeModalContent}>
            <Text style={styles.welcomeTitle}>Bienvenidos a Nospi</Text>
            <Text style={styles.welcomeText}>
              Esta dinámica está diseñada para romper el hielo y generar conexión real.{'\n\n'}
              Todos deben participar para que funcione.
            </Text>
            <TouchableOpacity
              style={styles.welcomeButton}
              onPress={handleContinueToPresentation}
              activeOpacity={0.8}
            >
              <Text style={styles.welcomeButtonText}>Comenzar</Text>
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
  titleWhite: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    marginTop: 48,
  },
  subtitle: {
    fontSize: 16,
    color: nospiColors.purpleDark,
    opacity: 0.8,
    marginBottom: 24,
  },
  subtitleWhite: {
    fontSize: 16,
    color: '#FFFFFF',
    opacity: 0.9,
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
  participantListPhoto: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
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
  startButton: {
    backgroundColor: nospiColors.purpleDark,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  startButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  phaseCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
  },
  phaseMessage: {
    fontSize: 16,
    color: nospiColors.purpleDark,
    textAlign: 'center',
    fontWeight: '600',
  },
  progressCard: {
    backgroundColor: nospiColors.purpleLight,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
  },
  progressTitle: {
    fontSize: 16,
    color: nospiColors.purpleDark,
    marginBottom: 8,
    fontWeight: '600',
  },
  progressText: {
    fontSize: 32,
    color: nospiColors.purpleDark,
    fontWeight: 'bold',
  },
  participantsSection: {
    marginBottom: 16,
  },
  participantsTitleWhite: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  participantCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  participantInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  participantPhoto: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  participantPhotoPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: nospiColors.purpleLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  participantPhotoPlaceholderText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
  },
  participantDetails: {
    flex: 1,
  },
  participantName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 4,
  },
  participantOccupation: {
    fontSize: 14,
    color: '#666',
  },
  presentedBadge: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  presentedBadgeText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  presentedButton: {
    backgroundColor: nospiColors.purpleDark,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  presentedButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  waitingCard: {
    backgroundColor: '#D1FAE5',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  waitingText: {
    fontSize: 14,
    color: '#065F46',
    textAlign: 'center',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  ritualModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 40,
    width: '100%',
    maxWidth: 500,
    alignItems: 'center',
  },
  ritualIcon: {
    fontSize: 80,
    marginBottom: 24,
  },
  ritualTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 24,
    textAlign: 'center',
  },
  ritualText: {
    fontSize: 16,
    color: '#333',
    lineHeight: 26,
    marginBottom: 32,
    textAlign: 'center',
  },
  ritualButton: {
    backgroundColor: nospiColors.purpleDark,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 48,
  },
  ritualButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  welcomeModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 32,
    width: '100%',
    maxWidth: 500,
  },
  welcomeTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 24,
    textAlign: 'center',
  },
  welcomeText: {
    fontSize: 16,
    color: '#333',
    lineHeight: 26,
    marginBottom: 32,
    textAlign: 'center',
  },
  welcomeButton: {
    backgroundColor: nospiColors.purpleDark,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  welcomeButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  toastContainer: {
    position: 'absolute',
    top: 80,
    left: 20,
    right: 20,
    zIndex: 9999,
  },
  toastContent: {
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  toastIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  toastText: {
    fontSize: 16,
    fontWeight: '600',
    color: nospiColors.purpleDark,
    flex: 1,
  },
});
