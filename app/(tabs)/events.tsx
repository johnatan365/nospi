import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
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
  is_location_revealed: boolean;
  location: string | null;
  location_name: string | null;
  location_address: string | null;
  maps_link: string | null;
}

const WEEKDAY_ABBR = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTH_ABBR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const WEEK_SECTION_ORDER = ['Esta semana', 'La próxima semana', 'En 2 semanas', 'Más adelante'];

const getMonday = (input: Date): Date => {
  const date = new Date(input);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
};

const getWeekSection = (dateString: string): string => {
  const eventMonday = getMonday(new Date(dateString));
  const todayMonday = getMonday(new Date());
  const diffWeeks = Math.round((eventMonday.getTime() - todayMonday.getTime()) / (7 * 24 * 60 * 60 * 1000));
  if (diffWeeks <= 0) return 'Esta semana';
  if (diffWeeks === 1) return 'La próxima semana';
  if (diffWeeks === 2) return 'En 2 semanas';
  return 'Más adelante';
};

const formatCompactDate = (dateString: string) => {
  const date = new Date(dateString);
  return `${WEEKDAY_ABBR[date.getDay()]} ${date.getDate()} ${MONTH_ABBR[date.getMonth()]}`;
};

export default function EventsScreen() {
  const router = useRouter();
  const { user } = useSupabase();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFresh = useCallback(async (): Promise<Event[] | null> => {
    if (!user?.id) return null;

    console.log('EventsScreen: Fetching events from Supabase for user:', user.id);

    const [appointmentsResult, eventsResult] = await Promise.all([
      supabase
        .from('appointments')
        .select('event_id')
        .eq('user_id', user.id)
        .in('status', ['confirmada', 'anterior', 'cancelada']),
      supabase
        .from('events')
        .select('id, name, city, description, type, date, time, max_participants, event_status, is_full, is_location_revealed, location, location_name, location_address, maps_link')
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
  }, [user?.id]);

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
      loadEvents();
    }, [user?.id, loadEvents])
  );

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

  const groupedEvents: Record<string, Event[]> = {};
  events.forEach(event => {
    const section = getWeekSection(event.date);
    if (!groupedEvents[section]) groupedEvents[section] = [];
    groupedEvents[section].push(event);
  });

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

          {WEEK_SECTION_ORDER.map((section) => {
            const sectionEvents = groupedEvents[section];
            if (!sectionEvents || sectionEvents.length === 0) return null;

            return (
              <View key={section} style={styles.sectionWrapper}>
                <Text style={styles.sectionHeader}>{section}</Text>

                {sectionEvents.map((event) => {
                  const eventIcon = event.type === 'bar' ? '🍸' : event.type === 'caminata' ? '🚶' : event.type === 'cafe' ? '☕' : '🍽️';
                  const compactDate = formatCompactDate(event.date);
                  const hasRevealedLocation = event.is_location_revealed && (event.location_name || event.location);

                  return (
                    <TouchableOpacity
                      key={event.id}
                      style={styles.eventCard}
                      onPress={() => handleEventPress(event)}
                      activeOpacity={0.8}
                    >
                      {event.type === 'caminata' ? (
                        <Image source={require('@/assets/images/icon-caminata.png')} style={{ width: 78, height: 66, marginRight: 12, tintColor: '#6B6B6B' }} resizeMode="contain" />
                      ) : event.type === 'bar' ? (
                        <Image source={require('@/assets/images/icon-bar.png')} style={{ width: 62, height: 53, marginRight: 12, tintColor: '#6B6B6B' }} resizeMode="contain" />
                      ) : event.type === 'restaurante' ? (
                        <Image source={require('@/assets/images/icon-restaurante.png')} style={{ width: 62, height: 53, marginRight: 12, tintColor: '#6B6B6B' }} resizeMode="contain" />
                      ) : event.type === 'cafe' ? (
                        <Image source={require('@/assets/images/icon-cafe.png')} style={{ width: 62, height: 53, marginRight: 12, tintColor: '#6B6B6B' }} resizeMode="contain" />
                      ) : (
                        <Text style={styles.eventIconCompact}>{eventIcon}</Text>
                      )}
                      <View style={styles.eventCardBody}>
                        <Text style={styles.eventNameCompact} numberOfLines={1}>{event.name}</Text>
                        <Text style={styles.eventMetaCompact} numberOfLines={1}>
                          {compactDate} • {event.time} • {event.city}
                        </Text>
                        {hasRevealedLocation ? (
                          <Text style={styles.locationRevealedCompact} numberOfLines={1}>
                            {event.location_name || ''}{event.location_name && event.location_address ? ' — ' : ''}{event.location_address || ''}
                          </Text>
                        ) : (
                          <Text style={styles.locationPlaceholderCompact}>Ubicación se revela 48h antes</Text>
                        )}
                      </View>
                      <Text style={styles.chevron}>›</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
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
    marginBottom: 20,
  },
  sectionWrapper: {
    marginBottom: 10,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  eventCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  eventIconCompact: {
    fontSize: 24,
    marginRight: 12,
  },
  eventCardBody: {
    flex: 1,
    minWidth: 0,
  },
  eventNameCompact: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#880E4F',
  },
  eventMetaCompact: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  locationPlaceholderCompact: {
    fontSize: 11,
    color: '#999',
    fontStyle: 'italic',
    marginTop: 2,
  },
  locationRevealedCompact: {
    fontSize: 11,
    color: '#10B981',
    fontWeight: '600',
    marginTop: 2,
  },
  chevron: {
    fontSize: 20,
    color: '#AD1457',
    marginLeft: 8,
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
