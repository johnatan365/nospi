
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, ActivityIndicator, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { nospiColors } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function RegisterScreen() {
  const router = useRouter();
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAppleSignUp = () => {
    console.log('User tapped Sign up with Apple');
    // TODO: Implement Apple Sign In with OAuth
  };

  const handleGoogleSignUp = () => {
    console.log('User tapped Sign up with Google');
    // TODO: Implement Google Sign In with OAuth
  };

  const handleEmailSignUp = () => {
    console.log('User tapped Sign up with Email');
    setShowEmailForm(true);
  };

  const handleRegister = async () => {
    if (!email || !password || !confirmPassword) {
      setError('Por favor completa todos los campos');
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setLoading(true);
    setError('');
    console.log('User registering with email:', email);

    try {
      // Get all onboarding data from AsyncStorage
      const interestsData = await AsyncStorage.getItem('onboarding_interests');
      const personalityData = await AsyncStorage.getItem('onboarding_personality');
      const nameData = await AsyncStorage.getItem('onboarding_name');
      const birthdateData = await AsyncStorage.getItem('onboarding_birthdate');
      const ageData = await AsyncStorage.getItem('onboarding_age');
      const genderData = await AsyncStorage.getItem('onboarding_gender');
      const interestedInData = await AsyncStorage.getItem('onboarding_interested_in');
      const ageRangeData = await AsyncStorage.getItem('onboarding_age_range');
      const countryData = await AsyncStorage.getItem('onboarding_country');
      const cityData = await AsyncStorage.getItem('onboarding_city');
      const phoneData = await AsyncStorage.getItem('onboarding_phone');
      const photoData = await AsyncStorage.getItem('onboarding_photo');
      const compatibilityData = await AsyncStorage.getItem('onboarding_compatibility');

      const interests = interestsData ? JSON.parse(interestsData) : [];
      const personality = personalityData ? JSON.parse(personalityData) : [];
      const name = nameData || '';
      const birthdate = birthdateData || '';
      const age = ageData ? parseInt(ageData) : 18;
      const gender = genderData || 'hombre';
      const interestedIn = interestedInData || 'ambos';
      const ageRange = ageRangeData ? JSON.parse(ageRangeData) : { min: 18, max: 60 };
      const country = countryData || 'Colombia';
      const city = cityData || 'Medellín';
      const phone = phoneData || '';
      const photo = photoData || null;
      const compatibility = compatibilityData ? parseInt(compatibilityData) : 95;

      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) {
        console.error('Auth registration error:', authError);
        setError(authError.message);
        return;
      }

      console.log('Auth user created:', authData.user?.id);

      // Create user profile in users table
      const { error: profileError } = await supabase
        .from('users')
        .insert({
          id: authData.user?.id,
          email,
          name,
          birthdate,
          age,
          gender,
          interested_in: interestedIn,
          age_range_min: ageRange.min,
          age_range_max: ageRange.max,
          country,
          city,
          phone,
          profile_photo_url: photo,
          interests,
          personality_traits: personality,
          compatibility_percentage: compatibility,
          notification_preferences: {
            whatsapp: false,
            email: true,
            sms: false,
            push: true,
          },
        });

      if (profileError) {
        console.error('Profile creation error:', profileError);
        setError('Error al crear el perfil');
        return;
      }

      console.log('User profile created successfully');

      // Clear onboarding data
      await AsyncStorage.multiRemove([
        'onboarding_interests',
        'onboarding_personality',
        'onboarding_name',
        'onboarding_birthdate',
        'onboarding_age',
        'onboarding_gender',
        'onboarding_interested_in',
        'onboarding_age_range',
        'onboarding_country',
        'onboarding_city',
        'onboarding_phone',
        'onboarding_photo',
        'onboarding_compatibility',
      ]);

      // Navigate to events screen
      router.replace('/(tabs)/events');
    } catch (error) {
      console.error('Registration failed:', error);
      setError('Error al registrarse. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const appleIcon = '\uF8FF';
  const googleIcon = 'G';

  return (
    <LinearGradient
      colors={[nospiColors.purpleDark, nospiColors.purpleMid, nospiColors.purpleLight]}
      style={styles.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>¡Ya casi estás listo!</Text>
          <Text style={styles.subtitle}>Elige cómo quieres registrarte</Text>
          
          <View style={styles.buttonContainer}>
            <TouchableOpacity 
              style={styles.buttonWhite}
              onPress={handleAppleSignUp}
              activeOpacity={0.8}
            >
              <Text style={styles.appleIcon}>{appleIcon}</Text>
              <Text style={styles.buttonTextDark}>Regístrate con Apple</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.buttonWhite}
              onPress={handleGoogleSignUp}
              activeOpacity={0.8}
            >
              <Text style={styles.googleIcon}>{googleIcon}</Text>
              <Text style={styles.buttonTextDark}>Regístrate con Google</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.buttonDark}
              onPress={handleEmailSignUp}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonTextLight}>Inscribirse con el correo electrónico</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.termsText}>
            Al registrarte, aceptas nuestros Términos de Servicio y Política de Privacidad
          </Text>
        </View>
      </ScrollView>

      <Modal
        visible={showEmailForm}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEmailForm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Registro con Email</Text>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#999"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TextInput
              style={styles.input}
              placeholder="Contraseña"
              placeholderTextColor="#999"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TextInput
              style={styles.input}
              placeholder="Confirmar Contraseña"
              placeholderTextColor="#999"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TouchableOpacity
              style={[styles.registerButton, loading && styles.registerButtonDisabled]}
              onPress={handleRegister}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color={nospiColors.white} />
              ) : (
                <Text style={styles.registerButtonText}>Registrarse</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowEmailForm(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
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
    color: nospiColors.white,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: nospiColors.white,
    opacity: 0.9,
    marginBottom: 40,
    textAlign: 'center',
  },
  buttonContainer: {
    gap: 16,
    marginBottom: 32,
  },
  buttonWhite: {
    backgroundColor: nospiColors.white,
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonDark: {
    backgroundColor: '#2C2C2E',
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  appleIcon: {
    fontSize: 20,
    marginRight: 12,
    color: '#000000',
    fontWeight: 'bold',
  },
  googleIcon: {
    fontSize: 20,
    marginRight: 12,
    color: '#000000',
    fontWeight: 'bold',
  },
  buttonTextDark: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonTextLight: {
    color: nospiColors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  termsText: {
    fontSize: 12,
    color: nospiColors.white,
    opacity: 0.8,
    textAlign: 'center',
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: nospiColors.white,
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 24,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#F44336',
    backgroundColor: '#FFEBEE',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#F5F5F5',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
    fontSize: 16,
    color: '#333',
    marginBottom: 16,
  },
  registerButton: {
    backgroundColor: nospiColors.purpleDark,
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  registerButtonDisabled: {
    backgroundColor: nospiColors.purpleMid,
    opacity: 0.6,
  },
  registerButtonText: {
    color: nospiColors.white,
    fontSize: 18,
    fontWeight: '700',
  },
  cancelButton: {
    backgroundColor: '#E0E0E0',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
  },
});
