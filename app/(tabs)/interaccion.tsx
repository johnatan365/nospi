
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
  game_phase: 'intro' | 'roulette' | 'playing' | 'finished';
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
  const [showPresentationPhase, setShowPresentationPhase] = useState(false);
  const [activeParticipants, setActiveParticipants] = useState<Participant[]>([]);
  const [userPresented, setUserPresented] = useState(false);
  const [allPresented, setAllPresented] = useState(false);
  const [ritualAnimation] = useState(new Animated.Value(0));

  // Toast notification states
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTranslateY = useRef(new Animated.Value(-50)).current;
  
  // Special animation for "La mesa está casi lista"
  const [specialToastVisible, setSpecialToastVisible] = useState(false);
  const [specialToastMessage, setSpecialToastMessage] = useState('');
  const specialToastOpacity = useRef(new Animated.Value(0)).current;
  const specialToastScale = useRef(new Animated.Value(0.8)).current;

  // Track shown confirmations to prevent duplicates
  const shownConfirmations = useRef(new Set<string>()).current;
  const hasShownSpecialAnimation = useRef(false);

  // CRITICAL: Reload appointment and participants when screen is focused
  useFocusEffect(
    useCallback(() => {
      console.log('=== INTERACCIÓN SCREEN FOCUSED ===');
      console.log('User ID:', user?.id);
      
      if (user) {
        loadAppointment();
      }
      
      return () => {
        console.log('Interacción screen unfocused');
      };
    }, [user])
  );

  useEffect(() => {
    if (appointment && appointment.event.start_time) {
      const interval = setInterval(() => {
        updateCountdown(appointment.event.start_time!);
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [appointment]);

  useEffect(() => {
    requestNotificationPermissions();
  }, []);

  // FIXED: Supabase Realtime subscription for event_participants with better error handling
  useEffect(() => {
    if (!appointment || !user) return;

    console.log('=== REALTIME SUBSCRIPTION SETUP (event_participants) ===');
    console.log('Event ID:', appointment.event_id);
    console.log('User ID:', user.id);
    
    // Initial load
    loadActiveParticipants(appointment.event_id);

    const channel = supabase
      .channel(`event_participants_${appointment.event_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'event_participants',
          filter: `event_id=eq.${appointment.event_id}`,
        },
        (payload) => {
          console.log('=== REALTIME UPDATE RECEIVED (event_participants) ===');
          console.log('Event type:', payload.eventType);
          console.log('Payload:', JSON.stringify(payload, null, 2));
          
          // Handle new confirmations for visual feedback
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const newParticipant = payload.new as any;
            
            console.log('New participant data:', {
              user_id: newParticipant.user_id,
              event_id: newParticipant.event_id,
              confirmed: newParticipant.confirmed,
              is_current_user: newParticipant.user_id === user.id
            });
            
            // Only show animation if confirmed is true and it's not the current user
            if (newParticipant.confirmed && newParticipant.user_id !== user.id) {
              const confirmationKey = `${newParticipant.user_id}_${newParticipant.event_id}`;
              
              // Prevent duplicate animations
              if (!shownConfirmations.has(confirmationKey)) {
                shownConfirmations.add(confirmationKey);
                
                // Fetch user name for the toast
                supabase
                  .from('users')
                  .select('name')
                  .eq('id', newParticipant.user_id)
                  .single()
                  .then(({ data }) => {
                    const userName = data?.name || 'Alguien';
                    console.log('Showing toast for user:', userName);
                    showToastNotification(`${userName} ya está listo.`);
                  });
              }
            }
          }
          
          // CRITICAL: Reload participants list to update UI for ALL users
          console.log('Reloading participants after realtime event');
          loadActiveParticipants(appointment.event_id);
        }
      )
      .subscribe((status) => {
        console.log('Realtime subscription status (event_participants):', status);
        
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to event_participants changes');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Realtime subscription error - retrying...');
          // Retry subscription after a delay
          setTimeout(() => {
            loadActiveParticipants(appointment.event_id);
          }, 2000);
        }
      });

    return () => {
      console.log('Cleaning up Realtime subscription (event_participants)');
      supabase.removeChannel(channel);
    };
  }, [appointment, user]);

  // FIXED: Realtime subscription for events table (game state) with better handling
  useEffect(() => {
    if (!appointment) return;

    console.log('=== GAME STATE REALTIME SUBSCRIPTION SETUP ===');
    console.log('Event ID:', appointment.event_id);

    const channel = supabase
      .channel(`event_game_state_${appointment.event_id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'events',
          filter: `id=eq.${appointment.event_id}`,
        },
        (payload) => {
          console.log('=== GAME STATE UPDATE RECEIVED ===');
          console.log('Payload:', JSON.stringify(payload, null, 2));
          
          const newEvent = payload.new as any;
          
          // Log game state changes
          console.log('Game state changed:', {
            game_phase: newEvent.game_phase,
            selected_participant_name: newEvent.selected_participant_name,
            current_question: newEvent.current_question,
            current_question_level: newEvent.current_question_level
          });
          
          // CRITICAL: Reload appointment to get updated game state
          // This ensures all users see the same game state
          loadAppointment();
        }
      )
      .subscribe((status) => {
        console.log('Game state realtime subscription status:', status);
        
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to game state changes');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Game state subscription error');
        }
      });

    return () => {
      console.log('Cleaning up game state realtime subscription');
      supabase.removeChannel(channel);
    };
  }, [appointment]);

  const showToastNotification = (message: string) => {
    console.log('Showing toast notification:', message);
    setToastMessage(message);
    setToastVisible(true);

    // Reset animation values
    toastOpacity.setValue(0);
    toastTranslateY.setValue(-50);

    // Animate in
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

    // Animate out after 2 seconds
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
  };

  const showSpecialToastNotification = (message: string) => {
    console.log('Showing special toast notification:', message);
    setSpecialToastMessage(message);
    setSpecialToastVisible(true);

    // Reset animation values
    specialToastOpacity.setValue(0);
    specialToastScale.setValue(0.8);

    // Animate in
    Animated.parallel([
      Animated.timing(specialToastOpacity, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.spring(specialToastScale, {
        toValue: 1,
        tension: 40,
        friction: 6,
        useNativeDriver: true,
      }),
    ]).start();

    // Animate out after 2.5 seconds
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(specialToastOpacity, {
          toValue: 0,
          duration: 400,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(specialToastScale, {
          toValue: 0.8,
          duration: 400,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start(() => {
        setSpecialToastVisible(false);
      });
    }, 2500);
  };

  const loadAppointment = async () => {
    if (!user) {
      console.log('No user logged in');
      setLoading(false);
      return;
    }

    try {
      console.log('=== LOADING APPOINTMENT ===');
      console.log('User ID:', user.id);
      
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
      
      console.log('=== APPOINTMENT QUERY RESULT ===');
      console.log('Total appointments found:', data?.length || 0);
      
      if (!data || data.length === 0) {
        console.log('No confirmed appointment found for user');
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
      console.log('Selected appointment:', appointmentData.id);
      console.log('Event ID:', appointmentData.event_id);
      console.log('Game state from database:', {
        game_phase: appointmentData.event?.game_phase,
        selected_participant_name: appointmentData.event?.selected_participant_name,
        current_question: appointmentData.event?.current_question,
        current_question_level: appointmentData.event?.current_question_level
      });
      
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
      
      // Load participants after loading appointment
      if (appointmentData.event_id) {
        loadActiveParticipants(appointmentData.event_id);
      }
    } catch (error) {
      console.error('Failed to load appointment:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadActiveParticipants = async (eventId: string) => {
    try {
      console.log('=== LOADING PARTICIPANTS ===');
      console.log('Event ID:', eventId);
      console.log('Timestamp:', new Date().toISOString());
      
      // FIXED QUERY: Explicit JOIN with users table to get name, email, phone, city
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
          profiles:users (
            id,
            name,
            email,
            phone,
            city,
            profile_photo_url
          )
        `)
        .eq('event_id', eventId)
        .eq('confirmed', true)
        .order('check_in_time', { ascending: true });

      if (error) {
        console.error('Error loading participants:', error);
        return;
      }

      console.log('=== PARTICIPANTS QUERY RESULT ===');
      console.log('Total rows returned:', data?.length || 0);
      console.log('Raw data:', JSON.stringify(data, null, 2));

      const participants: Participant[] = (data || [])
        .filter((item: any) => {
          // CRITICAL: Filter out participants without profile data
          const hasProfile = item.profiles && item.profiles.name;
          if (!hasProfile) {
            console.warn('Participant without profile data:', item.user_id);
          }
          return hasProfile;
        })
        .map((item: any) => {
          const fullName = item.profiles.name;
          const email = item.profiles.email || '';
          const phone = item.profiles.phone || '';
          const city = item.profiles.city || '';
          const userPhoto = item.profiles.profile_photo_url || null;
          
          console.log('Processing participant:', {
            id: item.id,
            user_id: item.user_id,
            name: fullName,
            confirmed: item.confirmed,
            is_presented: item.is_presented
          });

          return {
            id: item.id,
            user_id: item.user_id,
            event_id: item.event_id,
            confirmed: item.confirmed,
            check_in_time: item.check_in_time,
            is_presented: item.is_presented || false,
            presented_at: item.presented_at || null,
            profiles: {
              id: item.profiles.id,
              name: fullName,
              email: email,
              phone: phone,
              city: city,
              profile_photo_url: userPhoto
            }
          };
        });

      console.log('=== FINAL PARTICIPANTS LIST ===');
      console.log('Participants loaded:', participants.length);
      console.log('Participants:', participants.map(p => ({ 
        name: p.profiles?.name,
        user_id: p.user_id, 
        confirmed: p.confirmed,
        is_presented: p.is_presented
      })));
      
      // Check if we should show the special "La mesa está casi lista" animation
      // FIXED: Minimum 2 participants instead of 3
      if (participants.length >= 2 && !hasShownSpecialAnimation.current) {
        hasShownSpecialAnimation.current = true;
        showSpecialToastNotification('La mesa está casi lista.');
      }
      
      setActiveParticipants(participants);
      
      const allHavePresented = participants.length > 0 && participants.every(p => p.is_presented);
      setAllPresented(allHavePresented);
    } catch (error) {
      console.error('Failed to load participants:', error);
    }
  };

  const checkIfEventDay = (startTime: string) => {
    const now = new Date();
    const eventDate = new Date(startTime);
    
    // Create date at midnight (00:00) local time for event day
    const eventDayStart = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate(), 0, 0, 0, 0);
    
    // Check if current time is on or after event day midnight
    const isSameDay = 
      now.getFullYear() === eventDate.getFullYear() &&
      now.getMonth() === eventDate.getMonth() &&
      now.getDate() === eventDate.getDate();
    
    const isAfterMidnight = now >= eventDayStart;
    
    const isToday = isSameDay && isAfterMidnight;
    console.log('Is event day:', isToday, '| Current time:', now.toLocaleString(), '| Event day start:', eventDayStart.toLocaleString(), '| Event time:', eventDate.toLocaleString());
    setIsEventDay(isToday);
  };

  const updateCountdown = (startTime: string) => {
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
  };

  const requestNotificationPermissions = async () => {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      console.log('Notification permission status:', status);
    } catch (error) {
      console.error('Error requesting notification permissions:', error);
    }
  };

  const scheduleNotifications = async (startTime: string) => {
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
              body: 'Falta 1 hora. La experiencia inicia puntual.',
              sound: true,
            },
            trigger: oneHourBefore,
          });
        }

        const tenMinutesBefore = new Date(eventDate.getTime() - 10 * 60 * 1000);
        if (tenMinutesBefore > now) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: '¡Últimos 10 minutos!',
              body: 'Tu experiencia Nospi comienza en 10 minutos. ¡Es hora de dirigirte al lugar!',
              sound: true,
            },
            trigger: tenMinutesBefore,
          });
        }

        if (eventDate > now) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: '¡Tu experiencia Nospi comienza ahora!',
              body: 'La experiencia inicia puntual. ¡Disfruta!',
              sound: true,
            },
            trigger: eventDate,
          });
        }
      }
    } catch (error) {
      console.error('Error scheduling notifications:', error);
    }
  };

  const handleCodeConfirmation = async () => {
    if (!appointment || !user) return;

    const enteredCode = confirmationCode.trim();
    const eventCode = appointment.event.confirmation_code;
    const expectedCode = (eventCode === null || eventCode === undefined || eventCode.trim() === '') 
      ? '1986' 
      : eventCode.trim();
    
    console.log('=== CONFIRMATION CODE VALIDATION ===');
    console.log('Expected code:', expectedCode);
    console.log('User entered code:', enteredCode);

    if (enteredCode !== expectedCode) {
      console.log('❌ Incorrect code entered');
      setCodeError('Código incorrecto. Verifica el código del encuentro.');
      return;
    }

    console.log('✅ Correct code entered, processing check-in');
    setCodeError('');

    try {
      const confirmedAt = new Date().toISOString();

      console.log('=== UPSERTING EVENT PARTICIPANT ===');
      console.log('Event ID:', appointment.event_id);
      console.log('User ID:', user.id);

      const { data, error: updateError } = await supabase
        .from('event_participants')
        .upsert({
          event_id: appointment.event_id,
          user_id: user.id,
          confirmed: true,
          check_in_time: confirmedAt,
        }, {
          onConflict: 'event_id,user_id'
        })
        .select();

      if (updateError) {
        console.error('Error updating event_participants:', updateError);
        setCodeError('No se pudo registrar tu llegada. Intenta de nuevo.');
        return;
      }

      console.log('✅ Check-in successful');
      
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
      
      // Immediately reload participants to show the updated list
      console.log('Reloading participants after check-in');
      loadActiveParticipants(appointment.event_id);
    } catch (error) {
      console.error('Error during check-in:', error);
      setCodeError('Ocurrió un error. Intenta de nuevo.');
    }
  };

  const handleStartExperience = () => {
    console.log('User starting experience - showing ritual modal');
    setShowRitualModal(true);
    
    Animated.timing(ritualAnimation, {
      toValue: 1,
      duration: 2000,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  };

  const handleBeginExperience = async () => {
    if (!appointment) return;

    try {
      console.log('User confirmed to begin experience');
      
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
      
      console.log('Experience started, showing welcome modal');
    } catch (error) {
      console.error('Error starting experience:', error);
    }
  };

  const handleContinueToPresentation = () => {
    setShowWelcomeModal(false);
    setExperienceStarted(true);
    setShowPresentationPhase(true);
  };

  const handleUserPresented = async () => {
    if (!appointment || !user) return;

    try {
      console.log('User marked as presented');
      
      const presentedAt = new Date().toISOString();
      
      // Update event_participants with is_presented and presented_at
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
      
      // Reload participants to update the list
      loadActiveParticipants(appointment.event_id);
    } catch (error) {
      console.error('Error marking user as presented:', error);
    }
  };

  // FIXED: Validation - Check total confirmed participants by event_id (minimum 2)
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
            <Text style={styles.placeholderSubtext}>
              Confirma tu asistencia a un evento para acceder a la experiencia
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
            
            {appointment.event.is_location_revealed && appointment.event.location_name ? (
              <>
                <Text style={styles.eventInfoLocation}>{appointment.event.location_name}</Text>
                {appointment.event.location_address && (
                  <Text style={styles.eventInfoAddress}>{appointment.event.location_address}</Text>
                )}
              </>
            ) : (
              <Text style={styles.eventInfoLocationPlaceholder}>Ubicación se revelará próximamente</Text>
            )}
            
            <View style={styles.infoBox}>
              <Text style={styles.infoBoxText}>
                La experiencia interactiva estará disponible el día del evento desde las 12:00 AM
              </Text>
            </View>
          </View>
        </ScrollView>
      </LinearGradient>
    );
  }

  if (showPresentationPhase && !allPresented) {
    const presentedCount = activeParticipants.filter(p => p.is_presented).length;
    const totalCount = activeParticipants.length;
    const progressText = `${presentedCount} de ${totalCount}`;

    return (
      <LinearGradient
        colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
          <Text style={styles.title}>Fase 2: Presentación Guiada</Text>
          <Text style={styles.subtitle}>Antes de iniciar el juego</Text>

          <View style={styles.phaseCard}>
            <Text style={styles.phaseMessage}>
              Antes de iniciar el juego, cada uno diga su nombre y a qué se dedica.
            </Text>
          </View>

          <View style={styles.progressCard}>
            <Text style={styles.progressTitle}>Progreso de presentaciones</Text>
            <Text style={styles.progressText}>{progressText}</Text>
          </View>

          <View style={styles.participantsSection}>
            <Text style={styles.participantsTitle}>Participantes Activos</Text>
            {activeParticipants.length === 0 ? (
              <View style={styles.emptyParticipants}>
                <Text style={styles.emptyParticipantsText}>No hay participantes confirmados aún</Text>
              </View>
            ) : (
              activeParticipants.map((participant, index) => {
                const displayName = participant.profiles?.name || 'Participante Anónimo';
                
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
                        <Text style={styles.participantOccupation}>Participante</Text>
                      </View>
                    </View>
                    {participant.is_presented && (
                      <View style={styles.presentedBadge}>
                        <Text style={styles.presentedBadgeText}>✓ Presentado</Text>
                      </View>
                    )}
                  </View>
                  </React.Fragment>
                );
              })
            )}
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

          {userPresented && (
            <View style={styles.waitingCard}>
              <Text style={styles.waitingText}>
                ✓ Te has presentado. Esperando a que todos se presenten...
              </Text>
            </View>
          )}
        </ScrollView>
      </LinearGradient>
    );
  }

  if (allPresented && activeParticipants.length > 0) {
    return <GameDynamicsScreen appointment={appointment} activeParticipants={activeParticipants.map(p => ({
      id: p.id,
      user_id: p.user_id,
      name: p.profiles?.name || 'Participante Anónimo',
      profile_photo_url: p.profiles?.profile_photo_url || null,
      occupation: 'Participante',
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
  
  // CRITICAL: Calculate participant count for display
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

        {countdown > 0 && (
          <View style={styles.reminderCard}>
            <Text style={styles.reminderIcon}>💫</Text>
            <Text style={styles.reminderText}>
              Los primeros minutos son clave para generar conexión.
            </Text>
            <Text style={styles.reminderSubtext}>
              Llega a tiempo y aprovecha cada momento.
            </Text>
          </View>
        )}

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
          {appointment.event.is_location_revealed && appointment.event.location_address && (
            <Text style={styles.eventLocationAddress}>{appointment.event.location_address}</Text>
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

        {checkInPhase === 'confirmed' && !experienceStarted && (
          <>
            <View style={styles.confirmedCard}>
              <Text style={styles.confirmedIcon}>✅</Text>
              <Text style={styles.confirmedText}>
                ¡Llegada confirmada! Eres un Participante Activo.
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
                    const displayName = participant.profiles?.name || 'Participante Anónimo';
                    
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

            {!canStartExperience && (
              <View style={styles.waitingInfoCard}>
                <Text style={styles.waitingInfoText}>
                  La experiencia comenzará cuando al menos 2 personas estén confirmadas.
                </Text>
              </View>
            )}

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

      {specialToastVisible && (
        <Animated.View
          style={[
            styles.specialToastContainer,
            {
              opacity: specialToastOpacity,
              transform: [{ scale: specialToastScale }],
            },
          ]}
        >
          <View style={styles.specialToastContent}>
            <Text style={styles.specialToastIcon}>🎉</Text>
            <Text style={styles.specialToastText}>{specialToastMessage}</Text>
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
              Los primeros minutos son cruciales para crear una mejor experiencia con el resto del grupo.
            </Text>
            <Text style={styles.ritualSubtext}>
              Participa desde el inicio y deja que la energía fluya.
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
            <Text style={styles.welcomeTitle}>Bienvenidos a la Experiencia Nospi</Text>
            <Text style={styles.welcomeText}>
              Nospi no es una cena común.{'\n\n'}
              Esta dinámica está diseñada para romper el hielo, generar conexión real y evitar momentos incómodos.{'\n\n'}
              Todos deben participar para que funcione.{'\n\n'}
              Puedes pasar una pregunta, pero eso afectará tu puntaje.{'\n\n'}
              Entre más participes, mejor será la energía de la mesa.
            </Text>
            <TouchableOpacity
              style={styles.welcomeButton}
              onPress={handleContinueToPresentation}
              activeOpacity={0.8}
            >
              <Text style={styles.welcomeButtonText}>Comenzar experiencia</Text>
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
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
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
    color: nospiColors.purpleDark,
    textAlign: 'center',
    opacity: 0.7,
  },
  eventInfoCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
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
    marginBottom: 8,
  },
  eventInfoLocation: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginBottom: 4,
  },
  eventInfoAddress: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  eventInfoLocationPlaceholder: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 16,
  },
  infoBox: {
    backgroundColor: nospiColors.purpleLight,
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  infoBoxText: {
    fontSize: 14,
    color: nospiColors.purpleDark,
    textAlign: 'center',
    lineHeight: 20,
  },
  reminderCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  reminderIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  reminderText: {
    fontSize: 16,
    fontWeight: '600',
    color: nospiColors.purpleDark,
    textAlign: 'center',
    marginBottom: 8,
  },
  reminderSubtext: {
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
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  countdownLabel: {
    fontSize: 16,
    color: nospiColors.purpleDark,
    marginBottom: 12,
    fontWeight: '600',
  },
  countdownTime: {
    fontSize: 48,
    fontWeight: 'bold',
    color: nospiColors.purpleMid,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  eventCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
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
  eventLocationAddress: {
    fontSize: 13,
    color: '#888',
    marginTop: 4,
  },
  codeEntryCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
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
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
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
    lineHeight: 24,
    fontWeight: '600',
  },
  participantsListCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
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
    justifyContent: 'center',
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
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  startButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  waitingInfoCard: {
    backgroundColor: nospiColors.purpleLight,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
  },
  waitingInfoText: {
    fontSize: 16,
    color: nospiColors.purpleDark,
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '600',
  },
  phaseCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  phaseMessage: {
    fontSize: 16,
    color: nospiColors.purpleDark,
    textAlign: 'center',
    lineHeight: 24,
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
  participantsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 12,
  },
  emptyParticipants: {
    padding: 40,
    alignItems: 'center',
  },
  emptyParticipantsText: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  participantCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
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
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  presentedButton: {
    backgroundColor: nospiColors.purpleDark,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
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
    lineHeight: 20,
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
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
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
    marginBottom: 16,
    textAlign: 'center',
  },
  ritualSubtext: {
    fontSize: 16,
    color: '#333',
    lineHeight: 26,
    marginBottom: 32,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  ritualButton: {
    backgroundColor: nospiColors.purpleDark,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 48,
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
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
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
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
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
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
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
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
  specialToastContainer: {
    position: 'absolute',
    top: '40%',
    left: 20,
    right: 20,
    zIndex: 9999,
    alignItems: 'center',
  },
  specialToastContent: {
    backgroundColor: 'rgba(139, 92, 246, 0.98)',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    minWidth: 280,
  },
  specialToastIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  specialToastText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
});
