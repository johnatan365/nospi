import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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

// ─── Per-level theme system ───────────────────────────────────────────────────
interface LevelTheme {
  gradient: [string, string, ...string[]];
  questionCardBg: string;
  questionCardBorder: string;
  questionTextColor: string;
  questionTextShadow: string;
  answerBg: string;
  answerBorder: string;
  answerText: string;
  selectedAnswerBg: string;
  selectedAnswerBorder: string;
  timerBadgeBg: string;
  timerText: string;
  instructionText: string;
  continueButtonBg: string;
  continueButtonText: string;
  accentColor: string;
  starterCardBg: string;
  transitionGradient: [string, string, ...string[]];
  transitionAccent: string;
  participantCardBg: string;
  participantAvatarBg: string;
}

const LEVEL_THEMES: Record<QuestionLevel, LevelTheme> = {
  divertido: {
    gradient: ['#E0F7FA', '#81D4FA', '#29B6F6'],
    questionCardBg: 'rgba(255,255,255,0.08)',
    questionCardBorder: 'rgba(100,181,246,0.30)',
    questionTextColor: '#FFFFFF',
    questionTextShadow: 'rgba(0,0,0,0.4)',
    answerBg: 'rgba(100,181,246,0.12)',
    answerBorder: 'rgba(100,181,246,0.3)',
    answerText: '#FFFFFF',
    selectedAnswerBg: 'rgba(14,165,233,0.45)',
    selectedAnswerBorder: '#64B5F6',
    timerBadgeBg: 'rgba(100,181,246,0.12)',
    timerText: '#64B5F6',
    instructionText: 'rgba(255,255,255,0.6)',
    continueButtonBg: '#1565C0',
    continueButtonText: '#FFFFFF',
    accentColor: '#64B5F6',
    starterCardBg: 'rgba(0,0,0,0.35)',
    transitionGradient: ['#E0F7FA', '#81D4FA', '#29B6F6'],
    transitionAccent: '#64B5F6',
    participantCardBg: 'rgba(100,181,246,0.08)',
    participantAvatarBg: 'rgba(100,181,246,0.18)',
  },
  sensual: {
    gradient: ['#3d1a00', '#BF360C', '#E64A19'],
    questionCardBg: 'rgba(255,255,255,0.07)',
    questionCardBorder: 'rgba(255,183,77,0.28)',
    questionTextColor: '#FFFFFF',
    questionTextShadow: 'rgba(0,0,0,0.45)',
    answerBg: 'rgba(255,183,77,0.10)',
    answerBorder: 'rgba(255,183,77,0.28)',
    answerText: '#FFFFFF',
    selectedAnswerBg: 'rgba(234,88,12,0.45)',
    selectedAnswerBorder: '#FFB74D',
    timerBadgeBg: 'rgba(255,183,77,0.12)',
    timerText: '#FFB74D',
    instructionText: 'rgba(255,255,255,0.6)',
    continueButtonBg: '#BF360C',
    continueButtonText: '#FFFFFF',
    accentColor: '#FFB74D',
    starterCardBg: 'rgba(0,0,0,0.35)',
    transitionGradient: ['#3d1a00', '#BF360C', '#E64A19'],
    transitionAccent: '#FFB74D',
    participantCardBg: 'rgba(255,183,77,0.08)',
    participantAvatarBg: 'rgba(255,183,77,0.18)',
  },
  atrevido: {
    gradient: ['#1a0010', '#880E4F', '#AD1457'],
    questionCardBg: 'rgba(255,255,255,0.07)',
    questionCardBorder: 'rgba(240,98,146,0.28)',
    questionTextColor: '#FFFFFF',
    questionTextShadow: 'rgba(0,0,0,0.45)',
    answerBg: 'rgba(240,98,146,0.10)',
    answerBorder: 'rgba(240,98,146,0.28)',
    answerText: '#FFFFFF',
    selectedAnswerBg: 'rgba(136,14,79,0.45)',
    selectedAnswerBorder: '#F06292',
    timerBadgeBg: 'rgba(240,98,146,0.12)',
    timerText: '#F06292',
    instructionText: 'rgba(255,255,255,0.6)',
    continueButtonBg: '#880E4F',
    continueButtonText: '#FFFFFF',
    accentColor: '#F06292',
    starterCardBg: 'rgba(0,0,0,0.35)',
    transitionGradient: ['#1a0010', '#880E4F', '#AD1457'],
    transitionAccent: '#F06292',
    participantCardBg: 'rgba(240,98,146,0.08)',
    participantAvatarBg: 'rgba(240,98,146,0.18)',
  },
};

