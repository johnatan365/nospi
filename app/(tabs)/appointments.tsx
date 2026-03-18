
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors, PRECIO_EVENTO_COP } from '@/constants/Colors';
import { useSupabase } from '@/contexts/SupabaseContext';
import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';

const HEADING = '#1a0010';
const BODY = '#333333';
const MUTED = '#555555';
const ACCENT = '#880E4F';

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

type FilterType = 'confirmadas' | 'anteriores' | 'canceladas';

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
  const [showPaymentSuccessModal, setShowPaymentSuccessModal] = useState(false);

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
    if (!user?.id) return;

    try {
      setLoading(true);
      let statusFilter = 'confirmada';
      if (filter === 'anteriores') statusFilter = 'anterior';
      else if (filter === 'canceladas') statusFilter = 'cancelada';

      const { data, error } = await supabase
        .from('appointments')
        .select(`
          id, status, payment_status, created_at,
          events!inner (
            id, name, city, type, date, time, location,
            location_name, location_address, maps_link,
            is_location_revealed, event_status, start_time
          )
        `)
        .eq('user_id', user.id)
        .eq('status', statusFilter)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading appointments:', error);
        return;
      }

      const transformedAppointments = (data || []).map(apt => ({
        ...apt,
        event: apt.events as any,
      }));
      setAppointments(transformedAppointments as Appointment[]);
    } catch (error) {
      console.error('Failed to load appointments:', error);
    } finally {
      setLoading(false);
    }
  }, [user, filter]);

  useFocusEffect(
    useCallback(() => {
      loadAppointments();
      AsyncStorage.getItem('pse_payment_pending').then(async (pending) => {
        if (pending === 'true') {
          await AsyncStorage.removeItem('pse_payment_pending');
          const pendingEventId = await AsyncStorage.getItem('pending_event_confirmation');
          if (pendingEventId && user?.id) {
            setTimeout(async () => {
              const { data: existing } = await supabase
                .from('appointments')
                .select('id')
                .eq('user_id', user.id)
                .eq('event_id', pendingEventId)
                .maybeSingle();
              if (existing) {
                await AsyncStorage.removeItem('pending_event_confirmation');
                setShowPaymentSuccessModal(true);
                loadAppointments();
              }
            }, 2000);
          }
        }
      });
    }, [loadAppointments, user?.id])
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
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    };
    return date.toLocaleDateString('es-ES', options);
  };

  const handleCancelPress = (appointment: Appointment) => {
    console.log('User pressed cancel appointment:', appointment.id);
    setAppointmentToCancel(appointment);
    setShowCancelModal(true);
  };

  const confirmCancel = async () => {
    if (!appointmentToCancel || !appointmentToCancel.event) return;
    console.log('User confirmed appointment cancellation:', appointmentToCancel.id);

    try {
      const eventStartTime = appointmentToCancel.event.start_time
        ? new Date(appointmentToCancel.event.start_time)
        : new Date(appointmentToCancel.event.date);
      const now = new Date();
      const timeDifferenceMs = eventStartTime.getTime() - now.getTime();
      const twentyFourHoursMs = 24 * 60 * 60 * 1000;
      const isWithinRefundWindow = timeDifferenceMs > twentyFourHoursMs;

      const { error: appointmentError } = await supabase
        .from('appointments')
        .update({
          status: 'cancelada',
          payment_status: isWithinRefundWindow ? 'refunded' : 'completed',
        })
        .eq('id', appointmentToCancel.id);

      if (appointmentError) {
        console.error('Error cancelling appointment:', appointmentError);
        return;
      }

      if (isWithinRefundWindow) {
        const refundAmount = PRECIO_EVENTO_COP;
        const { error: balanceError } = await supabase.rpc('increment_virtual_balance', {
          user_id_param: user?.id,
          amount_param: refundAmount,
        });
        if (balanceError) {
          console.error('Error updating virtual balance:', balanceError);
          const { data: userData } = await supabase
            .from('users').select('virtual_balance').eq('id', user?.id).single();
          const currentBalance = userData?.virtual_balance || 0;
          await supabase.from('users')
            .update({ virtual_balance: currentBalance + refundAmount })
            .eq('id', user?.id);
        }
      }

      setShowCancelModal(false);
      setAppointmentToCancel(null);
      loadAppointments();
    } catch (error) {
      console.error('Failed to cancel appointment:', error);
    }
  };

  const toggleNotification = (type: 'whatsapp' | 'email' | 'sms' | 'push') => {
    console.log('User toggled notification preference:', type);
    setNotificationPreferences(prev => ({ ...prev, [type]: !prev[type] }));
  };

  const saveNotificationPreferences = async () => {
    console.log('User saving notification preferences');
    try {
      const { error } = await supabase
        .from('users')
        .update({ notification_preferences: notificationPreferences })
        .eq('id', user?.id);
      if (error) { console.error('Error saving notification preferences:', error); return; }
      setShowNotificationModal(false);
    } catch (error) {
      console.error('Failed to save notification preferences:', error);
    }
  };

  const getStatusColor = (status: string) => {
    const map: Record<string, string> = {
      confirmada: '#10B981', cancelada: '#EF4444', anterior: '#6B7280',
    };
    return map[status] || '#6B7280';
  };

  const getStatusText = (status: string) => {
    const map: Record<string, string> = {
      confirmada: 'Confirmada', cancelada: 'Cancelada', anterior: 'Anterior',
    };
    return map[status] || status;
  };

  const handleOpenMaps = (mapsLink: string) => {
    console.log('User opening maps link');
    Linking.openURL(mapsLink).catch(err => console.error('Failed to open maps link:', err));
  };

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={ACCENT} />
      </View>
    );
  }

  const emptyText = filter === 'confirmadas'
    ? 'No tienes citas confirmadas'
    : filter === 'canceladas'
    ? 'No tienes citas canceladas'
    : 'No tienes citas anteriores';

  return (
    <View style={styles.screen}>
      <View style={styles.container}>
        <Text style={styles.title}>Mis Citas</Text>

        <View style={styles.filterContainer}>
          <TouchableOpacity
            style={[styles.filterButton, filter === 'confirmadas' && styles.filterButtonActive]}
            onPress={() => { console.log('Filter: confirmadas'); setFilter('confirmadas'); }}
          >
            <Text style={[styles.filterText, filter === 'confirmadas' && styles.filterTextActive]}
              numberOfLines={1} adjustsFontSizeToFit>
              Confirmadas
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, filter === 'canceladas' && styles.filterButtonActive]}
            onPress={() => { console.log('Filter: canceladas'); setFilter('canceladas'); }}
          >
            <Text style={[styles.filterText, filter === 'canceladas' && styles.filterTextActive]}
              numberOfLines={1} adjustsFontSizeToFit>
              Canceladas
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, filter === 'anteriores' && styles.filterButtonActive]}
            onPress={() => { console.log('Filter: anteriores'); setFilter('anteriores'); }}
          >
            <Text style={[styles.filterText, filter === 'anteriores' && styles.filterTextActive]}
              numberOfLines={1} adjustsFontSizeToFit>
              Anteriores
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
          {appointments.map((appointment) => {
            if (!appointment.event) return null;

            const eventType = appointment.event.type || 'restaurant';
            const eventTypeText = eventType === 'bar' ? 'Bar' : 'Restaurante';
            const eventIcon = eventType === 'bar' ? '🍸' : '🍽️';
            const eventName = appointment.event.name || eventTypeText;
            const eventCity = appointment.event.city || '';
            const eventDate = appointment.event.date || '';
            const eventTime = appointment.event.time || '';
            const locationRevealed = appointment.event.is_location_revealed || false;
            const isAnteriorOrCancelada = appointment.status === 'anterior' || appointment.status === 'cancelada';
            const shouldShowLocationPlaceholder = !locationRevealed && !isAnteriorOrCancelada;
            const eventLocation = locationRevealed && appointment.event.location_name ? appointment.event.location_name : '';
            const eventAddress = locationRevealed && appointment.event.location_address ? appointment.event.location_address : null;
            const mapsLink = locationRevealed && appointment.event.maps_link ? appointment.event.maps_link : null;
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

                {shouldShowLocationPlaceholder && (
                  <Text style={styles.appointmentLocation}>Ubicación se revelará 48 horas antes del evento</Text>
                )}

                {locationRevealed && (
                  <>
                    <Text style={styles.appointmentLocation}>{eventLocation}</Text>
                    {eventAddress ? <Text style={styles.appointmentAddress}>{eventAddress}</Text> : null}
                    {mapsLink ? (
                      <TouchableOpacity
                        style={styles.mapsButton}
                        onPress={() => handleOpenMaps(mapsLink)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.mapsButtonText}>🗺️ Abrir en Maps</Text>
                      </TouchableOpacity>
                    ) : null}
                  </>
                )}

                {isConfirmed && (
                  <>
                    <View style={styles.refundInfoCard}>
                      <Text style={styles.refundInfoText}>
                        💰 Si cancela este evento 24 horas antes se le reembolsará el saldo que podrá utilizar para la asistencia a otro evento.
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={() => handleCancelPress(appointment)}
                    >
                      <Text style={styles.cancelButtonText}>Cancelar Cita</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            );
          })}

          {appointments.length === 0 && (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>{emptyText}</Text>
            </View>
          )}
        </ScrollView>

        {/* Notification Preferences Modal */}
        <Modal visible={showNotificationModal} transparent animationType="slide" onRequestClose={() => setShowNotificationModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Preferencias de Notificación</Text>
              <Text style={styles.modalSubtitle}>¿Cómo te gustaría recibir recordatorios de tus citas?</Text>
              <View style={styles.notificationOptions}>
                {(['whatsapp', 'email', 'sms', 'push'] as const).map((type) => {
                  const labels: Record<string, string> = { whatsapp: '📱 WhatsApp', email: '📧 Email', sms: '💬 SMS', push: '🔔 Notificaciones Push' };
                  return (
                    <TouchableOpacity key={type} style={styles.notificationOption} onPress={() => toggleNotification(type)}>
                      <Text style={styles.notificationOptionText}>{labels[type]}</Text>
                      <View style={[styles.checkbox, notificationPreferences[type] && styles.checkboxActive]}>
                        {notificationPreferences[type] ? <Text style={styles.checkmark}>✓</Text> : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={styles.saveButtonWrapper}>
                <LinearGradient colors={['#1a0010', '#880E4F', '#AD1457']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveButtonGradient}>
                  <TouchableOpacity style={styles.saveButtonInner} onPress={saveNotificationPreferences}>
                    <Text style={styles.saveButtonText}>Guardar Preferencias</Text>
                  </TouchableOpacity>
                </LinearGradient>
              </View>
            </View>
          </View>
        </Modal>

        {/* Cancel Confirmation Modal */}
        <Modal visible={showCancelModal} transparent animationType="fade" onRequestClose={() => setShowCancelModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>¿Cancelar Cita?</Text>
              {appointmentToCancel && appointmentToCancel.event && (() => {
                const eventStartTime = appointmentToCancel.event!.start_time
                  ? new Date(appointmentToCancel.event!.start_time)
                  : new Date(appointmentToCancel.event!.date);
                const now = new Date();
                const isWithinRefundWindow = (eventStartTime.getTime() - now.getTime()) > 24 * 60 * 60 * 1000;
                const refundMessage = isWithinRefundWindow
                  ? `✅ Como cancelas con más de 24 horas de anticipación, recibirás $${PRECIO_EVENTO_COP.toLocaleString('es-CO')} pesos como saldo virtual.`
                  : '⚠️ La cancelación es con menos de 24 horas de anticipación, por lo que no se realizará reembolso.';
                return <Text style={styles.modalSubtitle}>{refundMessage}</Text>;
              })()}
              <View style={styles.modalButtons}>
                <TouchableOpacity style={[styles.modalButton, styles.modalButtonSecondary]} onPress={() => setShowCancelModal(false)}>
                  <Text style={styles.modalButtonTextSecondary}>No, mantener</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalButton, styles.modalButtonDanger]} onPress={confirmCancel}>
                  <Text style={styles.modalButtonTextPrimary}>Sí, cancelar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Payment Success Modal */}
        <Modal visible={showPaymentSuccessModal} transparent animationType="fade">
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <View style={{ backgroundColor: 'white', borderRadius: 24, padding: 32, alignItems: 'center', width: '100%', maxWidth: 340 }}>
              <Text style={{ fontSize: 64, marginBottom: 16 }}>🎉</Text>
              <Text style={{ fontSize: 22, fontWeight: '800', color: HEADING, marginBottom: 8, textAlign: 'center' }}>
                ¡Pago exitoso!
              </Text>
              <Text style={{ fontSize: 15, color: MUTED, textAlign: 'center', marginBottom: 24, lineHeight: 22 }}>
                Tu asistencia al evento ha sido confirmada. ¡Nos vemos pronto!
              </Text>
              <View style={{ borderRadius: 14, overflow: 'hidden', width: '100%' }}>
                <LinearGradient colors={['#1a0010', '#880E4F', '#AD1457']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 14 }}>
                  <TouchableOpacity
                    style={{ paddingVertical: 14, paddingHorizontal: 32, width: '100%', alignItems: 'center' }}
                    onPress={() => { console.log('Payment success modal dismissed'); setShowPaymentSuccessModal(false); }}
                  >
                    <Text style={{ color: 'white', fontWeight: '700', fontSize: 16 }}>Ver mi cita</Text>
                  </TouchableOpacity>
                </LinearGradient>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  loadingScreen: { flex: 1, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, paddingTop: 48 },
  title: { fontSize: 32, fontWeight: 'bold', color: HEADING, marginBottom: 24, paddingHorizontal: 24 },
  filterContainer: { flexDirection: 'row', paddingHorizontal: 24, marginBottom: 24, gap: 8 },
  filterButton: {
    flex: 1, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 12,
    backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', minHeight: 40,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  filterButtonActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  filterText: { fontSize: 13, fontWeight: '600', color: HEADING, textAlign: 'center' },
  filterTextActive: { color: 'white' },
  scrollView: { flex: 1 },
  contentContainer: { paddingHorizontal: 24, paddingBottom: 100 },
  appointmentCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08,
    shadowRadius: 8, elevation: 3, borderWidth: 1, borderColor: '#E5E7EB',
  },
  appointmentHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  appointmentIcon: { fontSize: 40, marginRight: 12 },
  appointmentHeaderText: { flex: 1 },
  appointmentName: { fontSize: 20, fontWeight: 'bold', color: HEADING },
  appointmentCity: { fontSize: 14, color: MUTED, marginTop: 2 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  statusText: { color: 'white', fontSize: 12, fontWeight: 'bold' },
  appointmentDate: { fontSize: 16, color: BODY, marginBottom: 4, fontWeight: '500' },
  appointmentTime: { fontSize: 16, color: BODY, marginBottom: 8, fontWeight: '500' },
  appointmentLocation: { fontSize: 14, color: MUTED, marginBottom: 4 },
  appointmentAddress: { fontSize: 13, color: '#888', marginBottom: 12 },
  mapsButton: { backgroundColor: '#4285F4', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center', marginBottom: 8 },
  mapsButtonText: { color: 'white', fontSize: 14, fontWeight: 'bold' },
  refundInfoCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)', borderRadius: 12, padding: 16,
    marginTop: 12, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  refundInfoText: { fontSize: 13, color: '#065F46', textAlign: 'center', lineHeight: 20, fontWeight: '500' },
  cancelButton: { backgroundColor: '#EF4444', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  cancelButtonText: { color: 'white', fontSize: 14, fontWeight: 'bold' },
  emptyContainer: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 16, color: MUTED, textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalContent: { backgroundColor: 'white', borderRadius: 20, padding: 32, width: '100%', maxWidth: 400 },
  modalTitle: { fontSize: 24, fontWeight: 'bold', color: HEADING, marginBottom: 12, textAlign: 'center' },
  modalSubtitle: { fontSize: 16, color: MUTED, marginBottom: 24, textAlign: 'center' },
  notificationOptions: { marginBottom: 24 },
  notificationOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  notificationOptionText: { fontSize: 16, color: BODY },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#D1D5DB', justifyContent: 'center', alignItems: 'center' },
  checkboxActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  checkmark: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  saveButtonWrapper: { borderRadius: 12, overflow: 'hidden' },
  saveButtonGradient: { borderRadius: 12 },
  saveButtonInner: { paddingVertical: 16, alignItems: 'center' },
  saveButtonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalButton: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  modalButtonSecondary: { backgroundColor: '#F3F4F6' },
  modalButtonDanger: { backgroundColor: '#EF4444' },
  modalButtonTextSecondary: { color: '#6B7280', fontSize: 16, fontWeight: 'bold' },
  modalButtonTextPrimary: { color: 'white', fontSize: 16, fontWeight: 'bold' },
});
