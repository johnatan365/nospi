
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, Modal, Animated, Easing, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import * as Haptics from 'expo-haptics';

interface Participant {
  id: string;
  user_id: string;
  name: string;
  profile_photo_url: string | null;
  occupation: string;
}

type QuestionLevel = 'divertido' | 'sensual' | 'atrevido';

interface MatchSelectionScreenProps {
  eventId: string;
  currentLevel: QuestionLevel;
  currentUserId: string;
  participants: Participant[];
  onMatchComplete: (nextLevel: QuestionLevel, nextPhase: 'questions' | 'free_phase') => Promise<void>;
  triggerMatchAnimation: (matchedUserId: string) => void;
}

export default function MatchSelectionScreen({
  eventId,
  currentLevel,
  currentUserId,
  participants,
  onMatchComplete,
  triggerMatchAnimation,
}: MatchSelectionScreenProps) {
  console.log('💘 === MATCH SELECTION SCREEN V2 RENDERED ===');
  console.log('💘 Props:', { eventId, currentLevel, currentUserId });
  
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [totalVotes, setTotalVotes] = useState(0);
  const [totalParticipants, setTotalParticipants] = useState(0);
  const [allVotes, setAllVotes] = useState<Array<{ user_id: string; selected_user_id: string | null }>>([]);
  const [userHasVoted, setUserHasVoted] = useState(false);
  const [loadingVoteStatus, setLoadingVoteStatus] = useState(true);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [matchedUserName, setMatchedUserName] = useState('');
  const [matchCheckDone, setMatchCheckDone] = useState(false);
  const [isAutoContinuing, setIsAutoContinuing] = useState(false);
  
  // Animation refs
  const heartScale = useRef(new Animated.Value(0.8)).current;
  const matchGlowAnimation = useRef(new Animated.Value(0)).current;
  const matchTextAnimation = useRef(new Animated.Value(0)).current;
  
  // Refs for stable access in callbacks
  const selectedUserIdRef = useRef(selectedUserId);
  const hasCheckedMatchRef = useRef(false);
  const autoContinueTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    selectedUserIdRef.current = selectedUserId;
  }, [selectedUserId]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (autoContinueTimerRef.current) {
        clearTimeout(autoContinueTimerRef.current);
      }
    };
  }, []);

  // PHASE 1: Fetch votes and participants on mount - ONLY ONCE
  const fetchVotesAndParticipants = useCallback(async () => {
    console.log('📊 === FETCHING VOTES AND PARTICIPANTS ===');
    setLoadingVoteStatus(true);

    try {
      // Fetch all votes for current event and level
      const { data: votesData, error: votesError } = await supabase
        .from('event_matches_votes')
        .select('from_user_id, selected_user_id')
        .eq('event_id', eventId)
        .eq('level', currentLevel);

      if (votesError) {
        console.error('❌ Error fetching votes:', votesError);
        setLoadingVoteStatus(false);
        return;
      }

      const votes = votesData || [];
      
      // Fetch participants directly from database
      console.log('📊 Fetching participants from database...');
      const { data: participantsData, error: participantsError } = await supabase
        .from('event_participants')
        .select('user_id, confirmed')
        .eq('event_id', eventId)
        .eq('confirmed', true);

      if (participantsError) {
        console.error('❌ Error fetching participants:', participantsError);
        const totalParticipantsCount = participants.length;
        console.log('⚠️ Using participants from prop as fallback:', totalParticipantsCount);
        setTotalParticipants(totalParticipantsCount);
      } else {
        const confirmedParticipants = participantsData || [];
        const totalParticipantsCount = confirmedParticipants.length;
        console.log('✅ Participants from database:', totalParticipantsCount);
        setTotalParticipants(totalParticipantsCount);
      }

      console.log('📊 Votes:', votes.length);

      // Derive user's vote status from DB
      const currentUserVote = votes.find((vote) => vote.from_user_id === currentUserId);
      const hasVoted = !!currentUserVote;
      
      console.log('🔍 User has voted:', hasVoted);
      console.log('🔍 Total votes:', votes.length);
      console.log('🔍 Total participants:', participantsData?.length || participants.length);
      
      setUserHasVoted(hasVoted);

      // Store all votes for match detection
      setAllVotes(votes.map(v => ({ user_id: v.from_user_id, selected_user_id: v.selected_user_id })));
      setTotalVotes(votes.length);
      
      const votesCount = votes.length;
      const participantsCount = participantsData?.length || participants.length;
      console.log('🔍 Can continue?', votesCount === participantsCount && participantsCount > 0);
    } catch (error) {
      console.error('❌ Error in fetchVotesAndParticipants:', error);
    } finally {
      setLoadingVoteStatus(false);
    }
  }, [eventId, currentLevel, currentUserId, participants]);

  // Initial fetch - only on mount
  useEffect(() => {
    console.log('🔄 Initial fetch triggered');
    fetchVotesAndParticipants();
  }, [eventId, currentLevel]); // Removed fetchVotesAndParticipants from deps to prevent loops

  // Subscribe to vote changes
  useEffect(() => {
    console.log('📡 === SUBSCRIBING TO VOTE CHANGES ===');

    const channel = supabase
      .channel(`votes_${eventId}_${currentLevel}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'event_matches_votes',
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          console.log('📡 Vote change detected:', payload.eventType);
          console.log('📡 Payload:', payload);
          fetchVotesAndParticipants();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, currentLevel, fetchVotesAndParticipants]);

  // Auto-continue function
  const handleAutoContinue = useCallback(async () => {
    console.log('🚀 === AUTO-CONTINUING TO NEXT SCREEN ===');
    setIsAutoContinuing(true);
    
    const nextLevel: QuestionLevel = 
      currentLevel === 'divertido' ? 'sensual' :
      currentLevel === 'sensual' ? 'atrevido' : 'atrevido';
    
    if (currentLevel === 'divertido' || currentLevel === 'sensual') {
      console.log('➡️ Auto-advancing to level', nextLevel);
      await onMatchComplete(nextLevel, 'questions');
    } else {
      console.log('🏁 All levels complete - auto-moving to free phase');
      await onMatchComplete(currentLevel, 'free_phase');
    }
  }, [currentLevel, onMatchComplete]);

  // PHASE 3: Match detection - ONLY when all votes are in AND we haven't checked yet
  useEffect(() => {
    console.log('🔍 Match detection check - hasCheckedMatchRef:', hasCheckedMatchRef.current);
    console.log('🔍 totalVotes:', totalVotes, 'totalParticipants:', totalParticipants);
    
    // Prevent multiple checks
    if (hasCheckedMatchRef.current) {
      console.log('⚠️ Already checked for matches, skipping');
      return;
    }

    // Only check when all votes are in
    if (totalVotes !== totalParticipants || totalParticipants === 0) {
      console.log('⚠️ Not all votes in yet, waiting...');
      return;
    }

    // Mark as checked to prevent re-runs
    hasCheckedMatchRef.current = true;
    setMatchCheckDone(true);

    console.log('🔍 === CHECKING FOR MATCHES (ONE TIME) ===');
    console.log('🔍 Total votes:', totalVotes, 'Total participants:', totalParticipants);
    console.log('🔍 All votes:', allVotes);

    // Find reciprocal matches
    const reciprocalMatches: Array<{ user1: string; user2: string }> = [];
    
    allVotes.forEach((voteA) => {
      if (!voteA.selected_user_id) return;
      
      const voteB = allVotes.find(
        (voteC) =>
          voteC.user_id === voteA.selected_user_id &&
          voteC.selected_user_id === voteA.user_id
      );
      
      if (voteB) {
        const alreadyExists = reciprocalMatches.some(
          (m) =>
            (m.user1 === voteA.user_id && m.user2 === voteB.user_id) ||
            (m.user1 === voteB.user_id && m.user2 === voteA.user_id)
        );
        
        if (!alreadyExists) {
          reciprocalMatches.push({ user1: voteA.user_id, user2: voteB.user_id });
          console.log('💜 Reciprocal match found:', voteA.user_id, '<->', voteB.user_id);
        }
      }
    });

    console.log('💜 Total reciprocal matches:', reciprocalMatches.length);

    // Check if current user is in a match
    const currentUserMatch = reciprocalMatches.find(
      (match) => match.user1 === currentUserId || match.user2 === currentUserId
    );

    if (currentUserMatch) {
      const matchedUserId =
        currentUserMatch.user1 === currentUserId
          ? currentUserMatch.user2
          : currentUserMatch.user1;

      console.log('✨ Current user has a match with:', matchedUserId);

      const matchedParticipant = participants.find((p) => p.user_id === matchedUserId);
      const matchedName = matchedParticipant?.name || 'Alguien';

      setMatchedUserName(matchedName);
      setShowMatchModal(true);
      triggerMatchAnimation(matchedUserId);

      // Set timer to auto-continue after 5 seconds
      console.log('⏱️ Setting auto-continue timer for 5 seconds');
      autoContinueTimerRef.current = setTimeout(() => {
        console.log('⏱️ Auto-continue timer fired');
        handleAutoContinue();
      }, 5000);
    } else {
      console.log('ℹ️ Current user has no match this round');
      // If no match, auto-continue after a short delay
      console.log('⏱️ No match - setting auto-continue timer for 2 seconds');
      autoContinueTimerRef.current = setTimeout(() => {
        console.log('⏱️ Auto-continue timer fired (no match)');
        handleAutoContinue();
      }, 2000);
    }
  }, [totalVotes, totalParticipants, allVotes, currentUserId, participants, triggerMatchAnimation, handleAutoContinue]);

  // Match animation
  const animateMatch = useCallback(() => {
    console.log('🎉 === TRIGGERING MATCH ANIMATION ===');
    
    heartScale.setValue(0.5);
    matchGlowAnimation.setValue(0);
    matchTextAnimation.setValue(0);

    Animated.sequence([
      Animated.spring(heartScale, {
        toValue: 1.3,
        friction: 3,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.spring(heartScale, {
        toValue: 1.0,
        friction: 5,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(matchGlowAnimation, {
          toValue: 1,
          duration: 800,
          easing: Easing.bezier(0.4, 0.0, 0.2, 1),
          useNativeDriver: true,
        }),
        Animated.timing(matchGlowAnimation, {
          toValue: 0,
          duration: 800,
          easing: Easing.bezier(0.4, 0.0, 0.2, 1),
          useNativeDriver: true,
        }),
      ])
    ).start();

    setTimeout(() => {
      Animated.spring(matchTextAnimation, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }).start();
    }, 300);

    if (Platform.OS !== 'web') {
      setTimeout(() => {
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (error) {
          console.log('⚠️ Haptic not available:', error);
        }
      }, 500);
    }
  }, [heartScale, matchGlowAnimation, matchTextAnimation]);

  useEffect(() => {
    if (showMatchModal) {
      animateMatch();
    }
  }, [showMatchModal, animateMatch]);

  const handleSelectUser = useCallback((userId: string) => {
    if (userHasVoted) {
      console.log('⚠️ Cannot change selection - already voted');
      return;
    }
    console.log('👆 Selected user:', userId);
    setSelectedUserId(userId);
  }, [userHasVoted]);

  const handleSelectNone = useCallback(() => {
    if (userHasVoted) {
      console.log('⚠️ Cannot change selection - already voted');
      return;
    }
    console.log('👆 Selected: Ninguno por ahora');
    setSelectedUserId('none');
  }, [userHasVoted]);

  // Vote confirmation
  const handleConfirmSelection = useCallback(async () => {
    console.log('🔘 === CONFIRMING SELECTION ===');
    
    const currentSelectedUserId = selectedUserIdRef.current;
    
    if (!currentSelectedUserId) {
      console.warn('⚠️ No selection made');
      return;
    }

    if (loading) {
      console.warn('⚠️ Already loading');
      return;
    }

    if (userHasVoted) {
      console.warn('⚠️ Already voted');
      return;
    }

    setLoading(true);

    try {
      const selectedUserIdValue = currentSelectedUserId === 'none' ? null : currentSelectedUserId;
      
      console.log('📝 Inserting vote:', {
        event_id: eventId,
        level: currentLevel,
        from_user_id: currentUserId,
        selected_user_id: selectedUserIdValue,
      });

      const { data, error } = await supabase
        .from('event_matches_votes')
        .insert({
          event_id: eventId,
          level: currentLevel,
          from_user_id: currentUserId,
          selected_user_id: selectedUserIdValue,
        })
        .select('id')
        .single();

      if (error) {
        console.error('❌ Vote insert failed:', error);
        setLoading(false);
        return;
      }

      console.log('✅ Vote inserted successfully:', data);
      
      // Immediately update local state to reflect the vote
      setUserHasVoted(true);
      
      // Fetch updated vote counts immediately
      console.log('🔄 Fetching updated votes immediately after confirmation');
      await fetchVotesAndParticipants();
      
    } catch (error) {
      console.error('❌ Unexpected error:', error);
    } finally {
      setLoading(false);
    }
  }, [eventId, currentLevel, currentUserId, loading, userHasVoted, fetchVotesAndParticipants]);

  // Continue button logic
  const canContinue = totalVotes === totalParticipants && totalParticipants > 0;

  const handleManualContinue = useCallback(async () => {
    console.log('➡️ === MANUAL CONTINUE PRESSED ===');
    
    // Clear auto-continue timer if user manually continues
    if (autoContinueTimerRef.current) {
      clearTimeout(autoContinueTimerRef.current);
      autoContinueTimerRef.current = null;
    }
    
    await handleAutoContinue();
  }, [handleAutoContinue]);

  const otherParticipants = participants.filter((p) => p.user_id !== currentUserId);

  const glowOpacity = matchGlowAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.8],
  });

  const textOpacity = matchTextAnimation;

  const isButtonDisabled = !selectedUserId || loading || userHasVoted || loadingVoteStatus;
  
  const buttonText = userHasVoted
    ? 'Elección confirmada ✅'
    : loading
    ? '⏳ Confirmando...'
    : 'Confirmar elección';

  if (loadingVoteStatus) {
    return (
      <LinearGradient
        colors={['#1a0b2e', '#2d1b4e', '#4a2c6e']}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={nospiColors.purpleMid} />
          <Text style={styles.loadingText}>Cargando...</Text>
        </View>
      </LinearGradient>
    );
  }

  if (isAutoContinuing) {
    return (
      <LinearGradient
        colors={['#1a0b2e', '#2d1b4e', '#4a2c6e']}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={nospiColors.purpleMid} />
          <Text style={styles.loadingText}>Continuando...</Text>
        </View>
      </LinearGradient>
    );
  }

  console.log('🎨 Rendering UI - userHasVoted:', userHasVoted, 'totalVotes:', totalVotes, 'totalParticipants:', totalParticipants, 'canContinue:', canContinue);

  return (
    <LinearGradient
      colors={['#1a0b2e', '#2d1b4e', '#4a2c6e']}
      style={styles.gradient}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.titleWhite}>💘 Momento de decisión</Text>

        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            Elige con quién te gustaría seguir conectando.
          </Text>
          <Text style={styles.infoTextSecondary}>
            Tu elección es secreta.
          </Text>
          <Text style={styles.infoTextSecondary}>
            Solo se mostrará si la otra persona también te elige.
          </Text>
        </View>

        <View style={styles.participantsSection}>
          {otherParticipants.map((participant, index) => {
            const isSelected = selectedUserId === participant.user_id;
            const displayName = participant.name;
            
            return (
              <React.Fragment key={index}>
                <TouchableOpacity
                  style={[
                    styles.participantCard,
                    isSelected && styles.participantCardSelected,
                    userHasVoted && styles.participantCardDisabled,
                  ]}
                  onPress={() => handleSelectUser(participant.user_id)}
                  activeOpacity={userHasVoted ? 1 : 0.7}
                  disabled={userHasVoted}
                >
                  <View style={styles.participantInfo}>
                    {participant.profile_photo_url ? (
                      <Image
                        source={{ uri: participant.profile_photo_url }}
                        style={styles.participantPhoto}
                      />
                    ) : (
                      <View style={styles.participantPhotoPlaceholder}>
                        <Text style={styles.participantPhotoPlaceholderText}>
                          {displayName.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={styles.participantDetails}>
                      <Text style={styles.participantName}>{displayName}</Text>
                      <Text style={styles.participantOccupation}>{participant.occupation}</Text>
                    </View>
                  </View>
                  {isSelected && (
                    <View style={styles.selectedBadge}>
                      <Text style={styles.selectedBadgeText}>✓</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </React.Fragment>
            );
          })}

          <TouchableOpacity
            style={[
              styles.noneCard,
              selectedUserId === 'none' && styles.noneCardSelected,
              userHasVoted && styles.participantCardDisabled,
            ]}
            onPress={handleSelectNone}
            activeOpacity={userHasVoted ? 1 : 0.7}
            disabled={userHasVoted}
          >
            <Text style={styles.noneText}>Ninguno por ahora</Text>
            {selectedUserId === 'none' && (
              <View style={styles.selectedBadge}>
                <Text style={styles.selectedBadgeText}>✓</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[
            styles.confirmButton,
            isButtonDisabled && styles.buttonDisabled,
            userHasVoted && styles.buttonConfirmed,
          ]}
          onPress={handleConfirmSelection}
          disabled={isButtonDisabled}
          activeOpacity={0.8}
        >
          <Text style={styles.confirmButtonText}>{buttonText}</Text>
        </TouchableOpacity>

        {userHasVoted && !canContinue && (
          <View style={styles.waitingCard}>
            <ActivityIndicator size="large" color={nospiColors.purpleMid} />
            <Text style={styles.waitingText}>
              ⏳ Esperando a que todos elijan... ({totalVotes}/{totalParticipants})
            </Text>
          </View>
        )}

        {canContinue && !showMatchModal && (
          <TouchableOpacity
            style={styles.continueButton}
            onPress={handleManualContinue}
            activeOpacity={0.8}
          >
            <Text style={styles.continueButtonText}>➡️ Continuar</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <Modal visible={showMatchModal} transparent animationType="none" onRequestClose={() => {}}>
        <View style={styles.modalOverlay}>
          <Animated.View
            style={[
              styles.matchModalContent,
              {
                transform: [{ scale: heartScale }],
              },
            ]}
          >
            <Animated.View style={[styles.glowContainer, { opacity: glowOpacity }]}>
              <View style={styles.glowCircle} />
              <View style={[styles.glowCircle, styles.glowCircleOuter]} />
            </Animated.View>
            <Text style={styles.matchIcon}>💜</Text>
            <Animated.View style={{ opacity: textOpacity }}>
              <Text style={styles.matchTitle}>✨ ¡Match confirmado! ✨</Text>
              <Text style={styles.matchText}>Tú y {matchedUserName} se eligieron</Text>
              <Text style={styles.matchSubtext}>¡Sigan conociéndose! 💜</Text>
            </Animated.View>
          </Animated.View>
        </View>
      </Modal>
    </LinearGradient>
  );
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#FFFFFF',
    marginTop: 16,
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
    marginBottom: 24,
  },
  infoText: {
    fontSize: 18,
    fontWeight: '600',
    color: nospiColors.purpleDark,
    textAlign: 'center',
    marginBottom: 16,
  },
  infoTextSecondary: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
  },
  participantsSection: {
    marginBottom: 24,
  },
  participantCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  participantCardSelected: {
    borderColor: nospiColors.purpleMid,
    backgroundColor: 'rgba(233, 213, 255, 0.95)',
  },
  participantCardDisabled: {
    opacity: 0.6,
  },
  participantInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  participantPhoto: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  participantPhotoPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: nospiColors.purpleLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  participantPhotoPlaceholderText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
  },
  participantDetails: {
    flex: 1,
  },
  participantName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 4,
  },
  participantOccupation: {
    fontSize: 14,
    color: '#666',
  },
  selectedBadge: {
    backgroundColor: nospiColors.purpleMid,
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  selectedBadgeText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  noneCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    flexDirection: 'row',
  },
  noneCardSelected: {
    borderColor: nospiColors.purpleMid,
    backgroundColor: 'rgba(233, 213, 255, 0.95)',
  },
  noneText: {
    fontSize: 16,
    fontWeight: '600',
    color: nospiColors.purpleDark,
    marginRight: 8,
  },
  confirmButton: {
    backgroundColor: nospiColors.purpleDark,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 32,
    alignItems: 'center',
    marginBottom: 16,
  },
  confirmButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonConfirmed: {
    backgroundColor: '#10B981',
  },
  waitingCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    marginBottom: 24,
  },
  waitingText: {
    fontSize: 16,
    color: nospiColors.purpleDark,
    textAlign: 'center',
    fontWeight: '600',
    marginTop: 16,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  matchModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 32,
    padding: 48,
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.3,
    shadowRadius: 30,
    elevation: 20,
    minHeight: 400,
  },
  glowContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 0,
  },
  glowCircle: {
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: nospiColors.purpleMid,
    opacity: 0.4,
  },
  glowCircleOuter: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    opacity: 0.2,
    backgroundColor: '#FFD700',
  },
  matchIcon: {
    fontSize: 100,
    marginBottom: 28,
    zIndex: 1,
  },
  matchTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 20,
    textAlign: 'center',
    letterSpacing: 1,
    zIndex: 1,
  },
  matchText: {
    fontSize: 22,
    color: '#333',
    textAlign: 'center',
    fontWeight: '700',
    marginBottom: 8,
    zIndex: 1,
  },
  matchSubtext: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
    fontWeight: '500',
    zIndex: 1,
  },
});
