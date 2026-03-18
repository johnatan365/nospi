
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const HEADING = '#1a0010';
const MUTED = '#555555';
const ACCENT = '#880E4F';

const INTERESTS = [
  '🎵 Música','🎬 Cine','📚 Lectura','✈️ Viajar','🍳 Cocinar',
  '🏃 Deportes','🎨 Arte','📸 Fotografía','🎮 Videojuegos','🧘 Yoga',
  '🏋️ Gym','🎭 Teatro','🍷 Vino','☕ Café','🌱 Naturaleza',
  '🐕 Mascotas','🎤 Karaoke','💃 Bailar','🏖️ Playa','⛰️ Montaña',
  '🍕 Comida','🎪 Festivales','🚴 Ciclismo','🏊 Natación','🎸 Música en vivo',
];

const PERSONALITY_TRAITS = [
  '😊 Optimista','🤗 Empático','🎉 Divertido','🧠 Intelectual','💪 Aventurero',
  '🎯 Ambicioso','😌 Tranquilo','🤝 Sociable','💭 Creativo','📖 Curioso',
  '❤️ Romántico','😂 Gracioso','🎭 Espontáneo','🧘 Zen','🔥 Apasionado',
  '🤓 Geek','🌟 Carismático','💼 Profesional','🎨 Artístico','🏆 Competitivo',
];

export default function InterestsScreen() {
  const router = useRouter();
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [selectedTraits, setSelectedTraits] = useState<string[]>([]);

  const toggleInterest = (interest: string) => {
    console.log('User toggled interest:', interest);
    setSelectedInterests(prev => prev.includes(interest) ? prev.filter(i => i !== interest) : [...prev, interest]);
  };

  const toggleTrait = (trait: string) => {
    console.log('User toggled personality trait:', trait);
    setSelectedTraits(prev => prev.includes(trait) ? prev.filter(t => t !== trait) : [...prev, trait]);
  };

  const handleContinue = async () => {
    if (selectedInterests.length < 3) { Alert.alert('Selecciona al menos 3 gustos', 'Necesitamos conocer tus intereses para encontrar personas compatibles.'); return; }
    if (selectedTraits.length < 3) { Alert.alert('Selecciona al menos 3 rasgos', 'Necesitamos conocer tu personalidad para encontrar personas compatibles.'); return; }
    console.log('User continuing with interests:', selectedInterests, 'and traits:', selectedTraits);
    await AsyncStorage.setItem('onboarding_interests', JSON.stringify(selectedInterests));
    await AsyncStorage.setItem('onboarding_personality', JSON.stringify(selectedTraits));
    router.push('/onboarding/name');
  };

  const interestsCount = selectedInterests.length;
  const traitsCount = selectedTraits.length;
  const canContinue = interestsCount >= 3 && traitsCount >= 3;

  return (
    <View style={styles.screen}>
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
                <TouchableOpacity key={index} style={[styles.chip, isSelected && styles.chipSelected]} onPress={() => toggleInterest(interest)} activeOpacity={0.7}>
                  <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{interest}</Text>
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
                <TouchableOpacity key={index} style={[styles.chip, isSelected && styles.chipSelected]} onPress={() => toggleTrait(trait)} activeOpacity={0.7}>
                  <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{trait}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={[styles.buttonWrapper, !canContinue && styles.buttonDisabled]}>
          <LinearGradient colors={['#1a0010', '#880E4F', '#AD1457']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.buttonGradient}>
            <TouchableOpacity style={styles.buttonInner} onPress={handleContinue} disabled={!canContinue} activeOpacity={0.8}>
              <Text style={styles.buttonText}>Continuar</Text>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  scrollView: { flex: 1 },
  container: { padding: 24, paddingBottom: 40 },
  section: { marginBottom: 40 },
  mainTitle: { fontSize: 32, fontWeight: 'bold', color: HEADING, marginBottom: 24, textAlign: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', color: HEADING, marginBottom: 8 },
  subtitle: { fontSize: 16, color: MUTED, marginBottom: 4 },
  counter: { fontSize: 14, color: MUTED, marginBottom: 16 },
  chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { backgroundColor: '#F9FAFB', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 20, borderWidth: 2, borderColor: '#E5E7EB' },
  chipSelected: { backgroundColor: ACCENT, borderColor: ACCENT },
  chipText: { color: HEADING, fontSize: 14, fontWeight: '500' },
  chipTextSelected: { color: '#FFFFFF', fontWeight: '600' },
  buttonWrapper: { borderRadius: 16, overflow: 'hidden', marginTop: 20 },
  buttonGradient: { borderRadius: 16 },
  buttonInner: { paddingVertical: 18, paddingHorizontal: 32, alignItems: 'center' },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
});
