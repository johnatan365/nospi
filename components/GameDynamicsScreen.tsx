
/**
 * GameDynamicsScreen - Nospi Interactive Game Experience
 * 
 * SIMPLIFIED ARCHITECTURE:
 * - Direct question flow without roulette
 * - Clean state management
 * - Realtime synchronization
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';

type QuestionLevel = 'divertido' | 'sensual' | 'atrevido';
type GamePhase = 'ready' | 'question';

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
    current_question?: string;
    current_question_level?: string;
  };
}

interface GameDynamicsScreenProps {
  appointment: Appointment;
  activeParticipants: Participant[];
}

export default function GameDynamicsScreen({ appointment, activeParticipants }: GameDynamicsScreenProps) {
  console.log('🎮 Rendering GameDynamicsScreen');
  
  const [gamePhase, setGamePhase] = useState<GamePhase>('ready');
  const [currentLevel] = useState<QuestionLevel>('divertido');
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [answeredUsers, setAnsweredUsers] = useState<string[]>([]);

  // Generate random question
  const generateQuestion = useCallback(() => {
    const questions = [
      '¿te gusta bailar?',
      '¿cuál es tu mayor sueño?',
      '¿qué te hace feliz?',
      '¿cuál es tu mayor miedo?',
      '¿qué harías si ganaras la lotería?',
      '¿cuál es tu película favorita?',
      '¿prefieres el mar o la montaña?',
      '¿qué superpoder te gustaría tener?',
      '¿cuál es tu comida favorita?',
      '¿qué te hace reír?'
    ];
    
    return questions[Math.floor(Math.random() * questions.length)];
  }, []);

  // Realtime subscription for game state updates
  useEffect(() => {
    if (!appointment?.event_id) return;

    console.log('📡 === SUSCRIBIÉNDOSE AL ESTADO DEL JUEGO ===');
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
          console.log('📡 === ACTUALIZACIÓN VIA REALTIME ===');
          const newEvent = payload.new as any;
          console.log('📡 Nueva fase:', newEvent.game_phase);
          console.log('📡 Pregunta actual:', newEvent.current_question);
          console.log('📡 Índice de pregunta:', newEvent.current_question_index);
          
          // Sync state from database
          if (newEvent.game_phase === 'question') {
            console.log('📝 Sincronizando fase de pregunta');
            setGamePhase('question');
            
            if (newEvent.current_question) {
              setCurrentQuestion(newEvent.current_question);
            }
            
            if (newEvent.current_question_index !== undefined) {
              setCurrentQuestionIndex(newEvent.current_question_index);
            }
            
            if (newEvent.answered_users) {
              setAnsweredUsers(newEvent.answered_users);
            }
          } else if (newEvent.game_phase === 'ready') {
            console.log('⏳ Sincronizando fase ready');
            setGamePhase('ready');
            setCurrentQuestion(null);
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 Estado de suscripción:', status);
      });

    return () => {
      console.log('📡 Cancelando suscripción');
      supabase.removeChannel(channel);
    };
  }, [appointment?.event_id]);

  // Initial sync from database
  useEffect(() => {
    console.log('=== SINCRONIZACIÓN INICIAL ===');
    console.log('Fase del evento:', appointment.event.game_phase);
    
    const dbPhase = appointment.event.game_phase;
    
    if (dbPhase === 'question') {
      console.log('📝 Fase de pregunta detectada');
      
      if (appointment.event.current_question) {
        setCurrentQuestion(appointment.event.current_question);
      }
      
      setGamePhase('question');
    } else {
      console.log('⏳ Fase ready o inicial');
      setGamePhase('ready');
    }
  }, [appointment.event.game_phase, appointment.event.current_question]);

  const handleStartQuestion = useCallback(async () => {
    console.log('🎮 === INICIANDO PREGUNTA ===');
    
    if (!appointment?.event_id) {
      console.error('❌ No hay event_id');
      return;
    }

    try {
      const newQuestion = generateQuestion();
      console.log('📝 Pregunta generada:', newQuestion);
      
      const { error } = await supabase
        .from('events')
        .update({
          game_phase: 'question',
          current_question: newQuestion,
          current_question_level: currentLevel,
          current_question_index: 0,
          answered_users: [],
          updated_at: new Date().toISOString(),
        })
        .eq('id', appointment.event_id);

      if (error) {
        console.error('❌ Error al iniciar pregunta:', error);
        Alert.alert('Error', 'No se pudo iniciar la pregunta.');
        return;
      }

      console.log('✅ Pregunta iniciada');
      setGamePhase('question');
      setCurrentQuestion(newQuestion);
      setCurrentQuestionIndex(0);
      setAnsweredUsers([]);
    } catch (error: any) {
      console.error('❌ Error inesperado:', error);
      Alert.alert('Error', error.message || 'Ocurrió un error.');
    }
  }, [appointment?.event_id, currentLevel, generateQuestion]);

  const handleNextQuestion = useCallback(async () => {
    console.log('🎮 === SIGUIENTE PREGUNTA ===');
    
    if (!appointment?.event_id) {
      console.error('❌ No hay event_id');
      return;
    }

    try {
      const newQuestion = generateQuestion();
      const newIndex = currentQuestionIndex + 1;
      console.log('📝 Nueva pregunta:', newQuestion);
      console.log('📝 Nuevo índice:', newIndex);
      
      const { error } = await supabase
        .from('events')
        .update({
          game_phase: 'question',
          current_question: newQuestion,
          current_question_index: newIndex,
          answered_users: [],
          updated_at: new Date().toISOString(),
        })
        .eq('id', appointment.event_id);

      if (error) {
        console.error('❌ Error al pasar a siguiente pregunta:', error);
        Alert.alert('Error', 'No se pudo pasar a la siguiente pregunta.');
        return;
      }

      console.log('✅ Siguiente pregunta iniciada');
      setCurrentQuestion(newQuestion);
      setCurrentQuestionIndex(newIndex);
      setAnsweredUsers([]);
    } catch (error: any) {
      console.error('❌ Error inesperado:', error);
      Alert.alert('Error', error.message || 'Ocurrió un error.');
    }
  }, [appointment?.event_id, currentQuestionIndex, generateQuestion]);

  if (gamePhase === 'ready') {
    return (
      <LinearGradient
        colors={['#1a0b2e', '#2d1b4e', '#4a2c6e']}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <View style={styles.readyContainer}>
          <Text style={styles.readyTitle}>¡Listos para comenzar!</Text>
          <Text style={styles.readySubtitle}>Presiona el botón para iniciar la primera pregunta</Text>

          <View style={styles.participantsCard}>
            <Text style={styles.participantsTitle}>Participantes ({activeParticipants.length})</Text>
            {activeParticipants.map((participant) => {
              const displayName = participant.name;
              
              return (
                <View key={participant.id} style={styles.participantRow}>
                  <Text style={styles.participantNameText}>{displayName}</Text>
                </View>
              );
            })}
          </View>

          <TouchableOpacity
            style={styles.startButton}
            onPress={handleStartQuestion}
            activeOpacity={0.8}
          >
            <Text style={styles.startButtonText}>🎯 Iniciar Pregunta</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  if (gamePhase === 'question' && currentQuestion) {
    const answeredCount = answeredUsers.length;
    const totalCount = activeParticipants.length;
    const progressText = `${answeredCount} de ${totalCount} han respondido`;

    return (
      <LinearGradient
        colors={['#FFFFFF', '#F3E8FF', '#E9D5FF']}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
          <View style={styles.questionCard}>
            <Text style={styles.questionIcon}>❓</Text>
            <Text style={styles.questionText}>{currentQuestion}</Text>
          </View>

          <View style={styles.progressCard}>
            <Text style={styles.progressTitle}>Progreso</Text>
            <Text style={styles.progressText}>{progressText}</Text>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoText}>
              🔄 Todos los participantes ven la misma pregunta en tiempo real
            </Text>
          </View>

          <TouchableOpacity
            style={styles.nextButton}
            onPress={handleNextQuestion}
            activeOpacity={0.8}
          >
            <Text style={styles.nextButtonText}>Siguiente Pregunta</Text>
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
  readyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  readyTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  readySubtitle: {
    fontSize: 18,
    color: '#FFFFFF',
    marginBottom: 40,
    opacity: 0.9,
    textAlign: 'center',
  },
  participantsCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 24,
    marginBottom: 40,
    width: '100%',
    maxWidth: 400,
  },
  participantsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 16,
    textAlign: 'center',
  },
  participantRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  participantNameText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
    textAlign: 'center',
  },
  startButton: {
    backgroundColor: '#FFD700',
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 48,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  startButtonText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1a0b2e',
  },
  questionCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 48,
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
    color: nospiColors.purpleDark,
    textAlign: 'center',
    fontWeight: '600',
  },
  progressCard: {
    backgroundColor: nospiColors.purpleLight,
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
    color: nospiColors.purpleDark,
    fontWeight: 'bold',
  },
  infoCard: {
    backgroundColor: '#DBEAFE',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#3B82F6',
    marginBottom: 24,
  },
  infoText: {
    fontSize: 14,
    color: '#1E40AF',
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: '600',
  },
  nextButton: {
    backgroundColor: nospiColors.purpleDark,
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
  nextButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});
