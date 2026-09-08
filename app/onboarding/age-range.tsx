
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { nospiColors } from '@/constants/Colors';
import Slider from '@react-native-community/slider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { trackOnboardingStep } from '@/utils/onboardingTracker';
import { ANCHO_MINIMO_RANGO_EDAD, AYUDA_RANGO_EDAD } from '@/constants/Preferencias';


export default function AgeRangeScreen() {
  const router = useRouter();
  const [ageRange, setAgeRange] = useState({ min: 18, max: 35 });

  const handleContinue = async () => {
    console.log('User selected age range:', ageRange.min, '-', ageRange.max);
    
    await trackOnboardingStep('age_range');
    await AsyncStorage.setItem('onboarding_age_range', JSON.stringify({ min: ageRange.min, max: ageRange.max }));
    
    router.push('/onboarding/location');
  };

  // El rango no puede quedar mas angosto que ANCHO_MINIMO_RANGO_EDAD: en una
  // mesa de 6 personas un rango de 2 o 3 anios es imposible de cumplir. En vez
  // de bloquear el slider, se empuja el otro extremo.
  // El que se topa es el manejador que la persona esta arrastrando, no el otro.
  // Si se dejara correr el arrastrado y se empujara al otro contra el borde, el
  // rango se cerraria a 1 anio justo en los extremos — que es exactamente lo
  // que este minimo existe para impedir.
  const handleMinChange = (value: number) => {
    const newMin = Math.min(Math.max(Math.round(value), 18), 60 - ANCHO_MINIMO_RANGO_EDAD);
    setAgeRange({ min: newMin, max: Math.max(ageRange.max, newMin + ANCHO_MINIMO_RANGO_EDAD) });
  };

  const handleMaxChange = (value: number) => {
    const newMax = Math.max(Math.min(Math.round(value), 60), 18 + ANCHO_MINIMO_RANGO_EDAD);
    setAgeRange({ max: newMax, min: Math.min(ageRange.min, newMax - ANCHO_MINIMO_RANGO_EDAD) });
  };

  const minAgeText = ageRange.min.toString();
  const maxAgeText = ageRange.max.toString();
  const rangeText = `${minAgeText} - ${maxAgeText} años`;

  return (
    <LinearGradient
      colors={['#1a0010', '#880E4F', '#AD1457']}
      style={styles.gradient}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <View style={styles.container}>
        <View style={styles.content}>
          {/* La pregunta anterior era "¿Qué rango de edad te gustaría CONOCER?".
              Eso se lee como un filtro de emparejamiento, y por eso el 18% de la
              base se excluia a si misma del rango que pedia (alguien de 45
              pidiendo 28-35). Nospi no empareja: arma mesas. La pregunta ahora
              describe lo que de verdad se hace con el dato. */}
          <Text style={styles.title}>¿Con qué edades te sientes cómodo compartiendo mesa?</Text>
          <Text style={styles.subtitle}>{AYUDA_RANGO_EDAD}</Text>
          
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
                minimumTrackTintColor="#FFFFFF"
                maximumTrackTintColor="rgba(255, 255, 255, 0.35)"
                thumbTintColor="#FFFFFF"
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
                minimumTrackTintColor="#FFFFFF"
                maximumTrackTintColor="rgba(255, 255, 255, 0.35)"
                thumbTintColor="#FFFFFF"
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
    color: '#FFFFFF',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#FFFFFF',
    opacity: 0.8,
    marginBottom: 32,
    textAlign: 'center',
    lineHeight: 21,
  },
  rangeDisplay: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingVertical: 24,
    paddingHorizontal: 32,
    borderRadius: 20,
    alignItems: 'center',
    marginBottom: 40,
    borderWidth: 2,
    borderColor: 'rgba(240, 98, 146, 0.50)',
  },
  rangeText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#880E4F',
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
    color: '#FFFFFF',
    fontWeight: '600',
  },
  sliderValue: {
    fontSize: 20,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  slider: {
    width: '100%',
    height: 40,
  },
  continueButton: {
    backgroundColor: '#880E4F',
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.50)',
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  continueButtonText: {
    color: nospiColors.white,
    fontSize: 18,
    fontWeight: '700',
  },
});
