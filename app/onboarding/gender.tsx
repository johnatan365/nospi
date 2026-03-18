
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { nospiColors } from '@/constants/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
    <LinearGradient
      colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
      style={styles.gradient}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>¿Cuál es tu género?</Text>
          
          <View style={styles.optionsContainer}>
            {GENDERS.map((gender, index) => (
              <TouchableOpacity
                key={index}
                style={styles.optionButton}
                onPress={() => handleSelect(gender.value)}
                activeOpacity={0.8}
              >
                <Text style={styles.optionEmoji}>{gender.emoji}</Text>
                <Text style={styles.optionText}>{gender.label}</Text>
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
    fontSize: 32,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 40,
    textAlign: 'center',
  },
  optionsContainer: {
    gap: 16,
  },
  optionButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
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
