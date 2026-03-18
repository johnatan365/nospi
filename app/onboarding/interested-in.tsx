
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const HEADING = '#1a0010';
const MUTED = '#555555';

const INTERESTS = [
  { value: 'hombres', label: 'Hombres', emoji: '👨' },
  { value: 'mujeres', label: 'Mujeres', emoji: '👩' },
  { value: 'ambos', label: 'Ambos', emoji: '👥' },
];

export default function InterestedInScreen() {
  const router = useRouter();

  const handleSelect = async (interest: string) => {
    console.log('User interested in:', interest);
    await AsyncStorage.setItem('onboarding_interested_in', interest);
    router.push('/onboarding/age-range');
  };

  return (
    <View style={styles.screen}>
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>¿A quién te interesaría conocer en los encuentros grupales?</Text>
          <View style={styles.optionsContainer}>
            {INTERESTS.map((interest, index) => (
              <TouchableOpacity key={index} style={styles.optionButton} onPress={() => handleSelect(interest.value)} activeOpacity={0.8}>
                <Text style={styles.optionEmoji}>{interest.emoji}</Text>
                <Text style={styles.optionText}>{interest.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  content: { width: '100%', maxWidth: 400, alignSelf: 'center' },
  title: { fontSize: 28, fontWeight: 'bold', color: HEADING, marginBottom: 40, textAlign: 'center' },
  optionsContainer: { gap: 16 },
  optionButton: { backgroundColor: '#F9FAFB', paddingVertical: 24, paddingHorizontal: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', borderWidth: 1, borderColor: '#E5E7EB' },
  optionEmoji: { fontSize: 32, marginRight: 12 },
  optionText: { color: HEADING, fontSize: 20, fontWeight: '700' },
});
