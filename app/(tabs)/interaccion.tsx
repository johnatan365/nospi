
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Alert, Platform, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { useSupabase } from '@/contexts/SupabaseContext';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useFocusEffect } from '@react-navigation/native';

interface Event {
  id: string;
  type: string;
  date: string;
  time: string;
  location: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  radius_meters: number | null;
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
  const [countdown, setCountdown] = useState<string>('');
  const [isEventDay, setIsEventDay] = useState(false);
  const [locationPermission, setLocationPermission] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isWithinRadius, setIsWithinRadius] = useState(false);
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [canStartExperience, setCanStartExperience] = useState(false);
  const [isLate, setIsLate] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [checkingLocation, setCheckingLocation] = useState(false);
  
  // New phase states
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [experienceStarted, setExperienceStarted] = useState(false);
  const [showPresentationPhase, setShowPresentationPhase] = useState(false);
  const [activeParticipants, setActiveParticipants] = useState<Participant[]>([]);
  const [userPresented, setUserPresented] = useState(false);
  const [allPresented, setAllPresented] = useState(false);

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

  useEffect(() => {
    if (appointment && isEventDay && locationPermission) {
      checkUserLocation();
    }
  }, [appointment, isEventDay, locationPermission]);

  useEffect(() => {
    const eventStarted = countdown === '¡Es hora!';
    const canStart = eventStarted && isWithinRadius && locationConfirmed && !isLate;
    setCanStartExperience(canStart);
  }, [countdown, isWithinRadius, locationConfirmed, isLate]);

  useEffect(() => {
    if (experienceStarted && appointment) {
      loadActiveParticipants();
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
            latitude,
            longitude,
            radius_meters,
            start_time,
            max_participants,
            current_participants,
            status
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'confirmada')
        .eq('payment_status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        console.error('Error loading appointment:', error);
        setAppointment(null);
      } else if (data) {
        console.log('Appointment loaded:', data);
        setAppointment(data as any);
        setLocationConfirmed(data.location_confirmed || false);
        setExperienceStarted(data.experience_started || false);
        setUserPresented(data.presented || false);
        
        if (data.event && data.event.start_time) {
          checkIfEventDay(data.event.start_time);
          scheduleNotifications(data.event.start_time);
        }
      } else {
        console.log('No confirmed appointment found');
        setAppointment(null);
      }
    } catch (error) {
      console.error('Failed to load appointment:', error);
      setAppointment(null);
    } finally {
      setLoading(false);
    }
  };

  const loadActiveParticipants = async () => {
    if (!appointment) return;

    try {
      console.log('Loading active participants for event:', appointment.event_id);
      
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          id,
          user_id,
          arrival_status,
          presented,
          users:user_id (
            name,
            profile_photo_url,
            occupation
          )
        `)
        .eq('event_id', appointment.event_id)
        .eq('status', 'confirmada')
        .eq('location_confirmed', true)
        .eq('arrival_status', 'on_time');

      if (error) {
        console.error('Error loading participants:', error);
        return;
      }

      const participants: Participant[] = (data || []).map((item: any) => ({
        id: item.id,
        user_id: item.user_id,
        name: item.users?.name || 'Usuario',
        profile_photo_url: item.users?.profile_photo_url || null,
        occupation: item.users?.occupation || 'No especificado',
        arrival_status: item.arrival_status,
        presented: item.presented || false,
      }));

      console.log('Active participants loaded:', participants.length);
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

    if (diff <= 0) {
      setCountdown('¡Es hora!');
      
      const minutesLate = Math.abs(diff) / (1000 * 60);
      if (minutesLate > 10 && !locationConfirmed) {
        setIsLate(true);
        updateArrivalStatus('late');
      }
      return;
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    const countdownText = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    setCountdown(countdownText);
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

  const requestLocationPermission = async () => {
    try {
      console.log('Requesting location permission');
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status === 'granted') {
        console.log('Location permission granted');
        setLocationPermission(true);
        setShowPermissionModal(false);
        checkUserLocation();
      } else {
        console.log('Location permission denied');
        Alert.alert(
          'Permiso requerido',
          'Necesitas activar la ubicación para participar en la experiencia Nospi.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Error requesting location permission:', error);
    }
  };

  const checkUserLocation = async () => {
    if (!appointment || !appointment.event.latitude || !appointment.event.longitude) {
      console.log('No event location data available');
      return;
    }

    setCheckingLocation(true);
    try {
      console.log('Getting user location');
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const userLat = location.coords.latitude;
      const userLon = location.coords.longitude;
      setUserLocation({ latitude: userLat, longitude: userLon });

      const distance = calculateDistance(
        userLat,
        userLon,
        appointment.event.latitude,
        appointment.event.longitude
      );

      const radiusMeters = appointment.event.radius_meters || 100;
      const withinRadius = distance <= radiusMeters;
      
      console.log(`User distance from event: ${distance.toFixed(2)}m (radius: ${radiusMeters}m)`);
      setIsWithinRadius(withinRadius);
    } catch (error) {
      console.error('Error getting user location:', error);
      Alert.alert(
        'Error de ubicación',
        'No se pudo obtener tu ubicación. Verifica que el GPS esté activado.',
        [{ text: 'OK' }]
      );
    } finally {
      setCheckingLocation(false);
    }
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  };

  const handleCheckIn = async () => {
    if (!appointment || !isWithinRadius) {
      return;
    }

    try {
      console.log('User checking in at location');
      
      const now = new Date();
      const eventStart = new Date(appointment.event.start_time!);
      const minutesAfterStart = (now.getTime() - eventStart.getTime()) / (1000 * 60);
      
      const arrivalStatus = minutesAfterStart > 10 ? 'late' : 'on_time';
      
      const { error } = await supabase
        .from('appointments')
        .update({
          location_confirmed: true,
          checked_in_at: now.toISOString(),
          arrival_status: arrivalStatus,
        })
        .eq('id', appointment.id);

      if (error) {
        console.error('Error updating check-in:', error);
        Alert.alert('Error', 'No se pudo confirmar tu presencia. Intenta de nuevo.');
        return;
      }

      console.log('Check-in successful, arrival status:', arrivalStatus);
      setLocationConfirmed(true);
      setIsLate(arrivalStatus === 'late');
      
      Alert.alert(
        '¡Confirmado!',
        arrivalStatus === 'on_time' 
          ? 'Has confirmado tu presencia a tiempo. ¡Disfruta la experiencia!'
          : 'Has confirmado tu presencia. Llegaste tarde, pero aún puedes participar en matches y evaluaciones.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Error during check-in:', error);
      Alert.alert('Error', 'Ocurrió un error al confirmar tu presencia.');
    }
  };

  const updateArrivalStatus = async (status: 'on_time' | 'late') => {
    if (!appointment) return;

    try {
      await supabase
        .from('appointments')
        .update({ arrival_status: status })
        .eq('id', appointment.id);
      
      console.log('Arrival status updated to:', status);
    } catch (error) {
      console.error('Error updating arrival status:', error);
    }
  };

  const handleStartExperience = () => {
    console.log('User starting experience - showing welcome modal');
    setShowWelcomeModal(true);
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
        Alert.alert('Error', 'No se pudo iniciar la experiencia. Intenta de nuevo.');
        return;
      }

      setShowWelcomeModal(false);
      setExperienceStarted(true);
      setShowPresentationPhase(true);
      
      console.log('Experience started, moving to presentation phase');
    } catch (error) {
      console.error('Error starting experience:', error);
      Alert.alert('Error', 'Ocurrió un error al iniciar la experiencia.');
    }
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
        Alert.alert('Error', 'No se pudo confirmar tu presentación. Intenta de nuevo.');
        return;
      }

      setUserPresented(true);
      loadActiveParticipants();
      
      Alert.alert(
        '¡Gracias!',
        'Has confirmado tu presentación. Esperando a que todos se presenten...',
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Error marking user as presented:', error);
      Alert.alert('Error', 'Ocurrió un error al confirmar tu presentación.');
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
    return (
      <LinearGradient
        colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
          <Text style={styles.title}>¡Listos para comenzar!</Text>
          <Text style={styles.subtitle}>Todos se han presentado</Text>

          <View style={styles.successCard}>
            <Text style={styles.successIcon}>🎉</Text>
            <Text style={styles.successTitle}>¡Excelente!</Text>
            <Text style={styles.successMessage}>
              Todos los participantes activos se han presentado. La dinámica del juego comenzará pronto.
            </Text>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoCardTitle}>Participantes Activos: {activeParticipants.length}</Text>
            <Text style={styles.infoCardText}>
              Solo los participantes activos pueden:
            </Text>
            <Text style={styles.infoCardBullet}>• Aparecer en ruleta</Text>
            <Text style={styles.infoCardBullet}>• Recibir preguntas</Text>
            <Text style={styles.infoCardBullet}>• Ser puntuados</Text>
            <Text style={styles.infoCardBullet}>• Competir por el premio</Text>
          </View>
        </ScrollView>
      </LinearGradient>
    );
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

        <View style={styles.countdownCard}>
          <Text style={styles.countdownLabel}>Tiempo para el inicio</Text>
          <Text style={styles.countdownTime}>{countdown}</Text>
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

        {!locationPermission ? (
          <TouchableOpacity
            style={styles.locationButton}
            onPress={() => setShowPermissionModal(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.locationButtonText}>📍 Activar Ubicación</Text>
            <Text style={styles.locationButtonSubtext}>Requerido para participar</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.locationStatusCard}>
            {checkingLocation ? (
              <ActivityIndicator size="small" color={nospiColors.purpleDark} />
            ) : isWithinRadius ? (
              <>
                <Text style={styles.locationStatusIcon}>✅</Text>
                <Text style={styles.locationStatusText}>Estás en el lugar del evento</Text>
              </>
            ) : (
              <>
                <Text style={styles.locationStatusIcon}>📍</Text>
                <Text style={styles.locationStatusText}>
                  Debes estar en el lugar del encuentro para iniciar la experiencia
                </Text>
                <TouchableOpacity
                  style={styles.refreshButton}
                  onPress={checkUserLocation}
                  activeOpacity={0.8}
                >
                  <Text style={styles.refreshButtonText}>Actualizar ubicación</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {locationPermission && isWithinRadius && !locationConfirmed && (
          <TouchableOpacity
            style={[styles.checkInButton, !isWithinRadius && styles.buttonDisabled]}
            onPress={handleCheckIn}
            disabled={!isWithinRadius}
            activeOpacity={0.8}
          >
            <Text style={styles.checkInButtonText}>✓ Estoy aquí</Text>
          </TouchableOpacity>
        )}

        {locationConfirmed && !experienceStarted && (
          <TouchableOpacity
            style={[styles.startButton, !canStartExperience && styles.buttonDisabled]}
            onPress={handleStartExperience}
            disabled={!canStartExperience}
            activeOpacity={0.8}
          >
            <Text style={styles.startButtonText}>
              {canStartExperience ? '🎉 Iniciar Experiencia' : '⏳ Esperando inicio...'}
            </Text>
          </TouchableOpacity>
        )}

        {isLate && (
          <View style={styles.lateInfoCard}>
            <Text style={styles.lateInfoText}>
              Has llegado después de la hora oficial. Aún puedes hacer match y evaluar, pero no participarás en la ruleta ni en puntos.
            </Text>
          </View>
        )}

        <View style={styles.instructionsCard}>
          <Text style={styles.instructionsTitle}>Instrucciones</Text>
          <Text style={styles.instructionsText}>
            1. Activa tu ubicación{'\n'}
            2. Llega al lugar del evento{'\n'}
            3. Confirma tu presencia con "Estoy aquí"{'\n'}
            4. Espera a que inicie la experiencia{'\n'}
            5. ¡Disfruta y conecta!
          </Text>
          <Text style={styles.instructionsWarning}>
            ⚠️ Debes confirmar tu presencia dentro de los primeros 10 minutos para participar completamente
          </Text>
        </View>
      </ScrollView>

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
              onPress={handleBeginExperience}
              activeOpacity={0.8}
            >
              <Text style={styles.welcomeButtonText}>Comenzar experiencia</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Permission Modal */}
      <Modal
        visible={showPermissionModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPermissionModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Ubicación Requerida</Text>
            <Text style={styles.modalText}>
              Para participar en la experiencia Nospi, necesitas activar tu ubicación. Esto nos permite verificar que estás en el lugar del evento.
            </Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={requestLocationPermission}
              activeOpacity={0.8}
            >
              <Text style={styles.modalButtonText}>Activar Ubicación</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={() => setShowPermissionModal(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.modalCancelButtonText}>Cancelar</Text>
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
  locationButton: {
    backgroundColor: nospiColors.purpleMid,
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
  locationButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  locationButtonSubtext: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.9,
  },
  locationStatusCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
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
  locationStatusIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  locationStatusText: {
    fontSize: 16,
    color: nospiColors.purpleDark,
    textAlign: 'center',
    marginBottom: 12,
  },
  refreshButton: {
    backgroundColor: nospiColors.purpleLight,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 8,
  },
  refreshButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: nospiColors.purpleDark,
  },
  checkInButton: {
    backgroundColor: '#10B981',
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
  checkInButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  startButton: {
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
  startButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  lateInfoCard: {
    backgroundColor: '#FEF3C7',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  lateInfoText: {
    fontSize: 14,
    color: '#92400E',
    textAlign: 'center',
    lineHeight: 20,
  },
  instructionsCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  instructionsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 12,
  },
  instructionsText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 24,
    marginBottom: 12,
  },
  instructionsWarning: {
    fontSize: 13,
    color: '#F59E0B',
    lineHeight: 20,
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
  successCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  successIcon: {
    fontSize: 80,
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 16,
  },
  successMessage: {
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
    lineHeight: 24,
  },
  infoCard: {
    backgroundColor: nospiColors.purpleLight,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  infoCardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 12,
  },
  infoCardText: {
    fontSize: 14,
    color: nospiColors.purpleDark,
    marginBottom: 8,
  },
  infoCardBullet: {
    fontSize: 14,
    color: nospiColors.purpleDark,
    marginLeft: 8,
    marginBottom: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 16,
    textAlign: 'center',
  },
  modalText: {
    fontSize: 16,
    color: '#333',
    lineHeight: 24,
    marginBottom: 24,
    textAlign: 'center',
  },
  modalButton: {
    backgroundColor: nospiColors.purpleMid,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  modalCancelButton: {
    backgroundColor: 'transparent',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  modalCancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: nospiColors.purpleDark,
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
