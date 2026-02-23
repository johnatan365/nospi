
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
  console.log('💘 === MATCH SELECTION SCREEN RENDERED ===');
  console.log('💘 Props:', { eventId, currentLevel, currentUserId, matchDeadlineAt });
  
  // CRITICAL: Remove local hasVoted state - derive from DB only
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [userHasVoted, setUserHasVoted] = useState(false); // Derived from DB
  const [loadingVoteStatus, setLoadingVoteStatus] = useState(true); // Loading initial vote check
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
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasCalledOnMatchCompleteRef = useRef(false);
  
  // Refs for stable access in callbacks
  const loadingRef = useRef(loading);
  const userHasVotedRef = useRef(userHasVoted);
  const selectedUserIdRef = useRef(selectedUserId);
  
  // Keep refs in sync with state
  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);
  
  useEffect(() => {
    userHasVotedRef.current = userHasVoted;
  }, [userHasVoted]);
  
  useEffect(() => {
    selectedUserIdRef.current = selectedUserId;
  }, [selectedUserId]);

  // CRITICAL: Move triggerMatchAnimation to the top
  const triggerMatchAnimation = useCallback(() => {
    console.log('🎉 === TRIGGERING MATCH ANIMATION ===');
    
    // Reset animation values
    heartScale.setValue(0.5);
    matchGlowAnimation.setValue(0);
    matchTextAnimation.setValue(0);

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

    // Enhanced glow animation
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

    // Text fade-in
    setTimeout(() => {
      Animated.spring(matchTextAnimation, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }).start();
    }, 300);

    // Haptic feedback
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

    // Auto-close modal after 4 seconds
    setTimeout(() => {
      console.log('⏰ === MATCH MODAL AUTO-CLOSE TRIGGERED ===');
      Animated.timing(heartScale, {
        toValue: 0,
        duration: 400,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }).start(() => {
        console.log('✅ Match modal animation complete - closing modal');
        setShowMatchModal(false);
      });
    }, 4000);
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

  // CRITICAL: Check if user has voted and subscribe to vote changes
  useEffect(() => {
    let isMounted = true;

    const checkAndSubscribeUserVote = async () => {
      if (!eventId || !currentLevel || !currentUserId) {
        setLoadingVoteStatus(false);
        return;
      }

      setLoadingVoteStatus(true);

      try {
        console.log('🔍 === CHECKING USER VOTE FROM DATABASE ===');
        console.log('🔍 Query params:', { 
          eventId, 
          level: Number(currentLevel), 
          currentUserId 
        });
        
        // 1. Initial check for existing vote
        const { data: vote, error: initialError } = await supabase
          .from('event_matches_votes')
          .select('id')
          .eq('event_id', eventId)
          .eq('level', Number(currentLevel))
          .eq('user_id', currentUserId)
          .maybeSingle();

        if (initialError) {
          console.error('❌ Error checking initial user vote:', initialError);
        }
        
        if (isMounted) {
          const hasVoted = !!vote;
          console.log(hasVoted ? '✅ User has voted - vote exists in DB' : 'ℹ️ User has not voted yet');
          setUserHasVoted(hasVoted);
          setLoadingVoteStatus(false);
        }

        // 2. Realtime subscription for changes to the user's vote
        const voteChannel = supabase
          .channel(`user_vote_channel_${eventId}_${currentLevel}_${currentUserId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'event_matches_votes',
              filter: `event_id=eq.${eventId}`,
            },
            (payload) => {
              console.log('📡 Realtime vote update received:', payload);
              
              // Check if this update is for the current user and level
              const newData = payload.new as any;
              const oldData = payload.old as any;
              
              const isCurrentUserAndLevel = 
                (newData?.user_id === currentUserId && newData?.level === Number(currentLevel)) ||
                (oldData?.user_id === currentUserId && oldData?.level === Number(currentLevel));
              
              if (isCurrentUserAndLevel && isMounted) {
                console.log('📡 Vote update is for current user and level');
                // Update userHasVoted based on realtime event
                if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                  console.log('✅ Setting userHasVoted to TRUE (realtime INSERT/UPDATE)');
                  setUserHasVoted(true);
                } else if (payload.eventType === 'DELETE') {
                  console.log('❌ Setting userHasVoted to FALSE (realtime DELETE)');
                  setUserHasVoted(false);
                }
              }
            }
          )
          .subscribe();

        return () => {
          console.log('🧹 Cleaning up user vote subscription');
          supabase.removeChannel(voteChannel);
        };
      } catch (error) {
        console.error('❌ Error in checkAndSubscribeUserVote:', error);
        if (isMounted) {
          setLoadingVoteStatus(false);
        }
      }
    };

    checkAndSubscribeUserVote();

    return () => {
      isMounted = false;
    };
  }, [eventId, currentLevel, currentUserId]);

  // CRITICAL: Check if all participants have voted
  const checkAllVotes = useCallback(async () => {
    try {
      console.log('📊 === CHECKING ALL VOTES ===');
      
      const { data, error } = await supabase
        .from('event_matches_votes')
        .select('user_id')
        .eq('event_id', eventId)
        .eq('level', Number(currentLevel));

      if (error) {
        console.error('❌ Error checking votes:', error);
        return;
      }

      const votedUserIds = data.map(v => v.user_id);
      const allParticipantIds = participants.map(p => p.user_id);
      const allVoted = allParticipantIds.every(id => votedUserIds.includes(id));

      console.log('📊 Vote status:', {
        votedCount: votedUserIds.length,
        totalCount: allParticipantIds.length,
        allVoted,
      });

      setAllVotesReceived(allVoted);

      // If all votes received, stop countdown
      if (allVoted) {
        console.log('🛑 === ALL VOTES RECEIVED - STOPPING COUNTDOWN ===');
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
      }
    } catch (error) {
      console.error('❌ Error checking all votes:', error);
    }
  }, [eventId, currentLevel, participants]);

  // Subscribe to vote changes for all participants
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
          console.log('📡 Vote change detected:', payload);
          checkAllVotes();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, currentLevel, checkAllVotes]);

  // Countdown timer
  useEffect(() => {
    console.log('⏰ === COUNTDOWN TIMER SETUP ===');
    
    // Clear any existing interval
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    // Don't start countdown if all votes already received or no deadline
    if (!matchDeadlineAt || allVotesReceived) {
      console.log('⏸️ Not starting countdown');
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
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [matchDeadlineAt, serverTime, allVotesReceived]);

  // Subscribe to confirmed matches
  useEffect(() => {
    console.log('📡 === SUBSCRIBING TO MATCH CONFIRMATIONS ===');
    
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
          
          const newMatch = payload.new as any;
          
          const isUserInMatch = (newMatch.user1_id === currentUserId || newMatch.user2_id === currentUserId);
          const isCurrentLevel = newMatch.level === Number(currentLevel);
          
          if (isCurrentLevel && isUserInMatch) {
            const otherUserId = newMatch.user1_id === currentUserId ? newMatch.user2_id : newMatch.user1_id;
            
            // Get the other user's name
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
            triggerMatchAnimation();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, currentLevel, currentUserId, triggerMatchAnimation]);

  const handleSelectUser = useCallback((userId: string) => {
    // Disable selection changes after voting
    if (userHasVotedRef.current) {
      console.log('⚠️ Cannot change selection - already voted');
      return;
    }
    console.log('👆 Selected user:', userId);
    setSelectedUserId(userId);
  }, []);

  const handleSelectNone = useCallback(() => {
    // Disable selection changes after voting
    if (userHasVotedRef.current) {
      console.log('⚠️ Cannot change selection - already voted');
      return;
    }
    console.log('👆 Selected: Ninguno por ahora');
    setSelectedUserId('none');
  }, []);

  // CRITICAL: Vote confirmation - insert into DB and let realtime update UI
  const handleConfirmSelection = useCallback(async () => {
    console.log('🔘 === BUTTON CLICKED: Confirmar elección ===');
    
    const currentSelectedUserId = selectedUserIdRef.current;
    const currentLoading = loadingRef.current;
    const currentUserHasVoted = userHasVotedRef.current;
    
    console.log('🔘 Current state:', {
      selectedUserId: currentSelectedUserId,
      loading: currentLoading,
      userHasVoted: currentUserHasVoted,
    });

    // Guard clauses
    if (!currentSelectedUserId) {
      console.warn('⚠️ No selection made');
      return;
    }

    if (currentLoading) {
      console.warn('⚠️ Already loading');
      return;
    }

    if (currentUserHasVoted) {
      console.warn('⚠️ Already voted');
      return;
    }

    console.log('💘 === CONFIRMING MATCH SELECTION ===');
    
    setLoading(true);

    try {
      const selectedUserIdValue = currentSelectedUserId === 'none' ? null : currentSelectedUserId;
      
      console.log('📝 === INSERTING VOTE INTO DATABASE ===');
      console.log('📝 Insert data:', {
        event_id: eventId,
        level: Number(currentLevel),
        user_id: currentUserId,
        selected_user_id: selectedUserIdValue,
      });

      // CRITICAL: Insert vote - DO NOT set local state
      const { data, error } = await supabase
        .from('event_matches_votes')
        .insert({
          event_id: eventId,
          level: Number(currentLevel),
          user_id: currentUserId,
          selected_user_id: selectedUserIdValue,
        })
        .select('id')
        .single();

      if (error) {
        console.error('❌ === VOTE INSERT FAILED ===');
        console.error('❌ Error:', error.message, error.details, error.hint);
        return;
      }

      console.log('✅ === VOTE INSERTED SUCCESSFULLY ===');
      console.log('✅ Inserted data:', data);
      console.log('✅ Realtime will update userHasVoted state');

      // Recalculate vote count
      await checkAllVotes();

      // Check for immediate match
      console.log('🔍 Checking for immediate match...');
      const { data: matchData, error: matchError } = await supabase.rpc('process_match_vote', {
        p_event_id: eventId,
        p_level: currentLevel,
        p_from_user_id: currentUserId,
        p_selected_user_id: selectedUserIdValue,
      });

      if (matchError) {
        console.error('⚠️ Error checking for match:', matchError);
      } else {
        const result = matchData as ProcessMatchVoteResult;
        console.log('🔍 Match check result:', result);

        if (result.match && result.matched_user_id && result.matched_user_name) {
          console.log('💜 === IMMEDIATE MATCH DETECTED ===');
          setMatchedUserName(result.matched_user_name);
          setShowMatchModal(true);
          triggerMatchAnimation();
        }
      }
    } catch (error) {
      console.error('❌ === UNEXPECTED ERROR ===');
      console.error('❌ Error:', error);
    } finally {
      setLoading(false);
    }
  }, [eventId, currentLevel, currentUserId, triggerMatchAnimation, checkAllVotes]);

  // Determine if we can continue
  const canContinue = allVotesReceived || deadlineReached;

  // Auto-continue when conditions are met
  useEffect(() => {
    console.log('🔄 === AUTO-CONTINUE CHECK ===');
    console.log('🔄 State:', {
      userHasVoted,
      showMatchModal,
      canContinue,
      hasCalledOnMatchComplete: hasCalledOnMatchCompleteRef.current
    });
    
    if (userHasVoted && !showMatchModal && canContinue && !hasCalledOnMatchCompleteRef.current) {
      console.log('✅ === AUTO-CONTINUING TO NEXT PHASE ===');
      
      hasCalledOnMatchCompleteRef.current = true;
      
      const timer = setTimeout(() => {
        console.log('➡️ Calling onMatchComplete()');
        onMatchComplete();
      }, 800);
      
      return () => {
        clearTimeout(timer);
      };
    }
  }, [userHasVoted, showMatchModal, canContinue, onMatchComplete]);

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

  const isWarning = remainingMinutes === 0 && remainingSeconds <= 10 && remainingSeconds > 5;
  const isCritical = remainingMinutes === 0 && remainingSeconds <= 5 && remainingSeconds > 0;

  // CRITICAL: Button state derived from DB
  const isButtonDisabled = !selectedUserId || loading || userHasVoted || loadingVoteStatus;
  const buttonText = userHasVoted ? 'Elección confirmada ✅' : loading ? '⏳ Confirmando...' : 'Confirmar elección';
  
  console.log('🔘 Button render state:', {
    selectedUserId,
    loading,
    userHasVoted,
    loadingVoteStatus,
    isButtonDisabled,
    buttonText,
  });

  // Show loading while checking initial vote status
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
                style={[
                  styles.participantCard, 
                  isSelected && styles.participantCardSelected,
                  userHasVoted && styles.participantCardDisabled
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
              userHasVoted && styles.participantCardDisabled
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
            userHasVoted && styles.buttonConfirmed
          ]}
          onPress={handleConfirmSelection}
          disabled={isButtonDisabled}
          activeOpacity={0.8}
        >
          <Text style={styles.confirmButtonText}>
            {buttonText}
          </Text>
        </TouchableOpacity>

        {userHasVoted && !showMatchModal && (
          <View style={styles.waitingCard}>
            <ActivityIndicator size="large" color={nospiColors.purpleMid} />
            <Text style={styles.waitingText}>
              {canContinue ? '✓ Procesando resultados...' : '⏳ Esperando a que todos elijan...'}
            </Text>
          </View>
        )}
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
