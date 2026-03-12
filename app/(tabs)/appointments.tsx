
import { supabase } from '@/lib/supabase';
import { useSupabase } from '@/contexts/SupabaseContext';
import React, { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { nospiColors, PRECIO_EVENTO_COP } from '@/constants/Colors';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';

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
    start_time: string | null;
  } | null;
}

type FilterType = 'all' | 'upcoming' | 'past';

export default function AppointmentsScreen() {
  const { user } = useSupabase();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [notificationPreferences, setNotificationPreferences] = useState({
    whatsapp: false,
    email: false,
    sms: false,
    push: false,
  });

  const loadAppointments = useCallback(async () => {
    if (!user) {
      console.log('No user, skipping appointments load');
      return;
    }

    console.log('Loading appointments for user:', user.id, 'Filter:', filter);
    setLoading(true);
    try {
      let query = supabase
        .from('appointments')
        .select(`
          id,
          status,
          payment_status,
          created_at,
          events:event_id (
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
            event_status,
            start_time
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (filter === 'upcoming') {
        const today = new Date().toISOString().split('T')[0];
        query = query.gte('events.date', today);
      } else if (filter === 'past') {
        const today = new Date().toISOString().split('T')[0];
        query = query.lt('events.date', today);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error loading appointments:', error);
        return;
      }

      console.log('Appointments loaded:', data?.length || 0);
      setAppointments(data || []);
    } catch (err) {
      console.error('Exception loading appointments:', err);
    } finally {
      setLoading(false);
    }
  }, [user, filter]);

  const checkFirstTimeNotificationPrompt = useCallback(async () => {
    if (!user) return;

    console.log('Checking first-time notification prompt');
    try {
      const hasSeen = await AsyncStorage.getItem('has_seen_notification_prompt');
      const hasConfirmedFirstEvent = await AsyncStorage.getItem('has_confirmed_first_event');

      if (!hasSeen && hasConfirmedFirstEvent && appointments.length > 0) {
        console.log('Showing notification preferences modal (first time)');
        setShowNotificationModal(true);
        await AsyncStorage.setItem('has_seen_notification_prompt', 'true');
      }
    } catch (err) {
      console.error('Error checking notification prompt:', err);
    }
  }, [user, appointments.length]);

  useEffect(() => {
    loadAppointments();
  }, [user, filter, loadAppointments, checkFirstTimeNotificationPrompt]);

  useFocusEffect(
    useCallback(() => {
      console.log('AppointmentsScreen focused, reloading appointments');
      loadAppointments();
      checkFirstTimeNotificationPrompt();
    }, [loadAppointments, checkFirstTimeNotificationPrompt])
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const handleCancelPress = (appointment: Appointment) => {
    console.log('User pressed cancel for appointment:', appointment.id);
    setSelectedAppointment(appointment);
    setShowCancelModal(true);
  };

  const confirmCancel = async () => {
    if (!selectedAppointment) return;

    console.log('User confirmed cancellation for appointment:', selectedAppointment.id);
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ status: 'cancelled' })
        .eq('id', selectedAppointment.id);

      if (error) {
        console.error('Error cancelling appointment:', error);
        return;
      }

      console.log('Appointment cancelled successfully');
      setShowCancelModal(false);
      setSelectedAppointment(null);
      loadAppointments();
    } catch (err) {
      console.error('Exception cancelling appointment:', err);
    }
  };

  const toggleNotification = (type: 'whatsapp' | 'email' | 'sms' | 'push') => {
    console.log('User toggled notification preference:', type);
    setNotificationPreferences((prev) => ({
      ...prev,
      [type]: !prev[type],
    }));
  };

  const saveNotificationPreferences = async () => {
    if (!user) return;

    console.log('Saving notification preferences:', notificationPreferences);
    try {
      const { error } = await supabase
        .from('users')
        .update({ notification_preferences: notificationPreferences })
        .eq('id', user.id);

      if (error) {
        console.error('Error saving notification preferences:', error);
        return;
      }

      console.log('Notification preferences saved successfully');
      setShowNotificationModal(false);
    } catch (err) {
      console.error('Exception saving notification preferences:', err);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return '#4CAF50';
      case 'pending':
        return '#FF9800';
      case 'cancelled':
        return '#F44336';
      default:
        return '#9E9E9E';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'Confirmada';
      case 'pending':
        return 'Pendiente';
      case 'cancelled':
        return 'Cancelada';
      default:
        return status;
    }
  };

  const handleOpenMaps = (mapsLink: string) => {
    console.log('User opening maps link:', mapsLink);
    Linking.openURL(mapsLink);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={nospiColors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[nospiColors.primary, nospiColors.secondary]}
        style={styles.header}
      >
        <Text style={styles.headerTitle}>Mis Citas</Text>
      </LinearGradient>

      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'all' && styles.filterButtonActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
            Todas
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'upcoming' && styles.filterButtonActive]}
          onPress={() => setFilter('upcoming')}
        >
          <Text style={[styles.filterText, filter === 'upcoming' && styles.filterTextActive]}>
            Próximas
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'past' && styles.filterButtonActive]}
          onPress={() => setFilter('past')}
        >
          <Text style={[styles.filterText, filter === 'past' && styles.filterTextActive]}>
            Pasadas
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {appointments.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No tienes citas {filter === 'all' ? '' : filter === 'upcoming' ? 'próximas' : 'pasadas'}</Text>
          </View>
        ) : (
          appointments.map((appointment) => (
            <View key={appointment.id} style={styles.appointmentCard}>
              {appointment.event && (
                <>
                  <View style={styles.appointmentHeader}>
                    <Text style={styles.eventName}>{appointment.event.name}</Text>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: getStatusColor(appointment.status) },
                      ]}
                    >
                      <Text style={styles.statusText}>{getStatusText(appointment.status)}</Text>
                    </View>
                  </View>

                  <Text style={styles.eventType}>{appointment.event.type}</Text>
                  <Text style={styles.eventDate}>{formatDate(appointment.event.date)}</Text>
                  <Text style={styles.eventTime}>{appointment.event.time}</Text>

                  {appointment.event.is_location_revealed && (
                    <View style={styles.locationContainer}>
                      <Text style={styles.locationName}>{appointment.event.location_name}</Text>
                      <Text style={styles.locationAddress}>
                        {appointment.event.location_address}
                      </Text>
                      <TouchableOpacity
                        style={styles.mapsButton}
                        onPress={() => handleOpenMaps(appointment.event!.maps_link)}
                      >
                        <Text style={styles.mapsButtonText}>Ver en Mapa</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {appointment.status === 'confirmed' && (
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={() => handleCancelPress(appointment)}
                    >
                      <Text style={styles.cancelButtonText}>Cancelar Cita</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          ))
        )}
      </ScrollView>

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
            <Text style={styles.modalText}>
              ¿Estás seguro de que deseas cancelar esta cita? Esta acción no se puede deshacer.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setShowCancelModal(false)}
              >
                <Text style={styles.modalButtonTextCancel}>No</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={confirmCancel}
              >
                <Text style={styles.modalButtonTextConfirm}>Sí, Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Notification Preferences Modal */}
      <Modal
        visible={showNotificationModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNotificationModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Preferencias de Notificaciones</Text>
            <Text style={styles.modalText}>
              Elige cómo quieres recibir notificaciones sobre tus citas:
            </Text>

            <View style={styles.notificationOptions}>
              <TouchableOpacity
                style={styles.notificationOption}
                onPress={() => toggleNotification('whatsapp')}
              >
                <View
                  style={[
                    styles.checkbox,
                    notificationPreferences.whatsapp && styles.checkboxChecked,
                  ]}
                >
                  {notificationPreferences.whatsapp && (
                    <Text style={styles.checkmark}>✓</Text>
                  )}
                </View>
                <Text style={styles.notificationLabel}>WhatsApp</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.notificationOption}
                onPress={() => toggleNotification('email')}
              >
                <View
                  style={[
                    styles.checkbox,
                    notificationPreferences.email && styles.checkboxChecked,
                  ]}
                >
                  {notificationPreferences.email && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.notificationLabel}>Email</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.notificationOption}
                onPress={() => toggleNotification('sms')}
              >
                <View
                  style={[
                    styles.checkbox,
                    notificationPreferences.sms && styles.checkboxChecked,
                  ]}
                >
                  {notificationPreferences.sms && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.notificationLabel}>SMS</Text>
              </TouchableOpacity>

              {/* 🚨 MODIFIED: Only show push notifications option in development builds */}
              {!(__DEV__ && Platform.OS === 'android') && (
                <TouchableOpacity
                  style={styles.notificationOption}
                  onPress={() => toggleNotification('push')}
                >
                  <View
                    style={[
                      styles.checkbox,
                      notificationPreferences.push && styles.checkboxChecked,
                    ]}
                  >
                    {notificationPreferences.push && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.notificationLabel}>Notificaciones Push</Text>
                </TouchableOpacity>
              )}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    padding: 24,
    paddingTop: 60,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  filterContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  filterButtonActive: {
    backgroundColor: nospiColors.primary,
  },
  filterText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  filterTextActive: {
    color: '#fff',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
  appointmentCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  appointmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  eventName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: 'bold',
  },
  eventType: {
    fontSize: 16,
    color: nospiColors.primary,
    marginBottom: 4,
  },
  eventDate: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  eventTime: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  locationContainer: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  locationName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  locationAddress: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  mapsButton: {
    backgroundColor: nospiColors.primary,
    borderRadius: 6,
    padding: 8,
    alignItems: 'center',
  },
  mapsButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  cancelButton: {
    backgroundColor: '#F44336',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: '#f0f0f0',
  },
  modalButtonConfirm: {
    backgroundColor: '#F44336',
  },
  modalButtonTextCancel: {
    color: '#333',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalButtonTextConfirm: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  notificationOptions: {
    marginBottom: 24,
  },
  notificationOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#ccc',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: nospiColors.primary,
    borderColor: nospiColors.primary,
  },
  checkmark: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  notificationLabel: {
    fontSize: 16,
    color: '#333',
  },
  saveButton: {
    backgroundColor: nospiColors.primary,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
