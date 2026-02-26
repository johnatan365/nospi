
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';

type QuestionLevel = 'divertido' | 'sensual' | 'atrevido';
type GamePhase = 'questions' | 'match_selection' | 'free_phase';

interface Participant {
  id: string;
  user_id: string;
  name: string;
  profile_photo_url: string | null;
  occupation: string;
  confirmed: boolean;
  check_in_time: string | null;
  presented: boolean;
}

interface Appointment {
  id: string;
  event_id: string;
  event: {
    id: string;
    game_phase?: string;
    current_level?: QuestionLevel;
    current_question_index?: number;
    answered_users?: string[];
    current_question?: string;
    current_question_starter_id?: string;
    ready_users?: string[];
  };
}

interface GameDynamicsScreenProps {
  appointment: Appointment;
  activeParticipants: Participant[];
}

const DEFAULT_QUESTIONS = {
  divertido: [
    '¿Cuál es tu nombre y a qué te dedicas?',
    '¿Cuál es tu mayor sueño?',
    '¿Qué te hace reír sin control?',
  ],
  sensual: [
    '¿Qué te atrae de una persona?',
    '¿Cuál es tu idea de una cita perfecta?',
  ],
  atrevido: [
    '¿Cuál es tu secreto mejor guardado?',
    '¿Qué es lo más loco que has hecho por amor?',
  ],
};

let QUESTIONS = { ...DEFAULT_QUESTIONS };