// Free phase uses a deep neutral gradient (no purple)
const FREE_PHASE_GRADIENT: [string, string, ...string[]] = ['#0a0a0f', '#141428', '#1e1e3c'];

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

  const theme = LEVEL_THEMES[currentLevel];
  
  const transitionLevelEmoji = transitionLevel === 'divertido' ? '😄' : transitionLevel === 'sensual' ? '💕' : '🔥';
  const transitionLevelName = transitionLevel === 'divertido' ? 'Divertido' : transitionLevel === 'sensual' ? 'Sensual' : 'Atrevido';
  const transitionTheme = transitionLevel ? LEVEL_THEMES[transitionLevel] : theme;

  // Timer color thresholds
  const timerColor = timeLeft > 30 ? '#FFFFFF' : timeLeft > 10 ? '#FFE082' : '#FF5252';
  const timerLabel = `${timeLeft}s`;
  const timerExpired = timeLeft === 0;


  if (gamePhase === 'questions' && currentQuestion) {
    const starterName = starterParticipant?.name || 'Alguien';

    return (
      <LinearGradient
        colors={theme.gradient}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
          {/* Level badge */}
          <View style={[styles.levelBadge, { backgroundColor: theme.timerBadgeBg, borderColor: theme.accentColor + '55' }]}>
            <Text style={styles.levelEmoji}>{levelEmoji}</Text>
            <Text style={[styles.levelText, { color: theme.accentColor }]}>{levelName.toUpperCase()}</Text>
          </View>

          {/* Question card */}
          <View style={[
            styles.questionCard,
            {
              backgroundColor: theme.questionCardBg,
              borderColor: theme.questionCardBorder,
            },
          ]}>
            <Text style={[
              styles.questionText,
              {
                color: theme.questionTextColor,
                textShadowColor: theme.questionTextShadow,
                textShadowOffset: { width: 0, height: 1 },
                textShadowRadius: 4,
              },
            ]}>
              {currentQuestion}
            </Text>

            {/* Countdown timer badge */}
            <View style={[styles.timerBadge, { backgroundColor: theme.timerBadgeBg, borderColor: timerColor }]}>
              <Text style={[styles.timerNumber, { color: timerColor }]}>{timerLabel}</Text>
            </View>
          </View>

          {/* Starter card */}
          <View style={[styles.starterCard, { backgroundColor: theme.starterCardBg, borderColor: 'rgba(255,255,255,0.10)' }]}>
            <View style={[styles.starterAvatar, { backgroundColor: theme.timerBadgeBg, borderColor: theme.accentColor + '60' }]}>
              <Text style={[styles.starterAvatarText, { color: theme.accentColor }]}>{starterName.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.starterInfo}>
              <Text style={[styles.starterLabelWhite, { color: theme.accentColor }]}>EMPIEZA</Text>
              <Text style={styles.starterNameWhite}>{starterName}</Text>
              <Text style={styles.starterInstructionWhite}>luego continúan hacia la derecha →</Text>
            </View>
          </View>

          {/* Instruction card */}
          <View style={[styles.instructionCard, { backgroundColor: 'rgba(0,0,0,0.15)', borderColor: 'rgba(255,255,255,0.2)' }]}>
            <Text style={[styles.instructionText, { color: theme.instructionText }]}>
              Al terminar el conteo aparecerá Continuar. Presiónenlo cuando todos respondan.
            </Text>
          </View>

          {timerExpired ? (
            <TouchableOpacity
              style={[styles.continueButtonC, loading && styles.buttonDisabled]}
              onPress={() => {
                console.log('[Button] Continuar pressed');
                handleContinue();
              }}
              disabled={loading}
              activeOpacity={0.85}
            >
              <Text style={styles.continueButtonCText}>
                {loading ? 'Cargando...' : 'Continuar'}
              </Text>
              <View style={[styles.continueButtonCCircle, { borderColor: theme.accentColor, backgroundColor: theme.accentColor + '25' }]}>
                <Text style={[styles.continueButtonCArrow, { color: theme.accentColor }]}>›</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <View style={styles.continueButtonWaitingC}>
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
              <LinearGradient
                colors={transitionTheme.gradient}
                style={styles.transitionCardGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Text style={styles.transitionEmoji}>{transitionLevelEmoji}</Text>
                <Text style={styles.transitionTitle}>Siguiente Nivel</Text>
                <Text style={styles.transitionLevel}>{transitionLevelName}</Text>
              </LinearGradient>
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
    const transitionColors: [string, string, ...string[]] = isFinished
      ? ['#1C1C2E', '#2C2C3E', '#3C3C4E']
      : LEVEL_THEMES[currentLevel === 'divertido' ? 'sensual' : 'atrevido'].gradient;

    return (
      <LinearGradient
        colors={transitionColors}
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
              ? 'Completaron todos los niveles. Ahora disfruten la noche ✨'
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

  // ── Level badge ──────────────────────────────────────────────────────────────
  levelBadge: {
    borderRadius: 30,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 18,
    marginTop: 60,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  levelEmoji: {
    fontSize: 16,
    marginRight: 7,
  },
  levelText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.2,
    textAlign: 'center',
  },

  // ── Question card ────────────────────────────────────────────────────────────
  questionCard: {
    borderRadius: 22,
    borderWidth: 1,
    paddingVertical: 28,
    paddingHorizontal: 24,
    marginBottom: 14,
    alignItems: 'center',
  },
  questionText: {
    fontSize: 22,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 32,
  },

  // ── Timer badge ──────────────────────────────────────────────────────────────
  timerBadge: {
    marginTop: 18,
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timerNumber: {
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  // ── Starter card ─────────────────────────────────────────────────────────────
  starterCard: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  starterAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  starterAvatarText: {
    fontSize: 18,
    fontWeight: '600',
  },
  starterInfo: {
    flex: 1,
    gap: 2,
  },
  starterLabelWhite: {
    fontSize: 10,
    letterSpacing: 1.2,
    fontWeight: '600',
    marginBottom: 2,
  },
  starterNameWhite: {
    fontSize: 18,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  starterInstructionWhite: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 2,
  },

  // ── Instruction card ─────────────────────────────────────────────────────────
  instructionCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
    alignItems: 'center',
  },
  instructionText: {
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '400',
    lineHeight: 19,
  },

  // ── Continue button ──────────────────────────────────────────────────────────
  continueButton: {
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 32,
    alignItems: 'center',
    marginBottom: 16,
  },
  continueButtonC: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 50,
    paddingVertical: 4,
    paddingLeft: 20,
    paddingRight: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  continueButtonCText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },
  continueButtonCCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButtonCArrow: {
    fontSize: 22,
    fontWeight: '400',
    lineHeight: 26,
    marginTop: -2,
  },
  continueButtonWaitingC: {
    borderRadius: 50,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  continueButtonWaiting: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  continueButtonText: {
    fontSize: 19,
    fontWeight: '700',
  },
  continueButtonTextWaiting: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.3,
  },
  buttonDisabled: {
    opacity: 0.6,
  },

  // ── Level transition full screen ─────────────────────────────────────────────
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

  // ── Level transition overlay (animated popup) ────────────────────────────────
  transitionOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  transitionCard: {
    borderRadius: 32,
    overflow: 'hidden',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    minWidth: 280,
  },
  transitionCardGradient: {
    padding: 48,
    alignItems: 'center',
    borderRadius: 32,
  },
  transitionEmoji: {
    fontSize: 100,
    marginBottom: 24,
  },
  transitionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 10,
    textAlign: 'center',
  },
  transitionLevel: {
    fontSize: 36,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },

  // ── Free phase ───────────────────────────────────────────────────────────────
  iceBreakCard: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    padding: 28,
    marginTop: 60,
    marginBottom: 20,
    alignItems: 'center',
    boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
  },
  iceBreakIcon: {
    fontSize: 72,
    marginBottom: 12,
  },
  iceBreakTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 10,
    textAlign: 'center',
  },
  iceBreakSubtitle: {
    fontSize: 16,
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
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 10,
    textAlign: 'center',
  },
  evaluationText: {
    fontSize: 15,
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
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  participantRatingName: {
    fontSize: 16,
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
    fontSize: 12,
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
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ── Unused legacy (kept for safety) ─────────────────────────────────────────
  questionIcon: {
    fontSize: 64,
    marginBottom: 20,
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
});