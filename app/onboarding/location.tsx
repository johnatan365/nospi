
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Alert, ScrollView, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { nospiColors } from '@/constants/Colors';
import { Picker } from '@react-native-picker/picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [showCityPicker, setShowCityPicker] = useState(false);

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

  const handleContinue = async () => {
    if (!country || !city) {
      Alert.alert('Ubicación requerida', 'Por favor selecciona tu país y ciudad.');
      return;
    }

    console.log('User location confirmed:', country, city);
    
    // Save location to AsyncStorage
    await AsyncStorage.setItem('onboarding_country', country);
    await AsyncStorage.setItem('onboarding_city', city);
    
    router.push('/onboarding/compatibility');
  };

  const availableCities = CITIES_BY_COUNTRY[country] || [];

  return (
    <LinearGradient
      colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
      style={styles.gradient}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
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
            <TouchableOpacity 
              style={styles.selectedValueDisplay}
              onPress={() => setShowCountryPicker(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.selectedValueText}>{country}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.pickerContainer}>
            <Text style={styles.label}>Ciudad</Text>
            <TouchableOpacity 
              style={styles.selectedValueDisplay}
              onPress={() => setShowCityPicker(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.selectedValueText}>{city}</Text>
            </TouchableOpacity>
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

      {/* Country Picker Modal */}
      <Modal
        visible={showCountryPicker}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowCountryPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Selecciona tu país</Text>
              <TouchableOpacity 
                onPress={() => setShowCountryPicker(false)}
                style={styles.modalCloseButton}
              >
                <Text style={styles.modalCloseText}>Listo</Text>
              </TouchableOpacity>
            </View>
            <Picker
              selectedValue={country}
              onValueChange={(value) => {
                handleCountryChange(value);
                if (Platform.OS === 'android') {
                  setShowCountryPicker(false);
                }
              }}
              style={styles.modalPicker}
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
      </Modal>

      {/* City Picker Modal */}
      <Modal
        visible={showCityPicker}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowCityPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Selecciona tu ciudad</Text>
              <TouchableOpacity 
                onPress={() => setShowCityPicker(false)}
                style={styles.modalCloseButton}
              >
                <Text style={styles.modalCloseText}>Listo</Text>
              </TouchableOpacity>
            </View>
            <Picker
              selectedValue={city}
              onValueChange={(value) => {
                handleCityChange(value);
                if (Platform.OS === 'android') {
                  setShowCityPicker(false);
                }
              }}
              style={styles.modalPicker}
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
      </Modal>
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
    color: nospiColors.purpleDark,
    marginBottom: 40,
    textAlign: 'center',
  },
  pickerContainer: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    color: nospiColors.purpleDark,
    marginBottom: 8,
    fontWeight: '600',
  },
  selectedValueDisplay: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderWidth: 2,
    borderColor: nospiColors.purpleLight,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  selectedValueText: {
    fontSize: 20,
    color: nospiColors.purpleDark,
    fontWeight: '700',
    textAlign: 'center',
  },
  continueButton: {
    backgroundColor: nospiColors.purpleDark,
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
    color: nospiColors.white,
    fontSize: 18,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: nospiColors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: nospiColors.purpleDark,
  },
  modalCloseButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  modalCloseText: {
    fontSize: 16,
    fontWeight: '600',
    color: nospiColors.purpleMid,
  },
  modalPicker: {
    width: '100%',
    height: Platform.OS === 'ios' ? 200 : 50,
  },
});
