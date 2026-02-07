
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { nospiColors } from '@/constants/Colors';
import Slider from '@react-native-community/slider';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function AgeRangeScreen() {
  const router = useRouter();
  const [minAge, setMinAge] = useState(18);
  const [maxAge, setMaxAge] = useState(35);

  const handleContinue = async () => {
    console.log('User selected age range:', minAge, '-', maxAge);
    
    // Save age range to AsyncStorage
    await AsyncStorage.setItem('onboarding_age_range', JSON.stringify({ min: minAge, max: maxAge }));
    
    router.push('/onboarding/location');
  };

  const minAgeText = minAge.toString();
  const maxAgeText = maxAge.toString();

  return (
    <LinearGradient
      colors={[nospiColors.purpleDark, nospiColors.purpleMid, nospiColors.purpleLight]}
      style={styles.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>¿Qué rango de edad te gustaría conocer en los encuentros grupales?</Text>
          
          <View style={styles.rangeDisplay}>
            <View style={styles.ageBox}>
              <Text style={styles.ageLabel}>Mínimo</Text>
              <Text style={styles.ageValue}>{minAgeText}</Text>
            </View>
            <Text style={styles.separator}>-</Text>
            <View style={styles.ageBox}>
              <Text style={styles.ageLabel}>Máximo</Text>
              <Text style={styles.ageValue}>{maxAgeText}</Text>
            </View>
          </View>

          <View style={styles.sliderContainer}>
            <Text style={styles.sliderLabel}>Edad mínima</Text>
            <Slider
              style={styles.slider}
              minimumValue={18}
              maximumValue={60}
              step={1}
              value={minAge}
              onValueChange={setMinAge}
              minimumTrackTintColor={nospiColors.white}
              maximumTrackTintColor="rgba(255, 255, 255, 0.3)"
              thumbTintColor={nospiColors.white}
            />
          </View>

          <View style={styles.sliderContainer}>
            <Text style={styles.sliderLabel}>Edad máxima</Text>
            <Slider
              style={styles.slider}
              minimumValue={18}
              maximumValue={60}
              step={1}
              value={maxAge}
              onValueChange={setMaxAge}
              minimumTrackTintColor={nospiColors.white}
              maximumTrackTintColor="rgba(255, 255, 255, 0.3)"
              thumbTintColor={nospiColors.white}
            />
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
    color: nospiColors.white,
    marginBottom: 40,
    textAlign: 'center',
  },
  rangeDisplay: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  ageBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    alignItems: 'center',
    minWidth: 100,
  },
  ageLabel: {
    fontSize: 14,
    color: nospiColors.white,
    opacity: 0.8,
    marginBottom: 4,
  },
  ageValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: nospiColors.white,
  },
  separator: {
    fontSize: 32,
    color: nospiColors.white,
    marginHorizontal: 16,
  },
  sliderContainer: {
    marginBottom: 32,
  },
  sliderLabel: {
    fontSize: 16,
    color: nospiColors.white,
    marginBottom: 8,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  continueButton: {
    backgroundColor: nospiColors.white,
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
    color: nospiColors.purpleDark,
    fontSize: 18,
    fontWeight: '700',
  },
});
