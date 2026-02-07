
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { nospiColors } from '@/constants/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Common interests similar to Tinder
const INTERESTS = [
  '🎵 Música', '🎬 Cine', '📚 Lectura', '✈️ Viajar', '🍳 Cocinar',
  '🏃 Deportes', '🎨 Arte', '📸 Fotografía', '🎮 Videojuegos', '🧘 Yoga',
  '🏋️ Gym', '🎭 Teatro', '🍷 Vino', '☕ Café', '🌱 Naturaleza',
  '🐕 Mascotas', '🎤 Karaoke', '💃 Bailar', '🏖️ Playa', '⛰️ Montaña',
  '🍕 Comida', '🎪 Festivales', '🚴 Ciclismo', '🏊 Natación', '🎸 Música en vivo',
];

const PERSONALITY_TRAITS = [
  '😊 Optimista', '🤗 Empático', '🎉 Divertido', '🧠 Intelectual', '💪 Aventurero',
  '🎯 Ambicioso', '😌 Tranquilo', '🤝 Sociable', '💭 Creativo', '📖 Curioso',
  '❤️ Romántico', '😂 Gracioso', '🎭 Espontáneo', '🧘 Zen', '🔥 Apasionado',
  '🤓 Geek', '🌟 Carismático', '💼 Profesional', '🎨 Artístico', '🏆 Competitivo',
];

export default function InterestsScreen() {
  const router = useRouter();
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [selectedTraits, setSelectedTraits] = useState<string[]>([]);

  const toggleInterest = (interest: string) => {
    console.log('User toggled interest:', interest);
    if (selectedInterests.includes(interest)) {
      setSelectedInterests(selectedInterests.filter(i => i !== interest));
    } else {
      setSelectedInterests([...selectedInterests, interest]);
    }
  };

  const toggleTrait = (trait: string) => {
    console.log('User toggled personality trait:', trait);
    if (selectedTraits.includes(trait)) {
      setSelectedTraits(selectedTraits.filter(t => t !== trait));
    } else {
      setSelectedTraits([...selectedTraits, trait]);
    }
  };

  const handleContinue = async () => {
    if (selectedInterests.length < 3) {
      Alert.alert('Selecciona al menos 3 gustos', 'Necesitamos conocer tus intereses para encontrar personas compatibles.');
      return;
    }
    if (selectedTraits.length < 3) {
      Alert.alert('Selecciona al menos 3 rasgos', 'Necesitamos conocer tu personalidad para encontrar personas compatibles.');
      return;
    }

    console.log('User continuing with interests:', selectedInterests, 'and traits:', selectedTraits);
    
    // Save to AsyncStorage
    await AsyncStorage.setItem('onboarding_interests', JSON.stringify(selectedInterests));
    await AsyncStorage.setItem('onboarding_personality', JSON.stringify(selectedTraits));
    
    router.push('/onboarding/name');
  };

  const interestsCount = selectedInterests.length;
  const traitsCount = selectedTraits.length;
  const canContinue = interestsCount >= 3 && traitsCount >= 3;

  return (
    <LinearGradient
      colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
      style={styles.gradient}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.container}>
        <View style={styles.section}>
          <Text style={styles.mainTitle}>Cuéntanos sobre ti</Text>
          <Text style={styles.title}>¿Cuáles son tus gustos?</Text>
          <Text style={styles.subtitle}>Selecciona al menos 3</Text>
          <Text style={styles.counter}>{interestsCount} seleccionados</Text>
          
          <View style={styles.chipsContainer}>
            {INTERESTS.map((interest, index) => {
              const isSelected = selectedInterests.includes(interest);
              return (
                <TouchableOpacity
                  key={index}
                  style={[styles.chip, isSelected && styles.chipSelected]}
                  onPress={() => toggleInterest(interest)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                    {interest}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.title}>¿Cómo describirías tu personalidad?</Text>
          <Text style={styles.subtitle}>Selecciona al menos 3</Text>
          <Text style={styles.counter}>{traitsCount} seleccionados</Text>
          
          <View style={styles.chipsContainer}>
            {PERSONALITY_TRAITS.map((trait, index) => {
              const isSelected = selectedTraits.includes(trait);
              return (
                <TouchableOpacity
                  key={index}
                  style={[styles.chip, isSelected && styles.chipSelected]}
                  onPress={() => toggleTrait(trait)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                    {trait}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.continueButton, !canContinue && styles.continueButtonDisabled]}
          onPress={handleContinue}
          disabled={!canContinue}
          activeOpacity={0.8}
        >
          <Text style={styles.continueButtonText}>Continuar</Text>
        </TouchableOpacity>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  container: {
    padding: 24,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 40,
  },
  mainTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 24,
    textAlign: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: nospiColors.purpleDark,
    opacity: 0.8,
    marginBottom: 4,
  },
  counter: {
    fontSize: 14,
    color: nospiColors.purpleDark,
    opacity: 0.7,
    marginBottom: 16,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: nospiColors.purpleLight,
  },
  chipSelected: {
    backgroundColor: nospiColors.purpleDark,
    borderColor: nospiColors.purpleDark,
  },
  chipText: {
    color: nospiColors.purpleDark,
    fontSize: 14,
    fontWeight: '500',
  },
  chipTextSelected: {
    color: nospiColors.white,
    fontWeight: '600',
  },
  continueButton: {
    backgroundColor: nospiColors.purpleDark,
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  continueButtonDisabled: {
    backgroundColor: 'rgba(107, 33, 168, 0.4)',
    shadowOpacity: 0,
    elevation: 0,
  },
  continueButtonText: {
    color: nospiColors.white,
    fontSize: 18,
    fontWeight: '700',
  },
});
