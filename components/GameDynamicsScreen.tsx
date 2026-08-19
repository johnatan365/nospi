import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

type QuestionLevel = 'divertido' | 'sensual' | 'atrevido';
type GamePhase = 'questions' | 'level_transition' | 'finished';

const LEVEL_ORDER: QuestionLevel[] = ['divertido', 'sensual', 'atrevido'];

// Candado de navegacion al cierre a nivel de MODULO: si este componente se
// vuelve a montar (Android recuperando memoria, volver a la pestana), un ref
// interno se reinicia y se volvia a empujar OTRA pantalla de cierre encima de
// la anterior -- de ahi el efecto de "carga varias pantallas" y de aparecer en
// una pantalla vieja apilada. Se resetea solo si la dinamica vuelve a empezar.
let closingNavigatedForEvent: string | null = null;

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
    ready_users?: string[];
    moderator_id?: string | null;
  };
}

interface GameDynamicsScreenProps {
  appointment: Appointment;
  activeParticipants: Participant[];
  onFinish?: () => void;
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

const TIMER_DURATION = 10;

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
    gradient: ['#4FC3F7', '#0288D1', '#01579B'],
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
    transitionGradient: ['#4FC3F7', '#0288D1', '#01579B'],
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

// Free phase uses the brand dark gradient

export default function GameDynamicsScreen({ appointment, activeParticipants, onFinish }: GameDynamicsScreenProps) {
  const router = useRouter();

  // Estado inicial HIDRATADO desde la cita (que dinamica mantiene al dia por
  // realtime y cache): asi, si este componente se vuelve a montar (volver a la
  // pestana, Android recuperando memoria), la pregunta pinta AL INSTANTE en vez
  // de quedarse en "Sincronizando la dinamica..." mientras responde la red.
  // El restore de abajo reconcilia contra la BD por si la cita estaba vieja.
  const initialEvent = appointment?.event;
  const [gamePhase, setGamePhase] = useState<GamePhase>(
    initialEvent?.game_phase === 'finished' || initialEvent?.game_phase === 'free_phase'
      ? 'finished'
      : 'questions'
  );
  const [currentLevel, setCurrentLevel] = useState<QuestionLevel>(initialEvent?.current_level || 'divertido');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(initialEvent?.current_question_index ?? 0);
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(initialEvent?.current_question ?? null);
  const [loading, setLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Moderador de la dinámica: único que ve el botón para pasar a la siguiente
  // pregunta. Se sincroniza por la fila events (moderator_id). Cualquiera puede
  // tomar el rol desde el botón "Cambiar moderador".
  const [moderatorId, setModeratorId] = useState<string | null>(appointment.event?.moderator_id ?? null);
  const [showChangeModerator, setShowChangeModerator] = useState(false);

  // Countdown timer state
  const [timeLeft, setTimeLeft] = useState(TIMER_DURATION);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Level transition animation state
  const [showLevelTransition, setShowLevelTransition] = useState(false);
  const [transitionLevel, setTransitionLevel] = useState<QuestionLevel | null>(null);

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
          // La pregunta fijada (is_pinned) va SIEMPRE primera dentro de su
          // nivel, sin importar el question_order — así, aunque se reordenen
          // o editen las preguntas del evento, la de presentación abre la
          // dinámica.
          .order('is_pinned', { ascending: false })
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
            // Red de seguridad: la pregunta de presentación (fijada en el banco
            // global, event_id null, is_pinned) debe ABRIR SIEMPRE la dinámica,
            // aunque la copia de este evento haya perdido el is_pinned. La
            // traemos y la forzamos de primera en Divertido.
            try {
              const { data: pinnedGlobal } = await supabase
                .from('event_questions')
                .select('question_text')
                .is('event_id', null)
                .eq('is_pinned', true)
                .eq('level', 'divertido')
                .order('question_order', { ascending: true })
                .limit(1);
              const pinnedText = pinnedGlobal?.[0]?.question_text;
              if (pinnedText && questionsByLevel.divertido.length > 0) {
                questionsByLevel.divertido = [
                  pinnedText,
                  ...questionsByLevel.divertido.filter((t: string) => t !== pinnedText),
                ];
              }
            } catch (_e) { /* si falla, seguimos con el orden del evento */ }

            QUESTIONS = questionsByLevel;
            return;
          }
        }

