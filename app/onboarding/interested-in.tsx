
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { nospiColors } from '@/constants/Colors';

const INTERESTS = [
  { value: 'hombres', label: 'Hombres', emoji: '👨' },
  { value: 'mujeres', label: 'Mujeres', emoji: '👩' },
  { value: 'ambos', label: 'Ambos', emoji: '👥' },
];

export default function InterestedInScreen() {
  const router = useRouter();

  const handleSelect = (interest: string) => {
    console.log('User interested in:', interest);
    // TODO: Backend Integration - PUT /api/pre-registration with { interestedIn }
    router.push('/onboarding/age-range');
  };

  return (
    <LinearGradient
      colors={[nospiColors.purpleDark, nospiColors.purpleMid, nospiColors.purpleLight]}
      style={styles.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>¿A quién te interesaría conocer en los encuentros grupales?</Text>
          
          <View style={styles.optionsContainer}>
            {INTERESTS.map((interest, index) => (
              <TouchableOpacity
                key={index}
                style={styles.optionButton}
                onPress={() => handleSelect(interest.value)}
                activeOpacity={0.8}
              >
                <Text style={styles.optionEmoji}>{interest.emoji}</Text>
                <Text style={styles.optionText}>{interest.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: nospiColors.white,
    marginBottom: 40,
    textAlign: 'center',
  },
  optionsContainer: {
    gap: 16,
  },
  optionButton: {
    backgroundColor: nospiColors.white,
    paddingVertical: 24,
    paddingHorizontal: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  optionEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  optionText: {
    color: nospiColors.purpleDark,
    fontSize: 20,
    fontWeight: '700',
  },
});
