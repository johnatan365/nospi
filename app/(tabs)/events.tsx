
import React, { useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, InteractionManager } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useSupabase } from '@/contexts/SupabaseContext';
import { useFocusEffect } from '@react-navigation/native';
import { SkeletonBox } from '@/components/SkeletonBox';
import { getCached, setCached } from '@/utils/cache';

const CACHE_KEY = 'cache_events';

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
  const { user } = useSupabase();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  const currentUserIdRef = useRef<string | null>(null);

  const fetchFresh = useCallback(async (): Promise<Event[] | null> => {
    // Use user from context (already resolved) — fall back to direct API call
    const userId = user?.id ?? currentUserIdRef.current;
    if (!userId) {
      // Last resort: resolve from Supabase auth directly
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        currentUserIdRef.current = authUser.id;
        console.log('EventsScreen: Resolved current user ID from auth:', authUser.id);
      }
    } else {
      currentUserIdRef.current = userId;
    }

    if (!currentUserIdRef.current) return null;

    console.log('EventsScreen: Fetching events from Supabase for user:', currentUserIdRef.current);

    const [appointmentsResult, eventsResult] = await Promise.all([
      supabase
        .from('appointments')
        .select('event_id')
        .eq('user_id', currentUserIdRef.current)
        .in('status', ['confirmada', 'anterior'])
        .eq('payment_status', 'completed'),
      supabase
        .from('events')
        .select('id, name, city, description, type, date, time, max_participants, event_status, is_full')
        .eq('event_status', 'published')
        .order('date', { ascending: true }),
    ]);

    if (appointmentsResult.error) {
      console.error('EventsScreen: Error loading user appointments:', appointmentsResult.error);
    }
    if (eventsResult.error) {
      console.error('EventsScreen: Error loading events:', eventsResult.error);
      return null;
    }

    const purchasedEventIds = appointmentsResult.data?.map(apt => apt.event_id) || [];
    const availableEvents = (eventsResult.data || []).filter(
      event => !purchasedEventIds.includes(event.id) && !event.is_full
    );

    console.log('EventsScreen: Available events fetched:', availableEvents.length);
    return availableEvents;
  }, []);

  const loadEvents = useCallback(async () => {
    // 1. Load from AsyncStorage immediately — show data with no skeleton
    const cached = await getCached<Event[]>(CACHE_KEY);
    if (cached) {
      console.log('EventsScreen: Showing cached data instantly');
      setEvents(cached);
      setLoading(false);
    }

    // 2. Always fetch fresh in background
    try {
      const fresh = await fetchFresh();
      if (fresh !== null) {
        setEvents(fresh);
        setCached(CACHE_KEY, fresh);
      }
    } catch (error) {
      console.error('EventsScreen: Failed to load events:', error);
    } finally {
      setLoading(false);
    }
  }, [fetchFresh]);

  useFocusEffect(
    useCallback(() => {
      console.log('EventsScreen: Tab focused, user:', user?.id ?? 'none');
      if (!user?.id) {
        setLoading(false);
        return;
      }
      const task = InteractionManager.runAfterInteractions(() => {
        loadEvents();
      });
      return () => task.cancel();
    }, [user?.id, loadEvents])
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

  const handleEventPress = (event: Event) => {
    console.log('User tapped event:', event.id, event.name);
    router.push(`/event-details/${event.id}`);
  };

  const renderSkeleton = () => (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <SkeletonBox height={40} width="60%" borderRadius={8} style={{ marginBottom: 8, marginTop: 48 }} />
      <SkeletonBox height={20} width="80%" borderRadius={6} style={{ marginBottom: 32 }} />
      {[1, 2, 3].map(i => (
        <View key={i} style={styles.skeletonCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <SkeletonBox width={48} height={48} borderRadius={24} style={{ marginRight: 16 }} />
            <View style={{ flex: 1 }}>
              <SkeletonBox height={22} width="70%" borderRadius={6} style={{ marginBottom: 8 }} />
              <SkeletonBox height={16} width="40%" borderRadius={6} />
            </View>
          </View>
          <SkeletonBox height={16} width="90%" borderRadius={6} style={{ marginBottom: 6 }} />
          <SkeletonBox height={16} width="50%" borderRadius={6} style={{ marginBottom: 6 }} />
          <SkeletonBox height={14} width="35%" borderRadius={6} />
        </View>
      ))}
    </ScrollView>
  );

  return (
    <LinearGradient
      colors={['#1a0010', '#880E4F', '#AD1457']}
      style={styles.gradient}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      {loading ? (
        renderSkeleton()
      ) : (
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
      )}
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
  skeletonCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    marginTop: 48,
  },
  subtitle: {
    fontSize: 16,
    color: '#FFFFFF',
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
    color: '#880E4F',
  },
  eventType: {
    fontSize: 16,
    color: '#AD1457',
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
    color: '#AD1457',
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
    color: '#FFFFFF',
    textAlign: 'center',
    opacity: 0.7,
  },
});
