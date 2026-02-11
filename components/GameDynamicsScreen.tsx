
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';

type QuestionLevel = 'divertido' | 'sensual' | 'atrevido';
type GamePhase = 'ready' | 'roulette' | 'question' | 'rating' | 'level_vote' | 'game_end' | 'extension';

interface Participant {
  id: string;
  user_id: string;
  name: string;
  profile_photo_url: string | null;
  occupation: string;
  arrival_status: string;
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

export default function GameDynamicsScreen({ appointment, activeParticipants }: GameDynamicsScreenProps) {
  const [gamePhase, setGamePhase] = useState<GamePhase>('ready');
  const [currentLevel, setCurrentLevel] = useState<QuestionLevel>('divertido');
  const [currentRound, setCurrentRound] = useState(0);
  const [currentTurnIndex, setCurrentTurnIndex] = useState(0);
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [questionsAnsweredInLevel, setQuestionsAnsweredInLevel] = useState(0);
  const [totalQuestionsPerParticipant, setTotalQuestionsPerParticipant] = useState(3);
  const [showRoulette, setShowRoulette] = useState(false);
  const [rouletteAnimation] = useState(new Animated.Value(0));
  const [userRating, setUserRating] = useState<number | null>(null);
  const [hasRated, setHasRated] = useState(false);
  const [userVote, setUserVote] = useState<'keep' | 'up' | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [extensionCount, setExtensionCount] = useState(0);
  const [showExtensionVote, setShowExtensionVote] = useState(false);
  const [extensionVoteChoice, setExtensionVoteChoice] = useState<'free' | 'more' | null>(null);
  const [usedQuestionIds, setUsedQuestionIds] = useState<string[]>([]);
  const [playerScores, setPlayerScores] = useState<Record<string, number>>({});
  const [didUserPass, setDidUserPass] = useState(false);

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

  useEffect(() => {
    if (gamePhase === 'ready') {
      console.log('Game ready to start with', activeParticipants.length, 'participants');
    }
  }, [gamePhase, activeParticipants]);

  const startGame = () => {
    console.log('Starting game - Round 1');
    setCurrentRound(1);
    setGamePhase('roulette');
    startRoulette();
  };

  const startRoulette = () => {
    console.log('Starting roulette animation');
    setShowRoulette(true);
    setHasRated(false);
    setUserRating(null);
    setDidUserPass(false);
    
    rouletteAnimation.setValue(0);
    
    Animated.timing(rouletteAnimation, {
      toValue: 1,
      duration: 2500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      const randomIndex = Math.floor(Math.random() * activeParticipants.length);
      const selected = activeParticipants[randomIndex];
      console.log('Roulette selected:', selected.name);
      setSelectedParticipant(selected);
      setCurrentTurnIndex(randomIndex);
      
      setTimeout(() => {
        setShowRoulette(false);
        loadQuestion();
      }, 1000);
    });
  };

  const loadQuestion = async () => {
    console.log('Loading question for level:', currentLevel);
    // TODO: Backend Integration - GET /api/questions?level={currentLevel}&exclude={usedQuestionIds} → { id, text, level }
    // For now, use mock data
    const mockQuestions: Record<QuestionLevel, string[]> = {
      divertido: [
        '¿Cuál es tu comida favorita y por qué?',
        '¿Qué harías si ganaras la lotería?',
        '¿Cuál es tu película favorita de todos los tiempos?',
        '¿Qué superpoder te gustaría tener?',
        '¿Cuál es el lugar más interesante que has visitado?',
      ],
      sensual: [
        '¿Qué es lo más romántico que has hecho por alguien?',
        '¿Cuál es tu idea de una cita perfecta?',
        '¿Qué cualidad te atrae más de una persona?',
        '¿Cuál ha sido tu mejor beso?',
        '¿Qué canción te pone de buen humor?',
      ],
      atrevido: [
        '¿Cuál es tu fantasía más atrevida?',
        '¿Qué es lo más loco que has hecho por amor?',
        '¿Cuál es tu secreto mejor guardado?',
        '¿Qué es lo más arriesgado que has hecho?',
        '¿Con quién de esta mesa tendrías una cita?',
      ],
    };

    const availableQuestions = mockQuestions[currentLevel].filter(
      (_, index) => !usedQuestionIds.includes(`${currentLevel}-${index}`)
    );

    if (availableQuestions.length === 0) {
      console.log('No more questions available for this level');
      setCurrentQuestion({ id: 'fallback', text: 'Cuéntanos algo interesante sobre ti', level: currentLevel });
      setGamePhase('question');
      return;
    }

    const randomIndex = Math.floor(Math.random() * availableQuestions.length);
    const questionText = availableQuestions[randomIndex];
    const questionId = `${currentLevel}-${mockQuestions[currentLevel].indexOf(questionText)}`;
    
    setUsedQuestionIds([...usedQuestionIds, questionId]);
    setCurrentQuestion({ id: questionId, text: questionText, level: currentLevel });
    setGamePhase('question');
  };

  const handleAnswer = () => {
    console.log('Participant answered question');
    setGamePhase('rating');
  };

  const handlePass = () => {
    console.log('Participant passed on question');
    setDidUserPass(true);
    // TODO: Backend Integration - POST /api/game-actions - Body: { action: 'pass', participantId, questionId } → { success: true }
    nextTurn();
  };

  const handleRating = (rating: number) => {
    console.log('User rated:', rating);
    setUserRating(rating);
    setHasRated(true);
    // TODO: Backend Integration - POST /api/ratings - Body: { participantId, questionId, rating } → { success: true }
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
    const nextIndex = (currentTurnIndex + 1) % activeParticipants.length;
    
    if (nextIndex === 0) {
      console.log('All participants have had a turn');
      const totalQuestionsInRound = activeParticipants.length * totalQuestionsPerParticipant;
      if (questionsAnsweredInLevel >= totalQuestionsInRound) {
        setGamePhase('level_vote');
        return;
      }
    }
    
    setCurrentTurnIndex(nextIndex);
    setGamePhase('roulette');
    startRoulette();
  };

  const handleLevelVote = (vote: 'keep' | 'up') => {
    console.log('User voted:', vote);
    setUserVote(vote);
    setHasVoted(true);
    // TODO: Backend Integration - POST /api/level-votes - Body: { eventId, vote } → { success: true }
  };

  const submitLevelVote = () => {
    if (!hasVoted) return;
    console.log('Level vote submitted');
    
    // TODO: Backend Integration - GET /api/level-votes/results?eventId={eventId} → { keepVotes, upVotes }
    // For now, simulate majority vote
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
    // TODO: Backend Integration - POST /api/extension-votes - Body: { eventId, choice } → { success: true }
  };

  const submitExtensionVote = () => {
    if (!extensionVoteChoice) return;
    console.log('Extension vote submitted');
    
    // TODO: Backend Integration - GET /api/extension-votes/results?eventId={eventId} → { freeVotes, moreVotes }
    // For now, simulate vote
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

  const spin = rouletteAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '1440deg'],
  });

  if (gamePhase === 'ready') {
    return (
      <LinearGradient
        colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
          <Text style={styles.title}>¡Listos para comenzar!</Text>
          <Text style={styles.subtitle}>Todos se han presentado</Text>

          <View style={styles.successCard}>
            <Text style={styles.successIcon}>🎉</Text>
            <Text style={styles.successTitle}>¡Excelente!</Text>
            <Text style={styles.successMessage}>
              Todos los participantes activos se han presentado. La dinámica del juego está lista para comenzar.
            </Text>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoCardTitle}>Participantes Activos: {activeParticipants.length}</Text>
            <Text style={styles.infoCardText}>Solo los participantes activos pueden:</Text>
            <Text style={styles.infoCardBullet}>• Aparecer en ruleta</Text>
            <Text style={styles.infoCardBullet}>• Recibir preguntas</Text>
            <Text style={styles.infoCardBullet}>• Ser puntuados</Text>
            <Text style={styles.infoCardBullet}>• Competir por el premio</Text>
          </View>

          <View style={styles.levelCard}>
            <Text style={styles.levelTitle}>Nivel Inicial</Text>
            <View style={[styles.levelBadge, { backgroundColor: levelColors.divertido }]}>
              <Text style={styles.levelBadgeText}>{levelNames.divertido}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.startGameButton}
            onPress={startGame}
            activeOpacity={0.8}
          >
            <Text style={styles.startGameButtonText}>🎮 Iniciar Dinámica</Text>
          </TouchableOpacity>
        </ScrollView>
      </LinearGradient>
    );
  }

  if (gamePhase === 'roulette' || showRoulette) {
    return (
      <LinearGradient
        colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <View style={styles.rouletteContainer}>
          <Text style={styles.rouletteTitle}>Ronda {currentRound}</Text>
          <Text style={styles.rouletteSubtitle}>Girando la ruleta...</Text>

          <Animated.View style={[styles.rouletteWheel, { transform: [{ rotate: spin }] }]}>
            <View style={styles.rouletteCenter}>
              <Text style={styles.rouletteCenterText}>🎯</Text>
            </View>
          </Animated.View>

          <View style={styles.participantsList}>
            {activeParticipants.map((participant, index) => (
              <View key={index} style={styles.rouletteParticipant}>
                <Text style={styles.rouletteParticipantName}>{participant.name}</Text>
              </View>
            ))}
          </View>

          {selectedParticipant && !showRoulette && (
            <View style={styles.selectedCard}>
              <Text style={styles.selectedTitle}>Es turno de</Text>
              <Text style={styles.selectedName}>{selectedParticipant.name}</Text>
            </View>
          )}
        </View>
      </LinearGradient>
    );
  }

  if (gamePhase === 'question' && currentQuestion && selectedParticipant) {
    const levelColor = levelColors[currentLevel];
    const levelName = levelNames[currentLevel];

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

          <Text style={styles.turnTitle}>Turno de {selectedParticipant.name}</Text>

          <View style={styles.questionCard}>
            <Text style={styles.questionIcon}>❓</Text>
            <Text style={styles.questionText}>{currentQuestion.text}</Text>
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
        </ScrollView>
      </LinearGradient>
    );
  }

  if (gamePhase === 'rating' && selectedParticipant) {
    return (
      <LinearGradient
        colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
          <Text style={styles.title}>Momento de votar</Text>
          <Text style={styles.subtitle}>Califica la respuesta de {selectedParticipant.name}</Text>

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

          <View style={styles.extensionInfoCard}>
            <Text style={styles.extensionInfoText}>
              🏆 El premio solo se entrega si el grupo decidió extender al menos una vez.
            </Text>
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
                El grupo decidió extender la experiencia. El premio será entregado pronto.
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
  subtitle: {
    fontSize: 16,
    color: nospiColors.purpleDark,
    opacity: 0.8,
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
  infoCard: {
    backgroundColor: nospiColors.purpleLight,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  infoCardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 12,
  },
  infoCardText: {
    fontSize: 14,
    color: nospiColors.purpleDark,
    marginBottom: 8,
  },
  infoCardBullet: {
    fontSize: 14,
    color: nospiColors.purpleDark,
    marginLeft: 8,
    marginBottom: 4,
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
    color: nospiColors.purpleDark,
    marginBottom: 8,
  },
  rouletteSubtitle: {
    fontSize: 18,
    color: nospiColors.purpleDark,
    marginBottom: 40,
  },
  rouletteWheel: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
    marginBottom: 40,
  },
  rouletteCenter: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: nospiColors.purpleMid,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rouletteCenterText: {
    fontSize: 60,
  },
  participantsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  rouletteParticipant: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  rouletteParticipantName: {
    fontSize: 14,
    color: nospiColors.purpleDark,
    fontWeight: '600',
  },
  selectedCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginTop: 40,
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  selectedTitle: {
    fontSize: 18,
    color: nospiColors.purpleDark,
    marginBottom: 8,
  },
  selectedName: {
    fontSize: 32,
    fontWeight: 'bold',
    color: nospiColors.purpleMid,
  },
  turnTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    textAlign: 'center',
    marginBottom: 24,
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
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  passInfoText: {
    fontSize: 14,
    color: '#92400E',
    textAlign: 'center',
    lineHeight: 20,
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
  extensionInfoCard: {
    backgroundColor: '#FEF3C7',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  extensionInfoText: {
    fontSize: 14,
    color: '#92400E',
    textAlign: 'center',
    lineHeight: 20,
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
});
