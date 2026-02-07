
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
    console.log('User selected country:', selectedCountry);
    setCountry(selectedCountry);
    const cities = CITIES_BY_COUNTRY[selectedCountry] || [];
    if (cities.length > 0) {
      setCity(cities[0]);
    }
  };

  const handleCityChange = (selectedCity: string) => {
    console.log('User selected city:', selectedCity);
    setCity(selectedCity);
  };

  const handleContinue = () => {
    if (!country || !city) {
      Alert.alert('Ubicación requerida', 'Por favor selecciona tu país y ciudad.');
      return;
    }

    console.log('User location confirmed:', country, city);
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
            <View style={styles.selectedValueDisplay}>
              <Text style={styles.selectedValueText}>{country}</Text>
            </View>
            <View style={styles.pickerWrapper}>
              <Picker
                selectedValue={country}
                onValueChange={handleCountryChange}
                style={styles.picker}
                dropdownIconColor={nospiColors.white}
              >
                {COUNTRIES.map((countryOption) => (
                  <Picker.Item 
                    key={countryOption} 
                    label={countryOption} 
                    value={countryOption}
                  />
                ))}
              </Picker>
            </View>
          </View>

          <View style={styles.pickerContainer}>
            <Text style={styles.label}>Ciudad</Text>
            <View style={styles.selectedValueDisplay}>
              <Text style={styles.selectedValueText}>{city}</Text>
            </View>
            <View style={styles.pickerWrapper}>
              <Picker
                selectedValue={city}
                onValueChange={handleCityChange}
                style={styles.picker}
                dropdownIconColor={nospiColors.white}
              >
                {availableCities.map((cityOption) => (
                  <Picker.Item 
                    key={cityOption} 
                    label={cityOption} 
                    value={cityOption}
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
    fontWeight: '600',
  },
  selectedValueDisplay: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  selectedValueText: {
    fontSize: 20,
    color: nospiColors.white,
    fontWeight: '700',
    textAlign: 'center',
  },
  pickerWrapper: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 16,
    overflow: 'hidden',
  },
  picker: {
    color: nospiColors.white,
    height: Platform.OS === 'ios' ? 180 : 50,
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
