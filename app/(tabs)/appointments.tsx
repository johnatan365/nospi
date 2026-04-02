import React, { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { useAppConfig } from '@/contexts/AppConfigContext';
import { useSupabase } from '@/contexts/SupabaseContext';
import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { SkeletonBox } from '@/components/SkeletonBox';
import { getCached, setCached, clearCached } from '@/utils/cache';

const CACHE_KEY_PREFIX = 'cache_appointments';

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
  const { appConfig } = useAppConfig();
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

  // Per-filter in-memory cache (keeps data across filter switches within same session)
  const cacheRef = useRef<Record<FilterType, Appointment[] | null>>({
    confirmadas: null,
    anteriores: null,
    canceladas: null,
  });

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

  const fetchFreshAppointments = useCallback(async (filterType: FilterType): Promise<Appointment[] | null> => {
    if (!user?.id) return null;

    let statusFilter = 'confirmada';
    if (filterType === 'anteriores') statusFilter = 'anterior';
    else if (filterType === 'canceladas') statusFilter = 'cancelada';

    console.log('AppointmentsScreen: Fetching appointments, filter:', filterType, 'user:', user.id);

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
          event_status,
          start_time
        )
      `)
      .eq('user_id', user.id)
      .eq('status', statusFilter)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('AppointmentsScreen: Error loading appointments:', error);
      return null;
    }

    const transformed = (data || []).map(apt => ({
      ...apt,
      event: apt.events as any,
    })) as Appointment[];

    console.log('AppointmentsScreen: Loaded', transformed.length, 'appointments for filter:', filterType);
    return transformed;
  }, [user]);

  const loadAppointments = useCallback(async (filterType: FilterType = filter) => {
    if (!user?.id) return;

    const cacheKey = `${CACHE_KEY_PREFIX}_${filterType}`;

    // 1. Show in-memory cache instantly (no async needed)
    if (cacheRef.current[filterType]) {
      setAppointments(cacheRef.current[filterType]!);
      setLoading(false);
    } else {
      // 2. Try AsyncStorage for cross-session persistence
      const persisted = await getCached<Appointment[]>(cacheKey);
      if (persisted) {
        console.log('AppointmentsScreen: Showing persisted cache for filter:', filterType);
        cacheRef.current[filterType] = persisted;
        setAppointments(persisted);
        setLoading(false);
      }
    }

    // 3. Always revalidate in background
    try {
      const fresh = await fetchFreshAppointments(filterType);
      if (fresh !== null) {
        cacheRef.current[filterType] = fresh;
        setAppointments(fresh);
        setCached(cacheKey, fresh);
      }
    } catch (error) {
      console.error('AppointmentsScreen: Failed to load appointments:', error);
    } finally {
      setLoading(false);
    }
  }, [user, filter, fetchFreshAppointments]);

  useFocusEffect(
    useCallback(() => {
      console.log('AppointmentsScreen: Tab focused');

      // Si viene de un pago exitoso, invalidar caché antes de cargar para mostrar la cita nueva.
      AsyncStorage.getItem('should_check_notification_prompt').then(async (shouldCheck) => {
        if (shouldCheck === 'true') {
          console.log('AppointmentsScreen: pago reciente detectado, invalidando caché');
          cacheRef.current['confirmadas'] = null;
          await clearCached(`${CACHE_KEY_PREFIX}_confirmadas`);
          await AsyncStorage.removeItem('should_check_notification_prompt');
        }
        loadAppointments();
      }).catch(() => {
        loadAppointments();
      });

      // Check for PSE payment pending
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
                // Invalidate cache and reload
                cacheRef.current['confirmadas'] = null;
                clearCached(`${CACHE_KEY_PREFIX}_confirmadas`);
                loadAppointments('confirmadas');
              }
            }, 2000);
          }
        }
      });

      if (user) {
        checkFirstTimeNotificationPrompt();
      }
    }, [loadAppointments, user?.id, filter, checkFirstTimeNotificationPrompt])
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    };
    return date.toLocaleDateString('es-ES', options);
  };

  const handleFilterChange = (newFilter: FilterType) => {
    console.log('User tapped appointments filter:', newFilter);
    setFilter(newFilter);
  };

  const handleCancelPress = (appointment: Appointment) => {
    console.log('User tapped cancel appointment:', appointment.id);
    setAppointmentToCancel(appointment);
    setShowCancelModal(true);
  };

  const confirmCancel = async () => {
    if (!appointmentToCancel || !appointmentToCancel.event) return;
    console.log('User confirmed cancel appointment:', appointmentToCancel.id);

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
        const refundAmount = parseInt(appConfig.event_price, 10) || 30000;
        const { error: balanceError } = await supabase.rpc('increment_virtual_balance', {
          user_id_param: user?.id,
          amount_param: refundAmount,
        });

        if (balanceError) {
          console.error('Error updating virtual balance:', balanceError);
          const { data: userData } = await supabase
            .from('users')
            .select('virtual_balance')
            .eq('id', user?.id)
            .single();

          const currentBalance = userData?.virtual_balance || 0;
          const newBalance = currentBalance + refundAmount;
          await supabase
            .from('users')
            .update({ virtual_balance: newBalance })
            .eq('id', user?.id);
        }
      }

      setShowCancelModal(false);
      setAppointmentToCancel(null);
      // Invalidate all appointment caches since cancel affects multiple filters
      cacheRef.current['confirmadas'] = null;
      cacheRef.current['canceladas'] = null;
      clearCached(`${CACHE_KEY_PREFIX}_confirmadas`);
      clearCached(`${CACHE_KEY_PREFIX}_canceladas`);
      loadAppointments(filter);
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
      console.log('User saving notification preferences');
      const { error } = await supabase
        .from('users')
        .update({ notification_preferences: notificationPreferences })
        .eq('id', user?.id);

      if (error) {
        console.error('Error saving notification preferences:', error);
        return;
      }

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
    console.log('User tapped open maps:', mapsLink);
    Linking.openURL(mapsLink).catch(err => {
      console.error('Failed to open maps link:', err);
    });
  };

  const renderSkeleton = () => (
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
      {[1, 2].map(i => (
        <View key={i} style={styles.skeletonCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <SkeletonBox width={48} height={48} borderRadius={24} style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <SkeletonBox height={20} width="65%" borderRadius={6} style={{ marginBottom: 8 }} />
              <SkeletonBox height={14} width="40%" borderRadius={6} />
            </View>
            <SkeletonBox width={80} height={28} borderRadius={12} />
          </View>
          <SkeletonBox height={16} width="85%" borderRadius={6} style={{ marginBottom: 6 }} />
          <SkeletonBox height={16} width="45%" borderRadius={6} style={{ marginBottom: 6 }} />
          <SkeletonBox height={14} width="70%" borderRadius={6} />
        </View>
      ))}
    </ScrollView>
  );

  const emptyText = filter === 'confirmadas'
    ? 'No tienes citas confirmadas'
    : filter === 'canceladas'
    ? 'No tienes citas canceladas'
    : 'No tienes citas anteriores';

  return (
    <LinearGradient
      colors={['#1a0010', '#880E4F', '#AD1457']}
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
            onPress={() => handleFilterChange('confirmadas')}
          >
            <Text
              style={[styles.filterText, filter === 'confirmadas' && styles.filterTextActive]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              Confirmadas
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, filter === 'canceladas' && styles.filterButtonActive]}
            onPress={() => handleFilterChange('canceladas')}
          >
            <Text
              style={[styles.filterText, filter === 'canceladas' && styles.filterTextActive]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              Canceladas
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, filter === 'anteriores' && styles.filterButtonActive]}
            onPress={() => handleFilterChange('anteriores')}
          >
            <Text
              style={[styles.filterText, filter === 'anteriores' && styles.filterTextActive]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              Anteriores
            </Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          renderSkeleton()
        ) : (
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

              const eventLocation = locationRevealed && appointment.event.location_name
                ? appointment.event.location_name
                : '';
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

                  {shouldShowLocationPlaceholder && (
                    <Text style={styles.appointmentLocation}>Ubicación se revelará 48 horas antes del evento</Text>
                  )}

                  {locationRevealed && (
                    <>
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
        )}

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
              {appointmentToCancel && appointmentToCancel.event && (() => {
                const eventStartTime = appointmentToCancel.event.start_time
                  ? new Date(appointmentToCancel.event.start_time)
                  : new Date(appointmentToCancel.event.date);
                const now = new Date();
                const timeDifferenceMs = eventStartTime.getTime() - now.getTime();
                const twentyFourHoursMs = 24 * 60 * 60 * 1000;
                const isWithinRefundWindow = timeDifferenceMs > twentyFourHoursMs;

                const eventPriceNum = parseInt(appConfig.event_price, 10) || 30000;
                const refundMessage = isWithinRefundWindow
                  ? `✅ Como cancelas con más de 24 horas de anticipación, recibirás $${eventPriceNum.toLocaleString('es-CO')} pesos como saldo virtual que podrás usar en tu próximo evento.`
                  : '⚠️ La cancelación es con menos de 24 horas de anticipación, por lo que no se realizará reembolso.';

                return (
                  <Text style={styles.modalSubtitle}>{refundMessage}</Text>
                );
              })()}

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

        {/* Modal de exito de pago PSE */}
        <Modal visible={showPaymentSuccessModal} transparent animationType="fade">
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <View style={{ backgroundColor: 'white', borderRadius: 24, padding: 32, alignItems: 'center', width: '100%', maxWidth: 340 }}>
              <Text style={{ fontSize: 64, marginBottom: 16 }}>🎉</Text>
              <Text style={{ fontSize: 22, fontWeight: '800', color: nospiColors.purpleDark, marginBottom: 8, textAlign: 'center' }}>
                ¡Pago exitoso!
              </Text>
              <Text style={{ fontSize: 15, color: '#6B7280', textAlign: 'center', marginBottom: 24, lineHeight: 22 }}>
                Tu asistencia al evento ha sido confirmada. ¡Nos vemos pronto!
              </Text>
              <TouchableOpacity
                style={{ backgroundColor: nospiColors.purpleDark, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, width: '100%' }}
                onPress={() => setShowPaymentSuccessModal(false)}
              >
                <Text style={{ color: 'white', fontWeight: '700', fontSize: 16, textAlign: 'center' }}>Ver mi cita</Text>
              </TouchableOpacity>
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
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 24,
    paddingHorizontal: 24,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    marginBottom: 24,
    gap: 8,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  filterButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
  },
  filterTextActive: {
    color: '#880E4F',
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 24,
    paddingBottom: 100,
  },
  skeletonCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
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
    color: '#880E4F',
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
  refundInfoCard: {
    backgroundColor: 'rgba(240, 98, 146, 0.12)',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(240, 98, 146, 0.30)',
  },
  refundInfoText: {
    fontSize: 13,
    color: '#880E4F',
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: '500',
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    overflow: 'hidden',
    backgroundColor: '#880E4F',
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
    color: '#FFFFFF',
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
    color: '#880E4F',
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