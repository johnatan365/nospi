
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { useSupabase } from '@/contexts/SupabaseContext';
import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';

interface Appointment {
  id: string;
  status: string;
  payment_status: string;
  created_at: string;
  event: {
    id: string;
    name: string;
    city: string;
    type: string;
    date: string;
    time: string;
    location: string;
    location_name: string;
    location_address: string;
    maps_link: string;
    is_location_revealed: boolean;
    event_status: 'draft' | 'published' | 'closed';
  } | null;
}

type FilterType = 'confirmadas' | 'anteriores';

export default function AppointmentsScreen() {
  const { user } = useSupabase();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('confirmadas');
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [notificationPreferences, setNotificationPreferences] = useState({
    whatsapp: false,
    email: true,
    sms: false,
    push: true,
  });
  const [appointmentToCancel, setAppointmentToCancel] = useState<Appointment | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);

  const checkFirstTimeNotificationPrompt = useCallback(async () => {
    try {
      const hasSeenPrompt = await AsyncStorage.getItem('has_seen_notification_prompt');
      if (!hasSeenPrompt) {
        setShowNotificationModal(true);
        await AsyncStorage.setItem('has_seen_notification_prompt', 'true');
      }
    } catch (error) {
      console.error('Error checking notification prompt:', error);
    }
  }, []);

  const loadAppointments = useCallback(async () => {
    if (!user?.id) {
      console.log('No user ID, skipping appointment load');
      return;
    }

    try {
      setLoading(true);
      console.log('Loading appointments for user:', user.id, 'filter:', filter);

      const statusFilter = filter === 'confirmadas' ? 'confirmada' : 'anterior';

      const { data, error } = await supabase
        .from('appointments')
        .select(`
          id,
          status,
          payment_status,
          created_at,
          events!inner (
            id,
            name,
            city,
            type,
            date,
            time,
            location,
            location_name,
            location_address,
            maps_link,
            is_location_revealed,
            event_status
          )
        `)
        .eq('user_id', user.id)
        .eq('status', statusFilter)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading appointments:', error);
        return;
      }

      console.log('Appointments loaded:', data?.length || 0);
      console.log('Raw appointments data:', JSON.stringify(data, null, 2));
      
      // Transform the data to match our interface (events -> event)
      const transformedAppointments = (data || []).map(apt => ({
        ...apt,
        event: apt.events as any
      }));
      
      console.log('Transformed appointments:', transformedAppointments.length);
      setAppointments(transformedAppointments as Appointment[]);
    } catch (error) {
      console.error('Failed to load appointments:', error);
    } finally {
      setLoading(false);
    }
  }, [user, filter]);

  useFocusEffect(
    useCallback(() => {
      console.log('Appointments screen focused, loading appointments');
      loadAppointments();
    }, [loadAppointments])
  );

  useEffect(() => {
    if (user) {
      loadAppointments();
      checkFirstTimeNotificationPrompt();
    }
  }, [user, filter, loadAppointments, checkFirstTimeNotificationPrompt]);

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

  const handleCancelPress = (appointment: Appointment) => {
    console.log('User requested to cancel appointment:', appointment.id);
    setAppointmentToCancel(appointment);
    setShowCancelModal(true);
  };

  const confirmCancel = async () => {
    if (!appointmentToCancel) return;

    try {
      console.log('Cancelling appointment:', appointmentToCancel.id);
      const { error } = await supabase
        .from('appointments')
        .update({ status: 'cancelada' })
        .eq('id', appointmentToCancel.id);

      if (error) {
        console.error('Error cancelling appointment:', error);
        return;
      }

      console.log('Appointment cancelled successfully');
      setShowCancelModal(false);
      setAppointmentToCancel(null);
      loadAppointments();
    } catch (error) {
      console.error('Failed to cancel appointment:', error);
    }
  };

  const toggleNotification = (type: 'whatsapp' | 'email' | 'sms' | 'push') => {
    console.log('Toggling notification preference:', type);
    setNotificationPreferences(prev => ({
      ...prev,
      [type]: !prev[type],
    }));
  };

  const saveNotificationPreferences = async () => {
    try {
      console.log('Saving notification preferences:', notificationPreferences);
      const { error } = await supabase
        .from('users')
        .update({ notification_preferences: notificationPreferences })
        .eq('id', user?.id);

      if (error) {
        console.error('Error saving notification preferences:', error);
        return;
      }

      console.log('Notification preferences saved successfully');
      setShowNotificationModal(false);
    } catch (error) {
      console.error('Failed to save notification preferences:', error);
    }
  };

  const getStatusColor = (status: string) => {
    const statusColorMap: Record<string, string> = {
      confirmada: '#10B981',
      cancelada: '#EF4444',
      anterior: '#6B7280',
    };
    return statusColorMap[status] || '#6B7280';
  };

  const getStatusText = (status: string) => {
    const statusTextMap: Record<string, string> = {
      confirmada: 'Confirmada',
      cancelada: 'Cancelada',
      anterior: 'Anterior',
    };
    return statusTextMap[status] || status;
  };

  const handleOpenMaps = (mapsLink: string) => {
    console.log('Opening maps link:', mapsLink);
    Linking.openURL(mapsLink).catch(err => {
      console.error('Failed to open maps link:', err);
    });
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

  return (
    <LinearGradient
      colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
      style={styles.gradient}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <View style={styles.container}>
        <Text style={styles.title}>Mis Citas</Text>

        {/* Filter Tabs */}
        <View style={styles.filterContainer}>
          <TouchableOpacity
            style={[styles.filterButton, filter === 'confirmadas' && styles.filterButtonActive]}
            onPress={() => setFilter('confirmadas')}
          >
            <Text style={[styles.filterText, filter === 'confirmadas' && styles.filterTextActive]}>
              Confirmadas
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, filter === 'anteriores' && styles.filterButtonActive]}
            onPress={() => setFilter('anteriores')}
          >
            <Text style={[styles.filterText, filter === 'anteriores' && styles.filterTextActive]}>
              Anteriores
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
          {appointments.map((appointment) => {
            // ATOMIC JSX: Extract all logic and conditionals BEFORE the return
            // Defensive check: Skip if event is null or undefined
            if (!appointment.event) {
              console.warn('Appointment missing event data:', appointment.id);
              return null;
            }

            const eventType = appointment.event.type || 'restaurant';
            const eventTypeText = eventType === 'bar' ? 'Bar' : 'Restaurante';
            const eventIcon = eventType === 'bar' ? '🍸' : '🍽️';
            const eventName = appointment.event.name || eventTypeText;
            const eventCity = appointment.event.city || '';
            const eventDate = appointment.event.date || '';
            const eventTime = appointment.event.time || '';
            
            // Show location if revealed
            const locationRevealed = appointment.event.is_location_revealed || false;
            const eventLocation = locationRevealed && appointment.event.location_name 
              ? appointment.event.location_name 
              : 'Ubicación se revelará próximamente';
            
            const eventAddress = locationRevealed && appointment.event.location_address
              ? appointment.event.location_address
              : null;
            
            const mapsLink = locationRevealed && appointment.event.maps_link
              ? appointment.event.maps_link
              : null;
            
            const dateText = eventDate ? formatDate(eventDate) : 'Fecha no disponible';
            const statusColor = getStatusColor(appointment.status);
            const statusText = getStatusText(appointment.status);
            const isConfirmed = appointment.status === 'confirmada';

            return (
              <View key={appointment.id} style={styles.appointmentCard}>
                <View style={styles.appointmentHeader}>
                  <Text style={styles.appointmentIcon}>{eventIcon}</Text>
                  <View style={styles.appointmentHeaderText}>
                    <Text style={styles.appointmentName}>{eventName}</Text>
                    <Text style={styles.appointmentCity}>{eventCity}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
                    <Text style={styles.statusText}>{statusText}</Text>
                  </View>
                </View>

                <Text style={styles.appointmentDate}>{dateText}</Text>
                <Text style={styles.appointmentTime}>{eventTime}</Text>
                <Text style={styles.appointmentLocation}>{eventLocation}</Text>
                
                {eventAddress && (
                  <Text style={styles.appointmentAddress}>{eventAddress}</Text>
                )}

                {mapsLink && (
                  <TouchableOpacity
                    style={styles.mapsButton}
                    onPress={() => handleOpenMaps(mapsLink)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.mapsButtonText}>🗺️ Abrir en Maps</Text>
                  </TouchableOpacity>
                )}

                {isConfirmed && (
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => handleCancelPress(appointment)}
                  >
                    <Text style={styles.cancelButtonText}>Cancelar Cita</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}

          {appointments.length === 0 && (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {filter === 'confirmadas' 
                  ? 'No tienes citas confirmadas' 
                  : 'No tienes citas anteriores'}
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Notification Preferences Modal */}
        <Modal
          visible={showNotificationModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowNotificationModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Preferencias de Notificación</Text>
              <Text style={styles.modalSubtitle}>
                ¿Cómo te gustaría recibir recordatorios de tus citas?
              </Text>

              <View style={styles.notificationOptions}>
                <TouchableOpacity
                  style={styles.notificationOption}
                  onPress={() => toggleNotification('whatsapp')}
                >
                  <Text style={styles.notificationOptionText}>📱 WhatsApp</Text>
                  <View style={[styles.checkbox, notificationPreferences.whatsapp && styles.checkboxActive]}>
                    {notificationPreferences.whatsapp && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.notificationOption}
                  onPress={() => toggleNotification('email')}
                >
                  <Text style={styles.notificationOptionText}>📧 Email</Text>
                  <View style={[styles.checkbox, notificationPreferences.email && styles.checkboxActive]}>
                    {notificationPreferences.email && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.notificationOption}
                  onPress={() => toggleNotification('sms')}
                >
                  <Text style={styles.notificationOptionText}>💬 SMS</Text>
                  <View style={[styles.checkbox, notificationPreferences.sms && styles.checkboxActive]}>
                    {notificationPreferences.sms && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.notificationOption}
                  onPress={() => toggleNotification('push')}
                >
                  <Text style={styles.notificationOptionText}>🔔 Notificaciones Push</Text>
                  <View style={[styles.checkbox, notificationPreferences.push && styles.checkboxActive]}>
                    {notificationPreferences.push && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.saveButton}
                onPress={saveNotificationPreferences}
              >
                <Text style={styles.saveButtonText}>Guardar Preferencias</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Cancel Confirmation Modal */}
        <Modal
          visible={showCancelModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowCancelModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>¿Cancelar Cita?</Text>
              <Text style={styles.modalSubtitle}>
                ¿Estás seguro de que quieres cancelar esta cita?
              </Text>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonSecondary]}
                  onPress={() => setShowCancelModal(false)}
                >
                  <Text style={styles.modalButtonTextSecondary}>No, mantener</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonPrimary]}
                  onPress={confirmCancel}
                >
                  <Text style={styles.modalButtonTextPrimary}>Sí, cancelar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingTop: 48,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 24,
    paddingHorizontal: 24,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    marginBottom: 24,
    gap: 12,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    alignItems: 'center',
  },
  filterButtonActive: {
    backgroundColor: nospiColors.purpleDark,
  },
  filterText: {
    fontSize: 16,
    fontWeight: '600',
    color: nospiColors.purpleDark,
  },
  filterTextActive: {
    color: 'white',
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 24,
    paddingBottom: 100,
  },
  appointmentCard: {
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
  appointmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  appointmentIcon: {
    fontSize: 40,
    marginRight: 12,
  },
  appointmentHeaderText: {
    flex: 1,
  },
  appointmentName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
  },
  appointmentCity: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  appointmentDate: {
    fontSize: 16,
    color: '#333',
    marginBottom: 4,
    fontWeight: '500',
  },
  appointmentTime: {
    fontSize: 16,
    color: '#333',
    marginBottom: 8,
    fontWeight: '500',
  },
  appointmentLocation: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  appointmentAddress: {
    fontSize: 13,
    color: '#888',
    marginBottom: 12,
  },
  mapsButton: {
    backgroundColor: '#4285F4',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  mapsButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  cancelButton: {
    backgroundColor: '#EF4444',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  cancelButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: nospiColors.purpleDark,
    textAlign: 'center',
    opacity: 0.7,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 32,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 12,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
    textAlign: 'center',
  },
  notificationOptions: {
    marginBottom: 24,
  },
  notificationOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  notificationOptionText: {
    fontSize: 16,
    color: '#333',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: {
    backgroundColor: nospiColors.purpleDark,
    borderColor: nospiColors.purpleDark,
  },
  checkmark: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  saveButton: {
    backgroundColor: nospiColors.purpleDark,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonSecondary: {
    backgroundColor: '#F3F4F6',
  },
  modalButtonPrimary: {
    backgroundColor: '#EF4444',
  },
  modalButtonTextSecondary: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalButtonTextPrimary: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
