
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const HEADING = '#1a0010';
const MUTED = '#555555';
const ACCENT = '#880E4F';

export default function NameScreen() {
  const router = useRouter();
  const [name, setName] = useState('');

  const handleContinue = async () => {
    if (name.trim().length < 2) {
      Alert.alert('Nombre requerido', 'Por favor ingresa tu nombre.');
      return;
    }
    console.log('User entered name:', name);
    await AsyncStorage.setItem('onboarding_name', name);
    router.push('/onboarding/birthdate');
  };

  const canContinue = name.trim().length >= 2;

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.content}>
          <Text style={styles.title}>¿Cómo te llamas?</Text>
          <Text style={styles.subtitle}>Así es como aparecerá en tu perfil</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Tu nombre"
            placeholderTextColor="rgba(26, 0, 16, 0.4)"
            autoFocus
            maxLength={50}
          />
          <View style={[styles.buttonWrapper, !canContinue && styles.buttonDisabled]}>
            <LinearGradient colors={['#1a0010', '#880E4F', '#AD1457']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.buttonGradient}>
              <TouchableOpacity style={styles.buttonInner} onPress={handleContinue} disabled={!canContinue} activeOpacity={0.8}>
                <Text style={styles.buttonText}>Continuar</Text>
              </TouchableOpacity>
            </LinearGradient>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  content: { width: '100%', maxWidth: 400, alignSelf: 'center' },
  title: { fontSize: 32, fontWeight: 'bold', color: HEADING, marginBottom: 8 },
  subtitle: { fontSize: 16, color: MUTED, marginBottom: 32 },
  input: { backgroundColor: '#F9FAFB', borderWidth: 2, borderColor: '#E5E7EB', borderRadius: 16, paddingVertical: 18, paddingHorizontal: 20, fontSize: 18, color: HEADING, marginBottom: 24 },
  buttonWrapper: { borderRadius: 16, overflow: 'hidden' },
  buttonGradient: { borderRadius: 16 },
  buttonInner: { paddingVertical: 18, paddingHorizontal: 32, alignItems: 'center' },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
});
