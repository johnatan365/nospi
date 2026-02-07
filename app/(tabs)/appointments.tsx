
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { useSupabase } from '@/contexts/SupabaseContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';

interface Appointment {
  id: string;
  status: string;
  payment_status: string;
  created_at: string;
  event: {
    id: string;
    type: string;
    date: string;
    time: string;
    location: string;
  };
}

type FilterType = 'todas' | 'confirmadas' | 'canceladas' | 'anteriores';

export default function AppointmentsScreen() {
  const { user } = useSupabase();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('todas');
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [notificationModalVisible, setNotificationModalVisible] = useState(false);
  const [notificationPreferences, setNotificationPreferences] = useState({
    whatsapp: false,
    email: true,
    sms: false,
    push: true,
  });

  // Check for first-time notification prompt when screen is focused
  useFocusEffect(
    useCallback(() => {
      if (user) {
        checkFirstTimeNotificationPrompt();
      }
    }, [user])
  );

  useEffect(() => {
    if (user) {
      loadAppointments();
    }
  }, [user, filter]);

  const checkFirstTimeNotificationPrompt = async () => {
    try {
      console.log('Checking if notification prompt should be shown');
      const hasSeenPrompt = await AsyncStorage.getItem('has_seen_notification_prompt');
      
      if (hasSeenPrompt) {
        console.log('User has already seen notification prompt');
        return;
      }

      // Check if user has any confirmed appointments
      const { data, error } = await supabase
        .from('appointments')
        .select('id')
        .eq('user_id', user?.id)
        .eq('status', 'confirmada')
        .limit(1);

      if (error) {
        console.error('Error checking appointments for notification prompt:', error);
        return;
      }

      if (data && data.length > 0) {
        console.log('User has confirmed appointments, showing notification preferences prompt for first time');
        
        // Load current preferences from profile
        const { data: userData } = await supabase
          .from('users')
          .select('notification_preferences')
          .eq('id', user?.id)
          .single();

        if (userData?.notification_preferences) {
          setNotificationPreferences(userData.notification_preferences);
        }

        // Show the modal
        setNotificationModalVisible(true);
        
        // Mark as seen
        await AsyncStorage.setItem('has_seen_notification_prompt', 'true');
        console.log('Marked notification prompt as seen');
      } else {
        console.log('User has no confirmed appointments yet');
      }
    } catch (error) {
      console.error('Error checking notification prompt:', error);
    }
  };

  const loadAppointments = async () => {
    try {
      console.log('Loading appointments with filter:', filter);
      let query = supabase
        .from('appointments')
        .select(`
          id,
          status,
          payment_status,
          created_at,
          event:events (
            id,
            type,
            date,
            time,
            location
          )
        `)
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (filter === 'confirmadas') {
        query = query.eq('status', 'confirmada');
      } else if (filter === 'canceladas') {
        query = query.eq('status', 'cancelada');
      } else if (filter === 'anteriores') {
        query = query.lt('event.date', new Date().toISOString());
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error loading appointments:', error);
        return;
      }

      console.log('Appointments loaded:', data?.length || 0);
      setAppointments(data || []);
    } catch (error) {
      console.error('Failed to load appointments:', error);
    } finally {
      setLoading(false);
    }
  };

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
    console.log('User wants to cancel appointment:', appointment.id);
    setSelectedAppointment(appointment);
    setCancelModalVisible(true);
  };

  const confirmCancel = async () => {
    if (!selectedAppointment) return;

    try {
      console.log('Cancelling appointment:', selectedAppointment.id);
      const { error } = await supabase
        .from('appointments')
        .update({ status: 'cancelada', updated_at: new Date().toISOString() })
        .eq('id', selectedAppointment.id)
        .eq('user_id', user?.id);

      if (error) {
        console.error('Error cancelling appointment:', error);
        return;
      }

      console.log('Appointment cancelled successfully');
      setCancelModalVisible(false);
      setSelectedAppointment(null);
      loadAppointments();
    } catch (error) {
      console.error('Failed to cancel appointment:', error);
    }
  };

  const toggleNotification = (type: 'whatsapp' | 'email' | 'sms' | 'push') => {
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
        console.error('Error saving preferences:', error);
        return;
      }

      console.log('Notification preferences saved successfully');
      setNotificationModalVisible(false);
    } catch (error) {
      console.error('Failed to save preferences:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmada':
        return '#4CAF50';
      case 'cancelada':
        return '#F44336';
      case 'anterior':
        return '#9E9E9E';
      default:
        return '#666';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'confirmada':
        return 'Confirmada';
      case 'cancelada':
        return 'Cancelada';
      case 'anterior':
        return 'Anterior';
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <LinearGradient
        colors={[nospiColors.purpleDark, nospiColors.purpleMid, nospiColors.purpleLight]}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={nospiColors.white} />
        </View>
      </LinearGradient>
    );
  }

  const filterActive = filter === 'todas';
  const filterConfirmed = filter === 'confirmadas';
  const filterCancelled = filter === 'canceladas';
  const filterPast = filter === 'anteriores';

  return (
    <LinearGradient
      colors={[nospiColors.purpleDark, nospiColors.purpleMid, nospiColors.purpleLight]}
      style={styles.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.title}>Mis Citas</Text>

        <View style={styles.filterContainer}>
          <TouchableOpacity
            style={[styles.filterButton, filterActive && styles.filterButtonActive]}
            onPress={() => setFilter('todas')}
            activeOpacity={0.8}
          >
            <Text style={[styles.filterButtonText, filterActive && styles.filterButtonTextActive]}>
              Todas
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterButton, filterConfirmed && styles.filterButtonActive]}
            onPress={() => setFilter('confirmadas')}
            activeOpacity={0.8}
          >
            <Text style={[styles.filterButtonText, filterConfirmed && styles.filterButtonTextActive]}>
              Confirmadas
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterButton, filterCancelled && styles.filterButtonActive]}
            onPress={() => setFilter('canceladas')}
            activeOpacity={0.8}
          >
            <Text style={[styles.filterButtonText, filterCancelled && styles.filterButtonTextActive]}>
              Canceladas
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterButton, filterPast && styles.filterButtonActive]}
            onPress={() => setFilter('anteriores')}
            activeOpacity={0.8}
          >
            <Text style={[styles.filterButtonText, filterPast && styles.filterButtonTextActive]}>
              Anteriores
            </Text>
          </TouchableOpacity>
        </View>

        {appointments.map((appointment) => {
          const eventTypeText = appointment.event.type === 'bar' ? 'Bar' : 'Restaurante';
          const eventIcon = appointment.event.type === 'bar' ? '🍸' : '🍽️';
          const dateText = formatDate(appointment.event.date);
          const statusColor = getStatusColor(appointment.status);
          const statusText = getStatusText(appointment.status);
          const canCancel = appointment.status === 'confirmada';

          return (
            <View key={appointment.id} style={styles.appointmentCard}>
              <View style={styles.appointmentHeader}>
                <Text style={styles.appointmentIcon}>{eventIcon}</Text>
                <View style={styles.appointmentHeaderText}>
                  <Text style={styles.appointmentType}>{eventTypeText}</Text>
                  <Text style={styles.appointmentTime}>{appointment.event.time}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
                  <Text style={styles.statusText}>{statusText}</Text>
                </View>
              </View>

              <Text style={styles.appointmentDate}>{dateText}</Text>
              <Text style={styles.appointmentLocation}>{appointment.event.location}</Text>

              {canCancel && (
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => handleCancelPress(appointment)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.cancelButtonText}>Cancelar Cita</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        {appointments.length === 0 && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No tienes citas en esta categoría</Text>
          </View>
        )}
      </ScrollView>

      {/* Cancel Appointment Modal */}
      <Modal
        visible={cancelModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCancelModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>¿Cancelar Cita?</Text>
            <Text style={styles.modalMessage}>
              ¿Estás seguro de que quieres cancelar esta cita?
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalButtonCancel}
                onPress={() => setCancelModalVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.modalButtonCancelText}>No</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalButtonConfirm}
                onPress={confirmCancel}
                activeOpacity={0.8}
              >
                <Text style={styles.modalButtonConfirmText}>Sí, Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* First-Time Notification Preferences Modal */}
      <Modal
        visible={notificationModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setNotificationModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.notificationModalContent}>
            <Text style={styles.notificationModalTitle}>Preferencias de Notificaciones</Text>
            <Text style={styles.notificationModalSubtitle}>
              ¿Cómo quieres que te recordemos tus citas?
            </Text>

            <TouchableOpacity
              style={styles.notificationOption}
              onPress={() => toggleNotification('whatsapp')}
              activeOpacity={0.8}
            >
              <Text style={styles.notificationOptionText}>WhatsApp</Text>
              <View style={[styles.checkbox, notificationPreferences.whatsapp && styles.checkboxActive]}>
                {notificationPreferences.whatsapp && <Text style={styles.checkmark}>✓</Text>}
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.notificationOption}
              onPress={() => toggleNotification('email')}
              activeOpacity={0.8}
            >
              <Text style={styles.notificationOptionText}>Correo Electrónico</Text>
              <View style={[styles.checkbox, notificationPreferences.email && styles.checkboxActive]}>
                {notificationPreferences.email && <Text style={styles.checkmark}>✓</Text>}
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.notificationOption}
              onPress={() => toggleNotification('sms')}
              activeOpacity={0.8}
            >
              <Text style={styles.notificationOptionText}>SMS</Text>
              <View style={[styles.checkbox, notificationPreferences.sms && styles.checkboxActive]}>
                {notificationPreferences.sms && <Text style={styles.checkmark}>✓</Text>}
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.notificationOption}
              onPress={() => toggleNotification('push')}
              activeOpacity={0.8}
            >
              <Text style={styles.notificationOptionText}>Notificaciones Push</Text>
              <View style={[styles.checkbox, notificationPreferences.push && styles.checkboxActive]}>
                {notificationPreferences.push && <Text style={styles.checkmark}>✓</Text>}
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.savePreferencesButton}
              onPress={saveNotificationPreferences}
              activeOpacity={0.8}
            >
              <Text style={styles.savePreferencesButtonText}>Guardar Preferencias</Text>
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
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: nospiColors.white,
    marginBottom: 24,
    marginTop: 48,
  },
  filterContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  filterButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  filterButtonActive: {
    backgroundColor: nospiColors.white,
  },
  filterButtonText: {
    color: nospiColors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  filterButtonTextActive: {
    color: nospiColors.purpleDark,
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
    marginRight: 16,
  },
  appointmentHeaderText: {
    flex: 1,
  },
  appointmentType: {
    fontSize: 20,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
  },
  appointmentTime: {
    fontSize: 16,
    color: nospiColors.purpleMid,
    fontWeight: '600',
    marginTop: 4,
  },
  statusBadge: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  statusText: {
    color: nospiColors.white,
    fontSize: 12,
    fontWeight: '600',
  },
  appointmentDate: {
    fontSize: 14,
    color: '#333',
    marginBottom: 8,
    fontWeight: '500',
  },
  appointmentLocation: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  cancelButton: {
    backgroundColor: '#F44336',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  cancelButtonText: {
    color: nospiColors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: nospiColors.white,
    textAlign: 'center',
    opacity: 0.8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: nospiColors.white,
    borderRadius: 20,
    padding: 24,
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
  modalMessage: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButtonCancel: {
    flex: 1,
    backgroundColor: '#E0E0E0',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonCancelText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtonConfirm: {
    flex: 1,
    backgroundColor: '#F44336',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonConfirmText: {
    color: nospiColors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  notificationModalContent: {
    backgroundColor: nospiColors.white,
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  notificationModalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 8,
    textAlign: 'center',
  },
  notificationModalSubtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 24,
  },
  notificationOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  notificationOptionText: {
    fontSize: 16,
    color: '#333',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#CCC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: {
    backgroundColor: nospiColors.purpleDark,
    borderColor: nospiColors.purpleDark,
  },
  checkmark: {
    color: nospiColors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  savePreferencesButton: {
    backgroundColor: nospiColors.purpleDark,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  savePreferencesButtonText: {
    color: nospiColors.white,
    fontSize: 16,
    fontWeight: '600',
  },
});
