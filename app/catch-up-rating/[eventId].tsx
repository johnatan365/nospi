import React from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useSupabase } from '@/contexts/SupabaseContext';
import { supabase } from '@/lib/supabase';
import CatchUpRatingScreen from '@/components/CatchUpRatingScreen';

const FREE_PHASE_GRADIENT: [string, string, ...string[]] = ['#1a0010', '#880E4F', '#AD1457'];

export default function CatchUpRatingRoute() {
  const { eventId } = useLocalSearchParams();
  const { user } = useSupabase();

  const resolvedEventId = Array.isArray(eventId) ? eventId[0] : (eventId as string | undefined);

  // El tipo decide QUE se califica (en virtual no hay lugar ni comida). Se
  // espera a saberlo antes de montar la pantalla: si se montara antes, la lista
  // de items cambiaria debajo de alguien que ya empezo a calificar.
  // undefined = todavia no se sabe; null = no se pudo averiguar (cae en presencial).
  const [eventType, setEventType] = React.useState<string | null | undefined>(undefined);
  React.useEffect(() => {
    if (!resolvedEventId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('events').select('type').eq('id', resolvedEventId).maybeSingle();
      if (!cancelled) setEventType((data as any)?.type ?? null);
    })();
    return () => { cancelled = true; };
  }, [resolvedEventId]);

  if (!resolvedEventId || !user?.id || eventType === undefined) {
    return (
      <LinearGradient
        colors={FREE_PHASE_GRADIENT}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <Stack.Screen options={{ headerShown: true, title: 'Cierre de la experiencia', headerBackTitle: 'Atrás' }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          {!user?.id && (
            <Text style={styles.errorText}>Debes iniciar sesión para calificar.</Text>
          )}
        </View>
      </LinearGradient>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Cierre de la experiencia', headerBackTitle: 'Atrás' }} />
      <CatchUpRatingScreen eventId={resolvedEventId} currentUserId={user.id} eventType={eventType} />
    </>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  errorText: {
    color: '#FFFFFF',
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
