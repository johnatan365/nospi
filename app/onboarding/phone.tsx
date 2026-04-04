import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Modal, FlatList, SafeAreaView, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { nospiColors } from '@/constants/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

// ── Country data ──────────────────────────────────────────────────────────────
const COUNTRIES = [
  { name: 'Colombia',        code: '+57',  flag: '🇨🇴', digits: 10, starts: ['3'] },
  { name: 'Argentina',       code: '+54',  flag: '🇦🇷', digits: 10, starts: ['1','2','3','4','9'] },
  { name: 'Bolivia',         code: '+591', flag: '🇧🇴', digits: 8,  starts: ['6','7'] },
  { name: 'Brasil',          code: '+55',  flag: '🇧🇷', digits: 11, starts: ['1','2','3','4','5','6','7','8','9'] },
  { name: 'Canadá',          code: '+1',   flag: '🇨🇦', digits: 10, starts: ['2','3','4','5','6','7','8','9'] },
  { name: 'Chile',           code: '+56',  flag: '🇨🇱', digits: 9,  starts: ['9'] },
  { name: 'Costa Rica',      code: '+506', flag: '🇨🇷', digits: 8,  starts: ['6','7','8'] },
  { name: 'Cuba',            code: '+53',  flag: '🇨🇺', digits: 8,  starts: ['5'] },
  { name: 'Ecuador',         code: '+593', flag: '🇪🇨', digits: 9,  starts: ['9'] },
  { name: 'El Salvador',     code: '+503', flag: '🇸🇻', digits: 8,  starts: ['6','7'] },
  { name: 'España',          code: '+34',  flag: '🇪🇸', digits: 9,  starts: ['6','7'] },
  { name: 'Estados Unidos',  code: '+1',   flag: '🇺🇸', digits: 10, starts: ['2','3','4','5','6','7','8','9'] },
  { name: 'Guatemala',       code: '+502', flag: '🇬🇹', digits: 8,  starts: ['3','4','5'] },
  { name: 'Honduras',        code: '+504', flag: '🇭🇳', digits: 8,  starts: ['3','8','9'] },
  { name: 'México',          code: '+52',  flag: '🇲🇽', digits: 10, starts: ['1','2','3','4','5','6','7','8','9'] },
  { name: 'Nicaragua',       code: '+505', flag: '🇳🇮', digits: 8,  starts: ['8'] },
  { name: 'Panamá',          code: '+507', flag: '🇵🇦', digits: 8,  starts: ['6'] },
  { name: 'Paraguay',        code: '+595', flag: '🇵🇾', digits: 9,  starts: ['9'] },
  { name: 'Perú',            code: '+51',  flag: '🇵🇪', digits: 9,  starts: ['9'] },
  { name: 'Puerto Rico',     code: '+1',   flag: '🇵🇷', digits: 10, starts: ['7'] },
  { name: 'Rep. Dominicana', code: '+1',   flag: '🇩🇴', digits: 10, starts: ['8','9'] },
  { name: 'Uruguay',         code: '+598', flag: '🇺🇾', digits: 9,  starts: ['9'] },
  { name: 'Venezuela',       code: '+58',  flag: '🇻🇪', digits: 10, starts: ['4'] },
];

const DEFAULT_COUNTRY = COUNTRIES[0]; // Colombia

