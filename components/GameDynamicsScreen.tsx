
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import MatchSelectionScreen from './MatchSelectionScreen';

type QuestionLevel = 'divertido' | 'sensual' | 'atrevido';
type GamePhase = 'ready' | 'questions' | 'match_selection' | 'free_phase';

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
    current_level?: number;
    current_question_index?: number;
    answered_users?: string[];
    current_question?: string;
    current_question_starter_id?: string;
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
  console.log('🎮 === GAME DYNAMICS SCREEN V2 ===');
  
  const [gamePhase, setGamePhase] = useState<GamePhase>('ready');
  const [currentLevel, setCurrentLevel] = useState<number>(1);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answeredUsers, setAnsweredUsers] = useState<string[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
  const [starterParticipant, setStarterParticipant] = useState<Participant | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userRatings, setUserRatings] = useState<{ [userId: string]: number }>({});

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

  // PHASE 5: Restore state from event_state
  useEffect(() => {
    if (!appointment?.event_id) return;

    console.log('🔄 === RESTORING STATE FROM DATABASE ===');
    
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

      // PHASE 5: Derive UI from event_state
      if (data.game_phase === 'match_selection') {
        console.log('🔄 Restoring match_selection phase');
        setGamePhase('match_selection');
        setCurrentLevel(data.current_level || 1);
      } else if (data.game_phase === 'question_active' || data.game_phase === 'questions') {
        console.log('🔄 Restoring questions phase');
        setGamePhase('questions');
        setCurrentLevel(data.current_level || 1);
        setCurrentQuestionIndex(data.current_question_index || 0);
        setAnsweredUsers(data.answered_users || []);
        setCurrentQuestion(data.current_question || null);
        
        if (data.current_question_starter_id) {
          const starter = activeParticipants.find((p) => p.user_id === data.current_question_starter_id);
          setStarterParticipant(starter || null);
        }
      } else if (data.game_phase === 'free_phase') {
        console.log('🔄 Restoring free_phase');
        setGamePhase('free_phase');
      } else {
        console.log('🔄 Restoring ready phase');
        setGamePhase('ready');
      }
    };

    restoreStateFromDatabase();
  }, [appointment?.event_id, activeParticipants]);

  // Subscribe to event_state changes
  useEffect(() => {
    if (!appointment?.event_id) return;

    console.log('📡 === SUBSCRIBING TO EVENT_STATE ===');

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
          console.log('📡 === EVENT_STATE UPDATE ===');
          const newEvent = payload.new as any;
          
          if (newEvent.game_phase === 'questions' || newEvent.game_phase === 'question_active') {
            console.log('📡 Updating to questions phase');
            setGamePhase('questions');
            setCurrentLevel(newEvent.current_level || 1);
            setCurrentQuestionIndex(newEvent.current_question_index || 0);
            setAnsweredUsers(newEvent.answered_users || []);
            setCurrentQuestion(newEvent.current_question || null);
            
            if (newEvent.current_question_starter_id) {
              const starter = activeParticipants.find((p) => p.user_id === newEvent.current_question_starter_id);
              setStarterParticipant(starter || null);
            }
          } else if (newEvent.game_phase === 'match_selection') {
            console.log('📡 Updating to match_selection phase');
            setGamePhase('match_selection');
            setCurrentLevel(newEvent.current_level || 1);
          } else if (newEvent.game_phase === 'free_phase') {
            console.log('📡 Updating to free_phase');
            setGamePhase('free_phase');
          } else if (newEvent.game_phase === 'ready') {
            console.log('📡 Updating to ready phase');
            setGamePhase('ready');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [appointment?.event_id, activeParticipants]);

  const handleStartDynamic = useCallback(async () => {
    console.log('🎮 === STARTING DYNAMIC ===');
    
    if (!appointment?.event_id || activeParticipants.length < 2) {
      console.warn('⚠️ Cannot start - need at least 2 participants');
      return;
    }

    setLoading(true);
    
    const randomIndex = Math.floor(Math.random() * activeParticipants.length);
    const starterUserId = activeParticipants[randomIndex].user_id;
    const starter = activeParticipants[randomIndex];
    const firstQuestion = QUESTIONS.divertido[0];
    
    setGamePhase('questions');
    setCurrentLevel(1);
    setCurrentQuestionIndex(0);
    setAnsweredUsers([]);
    setCurrentQuestion(firstQuestion);
    setStarterParticipant(starter);
    
    try {
      const { error } = await supabase
        .from('events')
        .update({
          game_phase: 'questions',
          current_level: 1,
          current_question_index: 0,
          answered_users: [],
          current_question: firstQuestion,
          current_question_starter_id: starterUserId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', appointment.event_id);

      if (error) {
        console.error('❌ Error starting dynamic:', error);
        setGamePhase('ready');
        return;
      }

      console.log('✅ Dynamic started successfully');
    } catch (error) {
      console.error('❌ Unexpected error:', error);
      setGamePhase('ready');
    } finally {
      setLoading(false);
    }
  }, [appointment, activeParticipants]);

  const handleAnswered = useCallback(async () => {
    console.log('✅ === USER MARKING AS ANSWERED ===');
    
    if (!appointment?.event_id || !currentUserId) {
      console.warn('⚠️ Cannot mark as answered');
      return;
    }
    
    if (answeredUsers.includes(currentUserId)) {
      console.log('⚠️ User already answered');
      return;
    }
    
    const newAnsweredUsers = [...answeredUsers, currentUserId];
    setAnsweredUsers(newAnsweredUsers);
    
    try {
      const { error } = await supabase
        .from('events')
        .update({
          answered_users: newAnsweredUsers,
          updated_at: new Date().toISOString(),
        })
        .eq('id', appointment.event_id);

      if (error) {
        console.error('❌ Error updating answered users:', error);
        setAnsweredUsers(answeredUsers);
        return;
      }

      console.log('✅ User marked as answered successfully');
    } catch (error) {
      console.error('❌ Unexpected error:', error);
      setAnsweredUsers(answeredUsers);
    }
  }, [appointment, currentUserId, answeredUsers]);

  const handleContinue = useCallback(async () => {
    console.log('➡️ === CONTINUING ===');
    
    if (!appointment?.event_id) return;

    const levelKey = currentLevel === 1 ? 'divertido' : currentLevel === 2 ? 'sensual' : 'atrevido';
    const questionsForLevel = QUESTIONS[levelKey];
    const nextQuestionIndex = currentQuestionIndex + 1;

    setLoading(true);

    try {
      if (nextQuestionIndex < questionsForLevel.length) {
        // Next question in same level
        const randomIndex = Math.floor(Math.random() * activeParticipants.length);
        const newStarterUserId = activeParticipants[randomIndex].user_id;
        const newStarter = activeParticipants[randomIndex];
        const nextQuestion = questionsForLevel[nextQuestionIndex];

        setCurrentQuestionIndex(nextQuestionIndex);
        setAnsweredUsers([]);
        setCurrentQuestion(nextQuestion);
        setStarterParticipant(newStarter);

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
          return;
        }

        console.log('✅ Advanced to next question');
      } else {
        // Level finished - transition to match selection
        console.log('⚡ Transitioning to match_selection');
        
        setGamePhase('match_selection');

        const { error } = await supabase
          .from('events')
          .update({
            game_phase: 'match_selection',
            updated_at: new Date().toISOString(),
          })
          .eq('id', appointment.event_id);

        if (error) {
          console.error('❌ Error transitioning to match selection:', error);
          return;
        }

        console.log('✅ Level finished - transitioned to match selection');
      }
    } catch (error) {
      console.error('❌ Unexpected error:', error);
    } finally {
      setLoading(false);
    }
  }, [appointment, currentLevel, currentQuestionIndex, activeParticipants]);

  // PHASE 4: Match complete callback
  const handleMatchComplete = useCallback(async (nextLevel: number, nextPhase: 'questions' | 'free_phase') => {
    console.log('💘 === MATCH COMPLETE ===');
    console.log('💘 Next level:', nextLevel, 'Next phase:', nextPhase);
    
    if (!appointment?.event_id) return;

    setLoading(true);

    try {
      if (nextPhase === 'questions') {
        // Continue to next level
        const levelKey = nextLevel === 1 ? 'divertido' : nextLevel === 2 ? 'sensual' : 'atrevido';
        const randomIndex = Math.floor(Math.random() * activeParticipants.length);
        const newStarterUserId = activeParticipants[randomIndex].user_id;
        const firstQuestion = QUESTIONS[levelKey][0];

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
          return;
        }

        console.log('✅ Started next level:', nextLevel);
      } else {
        // All levels complete - end game
        console.log('🏁 All levels complete - transitioning to free_phase');
        
        const { error } = await supabase
          .from('events')
          .update({
            game_phase: 'free_phase',
            updated_at: new Date().toISOString(),
          })
          .eq('id', appointment.event_id);

        if (error) {
          console.error('❌ Error ending game:', error);
          return;
        }

        console.log('✅ Game ended');
      }
    } catch (error) {
      console.error('❌ Unexpected error:', error);
    } finally {
      setLoading(false);
    }
  }, [appointment, activeParticipants]);

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
    if (!appointment?.event_id) return;

    console.log('🏁 === FINISHING EVENT ===');
    setLoading(true);

    try {
      const { data: allAppointments, error: fetchError } = await supabase
        .from('appointments')
        .select('id')
        .eq('event_id', appointment.event_id);

      if (fetchError) {
        console.error('❌ Error fetching appointments:', fetchError);
      } else {
        console.log('📊 Found appointments to update:', allAppointments?.length || 0);
        
        const { error: appointmentsError } = await supabase
          .from('appointments')
          .update({ status: 'anterior' })
          .eq('event_id', appointment.event_id);

        if (appointmentsError) {
          console.error('❌ Error updating appointments:', appointmentsError);
        } else {
          console.log('✅ Moved ALL appointments to anterior status');
        }
      }

      const { error: eventError } = await supabase
        .from('events')
        .update({
          game_phase: 'ready',
          current_level: 1,
          current_question_index: 0,
          answered_users: [],
          current_question: null,
          current_question_starter_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', appointment.event_id);

      if (eventError) {
        console.error('❌ Error resetting event:', eventError);
      } else {
        console.log('✅ Event reset successfully');
      }

      setGamePhase('ready');
      setCurrentLevel(1);
      setCurrentQuestionIndex(0);
      setAnsweredUsers([]);
      setCurrentQuestion(null);
      setStarterParticipant(null);
      setUserRatings({});

      console.log('✅ Event finished successfully');
    } catch (error) {
      console.error('❌ Unexpected error finishing event:', error);
    } finally {
      setLoading(false);
    }
  }, [appointment]);

  const answeredCount = answeredUsers.length;
  const totalCount = activeParticipants.length;
  const allAnswered = answeredCount === totalCount && totalCount > 0;
  const userHasAnswered = currentUserId ? answeredUsers.includes(currentUserId) : false;

  const levelEmoji = currentLevel === 1 ? '😄' : currentLevel === 2 ? '💕' : '🔥';
  const levelName = currentLevel === 1 ? 'Divertido' : currentLevel === 2 ? 'Sensual' : 'Atrevido';

  // Show match selection screen
  if (gamePhase === 'match_selection' && currentUserId) {
    console.log('🎮 Rendering MatchSelectionScreen');
    return (
      <MatchSelectionScreen
        eventId={appointment.event_id}
        currentLevel={currentLevel}
        currentUserId={currentUserId}
        participants={activeParticipants}
        onMatchComplete={handleMatchComplete}
        triggerMatchAnimation={(matchedUserId) => {
          console.log('✨ Match animation triggered for:', matchedUserId);
        }}
      />
    );
  }

  if (gamePhase === 'ready') {
    const canStart = activeParticipants.length >= 2;

    return (
      <LinearGradient
        colors={['#1a0b2e', '#2d1b4e', '#4a2c6e']}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
          <Text style={styles.titleWhite}>Dinámica de Grupo</Text>

          <View style={styles.infoCard}>
            <Text style={styles.infoIcon}>✨</Text>
            <Text style={styles.infoTitle}>¡Comienza la experiencia!</Text>
            <Text style={styles.infoText}>
              Responden juntos, se escuchan y se conocen mejor.{'\n'}
              El sistema elegirá quién rompe el hielo 😉
            </Text>
          </View>

          {canStart ? (
            <TouchableOpacity
              style={[styles.startButton, loading && styles.buttonDisabled]}
              onPress={handleStartDynamic}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Text style={styles.startButtonText}>
                {loading ? '⏳ Iniciando...' : '🎉 Iniciar Dinámica'}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.waitingCard}>
              <Text style={styles.waitingText}>
                Se necesitan al menos 2 participantes confirmados
              </Text>
            </View>
          )}
        </ScrollView>
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

          <View style={styles.checklistCard}>
            <Text style={styles.checklistTitle}>Ya contestaron</Text>
            {activeParticipants.map((participant, index) => {
              const hasAnswered = answeredUsers.includes(participant.user_id);
              const displayName = participant.name;
              
              return (
                <View key={index} style={styles.checklistItem}>
                  <Text style={styles.checklistIcon}>{hasAnswered ? '✅' : '⬜'}</Text>
                  <Text style={[styles.checklistName, hasAnswered && styles.checklistNameAnswered]}>
                    {displayName}
                  </Text>
                </View>
              );
            })}
          </View>

          {!userHasAnswered && (
            <TouchableOpacity
              style={styles.answeredButton}
              onPress={handleAnswered}
              activeOpacity={0.8}
            >
              <Text style={styles.answeredButtonText}>Ya contesté</Text>
            </TouchableOpacity>
          )}

          {userHasAnswered && !allAnswered && (
            <View style={styles.waitingCard}>
              <Text style={styles.waitingText}>
                ✓ Esperando a que todos respondan...
              </Text>
            </View>
          )}

          {allAnswered && (
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
          )}
        </ScrollView>
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
  titleWhite: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 24,
    marginTop: 48,
    textAlign: 'center',
  },
  infoCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
  },
  infoIcon: {
    fontSize: 48,
    textAlign: 'center',
    marginBottom: 16,
  },
  infoTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 16,
    textAlign: 'center',
  },
  infoText: {
    fontSize: 16,
    color: '#333',
    lineHeight: 24,
    textAlign: 'center',
  },
  startButton: {
    backgroundColor: '#FFD700',
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  startButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a0b2e',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  waitingCard: {
    backgroundColor: '#FEF3C7',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  waitingText: {
    fontSize: 14,
    color: '#92400E',
    textAlign: 'center',
    fontWeight: '600',
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
  checklistCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  checklistTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 12,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  checklistIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  checklistName: {
    fontSize: 16,
    color: '#333',
  },
  checklistNameAnswered: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
  answeredButton: {
    backgroundColor: nospiColors.purpleDark,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 32,
    alignItems: 'center',
    marginBottom: 16,
  },
  answeredButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  continueButton: {
    backgroundColor: '#10B981',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 32,
    alignItems: 'center',
    marginBottom: 16,
  },
  continueButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
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
