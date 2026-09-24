import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Alert, ScrollView, Modal, TextInput, FlatList } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { nospiColors } from '@/constants/Colors';
import { Picker } from '@react-native-picker/picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { trackOnboardingStep } from '@/utils/onboardingTracker';
import {
  PAISES_NOSPI,
  CIUDADES_POR_PAIS,
  buscarCiudades,
  normalizarTexto,
} from '@/constants/Ciudades';
import { registrarCiudadNoEncontrada } from '@/utils/ciudadNoEncontrada';

const COUNTRIES = PAISES_NOSPI;

type OpcionCiudad = { nombre: string; detalle: string };

export default function LocationScreen() {
  const router = useRouter();
  const [country, setCountry] = useState('Colombia');
  // NO hay ciudad predeterminada a proposito: si el campo viene lleno, hay
  // gente que le da "siguiente, siguiente" y queda registrada en una ciudad
  // que no es la suya. Sin ciudad, el boton Continuar queda bloqueado.
  const [city, setCity] = useState('');
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  const handleCountryChange = (selectedCountry: string) => {
    console.log('User selected country:', selectedCountry);
    setCountry(selectedCountry);
    // Al cambiar de pais la ciudad anterior deja de tener sentido.
    setCity('');
    setBusqueda('');
  };

  const handleCityChange = (selectedCity: string) => {
    console.log('User selected city:', selectedCity);
    setCity(selectedCity);
    setShowCityPicker(false);
    setBusqueda('');
  };

  // En Colombia la lista son las 32 capitales, pero el buscador reconoce los
  // municipios: escribir "Envigado" lleva a Medellin, "Ipiales" a Pasto. Asi
  // nadie se queda sin encontrarse y nadie parte el grupo marcando su
  // municipio en vez de la ciudad donde de verdad pasan los planes.
  const opciones: OpcionCiudad[] = useMemo(() => {
    if (country === 'Colombia') {
      return buscarCiudades(busqueda).map((r) => ({
        nombre: r.ciudad.nombre,
        detalle: r.via ? `Incluye ${r.via}` : r.ciudad.departamento,
      }));
    }
    const q = normalizarTexto(busqueda);
    return (CIUDADES_POR_PAIS[country] || [])
      .filter((c) => !q || normalizarTexto(c).includes(q))
      .map((c) => ({ nombre: c, detalle: '' }));
  }, [country, busqueda]);

  // Si busco algo y no salio nada, guardamos lo que escribio: es el dato para
  // saber donde abrir. Se espera 1,2 s a que termine de escribir para no
  // guardar una fila por cada letra.
  useEffect(() => {
    if (!showCityPicker) return;
    if (opciones.length > 0) return;
    const texto = busqueda.trim();
    if (texto.length < 3) return;
    const t = setTimeout(() => { registrarCiudadNoEncontrada(texto, 'registro'); }, 1200);
    return () => clearTimeout(t);
  }, [busqueda, opciones.length, showCityPicker]);

  const handleContinue = async () => {
    if (!country || !city) {
      Alert.alert('Ubicación requerida', 'Por favor selecciona tu país y tu ciudad.');
      return;
    }

    console.log('User location confirmed:', country, city);

    await trackOnboardingStep('location');
    await AsyncStorage.setItem('onboarding_country', country);
    await AsyncStorage.setItem('onboarding_city', city);

    router.push('/onboarding/compatibility');
  };

  const puedeSeguir = !!city;

  return (
    <LinearGradient
      colors={['#1a0010', '#880E4F', '#AD1457']}
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
              style={[styles.selectedValueDisplay, !city && styles.selectedValueDisplayEmpty]}
              onPress={() => { setBusqueda(''); setShowCityPicker(true); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.selectedValueText, !city && styles.placeholderText]}>
                {city || 'Elige tu ciudad'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.hint}>
              Elige la ciudad más cercana a ti. Si tu municipio no aparece, escríbelo igual:
              te mostramos la ciudad a la que pertenece. La puedes cambiar después en tu perfil.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.continueButton, !puedeSeguir && styles.continueButtonDisabled]}
            onPress={handleContinue}
            activeOpacity={0.8}
            disabled={!puedeSeguir}
          >
            <Text style={[styles.continueButtonText, !puedeSeguir && styles.continueButtonTextDisabled]}>
              {puedeSeguir ? 'Continuar' : 'Elige tu ciudad para seguir'}
            </Text>
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
              color="#000000"
              dropdownIconColor="#000000"
            >
              {COUNTRIES.map((countryOption) => (
                <Picker.Item
                  key={countryOption}
                  label={countryOption}
                  value={countryOption}
                  color="#000000"
                />
              ))}
            </Picker>
          </View>
        </View>
      </Modal>

      {/* City Picker Modal — lista con buscador */}
      <Modal
        visible={showCityPicker}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowCityPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.modalContentCity]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Selecciona tu ciudad</Text>
              <TouchableOpacity
                onPress={() => setShowCityPicker(false)}
                style={styles.modalCloseButton}
              >
                <Text style={styles.modalCloseText}>Cerrar</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.searchWrapper}>
              <TextInput
                style={styles.searchInput}
                placeholder="Escribe tu ciudad o municipio"
                placeholderTextColor="#9CA3AF"
                value={busqueda}
                onChangeText={setBusqueda}
                autoCorrect={false}
                autoCapitalize="none"
              />
            </View>

            <FlatList
              data={opciones}
              keyExtractor={(item) => item.nombre}
              keyboardShouldPersistTaps="handled"
              style={styles.cityList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.cityRow, item.nombre === city && styles.cityRowSelected]}
                  onPress={() => handleCityChange(item.nombre)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.cityRowText, item.nombre === city && styles.cityRowTextSelected]}>
                    {item.nombre}
                  </Text>
                  {!!item.detalle && <Text style={styles.cityRowDetail}>{item.detalle}</Text>}
                </TouchableOpacity>
              )}
              ListEmptyComponent={(
                <View style={styles.emptyWrapper}>
                  <Text style={styles.emptyTitle}>No encontramos esa ciudad</Text>
                  <Text style={styles.emptyText}>
                    Revisa cómo la escribiste, o escoge la ciudad grande más cercana a ti.
                  </Text>
                </View>
              )}
            />
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
    color: '#FFFFFF',
    marginBottom: 40,
    textAlign: 'center',
  },
  pickerContainer: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 8,
    fontWeight: '600',
  },
  hint: {
    fontSize: 13,
    lineHeight: 19,
    color: 'rgba(255, 255, 255, 0.72)',
    marginTop: 10,
  },
  selectedValueDisplay: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderWidth: 2,
    borderColor: 'rgba(240, 98, 146, 0.50)',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  selectedValueDisplayEmpty: {
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  selectedValueText: {
    fontSize: 20,
    color: '#880E4F',
    fontWeight: '700',
    textAlign: 'center',
  },
  placeholderText: {
    color: '#9CA3AF',
    fontWeight: '600',
  },
  continueButton: {
    backgroundColor: '#880E4F',
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.50)',
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  continueButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderColor: 'rgba(255, 255, 255, 0.25)',
    shadowOpacity: 0,
    elevation: 0,
  },
  continueButtonText: {
    color: nospiColors.white,
    fontSize: 18,
    fontWeight: '700',
  },
  continueButtonTextDisabled: {
    color: 'rgba(255, 255, 255, 0.65)',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: Platform.OS === 'web' ? 'center' : Platform.OS === 'android' ? 'center' : 'flex-end',
    alignItems: Platform.OS === 'web' ? 'center' : 'stretch',
    paddingHorizontal: Platform.OS === 'android' ? 20 : Platform.OS === 'web' ? 20 : 0,
  },
  modalContent: {
    backgroundColor: nospiColors.white,
    borderRadius: 24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: Platform.OS === 'ios' ? 0 : 24,
    borderBottomRightRadius: Platform.OS === 'ios' ? 0 : 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    maxHeight: '70%',
    width: Platform.OS === 'web' ? '100%' : undefined,
    maxWidth: Platform.OS === 'web' ? 400 : undefined,
  },
  modalContentCity: {
    maxHeight: '80%',
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
  searchWrapper: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  searchInput: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
  },
  cityList: {
    paddingHorizontal: 10,
  },
  cityRow: {
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 12,
  },
  cityRowSelected: {
    backgroundColor: '#FCE4EC',
  },
  cityRowText: {
    fontSize: 17,
    color: '#111827',
    fontWeight: '500',
  },
  cityRowTextSelected: {
    fontWeight: '700',
  },
  cityRowDetail: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  emptyWrapper: {
    paddingHorizontal: 20,
    paddingVertical: 28,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#6B7280',
    marginTop: 6,
    textAlign: 'center',
  },
});
