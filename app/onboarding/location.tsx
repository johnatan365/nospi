
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { nospiColors } from '@/constants/Colors';

export default function LocationScreen() {
  const router = useRouter();
  const [country, setCountry] = useState('Colombia');
  const [city, setCity] = useState('');

  const handleContinue = () => {
    if (country.trim().length < 2 || city.trim().length < 2) {
      Alert.alert('Ubicación requerida', 'Por favor ingresa tu país y ciudad.');
      return;
    }

    console.log('User entered location:', country, city);
    // TODO: Backend Integration - PUT /api/pre-registration with { country, city }
    router.push('/onboarding/compatibility');
  };

  const canContinue = country.trim().length >= 2 && city.trim().length >= 2;

  return (
    <LinearGradient
      colors={[nospiColors.purpleDark, nospiColors.purpleMid, nospiColors.purpleLight]}
      style={styles.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <KeyboardAvoidingView 
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.content}>
          <Text style={styles.title}>¿En qué país y ciudad te encuentras?</Text>
          
          <View style={styles.inputContainer}>
            <Text style={styles.label}>País</Text>
            <TextInput
              style={styles.input}
              value={country}
              onChangeText={setCountry}
              placeholder="País"
              placeholderTextColor="rgba(255, 255, 255, 0.5)"
              maxLength={50}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Ciudad</Text>
            <TextInput
              style={styles.input}
              value={city}
              onChangeText={setCity}
              placeholder="Ciudad"
              placeholderTextColor="rgba(255, 255, 255, 0.5)"
              maxLength={50}
            />
          </View>

          <TouchableOpacity
            style={[styles.continueButton, !canContinue && styles.continueButtonDisabled]}
            onPress={handleContinue}
            disabled={!canContinue}
            activeOpacity={0.8}
          >
            <Text style={styles.continueButtonText}>Continuar</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  inputContainer: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    color: nospiColors.white,
    marginBottom: 8,
    fontWeight: '500',
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 20,
    fontSize: 18,
    color: nospiColors.white,
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
  continueButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    shadowOpacity: 0,
    elevation: 0,
  },
  continueButtonText: {
    color: nospiColors.purpleDark,
    fontSize: 18,
    fontWeight: '700',
  },
});
