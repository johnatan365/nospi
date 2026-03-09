
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Modal, Platform } from 'react-native';
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
  interested_in: string;
  gender?: string;
  age?: number;
  age_range_min?: number;
  age_range_max?: number;
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

type AdminView = 'dashboard' | 'events' | 'users' | 'appointments' | 'realtime';

// Default questions to restore
const DEFAULT_QUESTIONS_DATA = {
  divertido: [
    '¿Cuál es tu nombre y a qué te dedicas?',
    '¿Cuál es tu mayor sueño?',
    '¿Qué te hace reír sin control?',
    '¿Cuál es tu película favorita?',
    '¿Prefieres el mar o la montaña?',
    '¿Qué superpoder te gustaría tener?',
    '¿Cuál es tu comida favorita?',
    '¿Qué harías si ganaras la lotería?',
    '¿Te gusta bailar?',
    '¿Cuál es tu mayor miedo?',
    '¿Qué te hace feliz?'
  ],
  sensual: [
    '¿Qué te atrae de una persona?',
    '¿Cuál es tu idea de una cita perfecta?',
    '¿Qué te hace sentir especial?',
    '¿Cuál es tu mayor fantasía?',
    '¿Qué te pone nervioso en una primera cita?',
    '¿Qué es lo más romántico que has hecho?',
    '¿Qué te hace sentir deseado/a?',
    '¿Cuál es tu lugar favorito para un beso?',
    '¿Qué te enamora de alguien?',
    '¿Qué te hace sentir conectado con alguien?'
  ],
  atrevido: [
    '¿Cuál es tu secreto mejor guardado?',
    '¿Qué es lo más loco que has hecho por amor?',
    '¿Cuál es tu mayor arrepentimiento?',
    '¿Qué es lo que nunca le has dicho a nadie?',
    '¿Cuál es tu mayor inseguridad?',
    '¿Qué es lo más atrevido que has hecho?',
    '¿Cuál es tu mayor deseo oculto?',
    '¿Qué es lo que más te avergüenza?',
    '¿Cuál es tu mayor tentación?',
    '¿Qué es lo que más te asusta de ti mismo/a?'
  ]
};

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

  // Move attendee modal
  const [showMoveAttendeeModal, setShowMoveAttendeeModal] = useState(false);
  const [selectedAttendeeToMove, setSelectedAttendeeToMove] = useState<EventAttendee | null>(null);
  const [targetEventId, setTargetEventId] = useState<string>('');
  const [movingAttendee, setMovingAttendee] = useState(false);

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

  // Event questions management (for specific event)
  const [eventQuestions, setEventQuestions] = useState<{
    divertido: string[];
    sensual: string[];
    atrevido: string[];
  }>({
    divertido: [],
    sensual: [],
    atrevido: [],
  });
  const [showEventQuestionsSection, setShowEventQuestionsSection] = useState(false);

  // Question management
  const [showQuestionsModal, setShowQuestionsModal] = useState(false);
  const [questions, setQuestions] = useState<any[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState<'divertido' | 'sensual' | 'atrevido'>('divertido');
  const [newQuestionText, setNewQuestionText] = useState('');
  const [draggedQuestionId, setDraggedQuestionId] = useState<string | null>(null);


  // Realtime monitoring
  const [selectedEventForMonitoring, setSelectedEventForMonitoring] = useState<string | null>(null);

  // NEW: Event configuration modal
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [selectedEventForConfig, setSelectedEventForConfig] = useState<Event | null>(null);

  useEffect(() => {
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadDashboardData();
    }
  }, [isAuthenticated, currentView]);

  // Realtime subscription for events table
  useEffect(() => {
    if (!isAuthenticated) return;


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
          loadDashboardData();
        }
      )
      .subscribe((status) => {
      });

    return () => {
      supabase.removeChannel(eventsChannel);
    };
  }, [isAuthenticated]);

  // Realtime subscription for event participants
  useEffect(() => {
    if (!isAuthenticated || !selectedEventForMonitoring) return;


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
          loadEventParticipants(selectedEventForMonitoring);
        }
      )
      .subscribe((status) => {
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated, selectedEventForMonitoring]);

  const handlePasswordSubmit = () => {
    if (adminPassword === 'nospi2024') {
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

      // Load events
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .order('date', { ascending: false });

      if (eventsError) {
        console.error('Error loading events:', eventsError);
        window.alert('Error al cargar eventos: ' + eventsError.message);
      } else {
        setEvents(eventsData || []);
        setTotalEvents(eventsData?.length || 0);
        const activeCount = eventsData?.filter(e => e.event_status === 'published').length || 0;
        setActiveEvents(activeCount);
      }

      // Load users using the secure admin function
      const { data: usersData, error: usersError } = await supabase
        .rpc('get_all_users_for_admin');

      if (usersError) {
        console.error('Error loading users:', usersError);
        window.alert('No se pudieron cargar los usuarios: ' + usersError.message);
      } else {
        setUsers(usersData || []);
        setTotalUsers(usersData?.length || 0);
      }

      // Load appointments using the secure admin function
      const { data: appointmentsRawData, error: appointmentsError } = await supabase
        .rpc('get_all_appointments_for_admin');

      if (appointmentsError) {
        console.error('Error loading appointments:', appointmentsError);
      } else {
        
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

    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      window.alert('Error inesperado al cargar datos: ' + String(error));
    } finally {
      setLoading(false);
    }
  };

  const loadEventParticipants = async (eventId: string) => {
    try {
      
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

      setEventParticipants(data || []);
    } catch (error) {
      console.error('Failed to load event participants:', error);
    }
  };

  const handleViewAttendees = async (event: Event) => {
    
    setSelectedEventForAttendees(event);
    setLoadingAttendees(true);
    setShowAttendeesModal(true);

    try {
      const { data, error } = await supabase
        .rpc('get_event_attendees_for_admin', { p_event_id: event.id });

      if (error) {
        console.error('❌ Error loading event attendees:', error);
        window.alert('No se pudieron cargar los asistentes: ' + error.message);
        setEventAttendees([]);
      } else {
        
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
            age_range_min: att.user_age_range_min,
            age_range_max: att.user_age_range_max,
          },
        })) || [];
        
        setEventAttendees(transformedAttendees);
      }
    } catch (error) {
      console.error('❌ Failed to load attendees:', error);
      window.alert('Error inesperado al cargar asistentes');
      setEventAttendees([]);
    } finally {
      setLoadingAttendees(false);
    }
  };

  const handleOpenMoveAttendeeModal = (attendee: EventAttendee) => {
    setSelectedAttendeeToMove(attendee);
    setTargetEventId('');
    setShowMoveAttendeeModal(true);
  };

  const handleMoveAttendee = async () => {
    if (!selectedAttendeeToMove || !targetEventId) {
      window.alert('Por favor selecciona un evento de destino');
      return;
    }

    const targetEvent = events.find(e => e.id === targetEventId);
    if (!targetEvent) {
      window.alert('Evento de destino no encontrado');
      return;
    }

    const confirmed = window.confirm(
      `¿Estás seguro de que quieres mover a ${selectedAttendeeToMove.users.name} al evento "${targetEvent.name || targetEvent.type + ' - ' + targetEvent.city}"?`
    );
    
    if (!confirmed) return;

    try {
      setMovingAttendee(true);

      // Update the appointment to point to the new event
      const { error } = await supabase
        .from('appointments')
        .update({ event_id: targetEventId, updated_at: new Date().toISOString() })
        .eq('id', selectedAttendeeToMove.id);

      if (error) {
        console.error('Error moving attendee:', error);
        window.alert('Error al mover asistente: ' + error.message);
        return;
      }

      window.alert(`${selectedAttendeeToMove.users.name} ha sido movido exitosamente al nuevo evento`);
      
      // Close modals and reload data
      setShowMoveAttendeeModal(false);
      setSelectedAttendeeToMove(null);
      setTargetEventId('');
      
      // Reload attendees list for current event
      if (selectedEventForAttendees) {
        handleViewAttendees(selectedEventForAttendees);
      }
      
      // Reload dashboard data
      loadDashboardData();
    } catch (error) {
      console.error('Failed to move attendee:', error);
      window.alert('Error inesperado al mover asistente');
    } finally {
      setMovingAttendee(false);
    }
  };

  const openCreateEventModal = () => {
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
    // Load default questions for new event
    setEventQuestions({
      divertido: DEFAULT_QUESTIONS_DATA.divertido.slice(0, 5),
      sensual: DEFAULT_QUESTIONS_DATA.sensual.slice(0, 5),
      atrevido: DEFAULT_QUESTIONS_DATA.atrevido.slice(0, 5),
    });
    setShowEventQuestionsSection(false);
    setShowEventModal(true);
  };

  const openEditEventModal = async (event: Event) => {
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

    // Load existing questions for this event
    try {
      const { data: existingQuestions, error } = await supabase
        .from('event_questions')
        .select('*')
        .eq('event_id', event.id)
        .order('question_order', { ascending: true });

      if (error) {
        console.error('Error loading event questions:', error);
      } else {
        const questionsByLevel = {
          divertido: existingQuestions?.filter(q => q.level === 'divertido').map(q => q.question_text) || [],
          sensual: existingQuestions?.filter(q => q.level === 'sensual').map(q => q.question_text) || [],
          atrevido: existingQuestions?.filter(q => q.level === 'atrevido').map(q => q.question_text) || [],
        };
        setEventQuestions(questionsByLevel);
      }
    } catch (error) {
      console.error('Failed to load event questions:', error);
    }

    setShowEventQuestionsSection(false);
    setShowEventModal(true);
  };

  const saveEventQuestions = async (eventId: string) => {
    try {
      // Delete existing questions for this event
      await supabase
        .from('event_questions')
        .delete()
        .eq('event_id', eventId);

      // Insert new questions
      const questionsToInsert: any[] = [];
      let orderCounter = 0;

      for (const [level, questionsList] of Object.entries(eventQuestions)) {
        questionsList.forEach((questionText) => {
          if (questionText.trim()) {
            questionsToInsert.push({
              event_id: eventId,
              level: level,
              question_text: questionText.trim(),
              question_order: orderCounter++,
              is_default: false,
            });
          }
        });
      }

      if (questionsToInsert.length > 0) {
        const { error } = await supabase
          .from('event_questions')
          .insert(questionsToInsert);

        if (error) {
          console.error('Error saving event questions:', error);
          window.alert('Advertencia: No se pudieron guardar las preguntas del evento');
        } else {
        }
      }
    } catch (error) {
      console.error('Failed to save event questions:', error);
    }
  };

  const handleSaveEvent = async () => {

    try {
      if (!eventForm.name || !eventForm.city) {
        window.alert('Por favor completa el nombre y la ciudad del evento');
        return;
      }

      if (!eventForm.date || !eventForm.time) {
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
          console.error('Error updating event:', error);
          window.alert('Error al actualizar evento: ' + error.message);
          return;
        }

        
        // Save event questions
        await saveEventQuestions(editingEventId);
        
        window.alert('Evento actualizado exitosamente');
      } else {
        const { data, error } = await supabase
          .from('events')
          .insert([eventData])
          .select();

        if (error) {
          console.error('Error creating event:', error);
          window.alert('Error al crear evento: ' + error.message);
          return;
        }

        
        // Save event questions for new event
        if (data && data[0]) {
          await saveEventQuestions(data[0].id);
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
      setEventQuestions({
        divertido: [],
        sensual: [],
        atrevido: [],
      });
      loadDashboardData();
    } catch (error) {
      console.error('Unexpected error saving event:', error);
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

  // NEW: Restore default questions without duplicating
  const handleRestoreDefaultQuestions = async () => {
    const confirmed = window.confirm('¿Restaurar las preguntas predeterminadas? Esto NO eliminará las preguntas existentes, solo agregará las que falten.');
    if (!confirmed) return;

    setLoadingQuestions(true);
    try {
      // Get all existing questions
      const { data: existingQuestions, error: fetchError } = await supabase
        .from('event_questions')
        .select('question_text, level')
        .is('event_id', null);

      if (fetchError) {
        console.error('Error fetching existing questions:', fetchError);
        window.alert('Error al cargar preguntas existentes: ' + fetchError.message);
        return;
      }

      // Create a set of existing question texts per level for quick lookup
      const existingQuestionsSet = new Set(
        existingQuestions?.map(q => `${q.level}:${q.question_text.toLowerCase().trim()}`) || []
      );

      // Prepare questions to insert (only those that don't exist)
      const questionsToInsert: any[] = [];
      let orderCounter = 0;

      for (const [level, questionsList] of Object.entries(DEFAULT_QUESTIONS_DATA)) {
        questionsList.forEach((questionText) => {
          const key = `${level}:${questionText.toLowerCase().trim()}`;
          if (!existingQuestionsSet.has(key)) {
            questionsToInsert.push({
              event_id: null,
              level: level,
              question_text: questionText,
              question_order: orderCounter++,
              is_default: true,
            });
          }
        });
      }

      if (questionsToInsert.length === 0) {
        window.alert('Todas las preguntas predeterminadas ya existen. No se agregó ninguna pregunta nueva.');
        return;
      }

      // Insert new questions
      const { error: insertError } = await supabase
        .from('event_questions')
        .insert(questionsToInsert);

      if (insertError) {
        console.error('Error inserting default questions:', insertError);
        window.alert('Error al restaurar preguntas: ' + insertError.message);
        return;
      }

      window.alert(`✅ Se restauraron ${questionsToInsert.length} preguntas predeterminadas exitosamente.`);
      loadQuestions();
    } catch (error) {
      console.error('Failed to restore default questions:', error);
      window.alert('Error inesperado al restaurar preguntas');
    } finally {
      setLoadingQuestions(false);
    }
  };

  // NEW: Download template for mass upload
  const handleDownloadTemplate = () => {
    const template = `nivel,pregunta
divertido,¿Cuál es tu mayor sueño?
sensual,¿Qué te atrae de una persona?
atrevido,¿Cuál es tu secreto mejor guardado?`;

    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'plantilla_preguntas.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // NEW: Mass upload questions from CSV
  const handleMassUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const text = event.target?.result as string;
          const lines = text.split('\n').filter(line => line.trim());
          
          // Skip header
          const dataLines = lines.slice(1);
          
          const questionsToInsert: any[] = [];
          let orderCounter = 0;

          for (const line of dataLines) {
            const [level, questionText] = line.split(',').map(s => s.trim());
            
            if (!level || !questionText) continue;
            if (!['divertido', 'sensual', 'atrevido'].includes(level)) {
              continue;
            }

            questionsToInsert.push({
              event_id: null,
              level: level,
              question_text: questionText,
              question_order: orderCounter++,
              is_default: true,
            });
          }

          if (questionsToInsert.length === 0) {
            window.alert('No se encontraron preguntas válidas en el archivo');
            return;
          }

          const { error } = await supabase
            .from('event_questions')
            .insert(questionsToInsert);

          if (error) {
            console.error('Error uploading questions:', error);
            window.alert('Error al cargar preguntas: ' + error.message);
            return;
          }

          window.alert(`✅ Se cargaron ${questionsToInsert.length} preguntas exitosamente`);
          loadQuestions();
        } catch (error) {
          console.error('Failed to parse CSV:', error);
          window.alert('Error al procesar el archivo CSV');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleDragStart = (questionId: string) => {
    setDraggedQuestionId(questionId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (targetQuestionId: string) => {
    if (!draggedQuestionId || draggedQuestionId === targetQuestionId) {
      setDraggedQuestionId(null);
      return;
    }

    const draggedIndex = questions.findIndex(q => q.id === draggedQuestionId);
    const targetIndex = questions.findIndex(q => q.id === targetQuestionId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedQuestionId(null);
      return;
    }

    // Reorder questions array
    const newQuestions = [...questions];
    const [draggedQuestion] = newQuestions.splice(draggedIndex, 1);
    newQuestions.splice(targetIndex, 0, draggedQuestion);

    // Update question_order for all questions
    const updates = newQuestions.map((q, index) => ({
      id: q.id,
      question_order: index,
    }));

    // Optimistically update UI
    setQuestions(newQuestions);
    setDraggedQuestionId(null);

    // Update database
    try {
      for (const update of updates) {
        const { error } = await supabase
          .from('event_questions')
          .update({ question_order: update.question_order, updated_at: new Date().toISOString() })
          .eq('id', update.id);

        if (error) {
          console.error('Error updating question order:', error);
          window.alert('Error al reordenar preguntas: ' + error.message);
          loadQuestions(); // Reload to revert
          return;
        }
      }

    } catch (error) {
      console.error('Failed to reorder questions:', error);
      window.alert('Error inesperado al reordenar preguntas');
      loadQuestions(); // Reload to revert
    }
  };

  const handleDeleteAttendee = async (attendeeId: string, attendeeName: string) => {
    const confirmed = window.confirm(`¿Estás seguro de que quieres eliminar a ${attendeeName} de este evento?`);
    if (!confirmed) return;

    try {
      
      // Delete from appointments table
      const { error } = await supabase
        .from('appointments')
        .delete()
        .eq('id', attendeeId);

      if (error) {
        console.error('Error deleting attendee:', error);
        window.alert('Error al eliminar asistente: ' + error.message);
        return;
      }

      window.alert('Asistente eliminado exitosamente');
      
      // Reload attendees list
      if (selectedEventForAttendees) {
        handleViewAttendees(selectedEventForAttendees);
      }
    } catch (error) {
      console.error('Failed to delete attendee:', error);
      window.alert('Error inesperado al eliminar asistente');
    }
  };

  const handleSendEventReminder = async (eventId: string) => {
    const confirmed = window.confirm('¿Enviar recordatorio a todos los participantes de este evento según sus preferencias de notificación?');
    if (!confirmed) return;

    try {
      
      // FIX: Get all appointments for this event with status 'confirmada'
      const { data: appointmentsData, error: appointmentsError } = await supabase
        .from('appointments')
        .select('user_id')
        .eq('event_id', eventId)
        .eq('status', 'confirmada');

      if (appointmentsError) {
        console.error('Error fetching appointments:', appointmentsError);
        window.alert('Error al obtener participantes: ' + appointmentsError.message);
        return;
      }

      if (!appointmentsData || appointmentsData.length === 0) {
        window.alert('No hay participantes confirmados para este evento');
        return;
      }

      // Call the RPC function to send notifications
      const { error: notificationError } = await supabase.rpc('send_event_reminder_now', {
        p_event_id: eventId
      });

      if (notificationError) {
        console.error('Error sending notifications:', notificationError);
        window.alert('Error al enviar notificaciones: ' + notificationError.message);
        return;
      }

      window.alert(`✅ Recordatorio enviado a ${appointmentsData.length} participantes según sus preferencias de notificación`);
    } catch (error) {
      console.error('Failed to send event reminder:', error);
      window.alert('Error inesperado al enviar recordatorio');
    }
  };
