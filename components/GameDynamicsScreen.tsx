
/**
 * GameDynamicsScreen - Nospi Interactive Game Experience
 * 
 * REAL-TIME SYNCHRONIZED GAME:
 * - Backend controls participant selection and question generation
 * - All clients receive the same round data via Realtime
 * - No local question generation - everything is server-driven
 * - Single source of truth: events table in Supabase
 * - Game state persists across tab changes and page reloads
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Animated, Easing, Image, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';

type QuestionLevel = 'divertido' | 'sensual' | 'atrevido';
type GamePhase = 'ready' | 'roulette' | 'question' | 'rating' | 'level_vote' | 'game_end' | 'extension' | 'secret_match' | 'final_animation' | 'post_event';

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
  arrival_status: string;
  checked_in_at: string | null;
  location_confirmed: boolean;
  experience_started: boolean;
  presented: boolean;
  event: {
    id: string;
    type: string;
    date: string;
    time: string;
    location: string;
    game_phase?: string;
    selected_participant_id?: string;
    selected_participant_name?: string;
    current_question?: string;
    current_question_level?: string;
  };
}

interface Question {
  id: string;
  text: string;
  level: QuestionLevel;
}

interface GameDynamicsScreenProps {
  appointment: Appointment;
  activeParticipants: Participant[];
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const WHEEL_SIZE = Math.min(SCREEN_WIDTH - 48, 360);

// Vibrant colors for wheel segments (TV-style)
const SEGMENT_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
  '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#52B788',
  '#FF8FAB', '#6C5CE7', '#00B894', '#FDCB6E', '#E17055',
];

export default function GameDynamicsScreen({ appointment, activeParticipants }: GameDynamicsScreenProps) {
  const [gamePhase, setGamePhase] = useState<GamePhase>('ready');
  const [currentLevel, setCurrentLevel] = useState<QuestionLevel>('divertido');
  const [currentRound, setCurrentRound] = useState(0);
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [questionsAnsweredInLevel, setQuestionsAnsweredInLevel] = useState(0);
  const [totalQuestionsPerParticipant] = useState(3);
  const [showRoulette, setShowRoulette] = useState(false);
  const wheelRotation = useRef(new Animated.Value(0)).current;
  const [userRating, setUserRating] = useState<number | null>(null);
  const [hasRated, setHasRated] = useState(false);
  const [userVote, setUserVote] = useState<'keep' | 'up' | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [extensionCount, setExtensionCount] = useState(0);
  const [showExtensionVote, setShowExtensionVote] = useState(false);
  const [extensionVoteChoice, setExtensionVoteChoice] = useState<'free' | 'more' | null>(null);
  const [isStartingRound, setIsStartingRound] = useState(false);

  const levelNames = {
    divertido: 'Divertido',
    sensual: 'Sensual',
    atrevido: 'Atrevido',
  };

  const levelColors = {
    divertido: '#10B981',
    sensual: '#F59E0B',
    atrevido: '#EF4444',
  };

  // CRITICAL: Reconstruct game state from database on mount
  useEffect(() => {
    console.log('=== RECONSTRUCTING GAME STATE FROM DATABASE ===');
    console.log('Event game_phase:', appointment.event.game_phase);
    console.log('Selected participant:', appointment.event.selected_participant_name);
    console.log('Current question:', appointment.event.current_question);
    console.log('Question level:', appointment.event.current_question_level);

    // Reconstruct game state from database
    if (appointment.event.game_phase === 'question' && appointment.event.current_question) {
      console.log('Reconstructing question phase from database');
      
      // Find the selected participant
      const participant = activeParticipants.find(
        p => p.user_id === appointment.event.selected_participant_id
      );

      if (participant) {
        setSelectedParticipant(participant);
      } else if (appointment.event.selected_participant_name) {
        // Fallback: create minimal participant object
        setSelectedParticipant({
          id: appointment.event.selected_participant_id || '',
          user_id: appointment.event.selected_participant_id || '',
          name: appointment.event.selected_participant_name,
          profile_photo_url: null,
          occupation: 'Participante',
          confirmed: true,
          check_in_time: null,
          presented: true,
        });
      }

      setCurrentQuestion({
        id: `${appointment.event.current_question_level}-${Date.now()}`,
        text: appointment.event.current_question,
        level: (appointment.event.current_question_level as QuestionLevel) || 'divertido',
      });

      setCurrentLevel((appointment.event.current_question_level as QuestionLevel) || 'divertido');
      setGamePhase('question');
      setShowRoulette(false);
    } else if (appointment.event.game_phase === 'roulette') {
      console.log('Reconstructing roulette phase from database');
      setGamePhase('roulette');
      setShowRoulette(true);
    } else {
      console.log('Game in ready state');
      setGamePhase('ready');
    }
  }, [appointment.event.game_phase, appointment.event.current_question, activeParticipants]);

  // Subscribe to real-time updates on the events table
  useEffect(() => {
    if (!appointment?.event_id) return;

    console.log('=== SUBSCRIBING TO GAME STATE UPDATES ===');
    console.log('Event ID:', appointment.event_id);

    const channel = supabase
      .channel(`game_state_${appointment.event_id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'events',
          filter: `id=eq.${appointment.event_id}`,
        },
        (payload) => {
          console.log('=== GAME STATE UPDATE RECEIVED ===');
          console.log('Payload:', JSON.stringify(payload, null, 2));

          const newEvent = payload.new as any;

          // Update game phase
          if (newEvent.game_phase) {
            console.log('Game phase updated to:', newEvent.game_phase);
            
            if (newEvent.game_phase === 'question') {
              // Server has selected participant and question
              console.log('New round started by server');
              console.log('Selected participant:', newEvent.selected_participant_name);
              console.log('Question:', newEvent.current_question);
              console.log('Level:', newEvent.current_question_level);

              // Find the selected participant in our list
              const participant = activeParticipants.find(
                p => p.user_id === newEvent.selected_participant_id
              );

              if (participant) {
                setSelectedParticipant(participant);
              } else {
                // Fallback: create a minimal participant object
                setSelectedParticipant({
                  id: newEvent.selected_participant_id || '',
                  user_id: newEvent.selected_participant_id || '',
                  name: newEvent.selected_participant_name || 'Participante',
                  profile_photo_url: null,
                  occupation: 'Participante',
                  confirmed: true,
                  check_in_time: null,
                  presented: true,
                });
              }

              setCurrentQuestion({
                id: `${newEvent.current_question_level}-${Date.now()}`,
                text: newEvent.current_question || '',
                level: newEvent.current_question_level || 'divertido',
              });

              setCurrentLevel(newEvent.current_question_level || 'divertido');
              
              // Hide roulette and show question
              setShowRoulette(false);
              setGamePhase('question');
              setHasRated(false);
              setUserRating(null);
            } else if (newEvent.game_phase === 'roulette') {
              console.log('Roulette phase activated by server');
              setGamePhase('roulette');
              setShowRoulette(true);
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('Game state subscription status:', status);
        
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to game state updates');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Game state subscription error');
        }
      });

    return () => {
      console.log('Cleaning up game state subscription');
      supabase.removeChannel(channel);
    };
  }, [appointment?.event_id, activeParticipants]);

  const startGame = async () => {
    console.log('=== USER CLICKED INICIAR DINÁMICA ===');
    console.log('Starting game - Round 1');
    console.log('Current participants:', activeParticipants.length);
    
    // CRITICAL FIX: Set ALL game state IMMEDIATELY to prevent unmounting
    console.log('Setting gamePhase to roulette and showRoulette to true IMMEDIATELY');
    setCurrentRound(1);
    setGamePhase('roulette');
    setShowRoulette(true);
    
    // Start roulette animation immediately (no delay needed)
    console.log('Starting roulette animation');
    startRoulette();
  };

  const handleReadyToStart = () => {
    console.log('User clicked Ya estoy listo');
    setGamePhase('ready');
  };

  const startRoulette = async () => {
    if (isStartingRound) {
      console.log('Round already starting, skipping duplicate call');
      return;
    }

    if (!appointment?.event_id) {
      console.error('No event ID available');
      return;
    }

    if (activeParticipants.length < 2) {
      console.error('Not enough participants to start roulette');
      return;
    }

    setIsStartingRound(true);
    console.log('=== STARTING ROULETTE ===');
    console.log('Event ID:', appointment.event_id);
    console.log('Active participants:', activeParticipants.length);
    console.log('Current level:', currentLevel);
    
    // CRITICAL: Ensure roulette is visible and game phase is set
    console.log('Setting showRoulette=true and gamePhase=roulette');
    setShowRoulette(true);
    setGamePhase('roulette');
    setHasRated(false);
    setUserRating(null);
    
    // Calculate target participant index
    const targetIndex = Math.floor(Math.random() * activeParticipants.length);
    const degreesPerSegment = 360 / activeParticipants.length;
    
    // Calculate rotation: multiple full spins + target position
    // We want the arrow (pointing up) to land on the target segment
    const extraSpins = 5 + Math.floor(Math.random() * 3); // 5-7 full spins
    const targetRotation = (extraSpins * 360) + (targetIndex * degreesPerSegment);
    
    // Reset wheel rotation
    wheelRotation.setValue(0);
    
    // Start TV-style animation: fast start, slow suspenseful stop
    Animated.timing(wheelRotation, {
      toValue: targetRotation,
      duration: 6000, // 6 seconds for dramatic effect
      easing: Easing.out(Easing.cubic), // Starts fast, slows down dramatically
      useNativeDriver: true,
    }).start(({ finished }) => {
      console.log('Roulette animation finished:', finished);
      // Animation completed - the Realtime subscription will handle the UI update
    });

    try {
      // Call Edge Function to select participant and question
      console.log('Calling Edge Function to start round');
      console.log('Event ID:', appointment.event_id);
      console.log('Current Level:', currentLevel);

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        console.error('No access token available');
        setIsStartingRound(false);
        return;
      }

      const response = await fetch(
        `${supabase.supabaseUrl}/functions/v1/start-game-round`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            eventId: appointment.event_id,
            currentLevel: currentLevel,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Edge Function error:', errorData);
        setIsStartingRound(false);
        return;
      }

      const result = await response.json();
      console.log('Edge Function response:', result);
      console.log('Selected participant:', result.selectedParticipantName);
      console.log('Question:', result.question);

      // The Realtime subscription will handle updating the UI
      // We just need to wait for the animation to finish
      setTimeout(() => {
        setIsStartingRound(false);
      }, 6000);

    } catch (error) {
      console.error('Error starting round:', error);
      setIsStartingRound(false);
    }
  };

  const handleAnswer = () => {
    console.log('Participant answered question');
    setGamePhase('rating');
  };

  const handlePass = () => {
    console.log('Participant passed on question');
    nextTurn();
  };

  const handleRating = (rating: number) => {
    console.log('User rated:', rating);
    setUserRating(rating);
    setHasRated(true);
  };

  const submitRating = () => {
    if (!hasRated) return;
    console.log('Rating submitted, moving to next turn');
    
    setQuestionsAnsweredInLevel(questionsAnsweredInLevel + 1);
    
    const totalQuestionsInRound = activeParticipants.length * totalQuestionsPerParticipant;
    
    if (questionsAnsweredInLevel + 1 >= totalQuestionsInRound) {
      console.log('Round complete, checking for level vote');
      setGamePhase('level_vote');
    } else {
      nextTurn();
    }
  };

  const nextTurn = () => {
    console.log('Moving to next turn');
    setGamePhase('roulette');
    startRoulette();
  };

  const handleLevelVote = (vote: 'keep' | 'up') => {
    console.log('User voted:', vote);
    setUserVote(vote);
    setHasVoted(true);
  };

  const submitLevelVote = () => {
    if (!hasVoted) return;
    console.log('Level vote submitted');
    
    // Simulate vote results (in production, this would be a backend call)
    const simulatedUpVotes = Math.floor(Math.random() * activeParticipants.length);
    const majority = simulatedUpVotes > activeParticipants.length / 2;
    
    if (majority) {
      if (currentLevel === 'divertido') {
        console.log('Level up: Divertido → Sensual');
        setCurrentLevel('sensual');
      } else if (currentLevel === 'sensual') {
        console.log('Level up: Sensual → Atrevido');
        setCurrentLevel('atrevido');
      }
    }
    
    setQuestionsAnsweredInLevel(0);
    setHasVoted(false);
    setUserVote(null);
    setGamePhase('roulette');
    startRoulette();
  };

  const endGame = () => {
    console.log('Game ending - showing extension vote');
    setGamePhase('game_end');
    setShowExtensionVote(true);
  };

  const handleExtensionVote = (choice: 'free' | 'more') => {
    console.log('Extension vote:', choice);
    setExtensionVoteChoice(choice);
  };

  const submitExtensionVote = () => {
    if (!extensionVoteChoice) return;
    console.log('Extension vote submitted');
    
    const simulatedMoreVotes = Math.floor(Math.random() * activeParticipants.length);
    const wantMore = simulatedMoreVotes > activeParticipants.length / 2;
    
    if (wantMore && extensionCount < 3) {
      console.log('Group voted for one more round');
      setExtensionCount(extensionCount + 1);
      setShowExtensionVote(false);
      setExtensionVoteChoice(null);
      setQuestionsAnsweredInLevel(0);
      setGamePhase('roulette');
      startRoulette();
    } else {
      console.log('Game truly ended');
      setGamePhase('extension');
    }
  };

  const wheelRotate = wheelRotation.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '360deg'],
  });

  const renderTVStyleWheel = () => {
    const participantCount = activeParticipants.length;
    const degreesPerSegment = 360 / participantCount;

    return (
      <View style={styles.tvWheelContainer}>
        {/* Fixed arrow pointing down (at top of wheel) */}
        <View style={styles.fixedArrowContainer}>
          <View style={styles.arrowTriangle} />
        </View>

        {/* Animated Wheel */}
        <Animated.View
          style={[
            styles.tvWheel,
            {
              transform: [{ rotate: wheelRotate }],
            },
          ]}
        >
          {/* Render colored segments */}
          {activeParticipants.map((participant, index) => {
            const startAngle = index * degreesPerSegment;
            const segmentColor = SEGMENT_COLORS[index % SEGMENT_COLORS.length];

            return (
              <View
                key={participant.id}
                style={[
                  styles.wheelSegment,
                  {
                    transform: [
                      { rotate: `${startAngle}deg` },
                    ],
                  },
                ]}
              >
                <View style={[styles.segmentInner, { backgroundColor: segmentColor }]}>
                  {/* Participant photo */}
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
                  
                  {/* Participant name - LARGER SIZE */}
                  <Text style={styles.segmentName} numberOfLines={2}>
                    {participant.name}
                  </Text>
                </View>
              </View>
            );
          })}

          {/* Center circle */}
          <View style={styles.centerCircle}>
            <Text style={styles.centerText}>NOSPI</Text>
          </View>
        </Animated.View>
      </View>
    );
  };

  // CRITICAL FIX: Always render based on current gamePhase state, not conditional logic
  // This prevents the component from unmounting during state transitions
  
  console.log('=== RENDERING GAME DYNAMICS SCREEN ===');
  console.log('Current gamePhase:', gamePhase);
  console.log('showRoulette:', showRoulette);
  console.log('Active participants:', activeParticipants.length);
  console.log('Selected participant:', selectedParticipant?.name);
  console.log('Current question:', currentQuestion?.text);
  
  if (gamePhase === 'ready') {
    const confirmedParticipants = activeParticipants.filter(p => p.confirmed);
    const allReady = confirmedParticipants.length === activeParticipants.length && activeParticipants.length >= 2;

    return (
      <LinearGradient
        colors={[nospiColors.purpleDark, nospiColors.purpleMid, nospiColors.purpleLight]}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
          <Text style={styles.titleWhite}>¡Listos para comenzar!</Text>
          <Text style={styles.subtitleWhite}>Todos se han presentado</Text>

          <View style={styles.successCard}>
            <Text style={styles.successIcon}>🎉</Text>
            <Text style={styles.successTitle}>¡Excelente!</Text>
            <Text style={styles.successMessage}>
              Todos los participantes activos se han presentado. La dinámica del juego está lista para comenzar.
            </Text>
          </View>

          <View style={styles.participantsReadyCard}>
            <Text style={styles.participantsReadyTitle}>Participantes confirmados</Text>
            <View style={styles.participantsReadyList}>
              {activeParticipants.map((participant, index) => {
                const displayName = participant.name;
                const isReady = participant.confirmed;
                
                return (
                  <View key={index} style={styles.participantReadyItem}>
                    {participant.profile_photo_url ? (
                      <Image
                        source={{ uri: participant.profile_photo_url }}
                        style={styles.participantReadyPhoto}
                      />
                    ) : (
                      <View style={styles.participantReadyPhotoPlaceholder}>
                        <Text style={styles.participantReadyPhotoText}>
                          {displayName.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.participantReadyName}>{displayName}</Text>
                    {isReady && (
                      <View style={styles.readyBadge}>
                        <Text style={styles.readyBadgeText}>✓ Listo</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </View>

          <View style={styles.levelCard}>
            <Text style={styles.levelTitle}>Nivel Inicial</Text>
            <View style={[styles.levelBadge, { backgroundColor: levelColors.divertido }]}>
              <Text style={styles.levelBadgeText}>{levelNames.divertido}</Text>
            </View>
          </View>

          {allReady ? (
            <TouchableOpacity
              style={styles.startGameButton}
              onPress={startGame}
              activeOpacity={0.8}
            >
              <Text style={styles.startGameButtonText}>🎮 Iniciar Dinámica</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.waitingForAllCard}>
              <Text style={styles.waitingForAllText}>
                Esperando a que todos confirmen que están listos...
              </Text>
            </View>
          )}
        </ScrollView>
      </LinearGradient>
    );
  }

  // CRITICAL: Render roulette when gamePhase is 'roulette' OR showRoulette is true
  if (gamePhase === 'roulette' || showRoulette) {
    return (
      <LinearGradient
        colors={[nospiColors.purpleDark, nospiColors.purpleMid, nospiColors.purpleLight]}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <View style={styles.rouletteContainer}>
          <Text style={styles.rouletteTitleWhite}>🎰 Ronda {currentRound}</Text>
          <Text style={styles.rouletteSubtitleWhite}>¡Girando la ruleta!</Text>

          {renderTVStyleWheel()}

          <View style={styles.suspenseCard}>
            <Text style={styles.suspenseText}>✨ Generando suspenso... ✨</Text>
          </View>
        </View>
      </LinearGradient>
    );
  }

  if (gamePhase === 'question' && currentQuestion && selectedParticipant) {
    const levelColor = levelColors[currentLevel];
    const levelName = levelNames[currentLevel];
    const participantName = selectedParticipant.name;
    const questionText = currentQuestion.text;

    return (
      <LinearGradient
        colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
          <View style={[styles.levelBadge, { backgroundColor: levelColor, alignSelf: 'center' }]}>
            <Text style={styles.levelBadgeText}>{levelName}</Text>
          </View>

          <View style={styles.selectedParticipantCard}>
            <Text style={styles.selectedParticipantLabel}>La ruleta eligió a</Text>
            <Text style={styles.selectedParticipantName}>{participantName}</Text>
          </View>

          <View style={styles.questionCard}>
            <Text style={styles.questionIcon}>❓</Text>
            <Text style={styles.questionIntro}>{participantName},</Text>
            <Text style={styles.questionText}>{questionText}</Text>
          </View>

          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.answerButton}
              onPress={handleAnswer}
              activeOpacity={0.8}
            >
              <Text style={styles.answerButtonText}>Responder</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.passButton}
              onPress={handlePass}
              activeOpacity={0.8}
            >
              <Text style={styles.passButtonText}>Pasar</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.passInfoCard}>
            <Text style={styles.passInfoText}>
              💡 Si pasas, no recibirás puntos y debes tomar un trago (regla social)
            </Text>
          </View>

          <View style={styles.syncInfoCard}>
            <Text style={styles.syncInfoText}>
              🔄 Todos los participantes ven la misma pregunta en tiempo real
            </Text>
          </View>
        </ScrollView>
      </LinearGradient>
    );
  }

  if (gamePhase === 'rating' && selectedParticipant) {
    const participantName = selectedParticipant.name;

    return (
      <LinearGradient
        colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
          <Text style={styles.title}>Momento de votar</Text>
          <Text style={styles.subtitle}>Califica la respuesta de {participantName}</Text>

          <View style={styles.ratingCard}>
            <Text style={styles.ratingTitle}>Tu calificación (secreta)</Text>
            <View style={styles.ratingButtons}>
              {[1, 2, 3, 4, 5].map((rating) => (
                <TouchableOpacity
                  key={rating}
                  style={[
                    styles.ratingButton,
                    userRating === rating && styles.ratingButtonSelected,
                  ]}
                  onPress={() => handleRating(rating)}
                  activeOpacity={0.8}
                >
                  <Text style={[
                    styles.ratingButtonText,
                    userRating === rating && styles.ratingButtonTextSelected,
                  ]}>
                    {rating}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.ratingInfoCard}>
            <Text style={styles.ratingInfoText}>
              🔒 Tu calificación es secreta. La puntuación nunca se muestra en tiempo real.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.submitButton, !hasRated && styles.buttonDisabled]}
            onPress={submitRating}
            disabled={!hasRated}
            activeOpacity={0.8}
          >
            <Text style={styles.submitButtonText}>Enviar Calificación</Text>
          </TouchableOpacity>
        </ScrollView>
      </LinearGradient>
    );
  }

  if (gamePhase === 'level_vote') {
    const nextLevel = currentLevel === 'divertido' ? 'sensual' : 'atrevido';
    const nextLevelName = levelNames[nextLevel];
    const canLevelUp = currentLevel !== 'atrevido';

    return (
      <LinearGradient
        colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
          <Text style={styles.title}>Votación de Nivel</Text>
          <Text style={styles.subtitle}>¿Quieren subir el nivel?</Text>

          <View style={styles.currentLevelCard}>
            <Text style={styles.currentLevelLabel}>Nivel Actual</Text>
            <View style={[styles.levelBadge, { backgroundColor: levelColors[currentLevel] }]}>
              <Text style={styles.levelBadgeText}>{levelNames[currentLevel]}</Text>
            </View>
          </View>

          {canLevelUp && (
            <View style={styles.nextLevelCard}>
              <Text style={styles.nextLevelLabel}>Siguiente Nivel</Text>
              <View style={[styles.levelBadge, { backgroundColor: levelColors[nextLevel] }]}>
                <Text style={styles.levelBadgeText}>{nextLevelName}</Text>
              </View>
            </View>
          )}

          <View style={styles.voteButtons}>
            <TouchableOpacity
              style={[
                styles.voteButton,
                styles.voteButtonKeep,
                userVote === 'keep' && styles.voteButtonSelected,
              ]}
              onPress={() => handleLevelVote('keep')}
              activeOpacity={0.8}
            >
              <Text style={styles.voteButtonText}>Mantener Nivel</Text>
            </TouchableOpacity>

            {canLevelUp && (
              <TouchableOpacity
                style={[
                  styles.voteButton,
                  styles.voteButtonUp,
                  userVote === 'up' && styles.voteButtonSelected,
                ]}
                onPress={() => handleLevelVote('up')}
                activeOpacity={0.8}
              >
                <Text style={styles.voteButtonText}>Subir Nivel</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.voteInfoCard}>
            <Text style={styles.voteInfoText}>
              🗳️ La votación es secreta. Si la mayoría simple vota subir, el nivel aumentará.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.submitButton, !hasVoted && styles.buttonDisabled]}
            onPress={submitLevelVote}
            disabled={!hasVoted}
            activeOpacity={0.8}
          >
            <Text style={styles.submitButtonText}>Enviar Voto</Text>
          </TouchableOpacity>
        </ScrollView>
      </LinearGradient>
    );
  }

  if (gamePhase === 'game_end' && showExtensionVote) {
    return (
      <LinearGradient
        colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
          <Text style={styles.title}>Dinámica Completada</Text>
          <Text style={styles.subtitle}>La dinámica Nospi para romper el hielo ha terminado</Text>

          <View style={styles.endCard}>
            <Text style={styles.endIcon}>🎉</Text>
            <Text style={styles.endTitle}>¡Felicidades!</Text>
            <Text style={styles.endMessage}>
              Han completado la dinámica oficial. ¿Qué quieren hacer ahora?
            </Text>
          </View>

          <View style={styles.extensionButtons}>
            <TouchableOpacity
              style={[
                styles.extensionButton,
                styles.extensionButtonFree,
                extensionVoteChoice === 'free' && styles.extensionButtonSelected,
              ]}
              onPress={() => handleExtensionVote('free')}
              activeOpacity={0.8}
            >
              <Text style={styles.extensionButtonText}>💬 Conversación Libre</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.extensionButton,
                styles.extensionButtonMore,
                extensionVoteChoice === 'more' && styles.extensionButtonSelected,
              ]}
              onPress={() => handleExtensionVote('more')}
              activeOpacity={0.8}
            >
              <Text style={styles.extensionButtonText}>🎮 Una Ronda Más</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.submitButton, !extensionVoteChoice && styles.buttonDisabled]}
            onPress={submitExtensionVote}
            disabled={!extensionVoteChoice}
            activeOpacity={0.8}
          >
            <Text style={styles.submitButtonText}>Enviar Decisión</Text>
          </TouchableOpacity>
        </ScrollView>
      </LinearGradient>
    );
  }

  if (gamePhase === 'extension') {
    const didExtend = extensionCount > 0;

    return (
      <LinearGradient
        colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
          <Text style={styles.title}>¡Experiencia Finalizada!</Text>
          <Text style={styles.subtitle}>Gracias por participar</Text>

          <View style={styles.finalCard}>
            <Text style={styles.finalIcon}>🎊</Text>
            <Text style={styles.finalTitle}>¡Hasta pronto!</Text>
            <Text style={styles.finalMessage}>
              La experiencia Nospi ha terminado. Esperamos que hayas disfrutado y hecho conexiones reales.
            </Text>
          </View>

          {didExtend && (
            <View style={styles.prizeCard}>
              <Text style={styles.prizeIcon}>🏆</Text>
              <Text style={styles.prizeTitle}>¡Premio Desbloqueado!</Text>
              <Text style={styles.prizeMessage}>
                El grupo decidió extender la experiencia. El premio fue entregado al ganador.
              </Text>
            </View>
          )}

          <View style={styles.statsCard}>
            <Text style={styles.statsTitle}>Estadísticas</Text>
            <Text style={styles.statsText}>Rondas jugadas: {currentRound}</Text>
            <Text style={styles.statsText}>Extensiones: {extensionCount}</Text>
            <Text style={styles.statsText}>Nivel alcanzado: {levelNames[currentLevel]}</Text>
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
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 8,
    marginTop: 48,
  },
  titleWhite: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    marginTop: 48,
  },
  subtitle: {
    fontSize: 16,
    color: nospiColors.purpleDark,
    opacity: 0.8,
    marginBottom: 24,
  },
  subtitleWhite: {
    fontSize: 16,
    color: '#FFFFFF',
    opacity: 0.9,
    marginBottom: 24,
  },
  successCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  successIcon: {
    fontSize: 80,
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 16,
  },
  successMessage: {
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
    lineHeight: 24,
  },
  levelCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  levelTitle: {
    fontSize: 16,
    color: nospiColors.purpleDark,
    marginBottom: 12,
    fontWeight: '600',
  },
  levelBadge: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 20,
  },
  levelBadgeText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  startGameButton: {
    backgroundColor: nospiColors.purpleDark,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  startGameButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  rouletteContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  rouletteTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  rouletteTitleWhite: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  rouletteSubtitle: {
    fontSize: 18,
    color: '#FFFFFF',
    marginBottom: 40,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  rouletteSubtitleWhite: {
    fontSize: 18,
    color: '#FFFFFF',
    marginBottom: 40,
    opacity: 0.9,
  },
  tvWheelContainer: {
    width: WHEEL_SIZE,
    height: WHEEL_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  tvWheel: {
    width: WHEEL_SIZE,
    height: WHEEL_SIZE,
    borderRadius: WHEEL_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  wheelSegment: {
    position: 'absolute',
    width: WHEEL_SIZE,
    height: WHEEL_SIZE / 2,
    top: 0,
    left: 0,
    transformOrigin: 'center bottom',
  },
  segmentInner: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    paddingTop: 20,
    borderTopLeftRadius: WHEEL_SIZE / 2,
    borderTopRightRadius: WHEEL_SIZE / 2,
  },
  participantPhoto: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    marginBottom: 8,
  },
  participantPhotoPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    marginBottom: 8,
  },
  participantInitial: {
    fontSize: 24,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
  },
  segmentName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
    paddingHorizontal: 8,
    lineHeight: 20,
  },
  centerCircle: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 4,
    borderColor: '#FFD700',
  },
  centerText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
  },
  fixedArrowContainer: {
    position: 'absolute',
    top: -30,
    left: '50%',
    marginLeft: -25,
    width: 50,
    height: 50,
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowTriangle: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 25,
    borderRightWidth: 25,
    borderTopWidth: 45,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#FFD700',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 10,
  },
  suspenseCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 16,
    padding: 20,
    marginTop: 20,
  },
  suspenseText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  selectedParticipantCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  selectedParticipantLabel: {
    fontSize: 16,
    color: nospiColors.purpleDark,
    marginBottom: 8,
  },
  selectedParticipantName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: nospiColors.purpleMid,
  },
  questionCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  questionIcon: {
    fontSize: 60,
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
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  answerButton: {
    flex: 1,
    backgroundColor: '#10B981',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  answerButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  passButton: {
    flex: 1,
    backgroundColor: '#EF4444',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  passButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  passInfoCard: {
    backgroundColor: '#FEF3C7',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  passInfoText: {
    fontSize: 14,
    color: '#92400E',
    textAlign: 'center',
    lineHeight: 20,
  },
  syncInfoCard: {
    backgroundColor: '#DBEAFE',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  syncInfoText: {
    fontSize: 14,
    color: '#1E40AF',
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: '600',
  },
  ratingCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  ratingTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    textAlign: 'center',
    marginBottom: 20,
  },
  ratingButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  ratingButton: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: '#E5E7EB',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ratingButtonSelected: {
    backgroundColor: nospiColors.purpleMid,
  },
  ratingButtonText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#6B7280',
  },
  ratingButtonTextSelected: {
    color: '#FFFFFF',
  },
  ratingInfoCard: {
    backgroundColor: nospiColors.purpleLight,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  ratingInfoText: {
    fontSize: 14,
    color: nospiColors.purpleDark,
    textAlign: 'center',
    lineHeight: 20,
  },
  submitButton: {
    backgroundColor: nospiColors.purpleDark,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  submitButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  currentLevelCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  currentLevelLabel: {
    fontSize: 16,
    color: nospiColors.purpleDark,
    marginBottom: 12,
    fontWeight: '600',
  },
  nextLevelCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  nextLevelLabel: {
    fontSize: 16,
    color: nospiColors.purpleDark,
    marginBottom: 12,
    fontWeight: '600',
  },
  voteButtons: {
    gap: 12,
    marginBottom: 16,
  },
  voteButton: {
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  voteButtonKeep: {
    backgroundColor: '#6B7280',
  },
  voteButtonUp: {
    backgroundColor: '#10B981',
  },
  voteButtonSelected: {
    borderWidth: 4,
    borderColor: nospiColors.purpleDark,
  },
  voteButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  voteInfoCard: {
    backgroundColor: nospiColors.purpleLight,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  voteInfoText: {
    fontSize: 14,
    color: nospiColors.purpleDark,
    textAlign: 'center',
    lineHeight: 20,
  },
  endCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  endIcon: {
    fontSize: 80,
    marginBottom: 16,
  },
  endTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 16,
  },
  endMessage: {
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
    lineHeight: 24,
  },
  extensionButtons: {
    gap: 12,
    marginBottom: 16,
  },
  extensionButton: {
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  extensionButtonFree: {
    backgroundColor: '#6B7280',
  },
  extensionButtonMore: {
    backgroundColor: nospiColors.purpleMid,
  },
  extensionButtonSelected: {
    borderWidth: 4,
    borderColor: nospiColors.purpleDark,
  },
  extensionButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  finalCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  finalIcon: {
    fontSize: 80,
    marginBottom: 16,
  },
  finalTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 16,
  },
  finalMessage: {
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
    lineHeight: 24,
  },
  prizeCard: {
    backgroundColor: '#FEF3C7',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#F59E0B',
  },
  prizeIcon: {
    fontSize: 60,
    marginBottom: 12,
  },
  prizeTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#92400E',
    marginBottom: 12,
  },
  prizeMessage: {
    fontSize: 14,
    color: '#92400E',
    textAlign: 'center',
    lineHeight: 20,
  },
  statsCard: {
    backgroundColor: nospiColors.purpleLight,
    borderRadius: 16,
    padding: 20,
  },
  statsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 12,
  },
  statsText: {
    fontSize: 14,
    color: nospiColors.purpleDark,
    marginBottom: 4,
  },
  participantsReadyCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  participantsReadyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 16,
    textAlign: 'center',
  },
  participantsReadyList: {
    gap: 12,
  },
  participantReadyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 12,
  },
  participantReadyPhoto: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
  },
  participantReadyPhotoPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: nospiColors.purpleLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  participantReadyPhotoText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
  },
  participantReadyName: {
    fontSize: 16,
    fontWeight: '600',
    color: nospiColors.purpleDark,
    flex: 1,
  },
  readyBadge: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  readyBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  waitingForAllCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  waitingForAllText: {
    fontSize: 16,
    color: nospiColors.purpleDark,
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '600',
  },
});