export default function GameDynamicsScreen({ appointment, activeParticipants }: GameDynamicsScreenProps) {
  console.log('🎮 GameDynamicsScreen render - activeParticipants:', activeParticipants.length);
  
  const [gamePhase, setGamePhase] = useState<GamePhase>('questions');
  const [currentLevel, setCurrentLevel] = useState<QuestionLevel>('divertido');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
  const [starterParticipant, setStarterParticipant] = useState<Participant | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userRatings, setUserRatings] = useState<{ [userId: string]: number }>({});
  
  // Level transition animation state
  const [showLevelTransition, setShowLevelTransition] = useState(false);
  const [transitionLevel, setTransitionLevel] = useState<QuestionLevel | null>(null);
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        console.log('🎮 Current user ID:', user.id);
      }
    };
    getCurrentUser();

    const loadQuestions = async () => {
      try {
        console.log('📚 Loading questions for event:', appointment.event_id);
        
        const { data: eventQuestions, error: eventError } = await supabase
          .from('event_questions')
          .select('*')
          .eq('event_id', appointment.event_id)
          .order('level', { ascending: true })
          .order('question_order', { ascending: true });

        if (eventError) {
          console.error('Error loading event questions:', eventError);
        }

        if (eventQuestions && eventQuestions.length > 0) {
          const questionsByLevel: any = {
            divertido: [],
            sensual: [],
            atrevido: [],
          };

          eventQuestions.forEach((q: any) => {
            if (questionsByLevel[q.level]) {
              questionsByLevel[q.level].push(q.question_text);
            }
          });

          if (
            questionsByLevel.divertido.length > 0 &&
            questionsByLevel.sensual.length > 0 &&
            questionsByLevel.atrevido.length > 0
          ) {
            QUESTIONS = questionsByLevel;
            console.log('✅ Event-specific questions loaded');
            return;
          }
        }

        console.log('📚 Loading default questions');
        const { data: defaultQuestions, error: defaultError } = await supabase
          .from('event_questions')
          .select('*')
          .is('event_id', null)
          .order('level', { ascending: true })
          .order('question_order', { ascending: true });

        if (defaultError) {
          console.error('Error loading default questions:', defaultError);
          return;
        }

        if (defaultQuestions && defaultQuestions.length > 0) {
          const questionsByLevel: any = {
            divertido: [],
            sensual: [],
            atrevido: [],
          };

          defaultQuestions.forEach((q: any) => {
            if (questionsByLevel[q.level]) {
              questionsByLevel[q.level].push(q.question_text);
            }
          });

          if (
            questionsByLevel.divertido.length > 0 &&
            questionsByLevel.sensual.length > 0 &&
            questionsByLevel.atrevido.length > 0
          ) {
            QUESTIONS = questionsByLevel;
            console.log('✅ Default questions loaded from database');
          }
        }
      } catch (error) {
        console.error('Failed to load questions:', error);
      }
    };

    loadQuestions();
  }, [appointment.event_id]);

  // Restore state from event_state
  useEffect(() => {
    if (!appointment?.event_id) return;

    console.log('🔄 Restoring state from database');
    
    const restoreStateFromDatabase = async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('id', appointment.event_id)
        .single();

      if (error) {
        console.error('❌ Error fetching event state:', error);
        return;
      }

      if (!data) {
        console.log('❌ No event data found');
        return;
      }

      console.log('✅ Event state fetched:', {
        game_phase: data.game_phase,
        current_level: data.current_level,
        current_question_index: data.current_question_index,
      });

      // Derive UI from event_state
      if (data.game_phase === 'match_selection') {
        console.log('🔄 Restoring match_selection phase');
        setGamePhase('match_selection');
        setCurrentLevel(data.current_level || 'divertido');
      } else if (data.game_phase === 'question_active' || data.game_phase === 'questions') {
        console.log('🔄 Restoring questions phase');
        setGamePhase('questions');
        setCurrentLevel(data.current_level || 'divertido');
        setCurrentQuestionIndex(data.current_question_index || 0);
        setCurrentQuestion(data.current_question || null);
        
        if (data.current_question_starter_id) {
          const starter = activeParticipants.find((p) => p.user_id === data.current_question_starter_id);
          setStarterParticipant(starter || null);
        }
      } else if (data.game_phase === 'free_phase') {
        console.log('🔄 Restoring free_phase');
        setGamePhase('free_phase');
      }
    };

    restoreStateFromDatabase();
  }, [appointment?.event_id, activeParticipants]);

  // Subscribe to event_state changes
  useEffect(() => {
    if (!appointment?.event_id) return;

    console.log('📡 Subscribing to event_state');

    const channel = supabase
      .channel(`game_${appointment.event_id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'events',
          filter: `id=eq.${appointment.event_id}`,
        },
        (payload) => {
          console.log('📡 Event_state update');
          const newEvent = payload.new as any;
          
          if (newEvent.game_phase === 'questions' || newEvent.game_phase === 'question_active') {
            console.log('📡 Updating to questions phase');
            setGamePhase('questions');
            setCurrentLevel(newEvent.current_level || 'divertido');
            setCurrentQuestionIndex(newEvent.current_question_index || 0);
            setCurrentQuestion(newEvent.current_question || null);
            
            if (newEvent.current_question_starter_id) {
              const starter = activeParticipants.find((p) => p.user_id === newEvent.current_question_starter_id);
              setStarterParticipant(starter || null);
            }
          } else if (newEvent.game_phase === 'match_selection') {
            console.log('📡 Updating to match_selection phase');
            setGamePhase('match_selection');
            setCurrentLevel(newEvent.current_level || 'divertido');
          } else if (newEvent.game_phase === 'free_phase') {
            console.log('📡 Updating to free_phase');
            setGamePhase('free_phase');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [appointment?.event_id, activeParticipants]);

  // Level transition animation function
  const showLevelTransitionAnimation = useCallback((level: QuestionLevel) => {
    console.log('🎬 Showing level transition animation for:', level);
    
    setTransitionLevel(level);
    setShowLevelTransition(true);
    
    // Reset animations
    scaleAnim.setValue(0);
    fadeAnim.setValue(0);
    
    // Animate in
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Hold for 2 seconds
      setTimeout(() => {
        // Animate out
        Animated.parallel([
          Animated.timing(scaleAnim, {
            toValue: 1.2,
            duration: 300,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 300,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
        ]).start(() => {
          setShowLevelTransition(false);
          setTransitionLevel(null);
        });
      }, 2000);
    });
  }, [scaleAnim, fadeAnim]);

  const handleContinue = useCallback(async () => {
    console.log('➡️ User pressed Continuar button in questions phase');
    
    if (!appointment?.event_id || loading) return;

    const questionsForLevel = QUESTIONS[currentLevel];
    const nextQuestionIndex = currentQuestionIndex + 1;

    // CRITICAL FIX: Immediately set loading state for instant UI feedback
    setLoading(true);

    try {
      if (nextQuestionIndex < questionsForLevel.length) {
        // Continue to next question in same level
        const randomIndex = Math.floor(Math.random() * activeParticipants.length);
        const newStarterUserId = activeParticipants[randomIndex].user_id;
        const nextQuestion = questionsForLevel[nextQuestionIndex];

        // CRITICAL FIX: Immediately update local state BEFORE database call
        console.log('✅ IMMEDIATELY advancing to next question (optimistic update)');
        setCurrentQuestionIndex(nextQuestionIndex);
        setCurrentQuestion(nextQuestion);
        const newStarter = activeParticipants.find(p => p.user_id === newStarterUserId);
        setStarterParticipant(newStarter || null);

        const { error } = await supabase
          .from('events')
          .update({
            current_question_index: nextQuestionIndex,
            answered_users: [],
            current_question: nextQuestion,
            current_question_starter_id: newStarterUserId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', appointment.event_id);

        if (error) {
          console.error('❌ Error advancing question:', error);
          // Revert optimistic update on error
          setCurrentQuestionIndex(currentQuestionIndex);
          setCurrentQuestion(currentQuestion);
          setLoading(false);
          return;
        }

        console.log('✅ Advanced to next question in database');
        
      } else {
        // Level completed - advance to next level or free phase
        console.log('⚡ Level finished - advancing to next level');

        const nextLevel: QuestionLevel = 
          currentLevel === 'divertido' ? 'sensual' :
          currentLevel === 'sensual' ? 'atrevido' : 'atrevido';

        if (currentLevel === 'divertido' || currentLevel === 'sensual') {
          // Advance to next level
          console.log('➡️ Advancing to level', nextLevel);
          
          // CRITICAL: Show level transition animation BEFORE updating database
          showLevelTransitionAnimation(nextLevel);
          
          const randomIndex = Math.floor(Math.random() * activeParticipants.length);
          const newStarterUserId = activeParticipants[randomIndex].user_id;
          const firstQuestion = QUESTIONS[nextLevel][0];

          // CRITICAL FIX: Immediately update local state BEFORE database call
          console.log('✅ IMMEDIATELY transitioning to next level (optimistic update)');
          setGamePhase('questions');
          setCurrentLevel(nextLevel);
          setCurrentQuestionIndex(0);
          setCurrentQuestion(firstQuestion);
          const newStarter = activeParticipants.find(p => p.user_id === newStarterUserId);
          setStarterParticipant(newStarter || null);

          const { error } = await supabase
            .from('events')
            .update({
              game_phase: 'questions',
              current_level: nextLevel,
              current_question_index: 0,
              answered_users: [],
              current_question: firstQuestion,
              current_question_starter_id: newStarterUserId,
              updated_at: new Date().toISOString(),
            })
            .eq('id', appointment.event_id);

          if (error) {
            console.error('❌ Error starting next level:', error);
            // Revert optimistic update on error
            setGamePhase('questions');
            setCurrentLevel(currentLevel);
            setCurrentQuestionIndex(questionsForLevel.length - 1);
            setLoading(false);
            return;
          }

          console.log('✅ Started next level in database');
          
        } else {
          // All levels complete - go to free phase
          console.log('🏁 All levels complete - transitioning to free_phase');
          
          // CRITICAL FIX: Immediately update local state BEFORE database call
          console.log('✅ IMMEDIATELY transitioning to free_phase (optimistic update)');
          setGamePhase('free_phase');
          
          const { error } = await supabase
            .from('events')
            .update({
              game_phase: 'free_phase',
              updated_at: new Date().toISOString(),
            })
            .eq('id', appointment.event_id);

          if (error) {
            console.error('❌ Error ending game:', error);
            // Revert optimistic update on error
            setGamePhase('questions');
            setLoading(false);
            return;
          }

          console.log('✅ Game ended in database');
        }
      }
    } catch (error) {
      console.error('❌ Unexpected error:', error);
    } finally {
      setLoading(false);
    }
  }, [appointment, currentLevel, currentQuestionIndex, activeParticipants, loading, currentQuestion, showLevelTransitionAnimation]);

  const handleRateUser = useCallback(async (ratedUserId: string, rating: number) => {
    if (!appointment?.event_id || !currentUserId) return;

    console.log('⭐ Rating user:', ratedUserId, 'with', rating, 'stars');

    try {
      const { error } = await supabase
        .from('event_ratings')
        .upsert(
          {
            event_id: appointment.event_id,
            rater_user_id: currentUserId,
            rated_user_id: ratedUserId,
            rating: rating,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'event_id,rater_user_id,rated_user_id',
          }
        );

      if (error) {
        console.error('❌ Error saving rating:', error);
        return;
      }

      console.log('✅ Rating saved successfully');
      
      setUserRatings((prev) => ({
        ...prev,
        [ratedUserId]: rating,
      }));
    } catch (error) {
      console.error('❌ Failed to save rating:', error);
    }
  }, [appointment, currentUserId]);

  const handleFinishEvent = useCallback(async () => {
    console.log('🏁 User pressed Finalizar button');
    
    if (!appointment?.event_id || !currentUserId || loading) return;

    console.log('🏁 Finishing event individually - moving ONLY this user\'s appointment to anterior');
    
    // CRITICAL FIX: Immediately set loading state for instant UI feedback
    setLoading(true);

    try {
      // CRITICAL FIX: Immediately update local state BEFORE database call (optimistic update)
      console.log('✅ IMMEDIATELY showing finalization feedback (optimistic update)');
      
      // Perform database update
      // Only update THIS user's appointment to 'anterior'
      // Do NOT close the event or affect other users
      const { error: appointmentError } = await supabase
        .from('appointments')
        .update({ status: 'anterior' })
        .eq('event_id', appointment.event_id)
        .eq('user_id', currentUserId)
        .eq('status', 'confirmada');

      if (appointmentError) {
        console.error('❌ Error updating user appointment to anterior:', appointmentError);
        setLoading(false);
        return;
      }
      
      console.log('✅ User appointment moved to anterior status - event continues for other users');
      console.log('✅ User finished event individually - they will no longer see this event');
      
      // CRITICAL FIX: The appointment status change will be detected by the realtime subscription
      // in interaccion.tsx, which will clear the appointment from view
      // Keep loading state true so user sees feedback while realtime processes
      
    } catch (error) {
      console.error('❌ Unexpected error finishing event:', error);
      setLoading(false);
    }
    // Note: We keep loading=true because the realtime subscription will handle the UI transition
  }, [appointment, currentUserId, loading]);

  const levelEmoji = currentLevel === 'divertido' ? '😄' : currentLevel === 'sensual' ? '💕' : '🔥';
  const levelName = currentLevel === 'divertido' ? 'Divertido' : currentLevel === 'sensual' ? 'Sensual' : 'Atrevido';
  
  const transitionLevelEmoji = transitionLevel === 'divertido' ? '😄' : transitionLevel === 'sensual' ? '💕' : '🔥';
  const transitionLevelName = transitionLevel === 'divertido' ? 'Divertido' : transitionLevel === 'sensual' ? 'Sensual' : 'Atrevido';

  console.log('🎮 Rendering decision - gamePhase:', gamePhase);

  // MATCH SELECTION DISABLED - Skip this phase entirely
  if (gamePhase === 'match_selection') {
    console.log('🎮 Match selection phase detected but DISABLED - showing loading');
    
    return (
      <LinearGradient
        colors={['#FFFFFF', '#F3E8FF', '#E9D5FF']}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <View style={styles.container}>
          <ActivityIndicator size="large" color={nospiColors.purpleDark} />
          <Text style={{ textAlign: 'center', marginTop: 20, color: nospiColors.purpleDark }}>
            Cargando...
          </Text>
        </View>
      </LinearGradient>
    );
  }

  if (gamePhase === 'questions' && currentQuestion) {
    const starterName = starterParticipant?.name || 'Alguien';

    return (
      <LinearGradient
        colors={['#FFFFFF', '#F3E8FF', '#E9D5FF']}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
          <View style={styles.levelBadge}>
            <Text style={styles.levelEmoji}>{levelEmoji}</Text>
            <Text style={styles.levelText}>{levelName}</Text>
          </View>

          <View style={styles.questionCard}>
            <Text style={styles.questionIcon}>❓</Text>
            <Text style={styles.questionText}>{currentQuestion}</Text>
          </View>

          <View style={styles.starterCard}>
            <Text style={styles.starterLabelWhite}>Empieza:</Text>
            <Text style={styles.starterNameWhite}>{starterName}</Text>
            <Text style={styles.starterInstructionWhite}>y luego continúa hacia la derecha</Text>
          </View>

          <View style={styles.instructionCard}>
            <Text style={styles.instructionText}>
              Presionen continuar cuando todos contesten esta pregunta
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.continueButton, loading && styles.buttonDisabled]}
            onPress={handleContinue}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Text style={styles.continueButtonText}>
              {loading ? '⏳ Cargando...' : '➡️ Continuar'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
        
        {/* Level Transition Animation Overlay */}
        {showLevelTransition && transitionLevel && (
          <View style={styles.transitionOverlay}>
            <Animated.View
              style={[
                styles.transitionCard,
                {
                  transform: [{ scale: scaleAnim }],
                  opacity: fadeAnim,
                },
              ]}
            >
              <Text style={styles.transitionEmoji}>{transitionLevelEmoji}</Text>
              <Text style={styles.transitionTitle}>Siguiente Nivel</Text>
              <Text style={styles.transitionLevel}>{transitionLevelName}</Text>
            </Animated.View>
          </View>
        )}
      </LinearGradient>
    );
  }

  if (gamePhase === 'free_phase') {
    return (
      <LinearGradient
        colors={['#1a0b2e', '#2d1b4e', '#4a2c6e']}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
          <View style={styles.iceBreakCard}>
            <Text style={styles.iceBreakIcon}>✨</Text>
            <Text style={styles.iceBreakTitle}>¡Ya rompieron el hielo!</Text>
            <Text style={styles.iceBreakSubtitle}>
              Ahora disfruten el resto de la noche y déjense sorprender 💜
            </Text>
          </View>

          <View style={styles.evaluationCard}>
            <Text style={styles.evaluationIcon}>⭐</Text>
            <Text style={styles.evaluationTitle}>Evalúa tu experiencia</Text>
            <Text style={styles.evaluationText}>
              Puedes calificar a los demás participantes.
            </Text>
            
            <View style={styles.participantsRatingSection}>
              {activeParticipants
                .filter((p) => p.user_id !== currentUserId)
                .map((participant, index) => {
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
          </View>

          <TouchableOpacity
            style={[styles.finishButton, loading && styles.buttonDisabled]}
            onPress={handleFinishEvent}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Text style={styles.finishButtonText}>
              {loading ? '⏳ Finalizando...' : '✅ Finalizar'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </LinearGradient>
    );
  }

  return null;
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
  levelBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 16,
    marginTop: 80,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  levelText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
  },
  questionCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 24,
    padding: 32,
    marginBottom: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  questionIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  questionText: {
    fontSize: 24,
    fontWeight: '600',
    color: nospiColors.purpleDark,
    textAlign: 'center',
  },
  starterCard: {
    backgroundColor: nospiColors.purpleMid,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
  },
  starterLabelWhite: {
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 8,
  },
  starterNameWhite: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  starterInstructionWhite: {
    fontSize: 14,
    color: '#FFFFFF',
    fontStyle: 'italic',
  },
  instructionCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
  },
  instructionText: {
    fontSize: 16,
    color: nospiColors.purpleDark,
    textAlign: 'center',
    fontWeight: '600',
    lineHeight: 24,
  },
  continueButton: {
    backgroundColor: '#10B981',
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 32,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  continueButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  transitionOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  transitionCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderRadius: 32,
    padding: 48,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 20,
    minWidth: 280,
  },
  transitionEmoji: {
    fontSize: 100,
    marginBottom: 24,
  },
  transitionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
    textAlign: 'center',
  },
  transitionLevel: {
    fontSize: 36,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    textAlign: 'center',
  },
  iceBreakCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 24,
    padding: 28,
    marginTop: 60,
    marginBottom: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  iceBreakIcon: {
    fontSize: 72,
    marginBottom: 12,
  },
  iceBreakTitle: {
    fontSize: 30,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 10,
    textAlign: 'center',
  },
  iceBreakSubtitle: {
    fontSize: 17,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  evaluationCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
  },
  evaluationIcon: {
    fontSize: 56,
    marginBottom: 12,
  },
  evaluationTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 12,
    textAlign: 'center',
  },
  evaluationText: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  participantsRatingSection: {
    width: '100%',
  },
  participantRatingCard: {
    backgroundColor: 'rgba(233, 213, 255, 0.5)',
    borderRadius: 16,
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
    backgroundColor: nospiColors.purpleLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  participantRatingPhotoPlaceholderText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
  },
  participantRatingName: {
    fontSize: 17,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
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
    fontSize: 12,
    color: '#10B981',
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 8,
  },
  finishButton: {
    backgroundColor: '#10B981',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 32,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 40,
  },
  finishButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});
