
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { nospiColors } from '@/constants/Colors';
import DateTimePicker from '@react-native-community/datetimepicker';

export default function BirthdateScreen() {
  const router = useRouter();
  const [date, setDate] = useState(new Date(2000, 0, 1));
  const [showPicker, setShowPicker] = useState(Platform.OS === 'ios');

  const calculateAge = (birthDate: Date) => {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const age = calculateAge(date);

  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowPicker(false);
    }
    if (selectedDate) {
      setDate(selectedDate);
    }
  };

  const handleContinue = () => {
    if (age < 18) {
      Alert.alert('Edad mínima', 'Debes tener al menos 18 años para usar Nospi.');
      return;
    }

    console.log('User entered birthdate:', date, 'Age:', age);
    // TODO: Backend Integration - PUT /api/pre-registration with { dateOfBirth, age }
    router.push('/onboarding/gender');
  };

  const canContinue = age >= 18;
  const ageText = age.toString();

  return (
    <LinearGradient
      colors={[nospiColors.purpleDark, nospiColors.purpleMid, nospiColors.purpleLight]}
      style={styles.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>¿Cuál es tu fecha de nacimiento?</Text>
          
          {Platform.OS === 'android' && !showPicker && (
            <TouchableOpacity 
              style={styles.dateButton}
              onPress={() => setShowPicker(true)}
            >
              <Text style={styles.dateButtonText}>
                {date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </Text>
            </TouchableOpacity>
          )}

          {showPicker && (
            <DateTimePicker
              value={date}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={handleDateChange}
              maximumDate={new Date()}
              minimumDate={new Date(1940, 0, 1)}
              textColor={nospiColors.white}
              style={styles.picker}
            />
          )}

          <View style={styles.ageContainer}>
            <Text style={styles.ageLabel}>Tu edad:</Text>
            <Text style={styles.ageValue}>{ageText}</Text>
          </View>

          <Text style={styles.note}>Tu perfil muestra tu edad, no tu fecha de nacimiento</Text>

          <TouchableOpacity
            style={[styles.continueButton, !canContinue && styles.continueButtonDisabled]}
            onPress={handleContinue}
            disabled={!canContinue}
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
    fontSize: 28,
    fontWeight: 'bold',
    color: nospiColors.white,
    marginBottom: 32,
  },
  dateButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 24,
  },
  dateButtonText: {
    fontSize: 20,
    color: nospiColors.white,
    fontWeight: '600',
  },
  picker: {
    marginBottom: 24,
  },
  ageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  ageLabel: {
    fontSize: 20,
    color: nospiColors.white,
    marginRight: 8,
  },
  ageValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: nospiColors.white,
  },
  note: {
    fontSize: 14,
    color: nospiColors.white,
    opacity: 0.8,
    textAlign: 'center',
    marginBottom: 32,
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
