import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

// Pantalla de calificación en retrospectiva ("catch-up"), independiente del
// motor de juego en vivo (GameDynamicsScreen). Se usa cuando un evento ya
// cerró (automática o manualmente) y el usuario todavía no calificó a los
// demás participantes desde la pestaña "Anteriores". Replica visualmente el
// bloque `free_phase` de GameDynamicsScreen pero sin ninguna dependencia de
// `game_phase` ni de canales realtime, porque aquí no hace falta ningún
// estado en vivo entre participantes.

interface CatchUpParticipant {
  id: string;
  user_id: string;
  name: string;
  profile_photo_url: string | null;
}

interface CatchUpRatingScreenProps {
  eventId: string;
  currentUserId: string;
}

const FREE_PHASE_GRADIENT: [string, string, ...string[]] = ['#1a0010', '#880E4F', '#AD1457'];

export default function CatchUpRatingScreen({ eventId, currentUserId }: CatchUpRatingScreenProps) {
  const router = useRouter();
  const [loadingData, setLoadingData] = useState(true);
  const [participants, setParticipants] = useState<CatchUpParticipant[]>([]);
  const [userRatings, setUserRatings] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  const loadParticipants = useCallback(async () => {
    setLoadingData(true);
    try {
      const { data, error } = await supabase
        .rpc('get_event_participants_for_interaction', { p_event_id: eventId });

      if (error) {
        console.error('❌ Error loading participants for catch-up rating:', error);
        setParticipants([]);
        return;
      }

      const list: CatchUpParticipant[] = (data || [])
        .filter((item: any) => item.user_name && item.confirmed === true)
        .map((item: any) => ({
          id: item.id,
          user_id: item.user_id,
          name: item.user_name,
          profile_photo_url: item.user_profile_photo_url || null,
        }));

      setParticipants(list);

      // Precargar calificaciones ya guardadas previamente, por si el usuario
      // vuelve a entrar a calificar a los que le faltaron.
      const { data: existingRatings } = await supabase
        .from('event_ratings')
        .select('rated_user_id, rating')
        .eq('event_id', eventId)
        .eq('rater_user_id', currentUserId);

      if (existingRatings) {
        const map: Record<string, number> = {};
        existingRatings.forEach((r: any) => {
          map[r.rated_user_id] = r.rating;
        });
        setUserRatings(map);
      }
    } catch (error) {
      console.error('❌ Unexpected error loading catch-up participants:', error);
    } finally {
      setLoadingData(false);
    }
  }, [eventId, currentUserId]);

  useEffect(() => {
    loadParticipants();
  }, [loadParticipants]);

  const handleRateUser = useCallback(async (ratedUserId: string, rating: number) => {
    if (!eventId || !currentUserId) return;
    try {
      const { error } = await supabase
        .from('event_ratings')
        .upsert(
          {
            event_id: eventId,
            rater_user_id: currentUserId,
            rated_user_id: ratedUserId,
            rating: rating,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'event_id,rater_user_id,rated_user_id' }
        );
      if (error) {
        console.error('❌ Error saving rating:', error);
        return;
      }
      setUserRatings((prev) => ({ ...prev, [ratedUserId]: rating }));
    } catch (error) {
      console.error('❌ Failed to save rating:', error);
    }
  }, [eventId, currentUserId]);

  const handleFinish = useCallback(async () => {
    if (!eventId || !currentUserId || saving) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('appointments')
        .update({
          ratings_submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('event_id', eventId)
        .eq('user_id', currentUserId);

      if (error) {
        console.error('❌ Error updating ratings_submitted_at:', error);
        setSaving(false);
        return;
      }

      router.back();
    } catch (error) {
      console.error('❌ Unexpected error finishing catch-up rating:', error);
      setSaving(false);
    }
  }, [eventId, currentUserId, saving, router]);

  if (loadingData) {
    return (
      <LinearGradient
        colors={FREE_PHASE_GRADIENT}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFFFFF" />
        </View>
      </LinearGradient>
    );
  }

  const othersToRate = participants.filter((p) => p.user_id !== currentUserId);

  return (
    <LinearGradient
      colors={FREE_PHASE_GRADIENT}
      style={styles.gradient}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <View style={styles.iceBreakCard}>
          <Text style={styles.iceBreakIcon}>✨</Text>
          <Text style={styles.iceBreakTitle}>¡Ya rompieron el hielo!</Text>
          <Text style={styles.iceBreakSubtitle}>
            Ahora disfruten el resto de la noche y déjense sorprender ✨
          </Text>
        </View>

        <View style={styles.evaluationCard}>
          <Text style={styles.evaluationIcon}>⭐</Text>
          <Text style={styles.evaluationTitle}>Evalúa tu experiencia</Text>
          <Text style={styles.evaluationText}>
            Puedes calificar a los demás participantes.
          </Text>

          {othersToRate.length === 0 ? (
            <Text style={styles.evaluationText}>
              No encontramos participantes confirmados para calificar en este evento.
            </Text>
          ) : (
            <View style={styles.participantsRatingSection}>
              {othersToRate.map((participant, index) => {
                const displayName = participant.name;
                const currentRating = userRatings[participant.user_id] || 0;

                return (
                  <View key={index} style={styles.participantRatingCard}>
                    <View style={styles.participantRatingHeader}>
                      {participant.profile_photo_url ? (
                        <Image
                          source={{ uri: participant.profile_photo_url }}
                          style={styles.participantRatingPhoto}
                        />
                      ) : (
                        <View style={styles.participantRatingPhotoPlaceholder}>
                          <Text style={styles.participantRatingPhotoPlaceholderText}>
                            {displayName.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <Text style={styles.participantRatingName}>{displayName}</Text>
                    </View>

                    <View style={styles.starsContainer}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <TouchableOpacity
                          key={star}
                          style={styles.starButton}
                          onPress={() => handleRateUser(participant.user_id, star)}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.starIcon,
                              star <= currentRating && styles.starIconSelected,
                            ]}
                          >
                            ⭐
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    {currentRating > 0 && (
                      <Text style={styles.ratingConfirmation}>✓ Calificación guardada</Text>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[styles.finishButton, saving && styles.buttonDisabled]}
          onPress={handleFinish}
          disabled={saving}
          activeOpacity={0.8}
        >
          <Text style={styles.finishButtonText}>
            {saving ? '⏳ Guardando...' : '✅ Listo'}
          </Text>
        </TouchableOpacity>
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
    paddingBottom: 120,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iceBreakCard: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    padding: 28,
    marginTop: 20,
    marginBottom: 20,
    alignItems: 'center',
    boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
  },
  iceBreakIcon: {
    fontSize: 72,
    marginBottom: 12,
  },
  iceBreakTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 10,
    textAlign: 'center',
  },
  iceBreakSubtitle: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    lineHeight: 24,
  },
  evaluationCard: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    padding: 24,
    alignItems: 'center',
  },
  evaluationIcon: {
    fontSize: 56,
    marginBottom: 12,
  },
  evaluationTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 10,
    textAlign: 'center',
  },
  evaluationText: {
    fontSize: 17,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  participantsRatingSection: {
    width: '100%',
  },
  participantRatingCard: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    padding: 16,
    marginBottom: 12,
  },
  participantRatingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  participantRatingPhoto: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
  },
  participantRatingPhotoPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  participantRatingPhotoPlaceholderText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  participantRatingName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  starButton: {
    padding: 2,
  },
  starIcon: {
    fontSize: 28,
    opacity: 0.3,
  },
  starIconSelected: {
    opacity: 1,
  },
  ratingConfirmation: {
    fontSize: 14,
    color: '#A5F3C4',
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 8,
  },
  finishButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
    paddingVertical: 18,
    paddingHorizontal: 32,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 40,
  },
  finishButtonText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
