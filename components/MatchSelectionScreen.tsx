
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

interface MatchSelectionScreenProps {
  eventId: string;
  currentLevel: string;
  currentUserId: string;
  participants: Participant[];
  onMatchComplete: () => void;
  matchDeadlineAt: string | null;
}

interface ProcessMatchVoteResult {
  match: boolean;
  matched_user_id: string | null;
  matched_user_name: string | null;
}

export default function MatchSelectionScreen({
  eventId,
  currentLevel,
  currentUserId,
  participants,
  onMatchComplete,
  matchDeadlineAt,
}: MatchSelectionScreenProps) {
  console.log('💘 Rendering MatchSelectionScreen with deadline:', matchDeadlineAt);
  
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [matchedUserName, setMatchedUserName] = useState('');
  const [allVotesReceived, setAllVotesReceived] = useState(false);
  const [deadlineReached, setDeadlineReached] = useState(false);
  const [remainingMinutes, setRemainingMinutes] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [serverTime, setServerTime] = useState<Date>(new Date());
  
  // Animation refs
  const heartScale = useRef(new Animated.Value(0.8)).current;
  const matchGlowAnimation = useRef(new Animated.Value(0)).current;
  const matchTextAnimation = useRef(new Animated.Value(0)).current;
  const isOptimisticUpdateRef = useRef(false);
  const hasTriggeredHapticRef = useRef(false);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // CRITICAL FIX: Move triggerMatchAnimation to the top, before any useEffect that uses it
  const triggerMatchAnimation = useCallback(() => {
    console.log('🎉 Triggering enhanced match animation');
    
    // Reset animation values
    heartScale.setValue(0.5);
    matchGlowAnimation.setValue(0);
    matchTextAnimation.setValue(0);
    hasTriggeredHapticRef.current = false;

    // Enhanced heart scale animation with bounce effect
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

    // Enhanced glow animation with more dramatic effect
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

    // Text fade-in with slide up effect
    setTimeout(() => {
      Animated.spring(matchTextAnimation, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }).start();
    }, 300);

    // Multiple haptic feedback for celebration effect
    if (Platform.OS !== 'web') {
      setTimeout(() => {
        try {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } catch (error) {
          console.log('⚠️ Haptic not available:', error);
        }
      }, 100);
      
      setTimeout(() => {
        try {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } catch (error) {
          console.log('⚠️ Haptic not available:', error);
        }
      }, 300);
      
      setTimeout(() => {
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (error) {
          console.log('⚠️ Haptic not available:', error);
        }
      }, 500);
    }

    // Auto-close modal after 7 seconds (4 seconds longer than original)
    setTimeout(() => {
      Animated.timing(heartScale, {
        toValue: 0,
        duration: 400,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }).start(() => {
        setShowMatchModal(false);
      });
    }, 7000);
  }, [heartScale, matchGlowAnimation, matchTextAnimation]);

  // Fetch server time on mount
  useEffect(() => {
    const fetchServerTime = async () => {
      try {
        const { data, error } = await supabase.rpc('get_server_time');
        if (!error && data) {
          const serverTimestamp = new Date(data);
          setServerTime(serverTimestamp);
          console.log('🕐 Server time fetched:', serverTimestamp.toISOString());
        }
      } catch (err) {
        console.error('❌ Error fetching server time:', err);
      }
    };
    fetchServerTime();
  }, []);

  // Check if user has already voted for this level
  useEffect(() => {
    const checkExistingVote = async () => {
      try {
        const { data, error } = await supabase
          .from('event_matches_votes')
          .select('*')
          .eq('event_id', eventId)
          .eq('level', currentLevel)
          .eq('from_user_id', currentUserId)
          .single();

        if (data && !error) {
          console.log('✅ User has already voted for this level');
          setHasVoted(true);
        }
      } catch (error) {
        console.log('No existing vote found');
      }
    };

    checkExistingVote();
  }, [eventId, currentLevel, currentUserId]);

  // CRITICAL: Check if all participants have voted
  const checkAllVotes = useCallback(async () => {
    try {
      console.log('📊 === CHECKING ALL VOTES ===');
      
      const { data, error } = await supabase
        .from('event_matches_votes')
        .select('from_user_id')
        .eq('event_id', eventId)
        .eq('level', currentLevel);

      if (error) {
        console.error('❌ Error checking votes:', error);
        return;
      }

      const votedUserIds = data.map(v => v.from_user_id);
      const allParticipantIds = participants.map(p => p.user_id);
      const allVoted = allParticipantIds.every(id => votedUserIds.includes(id));

      console.log('📊 Vote status:', {
        votedCount: votedUserIds.length,
        totalCount: allParticipantIds.length,
        allVoted,
        votedUserIds,
        allParticipantIds
      });

      setAllVotesReceived(allVoted);

      // CRITICAL: If all votes received, stop countdown immediately
      if (allVoted) {
        console.log('🛑 === ALL VOTES RECEIVED - STOPPING COUNTDOWN ===');
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
          console.log('✅ Countdown interval cleared');
        }
      }
    } catch (error) {
      console.error('❌ Error checking all votes:', error);
    }
  }, [eventId, currentLevel, participants]);

  // Initial vote check and realtime subscription
  useEffect(() => {
    console.log('📡 === SETTING UP VOTE MONITORING ===');
    
    // Initial check
    checkAllVotes();

    // Subscribe to vote changes
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
          if (isOptimisticUpdateRef.current) {
            console.log('⏭️ Skipping vote realtime update - optimistic update in progress');
            return;
          }
          console.log('📡 Vote change detected:', payload);
          // CRITICAL: Recalculate immediately on any vote change
          checkAllVotes();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, currentLevel, participants, checkAllVotes]);

  // CRITICAL: Countdown timer - stops when all votes received
  useEffect(() => {
    console.log('⏰ === COUNTDOWN TIMER SETUP ===');
    console.log('⏰ matchDeadlineAt:', matchDeadlineAt);
    console.log('⏰ allVotesReceived:', allVotesReceived);
    
    // Clear any existing interval
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    // CRITICAL: Don't start countdown if all votes already received or no deadline
    if (!matchDeadlineAt || allVotesReceived) {
      console.log('⏸️ Not starting countdown - allVotesReceived:', allVotesReceived, 'deadline:', matchDeadlineAt);
      return;
    }

    const updateCountdown = () => {
      const now = new Date(serverTime.getTime() + (Date.now() - serverTime.getTime()));
      const deadlineMs = new Date(matchDeadlineAt).getTime();
      const nowMs = now.getTime();
      const remaining = Math.max(0, deadlineMs - nowMs);

      const minutes = Math.floor(remaining / (1000 * 60));
      const seconds = Math.floor((remaining % (1000 * 60)) / 1000);

      setRemainingMinutes(minutes);
      setRemainingSeconds(seconds);

      if (remaining === 0) {
        setDeadlineReached(true);
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        console.log('⏰ Deadline reached!');
      }
    };

    console.log('▶️ Starting countdown interval');
    updateCountdown();
    countdownIntervalRef.current = setInterval(updateCountdown, 1000);

    return () => {
      if (countdownIntervalRef.current) {
        console.log('🛑 Clearing countdown interval on unmount');
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [matchDeadlineAt, serverTime, allVotesReceived]);

  // CRITICAL FIX: Subscribe to confirmed matches for BOTH users
  useEffect(() => {
    console.log('📡 === SUBSCRIBING TO MATCH CONFIRMATIONS ===');
    console.log('📡 Event:', eventId, 'Level:', currentLevel, 'User:', currentUserId);
    
    const channel = supabase
      .channel(`matches_${eventId}_${currentLevel}_${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'event_matches_confirmed',
          filter: `event_id=eq.${eventId}`,
        },
        async (payload) => {
          console.log('💜 === MATCH CONFIRMED EVENT RECEIVED ===');
          console.log('💜 Payload:', payload);
          
          const newMatch = payload.new as any;
          
          console.log('💜 Match details:', {
            level: newMatch.level,
            currentLevel: currentLevel,
            user1_id: newMatch.user1_id,
            user2_id: newMatch.user2_id,
            currentUserId: currentUserId
          });
          
          // CRITICAL: Check if current user is part of this match AND it's for the current level
          const isUserInMatch = (newMatch.user1_id === currentUserId || newMatch.user2_id === currentUserId);
          const isCurrentLevel = newMatch.level === currentLevel;
          
          console.log('💜 Match check:', {
            isUserInMatch,
            isCurrentLevel,
            shouldShowModal: isUserInMatch && isCurrentLevel
          });
          
          if (isCurrentLevel && isUserInMatch) {
            const otherUserId = newMatch.user1_id === currentUserId ? newMatch.user2_id : newMatch.user1_id;
            
            console.log('💜 Fetching other user name for:', otherUserId);
            
            // Get the other user's name from profiles table
            const { data: profileData } = await supabase
              .from('profiles')
              .select('name')
              .eq('id', otherUserId)
              .single();
            
            const otherUserName = profileData?.name || 'Alguien';
            
            console.log('✨ === SHOWING MATCH MODAL ===');
            console.log('✨ Matched with:', otherUserName);
            
            setMatchedUserName(otherUserName);
            setShowMatchModal(true);
            
            // Trigger premium match animation
            triggerMatchAnimation();
          } else {
            console.log('⏭️ Skipping match modal - not for current user or level');
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 Match subscription status:', status);
      });

    return () => {
      console.log('📡 Cleaning up match subscription');
      supabase.removeChannel(channel);
    };
  }, [eventId, currentLevel, currentUserId, triggerMatchAnimation]);

  const handleSelectUser = useCallback((userId: string) => {
    console.log('Selected user:', userId);
    setSelectedUserId(userId);
  }, []);

  const handleSelectNone = useCallback(() => {
    console.log('Selected: Ninguno por ahora');
    setSelectedUserId('none');
  }, []);

  const handleConfirmSelection = useCallback(async () => {
    if (!selectedUserId) {
      console.warn('⚠️ No selection made');
      return;
    }

    console.log('💘 === CONFIRMING MATCH SELECTION (ATOMIC RPC) ===');
    console.log('💘 Selected user ID:', selectedUserId);
    
    // Set optimistic flag to block realtime updates
    isOptimisticUpdateRef.current = true;
    setLoading(true);

    try {
      const selectedUserIdValue = selectedUserId === 'none' ? null : selectedUserId;
      
      console.log('🔧 Calling process_match_vote RPC with:', {
        p_event_id: eventId,
        p_level: currentLevel,
        p_from_user_id: currentUserId,
        p_selected_user_id: selectedUserIdValue,
      });

      // Call the atomic RPC function
      const { data, error } = await supabase.rpc('process_match_vote', {
        p_event_id: eventId,
        p_level: currentLevel,
        p_from_user_id: currentUserId,
        p_selected_user_id: selectedUserIdValue,
      });

      if (error) {
        console.error('❌ Error calling process_match_vote RPC:', error);
        console.error('❌ Error details:', JSON.stringify(error, null, 2));
        isOptimisticUpdateRef.current = false;
        setLoading(false);
        return;
      }

      console.log('✅ RPC call successful');
      console.log('✅ RPC result:', JSON.stringify(data, null, 2));

      const result = data as ProcessMatchVoteResult;

      setHasVoted(true);
      console.log('✅ hasVoted set to true');

      // CRITICAL: Recalculate vote count immediately after submission
      console.log('🔄 Recalculating vote count after submission');
      await checkAllVotes();

      // If match was found immediately, show modal
      if (result.match && result.matched_user_id && result.matched_user_name) {
        console.log('💜 === IMMEDIATE MATCH DETECTED ===');
        console.log('💜 Matched with:', result.matched_user_name);
        setMatchedUserName(result.matched_user_name);
        setShowMatchModal(true);
        triggerMatchAnimation();
      } else {
        console.log('⏳ No immediate match - waiting for reciprocal vote or user selected "Ninguno"');
        console.log('⏳ Result details:', {
          match: result.match,
          matched_user_id: result.matched_user_id,
          matched_user_name: result.matched_user_name
        });
      }

      // Clear optimistic flag after delay
      setTimeout(() => {
        isOptimisticUpdateRef.current = false;
        console.log('🔓 Optimistic update flag CLEARED (vote)');
      }, 1500);
    } catch (error) {
      console.error('❌ Unexpected error in handleConfirmSelection:', error);
      isOptimisticUpdateRef.current = false;
    } finally {
      setLoading(false);
      console.log('✅ Loading state set to false');
    }
  }, [selectedUserId, eventId, currentLevel, currentUserId, triggerMatchAnimation, checkAllVotes]);

  const handleContinue = useCallback(() => {
    console.log('➡️ Continuing to next phase');
    onMatchComplete();
  }, [onMatchComplete]);

  const otherParticipants = participants.filter(p => p.user_id !== currentUserId);

  // Glow opacity interpolation
  const glowOpacity = matchGlowAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.8],
  });

  const textOpacity = matchTextAnimation;

  // Format countdown timer
  const minutesDisplay = String(remainingMinutes).padStart(2, '0');
  const secondsDisplay = String(remainingSeconds).padStart(2, '0');
  const timerDisplay = `${minutesDisplay}:${secondsDisplay}`;

  // CRITICAL: Determine if "Continuar" button should be enabled
  const canContinue = allVotesReceived || deadlineReached;

  // Determine timer color and animation
  const isWarning = remainingMinutes === 0 && remainingSeconds <= 10 && remainingSeconds > 5;
  const isCritical = remainingMinutes === 0 && remainingSeconds <= 5 && remainingSeconds > 0;

  // CRITICAL FIX: Auto-continue when all votes received or deadline reached (but NOT if match modal is showing)
  useEffect(() => {
    if (hasVoted && !showMatchModal && canContinue) {
      console.log('✅ All votes received or deadline reached - auto-continuing to next phase');
      // Small delay to ensure smooth transition
      const timer = setTimeout(() => {
        handleContinue();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [hasVoted, showMatchModal, canContinue, handleContinue]);

  return (
    <LinearGradient
      colors={['#1a0b2e', '#2d1b4e', '#4a2c6e']}
      style={styles.gradient}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.titleWhite}>💘 Momento de decisión</Text>

        {matchDeadlineAt && (
          <View style={styles.timerCard}>
            <Text style={styles.timerLabel}>🕐 Tienes este tiempo para elegir:</Text>
            <Text style={[
              styles.timerDisplay,
              isWarning && styles.timerWarning,
              isCritical && styles.timerCritical
            ]}>{timerDisplay}</Text>
          </View>
        )}

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
                style={[styles.participantCard, isSelected && styles.participantCardSelected]}
                onPress={() => handleSelectUser(participant.user_id)}
                activeOpacity={0.7}
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
            style={[styles.noneCard, selectedUserId === 'none' && styles.noneCardSelected]}
            onPress={handleSelectNone}
            activeOpacity={0.7}
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
          style={[styles.confirmButton, (!selectedUserId || loading) && styles.buttonDisabled]}
          onPress={handleConfirmSelection}
          disabled={!selectedUserId || loading}
          activeOpacity={0.8}
        >
          <Text style={styles.confirmButtonText}>
            {loading ? '⏳ Confirmando...' : 'Confirmar elección'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={showMatchModal}
        transparent
        animationType="none"
        onRequestClose={() => {}}
      >
        <View style={styles.modalOverlay}>
          <Animated.View 
            style={[
              styles.matchModalContent,
              { 
                transform: [{ scale: heartScale }]
              }
            ]}
          >
            <Animated.View style={[styles.glowContainer, { opacity: glowOpacity }]}>
              <View style={styles.glowCircle} />
              <View style={[styles.glowCircle, styles.glowCircleOuter]} />
            </Animated.View>
            <Text style={styles.matchIcon}>💜</Text>
            <Animated.View style={{ opacity: textOpacity }}>
              <Text style={styles.matchTitle}>✨ ¡Hay match! ✨</Text>
              <Text style={styles.matchText}>
                Tú y {matchedUserName} se eligieron
              </Text>
              <Text style={styles.matchSubtext}>
                ¡Sigan conociéndose! 💜
              </Text>
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
  titleWhite: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 24,
    marginTop: 48,
    textAlign: 'center',
  },
  timerCard: {
    backgroundColor: 'rgba(255, 215, 0, 0.95)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
  },
  timerLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a0b2e',
    marginBottom: 8,
  },
  timerDisplay: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#1a0b2e',
    fontVariant: ['tabular-nums'],
  },
  timerWarning: {
    color: '#F59E0B',
  },
  timerCritical: {
    color: '#EF4444',
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
  },
  confirmButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  waitingCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 40,
    alignItems: 'center',
    marginBottom: 24,
  },
  waitingIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  waitingText: {
    fontSize: 16,
    color: nospiColors.purpleDark,
    textAlign: 'center',
    fontWeight: '600',
  },
  continueButton: {
    backgroundColor: '#10B981',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 32,
    alignItems: 'center',
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
