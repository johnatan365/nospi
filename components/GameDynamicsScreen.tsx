
/**
 * GameDynamicsScreen - Nospi Interactive Game Experience
 * 
 * OPTIMIZED ARCHITECTURE:
 * - Immediate animation start on button press
 * - Reliable transition to question phase
 * - Clean state management
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
  console.log('🎮 Rendering GameDynamicsScreen');
  
  const [gamePhase, setGamePhase] = useState<GamePhase>('waiting_for_spin');
  const [currentLevel] = useState<QuestionLevel>('divertido');
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  
  const wheelRotation = useRef(new Animated.Value(0)).current;
  const glowAnimation = useRef(new Animated.Value(0)).current;
  const selectedPulse = useRef(new Animated.Value(1)).current;
  const transitionTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Animation function
  const startRouletteAnimation = useCallback((targetParticipantId: string) => {
    console.log('🎯 === INICIANDO ANIMACIÓN DE LA RULETA ===');
    console.log('🎯 Participante objetivo:', targetParticipantId);
    
    setIsSpinning(true);
    
    // Find the target participant index
    const targetIndex = activeParticipants.findIndex(p => p.user_id === targetParticipantId);
    console.log('🎯 Índice del participante:', targetIndex);
    
    // Reset animations
    wheelRotation.setValue(0);
    glowAnimation.setValue(0);
    
    // Calculate target rotation
    const degreesPerSegment = 360 / activeParticipants.length;
    const extraSpins = 3; // Reduced from 5 for faster animation
    const targetRotation = (extraSpins * 360) + (targetIndex * degreesPerSegment);
    
    console.log('🎯 Rotación objetivo:', targetRotation, 'grados');
    
    // Start glow animation
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
    
    // Main wheel animation - 3 seconds (reduced from 4.2)
    Animated.timing(wheelRotation, {
      toValue: targetRotation,
      duration: 3000,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      console.log('✅ Animación completada');
      setIsSpinning(false);
      
      // Pulse effect
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
  }, [activeParticipants, wheelRotation, glowAnimation, selectedPulse]);

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
          console.log('📡 Participante seleccionado:', newEvent.selected_participant_id);
          
          // Sync state from database
          if (newEvent.game_phase === 'question') {
            console.log('📝 Sincronizando fase de pregunta');
            setGamePhase('question');
            
            const participant = activeParticipants.find(
              p => p.user_id === newEvent.selected_participant_id
            );
            if (participant) {
              setSelectedParticipant(participant);
            }
            
            if (newEvent.current_question) {
              setCurrentQuestion(newEvent.current_question);
            }
          } else if (newEvent.game_phase === 'show_result') {
            console.log('🎯 Sincronizando fase show_result');
            setGamePhase('show_result');
            
            const participant = activeParticipants.find(
              p => p.user_id === newEvent.selected_participant_id
            );
            if (participant) {
              setSelectedParticipant(participant);
            }
          } else if (newEvent.game_phase === 'waiting_for_spin') {
            console.log('⏳ Sincronizando fase waiting_for_spin');
            setGamePhase('waiting_for_spin');
            setSelectedParticipant(null);
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
  }, [appointment?.event_id, activeParticipants]);

  // Initial sync from database
  useEffect(() => {
    console.log('=== SINCRONIZACIÓN INICIAL ===');
    console.log('Fase del evento:', appointment.event.game_phase);
    
    const dbPhase = appointment.event.game_phase;
    
    if (dbPhase === 'question') {
      console.log('📝 Fase de pregunta detectada');
      
      const participant = activeParticipants.find(
        p => p.user_id === appointment.event.selected_participant_id
      );
      
      if (participant) {
        setSelectedParticipant(participant);
      }
      
      if (appointment.event.current_question) {
        setCurrentQuestion(appointment.event.current_question);
      }
      
      setGamePhase('question');
    } else if (dbPhase === 'show_result') {
      console.log('🎯 Fase show_result detectada');
      
      const participant = activeParticipants.find(
        p => p.user_id === appointment.event.selected_participant_id
      );
      
      if (participant) {
        setSelectedParticipant(participant);
      }
      
      setGamePhase('show_result');
    } else {
      console.log('⏳ Fase waiting_for_spin o inicial');
      setGamePhase('waiting_for_spin');
    }
  }, [appointment.event.game_phase, appointment.event.selected_participant_id, appointment.event.current_question, activeParticipants]);

  // Auto-transition to question after animation completes
  useEffect(() => {
    // Clear any existing timer
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }

    if (gamePhase === 'show_result' && !isSpinning && selectedParticipant) {
      console.log('=== PREPARANDO TRANSICIÓN A PREGUNTA ===');
      console.log('Participante seleccionado:', selectedParticipant.name);
      
      // Wait 1.5 seconds after animation (reduced from 2 seconds)
      transitionTimerRef.current = setTimeout(async () => {
        console.log('🔄 Transicionando a fase de pregunta...');
        
        try {
          // Generate random question
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
          
          const randomQuestion = questions[Math.floor(Math.random() * questions.length)];
          console.log('📝 Pregunta seleccionada:', randomQuestion);
          
          // Update database
          const { error: updateError } = await supabase
            .from('events')
            .update({
              game_phase: 'question',
              current_question: randomQuestion,
              current_question_level: currentLevel,
              updated_at: new Date().toISOString(),
            })
            .eq('id', appointment.event_id);
          
          if (updateError) {
            console.error('❌ Error al actualizar a fase de pregunta:', updateError);
            Alert.alert('Error', 'No se pudo pasar a la pregunta.');
            return;
          }
          
          console.log('✅ Transición a pregunta exitosa');
          
          // Update local state (Realtime will also sync this)
          setCurrentQuestion(randomQuestion);
          setGamePhase('question');
        } catch (error: any) {
          console.error('❌ Error inesperado al transicionar:', error);
          Alert.alert('Error', error.message || 'Ocurrió un error al mostrar la pregunta.');
        }
      }, 1500);
    }

    return () => {
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = null;
      }
    };
  }, [gamePhase, isSpinning, selectedParticipant, appointment.event_id, currentLevel]);

  const handleStartRoulette = useCallback(async () => {
    console.log('🎰 === USUARIO PRESIONÓ GIRAR RULETA ===');
    console.log('🎰 Participantes activos:', activeParticipants.length);
    
    if (!appointment?.event_id || activeParticipants.length === 0) {
      console.warn('⚠️ No se puede iniciar la ruleta');
      Alert.alert('Error', 'No hay participantes para girar la ruleta.');
      return;
    }

    if (isSpinning) {
      console.log('⚠️ Ya está girando');
      return;
    }

    setLoadingMessage('Iniciando ruleta...');
    
    try {
      // Get current event state
      console.log('📊 Obteniendo estado actual del evento...');
      const { data: eventData, error: fetchError } = await supabase
        .from('events')
        .select('level_queue, current_turn_index')
        .eq('id', appointment.event_id)
        .single();

      if (fetchError) {
        console.error('❌ Error al obtener el evento:', fetchError);
        Alert.alert('Error', 'No se pudo obtener el estado del evento.');
        setLoadingMessage('');
        return;
      }

      console.log('✅ Estado actual del evento:', eventData);

      let levelQueue = eventData.level_queue || [];
      let currentTurnIndex = eventData.current_turn_index || 0;

      // Initialize level_queue if empty
      if (!levelQueue || levelQueue.length === 0) {
        console.log('🔄 === INICIALIZANDO LEVEL_QUEUE ===');
        setLoadingMessage('Preparando participantes...');
        
        const { data: participants, error: participantsError } = await supabase
          .from('event_participants')
          .select('user_id')
          .eq('event_id', appointment.event_id)
          .eq('confirmed', true);

        if (participantsError || !participants || participants.length === 0) {
          console.error('❌ Error al obtener participantes');
          Alert.alert('Error', 'No hay participantes confirmados.');
          setLoadingMessage('');
          return;
        }

        const participantIds = participants.map(p => p.user_id);
        
        // Shuffle (Fisher-Yates)
        for (let i = participantIds.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [participantIds[i], participantIds[j]] = [participantIds[j], participantIds[i]];
        }

        levelQueue = participantIds;
        currentTurnIndex = 0;

        console.log('✅ Cola inicializada:', levelQueue);

        const { error: updateQueueError } = await supabase
          .from('events')
          .update({
            level_queue: levelQueue,
            current_turn_index: currentTurnIndex,
            updated_at: new Date().toISOString(),
          })
          .eq('id', appointment.event_id);

        if (updateQueueError) {
          console.error('❌ Error al inicializar level_queue:', updateQueueError);
          Alert.alert('Error', 'No se pudo guardar la lista de participantes.');
          setLoadingMessage('');
          return;
        }
      }

      if (levelQueue.length === 0) {
        console.error('❌ Cola vacía');
        Alert.alert('Error', 'No hay participantes en la cola.');
        setLoadingMessage('');
        return;
      }

      // Select next participant
      const nextParticipantId = levelQueue[currentTurnIndex];
      const newIndex = (currentTurnIndex + 1) % levelQueue.length;

      console.log('✅ Seleccionando participante:', nextParticipantId);
      console.log('✅ Nuevo índice:', newIndex);

      // Find participant object
      const selectedPart = activeParticipants.find(p => p.user_id === nextParticipantId);
      if (selectedPart) {
        setSelectedParticipant(selectedPart);
      }

      // START ANIMATION IMMEDIATELY (before database update)
      console.log('🚀 Iniciando animación INMEDIATAMENTE');
      setGamePhase('show_result');
      startRouletteAnimation(nextParticipantId);
      setLoadingMessage('');

      // Update database in background
      console.log('📤 Actualizando base de datos...');
      const { error: updateError } = await supabase
        .from('events')
        .update({
          selected_participant_id: nextParticipantId,
          current_turn_index: newIndex,
          game_phase: 'show_result',
          updated_at: new Date().toISOString(),
        })
        .eq('id', appointment.event_id);

      if (updateError) {
        console.error('❌ Error al actualizar evento:', updateError);
        // Animation already started, so just log the error
      } else {
        console.log('✅ Base de datos actualizada');
      }
    } catch (error: any) {
      console.error('❌ Error inesperado:', error);
      Alert.alert('Error', error.message || 'Ocurrió un error al iniciar la ruleta.');
      setLoadingMessage('');
    }
  }, [appointment?.event_id, isSpinning, activeParticipants, startRouletteAnimation]);

  const handleContinueGame = useCallback(async () => {
    console.log('🎮 === CONTINUANDO EL JUEGO ===');
    
    if (!appointment?.event_id) {
      console.error('❌ No hay event_id');
      return;
    }

    try {
      const { error } = await supabase
        .from('events')
        .update({
          game_phase: 'waiting_for_spin',
          current_question: null,
          current_question_level: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', appointment.event_id);

      if (error) {
        console.error('❌ Error al continuar:', error);
        Alert.alert('Error', 'No se pudo continuar el juego.');
        return;
      }

      console.log('✅ Juego continuado');
      setGamePhase('waiting_for_spin');
      setCurrentQuestion(null);
      setSelectedParticipant(null);
    } catch (error: any) {
      console.error('❌ Error inesperado:', error);
      Alert.alert('Error', error.message || 'Ocurrió un error.');
    }
  }, [appointment?.event_id]);

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
        {/* Pointer */}
        <View style={styles.indicatorContainer}>
          <View style={styles.indicatorShadow} />
          <View style={styles.triangleContainer}>
            <View style={styles.triangleGradient} />
            <View style={styles.triangleHighlight} />
          </View>
        </View>

        {/* Glow during spin */}
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

          {/* Center circle */}
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
    const firstName = participantName.split(' ')[0];

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
            {selectedParticipant.profile_photo_url ? (
              <Image
                source={{ uri: selectedParticipant.profile_photo_url }}
                style={styles.selectedPhoto}
              />
            ) : (
              <View style={styles.selectedPhotoPlaceholder}>
                <Text style={styles.selectedPhotoInitial}>
                  {firstName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.questionCard}>
            <Text style={styles.questionIcon}>❓</Text>
            <View style={styles.questionTextContainer}>
              <Text style={styles.questionIntro}>{firstName}</Text>
              <Text style={styles.questionComma}>, </Text>
              <Text style={styles.questionText}>{currentQuestion}</Text>
            </View>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoText}>
              🔄 Todos los participantes ven la misma pregunta en tiempo real
            </Text>
          </View>

          <TouchableOpacity
            style={styles.continueButton}
            onPress={handleContinueGame}
            activeOpacity={0.8}
          >
            <Text style={styles.continueButtonText}>Continuar con el juego</Text>
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
    top: -18,
    left: '50%',
    marginLeft: -22,
    width: 44,
    height: 70,
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicatorShadow: {
    position: 'absolute',
    top: 10,
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 22,
    borderRightWidth: 22,
    borderTopWidth: 55,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: 'rgba(0, 0, 0, 0.4)',
  },
  triangleContainer: {
    width: 44,
    height: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  triangleGradient: {
    position: 'absolute',
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 22,
    borderRightWidth: 22,
    borderTopWidth: 55,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#FFD700',
  },
  triangleHighlight: {
    position: 'absolute',
    top: 6,
    left: 10,
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 18,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: 'rgba(255, 255, 255, 0.75)',
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
    marginBottom: 16,
  },
  selectedPhoto: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    borderColor: nospiColors.purpleMid,
    marginTop: 8,
  },
  selectedPhotoPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: nospiColors.purpleLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: nospiColors.purpleMid,
    marginTop: 8,
  },
  selectedPhotoInitial: {
    fontSize: 48,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
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
  questionTextContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
  },
  questionIntro: {
    fontSize: 24,
    fontWeight: 'bold',
    color: nospiColors.purpleMid,
    textAlign: 'center',
  },
  questionComma: {
    fontSize: 24,
    fontWeight: 'bold',
    color: nospiColors.purpleMid,
  },
  questionText: {
    fontSize: 24,
    color: nospiColors.purpleDark,
    textAlign: 'center',
    fontWeight: '600',
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
  continueButton: {
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
  continueButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});
