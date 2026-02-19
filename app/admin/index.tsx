
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Modal, Platform, Alert } from 'react-native';
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

  // Event creation modal
  const [showCreateEventModal, setShowCreateEventModal] = useState(false);
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

      // Load events - FIXED: Removed attendance_code which doesn't exist
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('id, name, city, description, type, date, time, location, location_name, location_address, maps_link, is_location_revealed, address, start_time, max_participants, current_participants, status, event_status, confirmation_code')
        .order('date', { ascending: false });

      if (eventsError) {
        console.error('Error loading events:', eventsError);
      } else {
        console.log('✅ Events loaded successfully:', eventsData?.length || 0);
        console.log('Events with status:', eventsData?.map(e => ({ id: e.id, name: e.name, event_status: e.event_status })));
        setEvents(eventsData || []);
        setTotalEvents(eventsData?.length || 0);
        const activeCount = eventsData?.filter(e => e.event_status === 'published').length || 0;
        setActiveEvents(activeCount);
      }

      // Load users
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('id, name, email, phone, city, country')
        .order('name', { ascending: true });

      if (usersError) {
        console.error('Error loading users:', usersError);
      } else {
        setUsers(usersData || []);
        setTotalUsers(usersData?.length || 0);
      }

      // Load appointments
      const { data: appointmentsData, error: appointmentsError } = await supabase
        .from('appointments')
        .select(`
          id,
          user_id,
          event_id,
          status,
          payment_status,
          created_at,
          users!inner (
            id,
            name,
            email,
            phone,
            city,
            country
          ),
          events!inner (
            id,
            name,
            city,
            type,
            date,
            time,
            location,
            address,
            start_time,
            max_participants,
            current_participants,
            status,
            event_status,
            confirmation_code
          )
        `)
        .order('created_at', { ascending: false });

      if (appointmentsError) {
        console.error('Error loading appointments:', appointmentsError);
      } else {
        setAppointments(appointmentsData || []);
        setTotalAppointments(appointmentsData?.length || 0);
      }

      console.log('Dashboard data loaded successfully');
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEvent = async () => {
    try {
      console.log('Creating new event:', newEvent);

      // Validate required fields
      if (!newEvent.name || !newEvent.city || !newEvent.date || !newEvent.time) {
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

      const eventData = {
        name: newEvent.name,
        city: newEvent.city,
        description: newEvent.description,
        type: newEvent.type,
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

      // CRITICAL: Check if data was actually returned
      if (!data || data.length === 0) {
        console.error('⚠️ INSERT RETURNED NO DATA - Event was NOT created!');
        Alert.alert('Error', 'El evento NO fue creado. Por favor verifica las políticas RLS y los logs de la base de datos.');
        return;
      }

      console.log('✅ Event created successfully:', data);
      console.log('Created event ID:', data[0].id);
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

          return (
            <View key={event.id} style={styles.listItem}>
              <View style={styles.listItemHeader}>
                <Text style={styles.listItemTitle}>{event.name || `${eventTypeText} - ${event.city}`}</Text>
                <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
                  <Text style={styles.statusBadgeText}>{statusText}</Text>
                </View>
              </View>
              <Text style={styles.listItemDetail}>Ciudad: {event.city}</Text>
              <Text style={styles.listItemDetail}>Fecha: {event.date} a las {event.time}</Text>
              {event.description && (
                <Text style={styles.listItemDetail}>Descripción: {event.description}</Text>
              )}
              <Text style={styles.listItemDetail}>
                Participantes: {event.current_participants}/{event.max_participants}
              </Text>
              <View style={styles.codeHighlight}>
                <Text style={styles.codeLabel}>🔑 Código de confirmación:</Text>
                <Text style={styles.codeValue}>{confirmationCode}</Text>
              </View>
              {event.location_name && (
                <Text style={styles.listItemDetail}>Lugar: {event.location_name}</Text>
              )}
              {event.location_address && (
                <Text style={styles.listItemDetail}>Dirección: {event.location_address}</Text>
              )}
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

  const renderUsers = () => {
    return (
      <View style={styles.listContainer}>
        <Text style={styles.sectionTitle}>Usuarios Registrados</Text>
        {users.map((user) => (
          <View key={user.id} style={styles.listItem}>
            <Text style={styles.listItemTitle}>{user.name}</Text>
            <Text style={styles.listItemDetail}>Email: {user.email}</Text>
            <Text style={styles.listItemDetail}>Teléfono: {user.phone}</Text>
            <Text style={styles.listItemDetail}>
              Ubicación: {user.city}, {user.country}
            </Text>
          </View>
        ))}
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
                    onPress={handleCreateEvent}
                  >
                    <Text style={styles.modalButtonTextConfirm}>Crear Evento</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
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
});
