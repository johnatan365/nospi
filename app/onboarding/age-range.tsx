
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { nospiColors } from '@/constants/Colors';
import Slider from '@react-native-community/slider';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function AgeRangeScreen() {
  const router = useRouter();
  const [ageRange, setAgeRange] = useState({ min: 18, max: 35 });

  const handleContinue = async () => {
    console.log('User selected age range:', ageRange.min, '-', ageRange.max);
    
    await AsyncStorage.setItem('onboarding_age_range', JSON.stringify({ min: ageRange.min, max: ageRange.max }));
    
    router.push('/onboarding/location');
  };

  const handleMinChange = (value: number) => {
    const newMin = Math.round(value);
    if (newMin < ageRange.max) {
      setAgeRange({ ...ageRange, min: newMin });
    }
  };

  const handleMaxChange = (value: number) => {
    const newMax = Math.round(value);
    if (newMax > ageRange.min) {
      setAgeRange({ ...ageRange, max: newMax });
    }
  };

  const minAgeText = ageRange.min.toString();
  const maxAgeText = ageRange.max.toString();
  const rangeText = `${minAgeText} - ${maxAgeText} años`;

  return (
    <LinearGradient
      colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
      style={styles.gradient}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>¿Qué rango de edad te gustaría conocer en los encuentros grupales?</Text>
          
          <View style={styles.rangeDisplay}>
            <Text style={styles.rangeText}>{rangeText}</Text>
          </View>

          <View style={styles.sliderSection}>
            <View style={styles.sliderRow}>
              <View style={styles.sliderLabelContainer}>
                <Text style={styles.sliderLabel}>Mínimo</Text>
                <Text style={styles.sliderValue}>{minAgeText}</Text>
              </View>
              <Slider
                style={styles.slider}
                minimumValue={18}
                maximumValue={59}
                step={1}
                value={ageRange.min}
                onValueChange={handleMinChange}
                minimumTrackTintColor={nospiColors.purpleDark}
                maximumTrackTintColor="rgba(107, 33, 168, 0.2)"
                thumbTintColor={nospiColors.purpleDark}
              />
            </View>

            <View style={styles.sliderRow}>
              <View style={styles.sliderLabelContainer}>
                <Text style={styles.sliderLabel}>Máximo</Text>
                <Text style={styles.sliderValue}>{maxAgeText}</Text>
              </View>
              <Slider
                style={styles.slider}
                minimumValue={19}
                maximumValue={60}
                step={1}
                value={ageRange.max}
                onValueChange={handleMaxChange}
                minimumTrackTintColor={nospiColors.purpleDark}
                maximumTrackTintColor="rgba(107, 33, 168, 0.2)"
                thumbTintColor={nospiColors.purpleDark}
              />
            </View>
          </View>

          <TouchableOpacity
            style={styles.continueButton}
            onPress={handleContinue}
            activeOpacity={0.8}
          >
            <Text style={styles.continueButtonText}>Continuar</Text>
          </TouchableOpacity>
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
    fontSize: 26,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 40,
    textAlign: 'center',
  },
  rangeDisplay: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingVertical: 24,
    paddingHorizontal: 32,
    borderRadius: 20,
    alignItems: 'center',
    marginBottom: 40,
    borderWidth: 2,
    borderColor: nospiColors.purpleLight,
  },
  rangeText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
  },
  sliderSection: {
    marginBottom: 32,
  },
  sliderRow: {
    marginBottom: 24,
  },
  sliderLabelContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sliderLabel: {
    fontSize: 16,
    color: nospiColors.purpleDark,
    fontWeight: '600',
  },
  sliderValue: {
    fontSize: 20,
    color: nospiColors.purpleDark,
    fontWeight: 'bold',
  },
  slider: {
    width: '100%',
    height: 40,
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
  continueButtonText: {
    color: nospiColors.white,
    fontSize: 18,
    fontWeight: '700',
  },
});
