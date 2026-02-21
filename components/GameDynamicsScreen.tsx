
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';

type QuestionLevel = 'divertido' | 'sensual' | 'atrevido';
type GamePhase = 'ready' | 'question_active' | 'level_transition' | 'finished';

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
    current_level?: string;
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

// Question bank by level
const QUESTIONS = {
  divertido: [
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

export default function GameDynamicsScreen({ appointment, activeParticipants }: GameDynamicsScreenProps) {
  console.log('🎮 Rendering GameDynamicsScreen');
  
  const [gamePhase, setGamePhase] = useState<GamePhase>('ready');
  const [currentLevel, setCurrentLevel] = useState<QuestionLevel>('divertido');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answeredUsers, setAnsweredUsers] = useState<string[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
  const [starterParticipant, setStarterParticipant] = useState<Participant | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Get current user ID
  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }
    };
    getCurrentUser();
  }, []);

  // Sync state from database
  useEffect(() => {
    console.log('=== INITIAL SYNC FROM DATABASE ===');
    const event = appointment.event;
    
    if (event.game_phase === 'question_active') {
      setGamePhase('question_active');
      setCurrentLevel((event.current_level as QuestionLevel) || 'divertido');
      setCurrentQuestionIndex(event.current_question_index || 0);
      setAnsweredUsers(event.answered_users || []);
      setCurrentQuestion(event.current_question || null);
      
      if (event.current_question_starter_id) {
        const starter = activeParticipants.find(p => p.user_id === event.current_question_starter_id);
        setStarterParticipant(starter || null);
      }
    } else if (event.game_phase === 'level_transition') {
      setGamePhase('level_transition');
      setCurrentLevel((event.current_level as QuestionLevel) || 'divertido');
    } else if (event.game_phase === 'finished') {
      setGamePhase('finished');
    } else {
      setGamePhase('ready');
    }
  }, [appointment.event, activeParticipants]);

  // Realtime subscription for game state updates
  useEffect(() => {
    if (!appointment?.event_id) return;

    console.log('📡 === SUBSCRIBING TO GAME STATE ===');
    console.log('📡 Event ID:', appointment.event_id);
    
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
          console.log('📡 === REALTIME UPDATE ===');
          const newEvent = payload.new as any;
          console.log('📡 New phase:', newEvent.game_phase);
          
          if (newEvent.game_phase === 'question_active') {
            setGamePhase('question_active');
            setCurrentLevel(newEvent.current_level || 'divertido');
            setCurrentQuestionIndex(newEvent.current_question_index || 0);
            setAnsweredUsers(newEvent.answered_users || []);
            setCurrentQuestion(newEvent.current_question || null);
            
            if (newEvent.current_question_starter_id) {
              const starter = activeParticipants.find(p => p.user_id === newEvent.current_question_starter_id);
              setStarterParticipant(starter || null);
            }
          } else if (newEvent.game_phase === 'level_transition') {
            setGamePhase('level_transition');
            setCurrentLevel(newEvent.current_level || 'divertido');
          } else if (newEvent.game_phase === 'finished') {
            setGamePhase('finished');
          } else {
            setGamePhase('ready');
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 Subscription status:', status);
      });

    return () => {
      console.log('📡 Unsubscribing');
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

    try {
      // Randomly select starter
      const randomIndex = Math.floor(Math.random() * activeParticipants.length);
      const starterUserId = activeParticipants[randomIndex].user_id;
      
      // Get first question
      const firstQuestion = QUESTIONS.divertido[0];
      
      console.log('✅ Starting with:', starterUserId, 'Question:', firstQuestion);

      const { error } = await supabase
        .from('events')
        .update({
          game_phase: 'question_active',
          current_level: 'divertido',
          current_question_index: 0,
          answered_users: [],
          current_question: firstQuestion,
          current_question_starter_id: starterUserId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', appointment.event_id);

      if (error) {
        console.error('❌ Error starting dynamic:', error);
        return;
      }

      console.log('✅ Dynamic started successfully');
    } catch (error) {
      console.error('❌ Unexpected error:', error);
    } finally {
      setLoading(false);
    }
  }, [appointment, activeParticipants]);

  const handleAnswered = useCallback(async () => {
    console.log('✅ User marked as answered');
    
    if (!appointment?.event_id || !currentUserId) return;
    
    // Check if user already answered
    if (answeredUsers.includes(currentUserId)) {
      console.log('⚠️ User already answered');
      return;
    }

    const newAnsweredUsers = [...answeredUsers, currentUserId];
    
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
        return;
      }

      console.log('✅ User marked as answered');
    } catch (error) {
      console.error('❌ Unexpected error:', error);
    }
  }, [appointment, currentUserId, answeredUsers]);

  const handleContinue = useCallback(async () => {
    console.log('➡️ Continuing to next question');
    
    if (!appointment?.event_id) return;

    setLoading(true);

    try {
      const questionsForLevel = QUESTIONS[currentLevel];
      const nextQuestionIndex = currentQuestionIndex + 1;

      if (nextQuestionIndex < questionsForLevel.length) {
        // Next question in same level
        const randomIndex = Math.floor(Math.random() * activeParticipants.length);
        const newStarterUserId = activeParticipants[randomIndex].user_id;
        const nextQuestion = questionsForLevel[nextQuestionIndex];

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
        // Level finished - transition
        const { error } = await supabase
          .from('events')
          .update({
            game_phase: 'level_transition',
            updated_at: new Date().toISOString(),
          })
          .eq('id', appointment.event_id);

        if (error) {
          console.error('❌ Error transitioning level:', error);
          return;
        }

        console.log('✅ Level finished - transitioning');
      }
    } catch (error) {
      console.error('❌ Unexpected error:', error);
    } finally {
      setLoading(false);
    }
  }, [appointment, currentLevel, currentQuestionIndex, activeParticipants]);

  const handleContinueToNextLevel = useCallback(async () => {
    console.log('⬆️ Continuing to next level');
    
    if (!appointment?.event_id) return;

    setLoading(true);

    try {
      const levels: QuestionLevel[] = ['divertido', 'sensual', 'atrevido'];
      const currentLevelIndex = levels.indexOf(currentLevel);
      const nextLevel = levels[currentLevelIndex + 1];

      if (nextLevel) {
        // Start next level
        const randomIndex = Math.floor(Math.random() * activeParticipants.length);
        const newStarterUserId = activeParticipants[randomIndex].user_id;
        const firstQuestion = QUESTIONS[nextLevel][0];

        const { error } = await supabase
          .from('events')
          .update({
            game_phase: 'question_active',
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
      }
    } catch (error) {
      console.error('❌ Unexpected error:', error);
    } finally {
      setLoading(false);
    }
  }, [appointment, currentLevel, activeParticipants]);

  const handleEndGame = useCallback(async () => {
    console.log('🏁 Ending game');
    
    if (!appointment?.event_id) return;

    setLoading(true);

    try {
      const { error } = await supabase
        .from('events')
        .update({
          game_phase: 'finished',
          updated_at: new Date().toISOString(),
        })
        .eq('id', appointment.event_id);

      if (error) {
        console.error('❌ Error ending game:', error);
        return;
      }

      console.log('✅ Game ended');
    } catch (error) {
      console.error('❌ Unexpected error:', error);
    } finally {
      setLoading(false);
    }
  }, [appointment]);

  // Calculate progress
  const answeredCount = answeredUsers.length;
  const totalCount = activeParticipants.length;
  const allAnswered = answeredCount === totalCount;
  const answeredPercentage = totalCount > 0 ? (answeredCount / totalCount) * 100 : 0;
  const showSafetyContinue = answeredPercentage >= 80 && !allAnswered;
  const userHasAnswered = currentUserId ? answeredUsers.includes(currentUserId) : false;

  // Level display
  const levelEmoji = currentLevel === 'divertido' ? '😄' : currentLevel === 'sensual' ? '💕' : '🔥';
  const levelName = currentLevel === 'divertido' ? 'Divertido' : currentLevel === 'sensual' ? 'Sensual' : 'Atrevido';

  // Ready phase - waiting to start
  if (gamePhase === 'ready') {
    const canStart = activeParticipants.length >= 2;
    const participantCountText = activeParticipants.length.toString();

    return (
      <LinearGradient
        colors={['#1a0b2e', '#2d1b4e', '#4a2c6e']}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
          <Text style={styles.titleWhite}>Dinámica de Grupo</Text>
          <Text style={styles.subtitleWhite}>Todos responden las mismas preguntas</Text>

          <View style={styles.infoCard}>
            <Text style={styles.infoIcon}>ℹ️</Text>
            <Text style={styles.infoTitle}>Cómo funciona</Text>
            <Text style={styles.infoText}>
              • Todos ven la misma pregunta{'\n'}
              • El sistema elige quién empieza{'\n'}
              • Continúan en sentido horario{'\n'}
              • Cada uno presiona "Ya contesté"{'\n'}
              • Cuando todos responden, siguiente pregunta
            </Text>
          </View>

          <View style={styles.participantsCard}>
            <Text style={styles.participantsTitle}>Participantes confirmados</Text>
            <Text style={styles.participantsCount}>{participantCountText}</Text>
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

  // Question active phase
  if (gamePhase === 'question_active' && currentQuestion) {
    const starterName = starterParticipant?.name || 'Alguien';
    const progressText = `${answeredCount} de ${totalCount}`;

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
            <Text style={styles.starterLabel}>Empieza:</Text>
            <Text style={styles.starterName}>{starterName}</Text>
            <Text style={styles.starterInstruction}>Continúa en sentido horario</Text>
          </View>

          <View style={styles.progressCard}>
            <Text style={styles.progressTitle}>Progreso</Text>
            <Text style={styles.progressText}>{progressText}</Text>
          </View>

          <View style={styles.checklistCard}>
            <Text style={styles.checklistTitle}>Participantes</Text>
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

          {showSafetyContinue && (
            <TouchableOpacity
              style={[styles.safetyButton, loading && styles.buttonDisabled]}
              onPress={handleContinue}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Text style={styles.safetyButtonText}>
                {loading ? '⏳ Cargando...' : '⚠️ Continuar (80% respondió)'}
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </LinearGradient>
    );
  }

  // Level transition phase
  if (gamePhase === 'level_transition') {
    const levels: QuestionLevel[] = ['divertido', 'sensual', 'atrevido'];
    const currentLevelIndex = levels.indexOf(currentLevel);
    const hasNextLevel = currentLevelIndex < levels.length - 1;
    const nextLevelName = hasNextLevel ? (levels[currentLevelIndex + 1] === 'sensual' ? 'Sensual' : 'Atrevido') : '';

    return (
      <LinearGradient
        colors={['#1a0b2e', '#2d1b4e', '#4a2c6e']}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
          <Text style={styles.titleWhite}>Nivel Completado</Text>
          <Text style={styles.subtitleWhite}>¡Buen trabajo!</Text>

          <View style={styles.transitionCard}>
            <Text style={styles.transitionIcon}>🎉</Text>
            <Text style={styles.transitionText}>
              Han completado el nivel {levelName}
            </Text>
          </View>

          {hasNextLevel ? (
            <>
              <View style={styles.nextLevelCard}>
                <Text style={styles.nextLevelTitle}>Siguiente nivel:</Text>
                <Text style={styles.nextLevelName}>{nextLevelName}</Text>
              </View>

              <TouchableOpacity
                style={[styles.continueButton, loading && styles.buttonDisabled]}
                onPress={handleContinueToNextLevel}
                disabled={loading}
                activeOpacity={0.8}
              >
                <Text style={styles.continueButtonText}>
                  {loading ? '⏳ Cargando...' : '⬆️ Continuar al siguiente nivel'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.endButton, loading && styles.buttonDisabled]}
                onPress={handleEndGame}
                disabled={loading}
                activeOpacity={0.8}
              >
                <Text style={styles.endButtonText}>
                  {loading ? '⏳ Cargando...' : '🏁 Terminar aquí'}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={[styles.continueButton, loading && styles.buttonDisabled]}
              onPress={handleEndGame}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Text style={styles.continueButtonText}>
                {loading ? '⏳ Cargando...' : '🏁 Finalizar'}
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </LinearGradient>
    );
  }

  // Finished phase
  if (gamePhase === 'finished') {
    return (
      <LinearGradient
        colors={['#1a0b2e', '#2d1b4e', '#4a2c6e']}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
          <Text style={styles.titleWhite}>¡Experiencia Completada!</Text>
          <Text style={styles.subtitleWhite}>Gracias por participar</Text>

          <View style={styles.finishedCard}>
            <Text style={styles.finishedIcon}>🎊</Text>
            <Text style={styles.finishedText}>
              Han completado la dinámica de grupo.{'\n\n'}
              ¡Esperamos que hayan disfrutado la experiencia!
            </Text>
          </View>
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
    marginBottom: 8,
    marginTop: 48,
    textAlign: 'center',
  },
  subtitleWhite: {
    fontSize: 16,
    color: '#FFFFFF',
    opacity: 0.9,
    marginBottom: 24,
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
    fontSize: 20,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 12,
    textAlign: 'center',
  },
  infoText: {
    fontSize: 16,
    color: '#333',
    lineHeight: 24,
  },
  participantsCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
    alignItems: 'center',
  },
  participantsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 12,
  },
  participantsCount: {
    fontSize: 48,
    fontWeight: 'bold',
    color: nospiColors.purpleMid,
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
    backgroundColor: nospiColors.purpleLight,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
  },
  starterLabel: {
    fontSize: 16,
    color: nospiColors.purpleDark,
    marginBottom: 8,
  },
  starterName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 8,
  },
  starterInstruction: {
    fontSize: 14,
    color: nospiColors.purpleDark,
    fontStyle: 'italic',
  },
  progressCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
  },
  progressTitle: {
    fontSize: 16,
    color: nospiColors.purpleDark,
    marginBottom: 8,
    fontWeight: '600',
  },
  progressText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
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
  safetyButton: {
    backgroundColor: '#F59E0B',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 32,
    alignItems: 'center',
    marginBottom: 16,
  },
  safetyButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  transitionCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 24,
    padding: 32,
    marginBottom: 16,
    alignItems: 'center',
  },
  transitionIcon: {
    fontSize: 80,
    marginBottom: 20,
  },
  transitionText: {
    fontSize: 20,
    fontWeight: '600',
    color: nospiColors.purpleDark,
    textAlign: 'center',
  },
  nextLevelCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
  },
  nextLevelTitle: {
    fontSize: 16,
    color: nospiColors.purpleDark,
    marginBottom: 8,
  },
  nextLevelName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: nospiColors.purpleMid,
  },
  endButton: {
    backgroundColor: '#EF4444',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  endButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  finishedCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 24,
    padding: 40,
    alignItems: 'center',
  },
  finishedIcon: {
    fontSize: 100,
    marginBottom: 24,
  },
  finishedText: {
    fontSize: 18,
    color: nospiColors.purpleDark,
    textAlign: 'center',
    lineHeight: 28,
  },
});
