
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Alert, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { nospiColors } from '@/constants/Colors';
import { Picker } from '@react-native-picker/picker';

const COUNTRIES = [
  'Colombia',
  'Argentina',
  'Brasil',
  'Chile',
  'Ecuador',
  'España',
  'Estados Unidos',
  'México',
  'Perú',
  'Venezuela',
];

const CITIES_BY_COUNTRY: { [key: string]: string[] } = {
  'Colombia': ['Medellín', 'Bogotá', 'Cali', 'Barranquilla', 'Cartagena', 'Bucaramanga', 'Pereira', 'Santa Marta'],
  'Argentina': ['Buenos Aires', 'Córdoba', 'Rosario', 'Mendoza', 'La Plata'],
  'Brasil': ['São Paulo', 'Rio de Janeiro', 'Brasília', 'Salvador', 'Fortaleza'],
  'Chile': ['Santiago', 'Valparaíso', 'Concepción', 'La Serena', 'Antofagasta'],
  'Ecuador': ['Quito', 'Guayaquil', 'Cuenca', 'Santo Domingo', 'Machala'],
  'España': ['Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Zaragoza'],
  'Estados Unidos': ['Nueva York', 'Los Ángeles', 'Chicago', 'Houston', 'Miami'],
  'México': ['Ciudad de México', 'Guadalajara', 'Monterrey', 'Puebla', 'Tijuana'],
  'Perú': ['Lima', 'Arequipa', 'Trujillo', 'Chiclayo', 'Cusco'],
  'Venezuela': ['Caracas', 'Maracaibo', 'Valencia', 'Barquisimeto', 'Maracay'],
};

export default function LocationScreen() {
  const router = useRouter();
  const [country, setCountry] = useState('Colombia');
  const [city, setCity] = useState('Medellín');

  const handleCountryChange = (selectedCountry: string) => {
    setCountry(selectedCountry);
    const cities = CITIES_BY_COUNTRY[selectedCountry] || [];
    if (cities.length > 0) {
      setCity(cities[0]);
    }
  };

  const handleContinue = () => {
    if (!country || !city) {
      Alert.alert('Ubicación requerida', 'Por favor selecciona tu país y ciudad.');
      return;
    }

    console.log('User selected location:', country, city);
    // TODO: Backend Integration - PUT /api/pre-registration with { country, city }
    router.push('/onboarding/compatibility');
  };

  const availableCities = CITIES_BY_COUNTRY[country] || [];

  return (
    <LinearGradient
      colors={[nospiColors.purpleDark, nospiColors.purpleMid, nospiColors.purpleLight]}
      style={styles.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          <Text style={styles.title}>¿En qué país y ciudad te encuentras?</Text>
          
          <View style={styles.pickerContainer}>
            <Text style={styles.label}>País</Text>
            <View style={styles.pickerWrapper}>
              <Picker
                selectedValue={country}
                onValueChange={handleCountryChange}
                style={styles.picker}
                dropdownIconColor={nospiColors.white}
                itemStyle={styles.pickerItem}
              >
                {COUNTRIES.map((countryOption) => (
                  <Picker.Item 
                    key={countryOption} 
                    label={countryOption} 
                    value={countryOption}
                    color={Platform.OS === 'ios' ? nospiColors.white : nospiColors.purpleDark}
                  />
                ))}
              </Picker>
            </View>
          </View>

          <View style={styles.pickerContainer}>
            <Text style={styles.label}>Ciudad</Text>
            <View style={styles.pickerWrapper}>
              <Picker
                selectedValue={city}
                onValueChange={setCity}
                style={styles.picker}
                dropdownIconColor={nospiColors.white}
                itemStyle={styles.pickerItem}
              >
                {availableCities.map((cityOption) => (
                  <Picker.Item 
                    key={cityOption} 
                    label={cityOption} 
                    value={cityOption}
                    color={Platform.OS === 'ios' ? nospiColors.white : nospiColors.purpleDark}
                  />
                ))}
              </Picker>
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
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  scrollView: {
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
    fontSize: 28,
    fontWeight: 'bold',
    color: nospiColors.white,
    marginBottom: 40,
    textAlign: 'center',
  },
  pickerContainer: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    color: nospiColors.white,
    marginBottom: 8,
    fontWeight: '500',
  },
  pickerWrapper: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 16,
    overflow: 'hidden',
  },
  picker: {
    color: nospiColors.white,
    height: Platform.OS === 'ios' ? 180 : 50,
  },
  pickerItem: {
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
  continueButtonText: {
    color: nospiColors.purpleDark,
    fontSize: 18,
    fontWeight: '700',
  },
});
