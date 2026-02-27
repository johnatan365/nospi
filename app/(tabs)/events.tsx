
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

interface Event {
  id: string;
  name: string;
  city: string;
  description: string;
  type: string;
  date: string;
  time: string;
  max_participants: number;
  event_status: 'draft' | 'published' | 'closed';
  is_full: boolean;
}

export default function EventsScreen() {
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        console.log('Current user ID:', user.id);
      }
    };
    getCurrentUser();
  }, []);

  useEffect(() => {
    if (currentUserId) {
      loadEvents();
    }
  }, [currentUserId]);

  const loadEvents = async () => {
    if (!currentUserId) return;

    try {
      console.log('Loading published events for user:', currentUserId);
      
      // First, get all events the user has already purchased/confirmed
      const { data: userAppointments, error: appointmentsError } = await supabase
        .from('appointments')
        .select('event_id')
        .eq('user_id', currentUserId)
        .in('status', ['confirmada', 'anterior'])
        .eq('payment_status', 'completed');

      if (appointmentsError) {
        console.error('Error loading user appointments:', appointmentsError);
      }

      const purchasedEventIds = userAppointments?.map(apt => apt.event_id) || [];
      console.log('User has purchased events:', purchasedEventIds);

      // Load all published events
      const { data, error } = await supabase
        .from('events')
        .select('id, name, city, description, type, date, time, max_participants, event_status, is_full')
        .eq('event_status', 'published')
        .order('date', { ascending: true });

      if (error) {
        console.error('Error loading events:', error);
        return;
      }

      // Filter out events the user has already purchased AND events marked as full
      const availableEvents = (data || []).filter(event => 
        !purchasedEventIds.includes(event.id) && !event.is_full
      );
      
      console.log('Total published events:', data?.length || 0);
      console.log('Available events (not purchased and not full):', availableEvents.length);
      
      setEvents(availableEvents);
    } catch (error) {
      console.error('Failed to load events:', error);
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

  const handleEventPress = (event: Event) => {
    console.log('User tapped event:', event.id);
    router.push(`/event-details/${event.id}`);
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
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.title}>Eventos Disponibles</Text>
        <Text style={styles.subtitle}>Elige el evento al que quieres asistir</Text>

        {events.map((event) => {
          const eventTypeText = event.type === 'bar' ? 'Bar' : 'Restaurante';
          const eventIcon = event.type === 'bar' ? '🍸' : '🍽️';
          const dateText = formatDate(event.date);
          const participantsText = `${event.max_participants} participantes`;

          return (
            <TouchableOpacity
              key={event.id}
              style={styles.eventCard}
              onPress={() => handleEventPress(event)}
              activeOpacity={0.8}
            >
              <View style={styles.eventHeader}>
                <Text style={styles.eventIcon}>{eventIcon}</Text>
                <View style={styles.eventHeaderText}>
                  <Text style={styles.eventName}>{event.name}</Text>
                  <Text style={styles.eventType}>{eventTypeText}</Text>
                </View>
              </View>

              <Text style={styles.eventDate}>{dateText}</Text>
              <Text style={styles.eventTime}>{event.time}</Text>
              <Text style={styles.eventCity}>📍 {event.city}</Text>
              {event.description && (
                <Text style={styles.eventDescription}>{event.description}</Text>
              )}
              <Text style={styles.eventParticipants}>{participantsText}</Text>
              <Text style={styles.locationPlaceholder}>Ubicación se revelará 48 horas antes del evento</Text>
            </TouchableOpacity>
          );
        })}

        {events.length === 0 && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No hay eventos disponibles en este momento</Text>
          </View>
        )}
      </ScrollView>
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
    color: nospiColors.purpleDark,
    marginBottom: 8,
    marginTop: 48,
  },
  subtitle: {
    fontSize: 16,
    color: nospiColors.purpleDark,
    opacity: 0.8,
    marginBottom: 32,
  },
  eventCard: {
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
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  eventIcon: {
    fontSize: 40,
    marginRight: 16,
  },
  eventHeaderText: {
    flex: 1,
  },
  eventName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
  },
  eventType: {
    fontSize: 16,
    color: nospiColors.purpleMid,
    fontWeight: '600',
    marginTop: 4,
  },
  eventDate: {
    fontSize: 16,
    color: '#333',
    marginBottom: 4,
    fontWeight: '500',
  },
  eventTime: {
    fontSize: 16,
    color: '#333',
    marginBottom: 8,
    fontWeight: '500',
  },
  eventCity: {
    fontSize: 15,
    color: '#666',
    marginBottom: 8,
  },
  eventDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
    lineHeight: 20,
  },
  eventParticipants: {
    fontSize: 14,
    color: nospiColors.purpleMid,
    fontWeight: '600',
    marginBottom: 8,
  },
  locationPlaceholder: {
    fontSize: 13,
    color: '#999',
    fontStyle: 'italic',
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
});
