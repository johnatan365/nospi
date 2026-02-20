
/**
 * GameDynamicsScreen - Nospi Interactive Game Experience
 * 
 * CLEAN STABLE ARCHITECTURE:
 * - Client-side participant selection with direct table updates
 * - NO RPC functions or Edge Functions
 * - All clients sync via Realtime subscriptions
 * - No automatic phase rollback
 * - Forward-only phase transitions
 * - Professional roulette UI with 4.2s animation
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Easing, Image, Dimensions, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';

type QuestionLevel = 'divertido' | 'sensual' | 'atrevido';
type GamePhase = 'ready' | 'waiting_for_spin' | 'show_result' | 'question';

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
    selected_participant_id?: string;
    selected_participant_name?: string;
    current_question?: string;
    current_question_level?: string;
  };
}

interface GameDynamicsScreenProps {
  appointment: Appointment;
  activeParticipants: Participant[];
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const WHEEL_SIZE = Math.min(SCREEN_WIDTH - 64, 340);

// Professional elegant colors for wheel segments
const SEGMENT_COLORS = [
  '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#3B82F6',
  '#EF4444', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981',
];

export default function GameDynamicsScreen({ appointment, activeParticipants }: GameDynamicsScreenProps) {
  const [gamePhase, setGamePhase] = useState<GamePhase>('ready');
  const [currentLevel] = useState<QuestionLevel>('divertido');
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  
  const wheelRotation = useRef(new Animated.Value(0)).current;
  const glowAnimation = useRef(new Animated.Value(0)).current;
  const selectedPulse = useRef(new Animated.Value(1)).current;

  // Sync game state from database
  useEffect(() => {
    console.log('=== SINCRONIZANDO ESTADO DEL JUEGO DESDE LA BASE DE DATOS ===');
    console.log('Fase del evento:', appointment.event.game_phase);
    
    const dbPhase = appointment.event.game_phase;
    
    if (dbPhase === 'show_result' || dbPhase === 'question') {
      // Encontrar participante seleccionado
      const participant = activeParticipants.find(
        p => p.user_id === appointment.event.selected_participant_id
      );
      
      if (participant) {
        setSelectedParticipant(participant);
      }
      
      if (appointment.event.current_question) {
        setCurrentQuestion(appointment.event.current_question);
      }
      
      if (dbPhase === 'question') {
        setGamePhase('question');
      } else {
        setGamePhase('show_result');
      }
    } else if (dbPhase === 'roulette' || dbPhase === 'waiting_for_spin') {
      setGamePhase('waiting_for_spin');
    } else {
      setGamePhase('ready');
    }
  }, [appointment.event.game_phase, appointment.event.selected_participant_id, appointment.event.current_question, activeParticipants]);

  // DECLARE startRouletteAnimation BEFORE the useEffect that uses it
  const startRouletteAnimation = useCallback(() => {
    console.log('=== INICIANDO ANIMACIÓN DE LA RULETA ===');
    setIsSpinning(true);
    setGamePhase('show_result');
    
    // Reiniciar animaciones
    wheelRotation.setValue(0);
    glowAnimation.setValue(0);
    
    // Calcular rotación objetivo
    const targetIndex = Math.floor(Math.random() * activeParticipants.length);
    const degreesPerSegment = 360 / activeParticipants.length;
    const extraSpins = 5 + Math.floor(Math.random() * 2);
    const targetRotation = (extraSpins * 360) + (targetIndex * degreesPerSegment);
    
    console.log('Rotación objetivo:', targetRotation, 'grados');
    
    // Iniciar animación de brillo
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnimation, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glowAnimation, {
          toValue: 0,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
    
    // Animación principal de la rueda - 4.2 segundos con desaceleración suave
    Animated.timing(wheelRotation, {
      toValue: targetRotation,
      duration: 4200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      console.log('Animación completada');
      setIsSpinning(false);
      
      // Pulso del segmento seleccionado
      Animated.sequence([
        Animated.timing(selectedPulse, {
          toValue: 1.1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(selectedPulse, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, [activeParticipants.length, wheelRotation, glowAnimation, selectedPulse]);

  // Realtime subscription for game state updates - NOW AFTER startRouletteAnimation
  useEffect(() => {
    if (!appointment?.event_id) return;

    console.log('=== SUSCRIBIÉNDOSE AL ESTADO DEL JUEGO ===');
    
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
          console.log('=== ACTUALIZACIÓN DEL ESTADO DEL JUEGO ===');
          const newEvent = payload.new as any;
          
          // Cuando game_phase se convierte en 'show_result', activar animación
          if (newEvent.game_phase === 'show_result' && !isSpinning) {
            console.log('Iniciando animación de la ruleta');
            startRouletteAnimation();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [appointment?.event_id, isSpinning, startRouletteAnimation]);

  const handleStartRoulette = useCallback(async () => {
    if (!appointment?.event_id || isSpinning || activeParticipants.length === 0) {
      console.warn('No se puede iniciar la ruleta: condiciones no cumplidas');
      console.log('event_id:', appointment?.event_id);
      console.log('isSpinning:', isSpinning);
      console.log('activeParticipants.length:', activeParticipants.length);
      return;
    }

    console.log('=== USUARIO PRESIONÓ GIRAR RULETA ===');
    setIsSpinning(true);
    setLoadingMessage('Iniciando ruleta...');
    
    try {
      // Obtener el evento actual para leer level_queue y current_turn_index
      console.log('Obteniendo estado actual del evento...');
      const { data: eventData, error: fetchError } = await supabase
        .from('events')
        .select('level_queue, current_turn_index, game_phase')
        .eq('id', appointment.event_id)
        .single();

      if (fetchError) {
        console.error('Error al obtener el evento:', fetchError);
        Alert.alert('Error', 'No se pudo obtener el estado del evento.');
        setIsSpinning(false);
        setLoadingMessage('');
        return;
      }

      console.log('Estado actual del evento:', eventData);

      // Permitir iniciar desde 'ready', 'intro', o 'waiting_for_spin'
      const validStartPhases = ['intro', 'ready', 'waiting_for_spin'];
      if (!validStartPhases.includes(eventData.game_phase)) {
        console.warn('El evento no está en una fase válida para iniciar la ruleta:', eventData.game_phase);
        Alert.alert('Error', `La ruleta no puede iniciar en la fase actual: ${eventData.game_phase}`);
        setIsSpinning(false);
        setLoadingMessage('');
        return;
      }

      // Lógica del lado del cliente para seleccionar el siguiente participante
      let levelQueue = eventData.level_queue || [];
      let currentTurnIndex = eventData.current_turn_index || 0;

      // Si level_queue está vacío, inicializarlo con los participantes confirmados
      if (!levelQueue || levelQueue.length === 0) {
        console.log('=== INICIALIZANDO LEVEL_QUEUE ===');
        setLoadingMessage('Preparando participantes...');
        
        // Obtener participantes confirmados
        const { data: participants, error: participantsError } = await supabase
          .from('event_participants')
          .select('user_id')
          .eq('event_id', appointment.event_id)
          .eq('confirmed', true);

        if (participantsError) {
          console.error('Error al obtener participantes confirmados:', participantsError);
          Alert.alert('Error', 'No se pudieron obtener los participantes.');
          setIsSpinning(false);
          setLoadingMessage('');
          return;
        }

        if (!participants || participants.length === 0) {
          console.error('Error: No hay participantes confirmados para inicializar la cola');
          Alert.alert('Error', 'No hay participantes confirmados para la ruleta.');
          setIsSpinning(false);
          setLoadingMessage('');
          return;
        }

        // Extraer los user_ids
        const participantIds = participants.map(p => p.user_id);
        
        // Mezclar los IDs (algoritmo Fisher-Yates)
        for (let i = participantIds.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [participantIds[i], participantIds[j]] = [participantIds[j], participantIds[i]];
        }

        levelQueue = participantIds;
        currentTurnIndex = 0;

        console.log('Cola de participantes inicializada:', levelQueue);

        // Actualizar el evento con la nueva level_queue
        const { error: updateQueueError } = await supabase
          .from('events')
          .update({
            level_queue: levelQueue,
            current_turn_index: currentTurnIndex,
          })
          .eq('id', appointment.event_id);

        if (updateQueueError) {
          console.error('Error al inicializar level_queue:', updateQueueError);
          Alert.alert('Error', 'No se pudo guardar la lista de participantes.');
          setIsSpinning(false);
          setLoadingMessage('');
          return;
        }

        console.log('Level_queue guardada en la base de datos');
      }

      // Verificar que la cola no esté vacía después de la inicialización
      if (levelQueue.length === 0) {
        console.error('Error: La cola de participantes está vacía después del intento de inicialización');
        Alert.alert('Error', 'No hay participantes en la cola para seleccionar.');
        setIsSpinning(false);
        setLoadingMessage('');
        return;
      }

      // Seleccionar el siguiente participante
      const nextParticipantId = levelQueue[currentTurnIndex];
      if (!nextParticipantId) {
        console.error('Error: No se pudo encontrar un participante en el índice actual');
        Alert.alert('Error', 'No se pudo seleccionar un participante.');
        setIsSpinning(false);
        setLoadingMessage('');
        return;
      }

      // Calcular el nuevo índice (loop back al inicio si es necesario)
      const newIndex = (currentTurnIndex + 1) % levelQueue.length;

      console.log('Seleccionando participante:', nextParticipantId);
      console.log('Nuevo índice de turno:', newIndex);

      // Actualización directa de la tabla events
      // NO usar optimistic locking para permitir iniciar desde cualquier fase
      setLoadingMessage('Girando la ruleta...');
      const { error: updateError } = await supabase
        .from('events')
        .update({
          selected_participant_id: nextParticipantId,
          current_turn_index: newIndex,
          game_phase: 'show_result',
        })
        .eq('id', appointment.event_id);

      if (updateError) {
        console.error('Error al actualizar el evento para el giro de la ruleta:', updateError);
        Alert.alert('Error', 'No se pudo actualizar el evento para la ruleta.');
        setIsSpinning(false);
        setLoadingMessage('');
        return;
      }

      console.log('✅ Giro de ruleta iniciado exitosamente mediante actualización directa');
      // La animación se activará mediante la suscripción Realtime
      // No resetear isSpinning aquí, se hará cuando la animación termine
    } catch (error: any) {
      console.error('Error inesperado al iniciar la ruleta:', error);
      Alert.alert('Error', error.message || 'Ocurrió un error al iniciar la ruleta.');
      setIsSpinning(false);
      setLoadingMessage('');
    }
  }, [appointment?.event_id, isSpinning, activeParticipants.length]);

  const wheelRotate = wheelRotation.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '360deg'],
  });

  const glowOpacity = glowAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.8],
  });

  const renderProfessionalWheel = () => {
    const participantCount = activeParticipants.length;
    const degreesPerSegment = 360 / participantCount;

    return (
      <View style={styles.wheelContainer}>
        {/* Premium metallic indicator at top */}
        <View style={styles.indicatorContainer}>
          <View style={styles.indicatorShadow} />
          <LinearGradient
            colors={['#FFD700', '#FFC700', '#FFB700', '#FFA500']}
            style={styles.indicatorGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
          >
            <View style={styles.indicatorInner}>
              <View style={styles.indicatorTriangle} />
            </View>
          </LinearGradient>
          <View style={styles.indicatorHighlight} />
        </View>

        {/* Animated glow during spin */}
        {isSpinning && (
          <Animated.View
            style={[
              styles.wheelGlow,
              {
                opacity: glowOpacity,
              },
            ]}
          />
        )}

        {/* Rotating wheel */}
        <Animated.View
          style={[
            styles.wheel,
            {
              transform: [{ rotate: wheelRotate }],
            },
          ]}
        >
          {/* Segments */}
          {activeParticipants.map((participant, index) => {
            const startAngle = index * degreesPerSegment;
            const segmentColor = SEGMENT_COLORS[index % SEGMENT_COLORS.length];

            return (
              <View
                key={participant.id}
                style={[
                  styles.segment,
                  {
                    transform: [{ rotate: `${startAngle}deg` }],
                  },
                ]}
              >
                <LinearGradient
                  colors={[segmentColor, `${segmentColor}CC`]}
                  style={styles.segmentGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                >
                  {/* Profile photo */}
                  {participant.profile_photo_url ? (
                    <Image
                      source={{ uri: participant.profile_photo_url }}
                      style={styles.participantPhoto}
                    />
                  ) : (
                    <View style={styles.participantPhotoPlaceholder}>
                      <Text style={styles.participantInitial}>
                        {participant.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  
                  {/* Name - dynamic layout based on count */}
                  {participantCount <= 6 && (
                    <Text style={styles.participantName} numberOfLines={1}>
                      {participant.name}
                    </Text>
                  )}
                  {participantCount > 6 && participantCount <= 10 && (
                    <Text style={styles.participantNameSmall} numberOfLines={1}>
                      {participant.name.split(' ')[0]}
                    </Text>
                  )}
                </LinearGradient>
              </View>
            );
          })}

          {/* Center circle with metallic gold ring */}
          <View style={styles.centerCircle}>
            <LinearGradient
              colors={['#FFD700', '#FFA500', '#FFD700']}
              style={styles.centerRing}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.centerInner}>
                <Text style={styles.centerText}>NOSPI</Text>
              </View>
            </LinearGradient>
          </View>
        </Animated.View>
      </View>
    );
  };

  if (gamePhase === 'ready') {
    return (
      <LinearGradient
        colors={['#1a0b2e', '#2d1b4e', '#4a2c6e']}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
          <Text style={styles.titleWhite}>Listos para Comenzar</Text>
          <Text style={styles.subtitleWhite}>Todos los participantes se han presentado</Text>

          <View style={styles.readyCard}>
            <Text style={styles.readyIcon}>✨</Text>
            <Text style={styles.readyTitle}>¡Empecemos!</Text>
            <Text style={styles.readyMessage}>
              Todos están listos. Presiona el botón para girar la ruleta.
            </Text>
          </View>

          {loadingMessage ? (
            <View style={styles.loadingCard}>
              <Text style={styles.loadingText}>{loadingMessage}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.startButton, isSpinning && styles.buttonDisabled]}
            onPress={handleStartRoulette}
            disabled={isSpinning}
            activeOpacity={0.8}
          >
            <Text style={styles.startButtonText}>
              {isSpinning ? '⏳ Iniciando...' : '🎰 Girar Ruleta'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </LinearGradient>
    );
  }

  if (gamePhase === 'waiting_for_spin' || gamePhase === 'show_result') {
    return (
      <LinearGradient
        colors={['#1a0b2e', '#2d1b4e', '#4a2c6e']}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <View style={styles.rouletteContainer}>
          <Text style={styles.rouletteTitleWhite}>Girando la Ruleta</Text>
          <Text style={styles.rouletteSubtitleWhite}>¿Quién será elegido?</Text>

          {renderProfessionalWheel()}

          {/* Replace suspense text with button */}
          {loadingMessage ? (
            <View style={styles.loadingCard}>
              <Text style={styles.loadingText}>{loadingMessage}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.spinButton, isSpinning && styles.buttonDisabled]}
            onPress={handleStartRoulette}
            disabled={isSpinning}
            activeOpacity={0.8}
          >
            <Text style={styles.spinButtonText}>
              {isSpinning ? '⏳ Girando...' : '🎰 Girar Ruleta'}
            </Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  if (gamePhase === 'question' && currentQuestion && selectedParticipant) {
    const participantName = selectedParticipant.name;

    return (
      <LinearGradient
        colors={['#FFFFFF', '#F3E8FF', '#E9D5FF']}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
          <View style={styles.selectedCard}>
            <Text style={styles.selectedLabel}>La ruleta eligió a</Text>
            <Text style={styles.selectedName}>{participantName}</Text>
          </View>

          <View style={styles.questionCard}>
            <Text style={styles.questionIcon}>❓</Text>
            <Text style={styles.questionIntro}>{participantName},</Text>
            <Text style={styles.questionText}>{currentQuestion}</Text>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoText}>
              🔄 Todos los participantes ven la misma pregunta en tiempo real
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
  readyCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  readyIcon: {
    fontSize: 80,
    marginBottom: 16,
  },
  readyTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 16,
  },
  readyMessage: {
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
    lineHeight: 24,
  },
  loadingCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  startButton: {
    backgroundColor: '#FFD700',
    borderRadius: 20,
    padding: 24,
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
  buttonDisabled: {
    opacity: 0.6,
  },
  rouletteContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  rouletteTitleWhite: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  rouletteSubtitleWhite: {
    fontSize: 18,
    color: '#FFFFFF',
    marginBottom: 40,
    opacity: 0.9,
    textAlign: 'center',
  },
  wheelContainer: {
    width: WHEEL_SIZE,
    height: WHEEL_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  wheelGlow: {
    position: 'absolute',
    width: WHEEL_SIZE + 40,
    height: WHEEL_SIZE + 40,
    borderRadius: (WHEEL_SIZE + 40) / 2,
    backgroundColor: '#FFD700',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 30,
  },
  wheel: {
    width: WHEEL_SIZE,
    height: WHEEL_SIZE,
    borderRadius: WHEEL_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 15,
  },
  segment: {
    position: 'absolute',
    width: WHEEL_SIZE,
    height: WHEEL_SIZE / 2,
    top: 0,
    left: 0,
    transformOrigin: 'center bottom',
  },
  segmentGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    paddingTop: 24,
    borderTopLeftRadius: WHEEL_SIZE / 2,
    borderTopRightRadius: WHEEL_SIZE / 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  participantPhoto: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  participantPhotoPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  participantInitial: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4a2c6e',
  },
  participantName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
    paddingHorizontal: 8,
  },
  participantNameSmall: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  centerCircle: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  centerRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 10,
  },
  centerInner: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4a2c6e',
  },
  indicatorContainer: {
    position: 'absolute',
    top: -50,
    left: '50%',
    marginLeft: -25,
    width: 50,
    height: 60,
    zIndex: 10,
    alignItems: 'center',
  },
  indicatorShadow: {
    position: 'absolute',
    top: 8,
    width: 46,
    height: 56,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 8,
    transform: [{ scaleY: 0.5 }],
  },
  indicatorGradient: {
    width: 46,
    height: 56,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 15,
  },
  indicatorInner: {
    width: 40,
    height: 50,
    backgroundColor: '#FFF8DC',
    borderRadius: 6,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 4,
  },
  indicatorTriangle: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderTopWidth: 18,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#FFA500',
  },
  indicatorHighlight: {
    position: 'absolute',
    top: 4,
    left: 8,
    width: 12,
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    borderRadius: 6,
  },
  spinButton: {
    backgroundColor: '#FFD700',
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 48,
    alignItems: 'center',
    marginTop: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  spinButtonText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1a0b2e',
  },
  selectedCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 48,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  selectedLabel: {
    fontSize: 16,
    color: nospiColors.purpleDark,
    marginBottom: 8,
  },
  selectedName: {
    fontSize: 32,
    fontWeight: 'bold',
    color: nospiColors.purpleMid,
  },
  questionCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    marginBottom: 24,
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
  questionIntro: {
    fontSize: 22,
    fontWeight: 'bold',
    color: nospiColors.purpleMid,
    marginBottom: 12,
    textAlign: 'center',
  },
  questionText: {
    fontSize: 20,
    color: nospiColors.purpleDark,
    textAlign: 'center',
    lineHeight: 30,
    fontWeight: '600',
  },
  infoCard: {
    backgroundColor: '#DBEAFE',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  infoText: {
    fontSize: 14,
    color: '#1E40AF',
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: '600',
  },
});
