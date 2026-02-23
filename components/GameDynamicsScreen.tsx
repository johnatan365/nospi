
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import MatchSelectionScreen from './MatchSelectionScreen';

type QuestionLevel = 'divertido' | 'sensual' | 'atrevido';
type GamePhase = 'ready' | 'question_active' | 'match_selection' | 'level_transition' | 'finished';

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
    match_started_at?: string;
    match_deadline_at?: string;
  };
}

interface GameDynamicsScreenProps {
  appointment: Appointment;
  activeParticipants: Participant[];
}

// Questions will be loaded from database
const DEFAULT_QUESTIONS = {
  divertido: [
    '¿Cuál es tu nombre y a qué te dedicas?',
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

let QUESTIONS = { ...DEFAULT_QUESTIONS };

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
  const [matchStartedAt, setMatchStartedAt] = useState<string | null>(null);
  const [matchDeadlineAt, setMatchDeadlineAt] = useState<string | null>(null);
  const [questionStartTime, setQuestionStartTime] = useState<Date | null>(null);
  const [questionTimeRemaining, setQuestionTimeRemaining] = useState<number>(300); // 5 minutes in seconds
  const [userRatings, setUserRatings] = useState<{ [userId: string]: number }>({});
  
  // CRITICAL: Ref to prevent Realtime race conditions during optimistic updates
  const isOptimisticUpdateRef = useRef(false);
  const questionTimerRef = useRef<NodeJS.Timeout | null>(null);

  // CRITICAL FIX: Define handleFinishEvent at the TOP LEVEL, unconditionally
  // This must be defined before any conditional logic to avoid "Rendered more hooks than during the previous render" error
  const handleFinishEvent = useCallback(async () => {
    if (!appointment?.event_id) return;

    console.log('🏁 === FINISHING EVENT ===');
    setLoading(true);

    try {
      // CRITICAL FIX: Move ALL appointments for this event to "anterior" status
      // This ensures BOTH users see the event in "anteriores"
      const { data: allAppointments, error: fetchError } = await supabase
        .from('appointments')
        .select('id')
        .eq('event_id', appointment.event_id);

      if (fetchError) {
        console.error('❌ Error fetching appointments:', fetchError);
      } else {
        console.log('📊 Found appointments to update:', allAppointments?.length || 0);
        
        // Update ALL appointments to "anterior" status
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

      // Reset game phase to intro for next time
      const { error: eventError } = await supabase
        .from('events')
        .update({
          game_phase: 'intro',
          current_level: null,
          current_question_index: null,
          answered_users: null,
          current_question: null,
          current_question_starter_id: null,
          match_started_at: null,
          match_deadline_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', appointment.event_id);

      if (eventError) {
        console.error('❌ Error resetting event:', eventError);
      } else {
        console.log('✅ Event reset successfully');
      }

      // Reset local state to ready phase
      setGamePhase('ready');
      setCurrentLevel('divertido');
      setCurrentQuestionIndex(0);
      setAnsweredUsers([]);
      setCurrentQuestion(null);
      setStarterParticipant(null);
      setMatchStartedAt(null);
      setMatchDeadlineAt(null);
      setUserRatings({});

      console.log('✅ Event finished successfully - returned to ready state');
    } catch (error) {
      console.error('❌ Unexpected error finishing event:', error);
    } finally {
      setLoading(false);
    }
  }, [appointment]);

  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }
    };
    getCurrentUser();

    // FIX: Load questions from database for THIS EVENT ONLY
    const loadQuestions = async () => {
      try {
        console.log('📚 Loading questions for event:', appointment.event_id);
        
        // First, try to load event-specific questions
        const { data: eventQuestions, error: eventError } = await supabase
          .from('event_questions')
          .select('*')
          .eq('event_id', appointment.event_id)
          .order('level', { ascending: true })
          .order('question_order', { ascending: true });

        if (eventError) {
          console.error('Error loading event questions:', eventError);
        }

        // If event has custom questions, use them
        if (eventQuestions && eventQuestions.length > 0) {
          const questionsByLevel: any = {
            divertido: [],
            sensual: [],
            atrevido: []
          };

          eventQuestions.forEach((q: any) => {
            if (questionsByLevel[q.level]) {
              questionsByLevel[q.level].push(q.question_text);
            }
          });

          // Only update if we have questions for all levels
          if (questionsByLevel.divertido.length > 0 && 
              questionsByLevel.sensual.length > 0 && 
              questionsByLevel.atrevido.length > 0) {
            QUESTIONS = questionsByLevel;
            console.log('✅ Event-specific questions loaded');
            return;
          }
        }

        // Otherwise, fall back to default questions
        console.log('📚 Loading default questions (no event-specific questions found)');
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
            atrevido: []
          };

          defaultQuestions.forEach((q: any) => {
            if (questionsByLevel[q.level]) {
              questionsByLevel[q.level].push(q.question_text);
            }
          });

          // Only update if we have questions for all levels
          if (questionsByLevel.divertido.length > 0 && 
              questionsByLevel.sensual.length > 0 && 
              questionsByLevel.atrevido.length > 0) {
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

  // Define handleContinue before it's used in the timer effect
  const handleContinue = useCallback(async () => {
    console.log('➡️ === CONTINUING TO NEXT QUESTION ===');
    const actionStartTime = performance.now();
    console.log('⏱️ Button pressed at:', actionStartTime);
    
    if (!appointment?.event_id) return;

    const questionsForLevel = QUESTIONS[currentLevel];
    const nextQuestionIndex = currentQuestionIndex + 1;

    // Store previous state for potential revert
    const previousQuestionIndex = currentQuestionIndex;
    const previousAnsweredUsers = [...answeredUsers];
    const previousQuestion = currentQuestion;
    const previousStarter = starterParticipant;
    const previousGamePhase = gamePhase;

    // 1. OPTIMISTIC UI: Set flag IMMEDIATELY to block Realtime updates
    isOptimisticUpdateRef.current = true;
    console.log('🔒 Optimistic update flag SET (continue)');

    setLoading(true);

    try {
      if (nextQuestionIndex < questionsForLevel.length) {
        // Next question in same level
        const randomIndex = Math.floor(Math.random() * activeParticipants.length);
        const newStarterUserId = activeParticipants[randomIndex].user_id;
        const newStarter = activeParticipants[randomIndex];
        const nextQuestion = questionsForLevel[nextQuestionIndex];

        // 1. OPTIMISTIC UI: Update UI immediately - don't wait for database
        console.log('⚡ Optimistically updating to next question');
        setCurrentQuestionIndex(nextQuestionIndex);
        setAnsweredUsers([]);
        setCurrentQuestion(nextQuestion);
        setStarterParticipant(newStarter);
        
        const uiUpdateTime = performance.now();
        console.log('⚡ UI update time:', (uiUpdateTime - actionStartTime).toFixed(2), 'ms');

        // 2. DATABASE UPDATE: Send update in background
        console.log('💾 Starting database update...');
        const dbUpdateStartTime = performance.now();

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

        const dbUpdateEndTime = performance.now();
        console.log('💾 Database update duration:', (dbUpdateEndTime - dbUpdateStartTime).toFixed(2), 'ms');
        console.log('⏱️ Total time from button press to DB update:', (dbUpdateEndTime - actionStartTime).toFixed(2), 'ms');

        if (error) {
          console.error('❌ Error advancing question:', error);
          // 4. REVERT: Revert optimistic update on failure
          isOptimisticUpdateRef.current = false;
          setCurrentQuestionIndex(previousQuestionIndex);
          setAnsweredUsers(previousAnsweredUsers);
          setCurrentQuestion(previousQuestion);
          setStarterParticipant(previousStarter);
          return;
        }

        console.log('✅ Advanced to next question');
        
        // 3. SYNC: Keep flag set for 1500ms to prevent race conditions with Realtime
        setTimeout(() => {
          isOptimisticUpdateRef.current = false;
          console.log('🔓 Optimistic update flag CLEARED (continue)');
        }, 1500);
      } else {
        // Level finished - transition to match selection
        console.log('⚡ Optimistically transitioning to match_selection');
        
        // Calculate match deadline (20 seconds from now)
        const now = new Date();
        const deadline = new Date(now.getTime() + 20 * 1000);
        
        // 1. OPTIMISTIC UI: Update UI immediately - don't wait for database
        setGamePhase('match_selection');
        setMatchStartedAt(now.toISOString());
        setMatchDeadlineAt(deadline.toISOString());
        
        const uiUpdateTime = performance.now();
        console.log('⚡ UI update time:', (uiUpdateTime - actionStartTime).toFixed(2), 'ms');

        // 2. DATABASE UPDATE: Send update in background
        console.log('💾 Starting database update...');
        const dbUpdateStartTime = performance.now();

        const { error } = await supabase
          .from('events')
          .update({
            game_phase: 'match_selection',
            match_started_at: now.toISOString(),
            match_deadline_at: deadline.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', appointment.event_id);

        const dbUpdateEndTime = performance.now();
        console.log('💾 Database update duration:', (dbUpdateEndTime - dbUpdateStartTime).toFixed(2), 'ms');
        console.log('⏱️ Total time from button press to DB update:', (dbUpdateEndTime - actionStartTime).toFixed(2), 'ms');

        if (error) {
          console.error('❌ Error transitioning to match selection:', error);
          // 4. REVERT: Revert optimistic update on failure
          isOptimisticUpdateRef.current = false;
          setGamePhase(previousGamePhase);
          setMatchStartedAt(null);
          setMatchDeadlineAt(null);
          return;
        }

        console.log('✅ Level finished - transitioning to match selection with deadline:', deadline.toISOString());
        
        // 3. SYNC: Keep flag set for 1500ms to prevent race conditions with Realtime
        setTimeout(() => {
          isOptimisticUpdateRef.current = false;
          console.log('🔓 Optimistic update flag CLEARED (match selection transition)');
        }, 1500);
      }
    } catch (error) {
      console.error('❌ Unexpected error:', error);
      // 4. REVERT: Revert optimistic update on failure
      isOptimisticUpdateRef.current = false;
      setCurrentQuestionIndex(previousQuestionIndex);
      setAnsweredUsers(previousAnsweredUsers);
      setCurrentQuestion(previousQuestion);
      setStarterParticipant(previousStarter);
      setGamePhase(previousGamePhase);
      setMatchStartedAt(null);
      setMatchDeadlineAt(null);
    } finally {
      setLoading(false);
    }
  }, [appointment, currentLevel, currentQuestionIndex, activeParticipants, answeredUsers, currentQuestion, starterParticipant, gamePhase]);

  // Question timer - 5 minutes per question
  useEffect(() => {
    if (gamePhase !== 'question_active') {
      if (questionTimerRef.current) {
        clearInterval(questionTimerRef.current);
        questionTimerRef.current = null;
      }
      return;
    }

    // Start timer when question becomes active
    setQuestionStartTime(new Date());
    setQuestionTimeRemaining(300); // 5 minutes

    questionTimerRef.current = setInterval(() => {
      setQuestionTimeRemaining((prev) => {
        if (prev <= 1) {
          // Time's up - auto advance
          console.log('⏰ Question time expired - auto advancing');
          handleContinue();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (questionTimerRef.current) {
        clearInterval(questionTimerRef.current);
        questionTimerRef.current = null;
      }
    };
  }, [gamePhase, currentQuestionIndex, handleContinue]);

  // CRITICAL: Reconnection Safety - Always derive state from event_state
  useEffect(() => {
    if (!appointment?.event_id) return;

    console.log('🔄 === RECONNECTION SAFETY: Checking event_state ===');
    
    const restoreStateFromDatabase = async () => {
      if (isOptimisticUpdateRef.current) {
        console.log('⏭️ Skipping state restoration - optimistic update in progress');
        return;
      }

      console.log('📥 Fetching current event state from database');
      
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
        answered_users: data.answered_users,
        match_started_at: data.match_started_at,
        match_deadline_at: data.match_deadline_at
      });

      // CRITICAL FIX: Restore state EXACTLY as stored in database
      // Do NOT recalculate or derive phase from vote counts
      // Trust the database game_phase field as the single source of truth
      
      if (data.game_phase === 'match_selection') {
        console.log('🔄 Restoring match_selection phase - STABLE until backend changes it');
        setGamePhase('match_selection');
        setCurrentLevel((data.current_level as QuestionLevel) || 'divertido');
        setMatchStartedAt(data.match_started_at || null);
        setMatchDeadlineAt(data.match_deadline_at || null);
      } else if (data.game_phase === 'question_active') {
        console.log('🔄 Restoring question_active phase');
        setGamePhase('question_active');
        setCurrentLevel((data.current_level as QuestionLevel) || 'divertido');
        setCurrentQuestionIndex(data.current_question_index || 0);
        setAnsweredUsers(data.answered_users || []);
        setCurrentQuestion(data.current_question || null);
        
        if (data.current_question_starter_id) {
          const starter = activeParticipants.find(p => p.user_id === data.current_question_starter_id);
          setStarterParticipant(starter || null);
        }
      } else if (data.game_phase === 'level_transition') {
        console.log('🔄 Restoring level_transition phase');
        setGamePhase('level_transition');
        setCurrentLevel((data.current_level as QuestionLevel) || 'divertido');
      } else if (data.game_phase === 'finished') {
        console.log('🔄 Restoring finished phase');
        setGamePhase('finished');
      } else {
        console.log('🔄 Restoring ready phase');
        setGamePhase('ready');
      }
    };

    // Restore state on mount and app resume
    restoreStateFromDatabase();
  }, [appointment?.event_id, activeParticipants]);

  // Main data sync and Realtime subscription
  useEffect(() => {
    if (!appointment?.event_id) return;

    console.log('📡 === SETTING UP REALTIME SUBSCRIPTION ===');
    console.log('📡 Event ID:', appointment.event_id);

    // Set up Realtime subscription
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
          // CRITICAL: Skip if we're in the middle of an optimistic update
          if (isOptimisticUpdateRef.current) {
            console.log('⏭️ Skipping realtime update - optimistic update in progress');
            return;
          }
          
          console.log('📡 === REALTIME UPDATE RECEIVED ===');
          const newEvent = payload.new as any;
          console.log('📡 New state:', {
            game_phase: newEvent.game_phase,
            current_level: newEvent.current_level,
            current_question_index: newEvent.current_question_index,
            answered_users: newEvent.answered_users,
            match_started_at: newEvent.match_started_at,
            match_deadline_at: newEvent.match_deadline_at
          });
          
          // CRITICAL FIX: Only update phase if it actually changed in the database
          // Do NOT recalculate or derive phase from vote counts
          // Trust the database as the single source of truth
          
          if (newEvent.game_phase === 'question_active') {
            console.log('📡 Updating to question_active phase');
            setGamePhase('question_active');
            setCurrentLevel(newEvent.current_level || 'divertido');
            setCurrentQuestionIndex(newEvent.current_question_index || 0);
            setAnsweredUsers(newEvent.answered_users || []);
            setCurrentQuestion(newEvent.current_question || null);
            
            if (newEvent.current_question_starter_id) {
              const starter = activeParticipants.find(p => p.user_id === newEvent.current_question_starter_id);
              setStarterParticipant(starter || null);
            }
          } else if (newEvent.game_phase === 'match_selection') {
            console.log('📡 Updating to match_selection phase');
            // CRITICAL: Match phase must remain stable until backend changes it
            setGamePhase('match_selection');
            setCurrentLevel(newEvent.current_level || 'divertido');
            setMatchStartedAt(newEvent.match_started_at || null);
            setMatchDeadlineAt(newEvent.match_deadline_at || null);
          } else if (newEvent.game_phase === 'level_transition') {
            console.log('📡 Updating to level_transition phase');
            setGamePhase('level_transition');
            setCurrentLevel(newEvent.current_level || 'divertido');
          } else if (newEvent.game_phase === 'finished') {
            console.log('📡 Updating to finished phase');
            setGamePhase('finished');
          } else if (newEvent.game_phase === 'ready') {
            console.log('📡 Updating to ready phase');
            setGamePhase('ready');
          }
          
          // CRITICAL: Do NOT change phase based on vote counts or other derived logic
          // The backend is responsible for phase transitions
        }
      )
      .subscribe((status) => {
        console.log('📡 Subscription status:', status);
      });

    return () => {
      console.log('📡 Cleaning up subscription');
      supabase.removeChannel(channel);
    };
  }, [appointment?.event_id, activeParticipants]);

  const handleStartDynamic = useCallback(async () => {
    console.log('🎮 === STARTING DYNAMIC ===');
    const transitionStartTime = performance.now();
    console.log('⏱️ Button pressed at:', transitionStartTime);
    
    if (!appointment?.event_id || activeParticipants.length < 2) {
      console.warn('⚠️ Cannot start - need at least 2 participants');
      return;
    }

    // 1. OPTIMISTIC UI: Set flag IMMEDIATELY to block Realtime updates
    isOptimisticUpdateRef.current = true;
    console.log('🔒 Optimistic update flag SET (start dynamic)');
    
    setLoading(true);
    
    const randomIndex = Math.floor(Math.random() * activeParticipants.length);
    const starterUserId = activeParticipants[randomIndex].user_id;
    const starter = activeParticipants[randomIndex];
    const firstQuestion = QUESTIONS.divertido[0];
    
    // 1. OPTIMISTIC UI: Update UI immediately - don't wait for database
    setGamePhase('question_active');
    setCurrentLevel('divertido');
    setCurrentQuestionIndex(0);
    setAnsweredUsers([]);
    setCurrentQuestion(firstQuestion);
    setStarterParticipant(starter);
    
    const uiTransitionTime = performance.now();
    console.log('⚡ UI transition time:', (uiTransitionTime - transitionStartTime).toFixed(2), 'ms');
    
    try {
      // 2. DATABASE UPDATE: Send update in background
      console.log('💾 Starting database update...');
      const dbUpdateStartTime = performance.now();
      
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

      const dbUpdateEndTime = performance.now();
      console.log('💾 Database update duration:', (dbUpdateEndTime - dbUpdateStartTime).toFixed(2), 'ms');
      console.log('⏱️ Total time from button press to DB update:', (dbUpdateEndTime - transitionStartTime).toFixed(2), 'ms');

      if (error) {
        console.error('❌ Error starting dynamic:', error);
        // 4. REVERT: Revert optimistic update on failure
        isOptimisticUpdateRef.current = false;
        setGamePhase('ready');
        setCurrentQuestion(null);
        setStarterParticipant(null);
        return;
      }

      console.log('✅ Dynamic started successfully');
      
      // 3. SYNC: Keep the flag set for 1500ms to prevent race conditions with Realtime
      setTimeout(() => {
        isOptimisticUpdateRef.current = false;
        console.log('🔓 Optimistic update flag CLEARED (start dynamic)');
      }, 1500);
    } catch (error) {
      console.error('❌ Unexpected error:', error);
      // 4. REVERT: Revert optimistic update on failure
      isOptimisticUpdateRef.current = false;
      setGamePhase('ready');
      setCurrentQuestion(null);
      setStarterParticipant(null);
    } finally {
      setLoading(false);
    }
  }, [appointment, activeParticipants]);

  const handleAnswered = useCallback(async () => {
    console.log('✅ === USER MARKING AS ANSWERED ===');
    const actionStartTime = performance.now();
    console.log('⏱️ Button pressed at:', actionStartTime);
    
    if (!appointment?.event_id || !currentUserId) {
      console.warn('⚠️ Cannot mark as answered - missing event_id or user_id');
      return;
    }
    
    if (answeredUsers.includes(currentUserId)) {
      console.log('⚠️ User already answered');
      return;
    }

    // Store previous state for potential revert
    const previousAnsweredUsers = [...answeredUsers];

    // 1. OPTIMISTIC UI: Set flag IMMEDIATELY to block Realtime updates
    isOptimisticUpdateRef.current = true;
    console.log('🔒 Optimistic update flag SET (answered)');
    
    const newAnsweredUsers = [...answeredUsers, currentUserId];
    
    // 1. OPTIMISTIC UI: Update UI immediately - don't wait for database
    console.log('⚡ Optimistically updating UI with new answered users:', newAnsweredUsers);
    setAnsweredUsers(newAnsweredUsers);
    
    const uiUpdateTime = performance.now();
    console.log('⚡ UI update time:', (uiUpdateTime - actionStartTime).toFixed(2), 'ms');
    
    try {
      // 2. DATABASE UPDATE: Send update in background
      console.log('💾 Starting database update...');
      const dbUpdateStartTime = performance.now();
      
      const { error } = await supabase
        .from('events')
        .update({
          answered_users: newAnsweredUsers,
          updated_at: new Date().toISOString(),
        })
        .eq('id', appointment.event_id);

      const dbUpdateEndTime = performance.now();
      console.log('💾 Database update duration:', (dbUpdateEndTime - dbUpdateStartTime).toFixed(2), 'ms');
      console.log('⏱️ Total time from button press to DB update:', (dbUpdateEndTime - actionStartTime).toFixed(2), 'ms');

      if (error) {
        console.error('❌ Error updating answered users:', error);
        // 4. REVERT: Revert optimistic update on failure
        isOptimisticUpdateRef.current = false;
        setAnsweredUsers(previousAnsweredUsers);
        return;
      }

      console.log('✅ User marked as answered successfully');
      
      // 3. SYNC: Keep the flag set for 1500ms to prevent race conditions with Realtime
      setTimeout(() => {
        isOptimisticUpdateRef.current = false;
        console.log('🔓 Optimistic update flag CLEARED (answered)');
      }, 1500);
    } catch (error) {
      console.error('❌ Unexpected error:', error);
      // 4. REVERT: Revert optimistic update on failure
      isOptimisticUpdateRef.current = false;
      setAnsweredUsers(previousAnsweredUsers);
    }
  }, [appointment, currentUserId, answeredUsers]);

  // CRITICAL: This is called by MatchSelectionScreen when match phase is complete
  // This is the ONLY place where phase transition from match_selection should happen
  const handleMatchComplete = useCallback(async () => {
    console.log('💘 === MATCH SELECTION COMPLETE ===');
    console.log('⚠️ CRITICAL: This is the ONLY authorized phase transition from match_selection');
    
    if (!appointment?.event_id) return;

    setLoading(true);

    try {
      const levels: QuestionLevel[] = ['divertido', 'sensual', 'atrevido'];
      const currentLevelIndex = levels.indexOf(currentLevel);
      const nextLevel = levels[currentLevelIndex + 1];

      if (nextLevel) {
        // Continue to next level
        console.log('➡️ Transitioning to next level:', nextLevel);
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
            match_started_at: null,
            match_deadline_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', appointment.event_id);

        if (error) {
          console.error('❌ Error starting next level:', error);
          return;
        }

        console.log('✅ Started next level:', nextLevel);
      } else {
        // All levels complete - end game (do NOT move to anterior yet - wait for Finalizar button)
        console.log('🏁 All levels complete - transitioning to finished');
        const { error: eventError } = await supabase
          .from('events')
          .update({
            game_phase: 'finished',
            match_started_at: null,
            match_deadline_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', appointment.event_id);

        if (eventError) {
          console.error('❌ Error ending game:', eventError);
          return;
        }

        console.log('✅ Game ended - waiting for user to click Finalizar');
      }
    } catch (error) {
      console.error('❌ Unexpected error:', error);
    } finally {
      setLoading(false);
    }
  }, [appointment, currentLevel, activeParticipants]);

  const handleRateUser = useCallback(async (ratedUserId: string, rating: number) => {
    if (!appointment?.event_id || !currentUserId) return;

    console.log('⭐ Rating user:', ratedUserId, 'with', rating, 'stars');

    try {
      // Save rating to database
      const { error } = await supabase
        .from('event_ratings')
        .upsert({
          event_id: appointment.event_id,
          rater_user_id: currentUserId,
          rated_user_id: ratedUserId,
          rating: rating,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'event_id,rater_user_id,rated_user_id'
        });

      if (error) {
        console.error('❌ Error saving rating:', error);
        return;
      }

      console.log('✅ Rating saved successfully');
      
      // Update local state
      setUserRatings(prev => ({
        ...prev,
        [ratedUserId]: rating
      }));
    } catch (error) {
      console.error('❌ Failed to save rating:', error);
    }
  }, [appointment, currentUserId]);

  const answeredCount = answeredUsers.length;
  const totalCount = activeParticipants.length;
  const allAnswered = answeredCount === totalCount && totalCount > 0;
  const userHasAnswered = currentUserId ? answeredUsers.includes(currentUserId) : false;

  const levelEmoji = currentLevel === 'divertido' ? '😄' : currentLevel === 'sensual' ? '💕' : '🔥';
  const levelName = currentLevel === 'divertido' ? 'Divertido' : currentLevel === 'sensual' ? 'Sensual' : 'Atrevido';

  // Format timer display
  const timerMinutes = Math.floor(questionTimeRemaining / 60);
  const timerSeconds = questionTimeRemaining % 60;
  const timerDisplay = `${timerMinutes}:${timerSeconds.toString().padStart(2, '0')}`;

  // CRITICAL: Show match selection screen - NO DYNAMIC KEY
  // Component must remain mounted during entire match_selection phase
  // Do NOT add key prop that changes based on vote count or other dynamic values
  if (gamePhase === 'match_selection' && currentUserId) {
    console.log('🎮 Rendering MatchSelectionScreen - phase is STABLE');
    return (
      <MatchSelectionScreen
        eventId={appointment.event_id}
        currentLevel={currentLevel}
        currentUserId={currentUserId}
        participants={activeParticipants}
        onMatchComplete={handleMatchComplete}
        matchDeadlineAt={matchDeadlineAt}
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
              El sistema elegirá quién rompe el hielo 😉{'\n\n'}
              Cuando todos hayan participado, la siguiente pregunta aparecerá automáticamente.
            </Text>
          </View>

          <View style={styles.ruleCard}>
            <Text style={styles.ruleEmoji}>😏</Text>
            <Text style={styles.ruleTitle}>Regla extra:</Text>
            <Text style={styles.ruleText}>
              Si alguien decide no responder una pregunta,{'\n'}
              deberá tomar un shot 🥃 o cumplir un reto que el grupo le asigne.
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

  if (gamePhase === 'question_active' && currentQuestion) {
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

          <View style={styles.timerCard}>
            <Text style={styles.timerLabel}>⏱️ Tiempo restante:</Text>
            <Text style={[styles.timerDisplay, questionTimeRemaining < 60 && styles.timerWarning]}>
              {timerDisplay}
            </Text>
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

  if (gamePhase === 'level_transition') {
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
        </ScrollView>
      </LinearGradient>
    );
  }

  if (gamePhase === 'finished') {
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
            <Text style={styles.iceBreakSubtitle}>Ahora disfruten el resto de la noche y déjense sorprender 💜</Text>
          </View>

          <View style={styles.evaluationCard}>
            <Text style={styles.evaluationIcon}>⭐</Text>
            <Text style={styles.evaluationTitle}>Evalúa tu experiencia</Text>
            <Text style={styles.evaluationText}>
              Puedes calificar a los demás participantes.{'\n'}
              Esta información nos ayuda a mejorar futuros encuentros.
            </Text>
            
            <View style={styles.participantsRatingSection}>
              {activeParticipants.filter(p => p.user_id !== currentUserId).map((participant, index) => {
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
                          <Text style={[styles.starIcon, star <= currentRating && styles.starIconSelected]}>⭐</Text>
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
  ruleCard: {
    backgroundColor: 'rgba(255, 245, 230, 0.95)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: 'rgba(255, 200, 100, 0.5)',
  },
  ruleEmoji: {
    fontSize: 32,
    textAlign: 'center',
    marginBottom: 8,
  },
  ruleTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#8B4513',
    marginBottom: 12,
    textAlign: 'center',
  },
  ruleText: {
    fontSize: 15,
    color: '#5D4037',
    lineHeight: 22,
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
  timerCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  timerLabel: {
    fontSize: 14,
    color: nospiColors.purpleDark,
    marginBottom: 8,
    fontWeight: '600',
  },
  timerDisplay: {
    fontSize: 36,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
  },
  timerWarning: {
    color: '#EF4444',
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
