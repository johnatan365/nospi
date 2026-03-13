
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';

type QuestionLevel = 'divertido' | 'sensual' | 'atrevido';
type GamePhase = 'questions' | 'level_transition' | 'finished' | 'free_phase';

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

const TIMER_DURATION = 60;

export default function GameDynamicsScreen({ appointment, activeParticipants }: GameDynamicsScreenProps) {
  
  const [gamePhase, setGamePhase] = useState<GamePhase>('questions');
  const [currentLevel, setCurrentLevel] = useState<QuestionLevel>('divertido');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
  const [starterParticipant, setStarterParticipant] = useState<Participant | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userRatings, setUserRatings] = useState<{ [userId: string]: number }>({});

  // Countdown timer state
  const [timeLeft, setTimeLeft] = useState(TIMER_DURATION);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
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
      }
    };
    getCurrentUser();

    const loadQuestions = async () => {
      try {
        
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
            return;
          }
        }

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
        return;
      }


      // Derive UI from event_state
      if (data.game_phase === 'question_active' || data.game_phase === 'questions') {
        setGamePhase('questions');
        setCurrentLevel(data.current_level || 'divertido');
        setCurrentQuestionIndex(data.current_question_index || 0);
        setCurrentQuestion(data.current_question || null);
        
        if (data.current_question_starter_id) {
          const starter = activeParticipants.find((p) => p.user_id === data.current_question_starter_id);
          setStarterParticipant(starter || null);
        }
      } else if (data.game_phase === 'level_transition') {
        setGamePhase('level_transition');
      } else if (data.game_phase === 'finished') {
        setGamePhase('finished');
      } else if (data.game_phase === 'free_phase') {
        setGamePhase('free_phase');
      }
    };

    restoreStateFromDatabase();
  }, [appointment?.event_id, activeParticipants]);

  // Subscribe to event_state changes
  useEffect(() => {
    if (!appointment?.event_id) return;


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
          const newEvent = payload.new as any;
          
          if (newEvent.game_phase === 'questions' || newEvent.game_phase === 'question_active') {
            setGamePhase('questions');
            setCurrentLevel(newEvent.current_level || 'divertido');
            setCurrentQuestionIndex(newEvent.current_question_index || 0);
            setCurrentQuestion(newEvent.current_question || null);
            
            if (newEvent.current_question_starter_id) {
              const starter = activeParticipants.find((p) => p.user_id === newEvent.current_question_starter_id);
              setStarterParticipant(starter || null);
            }
          } else if (newEvent.game_phase === 'level_transition') {
            setGamePhase('level_transition');
          } else if (newEvent.game_phase === 'finished') {
            setGamePhase('finished');
          } else if (newEvent.game_phase === 'free_phase') {
            setGamePhase('free_phase');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [appointment?.event_id, activeParticipants]);

  // Countdown timer logic
  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeLeft(TIMER_DURATION);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          console.log('[Timer] Countdown reached 0 — revealing continue button');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // Reset timer whenever the question changes
  useEffect(() => {
    if (gamePhase === 'questions' && currentQuestion) {
      console.log(`[Timer] Starting 60s countdown for question index ${currentQuestionIndex}`);
      startTimer();
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentQuestionIndex, currentQuestion, gamePhase, startTimer]);

  // Level transition animation function
  const showLevelTransitionAnimation = useCallback((level: QuestionLevel) => {
    
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

        
      } else {
        // Level completed - advance to next level or free phase

        const nextLevel: QuestionLevel = 
          currentLevel === 'divertido' ? 'sensual' :
          currentLevel === 'sensual' ? 'atrevido' : 'atrevido';

        if (currentLevel === 'divertido' || currentLevel === 'sensual') {
          // Advance to next level
          
          // CRITICAL: Show level transition animation BEFORE updating database
          showLevelTransitionAnimation(nextLevel);
          
          const randomIndex = Math.floor(Math.random() * activeParticipants.length);
          const newStarterUserId = activeParticipants[randomIndex].user_id;
          const firstQuestion = QUESTIONS[nextLevel][0];

          // CRITICAL FIX: Immediately update local state BEFORE database call
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

          
        } else {
          // All levels complete - go to free phase
          
          // CRITICAL FIX: Immediately update local state BEFORE database call
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

      
      setUserRatings((prev) => ({
        ...prev,
        [ratedUserId]: rating,
      }));
    } catch (error) {
      console.error('❌ Failed to save rating:', error);
    }
  }, [appointment, currentUserId]);

  const handleFinishEvent = useCallback(async () => {
    
    if (!appointment?.event_id || !currentUserId || loading) return;

    
    // CRITICAL FIX: Immediately set loading state for instant UI feedback
    setLoading(true);

    try {
      
      // CRITICAL FIX: Update ONLY this user's appointment to 'anterior'
      // Do NOT close the event or affect other users
      const { error: appointmentError } = await supabase
        .from('appointments')
        .update({ 
          status: 'anterior',
          updated_at: new Date().toISOString()
        })
        .eq('event_id', appointment.event_id)
        .eq('user_id', currentUserId)
        .eq('status', 'confirmada');

      if (appointmentError) {
        console.error('❌ Error updating user appointment to anterior:', appointmentError);
        setLoading(false);
        return;
      }
      
      
      // Keep loading state true - the realtime subscription will handle the UI update
      // and the component will unmount when appointment is cleared
      
    } catch (error) {
      console.error('❌ Unexpected error finishing event:', error);
      setLoading(false);
    }
  }, [appointment, currentUserId, loading]);

  const levelEmoji = currentLevel === 'divertido' ? '😄' : currentLevel === 'sensual' ? '💕' : '🔥';
  const levelName = currentLevel === 'divertido' ? 'Divertido' : currentLevel === 'sensual' ? 'Sensual' : 'Atrevido';
  
  const transitionLevelEmoji = transitionLevel === 'divertido' ? '😄' : transitionLevel === 'sensual' ? '💕' : '🔥';
  const transitionLevelName = transitionLevel === 'divertido' ? 'Divertido' : transitionLevel === 'sensual' ? 'Sensual' : 'Atrevido';

  const timerColor = timeLeft > 30 ? '#10B981' : timeLeft > 10 ? '#F59E0B' : '#EF4444';
  const timerLabel = `${timeLeft}s`;
  const timerExpired = timeLeft === 0;




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
            <Text style={styles.questionText}>{currentQuestion}</Text>

            {/* Countdown timer badge */}
            <View style={[styles.timerBadge, { borderColor: timerColor }]}>
              <Text style={[styles.timerNumber, { color: timerColor }]}>{timerLabel}</Text>
            </View>
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

          {timerExpired ? (
            <>
              <TouchableOpacity
                style={[styles.continueButton, loading && styles.buttonDisabled]}
                onPress={() => {
                  console.log('[Button] Continuar pressed');
                  handleContinue();
                }}
                disabled={loading}
                activeOpacity={0.8}
              >
                <Text style={styles.continueButtonText}>
                  {loading ? '⏳ Cargando...' : '➡️ Continuar'}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={[styles.continueButton, styles.continueButtonWaiting]}>
              <Text style={styles.continueButtonTextWaiting}>
                Espera el tiempo...
              </Text>
            </View>
          )}
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

  if (gamePhase === 'level_transition' || gamePhase === 'finished') {
    const isFinished = gamePhase === 'finished';
    const nextLevelEmoji = currentLevel === 'divertido' ? '💕' : currentLevel === 'sensual' ? '🔥' : '✨';
    const nextLevelName = currentLevel === 'divertido' ? 'Sensual' : currentLevel === 'sensual' ? 'Atrevido' : 'Fase libre';

    return (
      <LinearGradient
        colors={['#1a0b2e', '#2d1b4e', '#4a2c6e']}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <View style={styles.transitionFullScreen}>
          <Text style={styles.transitionFullEmoji}>
            {isFinished ? '🎉' : nextLevelEmoji}
          </Text>
          <Text style={styles.transitionFullTitle}>
            {isFinished ? '¡Lo lograron!' : 'Siguiente nivel'}
          </Text>
          <Text style={styles.transitionFullSubtitle}>
            {isFinished
              ? 'Completaron todos los niveles. Ahora disfruten la noche 💜'
              : `Se viene el nivel ${nextLevelName}. ¡Prepárense!`}
          </Text>
          <ActivityIndicator size="small" color="rgba(255,255,255,0.6)" style={{ marginTop: 32 }} />
        </View>
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
    fontSize: 28,
    fontWeight: '700',
    color: nospiColors.purpleDark,
    textAlign: 'center',
    lineHeight: 38,
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
  timerBadge: {
    marginTop: 20,
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  timerNumber: {
    fontSize: 28,
    fontWeight: '800',
  },
  tiempoCard: {
    backgroundColor: '#EF4444',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginBottom: 12,
  },
  tiempoText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
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
  continueButtonWaiting: {
    backgroundColor: 'rgba(0,0,0,0.12)',
    shadowOpacity: 0,
    elevation: 0,
  },
  continueButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  continueButtonTextWaiting: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(0,0,0,0.35)',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  transitionFullScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  transitionFullEmoji: {
    fontSize: 80,
    marginBottom: 24,
  },
  transitionFullTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
  },
  transitionFullSubtitle: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    lineHeight: 26,
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
