
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, Modal, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';

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
}

export default function MatchSelectionScreen({
  eventId,
  currentLevel,
  currentUserId,
  participants,
  onMatchComplete,
}: MatchSelectionScreenProps) {
  console.log('💘 Rendering MatchSelectionScreen');
  
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [matchedUserName, setMatchedUserName] = useState('');
  const [waitingForOthers, setWaitingForOthers] = useState(false);
  
  const matchAnimation = useRef(new Animated.Value(0)).current;

  // Check if user has already voted for this level
  useEffect(() => {
    const checkExistingVote = async () => {
      try {
        const voteData = await supabase
          .from('event_matches_votes')
          .select('*')
          .eq('event_id', eventId)
          .eq('level', currentLevel)
          .eq('from_user_id', currentUserId)
          .single();

        if (voteData.data) {
          console.log('✅ User has already voted for this level');
          setHasVoted(true);
          setWaitingForOthers(true);
        }
      } catch (error) {
        console.log('No existing vote found');
      }
    };

    checkExistingVote();
  }, [eventId, currentLevel, currentUserId]);

  // Subscribe to confirmed matches
  useEffect(() => {
    console.log('📡 Subscribing to match confirmations');
    
    const channel = supabase
      .channel(`matches_${eventId}_${currentLevel}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'event_matches_confirmed',
          filter: `event_id=eq.${eventId}`,
        },
        async (payload) => {
          console.log('💜 Match confirmed event received:', payload);
          const newMatch = payload.new as any;
          
          // Check if current user is part of this match
          if (newMatch.user1_id === currentUserId || newMatch.user2_id === currentUserId) {
            const otherUserId = newMatch.user1_id === currentUserId ? newMatch.user2_id : newMatch.user1_id;
            
            // Get the other user's name
            const userData = await supabase
              .from('users')
              .select('name')
              .eq('id', otherUserId)
              .single();
            
            const otherUserName = userData.data?.name || 'Alguien';
            
            console.log('✨ Match confirmed with:', otherUserName);
            setMatchedUserName(otherUserName);
            setShowMatchModal(true);
            
            // Animate the match modal
            Animated.sequence([
              Animated.timing(matchAnimation, {
                toValue: 1,
                duration: 600,
                easing: Easing.elastic(1.2),
                useNativeDriver: true,
              }),
              Animated.delay(3000),
              Animated.timing(matchAnimation, {
                toValue: 0,
                duration: 300,
                useNativeDriver: true,
              }),
            ]).start(() => {
              setShowMatchModal(false);
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, currentLevel, currentUserId, matchAnimation]);

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
      console.warn('No selection made');
      return;
    }

    console.log('💘 === CONFIRMING MATCH SELECTION ===');
    setLoading(true);

    try {
      const selectedUserIdValue = selectedUserId === 'none' ? null : selectedUserId;
      
      // 1. Insert vote
      console.log('💾 Inserting vote...');
      const insertError = await supabase
        .from('event_matches_votes')
        .insert({
          event_id: eventId,
          level: currentLevel,
          from_user_id: currentUserId,
          selected_user_id: selectedUserIdValue,
        });

      if (insertError.error) {
        console.error('❌ Error inserting vote:', insertError.error);
        setLoading(false);
        return;
      }

      console.log('✅ Vote inserted successfully');
      setHasVoted(true);

      // 2. Check for reciprocal vote if a user was selected
      if (selectedUserIdValue) {
        console.log('🔍 Checking for reciprocal vote...');
        
        const reciprocalData = await supabase
          .from('event_matches_votes')
          .select('*')
          .eq('event_id', eventId)
          .eq('level', currentLevel)
          .eq('from_user_id', selectedUserIdValue)
          .eq('selected_user_id', currentUserId)
          .single();

        if (reciprocalData.data) {
          console.log('💜 Reciprocal vote found! Creating confirmed match...');
          
          // 3. Create confirmed match
          const confirmError = await supabase
            .from('event_matches_confirmed')
            .insert({
              event_id: eventId,
              level: currentLevel,
              user1_id: currentUserId,
              user2_id: selectedUserIdValue,
            });

          if (confirmError.error) {
            console.error('❌ Error confirming match:', confirmError.error);
          } else {
            console.log('✅ Match confirmed successfully');
            // The realtime subscription will handle showing the modal
          }
        } else {
          console.log('⏳ No reciprocal vote yet - waiting...');
          setWaitingForOthers(true);
        }
      } else {
        console.log('⏭️ User selected "Ninguno" - no match check needed');
        setWaitingForOthers(true);
      }
    } catch (error) {
      console.error('❌ Unexpected error:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedUserId, eventId, currentLevel, currentUserId]);

  const handleContinue = useCallback(() => {
    console.log('➡️ Continuing to next phase');
    onMatchComplete();
  }, [onMatchComplete]);

  const otherParticipants = participants.filter(p => p.user_id !== currentUserId);

  const matchScale = matchAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 1],
  });

  const matchOpacity = matchAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  if (hasVoted && !showMatchModal) {
    return (
      <LinearGradient
        colors={['#1a0b2e', '#2d1b4e', '#4a2c6e']}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
          <Text style={styles.titleWhite}>Tu elección ha sido registrada</Text>

          <View style={styles.waitingCard}>
            <Text style={styles.waitingIcon}>⏳</Text>
            <Text style={styles.waitingText}>
              Esperando a que todos elijan...
            </Text>
          </View>

          <TouchableOpacity
            style={styles.continueButton}
            onPress={handleContinue}
            activeOpacity={0.8}
          >
            <Text style={styles.continueButtonText}>Continuar</Text>
          </TouchableOpacity>
        </ScrollView>
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
                opacity: matchOpacity,
                transform: [{ scale: matchScale }]
              }
            ]}
          >
            <Text style={styles.matchIcon}>✨</Text>
            <Text style={styles.matchTitle}>¡Match confirmado!</Text>
            <Text style={styles.matchText}>
              Tú y {matchedUserName} se eligieron 💜
            </Text>
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
    borderRadius: 24,
    padding: 40,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  matchIcon: {
    fontSize: 80,
    marginBottom: 24,
  },
  matchTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 16,
    textAlign: 'center',
  },
  matchText: {
    fontSize: 18,
    color: '#333',
    textAlign: 'center',
  },
});
