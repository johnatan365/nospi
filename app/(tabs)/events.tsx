
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

const HEADING = '#1a0010';
const BODY = '#333333';
const MUTED = '#555555';
const ACCENT = '#880E4F';

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

  const loadEvents = useCallback(async () => {
    if (!currentUserId) return;

    try {
      console.log('Loading published events for user:', currentUserId);

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

      const { data, error } = await supabase
        .from('events')
        .select('id, name, city, description, type, date, time, max_participants, event_status, is_full')
        .eq('event_status', 'published')
        .order('date', { ascending: true });

      if (error) {
        console.error('Error loading events:', error);
        return;
      }

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
  }, [currentUserId]);

  useEffect(() => {
    if (currentUserId) {
      loadEvents();
    }
  }, [currentUserId, loadEvents]);

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

  const handleEventPress = (event: Event) => {
    console.log('User tapped event:', event.id);
    router.push(`/event-details/${event.id}`);
  };

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={ACCENT} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
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
              {event.description ? (
                <Text style={styles.eventDescription}>{event.description}</Text>
              ) : null}
              <Text style={styles.eventParticipants}>{participantsText}</Text>
              <Text style={styles.locationPlaceholder}>Ubicación se revelará 48 horas antes del evento</Text>

              <View style={styles.ctaWrapper}>
                <LinearGradient
                  colors={['#1a0010', '#880E4F', '#AD1457']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.ctaGradient}
                >
                  <Text style={styles.ctaText}>Ver detalles</Text>
                </LinearGradient>
              </View>
            </TouchableOpacity>
          );
        })}

        {events.length === 0 && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No hay eventos disponibles en este momento</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 24,
    paddingBottom: 100,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: HEADING,
    marginBottom: 8,
    marginTop: 48,
  },
  subtitle: {
    fontSize: 16,
    color: MUTED,
    marginBottom: 32,
  },
  eventCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E5E7EB',
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
    color: HEADING,
  },
  eventType: {
    fontSize: 16,
    color: ACCENT,
    fontWeight: '600',
    marginTop: 4,
  },
  eventDate: {
    fontSize: 16,
    color: BODY,
    marginBottom: 4,
    fontWeight: '500',
  },
  eventTime: {
    fontSize: 16,
    color: BODY,
    marginBottom: 8,
    fontWeight: '500',
  },
  eventCity: {
    fontSize: 15,
    color: MUTED,
    marginBottom: 8,
  },
  eventDescription: {
    fontSize: 14,
    color: MUTED,
    marginBottom: 12,
    lineHeight: 20,
  },
  eventParticipants: {
    fontSize: 14,
    color: ACCENT,
    fontWeight: '600',
    marginBottom: 8,
  },
  locationPlaceholder: {
    fontSize: 13,
    color: '#999',
    fontStyle: 'italic',
    marginBottom: 16,
  },
  ctaWrapper: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  ctaGradient: {
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: MUTED,
    textAlign: 'center',
  },
});
