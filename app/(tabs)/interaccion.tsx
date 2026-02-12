
import React, { useEffect, useState, useCallback } from 'react';
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
  address: string | null;
  start_time: string | null;
  max_participants: number;
  current_participants: number;
  status: string;
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

interface Participant {
  id: string;
  user_id: string;
  name: string;
  profile_photo_url: string | null;
  occupation: string;
  arrival_status: string;
  presented: boolean;
}

type CheckInPhase = 'waiting' | 'code_entry' | 'confirmed';

const SECRET_CODE = '1986'; // Secret code known only by event host

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
  
  // New phase states
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [showRitualModal, setShowRitualModal] = useState(false);
  const [experienceStarted, setExperienceStarted] = useState(false);
  const [showPresentationPhase, setShowPresentationPhase] = useState(false);
  const [activeParticipants, setActiveParticipants] = useState<Participant[]>([]);
  const [userPresented, setUserPresented] = useState(false);
  const [allPresented, setAllPresented] = useState(false);
  const [ritualAnimation] = useState(new Animated.Value(0));

  useFocusEffect(
    useCallback(() => {
      console.log('Interacción screen focused - loading appointment');
      loadAppointment();
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

  // Real-time polling for active participants when on check-in screen
  useEffect(() => {
    if (appointment && checkInPhase === 'confirmed' && !experienceStarted) {
      console.log('Starting real-time participant polling');
      
      // Load immediately
      loadActiveParticipants();
      
      // Poll every 3 seconds to check for new confirmations
      const pollInterval = setInterval(() => {
        console.log('Polling for participant updates...');
        loadActiveParticipants();
      }, 3000);

      return () => {
        console.log('Stopping participant polling');
        clearInterval(pollInterval);
      };
    }
  }, [appointment, checkInPhase, experienceStarted]);

  useEffect(() => {
    if (experienceStarted && appointment) {
      loadActiveParticipants();
      
      // Continue polling during presentation phase
      const pollInterval = setInterval(() => {
        loadActiveParticipants();
      }, 5000);

      return () => clearInterval(pollInterval);
    }
  }, [experienceStarted, appointment]);

  const loadAppointment = async () => {
    if (!user) {
      console.log('No user logged in');
      setLoading(false);
      return;
    }

    try {
      console.log('Loading confirmed appointment for user:', user.id);
      
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
            address,
            start_time,
            max_participants,
            current_participants,
            status
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'confirmada')
        .eq('payment_status', 'completed')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading appointment:', error);
        return;
      }
      
      if (!data || data.length === 0) {
        console.log('No confirmed appointment found');
        setAppointment(null);
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
    } catch (error) {
      console.error('Failed to load appointment:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadActiveParticipants = async () => {
    if (!appointment) return;

    try {
      console.log('Loading active participants (confirmed only) for event:', appointment.event_id);
      
      // Fixed query: properly join with users table
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          id,
          user_id,
          arrival_status,
          presented,
          users!inner (
            id,
            name,
            profile_photo_url
          )
        `)
        .eq('event_id', appointment.event_id)
        .eq('status', 'confirmada')
        .eq('location_confirmed', true);

      if (error) {
        console.error('Error loading participants:', error);
        return;
      }

      console.log('Raw participants data:', JSON.stringify(data, null, 2));

      // Transform the data correctly
      const participants: Participant[] = (data || []).map((item: any) => {
        const userName = item.users?.name || 'Usuario';
        const userPhoto = item.users?.profile_photo_url || null;
        
        console.log('Processing participant:', {
          id: item.id,
          user_id: item.user_id,
          name: userName,
          photo: userPhoto
        });

        return {
          id: item.id,
          user_id: item.user_id,
          name: userName,
          profile_photo_url: userPhoto,
          occupation: 'Participante',
          arrival_status: item.arrival_status,
          presented: item.presented || false,
        };
      });

      console.log('Active participants loaded:', participants.length);
      console.log('Participants:', participants.map(p => ({ name: p.name, user_id: p.user_id })));
      setActiveParticipants(participants);
      
      const allHavePresented = participants.every(p => p.presented);
      setAllPresented(allHavePresented);
    } catch (error) {
      console.error('Failed to load participants:', error);
    }
  };

  const checkIfEventDay = (startTime: string) => {
    const now = new Date();
    const eventDate = new Date(startTime);
    
    const isSameDay = 
      now.getFullYear() === eventDate.getFullYear() &&
      now.getMonth() === eventDate.getMonth() &&
      now.getDate() === eventDate.getDate();
    
    const isAfter8AM = now.getHours() >= 8;
    
    const isToday = isSameDay && isAfter8AM;
    console.log('Is event day:', isToday);
    setIsEventDay(isToday);
  };

  const updateCountdown = (startTime: string) => {
    const now = new Date();
    const eventDate = new Date(startTime);
    const diff = eventDate.getTime() - now.getTime();

    setCountdown(diff);

    if (diff <= 0) {
      setCountdownDisplay('¡Es hora!');
      
      // Check if user should show code entry
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
          console.log('Scheduled notification: 6 hours before');
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
          console.log('Scheduled notification: 1 hour before');
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
          console.log('Scheduled notification: 10 minutes before');
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
          console.log('Scheduled notification: at start time');
        }
      }
    } catch (error) {
      console.error('Error scheduling notifications:', error);
    }
  };

  const handleCodeConfirmation = async () => {
    if (!appointment) return;

    const enteredCode = confirmationCode.trim();
    console.log('User entered code:', enteredCode, '| Expected code:', SECRET_CODE);

    if (enteredCode !== SECRET_CODE) {
      console.log('Incorrect code entered. Expected:', SECRET_CODE, 'Got:', enteredCode);
      setCodeError('Código incorrecto. Verifica el código del encuentro.');
      return;
    }

    console.log('Correct code entered (1986), processing check-in');
    setCodeError('');

    try {
      const confirmedAt = new Date();

      // Use 'on_time' instead of 'confirmed' to match database constraint
      const { error: updateError } = await supabase
        .from('appointments')
        .update({
          arrival_status: 'on_time',
          checked_in_at: confirmedAt.toISOString(),
          location_confirmed: true,
        })
        .eq('id', appointment.id);

      if (updateError) {
        console.error('Error updating arrival status:', updateError);
        setCodeError('No se pudo registrar tu llegada. Intenta de nuevo.');
        return;
      }

      console.log('Check-in successful with code 1986');
      
      setAppointment(prev => ({
        ...prev!,
        arrival_status: 'on_time',
        checked_in_at: confirmedAt.toISOString(),
        location_confirmed: true,
      }));
      
      setCheckInPhase('confirmed');
      setConfirmationCode('');

      // Reload participants to update count
      await loadActiveParticipants();
    } catch (error) {
      console.error('Error during check-in:', error);
      setCodeError('Ocurrió un error. Intenta de nuevo.');
    }
  };

  const handleStartExperience = () => {
    console.log('User starting experience - showing ritual modal');
    setShowRitualModal(true);
    
    // Start ritual animation
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
    if (!appointment) return;

    try {
      console.log('User marked as presented');
      
      const { error } = await supabase
        .from('appointments')
        .update({ presented: true })
        .eq('id', appointment.id);

      if (error) {
        console.error('Error updating presented status:', error);
        return;
      }

      setUserPresented(true);
      loadActiveParticipants();
    } catch (error) {
      console.error('Error marking user as presented:', error);
    }
  };

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
            <Text style={styles.eventInfoLocation}>{appointment.event.location}</Text>
            
            <View style={styles.infoBox}>
              <Text style={styles.infoBoxText}>
                La experiencia interactiva estará disponible el día del evento desde las 8:00 AM
              </Text>
            </View>
          </View>
        </ScrollView>
      </LinearGradient>
    );
  }

  if (showPresentationPhase && !allPresented) {
    const presentedCount = activeParticipants.filter(p => p.presented).length;
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
            {activeParticipants.map((participant, index) => (
              <View key={index} style={styles.participantCard}>
                <View style={styles.participantInfo}>
                  {participant.profile_photo_url ? (
                    <Image 
                      source={{ uri: participant.profile_photo_url }} 
                      style={styles.participantPhoto}
                    />
                  ) : (
                    <View style={styles.participantPhotoPlaceholder}>
                      <Text style={styles.participantPhotoPlaceholderText}>
                        {participant.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={styles.participantDetails}>
                    <Text style={styles.participantName}>{participant.name}</Text>
                    <Text style={styles.participantOccupation}>{participant.occupation}</Text>
                  </View>
                </View>
                {participant.presented && (
                  <View style={styles.presentedBadge}>
                    <Text style={styles.presentedBadgeText}>✓ Presentado</Text>
                  </View>
                )}
              </View>
            ))}
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

  if (allPresented) {
    return <GameDynamicsScreen appointment={appointment} activeParticipants={activeParticipants} />;
  }

  const eventTypeText = appointment.event.type === 'bar' ? 'Bar' : 'Restaurante';
  const eventIcon = appointment.event.type === 'bar' ? '🍸' : '🍽️';
  const locationText = appointment.event.address || appointment.event.location;

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

        {/* Emotional Reminder */}
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
              keyboardType="number-pad"
              maxLength={4}
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
              <Text style={styles.participantsListTitle}>Participantes confirmados</Text>
              <Text style={styles.participantsListCount}>{activeParticipants.length}</Text>
              
              {activeParticipants.length > 0 && (
                <View style={styles.participantsList}>
                  {activeParticipants.map((participant, index) => (
                    <View key={index} style={styles.participantListItem}>
                      {participant.profile_photo_url ? (
                        <Image 
                          source={{ uri: participant.profile_photo_url }} 
                          style={styles.participantListPhoto}
                        />
                      ) : (
                        <View style={styles.participantListPhotoPlaceholder}>
                          <Text style={styles.participantListPhotoText}>
                            {participant.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <Text style={styles.participantListName}>{participant.name}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {!canStartExperience && (
              <View style={styles.waitingInfoCard}>
                <Text style={styles.waitingInfoText}>
                  La experiencia comenzará cuando al menos 2 personas estén listas.
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

      {/* Ritual de Inicio Oficial Modal */}
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

      {/* Welcome Modal - Phase 1 */}
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
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
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
  participantsListTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    textAlign: 'center',
    marginBottom: 8,
  },
  participantsListCount: {
    fontSize: 48,
    fontWeight: 'bold',
    color: nospiColors.purpleMid,
    textAlign: 'center',
    marginBottom: 16,
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
});
