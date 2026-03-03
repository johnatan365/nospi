
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { nospiColors } from '@/constants/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

// Country-specific phone validation rules
const PHONE_VALIDATION_RULES: Record<string, { length: number; startsWith: string[] }> = {
  '+57': { length: 10, startsWith: ['3'] }, // Colombia
  // Add more countries as needed
};

export default function PhoneScreen() {
  const router = useRouter();
  const [countryCode, setCountryCode] = useState('+57');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [country, setCountry] = useState('Colombia');
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    // Load country from previous onboarding step
    const loadCountry = async () => {
      try {
        const locationData = await AsyncStorage.getItem('onboarding_location');
        if (locationData) {
          const { country: savedCountry } = JSON.parse(locationData);
          setCountry(savedCountry);
          
          // Set country code based on country
          if (savedCountry === 'Colombia') {
            setCountryCode('+57');
          }
          // Add more country codes as needed
        }
      } catch (error) {
        console.error('Error loading country:', error);
      }
    };
    
    loadCountry();
  }, []);

  const validatePhoneNumber = (number: string): { valid: boolean; error?: string } => {
    console.log('Validating phone number:', number, 'for country code:', countryCode);
    
    // Remove any non-digit characters
    const cleanedNumber = number.replace(/\D/g, '');
    
    // Get validation rules for the country
    const rules = PHONE_VALIDATION_RULES[countryCode];
    
    if (!rules) {
      // If no specific rules, just check minimum length
      if (cleanedNumber.length < 7) {
        return { valid: false, error: 'El número de celular debe tener al menos 7 dígitos.' };
      }
      return { valid: true };
    }
    
    // Check length
    if (cleanedNumber.length !== rules.length) {
      return { 
        valid: false, 
        error: `El número de celular debe tener exactamente ${rules.length} dígitos.` 
      };
    }
    
    // Check starting digit(s)
    const startsWithValid = rules.startsWith.some(prefix => cleanedNumber.startsWith(prefix));
    if (!startsWithValid) {
      const countryName = country || 'este país';
      const validPrefixes = rules.startsWith.join(' o ');
      return { 
        valid: false, 
        error: `Para ${countryName}, el número de celular debe empezar con ${validPrefixes}.` 
      };
    }
    
    return { valid: true };
  };

  const checkPhoneExists = async (fullPhoneNumber: string): Promise<boolean> => {
    try {
      console.log('Checking if phone number exists:', fullPhoneNumber);
      
      const { data, error } = await supabase
        .from('users')
        .select('id, phone')
        .eq('phone', fullPhoneNumber)
        .maybeSingle();

      if (error) {
        console.error('Error checking phone number:', error);
        return false;
      }

      if (data) {
        console.log('Phone number already exists for user:', data.id);
        return true;
      }

      console.log('Phone number is available');
      return false;
    } catch (error) {
      console.error('Failed to check phone number:', error);
      return false;
    }
  };

  const handleContinue = async () => {
    console.log('User attempting to continue with phone:', countryCode, phoneNumber);
    
    const validation = validatePhoneNumber(phoneNumber);
    
    if (!validation.valid) {
      console.log('Validation failed:', validation.error);
      setErrorMessage(validation.error || 'Número de teléfono inválido');
      setShowErrorModal(true);
      return;
    }

    console.log('✅ Phone number validated successfully');
    
    // Check if phone number already exists
    setChecking(true);
    const fullPhoneNumber = countryCode + phoneNumber;
    const phoneExists = await checkPhoneExists(fullPhoneNumber);
    setChecking(false);

    if (phoneExists) {
      console.log('❌ Phone number already registered');
      setErrorMessage('Este número de celular ya está registrado. Por favor usa otro número o inicia sesión con tu cuenta existente.');
      setShowErrorModal(true);
      return;
    }

    console.log('✅ Phone number is available');
    
    await AsyncStorage.setItem('onboarding_phone', JSON.stringify({
      countryCode,
      phoneNumber: fullPhoneNumber,
    }));
    
    router.push('/onboarding/photo');
  };

  const canContinue = phoneNumber.trim().length >= 7 && !checking;

  return (
    <LinearGradient
      colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
      style={styles.gradient}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
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
              placeholderTextColor="rgba(107, 33, 168, 0.4)"
              keyboardType="phone-pad"
              maxLength={4}
            />
            
            <TextInput
              style={styles.phoneInput}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              placeholder="Número de celular"
              placeholderTextColor="rgba(107, 33, 168, 0.4)"
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
            <Text style={styles.continueButtonText}>
              {checking ? 'Verificando...' : 'Continuar'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Error Modal */}
      <Modal
        visible={showErrorModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowErrorModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>⚠️ Número Inválido</Text>
            <Text style={styles.modalMessage}>{errorMessage}</Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setShowErrorModal(false)}
            >
              <Text style={styles.modalButtonText}>Entendido</Text>
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
    color: nospiColors.purpleDark,
    marginBottom: 40,
    textAlign: 'center',
  },
  phoneContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  countryCodeInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderWidth: 2,
    borderColor: nospiColors.purpleLight,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 16,
    fontSize: 18,
    color: nospiColors.purpleDark,
    width: 80,
    textAlign: 'center',
  },
  phoneInput: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderWidth: 2,
    borderColor: nospiColors.purpleLight,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 20,
    fontSize: 18,
    color: nospiColors.purpleDark,
  },
  continueButton: {
    backgroundColor: nospiColors.purpleDark,
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
    backgroundColor: 'rgba(107, 33, 168, 0.4)',
    shadowOpacity: 0,
    elevation: 0,
  },
  continueButtonText: {
    color: nospiColors.white,
    fontSize: 18,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 16,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 24,
  },
  modalButton: {
    backgroundColor: nospiColors.purpleDark,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    width: '100%',
  },
  modalButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});
