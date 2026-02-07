
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { nospiColors } from '@/constants/Colors';
import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function BirthdateScreen() {
  const router = useRouter();
  const [date, setDate] = useState(new Date(2000, 0, 1));
  const [showPicker, setShowPicker] = useState(false);

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
      console.log('User selected birthdate:', selectedDate);
    }
  };

  const handleContinue = async () => {
    if (age < 18) {
      Alert.alert('Edad mínima', 'Debes tener al menos 18 años para usar Nospi.');
      return;
    }

    console.log('User entered birthdate:', date, 'Age:', age);
    
    await AsyncStorage.setItem('onboarding_birthdate', date.toISOString().split('T')[0]);
    await AsyncStorage.setItem('onboarding_age', age.toString());
    
    router.push('/onboarding/gender');
  };

  const canContinue = age >= 18;
  const ageText = age.toString();
  const formattedDate = date.toLocaleDateString('es-ES', { 
    day: '2-digit', 
    month: 'long', 
    year: 'numeric' 
  });

  return (
    <LinearGradient
      colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
      style={styles.gradient}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>¿Cuál es tu fecha de nacimiento?</Text>
          
          <TouchableOpacity 
            style={styles.dateDisplayContainer}
            onPress={() => setShowPicker(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.dateDisplayLabel}>Fecha seleccionada:</Text>
            <Text style={styles.dateDisplayValue}>{formattedDate}</Text>
          </TouchableOpacity>

          {showPicker && (
            <View style={styles.pickerContainer}>
              <DateTimePicker
                value={date}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={handleDateChange}
                maximumDate={new Date()}
                minimumDate={new Date(1940, 0, 1)}
                textColor={nospiColors.purpleDark}
                style={styles.picker}
              />
              {Platform.OS === 'ios' && (
                <TouchableOpacity 
                  style={styles.doneButton}
                  onPress={() => setShowPicker(false)}
                >
                  <Text style={styles.doneButtonText}>Listo</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <View style={styles.ageContainer}>
            <Text style={styles.ageLabel}>Tu edad:</Text>
            <Text style={styles.ageValue}>{ageText}</Text>
            <Text style={styles.ageYears}>años</Text>
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
    color: nospiColors.purpleDark,
    marginBottom: 32,
    textAlign: 'center',
  },
  dateDisplayContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderWidth: 2,
    borderColor: nospiColors.purpleLight,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 24,
  },
  dateDisplayLabel: {
    fontSize: 14,
    color: nospiColors.purpleDark,
    opacity: 0.8,
    marginBottom: 8,
  },
  dateDisplayValue: {
    fontSize: 22,
    color: nospiColors.purpleDark,
    fontWeight: '700',
  },
  pickerContainer: {
    marginBottom: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 16,
    overflow: 'hidden',
    paddingVertical: 8,
  },
  picker: {
    width: '100%',
  },
  doneButton: {
    backgroundColor: nospiColors.purpleDark,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  doneButtonText: {
    color: nospiColors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  ageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  ageLabel: {
    fontSize: 20,
    color: nospiColors.purpleDark,
    marginRight: 8,
  },
  ageValue: {
    fontSize: 40,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
  },
  ageYears: {
    fontSize: 20,
    color: nospiColors.purpleDark,
    marginLeft: 4,
  },
  note: {
    fontSize: 14,
    color: nospiColors.purpleDark,
    opacity: 0.7,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 20,
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
});
