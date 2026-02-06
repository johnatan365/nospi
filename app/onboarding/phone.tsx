
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { nospiColors } from '@/constants/Colors';

export default function PhoneScreen() {
  const router = useRouter();
  const [countryCode, setCountryCode] = useState('+57');
  const [phoneNumber, setPhoneNumber] = useState('');

  const handleContinue = () => {
    if (phoneNumber.trim().length < 7) {
      Alert.alert('Número requerido', 'Por favor ingresa un número de teléfono válido.');
      return;
    }

    console.log('User entered phone:', countryCode, phoneNumber);
    // TODO: Backend Integration - PUT /api/pre-registration with { phoneCountryCode, phoneNumber }
    router.push('/onboarding/photo');
  };

  const canContinue = phoneNumber.trim().length >= 7;

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
          <Text style={styles.title}>¿Cuál es tu número de celular?</Text>
          
          <View style={styles.phoneContainer}>
            <TextInput
              style={styles.countryCodeInput}
              value={countryCode}
              onChangeText={setCountryCode}
              placeholder="+57"
              placeholderTextColor="rgba(255, 255, 255, 0.5)"
              keyboardType="phone-pad"
              maxLength={4}
            />
            
            <TextInput
              style={styles.phoneInput}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              placeholder="Número de celular"
              placeholderTextColor="rgba(255, 255, 255, 0.5)"
              keyboardType="phone-pad"
              maxLength={15}
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
  phoneContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  countryCodeInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 16,
    fontSize: 18,
    color: nospiColors.white,
    width: 80,
    textAlign: 'center',
  },
  phoneInput: {
    flex: 1,
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
