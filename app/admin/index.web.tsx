
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Modal, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { Stack, useRouter } from 'expo-router';

console.log('Admin panel web module loaded');

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
  attendance_code: string | null;
}

interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  country: string;
  interested_in: string;
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

interface EventParticipant {
  id: string;
  event_id: string;
  user_id: string;
  confirmed: boolean;
  check_in_time: string | null;
  is_presented: boolean;
  presented_at: string | null;
  users: User;
}

type AdminView = 'dashboard' | 'events' | 'users' | 'appointments' | 'realtime';

export default function AdminPanelScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
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
  const [eventParticipants, setEventParticipants] = useState<EventParticipant[]>([]);

  // Event creation/edit modal
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventForm, setEventForm] = useState({
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
    is_location_revealed: false,
    event_status: 'draft' as 'draft' | 'published' | 'closed',
    confirmation_code: '1986',
  });

  // Realtime monitoring
  const [selectedEventForMonitoring, setSelectedEventForMonitoring] = useState<string | null>(null);

  useEffect(() => {
    console.log('Admin panel component mounted');
    console.log('isAuthenticated:', isAuthenticated);
    console.log('showPasswordModal:', showPasswordModal);
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      console.log('User authenticated, loading dashboard data');
      loadDashboardData();
    }
  }, [isAuthenticated, currentView]);

  // Realtime subscription for events table (to auto-refresh when events are created/updated)
  useEffect(() => {
    if (!isAuthenticated) return;

    console.log('=== ADMIN EVENTS REALTIME SUBSCRIPTION SETUP ===');

    const eventsChannel = supabase
      .channel('admin_events_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'events',
        },
        (payload) => {
          console.log('=== ADMIN EVENTS REALTIME UPDATE RECEIVED ===');
          console.log('Event:', payload.eventType);
          console.log('Payload:', JSON.stringify(payload, null, 2));
          
          // Reload dashboard data when events change
          loadDashboardData();
        }
      )
      .subscribe((status) => {
        console.log('Admin events realtime subscription status:', status);
      });

    return () => {
      console.log('Cleaning up admin events realtime subscription');
      supabase.removeChannel(eventsChannel);
    };
  }, [isAuthenticated]);

  // Realtime subscription for event participants
  useEffect(() => {
    if (!isAuthenticated || !selectedEventForMonitoring) return;

    console.log('=== ADMIN REALTIME SUBSCRIPTION SETUP ===');
    console.log('Monitoring event ID:', selectedEventForMonitoring);

    const channel = supabase
      .channel(`admin_event_${selectedEventForMonitoring}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'event_participants',
          filter: `event_id=eq.${selectedEventForMonitoring}`,
        },
        (payload) => {
          console.log('=== ADMIN REALTIME UPDATE RECEIVED ===');
          console.log('Payload:', JSON.stringify(payload, null, 2));
          loadEventParticipants(selectedEventForMonitoring);
        }
      )
      .subscribe((status) => {
        console.log('Admin realtime subscription status:', status);
      });

    return () => {
      console.log('Cleaning up admin realtime subscription');
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated, selectedEventForMonitoring]);

  const handlePasswordSubmit = () => {
    console.log('Admin authentication attempt');
    if (adminPassword === 'nospi2024') {
      console.log('Admin authenticated successfully');
      setIsAuthenticated(true);
      setShowPasswordModal(false);
      loadDashboardData();
    } else {
      window.alert('Contraseña incorrecta');
    }
  };

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      console.log('Loading admin dashboard data...');

      // Load events - EXPLICITLY including confirmation_code
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('id, name, city, description, type, date, time, location, location_name, location_address, maps_link, is_location_revealed, address, start_time, max_participants, current_participants, status, event_status, confirmation_code, attendance_code')
        .order('date', { ascending: false });

      if (eventsError) {
        console.error('Error loading events:', eventsError);
      } else {
        console.log('Events loaded:', eventsData?.length);
        setEvents(eventsData || []);
        setTotalEvents(eventsData?.length || 0);
        const activeCount = eventsData?.filter(e => e.event_status === 'published').length || 0;
        setActiveEvents(activeCount);
      }

      // Load users - EXPLICITLY including interested_in
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('id, name, email, phone, city, country, interested_in')
        .order('name', { ascending: true });

      if (usersError) {
        console.error('Error loading users:', usersError);
      } else {
        console.log('Users loaded:', usersData?.length);
        setUsers(usersData || []);
        setTotalUsers(usersData?.length || 0);
      }

      // Load appointments - EXPLICITLY including interested_in in users join
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
            country,
            interested_in
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
        console.log('Appointments loaded:', appointmentsData?.length);
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

  const loadEventParticipants = async (eventId: string) => {
    try {
      console.log('=== ADMIN LOADING PARTICIPANTS ===');
      console.log('Event ID:', eventId);
      
      // EXPLICITLY including interested_in in users join
      const { data, error } = await supabase
        .from('event_participants')
        .select(`
          id,
          event_id,
          user_id,
          confirmed,
          check_in_time,
          is_presented,
          presented_at,
          users (
            id,
            name,
            email,
            phone,
            city,
            country,
            interested_in
          )
        `)
        .eq('event_id', eventId)
        .order('check_in_time', { ascending: false });

      if (error) {
        console.error('Error loading event participants:', error);
        return;
      }

      console.log('Participants loaded:', data?.length);
      setEventParticipants(data || []);
    } catch (error) {
      console.error('Failed to load event participants:', error);
    }
  };

  const openCreateEventModal = () => {
    console.log('Opening create event modal');
    setEditingEventId(null);
    setEventForm({
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
      is_location_revealed: false,
      event_status: 'draft',
      confirmation_code: '1986',
    });
    setShowEventModal(true);
  };

  const openEditEventModal = (event: Event) => {
    console.log('Opening edit event modal for:', event.id);
    setEditingEventId(event.id);
    
    // Extract date and time from start_time if available
    let dateValue = '';
    let timeValue = '';
    
    if (event.start_time) {
      const startDate = new Date(event.start_time);
      dateValue = startDate.toISOString().split('T')[0];
      const hours = startDate.getHours().toString().padStart(2, '0');
      const minutes = startDate.getMinutes().toString().padStart(2, '0');
      timeValue = `${hours}:${minutes}`;
    } else if (event.date && event.time) {
      dateValue = event.date;
      timeValue = event.time;
    }
    
    setEventForm({
      name: event.name || '',
      city: event.city || '',
      description: event.description || '',
      type: event.type || 'bar',
      date: dateValue,
      time: timeValue,
      location_name: event.location_name || '',
      location_address: event.location_address || '',
      maps_link: event.maps_link || '',
      max_participants: event.max_participants || 6,
      is_location_revealed: event.is_location_revealed || false,
      event_status: event.event_status || 'draft',
      confirmation_code: event.confirmation_code || '1986',
    });
    setShowEventModal(true);
  };

  const handleSaveEvent = async () => {
    console.log('handleSaveEvent called');
    console.log('Current eventForm state:', eventForm);

    try {
      // Validate required fields
      if (!eventForm.name || !eventForm.city) {
        console.log('Validation failed - missing name or city');
        window.alert('Por favor completa el nombre y la ciudad del evento');
        return;
      }

      // Validate date and time are defined
      if (!eventForm.date || !eventForm.time) {
        console.log('Validation failed - missing date or time');
        window.alert('Debes seleccionar fecha y hora válidas antes de guardar el evento.');
        return;
      }

      // Validate and set default confirmation code
      let finalConfirmationCode = eventForm.confirmation_code.trim();
      if (!finalConfirmationCode) {
        console.log('Confirmation code empty, using default: 1986');
        finalConfirmationCode = '1986';
      }

      // Combine date and time in ISO format
      const combinedDateString = `${eventForm.date}T${eventForm.time}:00`;
      const combinedDate = new Date(combinedDateString);

      // Validate the date is valid
      if (isNaN(combinedDate.getTime())) {
        console.log('Validation failed - invalid date/time');
        window.alert('Fecha u hora inválida.');
        return;
      }

      const isoDate = combinedDate.toISOString();

      const eventData = {
        name: eventForm.name,
        city: eventForm.city,
        description: eventForm.description,
        type: eventForm.type,
        date: isoDate,
        time: eventForm.time,
        location: eventForm.is_location_revealed && eventForm.location_name 
          ? eventForm.location_name 
          : 'Se revelará próximamente',
        location_name: eventForm.location_name,
        location_address: eventForm.location_address,
        maps_link: eventForm.maps_link,
        start_time: isoDate,
        max_participants: eventForm.max_participants,
        current_participants: 0,
        status: 'active',
        is_location_revealed: eventForm.is_location_revealed,
        event_status: eventForm.event_status,
        confirmation_code: finalConfirmationCode,
      };

      console.log('Event data to save:', eventData);

      if (editingEventId) {
        // Update existing event
        console.log('Updating event:', editingEventId);
        const { data, error } = await supabase
          .from('events')
          .update(eventData)
          .eq('id', editingEventId)
          .select();

        if (error) {
          console.error('Error updating event:', error);
          window.alert('Error al actualizar evento: ' + error.message);
          return;
        }

        if (!data || data.length === 0) {
          console.error('Update returned no data');
          window.alert('Advertencia: La actualización no devolvió datos.');
          return;
        }

        console.log('Event updated successfully');
        window.alert('Evento actualizado exitosamente');
      } else {
        // Create new event
        console.log('Creating new event');
        const { data, error } = await supabase
          .from('events')
          .insert([eventData])
          .select();

        if (error) {
          console.error('Error creating event:', error);
          window.alert('Error al crear evento: ' + error.message);
          return;
        }

        if (!data || data.length === 0) {
          console.error('Insert returned no data');
          window.alert('Error: El evento NO fue creado.');
          return;
        }

        console.log('Event created successfully');
        window.alert('Evento creado exitosamente');
      }

      setShowEventModal(false);
      setEditingEventId(null);
      setEventForm({
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
        is_location_revealed: false,
        event_status: 'draft',
        confirmation_code: '1986',
      });
      loadDashboardData();
    } catch (error) {
      console.error('Failed to save event:', error);
      window.alert('Error inesperado: ' + String(error));
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    const confirmed = window.confirm('¿Estás seguro de que quieres eliminar este evento?');
    if (!confirmed) return;

    try {
      console.log('Deleting event:', eventId);
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', eventId);

      if (error) {
        console.error('Error deleting event:', error);
        window.alert('Error al eliminar evento: ' + error.message);
        return;
      }

      console.log('Event deleted successfully');
      window.alert('Evento eliminado exitosamente');
      loadDashboardData();
    } catch (error) {
      console.error('Failed to delete event:', error);
    }
  };

  const handleRevealLocation = async (eventId: string) => {
    const confirmed = window.confirm('¿Revelar la ubicación de este evento?');
    if (!confirmed) return;

    try {
      console.log('Revealing location for event:', eventId);
      
      const { data: eventData, error: fetchError } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .single();

      if (fetchError || !eventData) {
        console.error('Error fetching event:', fetchError);
        window.alert('Error al obtener datos del evento');
        return;
      }

      const { error } = await supabase
        .from('events')
        .update({ 
          is_location_revealed: true,
          location: eventData.location_name || 'Ubicación revelada'
        })
        .eq('id', eventId);

      if (error) {
        console.error('Error revealing location:', error);
        window.alert('Error al revelar ubicación: ' + error.message);
        return;
      }

      console.log('Location revealed successfully');
      window.alert('Ubicación revelada exitosamente');
      loadDashboardData();
    } catch (error) {
      console.error('Failed to reveal location:', error);
    }
  };

  const handleCloseEvent = async (eventId: string) => {
    const confirmed = window.confirm('¿Cerrar este evento?');
    if (!confirmed) return;

    try {
      console.log('Closing event:', eventId);
      const { error } = await supabase
        .from('events')
        .update({ event_status: 'closed' })
        .eq('id', eventId);

      if (error) {
        console.error('Error closing event:', error);
        window.alert('Error al cerrar evento: ' + error.message);
        return;
      }

      console.log('Event closed successfully');
      window.alert('Evento cerrado exitosamente');
      loadDashboardData();
    } catch (error) {
      console.error('Failed to close event:', error);
    }
  };

  const handlePublishEvent = async (eventId: string) => {
    const confirmed = window.confirm('¿Publicar este evento?');
    if (!confirmed) return;

    try {
      console.log('Publishing event:', eventId);
      const { error } = await supabase
        .from('events')
        .update({ event_status: 'published' })
        .eq('id', eventId);

      if (error) {
        console.error('Error publishing event:', error);
        window.alert('Error al publicar evento: ' + error.message);
        return;
      }

      console.log('Event published successfully');
      window.alert('Evento publicado exitosamente');
      loadDashboardData();
    } catch (error) {
      console.error('Failed to publish event:', error);
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
            onPress={openCreateEventModal}
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
            onPress={() => setCurrentView('realtime')}
          >
            <Text style={styles.actionButtonTextSecondary}>Monitoreo en Tiempo Real</Text>
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
            onPress={openCreateEventModal}
          >
            <Text style={styles.createButtonText}>+ Crear Evento</Text>
          </TouchableOpacity>
        </View>

        {events.map((event) => {
          const eventTypeText = event.type === 'bar' ? 'Bar' : 'Restaurante';
          const statusText = event.event_status === 'published' ? 'Publicado' : event.event_status === 'draft' ? 'Borrador' : 'Cerrado';
          const statusColor = event.event_status === 'published' ? '#10B981' : event.event_status === 'draft' ? '#F59E0B' : '#EF4444';
          const locationRevealed = event.is_location_revealed ? 'Sí' : 'No';
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
              <Text style={styles.listItemDetail}>Descripción: {event.description || 'Sin descripción'}</Text>
              <Text style={styles.listItemDetail}>
                Participantes configurados: {event.max_participants}
              </Text>
              <View style={styles.codeHighlight}>
                <Text style={styles.codeLabel}>🔑 Código de confirmación:</Text>
                <Text style={styles.codeValue}>{confirmationCode}</Text>
              </View>
              <Text style={styles.listItemDetail}>Ubicación revelada: {locationRevealed}</Text>
              {event.location_name && (
                <Text style={styles.listItemDetail}>Lugar: {event.location_name}</Text>
              )}
              {event.location_address && (
                <Text style={styles.listItemDetail}>Dirección: {event.location_address}</Text>
              )}
              <View style={styles.eventActions}>
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={() => openEditEventModal(event)}
                >
                  <Text style={styles.editButtonText}>✏️ Editar</Text>
                </TouchableOpacity>
                {event.event_status === 'draft' && (
                  <TouchableOpacity
                    style={styles.publishButton}
                    onPress={() => handlePublishEvent(event.id)}
                  >
                    <Text style={styles.publishButtonText}>Publicar</Text>
                  </TouchableOpacity>
                )}
                {event.event_status === 'published' && !event.is_location_revealed && (
                  <TouchableOpacity
                    style={styles.revealButton}
                    onPress={() => handleRevealLocation(event.id)}
                  >
                    <Text style={styles.revealButtonText}>Revelar Ubicación</Text>
                  </TouchableOpacity>
                )}
                {event.event_status === 'published' && (
                  <TouchableOpacity
                    style={styles.closeButton}
                    onPress={() => handleCloseEvent(event.id)}
                  >
                    <Text style={styles.closeButtonText}>Cerrar Evento</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.monitorButton}
                  onPress={() => {
                    setSelectedEventForMonitoring(event.id);
                    loadEventParticipants(event.id);
                    setCurrentView('realtime');
                  }}
                >
                  <Text style={styles.monitorButtonText}>Monitorear</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDeleteEvent(event.id)}
                >
                  <Text style={styles.deleteButtonText}>Eliminar</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  const renderUsers = () => {
    return (
      <View style={styles.listContainer}>
        <Text style={styles.sectionTitle}>Usuarios Registrados ({users.length})</Text>
        <View style={styles.tableContainer}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, { flex: 2 }]}>Nombre</Text>
            <Text style={[styles.tableHeaderText, { flex: 2 }]}>Email</Text>
            <Text style={[styles.tableHeaderText, { flex: 1 }]}>Teléfono</Text>
            <Text style={[styles.tableHeaderText, { flex: 1 }]}>Ciudad</Text>
            <Text style={[styles.tableHeaderText, { flex: 1 }]}>Interesado en</Text>
          </View>
          {users.map((user) => {
            const interestedInText = user.interested_in === 'hombres' ? 'Hombres' : user.interested_in === 'mujeres' ? 'Mujeres' : user.interested_in === 'ambos' ? 'Ambos' : 'No especificado';
            
            return (
              <View key={user.id} style={styles.tableRow}>
                <Text style={[styles.tableCell, { flex: 2 }]}>{user.name}</Text>
                <Text style={[styles.tableCell, { flex: 2 }]}>{user.email}</Text>
                <Text style={[styles.tableCell, { flex: 1 }]}>{user.phone}</Text>
                <Text style={[styles.tableCell, { flex: 1 }]}>{user.city}</Text>
                <Text style={[styles.tableCell, { flex: 1 }]}>{interestedInText}</Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const renderAppointments = () => {
    return (
      <View style={styles.listContainer}>
        <Text style={styles.sectionTitle}>Citas y Reservas ({appointments.length})</Text>
        {appointments.map((appointment) => {
          const statusColor = appointment.status === 'confirmed' ? '#10B981' : '#F59E0B';
          const paymentColor = appointment.payment_status === 'paid' ? '#10B981' : '#EF4444';
          const confirmationCode = appointment.events.confirmation_code || '1986';
          const interestedInText = appointment.users.interested_in === 'hombres' ? 'Hombres' : appointment.users.interested_in === 'mujeres' ? 'Mujeres' : appointment.users.interested_in === 'ambos' ? 'Ambos' : 'No especificado';

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
              <Text style={styles.listItemDetail}>Interesado en: {interestedInText}</Text>
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

  const renderRealtime = () => {
    const selectedEvent = events.find(e => e.id === selectedEventForMonitoring);
    const confirmedCount = eventParticipants.filter(p => p.confirmed).length;
    const presentedCount = eventParticipants.filter(p => p.is_presented).length;

    return (
      <View style={styles.listContainer}>
        <Text style={styles.sectionTitle}>Monitoreo en Tiempo Real</Text>
        
        {!selectedEventForMonitoring ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>Selecciona un evento para monitorear</Text>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => setCurrentView('events')}
            >
              <Text style={styles.actionButtonText}>Ver Eventos</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.realtimeHeader}>
              <View style={styles.realtimeEventInfo}>
                <Text style={styles.realtimeEventTitle}>
                  {selectedEvent?.name || `${selectedEvent?.type === 'bar' ? 'Bar' : 'Restaurante'} - ${selectedEvent?.city}`}
                </Text>
                <Text style={styles.realtimeEventDate}>
                  {selectedEvent?.date} a las {selectedEvent?.time}
                </Text>
                <View style={styles.codeHighlight}>
                  <Text style={styles.codeLabel}>🔑 Código:</Text>
                  <Text style={styles.codeValue}>{selectedEvent?.confirmation_code || '1986'}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.refreshButton}
                onPress={() => selectedEventForMonitoring && loadEventParticipants(selectedEventForMonitoring)}
              >
                <Text style={styles.refreshButtonText}>🔄 Actualizar</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.realtimeStats}>
              <View style={styles.realtimeStat}>
                <Text style={styles.realtimeStatValue}>{eventParticipants.length}</Text>
                <Text style={styles.realtimeStatLabel}>Total Inscritos</Text>
              </View>
              <View style={styles.realtimeStat}>
                <Text style={[styles.realtimeStatValue, { color: '#10B981' }]}>{confirmedCount}</Text>
                <Text style={styles.realtimeStatLabel}>Confirmados</Text>
              </View>
              <View style={styles.realtimeStat}>
                <Text style={[styles.realtimeStatValue, { color: '#8B5CF6' }]}>{presentedCount}</Text>
                <Text style={styles.realtimeStatLabel}>Presentados</Text>
              </View>
            </View>

            <View style={styles.participantsList}>
              <Text style={styles.participantsListTitle}>Participantes</Text>
              {eventParticipants.length === 0 ? (
                <View style={styles.emptyParticipants}>
                  <Text style={styles.emptyParticipantsText}>No hay participantes confirmados aún</Text>
                </View>
              ) : (
                eventParticipants.map((participant) => {
                  const checkInTime = participant.check_in_time 
                    ? new Date(participant.check_in_time).toLocaleTimeString('es-ES')
                    : 'No confirmado';
                  const interestedInText = participant.users?.interested_in === 'hombres' ? 'Hombres' : participant.users?.interested_in === 'mujeres' ? 'Mujeres' : participant.users?.interested_in === 'ambos' ? 'Ambos' : 'No especificado';

                  return (
                    <View key={participant.id} style={styles.participantItem}>
                      <View style={styles.participantInfo}>
                        <Text style={styles.participantName}>{participant.users?.name || 'Usuario'}</Text>
                        <Text style={styles.participantEmail}>{participant.users?.email || 'Sin email'}</Text>
                        <Text style={styles.participantPhone}>{participant.users?.phone || 'Sin teléfono'}</Text>
                        <Text style={styles.participantCity}>{participant.users?.city || 'Sin ciudad'}</Text>
                        <Text style={styles.participantInterest}>Interesado en: {interestedInText}</Text>
                        <Text style={styles.participantCheckIn}>Check-in: {checkInTime}</Text>
                      </View>
                      <View style={styles.participantStatus}>
                        {participant.confirmed && (
                          <View style={[styles.statusBadge, { backgroundColor: '#10B981' }]}>
                            <Text style={styles.statusBadgeText}>✓ Confirmado</Text>
                          </View>
                        )}
                        {participant.is_presented && (
                          <View style={[styles.statusBadge, { backgroundColor: '#8B5CF6', marginTop: 4 }]}>
                            <Text style={styles.statusBadgeText}>★ Presentado</Text>
                          </View>
                        )}
                        {!participant.confirmed && (
                          <View style={[styles.statusBadge, { backgroundColor: '#9CA3AF' }]}>
                            <Text style={styles.statusBadgeText}>Pendiente</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </>
        )}
      </View>
    );
  };

  console.log('Rendering admin panel, showPasswordModal:', showPasswordModal, 'isAuthenticated:', isAuthenticated);

  if (showPasswordModal) {
    return (
      <View style={styles.fullScreenContainer}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.passwordContainer}>
          <Text style={styles.passwordTitle}>🔐 Panel de Administración</Text>
          <Text style={styles.passwordSubtitle}>Ingresa la contraseña de administrador</Text>
          <TextInput
            style={styles.passwordInput}
            placeholder="Contraseña"
            secureTextEntry
            value={adminPassword}
            onChangeText={setAdminPassword}
            autoCapitalize="none"
            onSubmitEditing={handlePasswordSubmit}
          />
          <TouchableOpacity style={styles.passwordButton} onPress={handlePasswordSubmit}>
            <Text style={styles.passwordButtonText}>Acceder</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>← Volver</Text>
          </TouchableOpacity>
          <Text style={styles.passwordHint}>Contraseña por defecto: nospi2024</Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.fullScreenContainer}>
        <Stack.Screen options={{ title: 'Panel de Administración' }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={nospiColors.purpleDark} />
          <Text style={styles.loadingText}>Cargando datos...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.fullScreenContainer}>
      <Stack.Screen options={{ title: 'Panel de Administración - Nospi' }} />
      <View style={styles.container}>
        {/* Navigation Tabs */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, currentView === 'dashboard' && styles.tabActive]}
            onPress={() => setCurrentView('dashboard')}
          >
            <Text style={[styles.tabText, currentView === 'dashboard' && styles.tabTextActive]}>
              📊 Dashboard
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, currentView === 'events' && styles.tabActive]}
            onPress={() => setCurrentView('events')}
          >
            <Text style={[styles.tabText, currentView === 'events' && styles.tabTextActive]}>
              🎉 Eventos
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, currentView === 'users' && styles.tabActive]}
            onPress={() => setCurrentView('users')}
          >
            <Text style={[styles.tabText, currentView === 'users' && styles.tabTextActive]}>
              👥 Usuarios
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, currentView === 'appointments' && styles.tabActive]}
            onPress={() => setCurrentView('appointments')}
          >
            <Text style={[styles.tabText, currentView === 'appointments' && styles.tabTextActive]}>
              📅 Citas
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, currentView === 'realtime' && styles.tabActive]}
            onPress={() => setCurrentView('realtime')}
          >
            <Text style={[styles.tabText, currentView === 'realtime' && styles.tabTextActive]}>
              🔴 En Vivo
            </Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          {currentView === 'dashboard' && renderDashboard()}
          {currentView === 'events' && renderEvents()}
          {currentView === 'users' && renderUsers()}
          {currentView === 'appointments' && renderAppointments()}
          {currentView === 'realtime' && renderRealtime()}
        </ScrollView>
      </View>

      {/* Create/Edit Event Modal */}
      <Modal
        visible={showEventModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          console.log('Modal close requested');
          setShowEventModal(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalScrollContent}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>
                {editingEventId ? 'Editar Evento' : 'Crear Nuevo Evento'}
              </Text>

              <Text style={styles.inputLabel}>Nombre del Evento *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: Encuentro de Solteros"
                value={eventForm.name}
                onChangeText={(text) => setEventForm({ ...eventForm, name: text })}
              />

              <Text style={styles.inputLabel}>Ciudad *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: Bogotá"
                value={eventForm.city}
                onChangeText={(text) => setEventForm({ ...eventForm, city: text })}
              />

              <Text style={styles.inputLabel}>Descripción Breve</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Descripción del evento"
                value={eventForm.description}
                onChangeText={(text) => setEventForm({ ...eventForm, description: text })}
                multiline
                numberOfLines={3}
              />

              <Text style={styles.inputLabel}>Tipo de Evento</Text>
              <View style={styles.typeSelector}>
                <TouchableOpacity
                  style={[
                    styles.typeButton,
                    eventForm.type === 'bar' && styles.typeButtonActive,
                  ]}
                  onPress={() => setEventForm({ ...eventForm, type: 'bar' })}
                >
                  <Text
                    style={[
                      styles.typeButtonText,
                      eventForm.type === 'bar' && styles.typeButtonTextActive,
                    ]}
                  >
                    🍸 Bar
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.typeButton,
                    eventForm.type === 'restaurant' && styles.typeButtonActive,
                  ]}
                  onPress={() => setEventForm({ ...eventForm, type: 'restaurant' })}
                >
                  <Text
                    style={[
                      styles.typeButtonText,
                      eventForm.type === 'restaurant' && styles.typeButtonTextActive,
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
                value={eventForm.date}
                onChangeText={(text) => setEventForm({ ...eventForm, date: text })}
              />

              <Text style={styles.inputLabel}>Hora (HH:mm formato 24 horas) *</Text>
              <TextInput
                style={styles.input}
                placeholder="21:15"
                value={eventForm.time}
                onChangeText={(text) => setEventForm({ ...eventForm, time: text })}
              />

              <Text style={styles.inputLabel}>Número de Participantes</Text>
              <TextInput
                style={styles.input}
                placeholder="6"
                keyboardType="numeric"
                value={String(eventForm.max_participants)}
                onChangeText={(text) =>
                  setEventForm({ ...eventForm, max_participants: parseInt(text) || 6 })
                }
              />

              <Text style={styles.inputLabel}>Nombre del Lugar</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: Bar El Encuentro"
                value={eventForm.location_name}
                onChangeText={(text) => setEventForm({ ...eventForm, location_name: text })}
              />

              <Text style={styles.inputLabel}>Dirección del Lugar</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: Calle 85 #15-20"
                value={eventForm.location_address}
                onChangeText={(text) => setEventForm({ ...eventForm, location_address: text })}
              />

              <Text style={styles.inputLabel}>Enlace de Maps</Text>
              <TextInput
                style={styles.input}
                placeholder="https://maps.google.com/..."
                value={eventForm.maps_link}
                onChangeText={(text) => setEventForm({ ...eventForm, maps_link: text })}
              />

              <View style={styles.highlightedSection}>
                <Text style={[styles.inputLabel, styles.requiredLabel]}>🔑 Código de confirmación *</Text>
                <Text style={styles.inputHint}>
                  Los participantes deberán ingresar este código para confirmar su asistencia
                </Text>
                <TextInput
                  style={[styles.input, styles.highlightedInput]}
                  placeholder="Ej: 1986"
                  value={eventForm.confirmation_code}
                  onChangeText={(text) => setEventForm({ ...eventForm, confirmation_code: text })}
                />
                <Text style={styles.defaultHint}>Por defecto: 1986</Text>
              </View>

              <Text style={styles.inputLabel}>Estado del Evento</Text>
              <View style={styles.typeSelector}>
                <TouchableOpacity
                  style={[
                    styles.typeButton,
                    eventForm.event_status === 'draft' && styles.typeButtonActive,
                  ]}
                  onPress={() => setEventForm({ ...eventForm, event_status: 'draft' })}
                >
                  <Text
                    style={[
                      styles.typeButtonText,
                      eventForm.event_status === 'draft' && styles.typeButtonTextActive,
                    ]}
                  >
                    📝 Borrador
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.typeButton,
                    eventForm.event_status === 'published' && styles.typeButtonActive,
                  ]}
                  onPress={() => setEventForm({ ...eventForm, event_status: 'published' })}
                >
                  <Text
                    style={[
                      styles.typeButtonText,
                      eventForm.event_status === 'published' && styles.typeButtonTextActive,
                    ]}
                  >
                    ✅ Publicado
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonCancel]}
                  onPress={() => setShowEventModal(false)}
                >
                  <Text style={styles.modalButtonTextCancel}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonConfirm]}
                  onPress={handleSaveEvent}
                >
                  <Text style={styles.modalButtonTextConfirm}>
                    {editingEventId ? 'Guardar Cambios' : 'Crear Evento'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fullScreenContainer: {
    flex: 1,
    backgroundColor: '#F3E8FF',
  },
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
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: nospiColors.purpleDark,
  },
  passwordContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    maxWidth: 500,
    alignSelf: 'center',
    width: '100%',
  },
  passwordTitle: {
    fontSize: 36,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 8,
    textAlign: 'center',
  },
  passwordSubtitle: {
    fontSize: 18,
    color: nospiColors.purpleDark,
    opacity: 0.8,
    marginBottom: 32,
    textAlign: 'center',
  },
  passwordInput: {
    width: '100%',
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
  passwordHint: {
    marginTop: 24,
    fontSize: 14,
    color: nospiColors.purpleDark,
    opacity: 0.6,
    textAlign: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
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
    maxWidth: 1400,
    alignSelf: 'center',
    width: '100%',
  },
  dashboardContainer: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 32,
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
    width: 'calc(25% - 16px)',
    minWidth: 200,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    margin: 8,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '600',
  },
  quickActions: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  quickActionsTitle: {
    fontSize: 24,
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
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  createButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  listItem: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
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
    fontSize: 20,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    flex: 1,
  },
  listItemDetail: {
    fontSize: 15,
    color: '#6B7280',
    marginBottom: 6,
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
    fontSize: 13,
    fontWeight: 'bold',
  },
  eventActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 16,
  },
  editButton: {
    flex: 1,
    minWidth: 100,
    backgroundColor: '#6366F1',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  editButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  publishButton: {
    flex: 1,
    minWidth: 100,
    backgroundColor: '#10B981',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  publishButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  revealButton: {
    flex: 1,
    minWidth: 100,
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  revealButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  closeButton: {
    flex: 1,
    minWidth: 100,
    backgroundColor: '#F59E0B',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  closeButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  monitorButton: {
    flex: 1,
    minWidth: 100,
    backgroundColor: '#8B5CF6',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  monitorButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  deleteButton: {
    flex: 1,
    minWidth: 100,
    backgroundColor: '#EF4444',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  tableContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: nospiColors.purpleLight,
    padding: 16,
    borderBottomWidth: 2,
    borderBottomColor: nospiColors.purpleMid,
  },
  tableHeaderText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
  },
  tableRow: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tableCell: {
    fontSize: 14,
    color: '#374151',
  },
  realtimeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  realtimeEventInfo: {
    flex: 1,
  },
  realtimeEventTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 4,
  },
  realtimeEventDate: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  refreshButton: {
    backgroundColor: nospiColors.purpleLight,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  refreshButtonText: {
    color: nospiColors.purpleDark,
    fontSize: 14,
    fontWeight: 'bold',
  },
  realtimeStats: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
  },
  realtimeStat: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  realtimeStatValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 8,
  },
  realtimeStatLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '600',
  },
  participantsList: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  participantsListTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 16,
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
  participantItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  participantInfo: {
    flex: 1,
  },
  participantName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 4,
  },
  participantEmail: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 2,
  },
  participantPhone: {
    fontSize: 13,
    color: '#9CA3AF',
    marginBottom: 2,
  },
  participantCity: {
    fontSize: 13,
    color: '#9CA3AF',
    marginBottom: 2,
  },
  participantInterest: {
    fontSize: 13,
    color: '#9CA3AF',
    marginBottom: 2,
  },
  participantCheckIn: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  participantStatus: {
    alignItems: 'flex-end',
  },
  emptyState: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  emptyStateText: {
    fontSize: 18,
    color: '#6B7280',
    marginBottom: 24,
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
    padding: 32,
    width: '100%',
    maxWidth: 600,
  },
  modalTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: nospiColors.purpleDark,
    marginBottom: 8,
    marginTop: 12,
  },
  requiredLabel: {
    fontSize: 18,
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
    padding: 14,
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
    fontSize: 20,
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
    padding: 14,
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
