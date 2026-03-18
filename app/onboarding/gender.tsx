
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const HEADING = '#1a0010';
const MUTED = '#555555';
const ACCENT = '#880E4F';

const GENDERS = [
  { value: 'hombre', label: 'Hombre', emoji: '👨' },
  { value: 'mujer', label: 'Mujer', emoji: '👩' },
  { value: 'no binario', label: 'No binario', emoji: '🧑' },
];

export default function GenderScreen() {
  const router = useRouter();

  const handleSelect = async (gender: string) => {
    console.log('User selected gender:', gender);
    await AsyncStorage.setItem('onboarding_gender', gender);
    router.push('/onboarding/interested-in');
  };

  return (
    <View style={styles.screen}>
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>¿Cuál es tu género?</Text>
          <View style={styles.optionsContainer}>
            {GENDERS.map((gender, index) => (
              <TouchableOpacity key={index} style={styles.optionButton} onPress={() => handleSelect(gender.value)} activeOpacity={0.8}>
                <Text style={styles.optionEmoji}>{gender.emoji}</Text>
                <Text style={styles.optionText}>{gender.label}</Text>
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
  title: { fontSize: 32, fontWeight: 'bold', color: HEADING, marginBottom: 40, textAlign: 'center' },
  optionsContainer: { gap: 16 },
  optionButton: { backgroundColor: '#F9FAFB', paddingVertical: 24, paddingHorizontal: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', borderWidth: 1, borderColor: '#E5E7EB' },
  optionEmoji: { fontSize: 32, marginRight: 12 },
  optionText: { color: HEADING, fontSize: 20, fontWeight: '700' },
});
