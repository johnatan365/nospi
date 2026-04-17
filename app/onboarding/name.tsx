
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { nospiColors } from '@/constants/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function NameScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  const handleContinue = async () => {
    if (name.trim().length < 2) {
      Alert.alert('Nombre requerido', 'Por favor ingresa tu nombre.');
      return;
    }

    console.log('User entered name:', name);
    await AsyncStorage.setItem('onboarding_step', 'name');
    await AsyncStorage.setItem('onboarding_name', name);
    router.push('/onboarding/birthdate');
  };

  const canContinue = name.trim().length >= 2;

  return (
    <LinearGradient
      colors={['#1a0010', '#880E4F', '#AD1457']}
      style={styles.gradient}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <KeyboardAvoidingView 
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.content}>
          <Text style={styles.title}>¿Cómo te llamas?</Text>
          <Text style={styles.subtitle}>Así es como aparecerá en tu perfil</Text>
          
          <View style={[styles.inputWrapper, isFocused && styles.inputWrapperFocused]}>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Tu nombre"
              placeholderTextColor="rgba(136, 14, 79, 0.4)"
              autoFocus
              maxLength={50}
              selectionColor="#F06292"
              underlineColorAndroid="transparent"
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
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
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#FFFFFF',
    opacity: 0.8,
    marginBottom: 32,
  },
  inputWrapper: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.70)',
    borderRadius: 16,
    marginBottom: 24,
  },
  inputWrapperFocused: {
    borderColor: 'rgba(240, 98, 146, 0.50)',
  },
  input: {
    paddingVertical: 18,
    paddingHorizontal: 20,
    fontSize: 18,
    color: '#333',
    // Remove native iOS focus ring
    ...(({ outline: 'none' } as any)),
  },
  continueButton: {
    backgroundColor: '#880E4F',
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.50)',
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  continueButtonDisabled: {
    backgroundColor: 'rgba(136, 14, 79, 0.4)',
    borderColor: 'rgba(255, 255, 255, 0.20)',
    shadowOpacity: 0,
    elevation: 0,
  },
  continueButtonText: {
    color: nospiColors.white,
    fontSize: 18,
    fontWeight: '700',
  },
});
