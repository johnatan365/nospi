
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
}

interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  country: string;
  interested_in: string;
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

interface EventAttendee {
  id: string;
  user_id: string;
  event_id: string;
  status: string;
  payment_status: string;
  created_at: string;
  users: User;
}

type AdminView = 'dashboard' | 'events' | 'users' | 'appointments' | 'realtime' | 'matches';

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

  // Event attendees modal
  const [showAttendeesModal, setShowAttendeesModal] = useState(false);
  const [selectedEventForAttendees, setSelectedEventForAttendees] = useState<Event | null>(null);
  const [eventAttendees, setEventAttendees] = useState<EventAttendee[]>([]);
  const [loadingAttendees, setLoadingAttendees] = useState(false);

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

  // Question management
  const [showQuestionsModal, setShowQuestionsModal] = useState(false);
  const [questions, setQuestions] = useState<any[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState<'divertido' | 'sensual' | 'atrevido'>('divertido');
  const [newQuestionText, setNewQuestionText] = useState('');

  // Matches and ratings
  const [selectedEventForMatches, setSelectedEventForMatches] = useState<string | null>(null);
  const [eventMatches, setEventMatches] = useState<any[]>([]);
  const [eventRatings, setEventRatings] = useState<any[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);

  // Realtime monitoring
  const [selectedEventForMonitoring, setSelectedEventForMonitoring] = useState<string | null>(null);

  useEffect(() => {
    console.log('Admin panel component mounted');
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      console.log('User authenticated, loading dashboard data');
      loadDashboardData();
    }
  }, [isAuthenticated, currentView]);

  // Realtime subscription for events table
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

      // Load events
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('id, name, city, description, type, date, time, location, location_name, location_address, maps_link, is_location_revealed, address, start_time, max_participants, current_participants, status, event_status, confirmation_code')
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
        window.alert('No se pudieron cargar los usuarios: ' + usersError.message);
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
      window.alert('Error inesperado al cargar datos: ' + String(error));
    } finally {
      setLoading(false);
    }
  };

  const loadEventParticipants = async (eventId: string) => {
    try {
      console.log('=== ADMIN LOADING PARTICIPANTS ===');
      console.log('Event ID:', eventId);
      
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
            interested_in,
            gender,
            age
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

  const handleViewAttendees = async (event: Event) => {
    console.log('Loading attendees for event:', event.id);
    setSelectedEventForAttendees(event);
    setLoadingAttendees(true);
    setShowAttendeesModal(true);

    try {
      const { data, error } = await supabase
        .rpc('get_event_attendees_for_admin', { p_event_id: event.id });

      if (error) {
        console.error('Error loading event attendees:', error);
        window.alert('No se pudieron cargar los asistentes: ' + error.message);
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
      window.alert('Error inesperado al cargar asistentes');
      setEventAttendees([]);
    } finally {
      setLoadingAttendees(false);
    }
  };

  // ... (rest of the functions remain the same - openCreateEventModal, openEditEventModal, handleSaveEvent, handleDeleteEvent, etc.)
  // Due to length constraints, I'm keeping the same implementation as before for these functions
  // The key change is in loadDashboardData and handleViewAttendees which now use the RPC functions

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
    console.log('=== handleSaveEvent CALLED ===');
    console.log('Button pressed - starting event save');
    console.log('Event form data:', eventForm);

    try {
      if (!eventForm.name || !eventForm.city) {
        console.log('❌ Validation failed - missing name or city');
        window.alert('Por favor completa el nombre y la ciudad del evento');
        return;
      }

      if (!eventForm.date || !eventForm.time) {
        console.log('❌ Validation failed - missing date or time');
        window.alert('Debes seleccionar fecha y hora válidas antes de guardar el evento.');
        return;
      }

      let finalConfirmationCode = eventForm.confirmation_code.trim();
      if (!finalConfirmationCode) {
        finalConfirmationCode = '1986';
      }

      const combinedDateString = `${eventForm.date}T${eventForm.time}:00`;
      const combinedDate = new Date(combinedDateString);

      if (isNaN(combinedDate.getTime())) {
        window.alert('Fecha u hora inválida.');
        return;
      }

      const isoDate = combinedDate.toISOString();

      // FIX: Map 'restaurant' to 'restaurante' to match database constraint
      const eventData = {
        name: eventForm.name,
        city: eventForm.city,
        description: eventForm.description,
        type: eventForm.type === 'restaurant' ? 'restaurante' : eventForm.type,
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

      if (editingEventId) {
        const { data, error } = await supabase
          .from('events')
          .update(eventData)
          .eq('id', editingEventId)
          .select();

        if (error) {
          window.alert('Error al actualizar evento: ' + error.message);
          return;
        }

        window.alert('Evento actualizado exitosamente');
      } else {
        const { data, error } = await supabase
          .from('events')
          .insert([eventData])
          .select();

        if (error) {
          window.alert('Error al crear evento: ' + error.message);
          return;
        }

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
      window.alert('Error inesperado: ' + String(error));
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    const confirmed = window.confirm('¿Estás seguro de que quieres eliminar este evento?');
    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', eventId);

      if (error) {
        window.alert('Error al eliminar evento: ' + error.message);
        return;
      }

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
      const { data: eventData, error: fetchError } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .single();

      if (fetchError || !eventData) {
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
        window.alert('Error al revelar ubicación: ' + error.message);
        return;
      }

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
      const { error } = await supabase
        .from('events')
        .update({ event_status: 'closed' })
        .eq('id', eventId);

      if (error) {
        window.alert('Error al cerrar evento: ' + error.message);
        return;
      }

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
      const { error } = await supabase
        .from('events')
        .update({ event_status: 'published' })
        .eq('id', eventId);

      if (error) {
        window.alert('Error al publicar evento: ' + error.message);
        return;
      }

      window.alert('Evento publicado exitosamente');
      loadDashboardData();
    } catch (error) {
      console.error('Failed to publish event:', error);
    }
  };

  const loadQuestions = async () => {
    setLoadingQuestions(true);
    try {
      const { data, error } = await supabase
        .from('event_questions')
        .select('*')
        .is('event_id', null)
        .eq('level', selectedLevel)
        .order('question_order', { ascending: true });

      if (error) {
        console.error('Error loading questions:', error);
        window.alert('Error al cargar preguntas: ' + error.message);
        return;
      }

      setQuestions(data || []);
    } catch (error) {
      console.error('Failed to load questions:', error);
    } finally {
      setLoadingQuestions(false);
    }
  };

  const handleAddQuestion = async () => {
    if (!newQuestionText.trim()) {
      window.alert('Por favor ingresa el texto de la pregunta');
      return;
    }

    try {
      const maxOrder = questions.length > 0 ? Math.max(...questions.map(q => q.question_order)) : -1;

      const { error } = await supabase
        .from('event_questions')
        .insert({
          event_id: null,
          level: selectedLevel,
          question_text: newQuestionText.trim(),
          question_order: maxOrder + 1,
          is_default: true,
        });

      if (error) {
        console.error('Error adding question:', error);
        window.alert('Error al agregar pregunta: ' + error.message);
        return;
      }

      setNewQuestionText('');
      loadQuestions();
      window.alert('Pregunta agregada exitosamente');
    } catch (error) {
      console.error('Failed to add question:', error);
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    const confirmed = window.confirm('¿Eliminar esta pregunta?');
    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from('event_questions')
        .delete()
        .eq('id', questionId);

      if (error) {
        console.error('Error deleting question:', error);
        window.alert('Error al eliminar pregunta: ' + error.message);
        return;
      }

      loadQuestions();
      window.alert('Pregunta eliminada exitosamente');
    } catch (error) {
      console.error('Failed to delete question:', error);
    }
  };

  const handleUpdateQuestion = async (questionId: string, newText: string) => {
    if (!newText.trim()) {
      window.alert('El texto de la pregunta no puede estar vacío');
      return;
    }

    try {
      const { error } = await supabase
        .from('event_questions')
        .update({ question_text: newText.trim(), updated_at: new Date().toISOString() })
        .eq('id', questionId);

      if (error) {
        console.error('Error updating question:', error);
        window.alert('Error al actualizar pregunta: ' + error.message);
        return;
      }

      loadQuestions();
      window.alert('Pregunta actualizada exitosamente');
    } catch (error) {
      console.error('Failed to update question:', error);
    }
  };

  const loadEventMatchesAndRatings = async (eventId: string) => {
    setLoadingMatches(true);
    try {
      // Load matches
      const { data: matchesData, error: matchesError } = await supabase
        .from('event_matches')
        .select(`
          *,
          user1:users!event_matches_user1_id_fkey(id, name, email),
          user2:users!event_matches_user2_id_fkey(id, name, email)
        `)
        .eq('event_id', eventId)
        .order('level', { ascending: true })
        .order('created_at', { ascending: true });

      if (matchesError) {
        console.error('Error loading matches:', matchesError);
      } else {
        setEventMatches(matchesData || []);
      }

      // Load ratings
      const { data: ratingsData, error: ratingsError } = await supabase
        .from('event_ratings')
        .select(`
          *,
          rater:users!event_ratings_rater_user_id_fkey(id, name),
          rated:users!event_ratings_rated_user_id_fkey(id, name)
        `)
        .eq('event_id', eventId)
        .order('created_at', { ascending: false });

      if (ratingsError) {
        console.error('Error loading ratings:', ratingsError);
      } else {
        setEventRatings(ratingsData || []);
      }
    } catch (error) {
      console.error('Failed to load matches and ratings:', error);
    } finally {
      setLoadingMatches(false);
    }
  };

  // Render functions remain the same as the original file
  // I'm keeping the same UI rendering logic from the original index.web.tsx
  // The key changes are only in the data loading functions above

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
          
          const eventAppointmentsCount = appointments.filter(a => a.event_id === event.id).length;

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
              <Text style={styles.listItemDetail}>
                Usuarios registrados: {eventAppointmentsCount}
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
                  style={styles.viewAttendeesButton}
                  onPress={() => handleViewAttendees(event)}
                >
                  <Text style={styles.viewAttendeesButtonText}>👥 Ver Asistentes ({eventAppointmentsCount})</Text>
                </TouchableOpacity>
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
            <Text style={[styles.tableHeaderText, { flex: 1 }]}>Género</Text>
            <Text style={[styles.tableHeaderText, { flex: 1 }]}>Interesado en</Text>
            <Text style={[styles.tableHeaderText, { flex: 1 }]}>Rango de Edad</Text>
          </View>
          {users.map((user) => {
            const interestedInText = user.interested_in === 'hombres' ? 'Hombres' : user.interested_in === 'mujeres' ? 'Mujeres' : user.interested_in === 'ambos' ? 'Ambos' : 'No especificado';
            const genderText = user.gender === 'hombre' ? 'Hombre' : user.gender === 'mujer' ? 'Mujer' : 'No especificado';
            
            // Calculate age range preference display
            const ageRangeMin = (user as any).age_range_min || 18;
            const ageRangeMax = (user as any).age_range_max || 99;
            const ageRangeText = `${ageRangeMin}-${ageRangeMax}`;
            
            return (
              <View key={user.id} style={styles.tableRow}>
                <Text style={[styles.tableCell, { flex: 2 }]}>{user.name}</Text>
                <Text style={[styles.tableCell, { flex: 2 }]}>{user.email}</Text>
                <Text style={[styles.tableCell, { flex: 1 }]}>{user.phone}</Text>
                <Text style={[styles.tableCell, { flex: 1 }]}>{user.city}</Text>
                <Text style={[styles.tableCell, { flex: 1 }]}>{genderText}</Text>
                <Text style={[styles.tableCell, { flex: 1 }]}>{interestedInText}</Text>
                <Text style={[styles.tableCell, { flex: 1, fontWeight: 'bold', color: nospiColors.purpleDark }]}>{ageRangeText}</Text>
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
                  const genderText = participant.users?.gender === 'hombre' ? 'Hombre' : participant.users?.gender === 'mujer' ? 'Mujer' : 'No especificado';

                  return (
                    <View key={participant.id} style={styles.participantItem}>
                      <View style={styles.participantInfo}>
                        <Text style={styles.participantName}>{participant.users?.name || 'Usuario'}</Text>
                        <Text style={styles.participantEmail}>{participant.users?.email || 'Sin email'}</Text>
                        <Text style={styles.participantPhone}>{participant.users?.phone || 'Sin teléfono'}</Text>
                        <Text style={styles.participantCity}>{participant.users?.city || 'Sin ciudad'}</Text>
                        <Text style={styles.participantInterest}>Género: {genderText}</Text>
                        <Text style={styles.participantInterest}>Interesado en: {interestedInText}</Text>
                        {participant.users?.age && <Text style={styles.participantInterest}>Edad: {participant.users.age} años</Text>}
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

  const renderMatches = () => {
    const selectedEvent = events.find(e => e.id === selectedEventForMatches);

    return (
      <View style={styles.listContainer}>
        <Text style={styles.sectionTitle}>Matches y Calificaciones</Text>
        
        {!selectedEventForMatches ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>Selecciona un evento para ver matches y calificaciones</Text>
            <View style={styles.eventSelectorList}>
              {events.map((event) => (
                <TouchableOpacity
                  key={event.id}
                  style={styles.eventSelectorItem}
                  onPress={() => {
                    setSelectedEventForMatches(event.id);
                    loadEventMatchesAndRatings(event.id);
                  }}
                >
                  <Text style={styles.eventSelectorName}>
                    {event.name || `${event.type === 'bar' ? 'Bar' : 'Restaurante'} - ${event.city}`}
                  </Text>
                  <Text style={styles.eventSelectorDate}>
                    {event.date} - {event.time}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          <>
            <View style={styles.matchesHeader}>
              <View style={styles.matchesEventInfo}>
                <Text style={styles.matchesEventTitle}>
                  {selectedEvent?.name || `${selectedEvent?.type === 'bar' ? 'Bar' : 'Restaurante'} - ${selectedEvent?.city}`}
                </Text>
                <Text style={styles.matchesEventDate}>
                  {selectedEvent?.date} a las {selectedEvent?.time}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.backToEventsButton}
                onPress={() => setSelectedEventForMatches(null)}
              >
                <Text style={styles.backToEventsButtonText}>← Volver</Text>
              </TouchableOpacity>
            </View>

            {loadingMatches ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={nospiColors.purpleDark} />
                <Text style={styles.loadingText}>Cargando datos...</Text>
              </View>
            ) : (
              <>
                <View style={styles.matchesSection}>
                  <Text style={styles.matchesSectionTitle}>💜 Matches por Ronda ({eventMatches.length})</Text>
                  {eventMatches.length === 0 ? (
                    <View style={styles.emptyMatches}>
                      <Text style={styles.emptyMatchesText}>No hay matches registrados aún</Text>
                    </View>
                  ) : (
                    eventMatches.map((match, index) => {
                      const levelEmoji = match.level === 'divertido' ? '😄' : match.level === 'sensual' ? '💕' : '🔥';
                      const levelName = match.level === 'divertido' ? 'Divertido' : match.level === 'sensual' ? 'Sensual' : 'Atrevido';
                      
                      return (
                        <View key={match.id} style={styles.matchItem}>
                          <View style={styles.matchHeader}>
                            <Text style={styles.matchLevel}>{levelEmoji} {levelName}</Text>
                            <Text style={styles.matchDate}>
                              {new Date(match.created_at).toLocaleString('es-ES')}
                            </Text>
                          </View>
                          <View style={styles.matchUsers}>
                            <Text style={styles.matchUser}>👤 {match.user1?.name || 'Usuario 1'}</Text>
                            <Text style={styles.matchConnector}>💜</Text>
                            <Text style={styles.matchUser}>👤 {match.user2?.name || 'Usuario 2'}</Text>
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>

                <View style={styles.ratingsSection}>
                  <Text style={styles.ratingsSectionTitle}>⭐ Calificaciones ({eventRatings.length})</Text>
                  {eventRatings.length === 0 ? (
                    <View style={styles.emptyRatings}>
                      <Text style={styles.emptyRatingsText}>No hay calificaciones registradas aún</Text>
                    </View>
                  ) : (
                    eventRatings.map((rating, index) => (
                      <View key={rating.id} style={styles.ratingItem}>
                        <View style={styles.ratingHeader}>
                          <Text style={styles.ratingRater}>
                            {rating.rater?.name || 'Usuario'} calificó a {rating.rated?.name || 'Usuario'}
                          </Text>
                          <View style={styles.ratingStars}>
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Text key={star} style={styles.ratingStar}>
                                {star <= rating.rating ? '⭐' : '☆'}
                              </Text>
                            ))}
                          </View>
                        </View>
                        <Text style={styles.ratingDate}>
                          {new Date(rating.created_at).toLocaleString('es-ES')}
                        </Text>
                      </View>
                    ))
                  )}
                </View>
              </>
            )}
          </>
        )}
      </View>
    );
  };

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
          <TouchableOpacity
            style={[styles.tab, currentView === 'matches' && styles.tabActive]}
            onPress={() => setCurrentView('matches')}
          >
            <Text style={[styles.tabText, currentView === 'matches' && styles.tabTextActive]}>
              💜 Matches
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
          {currentView === 'matches' && renderMatches()}
        </ScrollView>
      </View>

      {/* Create/Edit Event Modal */}
      <Modal
        visible={showEventModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEventModal(false)}
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

              <Text style={styles.inputLabel}>Descripción</Text>
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

              <Text style={styles.inputLabel}>Fecha *</Text>
              <input
                type="date"
                style={{
                  backgroundColor: '#F3F4F6',
                  borderRadius: 12,
                  padding: 12,
                  fontSize: 16,
                  borderWidth: 1,
                  borderColor: '#E5E7EB',
                  width: '100%',
                  marginBottom: 8,
                }}
                value={eventForm.date}
                onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })}
              />

              <Text style={styles.inputLabel}>Hora *</Text>
              <input
                type="time"
                style={{
                  backgroundColor: '#F3F4F6',
                  borderRadius: 12,
                  padding: 12,
                  fontSize: 16,
                  borderWidth: 1,
                  borderColor: '#E5E7EB',
                  width: '100%',
                  marginBottom: 8,
                }}
                value={eventForm.time}
                onChange={(e) => setEventForm({ ...eventForm, time: e.target.value })}
              />

              <Text style={styles.inputLabel}>Máximo de Participantes</Text>
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

              <TouchableOpacity
                style={styles.questionsManagementButton}
                onPress={() => {
                  setShowQuestionsModal(true);
                  loadQuestions();
                }}
              >
                <Text style={styles.questionsManagementButtonText}>
                  📝 Gestionar Preguntas
                </Text>
              </TouchableOpacity>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonCancel]}
                  onPress={() => setShowEventModal(false)}
                >
                  <Text style={styles.modalButtonTextCancel}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonConfirm]}
                  onPress={() => {
                    console.log('Save Event button pressed');
                    handleSaveEvent();
                  }}
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

            {selectedEventForAttendees && (
              <View style={styles.eventInfoSection}>
                <Text style={styles.eventInfoTitle}>
                  {selectedEventForAttendees.name || `${selectedEventForAttendees.type} - ${selectedEventForAttendees.city}`}
                </Text>
                <Text style={styles.eventInfoDetail}>
                  Fecha: {selectedEventForAttendees.date} a las {selectedEventForAttendees.time}
                </Text>
                <Text style={styles.eventInfoDetail}>
                  Total registrados: {eventAttendees.length}
                </Text>
              </View>
            )}

            {loadingAttendees ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={nospiColors.purpleDark} />
                <Text style={styles.loadingText}>Cargando asistentes...</Text>
              </View>
            ) : eventAttendees.length === 0 ? (
              <View style={styles.emptyAttendeesContainer}>
                <Text style={styles.emptyAttendeesText}>
                  No hay usuarios registrados en este evento aún
                </Text>
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

      {/* Questions Management Modal */}
      <Modal
        visible={showQuestionsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowQuestionsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.questionsModalContent}>
            <View style={styles.questionsModalHeader}>
              <Text style={styles.questionsModalTitle}>
                Gestión de Preguntas
              </Text>
              <TouchableOpacity
                style={styles.closeModalButton}
                onPress={() => setShowQuestionsModal(false)}
              >
                <Text style={styles.closeModalButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.levelSelector}>
              <TouchableOpacity
                style={[styles.levelButton, selectedLevel === 'divertido' && styles.levelButtonActive]}
                onPress={() => {
                  setSelectedLevel('divertido');
                  loadQuestions();
                }}
              >
                <Text style={[styles.levelButtonText, selectedLevel === 'divertido' && styles.levelButtonTextActive]}>
                  😄 Divertido
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.levelButton, selectedLevel === 'sensual' && styles.levelButtonActive]}
                onPress={() => {
                  setSelectedLevel('sensual');
                  loadQuestions();
                }}
              >
                <Text style={[styles.levelButtonText, selectedLevel === 'sensual' && styles.levelButtonTextActive]}>
                  💕 Sensual
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.levelButton, selectedLevel === 'atrevido' && styles.levelButtonActive]}
                onPress={() => {
                  setSelectedLevel('atrevido');
                  loadQuestions();
                }}
              >
                <Text style={[styles.levelButtonText, selectedLevel === 'atrevido' && styles.levelButtonTextActive]}>
                  🔥 Atrevido
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.addQuestionSection}>
              <Text style={styles.addQuestionLabel}>Agregar Nueva Pregunta</Text>
              <TextInput
                style={styles.addQuestionInput}
                placeholder="Escribe la pregunta aquí..."
                value={newQuestionText}
                onChangeText={setNewQuestionText}
                multiline
              />
              <TouchableOpacity
                style={styles.addQuestionButton}
                onPress={handleAddQuestion}
              >
                <Text style={styles.addQuestionButtonText}>+ Agregar Pregunta</Text>
              </TouchableOpacity>
            </View>

            {loadingQuestions ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={nospiColors.purpleDark} />
                <Text style={styles.loadingText}>Cargando preguntas...</Text>
              </View>
            ) : (
              <ScrollView style={styles.questionsList}>
                <Text style={styles.questionsListTitle}>
                  Preguntas Actuales ({questions.length})
                </Text>
                {questions.map((question, index) => (
                  <View key={question.id} style={styles.questionItem}>
                    <View style={styles.questionHeader}>
                      <Text style={styles.questionNumber}>#{index + 1}</Text>
                      <Text style={styles.questionText}>{question.question_text}</Text>
                    </View>
                    <View style={styles.questionActions}>
                      <TouchableOpacity
                        style={styles.editQuestionButton}
                        onPress={() => {
                          const newText = window.prompt('Editar pregunta:', question.question_text);
                          if (newText) {
                            handleUpdateQuestion(question.id, newText);
                          }
                        }}
                      >
                        <Text style={styles.editQuestionButtonText}>✏️ Editar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.deleteQuestionButton}
                        onPress={() => handleDeleteQuestion(question.id)}
                      >
                        <Text style={styles.deleteQuestionButtonText}>🗑️ Eliminar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Styles remain exactly the same as the original file
const styles = StyleSheet.create({
  fullScreenContainer: {
    flex: 1,
    backgroundColor: '#F3E8FF',
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
  viewAttendeesButton: {
    flex: 1,
    minWidth: 150,
    backgroundColor: nospiColors.purpleMid,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  viewAttendeesButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
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
    padding: 24,
    width: '100%',
    maxWidth: 600,
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
    maxWidth: 800,
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
  questionsManagementButton: {
    backgroundColor: '#8B5CF6',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  questionsManagementButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  questionsModalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    width: '90%',
    maxWidth: 900,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  questionsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  questionsModalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
  },
  levelSelector: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  levelButton: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  levelButtonActive: {
    backgroundColor: nospiColors.purpleLight,
    borderColor: nospiColors.purpleDark,
  },
  levelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  levelButtonTextActive: {
    color: nospiColors.purpleDark,
  },
  addQuestionSection: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  addQuestionLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 12,
  },
  addQuestionInput: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  addQuestionButton: {
    backgroundColor: nospiColors.purpleDark,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  addQuestionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  questionsList: {
    flex: 1,
    padding: 20,
  },
  questionsListTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 16,
  },
  questionItem: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  questionNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: nospiColors.purpleMid,
    marginRight: 12,
    minWidth: 40,
  },
  questionText: {
    fontSize: 16,
    color: '#374151',
    flex: 1,
    lineHeight: 24,
  },
  questionActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editQuestionButton: {
    flex: 1,
    backgroundColor: '#6366F1',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  editQuestionButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  deleteQuestionButton: {
    flex: 1,
    backgroundColor: '#EF4444',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  deleteQuestionButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  eventSelectorList: {
    marginTop: 20,
    width: '100%',
  },
  eventSelectorItem: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  eventSelectorName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 4,
  },
  eventSelectorDate: {
    fontSize: 14,
    color: '#6B7280',
  },
  matchesHeader: {
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
  matchesEventInfo: {
    flex: 1,
  },
  matchesEventTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 4,
  },
  matchesEventDate: {
    fontSize: 14,
    color: '#6B7280',
  },
  backToEventsButton: {
    backgroundColor: nospiColors.purpleLight,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backToEventsButtonText: {
    color: nospiColors.purpleDark,
    fontSize: 14,
    fontWeight: 'bold',
  },
  matchesSection: {
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
  matchesSectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 16,
  },
  emptyMatches: {
    padding: 40,
    alignItems: 'center',
  },
  emptyMatchesText: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  matchItem: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  matchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  matchLevel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
  },
  matchDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  matchUsers: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  matchUser: {
    fontSize: 15,
    color: '#374151',
    fontWeight: '600',
  },
  matchConnector: {
    fontSize: 20,
  },
  ratingsSection: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  ratingsSectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 16,
  },
  emptyRatings: {
    padding: 40,
    alignItems: 'center',
  },
  emptyRatingsText: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  ratingItem: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  ratingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  ratingRater: {
    fontSize: 15,
    color: '#374151',
    fontWeight: '600',
    flex: 1,
  },
  ratingStars: {
    flexDirection: 'row',
    gap: 2,
  },
  ratingStar: {
    fontSize: 16,
  },
  ratingDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
});