export default function PhoneScreen() {
  const router = useRouter();
  const [selectedCountry, setSelectedCountry] = useState(DEFAULT_COUNTRY);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showCountryModal, setShowCountryModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [checking, setChecking] = useState(false);
  const [search, setSearch] = useState('');
  const [isPhoneFocused, setIsPhoneFocused] = useState(false);

  const filteredCountries = COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.code.includes(search)
  );

  const cleanNumber = phoneNumber.replace(/\D/g, '');

  const canContinue = cleanNumber.length === selectedCountry.digits && !checking;

  const hintText = `${selectedCountry.digits} dígitos requeridos · ${cleanNumber.length}/${selectedCountry.digits}`;

  const checkPhoneExists = async (full: string): Promise<boolean> => {
    try {
      console.log('[PhoneScreen] Checking phone availability for:', full);
      const withoutPlus = full.replace('+', '');
      const digitsOnly = full.replace(/^\+\d{2,3}/, '');
      const { data, error } = await supabase
        .from('users')
        .select('id')
        .or('phone.eq.' + full + ',phone.eq.' + withoutPlus + ',phone.eq.' + digitsOnly)
        .maybeSingle();
      if (error) { console.error('[PhoneScreen] Phone check error:', error); return false; }
      console.log('[PhoneScreen] Phone check result — taken:', !!data);
      return !!data;
    } catch (err) {
      console.error('[PhoneScreen] Phone check network error:', err);
      return false;
    }
  };

  const handleContinue = async () => {
    console.log('[PhoneScreen] User tapped Continuar, number:', cleanNumber, 'country:', selectedCountry.code);

    // Validate prefix
    const startsOk = selectedCountry.starts.some(p => cleanNumber.startsWith(p));
    if (!startsOk) {
      console.log('[PhoneScreen] Invalid prefix for country:', selectedCountry.name);
      setErrorMessage(`Para ${selectedCountry.name} el número debe empezar con ${selectedCountry.starts.join(' o ')}.`);
      setShowErrorModal(true);
      return;
    }

    setChecking(true);
    const full = selectedCountry.code + cleanNumber;
    let exists = false;
    try {
      exists = await checkPhoneExists(full);
    } catch (err) {
      console.error('[PhoneScreen] Unexpected error during phone check:', err);
      // On network error, allow proceeding
    }
    setChecking(false);

    if (exists) {
      console.log('[PhoneScreen] Phone already taken, showing modal');
      setErrorMessage('Este número ya está registrado. Usa otro número o inicia sesión con tu cuenta existente.');
      setShowErrorModal(true);
      return;
    }

    console.log('[PhoneScreen] Phone available, saving and navigating');
    await AsyncStorage.setItem('onboarding_phone', JSON.stringify({
      countryCode: selectedCountry.code,
      phoneNumber: full,
    }));

    router.push('/onboarding/photo');
  };

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
          <Text style={styles.title}>¿Cuál es tu número de celular?</Text>

          <View style={styles.phoneRow}>
            {/* Country selector button */}
            <TouchableOpacity
              style={styles.countryButton}
              onPress={() => { console.log('[PhoneScreen] User tapped country selector'); setShowCountryModal(true); }}
              activeOpacity={0.75}
            >
              <Text style={styles.countryFlag}>{selectedCountry.flag}</Text>
              <Text style={styles.countryCode}>{selectedCountry.code}</Text>
              <Text style={styles.chevron}>▾</Text>
            </TouchableOpacity>

            {/* Phone number input */}
            <TextInput
              style={[styles.phoneInput, isPhoneFocused && styles.phoneInputFocused]}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              placeholder="Número de celular"
              placeholderTextColor="rgba(136, 14, 79, 0.4)"
              keyboardType="phone-pad"
              maxLength={selectedCountry.digits + 2}
              selectionColor="#880E4F"
              underlineColorAndroid="transparent"
              onFocus={() => setIsPhoneFocused(true)}
              onBlur={() => setIsPhoneFocused(false)}
            />
          </View>

          <Text style={styles.hint}>{hintText}</Text>

          <TouchableOpacity
            style={[styles.continueButton, !canContinue && styles.continueButtonDisabled]}
            onPress={handleContinue}
            disabled={!canContinue}
            activeOpacity={0.8}
          >
            {checking ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.continueButtonText}>Continuar</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* ── Country picker modal ── */}
      <Modal
        visible={showCountryModal}
        animationType="slide"
        onRequestClose={() => setShowCountryModal(false)}
      >
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Selecciona tu país</Text>
            <TouchableOpacity onPress={() => { setShowCountryModal(false); setSearch(''); }}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar país o código..."
            placeholderTextColor="#999"
            autoCorrect={false}
          />

          <FlatList
            data={filteredCountries}
            keyExtractor={(_, i) => String(i)}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.countryRow,
                  item.name === selectedCountry.name && item.code === selectedCountry.code && styles.countryRowSelected,
                ]}
                onPress={() => {
                  console.log('[PhoneScreen] User selected country:', item.name, item.code);
                  setSelectedCountry(item);
                  setPhoneNumber('');
                  setShowCountryModal(false);
                  setSearch('');
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.rowFlag}>{item.flag}</Text>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowCode}>{item.code}</Text>
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        </SafeAreaView>
      </Modal>

      {/* ── Error / taken modal ── */}
      <Modal
        visible={showErrorModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowErrorModal(false)}
      >
        <View style={styles.errorOverlay}>
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>⚠️ Número Inválido</Text>
            <Text style={styles.errorMsg}>{errorMessage}</Text>
            <TouchableOpacity
              style={styles.errorBtn}
              onPress={() => { console.log('[PhoneScreen] User dismissed error modal'); setShowErrorModal(false); }}
            >
              <Text style={styles.errorBtnText}>Entendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  content: { width: '100%', maxWidth: 400, alignSelf: 'center', overflow: 'hidden' },
  title: {
    fontSize: 28, fontWeight: 'bold', color: '#FFFFFF',
    marginBottom: 32, textAlign: 'center',
  },

  // Phone row
  phoneRow: { flexDirection: 'row', gap: 8, marginBottom: 8, width: '100%', overflow: 'hidden' },
  countryButton: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 2, borderColor: 'rgba(240, 98, 146, 0.50)',
    borderRadius: 16, paddingVertical: 18, paddingHorizontal: 10,
    gap: 4, flexShrink: 0,
  },
  countryFlag: { fontSize: 22 },
  countryCode: { fontSize: 16, color: nospiColors.purpleDark, fontWeight: '700' },
  chevron: { fontSize: 12, color: nospiColors.purpleDark, marginLeft: 2 },
  phoneInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 2, borderColor: 'rgba(240, 98, 146, 0.50)',
    borderRadius: 16, paddingVertical: 18, paddingHorizontal: 14,
    fontSize: 18, color: '#333', minWidth: 0,
  },
  phoneInputFocused: {
    borderColor: 'rgba(240, 98, 146, 0.80)',
  },

  hint: { fontSize: 13, color: '#FFFFFF', opacity: 0.7, marginBottom: 24, textAlign: 'center' },

  // Continue button
  continueButton: {
    backgroundColor: '#880E4F', paddingVertical: 18,
    borderRadius: 30, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 5,
    borderWidth: 1.5, borderColor: 'rgba(255, 255, 255, 0.50)',
  },
  continueButtonDisabled: { backgroundColor: 'rgba(136, 14, 79, 0.4)', shadowOpacity: 0, elevation: 0, borderColor: 'rgba(255, 255, 255, 0.20)' },
  continueButtonText: { color: '#fff', fontSize: 18, fontWeight: '700' },

  // Country modal
  modalSafe: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: nospiColors.purpleDark },
  modalClose: { fontSize: 20, color: nospiColors.purpleDark, padding: 4 },
  searchInput: {
    margin: 16, borderWidth: 1.5, borderColor: 'rgba(240, 98, 146, 0.40)',
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 16, color: '#333',
  },
  countryRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14, gap: 12,
  },
  countryRowSelected: { backgroundColor: 'rgba(136, 14, 79, 0.08)' },
  rowFlag: { fontSize: 26 },
  rowName: { flex: 1, fontSize: 16, color: '#222' },
  rowCode: { fontSize: 15, color: nospiColors.purpleDark, fontWeight: '600' },
  separator: { height: 1, backgroundColor: '#f0f0f0', marginLeft: 58 },

  // Error modal
  errorOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  errorCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 24,
    width: '100%', maxWidth: 400, alignItems: 'center',
  },
  errorTitle: { fontSize: 22, fontWeight: 'bold', color: nospiColors.purpleDark, marginBottom: 14, textAlign: 'center' },
  errorMsg: { fontSize: 16, color: '#6B7280', marginBottom: 24, textAlign: 'center', lineHeight: 24 },
  errorBtn: { backgroundColor: nospiColors.purpleDark, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32, width: '100%' },
  errorBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold', textAlign: 'center' },
});
