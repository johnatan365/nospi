import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, TextInput, Platform, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { useSupabase } from '@/contexts/SupabaseContext';
import * as Notifications from 'expo-notifications';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
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
  const router = useRouter();
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
  
  const [gamePhase, setGamePhase] = useState<string>('intro');

  // Per-user flow states
  const [userReadyForRules, setUserReadyForRules] = useState(false);
  const [userReadyForGame, setUserReadyForGame] = useState(false);
  const [rulesCountdown, setRulesCountdown] = useState(20);
  const [showDivertidoModal, setShowDivertidoModal] = useState(false);
  const divertidoScaleAnim = useRef(new Animated.Value(0)).current;
  const divertidoFadeAnim = useRef(new Animated.Value(0)).current;

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
    
    // Calculate time until exact appointment time (for code entry)
    const diffToEventTime = eventDate.getTime() - now.getTime();
    
    // Calculate time until 10 minutes after appointment (for "Continuar" button)
    const eventDatePlus10 = new Date(startTime);
    eventDatePlus10.setMinutes(eventDatePlus10.getMinutes() + 10);
    const diffToPlus10 = eventDatePlus10.getTime() - now.getTime();

    setCountdown(diffToPlus10);

    if (diffToEventTime <= 0 && !appointment?.location_confirmed && checkInPhase === 'waiting') {
      setCheckInPhase('code_entry');
    }

    // Display countdown to 10 minutes after appointment
    if (diffToPlus10 <= 0) {
      setCountdownDisplay('Ahora');
      return;
    }

    const hours = Math.floor(diffToPlus10 / (1000 * 60 * 60));
    const minutes = Math.floor((diffToPlus10 % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diffToPlus10 % (1000 * 60)) / 1000);

    const countdownText = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    setCountdownDisplay(countdownText);
  }, [appointment, checkInPhase]);

  const requestNotificationPermissions = useCallback(async () => {
    // Skip on web - notifications not fully supported
    if (Platform.OS === 'web') {
      return;
    }

    try {
      const { status } = await Notifications.requestPermissionsAsync();
    } catch (error) {
      console.error('Error requesting notification permissions:', error);
    }
  }, []);

  const scheduleNotifications = useCallback(async (startTime: string) => {
    // Skip on web - notifications not fully supported
    if (Platform.OS === 'web') {
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
            trigger: { type: 'date', date: sixHoursBefore },
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
            trigger: { type: 'date', date: oneHourBefore },
          });
        }
      }
    } catch (error) {
      console.error('Error scheduling notifications:', error);
    }
  }, []);

  const loadActiveParticipants = useCallback(async (eventId: string) => {
    try {
      
      const { data, error } = await supabase
        .rpc('get_event_participants_for_interaction', { p_event_id: eventId });

      if (error) {
        console.error('❌ Error loading participants:', error);
        return;
      }

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
      
      
      if (appointmentData.event?.event_status === 'closed' || appointmentData.status === 'anterior') {
        setAppointment(null);
        setLoading(false);
        return;
      }
      
      setAppointment(appointmentData as any);
      
      // If user hasn't confirmed location, force them to code_entry phase regardless of event's game_phase
      if (!appointmentData.location_confirmed) {
        setCheckInPhase('code_entry');
        setGamePhase('intro'); // Keep in intro phase until they confirm
      } else {
        setCheckInPhase('confirmed');
        
        if (appointmentData.event?.game_phase) {
          setGamePhase(appointmentData.event.game_phase);
          // Already confirmed and game is active: skip intro screens on reload
          const gp = appointmentData.event.game_phase;
          if (gp === 'questions' || gp === 'question_active' || gp === 'level_transition' || gp === 'finished' || gp === 'free_phase') {
            setUserReadyForRules(true);
            setUserReadyForGame(true);
          }
        }
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
    

    if (enteredCode !== expectedCode) {
      setCodeError('Código incorrecto.');
      return;
    }

    setCodeError('');

    try {
      const confirmedAt = new Date().toISOString();

      setCheckInPhase('confirmed');
      setConfirmationCode('');
      
      setAppointment(prev => ({
        ...prev!,
        arrival_status: 'on_time',
        checked_in_at: confirmedAt,
        location_confirmed: true,
      }));
      
      // This allows the user to join the game that's already in progress WITHOUT waiting for realtime
      if (appointment.event?.game_phase) {
        setGamePhase(appointment.event.game_phase);
      }
      
      // Now perform database updates in the background
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
        // Revert optimistic update on error
        setCheckInPhase('code_entry');
        setCodeError('No se pudo registrar tu llegada.');
        return;
      }

      
      await supabase
        .from('appointments')
        .update({
          arrival_status: 'on_time',
          checked_in_at: confirmedAt,
          location_confirmed: true,
        })
        .eq('id', appointment.id);
      
      loadActiveParticipants(appointment.event_id);
    } catch (error) {
      console.error('Error during check-in:', error);
      // Revert optimistic update on error
      setCheckInPhase('code_entry');
      setCodeError('Ocurrió un error.');
    }
  }, [appointment, user, confirmationCode, loadActiveParticipants]);

  const handleStartExperience = useCallback(async () => {
    
    if (!appointment?.event_id || startingExperience) {
      return;
    }

    // If game is already in progress (another user started it), just update local state
    if (gamePhase === 'questions' || gamePhase === 'question_active' || gamePhase === 'level_transition' || gamePhase === 'finished' || gamePhase === 'free_phase') {
      return;
    }

    if (activeParticipants.length < 2) {
      return;
    }

    setStartingExperience(true);
    
    try {
      
      // Select random starter
      const randomIndex = Math.floor(Math.random() * activeParticipants.length);
      const starterUserId = activeParticipants[randomIndex].user_id;
      
      // Get first question from divertido level
      const firstQuestion = '¿Cuál es tu nombre y a qué te dedicas?';
      
      
      setGamePhase('questions');
      
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
        // Revert optimistic update on error
        setGamePhase('intro');
        setStartingExperience(false);
        return;
      }

      
    } catch (error) {
      console.error('❌ Unexpected error:', error);
      // Revert optimistic update on error
      setGamePhase('intro');
      setStartingExperience(false);
    } finally {
      setTimeout(() => {
        setStartingExperience(false);
      }, 1000);
    }
  }, [appointment, activeParticipants, startingExperience, gamePhase]);

  useEffect(() => {
    if (!appointment?.event_id || !appointment?.id || !user) return;


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
          const newEvent = payload.new as any;
          
          if (newEvent.event_status === 'closed') {
            setAppointment(null);
            return;
          }
          
          // This prevents users who haven't entered the code from seeing the game
          setAppointment(prev => {
            if (!prev) return prev;
            
            const updatedAppointment = {
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
            
            if (prev.location_confirmed && newEvent.game_phase) {
              setGamePhase(newEvent.game_phase);
            } else {
            }
            
            return updatedAppointment;
          });
        }
      )
      .subscribe((status) => {
      });

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
          const newAppointment = payload.new as any;
          
          if (newAppointment.status === 'anterior') {
            setAppointment(null);
            setLoading(false);
            return;
          }
          
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
        }
      });

    return () => {
      supabase.removeChannel(eventChannel);
      supabase.removeChannel(appointmentChannel);
    };
  }, [appointment?.event_id, appointment?.id, user]);

  useFocusEffect(
    useCallback(() => {
      
      if (user) {
        loadAppointment();
      }
      
      return () => {
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
          loadActiveParticipants(appointment.event_id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [appointment, user, loadActiveParticipants]);

  const canStartExperience = countdown <= 0 && activeParticipants.length >= 2;

  // Rules screen 20-second countdown
  useEffect(() => {
    if (!userReadyForRules || userReadyForGame) return;
    
    setRulesCountdown(20);
    const interval = setInterval(() => {
      setRulesCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [userReadyForRules, userReadyForGame]);

  // Show divertido level modal animation
  const showDivertidoModalAnimation = useCallback(() => {
    setShowDivertidoModal(true);
    divertidoScaleAnim.setValue(0);
    divertidoFadeAnim.setValue(0);

    Animated.parallel([
      Animated.spring(divertidoScaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(divertidoFadeAnim, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(divertidoScaleAnim, {
            toValue: 1.2,
            duration: 300,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(divertidoFadeAnim, {
            toValue: 0,
            duration: 300,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
        ]).start(() => {
          setShowDivertidoModal(false);
          // ONLY set local state - do NOT touch DB here
          setUserReadyForGame(true);
        });
      }, 2000);
    });
  }, [divertidoScaleAnim, divertidoFadeAnim]);

  // Handle "Continuar" per-user (local only - does NOT trigger DB changes)
  const handleUserContinue = useCallback(() => {
    setUserReadyForRules(true);
  }, []);

  // When user finishes the intro flow (Comenzar), start game in DB if not already started
  useEffect(() => {
    if (!userReadyForGame) return;
    // Only start the game if it hasn't been started by another user yet
    if (gamePhase !== 'questions' && gamePhase !== 'question_active' && gamePhase !== 'level_transition' && gamePhase !== 'finished' && gamePhase !== 'free_phase') {
      handleStartExperience();
    }
  }, [userReadyForGame, gamePhase, handleStartExperience]);

  // Handle game finish - navigate to appointments tab (anteriores)
  const handleFinishGame = useCallback(() => {
    setAppointment(null);
    router.replace('/(tabs)/appointments');
  }, [router]);

  if (loading) {
    return (
      <LinearGradient
        colors={['#1a0010', '#880E4F', '#AD1457']}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFFFFF" />
        </View>
      </LinearGradient>
    );
  }

  if (!appointment) {
    return (
      <LinearGradient
        colors={['#1a0010', '#880E4F', '#AD1457']}
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
    const eventDate = new Date(appointment.event.start_time!);
    const eventDateText = eventDate.toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const now = new Date();
    const diffMs = eventDate.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    let countdownText = '';
    if (diffDays >= 2) {
      countdownText = `Faltan ${diffDays} días para tu experiencia`;
    } else if (diffDays === 1) {
      countdownText = 'Falta 1 día para tu experiencia';
    } else if (diffHours >= 1) {
      countdownText = `Faltan ${diffHours} horas para tu experiencia`;
    } else {
      countdownText = '¡Tu experiencia es muy pronto!';
    }

    return (
      <LinearGradient
        colors={['#1a0010', '#880E4F', '#AD1457']}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
          <Text style={styles.title}>Tu Evento Nospi</Text>
          <Text style={styles.subtitle}>¡Se acerca una gran experiencia!</Text>

          {/* Countdown card */}
          <View style={[styles.eventInfoCard, { marginBottom: 16 }]}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>🗓️</Text>
            <Text style={[styles.eventInfoTitle, { fontSize: 22, marginBottom: 6 }]}>{countdownText}</Text>
            <Text style={styles.eventInfoDate}>{eventDateText}</Text>
            <Text style={styles.eventInfoTime}>{appointment.event.time}</Text>
          </View>

          {/* Puntualidad */}
          <View style={styles.preEventTipCard}>
            <Text style={styles.preEventTipIcon}>⏰</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.preEventTipTitle}>Llega puntual</Text>
              <Text style={styles.preEventTipText}>El evento arranca con una dinámica para romper el hielo. No querrás perderte el inicio.</Text>
            </View>
          </View>

          {/* Instrucción */}
          <View style={styles.preEventTipCard}>
            <Text style={styles.preEventTipIcon}>💬</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.preEventTipTitle}>Cuando llegues</Text>
              <Text style={styles.preEventTipText}>Abre esta pestaña para confirmar tu asistencia e iniciar la experiencia con los demás.</Text>
            </View>
          </View>

        </ScrollView>
      </LinearGradient>
    );
  }

  if ((gamePhase === 'questions' || gamePhase === 'question_active' || gamePhase === 'level_transition' || gamePhase === 'finished' || gamePhase === 'free_phase') && userReadyForRules && userReadyForGame) {
    
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
    
    return <GameDynamicsScreen appointment={appointment} activeParticipants={transformedParticipants} onFinish={handleFinishGame} />;
  }
  
  // ── Rules/Intro Screen (per-user, atrevido theme) ──────────────────────────
  if (userReadyForRules && !userReadyForGame && checkInPhase === 'confirmed') {
    return (
      <LinearGradient
        colors={['#1a0010', '#880E4F', '#AD1457']}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <ScrollView style={styles.container} contentContainerStyle={[styles.contentContainer, { alignItems: 'center', justifyContent: 'center', paddingTop: 60 }]}>
          {/* Header icon */}
          <Text style={styles.rulesIcon}>🎲</Text>
          
          <Text style={styles.rulesTitle}>¿Cómo funciona?</Text>

          {/* Rules card */}
          <View style={styles.rulesCard}>
            <View style={styles.rulesRow}>
              <Text style={styles.rulesEmoji}>🎯</Text>
              <Text style={styles.rulesText}>Pasarás por 3 niveles: Divertido, Sensual y Atrevido.</Text>
            </View>
            
            <View style={styles.rulesDivider} />
            
            <View style={styles.rulesRow}>
              <Text style={styles.rulesEmoji}>👥</Text>
              <Text style={styles.rulesText}>Todos deben responder cada pregunta para avanzar a la siguiente.</Text>
            </View>
            
            <View style={styles.rulesDivider} />
            
            <View style={styles.rulesRow}>
              <Text style={styles.rulesEmoji}>🥃</Text>
              <Text style={styles.rulesText}>Si alguien no responde, deberá tomar un shot o cumplir un reto del grupo.</Text>
            </View>
          </View>

          {/* Countdown or Comenzar button */}
          {rulesCountdown > 0 ? (
            <View style={styles.rulesCountdownContainer}>
              <Text style={styles.rulesCountdownLabel}>Léelo con calma</Text>
              <View style={styles.rulesCountdownCircle}>
                <Text style={styles.rulesCountdownNumber}>{rulesCountdown}</Text>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.comenzarButton}
              onPress={showDivertidoModalAnimation}
              activeOpacity={0.85}
            >
              <Text style={styles.comenzarButtonText}>Comenzar</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        {/* Divertido Level Modal Overlay */}
        {showDivertidoModal && (
          <View style={styles.divertidoOverlay}>
            <Animated.View
              style={[
                styles.divertidoCard,
                {
                  transform: [{ scale: divertidoScaleAnim }],
                  opacity: divertidoFadeAnim,
                },
              ]}
            >
              <LinearGradient
                colors={['#4FC3F7', '#0288D1', '#01579B']}
                style={styles.divertidoCardGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Text style={styles.divertidoEmoji}>😄</Text>
                <Text style={styles.divertidoModalTitle}>Nivel</Text>
                <Text style={styles.divertidoModalLevel}>Divertido</Text>
              </LinearGradient>
            </Animated.View>
          </View>
        )}
      </LinearGradient>
    );
  }


  const eventTypeText = appointment.event.type === 'bar' ? 'Bar' : 'Restaurante';
  const eventIcon = appointment.event.type === 'bar' ? '🍸' : '🍽️';
  
  const locationRevealed = appointment.event.is_location_revealed || false;
  const shouldShowLocationText = !locationRevealed;
  const locationText = locationRevealed && appointment.event.location_name
    ? appointment.event.location_name
    : '';
  
  const participantCountText = activeParticipants.length.toString();

  return (
    <LinearGradient
      colors={['#1a0010', '#880E4F', '#AD1457']}
      style={styles.gradient}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.title}>Hoy es tu experiencia Nospi</Text>
        <Text style={styles.subtitle}>¡Prepárate para conectar!</Text>

        <View style={styles.countdownCard}>
          <Text style={styles.countdownLabel}>
            {checkInPhase === 'code_entry' ? 'Tiempo para iniciar la dinámica' : 'Tiempo para ingresar código'}
          </Text>
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
          {shouldShowLocationText && (
            <Text style={styles.eventLocation}>Ubicación se revelará 48 horas antes del evento</Text>
          )}
          {locationRevealed && locationText && (
            <Text style={styles.eventLocation}>{locationText}</Text>
          )}
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

            {!canStartExperience && countdown > 0 && (
              <View style={styles.infoCard}>
                <Text style={styles.infoText}>
                  ⏰ Esperando el momento de inicio
                </Text>
                <Text style={styles.infoTextSecondary}>
                  El botón &quot;Continuar&quot; aparecerá cuando termine el conteo y así poder iniciar la dinámica
                </Text>
              </View>
            )}

            {canStartExperience && (
              <>
                <View style={styles.infoCard}>
                  <Text style={styles.infoText}>
                    ✨ Hay {activeParticipants.length} participantes confirmados
                  </Text>
                  <Text style={styles.infoTextSecondary}>
                    Presiona &quot;Continuar&quot; para ver las reglas del juego
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.continueButton}
                  onPress={handleUserContinue}
                  activeOpacity={0.8}
                >
                  <Text style={styles.continueButtonText}>
                    🚀 Continuar
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
    color: '#FFFFFF',
    marginBottom: 8,
    marginTop: 48,
  },
  subtitle: {
    fontSize: 16,
    color: '#FFFFFF',
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
  preEventTipCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 12,
  },
  preEventTipIcon: {
    fontSize: 26,
    marginTop: 2,
  },
  preEventTipTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: nospiColors.purpleDark,
    marginBottom: 4,
  },
  preEventTipText: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
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
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    marginBottom: 12,
  },
  countdownLabel: {
    fontSize: 14,
    color: nospiColors.purpleDark,
    marginBottom: 8,
    fontWeight: '600',
  },
  countdownTime: {
    fontSize: 48,
    fontWeight: '800',
    fontStyle: 'italic',
    color: nospiColors.purpleDark,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
    letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.15)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  eventCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  eventIconLarge: {
    fontSize: 32,
    marginRight: 12,
  },
  eventHeaderText: {
    flex: 1,
  },
  eventType: {
    fontSize: 20,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
  },
  eventTime: {
    fontSize: 15,
    color: nospiColors.purpleMid,
    fontWeight: '600',
    marginTop: 2,
  },
  eventLocation: {
    fontSize: 13,
    color: '#666',
  },
  codeEntryCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
  },
  codeEntryTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    textAlign: 'center',
    marginBottom: 6,
  },
  codeEntrySubtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginBottom: 18,
  },
  codeInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 14,
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    borderWidth: 2,
    borderColor: nospiColors.purpleLight,
  },
  codeErrorText: {
    fontSize: 13,
    color: '#EF4444',
    textAlign: 'center',
    marginBottom: 10,
  },
  confirmCodeButton: {
    backgroundColor: nospiColors.purpleDark,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
  confirmCodeButtonText: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  confirmedCard: {
    backgroundColor: '#D1FAE5',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  confirmedIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  confirmedText: {
    fontSize: 15,
    color: '#065F46',
    textAlign: 'center',
    fontWeight: '600',
  },
  participantsListCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  participantsListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  participantsListTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    flex: 1,
  },
  participantCountBadge: {
    backgroundColor: nospiColors.purpleMid,
    borderRadius: 16,
    paddingVertical: 5,
    paddingHorizontal: 12,
    minWidth: 40,
    alignItems: 'center',
  },
  participantCountText: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  participantsList: {
    marginTop: 6,
  },
  participantListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  participantListPhotoPlaceholder: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: nospiColors.purpleLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  participantListPhotoText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
  },
  participantListName: {
    fontSize: 15,
    color: '#333',
    fontWeight: '500',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  infoCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  infoText: {
    fontSize: 16,
    fontWeight: '600',
    color: nospiColors.purpleDark,
    textAlign: 'center',
    marginBottom: 8,
  },
  infoTextSecondary: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
  },
  continueButton: {
    backgroundColor: '#10B981',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 10,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  continueButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },

  // ── Rules/Intro Screen (atrevido theme) ──────────────────────────────────────
  rulesIcon: {
    fontSize: 72,
    marginBottom: 16,
  },
  rulesTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 24,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  rulesCard: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(240,98,146,0.30)',
    padding: 24,
    width: '100%',
    marginBottom: 32,
  },
  rulesRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  rulesEmoji: {
    fontSize: 26,
    marginTop: 2,
  },
  rulesText: {
    flex: 1,
    fontSize: 17,
    color: '#FFFFFF',
    lineHeight: 24,
    fontWeight: '400',
  },
  rulesDivider: {
    height: 1,
    backgroundColor: 'rgba(240,98,146,0.20)',
    marginVertical: 16,
  },
  rulesCountdownContainer: {
    alignItems: 'center',
    marginTop: 8,
  },
  rulesCountdownLabel: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 14,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  rulesCountdownCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2.5,
    borderColor: '#F06292',
    backgroundColor: 'rgba(240,98,146,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rulesCountdownNumber: {
    fontSize: 30,
    fontWeight: '700',
    color: '#F06292',
  },
  comenzarButton: {
    backgroundColor: '#880E4F',
    borderRadius: 50,
    paddingVertical: 18,
    paddingHorizontal: 56,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(240,98,146,0.50)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 10,
    marginTop: 8,
  },
  comenzarButtonText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
  },

  // ── Divertido Level Modal ────────────────────────────────────────────────────
  divertidoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  divertidoCard: {
    borderRadius: 32,
    overflow: 'hidden',
    minWidth: 280,
  },
  divertidoCardGradient: {
    padding: 48,
    alignItems: 'center',
    borderRadius: 32,
  },
  divertidoEmoji: {
    fontSize: 100,
    marginBottom: 24,
  },
  divertidoModalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 10,
    textAlign: 'center',
  },
  divertidoModalLevel: {
    fontSize: 38,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
});