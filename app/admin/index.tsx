
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Modal, Platform, Alert } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { Stack, useRouter } from 'expo-router';

interface Event {
  id: string;
  name: string;
  city: string;
  description: string;
  type: string;
  date: string;
  time: string;
  location: string;
  location_name: string;
  location_address: string;
  maps_link: string;
  is_location_revealed: boolean;
  is_full: boolean;
  address: string | null;
  start_time: string | null;
  max_participants: number;
  current_participants: number;
  status: string;
  event_status: 'draft' | 'published' | 'closed';
  confirmation_code: string | null;
}

interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  country: string;
  interested_in?: string;
  gender?: string;
  age?: number;
}

interface Appointment {
  id: string;
  user_id: string;
  event_id: string;
  status: string;
  payment_status: string;
  created_at: string;
  users: User;
  events: Event;
}

interface EventAttendee {
  id: string;
  user_id: string;
  event_id: string;
  status: string;
  payment_status: string;
  created_at: string;
  users: User;
}

type AdminView = 'dashboard' | 'events' | 'users' | 'appointments';

export default function AdminPanelScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<AdminView>('dashboard');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(true);

  // Dashboard stats
  const [totalEvents, setTotalEvents] = useState(0);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalAppointments, setTotalAppointments] = useState(0);
  const [activeEvents, setActiveEvents] = useState(0);

  // Data lists
  const [events, setEvents] = useState<Event[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  // Event attendees modal
  const [showAttendeesModal, setShowAttendeesModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [eventAttendees, setEventAttendees] = useState<EventAttendee[]>([]);
  const [loadingAttendees, setLoadingAttendees] = useState(false);

  // Event creation modal
  const [showCreateEventModal, setShowCreateEventModal] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [newEvent, setNewEvent] = useState({
    name: '',
    city: '',
    description: '',
    type: 'bar',
    date: '',
    time: '',
    location_name: '',
    location_address: '',
    maps_link: '',
    max_participants: 6,
    event_status: 'published' as 'draft' | 'published' | 'closed',
    confirmation_code: '1986',
  });

  useEffect(() => {
    console.log('Admin panel loaded (Mobile version)');
    if (isAuthenticated) {
      loadDashboardData();
    }
  }, [isAuthenticated, currentView]);

  const handlePasswordSubmit = () => {
    console.log('Admin authentication attempt');
    // Simple password check - in production, use proper authentication
    if (adminPassword === 'nospi2024') {
      console.log('Admin authenticated successfully');
      setIsAuthenticated(true);
      setShowPasswordModal(false);
      loadDashboardData();
    } else {
      Alert.alert('Error', 'Contraseña incorrecta');
    }
  };

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      console.log('Loading admin dashboard data...');

      // Load events
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('id, name, city, description, type, date, time, location, location_name, location_address, maps_link, is_location_revealed, is_full, address, start_time, max_participants, current_participants, status, event_status, confirmation_code')
        .order('date', { ascending: false });

      if (eventsError) {
        console.error('Error loading events:', eventsError);
      } else {
        console.log('✅ Events loaded successfully:', eventsData?.length || 0);
        setEvents(eventsData || []);
        setTotalEvents(eventsData?.length || 0);
        const activeCount = eventsData?.filter(e => e.event_status === 'published').length || 0;
        setActiveEvents(activeCount);
      }

      // Load users using the secure admin function
      console.log('Loading users via admin function...');
      const { data: usersData, error: usersError } = await supabase
        .rpc('get_all_users_for_admin');

      if (usersError) {
        console.error('Error loading users:', usersError);
        Alert.alert('Error', 'No se pudieron cargar los usuarios: ' + usersError.message);
      } else {
        console.log('✅ Users loaded successfully:', usersData?.length || 0);
        setUsers(usersData || []);
        setTotalUsers(usersData?.length || 0);
      }

      // Load appointments using the secure admin function
      console.log('Loading appointments via admin function...');
      const { data: appointmentsRawData, error: appointmentsError } = await supabase
        .rpc('get_all_appointments_for_admin');

      if (appointmentsError) {
        console.error('Error loading appointments:', appointmentsError);
      } else {
        console.log('✅ Appointments loaded successfully:', appointmentsRawData?.length || 0);
        
        // Transform the flat data structure into the nested structure expected by the UI
        const transformedAppointments = appointmentsRawData?.map((apt: any) => ({
          id: apt.id,
          user_id: apt.user_id,
          event_id: apt.event_id,
          status: apt.status,
          payment_status: apt.payment_status,
          created_at: apt.created_at,
          users: {
            id: apt.user_id,
            name: apt.user_name,
            email: apt.user_email,
            phone: apt.user_phone,
            city: apt.user_city,
            country: apt.user_country,
            interested_in: apt.user_interested_in,
            gender: apt.user_gender,
            age: apt.user_age,
          },
          events: {
            id: apt.event_id,
            name: apt.event_name,
            city: apt.event_city,
            type: apt.event_type,
            date: apt.event_date,
            time: apt.event_time,
            confirmation_code: apt.event_confirmation_code,
            location: '',
            location_name: '',
            location_address: '',
            maps_link: '',
            is_location_revealed: false,
            address: null,
            start_time: null,
            max_participants: 0,
            current_participants: 0,
            status: '',
            event_status: 'published' as 'draft' | 'published' | 'closed',
            description: '',
          },
        })) || [];
        
        setAppointments(transformedAppointments);
        setTotalAppointments(transformedAppointments.length);
      }

      console.log('Dashboard data loaded successfully');
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      Alert.alert('Error', 'Error inesperado al cargar datos: ' + String(error));
    } finally {
      setLoading(false);
    }
  };

  const handleViewAttendees = async (event: Event) => {
    console.log('Loading attendees for event:', event.id);
    setSelectedEvent(event);
    setLoadingAttendees(true);
    setShowAttendeesModal(true);

    try {
      const { data, error } = await supabase
        .rpc('get_event_attendees_for_admin', { p_event_id: event.id });

      if (error) {
        console.error('Error loading event attendees:', error);
        Alert.alert('Error', 'No se pudieron cargar los asistentes: ' + error.message);
        setEventAttendees([]);
      } else {
        console.log('✅ Attendees loaded:', data?.length || 0);
        
        // Transform the flat data structure into the nested structure
        const transformedAttendees = data?.map((att: any) => ({
          id: att.id,
          user_id: att.user_id,
          event_id: att.event_id,
          status: att.status,
          payment_status: att.payment_status,
          created_at: att.created_at,
          users: {
            id: att.user_id,
            name: att.user_name,
            email: att.user_email,
            phone: att.user_phone,
            city: att.user_city,
            country: att.user_country,
            interested_in: att.user_interested_in,
            gender: att.user_gender,
            age: att.user_age,
          },
        })) || [];
        
        setEventAttendees(transformedAttendees);
      }
    } catch (error) {
      console.error('Failed to load attendees:', error);
      Alert.alert('Error', 'Error inesperado al cargar asistentes');
      setEventAttendees([]);
    } finally {
      setLoadingAttendees(false);
    }
  };

  const handleDateChange = (event: any, date?: Date) => {
    setShowDatePicker(false);
    if (date) {
      setSelectedDate(date);
      const dateString = date.toISOString().split('T')[0];
      setNewEvent({ ...newEvent, date: dateString });
    }
  };

  const handleTimeChange = (event: any, date?: Date) => {
    setShowTimePicker(false);
    if (date) {
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const timeString = `${hours}:${minutes}`;
      setNewEvent({ ...newEvent, time: timeString });
    }
  };

  const handleCreateEvent = async () => {
    console.log('=== handleCreateEvent CALLED ===');
    console.log('Button pressed - starting event creation');
    
    try {
      console.log('Creating new event:', newEvent);

      // Validate required fields
      if (!newEvent.name || !newEvent.city || !newEvent.date || !newEvent.time) {
        console.log('❌ Validation failed - missing required fields');
        Alert.alert('Error', 'Por favor completa todos los campos requeridos (nombre, ciudad, fecha, hora)');
        return;
      }

      // Validate and set default confirmation code
      let finalConfirmationCode = newEvent.confirmation_code.trim();
      if (!finalConfirmationCode) {
        console.log('Confirmation code empty, using default: 1986');
        finalConfirmationCode = '1986';
      }

      // Create ISO timestamp for start_time
      const combinedDateString = `${newEvent.date}T${newEvent.time}:00`;
      const combinedDate = new Date(combinedDateString);

      // Validate the date is valid
      if (isNaN(combinedDate.getTime())) {
        Alert.alert('Error', 'Fecha u hora inválida. Asegúrate de que el formato sea correcto (Fecha: YYYY-MM-DD, Hora: HH:mm)');
        return;
      }

      const startTimeISO = combinedDate.toISOString();

      // FIX: Use 'restaurante' instead of 'restaurant' to match the database constraint
      const eventData = {
        name: newEvent.name,
        city: newEvent.city,
        description: newEvent.description,
        type: newEvent.type === 'restaurant' ? 'restaurante' : newEvent.type,
        date: startTimeISO,
        time: newEvent.time,
        location: newEvent.event_status === 'published' && newEvent.location_name 
          ? newEvent.location_name 
          : 'Se revelará próximamente',
        location_name: newEvent.location_name,
        location_address: newEvent.location_address,
        maps_link: newEvent.maps_link,
        start_time: startTimeISO,
        max_participants: newEvent.max_participants,
        current_participants: 0,
        status: 'active',
        is_location_revealed: false,
        event_status: newEvent.event_status,
        confirmation_code: finalConfirmationCode,
      };

      console.log('Inserting event data:', eventData);

      const { data, error } = await supabase
        .from('events')
        .insert([eventData])
        .select();

      if (error) {
        console.error('Error creating event:', error);
        Alert.alert('Error', 'Error al crear evento: ' + error.message);
        return;
      }

      if (!data || data.length === 0) {
        console.error('⚠️ INSERT RETURNED NO DATA - Event was NOT created!');
        Alert.alert('Error', 'El evento NO fue creado. Por favor verifica las políticas RLS y los logs de la base de datos.');
        return;
      }

      console.log('✅ Event created successfully:', data);
      Alert.alert('Éxito', 'Evento creado exitosamente');
      setShowCreateEventModal(false);
      setNewEvent({
        name: '',
        city: '',
        description: '',
        type: 'bar',
        date: '',
        time: '',
        location_name: '',
        location_address: '',
        maps_link: '',
        max_participants: 6,
        event_status: 'published',
        confirmation_code: '1986',
      });
      loadDashboardData();
    } catch (error) {
      console.error('Failed to create event:', error);
      Alert.alert('Error', 'Error inesperado al crear evento: ' + String(error));
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    Alert.alert(
      'Confirmar',
      '¿Estás seguro de que quieres eliminar este evento?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            await performDeleteEvent(eventId);
          },
        },
      ]
    );
  };

  const handleSendEventReminder = async (eventId: string) => {
    Alert.alert(
      'Enviar Recordatorio',
      '¿Enviar recordatorio a todos los participantes de este evento según sus preferencias de notificación?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Enviar',
          onPress: async () => {
            try {
              console.log('Sending event reminder for:', eventId);
              
              // Get all appointments for this event
              const { data: appointmentsData, error: appointmentsError } = await supabase
                .from('appointments')
                .select('user_id')
                .eq('event_id', eventId)
                .eq('status', 'confirmada');

              if (appointmentsError) {
                console.error('Error fetching appointments:', appointmentsError);
                Alert.alert('Error', 'Error al obtener participantes: ' + appointmentsError.message);
                return;
              }

              if (!appointmentsData || appointmentsData.length === 0) {
                Alert.alert('Información', 'No hay participantes confirmados para este evento');
                return;
              }

              // Call the RPC function to send notifications
              const { error: notificationError } = await supabase.rpc('send_event_reminder_now', {
                p_event_id: eventId
              });

              if (notificationError) {
                console.error('Error sending notifications:', notificationError);
                Alert.alert('Error', 'Error al enviar notificaciones: ' + notificationError.message);
                return;
              }

              Alert.alert('Éxito', `Recordatorio enviado a ${appointmentsData.length} participantes según sus preferencias de notificación`);
            } catch (error) {
              console.error('Failed to send event reminder:', error);
              Alert.alert('Error', 'Error inesperado al enviar recordatorio');
            }
          },
        },
      ]
    );
  };

  const performDeleteEvent = async (eventId: string) => {
    try {
      console.log('Deleting event:', eventId);
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', eventId);

      if (error) {
        console.error('Error deleting event:', error);
        Alert.alert('Error', 'Error al eliminar evento: ' + error.message);
        return;
      }

      console.log('Event deleted successfully');
      Alert.alert('Éxito', 'Evento eliminado exitosamente');
      loadDashboardData();
    } catch (error) {
      console.error('Failed to delete event:', error);
    }
  };

  const handleRevealLocation = async (eventId: string) => {
    Alert.alert(
      'Revelar Ubicación',
      '¿Revelar la ubicación de este evento a todos los participantes?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Revelar',
          onPress: async () => {
            try {
              console.log('Revealing location for event:', eventId);
              const { error } = await supabase
                .from('events')
                .update({ is_location_revealed: true })
                .eq('id', eventId);

              if (error) {
                console.error('Error revealing location:', error);
                Alert.alert('Error', 'Error al revelar ubicación: ' + error.message);
                return;
              }

              console.log('Location revealed successfully');
              Alert.alert('Éxito', 'Ubicación revelada exitosamente');
              loadDashboardData();
            } catch (error) {
              console.error('Failed to reveal location:', error);
              Alert.alert('Error', 'Error inesperado al revelar ubicación');
            }
          },
        },
      ]
    );
  };

  const handleMarkEventFull = async (eventId: string) => {
    Alert.alert(
      'Marcar Evento Full',
      'Este evento desaparecerá de la lista pública pero seguirá visible para usuarios ya inscritos. ¿Continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Marcar Full',
          onPress: async () => {
            try {
              console.log('Marking event as full:', eventId);
              const { error } = await supabase
                .from('events')
                .update({ is_full: true })
                .eq('id', eventId);

              if (error) {
                console.error('Error marking event as full:', error);
                Alert.alert('Error', 'Error al marcar evento como full: ' + error.message);
                return;
              }

              console.log('Event marked as full successfully');
              Alert.alert('Éxito', 'Evento marcado como Full. Ya no aparecerá en la lista pública.');
              loadDashboardData();
            } catch (error) {
              console.error('Failed to mark event as full:', error);
              Alert.alert('Error', 'Error inesperado');
            }
          },
        },
      ]
    );
  };

  const handleShowEventAgain = async (eventId: string) => {
    Alert.alert(
      'Volver a Mostrar Evento',
      '¿Volver a mostrar este evento en la lista pública?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Mostrar',
          onPress: async () => {
            try {
              console.log('Showing event again:', eventId);
              const { error } = await supabase
                .from('events')
                .update({ is_full: false })
                .eq('id', eventId);

              if (error) {
                console.error('Error showing event again:', error);
                Alert.alert('Error', 'Error al mostrar evento: ' + error.message);
                return;
              }

              console.log('Event shown again successfully');
              Alert.alert('Éxito', 'Evento visible nuevamente en la lista pública');
              loadDashboardData();
            } catch (error) {
              console.error('Failed to show event again:', error);
              Alert.alert('Error', 'Error inesperado');
            }
          },
        },
      ]
    );
  };

  const renderDashboard = () => {
    const statsData = [
      { label: 'Total Eventos', value: totalEvents, color: nospiColors.purpleDark },
      { label: 'Eventos Publicados', value: activeEvents, color: nospiColors.purpleMid },
      { label: 'Total Usuarios', value: totalUsers, color: nospiColors.purpleLight },
      { label: 'Total Citas', value: totalAppointments, color: '#8B5CF6' },
    ];

    return (
      <View style={styles.dashboardContainer}>
        <Text style={styles.sectionTitle}>Panel de Control</Text>
        <View style={styles.statsGrid}>
          {statsData.map((stat, index) => (
            <View key={index} style={[styles.statCard, { borderLeftColor: stat.color }]}>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.quickActions}>
          <Text style={styles.quickActionsTitle}>Acciones Rápidas</Text>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setShowCreateEventModal(true)}
          >
            <Text style={styles.actionButtonText}>+ Crear Nuevo Evento</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonSecondary]}
            onPress={() => setCurrentView('events')}
          >
            <Text style={styles.actionButtonTextSecondary}>Ver Todos los Eventos</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonSecondary]}
            onPress={() => setCurrentView('users')}
          >
            <Text style={styles.actionButtonTextSecondary}>Ver Usuarios</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderEvents = () => {
    return (
      <View style={styles.listContainer}>
        <View style={styles.listHeader}>
          <Text style={styles.sectionTitle}>Gestión de Eventos</Text>
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => setShowCreateEventModal(true)}
          >
            <Text style={styles.createButtonText}>+ Crear Evento</Text>
          </TouchableOpacity>
        </View>

        {events.map((event) => {
          const eventTypeText = event.type === 'bar' ? 'Bar' : 'Restaurante';
          const statusText = event.event_status === 'published' ? 'Publicado' : event.event_status === 'draft' ? 'Borrador' : 'Cerrado';
          const statusColor = event.event_status === 'published' ? '#10B981' : event.event_status === 'draft' ? '#F59E0B' : '#EF4444';
          const confirmationCode = event.confirmation_code || '1986';
          const locationRevealed = event.is_location_revealed || false;
          const isFull = event.is_full || false;
          
          const eventAppointmentsCount = appointments.filter(a => a.event_id === event.id).length;

          return (
            <View key={event.id} style={styles.listItemCompact}>
              <View style={styles.listItemHeader}>
                <Text style={styles.listItemTitle}>{event.name || `${eventTypeText} - ${event.city}`}</Text>
                <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
                  <Text style={styles.statusBadgeText}>{statusText}</Text>
                </View>
              </View>
              <View style={styles.compactInfoRow}>
                <Text style={styles.compactInfoText}>📍 {event.city}</Text>
                <Text style={styles.compactInfoText}>📅 {event.date}</Text>
              </View>
              <View style={styles.compactInfoRow}>
                <Text style={styles.compactInfoText}>🕐 {event.time}</Text>
                <Text style={styles.compactInfoText}>👥 {eventAppointmentsCount} registrados</Text>
              </View>
              <View style={styles.codeHighlight}>
                <Text style={styles.codeLabel}>🔑 Código:</Text>
                <Text style={styles.codeValue}>{confirmationCode}</Text>
              </View>
              
              {isFull && (
                <View style={styles.fullBadge}>
                  <Text style={styles.fullBadgeText}>🚫 EVENTO FULL - Oculto de lista pública</Text>
                </View>
              )}
              
              {locationRevealed && (
                <View style={styles.revealedBadge}>
                  <Text style={styles.revealedBadgeText}>📍 Ubicación revelada</Text>
                </View>
              )}
              
              <TouchableOpacity
                style={styles.viewAttendeesButton}
                onPress={() => handleViewAttendees(event)}
              >
                <Text style={styles.viewAttendeesButtonText}>👥 Ver Asistentes ({eventAppointmentsCount})</Text>
              </TouchableOpacity>
              
              {!locationRevealed && (
                <TouchableOpacity
                  style={styles.revealLocationButton}
                  onPress={() => handleRevealLocation(event.id)}
                >
                  <Text style={styles.revealLocationButtonText}>📍 Revelar Ubicación</Text>
                </TouchableOpacity>
              )}
              
              {!isFull && (
                <TouchableOpacity
                  style={styles.markFullButton}
                  onPress={() => handleMarkEventFull(event.id)}
                >
                  <Text style={styles.markFullButtonText}>🚫 Marcar Evento Full</Text>
                </TouchableOpacity>
              )}
              
              {isFull && (
                <TouchableOpacity
                  style={styles.showAgainButton}
                  onPress={() => handleShowEventAgain(event.id)}
                >
                  <Text style={styles.showAgainButtonText}>✅ Volver a Mostrar Evento</Text>
                </TouchableOpacity>
              )}
              
              <TouchableOpacity
                style={styles.sendNotificationButton}
                onPress={() => handleSendEventReminder(event.id)}
              >
                <Text style={styles.sendNotificationButtonText}>🔔 Enviar Recordatorio Ahora</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleDeleteEvent(event.id)}
              >
                <Text style={styles.deleteButtonText}>Eliminar Evento</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    );
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    Alert.alert(
      'Confirmar Eliminación',
      `¿Estás seguro de que quieres eliminar al usuario "${userName}"? Esta acción no se puede deshacer y eliminará todos sus datos, citas y participaciones en eventos.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            await performDeleteUser(userId, userName);
          },
        },
      ]
    );
  };

  const performDeleteUser = async (userId: string, userName: string) => {
    try {
      console.log('Deleting user:', userId, userName);
      setLoading(true);

      // Delete user from users table (this will cascade delete related records)
      const { error: deleteUserError } = await supabase
        .from('users')
        .delete()
        .eq('id', userId);

      if (deleteUserError) {
        console.error('Error deleting user from users table:', deleteUserError);
        Alert.alert('Error', 'Error al eliminar usuario: ' + deleteUserError.message);
        return;
      }

      // Delete user from auth.users (Supabase Auth)
      const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(userId);

      if (deleteAuthError) {
        console.error('Error deleting user from auth:', deleteAuthError);
        // Don't show error to user if auth deletion fails - the user record is already deleted
        console.log('User deleted from database but auth deletion failed - this is acceptable');
      }

      console.log('User deleted successfully');
      Alert.alert('Éxito', `Usuario "${userName}" eliminado exitosamente`);
      
      // Reload dashboard data
      await loadDashboardData();
    } catch (error) {
      console.error('Failed to delete user:', error);
      Alert.alert('Error', 'Error inesperado al eliminar usuario: ' + String(error));
    } finally {
      setLoading(false);
    }
  };

  const renderUsers = () => {
    return (
      <View style={styles.listContainer}>
        <Text style={styles.sectionTitle}>Usuarios Registrados ({users.length})</Text>
        {users.map((user) => {
          const interestedInText = user.interested_in === 'hombres' ? 'Hombres' : user.interested_in === 'mujeres' ? 'Mujeres' : user.interested_in === 'ambos' ? 'Ambos' : 'No especificado';
          const genderText = user.gender === 'hombre' ? 'Hombre' : user.gender === 'mujer' ? 'Mujer' : 'No especificado';
          
          // Calculate age range preference display
          const ageRangeMin = (user as any).age_range_min || 18;
          const ageRangeMax = (user as any).age_range_max || 99;
          const ageRangeText = `${ageRangeMin} - ${ageRangeMax} años`;
          
          return (
            <View key={user.id} style={styles.listItem}>
              <Text style={styles.listItemTitle}>{user.name}</Text>
              <Text style={styles.listItemDetail}>Email: {user.email}</Text>
              <Text style={styles.listItemDetail}>Teléfono: {user.phone}</Text>
              <Text style={styles.listItemDetail}>
                Ubicación: {user.city}, {user.country}
              </Text>
              <Text style={styles.listItemDetail}>Género: {genderText}</Text>
              <Text style={styles.listItemDetail}>Interesado en: {interestedInText}</Text>
              {user.age && <Text style={styles.listItemDetail}>Edad: {user.age} años</Text>}
              <View style={styles.ageRangeHighlight}>
                <Text style={styles.ageRangeLabel}>🎯 Rango de edad preferido:</Text>
                <Text style={styles.ageRangeValue}>{ageRangeText}</Text>
              </View>
              
              <TouchableOpacity
                style={styles.deleteUserButton}
                onPress={() => handleDeleteUser(user.id, user.name)}
              >
                <Text style={styles.deleteUserButtonText}>🗑️ Eliminar Usuario</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    );
  };

  const renderAppointments = () => {
    return (
      <View style={styles.listContainer}>
        <Text style={styles.sectionTitle}>Citas y Reservas</Text>
        {appointments.map((appointment) => {
          const statusColor = appointment.status === 'confirmed' ? '#10B981' : '#F59E0B';
          const paymentColor = appointment.payment_status === 'paid' ? '#10B981' : '#EF4444';
          const confirmationCode = appointment.events.confirmation_code || '1986';
          const interestedInText = appointment.users.interested_in === 'hombres' ? 'Hombres' : appointment.users.interested_in === 'mujeres' ? 'Mujeres' : appointment.users.interested_in === 'ambos' ? 'Ambos' : 'No especificado';
          const genderText = appointment.users.gender === 'hombre' ? 'Hombre' : appointment.users.gender === 'mujer' ? 'Mujer' : 'No especificado';

          return (
            <View key={appointment.id} style={styles.listItem}>
              <View style={styles.listItemHeader}>
                <Text style={styles.listItemTitle}>{appointment.users.name}</Text>
                <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
                  <Text style={styles.statusBadgeText}>{appointment.status}</Text>
                </View>
              </View>
              <Text style={styles.listItemDetail}>
                Evento: {appointment.events.name || `${appointment.events.type} - ${appointment.events.city}`}
              </Text>
              <Text style={styles.listItemDetail}>
                Fecha: {appointment.events.date} a las {appointment.events.time}
              </Text>
              <View style={styles.codeHighlight}>
                <Text style={styles.codeLabel}>🔑 Código del evento:</Text>
                <Text style={styles.codeValue}>{confirmationCode}</Text>
              </View>
              <Text style={styles.listItemDetail}>Email: {appointment.users.email}</Text>
              <Text style={styles.listItemDetail}>Teléfono: {appointment.users.phone}</Text>
              <Text style={styles.listItemDetail}>Género: {genderText}</Text>
              <Text style={styles.listItemDetail}>Interesado en: {interestedInText}</Text>
              {appointment.users.age && <Text style={styles.listItemDetail}>Edad: {appointment.users.age} años</Text>}
              <View style={[styles.statusBadge, { backgroundColor: paymentColor, marginTop: 8 }]}>
                <Text style={styles.statusBadgeText}>
                  Pago: {appointment.payment_status === 'paid' ? 'Pagado' : 'Pendiente'}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  if (showPasswordModal) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <LinearGradient
          colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
          style={styles.gradient}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        >
          <View style={styles.passwordContainer}>
            <Text style={styles.passwordTitle}>Panel de Administración</Text>
            <Text style={styles.passwordSubtitle}>Ingresa la contraseña de administrador</Text>
            <TextInput
              style={styles.passwordInput}
              placeholder="Contraseña"
              secureTextEntry
              value={adminPassword}
              onChangeText={setAdminPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.passwordButton} onPress={handlePasswordSubmit}>
              <Text style={styles.passwordButtonText}>Acceder</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <Text style={styles.backButtonText}>Volver</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Panel de Administración' }} />
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
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Panel de Administración' }} />
      <LinearGradient
        colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <View style={styles.container}>
          {/* Navigation Tabs */}
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tab, currentView === 'dashboard' && styles.tabActive]}
              onPress={() => setCurrentView('dashboard')}
            >
              <Text style={[styles.tabText, currentView === 'dashboard' && styles.tabTextActive]}>
                Dashboard
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, currentView === 'events' && styles.tabActive]}
              onPress={() => setCurrentView('events')}
            >
              <Text style={[styles.tabText, currentView === 'events' && styles.tabTextActive]}>
                Eventos
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, currentView === 'users' && styles.tabActive]}
              onPress={() => setCurrentView('users')}
            >
              <Text style={[styles.tabText, currentView === 'users' && styles.tabTextActive]}>
                Usuarios
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, currentView === 'appointments' && styles.tabActive]}
              onPress={() => setCurrentView('appointments')}
            >
              <Text style={[styles.tabText, currentView === 'appointments' && styles.tabTextActive]}>
                Citas
              </Text>
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            {currentView === 'dashboard' && renderDashboard()}
            {currentView === 'events' && renderEvents()}
            {currentView === 'users' && renderUsers()}
            {currentView === 'appointments' && renderAppointments()}
          </ScrollView>
        </View>

        {/* Create Event Modal */}
        <Modal
          visible={showCreateEventModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowCreateEventModal(false)}
        >
          <View style={styles.modalOverlay}>
            <ScrollView contentContainerStyle={styles.modalScrollContent}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Crear Nuevo Evento</Text>

                <Text style={styles.inputLabel}>Nombre del Evento *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ej: Encuentro de Solteros"
                  value={newEvent.name}
                  onChangeText={(text) => setNewEvent({ ...newEvent, name: text })}
                />

                <Text style={styles.inputLabel}>Ciudad *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ej: Bogotá"
                  value={newEvent.city}
                  onChangeText={(text) => setNewEvent({ ...newEvent, city: text })}
                />

                <Text style={styles.inputLabel}>Descripción</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Descripción del evento"
                  value={newEvent.description}
                  onChangeText={(text) => setNewEvent({ ...newEvent, description: text })}
                  multiline
                  numberOfLines={3}
                />

                <Text style={styles.inputLabel}>Tipo de Evento</Text>
                <View style={styles.typeSelector}>
                  <TouchableOpacity
                    style={[
                      styles.typeButton,
                      newEvent.type === 'bar' && styles.typeButtonActive,
                    ]}
                    onPress={() => setNewEvent({ ...newEvent, type: 'bar' })}
                  >
                    <Text
                      style={[
                        styles.typeButtonText,
                        newEvent.type === 'bar' && styles.typeButtonTextActive,
                      ]}
                    >
                      🍸 Bar
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.typeButton,
                      newEvent.type === 'restaurant' && styles.typeButtonActive,
                    ]}
                    onPress={() => setNewEvent({ ...newEvent, type: 'restaurant' })}
                  >
                    <Text
                      style={[
                        styles.typeButtonText,
                        newEvent.type === 'restaurant' && styles.typeButtonTextActive,
                      ]}
                    >
                      🍽️ Restaurante
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.inputLabel}>Fecha (YYYY-MM-DD) *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="2024-02-15"
                  value={newEvent.date}
                  onChangeText={(text) => setNewEvent({ ...newEvent, date: text })}
                />

                <Text style={styles.inputLabel}>Hora (HH:mm formato 24 horas) *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="21:15"
                  value={newEvent.time}
                  onChangeText={(text) => setNewEvent({ ...newEvent, time: text })}
                />

                <Text style={styles.inputLabel}>Máximo de Participantes</Text>
                <TextInput
                  style={styles.input}
                  placeholder="6"
                  keyboardType="numeric"
                  value={String(newEvent.max_participants)}
                  onChangeText={(text) =>
                    setNewEvent({ ...newEvent, max_participants: parseInt(text) || 6 })
                  }
                />

                <Text style={styles.inputLabel}>Nombre del Lugar</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ej: Bar El Encuentro"
                  value={newEvent.location_name}
                  onChangeText={(text) => setNewEvent({ ...newEvent, location_name: text })}
                />

                <Text style={styles.inputLabel}>Dirección del Lugar</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ej: Calle 85 #15-20"
                  value={newEvent.location_address}
                  onChangeText={(text) => setNewEvent({ ...newEvent, location_address: text })}
                />

                <Text style={styles.inputLabel}>Enlace de Maps</Text>
                <TextInput
                  style={styles.input}
                  placeholder="https://maps.google.com/..."
                  value={newEvent.maps_link}
                  onChangeText={(text) => setNewEvent({ ...newEvent, maps_link: text })}
                />

                <View style={styles.highlightedSection}>
                  <Text style={[styles.inputLabel, styles.requiredLabel]}>🔑 Código de confirmación *</Text>
                  <Text style={styles.inputHint}>
                    Los participantes deberán ingresar este código para confirmar su asistencia
                  </Text>
                  <TextInput
                    style={[styles.input, styles.highlightedInput]}
                    placeholder="Ej: 1986"
                    value={newEvent.confirmation_code}
                    onChangeText={(text) => setNewEvent({ ...newEvent, confirmation_code: text })}
                  />
                  <Text style={styles.defaultHint}>Por defecto: 1986</Text>
                </View>

                <Text style={styles.inputLabel}>Estado del Evento</Text>
                <View style={styles.typeSelector}>
                  <TouchableOpacity
                    style={[
                      styles.typeButton,
                      newEvent.event_status === 'draft' && styles.typeButtonActive,
                    ]}
                    onPress={() => setNewEvent({ ...newEvent, event_status: 'draft' })}
                  >
                    <Text
                      style={[
                        styles.typeButtonText,
                        newEvent.event_status === 'draft' && styles.typeButtonTextActive,
                      ]}
                    >
                      📝 Borrador
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.typeButton,
                      newEvent.event_status === 'published' && styles.typeButtonActive,
                    ]}
                    onPress={() => setNewEvent({ ...newEvent, event_status: 'published' })}
                  >
                    <Text
                      style={[
                        styles.typeButtonText,
                        newEvent.event_status === 'published' && styles.typeButtonTextActive,
                      ]}
                    >
                      ✅ Publicado
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.modalButtonCancel]}
                    onPress={() => setShowCreateEventModal(false)}
                  >
                    <Text style={styles.modalButtonTextCancel}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.modalButtonConfirm]}
                    onPress={() => {
                      console.log('Create Event button pressed');
                      handleCreateEvent();
                    }}
                  >
                    <Text style={styles.modalButtonTextConfirm}>Crear Evento</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </View>
        </Modal>

        {/* Attendees Modal */}
        <Modal
          visible={showAttendeesModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowAttendeesModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.attendeesModalContent}>
              <View style={styles.attendeesModalHeader}>
                <Text style={styles.attendeesModalTitle}>
                  Asistentes del Evento
                </Text>
                <TouchableOpacity
                  style={styles.closeModalButton}
                  onPress={() => setShowAttendeesModal(false)}
                >
                  <Text style={styles.closeModalButtonText}>✕</Text>
                </TouchableOpacity>
              </View>

              {selectedEvent && (
                <View style={styles.eventInfoSection}>
                  <Text style={styles.eventInfoTitle}>{selectedEvent.name || `${selectedEvent.type} - ${selectedEvent.city}`}</Text>
                  <Text style={styles.eventInfoDetail}>Fecha: {selectedEvent.date} a las {selectedEvent.time}</Text>
                  <Text style={styles.eventInfoDetail}>Total registrados: {eventAttendees.length}</Text>
                </View>
              )}

              {loadingAttendees ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={nospiColors.purpleDark} />
                  <Text style={styles.loadingText}>Cargando asistentes...</Text>
                </View>
              ) : eventAttendees.length === 0 ? (
                <View style={styles.emptyAttendeesContainer}>
                  <Text style={styles.emptyAttendeesText}>No hay usuarios registrados en este evento aún</Text>
                </View>
              ) : (
                <ScrollView style={styles.attendeesList}>
                  {eventAttendees.map((attendee, index) => {
                    const statusColor = attendee.status === 'confirmed' ? '#10B981' : '#F59E0B';
                    const paymentColor = attendee.payment_status === 'paid' ? '#10B981' : '#EF4444';
                    const interestedInText = attendee.users.interested_in === 'hombres' ? 'Hombres' : attendee.users.interested_in === 'mujeres' ? 'Mujeres' : attendee.users.interested_in === 'ambos' ? 'Ambos' : 'No especificado';
                    const genderText = attendee.users.gender === 'hombre' ? 'Hombre' : attendee.users.gender === 'mujer' ? 'Mujer' : 'No especificado';
                    
                    return (
                      <View key={attendee.id} style={styles.attendeeItem}>
                        <View style={styles.attendeeHeader}>
                          <Text style={styles.attendeeNumber}>#{index + 1}</Text>
                          <Text style={styles.attendeeName}>{attendee.users.name}</Text>
                        </View>
                        <Text style={styles.attendeeDetail}>📧 {attendee.users.email}</Text>
                        <Text style={styles.attendeeDetail}>📱 {attendee.users.phone}</Text>
                        <Text style={styles.attendeeDetail}>📍 {attendee.users.city}, {attendee.users.country}</Text>
                        <Text style={styles.attendeeDetail}>👤 Género: {genderText}</Text>
                        <Text style={styles.attendeeDetail}>💝 Interesado en: {interestedInText}</Text>
                        {attendee.users.age && <Text style={styles.attendeeDetail}>🎂 Edad: {attendee.users.age} años</Text>}
                        <View style={styles.attendeeStatusRow}>
                          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
                            <Text style={styles.statusBadgeText}>{attendee.status}</Text>
                          </View>
                          <View style={[styles.statusBadge, { backgroundColor: paymentColor }]}>
                            <Text style={styles.statusBadgeText}>
                              {attendee.payment_status === 'paid' ? 'Pagado' : 'Pendiente'}
                            </Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>
      </LinearGradient>
    </>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: nospiColors.purpleDark,
  },
  passwordContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  passwordTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 8,
  },
  passwordSubtitle: {
    fontSize: 16,
    color: nospiColors.purpleDark,
    opacity: 0.8,
    marginBottom: 32,
  },
  passwordInput: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: nospiColors.purpleLight,
  },
  passwordButton: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: nospiColors.purpleDark,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  passwordButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  backButton: {
    padding: 12,
  },
  backButtonText: {
    color: nospiColors.purpleDark,
    fontSize: 16,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingTop: Platform.OS === 'android' ? 48 : 0,
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: nospiColors.purpleDark,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  tabTextActive: {
    color: nospiColors.purpleDark,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 24,
    paddingBottom: 100,
  },
  dashboardContainer: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 24,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8,
    marginBottom: 32,
  },
  statCard: {
    width: '48%',
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    margin: 8,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '600',
  },
  quickActions: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  quickActionsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 16,
  },
  actionButton: {
    backgroundColor: nospiColors.purpleDark,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  actionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  actionButtonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: nospiColors.purpleDark,
  },
  actionButtonTextSecondary: {
    color: nospiColors.purpleDark,
    fontSize: 16,
    fontWeight: 'bold',
  },
  listContainer: {
    flex: 1,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  createButton: {
    backgroundColor: nospiColors.purpleDark,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  createButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  listItem: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  listItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  listItemTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    flex: 1,
  },
  listItemDetail: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  codeHighlight: {
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
    borderWidth: 2,
    borderColor: '#F59E0B',
  },
  codeLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#92400E',
    marginBottom: 4,
  },
  codeValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#92400E',
    letterSpacing: 2,
  },
  ageRangeHighlight: {
    backgroundColor: '#E0E7FF',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    borderWidth: 2,
    borderColor: '#6366F1',
  },
  ageRangeLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#3730A3',
    marginBottom: 4,
  },
  ageRangeValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#3730A3',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  viewAttendeesButton: {
    backgroundColor: nospiColors.purpleMid,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  viewAttendeesButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  sendNotificationButton: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  sendNotificationButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  listItemCompact: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: nospiColors.purpleMid,
  },
  compactInfoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  compactInfoText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  deleteButton: {
    backgroundColor: '#EF4444',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  deleteButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  deleteUserButton: {
    backgroundColor: '#DC2626',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  deleteUserButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  revealLocationButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  revealLocationButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  markFullButton: {
    backgroundColor: '#F59E0B',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  markFullButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  showAgainButton: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  showAgainButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  fullBadge: {
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    borderWidth: 2,
    borderColor: '#F59E0B',
  },
  fullBadgeText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#92400E',
    textAlign: 'center',
  },
  revealedBadge: {
    backgroundColor: '#DBEAFE',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    borderWidth: 2,
    borderColor: '#3B82F6',
  },
  revealedBadgeText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1E40AF',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalScrollContent: {
    padding: 24,
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 500,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: nospiColors.purpleDark,
    marginBottom: 8,
    marginTop: 12,
  },
  requiredLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
  },
  inputHint: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  defaultHint: {
    fontSize: 12,
    color: '#92400E',
    marginTop: 4,
    fontStyle: 'italic',
  },
  input: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  highlightedSection: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    marginBottom: 12,
    borderWidth: 3,
    borderColor: '#F59E0B',
  },
  highlightedInput: {
    backgroundColor: 'white',
    borderWidth: 2,
    borderColor: nospiColors.purpleMid,
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 2,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  typeSelector: {
    flexDirection: 'row',
    gap: 12,
  },
  typeButton: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  typeButtonActive: {
    backgroundColor: nospiColors.purpleLight,
    borderColor: nospiColors.purpleDark,
  },
  typeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  typeButtonTextActive: {
    color: nospiColors.purpleDark,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  modalButton: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: '#F3F4F6',
  },
  modalButtonConfirm: {
    backgroundColor: nospiColors.purpleDark,
  },
  modalButtonTextCancel: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalButtonTextConfirm: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  attendeesModalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    width: '90%',
    maxWidth: 600,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  attendeesModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  attendeesModalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
  },
  closeModalButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeModalButtonText: {
    fontSize: 20,
    color: '#6B7280',
    fontWeight: 'bold',
  },
  eventInfoSection: {
    padding: 20,
    backgroundColor: nospiColors.purpleLight,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  eventInfoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 8,
  },
  eventInfoDetail: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  emptyAttendeesContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyAttendeesText: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  attendeesList: {
    flex: 1,
    padding: 20,
  },
  attendeeItem: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  attendeeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  attendeeNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: nospiColors.purpleMid,
    marginRight: 8,
  },
  attendeeName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    flex: 1,
  },
  attendeeDetail: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  attendeeStatusRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  datePickerButton: {
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  datePickerButtonText: {
    fontSize: 16,
    color: '#333',
  },
});