        const { data: defaultQuestions, error: defaultError } = await supabase
          .from('event_questions')
          .select('*')
          .is('event_id', null)
          .order('level', { ascending: true })
          .order('is_pinned', { ascending: false })
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

  // Countdown timer logic
  const startTimer = useCallback((initialTime?: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    const startValue = initialTime !== undefined ? Math.max(0, Math.round(initialTime)) : TIMER_DURATION;
    console.log(`[Timer] Starting countdown from ${startValue}s`);
    setTimeLeft(startValue);
    if (startValue <= 0) return;
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

  // Restore state from event_state
  useEffect(() => {
    if (!appointment?.event_id) return;

    // Si la consulta falla (red inestable, refresh en web), REINTENTAR: antes
    // se abandonaba en silencio y la pantalla quedaba en negro sin salida,
    // porque sin pregunta cargada no habia nada que dibujar.
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const restoreStateFromDatabase = async () => {
      // Carrera contra un timeout: en Android, tras volver del background, el
      // fetch puede quedarse COLGADO sin resolver nunca (conexion muerta) y sin
      // esto no habia ni error ni reintento -- la pantalla quedaba cargando.
      const result: any = await Promise.race([
        supabase.from('events').select('*').eq('id', appointment.event_id).maybeSingle(),
        new Promise(resolve => setTimeout(() => resolve({ data: null, error: { message: 'timeout' } }), 6000)),
      ]);
      const { data, error } = result;

      if (cancelled) return;

      if (error || !data) {
        if (error) console.error('❌ Error fetching event state:', error.message || error);
        retryTimer = setTimeout(restoreStateFromDatabase, 2500);
        return;
      }


      // Moderador vigente (quién controla el avance).
      setModeratorId(data.moderator_id ?? null);

      // Derive UI from event_state
      if (data.game_phase === 'question_active' || data.game_phase === 'questions') {
        setGamePhase('questions');
        setCurrentLevel(data.current_level || 'divertido');
        setCurrentQuestionIndex(data.current_question_index || 0);
        setCurrentQuestion(data.current_question || null);

        // Calculate remaining timer from updated_at
        if (data.updated_at) {
          const elapsed = (Date.now() - new Date(data.updated_at).getTime()) / 1000;
          const remaining = TIMER_DURATION - elapsed;
          console.log(`[Timer] Restoring timer: elapsed=${elapsed.toFixed(1)}s, remaining=${remaining.toFixed(1)}s`);
          startTimer(remaining);
        }
      } else if (data.game_phase === 'finished' || data.game_phase === 'free_phase') {
        // 'free_phase' es un estado viejo (la pantalla intermedia ya no existe).
        // Se trata como cierre para que una mesa que quedó ahí no se atasque.
        setGamePhase('finished');
      }
    };

    restoreStateFromDatabase();
    return () => { cancelled = true; if (retryTimer) clearTimeout(retryTimer); };
  }, [appointment?.event_id, activeParticipants, startTimer]);

  // Keep a ref to activeParticipants so the realtime handler always has the latest
  // value without needing to be in the useEffect dependency array (which would
  // cause the channel to be torn down and re-created on every render, triggering
  // the "cannot add postgres_changes callbacks after subscribe()" error).
  const activeParticipantsRef = useRef(activeParticipants);
  useEffect(() => {
    activeParticipantsRef.current = activeParticipants;
  }, [activeParticipants]);

  // Subscribe to event_state changes
  useEffect(() => {
    const eventId = appointment?.event_id ?? null;
    if (!eventId) return;

    const channelName = `game_${eventId}`;

    // Remove any existing channel with this name before creating a new one
    const existing = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`);
    if (existing) {
      supabase.removeChannel(existing);
    }

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'events',
          filter: `id=eq.${eventId}`,
        },
        (payload) => {
          const newEvent = payload.new as any;
          console.log('[Realtime] Event UPDATE received:', newEvent.game_phase);

          // Moderador vigente (puede cambiar en cualquier momento).
          setModeratorId(newEvent.moderator_id ?? null);

          if (newEvent.game_phase === 'questions' || newEvent.game_phase === 'question_active') {
            setGamePhase('questions');
            setCurrentLevel(newEvent.current_level || 'divertido');
            setCurrentQuestionIndex(newEvent.current_question_index || 0);
            setCurrentQuestion(newEvent.current_question || null);

            // Calculate remaining timer from updated_at
            if (newEvent.updated_at) {
              const elapsed = (Date.now() - new Date(newEvent.updated_at).getTime()) / 1000;
              const remaining = TIMER_DURATION - elapsed;
              console.log(`[Timer] Real-time update: elapsed=${elapsed.toFixed(1)}s, remaining=${remaining.toFixed(1)}s`);
              startTimer(remaining);
            }
          } else if (newEvent.game_phase === 'finished' || newEvent.game_phase === 'free_phase') {
            // El moderador terminó la última pregunta: todos pasan al cierre
            // (afinidad + match), cada quien en su propio teléfono.
            // 'free_phase' es un estado viejo y se trata igual (ver restore).
            setGamePhase('finished');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [appointment?.event_id, startTimer]); // primitive dep only — NOT the full appointment object or activeParticipants

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Velo de "Siguiente Nivel" SIN animaciones: se muestra fijo 2 segundos y se
  // quita por temporizador. Las versiones animadas (spring/fade) se comportaban
  // distinto por plataforma y en iOS a veces quedaba una capa translucida
  // pegada sobre la pregunta; estatico es identico y estable en iOS/Android/web.
  const transitionTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => { transitionTimersRef.current.forEach(clearTimeout); }, []);

  const showLevelTransitionAnimation = useCallback((level: QuestionLevel) => {
    transitionTimersRef.current.forEach(clearTimeout);
    transitionTimersRef.current = [];

    setTransitionLevel(level);
    setShowLevelTransition(true);

    transitionTimersRef.current.push(setTimeout(() => {
      setShowLevelTransition(false);
      setTransitionLevel(null);
    }, 2000));
  }, []);

  // Avanza al siguiente nivel; si ya estábamos en Atrevido, CIERRA la dinámica
  // para toda la mesa (game_phase='finished') y cada teléfono navega solo al
  // cierre. Ya no hay pantalla intermedia entre la última pregunta y el cierre.
  const advanceToNextLevelOrFinish = useCallback(async () => {
    if (!appointment?.event_id) return;

    const nextLevel: QuestionLevel =
      currentLevel === 'divertido' ? 'sensual' :
      currentLevel === 'sensual' ? 'atrevido' : 'atrevido';

    if (currentLevel === 'divertido' || currentLevel === 'sensual') {
      showLevelTransitionAnimation(nextLevel);

      const firstQuestion = QUESTIONS[nextLevel][0];

      setGamePhase('questions');
      setCurrentLevel(nextLevel);
      setCurrentQuestionIndex(0);
      setCurrentQuestion(firstQuestion);
      startTimer();

      const { error } = await supabase
        .from('events')
        .update({
          game_phase: 'questions',
          current_level: nextLevel,
          current_question_index: 0,
          answered_users: [],
          current_question: firstQuestion,
          updated_at: new Date().toISOString(),
        })
        .eq('id', appointment.event_id);

      if (error) {
        console.error('❌ Error starting next level:', error);
        setGamePhase('questions');
        setCurrentLevel(currentLevel);
      }
    } else {
      setGamePhase('finished');

      const { error } = await supabase
        .from('events')
        .update({
          game_phase: 'finished',
          updated_at: new Date().toISOString(),
        })
        .eq('id', appointment.event_id);

      if (error) {
        console.error('❌ Error ending game:', error);
        setGamePhase('questions');
      }
    }
  }, [appointment, currentLevel, showLevelTransitionAnimation, startTimer]);

  const handleContinue = useCallback(async () => {

    if (!appointment?.event_id || loading) return;

    const questionsForLevel = QUESTIONS[currentLevel];
    const nextQuestionIndex = currentQuestionIndex + 1;

    // CRITICAL FIX: Immediately set loading state for instant UI feedback
    setLoading(true);

    try {
      if (nextQuestionIndex < questionsForLevel.length) {
        // Continue to next question in same level
        const nextQuestion = questionsForLevel[nextQuestionIndex];

        // CRITICAL FIX: Immediately update local state BEFORE database call
        setCurrentQuestionIndex(nextQuestionIndex);
        setCurrentQuestion(nextQuestion);
        startTimer(); // Start fresh 60s timer immediately

        // CANDADO ANTI-SALTO (multi-persona): el avance solo se aplica si la
        // pregunta que hay en la BASE DE DATOS sigue siendo la que este
        // teléfono cree (current_question_index === currentQuestionIndex). Si
        // otra persona de la mesa ya le dio "Continuar" un instante antes, la
        // condición no coincide y este UPDATE no afecta ninguna fila: así
        // evitamos que dos toques casi simultáneos SALTEN una pregunta, y que
        // un teléfono desincronizado empuje a la mesa hacia atrás. En ese caso
        // deshacemos el cambio local y dejamos que el tiempo real nos ponga al
        // día con la pregunta correcta.
        const { data: advancedRows, error } = await supabase
          .from('events')
          .update({
            current_question_index: nextQuestionIndex,
            answered_users: [],
            current_question: nextQuestion,
            updated_at: new Date().toISOString(),
          })
          .eq('id', appointment.event_id)
          .eq('current_question_index', currentQuestionIndex)
          .select('id');

        if (error) {
          console.error('❌ Error advancing question:', error);
          // Revert optimistic update on error
          setCurrentQuestionIndex(currentQuestionIndex);
          setCurrentQuestion(currentQuestion);
          setLoading(false);
          return;
        }

        if (!advancedRows || advancedRows.length === 0) {
          // Otro teléfono ya movió la pregunta: no pisamos a la mesa.
          // Revertimos el optimismo local; el tiempo real corregirá enseguida.
          console.log('[Candado] Otro participante ya avanzó — no se salta pregunta');
          setCurrentQuestionIndex(currentQuestionIndex);
          setCurrentQuestion(currentQuestion);
          setLoading(false);
          return;
        }


      } else {
        // Level completed (se acabaron las preguntas) - se fuerza el paso
        // al siguiente nivel, sin importar qué habían elegido antes.
        await advanceToNextLevelOrFinish();
      }
    } catch (error) {
      console.error('❌ Unexpected error:', error);
    } finally {
      setLoading(false);
    }
  }, [appointment, currentLevel, currentQuestionIndex, activeParticipants, loading, currentQuestion, advanceToNextLevelOrFinish, startTimer]);

  // "Cambiar moderador" (cualquiera puede tocarlo, por si el moderador se fue o
  // se quedó sin batería): quien lo presione toma el rol. El primero que se
  // postule queda; la fila events sincroniza el cambio a toda la mesa.
  const handleBecomeModerator = useCallback(async () => {
    if (!appointment?.event_id || !currentUserId || loading) return;
    setShowChangeModerator(false);
    const previous = moderatorId;
    setModeratorId(currentUserId); // feedback inmediato
    const { error } = await supabase
      .from('events')
      .update({ moderator_id: currentUserId, updated_at: new Date().toISOString() })
      .eq('id', appointment.event_id);
    if (error) {
      console.error('❌ Error cambiando moderador:', error);
      setModeratorId(previous); // revertir si falló; realtime corrige igual
    }
  }, [appointment, currentUserId, loading, moderatorId]);

  // Cierre nuevo: marca la cita como pasada y lleva a la pantalla de
  // afinidad + match + feedback (reemplaza el viejo puntaje de estrellas).
  const [closingNavigated, setClosingNavigated] = useState(false);

  const goToClosing = useCallback(async () => {
    if (!appointment?.event_id || !currentUserId) return;
    // Candado global: UNA sola navegacion al cierre por evento, aunque el
    // componente se re-monte. Sin esto se apilaban varias pantallas de cierre.
    if (closingNavigatedForEvent === appointment.event_id) {
      setClosingNavigated(true);
      return;
    }
    closingNavigatedForEvent = appointment.event_id;
    setClosingNavigated(true);
    // Navegar PRIMERO: antes se esperaba el UPDATE de la cita y, con red lenta,
    // la mesa quedaba mirando una pantalla negra "cargando" varios segundos.
    // El marcado de la cita como pasada corre en segundo plano.
    router.push(`/catch-up-rating/${appointment.event_id}` as any);
    supabase
      .from('appointments')
      .update({ status: 'anterior', updated_at: new Date().toISOString() })
      .eq('event_id', appointment.event_id)
      .eq('user_id', currentUserId)
      .then(({ error }) => {
        if (error) console.error('goToClosing (marcar cita) error:', error.message);
      });
  }, [appointment, currentUserId, router]);

  // Si la dinamica del MISMO evento vuelve a arrancar (se reinicio para otra
  // ronda o para pruebas), liberar el candado para que el proximo cierre
  // vuelva a navegar normal.
  useEffect(() => {
    if (gamePhase === 'questions' && closingNavigatedForEvent === appointment?.event_id) {
      closingNavigatedForEvent = null;
      closingTriggeredRef.current = false;
      setClosingNavigated(false);
    }
  }, [gamePhase, appointment?.event_id]);

  // Al llegar la fase 'finished' (la puso el moderador al terminar la última
  // pregunta; llega por realtime o restore), cada teléfono pasa UNA sola vez al
  // cierre (afinidad + match).
  const closingTriggeredRef = useRef(false);
  useEffect(() => {
    if (gamePhase !== 'finished' || closingTriggeredRef.current) return;
    if (!appointment?.event_id || !currentUserId) return; // reintenta en el próximo render
    closingTriggeredRef.current = true;
    goToClosing();
  }, [gamePhase, appointment?.event_id, currentUserId, goToClosing]);

  const levelEmoji = currentLevel === 'divertido' ? '😄' : currentLevel === 'sensual' ? '💕' : '🔥';
  const levelName = currentLevel === 'divertido' ? 'Divertido' : currentLevel === 'sensual' ? 'Coqueto' : 'Atrevido';
  const levelPosition = LEVEL_ORDER.indexOf(currentLevel) + 1;

  // Progreso dentro del nivel, para que la mesa sepa cuántas van y cuántas
  // faltan (antes decidían a ciegas si pasar de nivel).
  const questionsInLevel = QUESTIONS[currentLevel]?.length ?? 0;
  const questionNumber = Math.min(currentQuestionIndex + 1, questionsInLevel);

  // Última pregunta de TODO el juego (última del último nivel). Al pasarla no
  // hay pantalla intermedia: el moderador cierra y toda la mesa va al cierre,
  // así que su botón dice "Terminar" y arriba le aparece el aviso para que
  // sepa cómo rematar en voz alta.
  const isLastQuestion =
    currentLevel === LEVEL_ORDER[LEVEL_ORDER.length - 1] &&
    questionsInLevel > 0 &&
    currentQuestionIndex >= questionsInLevel - 1;

  const theme = LEVEL_THEMES[currentLevel];
  
  const transitionLevelEmoji = transitionLevel === 'divertido' ? '😄' : transitionLevel === 'sensual' ? '💕' : '🔥';
  const transitionLevelName = transitionLevel === 'divertido' ? 'Divertido' : transitionLevel === 'sensual' ? 'Coqueto' : 'Atrevido';
  const transitionTheme = transitionLevel ? LEVEL_THEMES[transitionLevel] : theme;

  // Timer color thresholds
  const timerColor = timeLeft > 6 ? '#FFFFFF' : timeLeft > 3 ? '#FFE082' : '#FF5252';
  const timerLabel = `${timeLeft}s`;
  const timerExpired = timeLeft === 0;

  // Moderador: solo este usuario ve el botón para avanzar. El resto espera.
  // Si por algún motivo no hay moderador (dato viejo), se permite avanzar a
  // todos como antes, para no dejar la mesa trabada.
  const isModerator = !moderatorId || (!!currentUserId && currentUserId === moderatorId);
  const moderatorName = moderatorId
    ? (activeParticipants.find(p => p.user_id === moderatorId)?.name || 'el moderador')
    : null;

  // Bottom sheet "Cambiar moderador", compartido por la pantalla de preguntas y
  // la fase libre (cualquiera puede tomar el rol si el moderador se fue).
  const changeModeratorSheet = (
    <Modal
      visible={showChangeModerator}
      transparent
      animationType="fade"
      onRequestClose={() => setShowChangeModerator(false)}
    >
      <TouchableOpacity
        style={styles.changeOverlay}
        activeOpacity={1}
        onPress={() => setShowChangeModerator(false)}
      >
        <TouchableOpacity style={styles.changeSheet} activeOpacity={1} onPress={() => {}}>
          <Text style={styles.changeSheetTitle}>Cambiar moderador</Text>
          <Text style={styles.changeSheetText}>¿Quieren cambiar de moderador por algún motivo?</Text>

          <TouchableOpacity
            style={[styles.changeSheetPrimary, loading && styles.buttonDisabled]}
            onPress={handleBecomeModerator}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={styles.changeSheetPrimaryText}>🙋 Ser yo el moderador</Text>
          </TouchableOpacity>

          <View style={styles.changeSheetFirstTag}>
            <Text style={styles.changeSheetFirstTagText}>El primero que se postule queda</Text>
          </View>

          <TouchableOpacity onPress={() => setShowChangeModerator(false)} activeOpacity={0.7}>
            <Text style={styles.changeSheetCancel}>Cancelar</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );


  if (gamePhase === 'questions' && currentQuestion) {
    return (
      <LinearGradient
        colors={theme.gradient}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
          {/* Level badge: nombre del nivel arriba (grande y centrado) y, debajo,
              el detalle "Nivel X de 3 · Pregunta Y de N". */}
          <View style={[styles.levelBadge, { backgroundColor: theme.timerBadgeBg, borderColor: theme.accentColor + '55' }]}>
            <Text style={styles.levelName}>{levelEmoji} {levelName}</Text>
            <Text style={styles.levelDetail}>Nivel {levelPosition} de 3 · Pregunta {questionNumber} de {questionsInLevel}</Text>
          </View>

          {/* Aviso de última pregunta: solo el moderador, y solo cuando ya no
              queda ninguna. Va ARRIBA de la pregunta para que sea lo primero
              que lee y sepa cómo va a cerrar. */}
          {isModerator && isLastQuestion && (
            <View style={styles.lastQuestionNotice}>
              <Text style={styles.lastQuestionNoticeEmoji}>🗣️</Text>
              <Text style={styles.lastQuestionNoticeText}>
                <Text style={styles.lastQuestionNoticeStrong}>Esta es la última pregunta.</Text> Cuando terminen, presiona Terminar y todos pasarán a elegir con quién sintieron conexión.
              </Text>
            </View>
          )}

          {/* Question card */}
          <View style={[
            styles.questionCard,
            {
              backgroundColor: theme.questionCardBg,
              borderColor: theme.questionCardBorder,
            },
          ]}>
            <View style={[styles.everyoneBadge, { backgroundColor: theme.timerBadgeBg, borderColor: theme.accentColor + '55' }]}>
              <Text style={[styles.everyoneBadgeText, { color: '#FFFFFF' }]}>🙌 Responde quien tenga algo que contar</Text>
            </View>

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

          {/* Instruction card */}
          <View style={[styles.instructionCard, { backgroundColor: 'rgba(0,0,0,0.15)', borderColor: 'rgba(255,255,255,0.2)' }]}>
            <Text style={[styles.instructionText, { color: theme.instructionText }]}>
              {isModerator
                ? (isLastQuestion
                    ? '🗣️ Lee la pregunta en voz alta. No todos tienen que responder: habla quien tenga algo que aportar.'
                    : '🗣️ Lee la pregunta en voz alta. No todos tienen que responder: habla quien tenga algo que aportar. Cuando terminen, pasas a la siguiente.')
                : 'No todos tienen que responder: habla quien tenga una historia o algo que aportar.'}
            </Text>
          </View>

          {/* Avance: solo el moderador; el resto espera a que él pase. */}
          {isModerator ? (
            timerExpired ? (
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
                  {loading ? 'Cargando...' : (isLastQuestion ? 'Terminar' : 'Siguiente')}
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
            )
          ) : (
            <View style={styles.continueButtonWaitingC}>
              <Text style={styles.continueButtonTextWaiting}>
                ⏳ Espera a que {moderatorName} {isLastQuestion ? 'termine la dinámica' : 'pase a la siguiente'}
              </Text>
            </View>
          )}

          {/* Cambiar moderador: para los DEMAS (tomar el relevo). El moderador
              actual no lo necesita -- ya tiene el control -- y verlo lo
              confundia. Si no hay moderador (dato viejo), se muestra a todos. */}
          {!(moderatorId && currentUserId === moderatorId) && (
          <TouchableOpacity
            style={styles.changeModeratorBtn}
            onPress={() => setShowChangeModerator(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.changeModeratorText}>🔄 Cambiar moderador</Text>
          </TouchableOpacity>
          )}

          {moderatorId && (
            <Text style={styles.moderatorTag}>
              {isModerator ? 'Eres el moderador · solo tú avanzas' : `${moderatorName} es el moderador`}
            </Text>
          )}
        </ScrollView>

        {changeModeratorSheet}

        {/* Level Transition Animation Overlay */}
        {showLevelTransition && transitionLevel && (
          <View style={styles.transitionOverlay}>
            <View style={styles.transitionCard}>
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
            </View>
          </View>
        )}
      </LinearGradient>
    );
  }

  // Cualquier estado sin pantalla propia (restaurando tras un refresh, o la
  // fase 'finished' mientras navega al cierre) muestra este cargador en vez de
  // una pantalla negra: antes aqui habia un "return null" y el usuario veia
  // negro puro durante la sincronizacion o al terminar la dinamica.
  return (
    <LinearGradient
      colors={['#1a0010', '#880E4F', '#AD1457']}
      style={styles.gradient}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <View style={styles.syncContainer}>
        {gamePhase === 'finished' && !closingNavigated ? (
          // Primer instante tras terminar: un solo estado de carga continuo
          // hasta que abre el cierre (antes se alcanzaba a ver esta pantalla
          // completa un frame y la transicion se sentia como varios brincos).
          <>
            <ActivityIndicator size="large" color="#FFFFFF" />
            <Text style={styles.syncText}>💘 Preparando el cierre…</Text>
          </>
        ) : gamePhase === 'finished' ? (
          // La navegacion al cierre ya se disparo una vez (closingTriggeredRef).
          // Si la persona VUELVE a esta pestana despues, no puede quedarse
          // mirando un spinner eterno: se le dice que termino y se le da el
          // boton para volver al cierre cuando quiera.
          <>
            <Text style={styles.syncEmoji}>🎉</Text>
            <Text style={styles.syncTitle}>La dinámica terminó</Text>
            <Text style={styles.syncText}>Ahora viene lo mejor: elegir con quién sentiste conexión.</Text>
            <TouchableOpacity
              style={styles.syncButton}
              onPress={() => router.push(`/catch-up-rating/${appointment?.event_id}` as any)}
              activeOpacity={0.85}
            >
              <Text style={styles.syncButtonText}>💘 Ir al cierre</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color="#FFFFFF" />
            <Text style={styles.syncText}>Sincronizando la dinámica…</Text>
          </>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  syncContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  syncText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 30,
  },
  syncEmoji: {
    fontSize: 52,
  },
  syncTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  syncButton: {
    backgroundColor: '#880E4F',
    borderRadius: 50,
    borderWidth: 1.5,
    borderColor: 'rgba(240,98,146,0.5)',
    paddingVertical: 15,
    paddingHorizontal: 40,
    marginTop: 8,
  },
  syncButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
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
    borderRadius: 24,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 22,
    marginTop: 60,
    marginBottom: 14,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  levelName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  levelDetail: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.82)',
    letterSpacing: 0.6,
    textAlign: 'center',
    marginTop: 2,
  },
  // Estilos antiguos del badge de una sola línea (ya no se usan, se conservan
  // por si algún otro punto los referencia).
  levelEmoji: {
    fontSize: 18,
    marginRight: 7,
  },
  levelText: {
    fontSize: 14,
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
    fontSize: 28,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 38,
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
    fontSize: 24,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  // ── Everyone badge (dentro de la tarjeta de la pregunta) ────────────────────
  everyoneBadge: {
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  everyoneBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
  },

  // ── Instruction card ─────────────────────────────────────────────────────────
  // Aviso de última pregunta (solo moderador). Mismo amarillo que el "léelo en
  // voz alta" de la pantalla de reglas, para que reconozca de una que le toca leer.
  lastQuestionNotice: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,214,0,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,214,0,0.5)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  lastQuestionNoticeEmoji: {
    fontSize: 22,
  },
  lastQuestionNoticeText: {
    flex: 1,
    fontSize: 14,
    color: '#ffe9a8',
    lineHeight: 21,
    fontWeight: '600',
  },
  lastQuestionNoticeStrong: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  instructionCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
    alignItems: 'center',
  },
  instructionText: {
    fontSize: 14,
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
    fontSize: 17,
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
    fontSize: 24,
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
    fontSize: 21,
    fontWeight: '700',
  },
  continueButtonTextWaiting: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.3,
  },
  buttonDisabled: {
    opacity: 0.6,
  },

  // ── Moderador: cambiar rol y etiqueta ────────────────────────────────────────
  changeModeratorBtn: {
    marginTop: 10,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    borderRadius: 22,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  changeModeratorText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  moderatorTag: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
  },
  changeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  changeSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 34,
  },
  changeSheetTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#6d0e3c',
    textAlign: 'center',
  },
  changeSheetText: {
    fontSize: 14,
    color: '#7a5560',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  changeSheetPrimary: {
    backgroundColor: '#AD1457',
    borderRadius: 26,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 18,
  },
  changeSheetPrimaryText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  changeSheetFirstTag: {
    alignSelf: 'center',
    marginTop: 14,
    backgroundColor: '#faf2f7',
    borderWidth: 1,
    borderColor: '#e3a7c4',
    borderRadius: 22,
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  changeSheetFirstTagText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#6d0e3c',
  },
  changeSheetCancel: {
    textAlign: 'center',
    color: '#9a8f96',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 18,
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
    fontSize: 34,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
  },
  transitionFullSubtitle: {
    fontSize: 20,
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
    fontSize: 20,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 10,
    textAlign: 'center',
  },
  transitionLevel: {
    fontSize: 38,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
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
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});
