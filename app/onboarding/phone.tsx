
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Modal, FlatList, SafeAreaView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

const HEADING = '#1a0010';
const MUTED = '#555555';
const ACCENT = '#880E4F';

const COUNTRIES = [
  { name: 'Colombia', code: '+57', flag: '🇨🇴', digits: 10, starts: ['3'] },
  { name: 'Argentina', code: '+54', flag: '🇦🇷', digits: 10, starts: ['1','2','3','4','9'] },
  { name: 'Bolivia', code: '+591', flag: '🇧🇴', digits: 8, starts: ['6','7'] },
  { name: 'Brasil', code: '+55', flag: '🇧🇷', digits: 11, starts: ['1','2','3','4','5','6','7','8','9'] },
  { name: 'Canadá', code: '+1', flag: '🇨🇦', digits: 10, starts: ['2','3','4','5','6','7','8','9'] },
  { name: 'Chile', code: '+56', flag: '🇨🇱', digits: 9, starts: ['9'] },
  { name: 'Costa Rica', code: '+506', flag: '🇨🇷', digits: 8, starts: ['6','7','8'] },
  { name: 'Cuba', code: '+53', flag: '🇨🇺', digits: 8, starts: ['5'] },
  { name: 'Ecuador', code: '+593', flag: '🇪🇨', digits: 9, starts: ['9'] },
  { name: 'El Salvador', code: '+503', flag: '🇸🇻', digits: 8, starts: ['6','7'] },
  { name: 'España', code: '+34', flag: '🇪🇸', digits: 9, starts: ['6','7'] },
  { name: 'Estados Unidos', code: '+1', flag: '🇺🇸', digits: 10, starts: ['2','3','4','5','6','7','8','9'] },
  { name: 'Guatemala', code: '+502', flag: '🇬🇹', digits: 8, starts: ['3','4','5'] },
  { name: 'Honduras', code: '+504', flag: '🇭🇳', digits: 8, starts: ['3','8','9'] },
  { name: 'México', code: '+52', flag: '🇲🇽', digits: 10, starts: ['1','2','3','4','5','6','7','8','9'] },
  { name: 'Nicaragua', code: '+505', flag: '🇳🇮', digits: 8, starts: ['8'] },
  { name: 'Panamá', code: '+507', flag: '🇵🇦', digits: 8, starts: ['6'] },
  { name: 'Paraguay', code: '+595', flag: '🇵🇾', digits: 9, starts: ['9'] },
  { name: 'Perú', code: '+51', flag: '🇵🇪', digits: 9, starts: ['9'] },
  { name: 'Puerto Rico', code: '+1', flag: '🇵🇷', digits: 10, starts: ['7'] },
  { name: 'Rep. Dominicana', code: '+1', flag: '🇩🇴', digits: 10, starts: ['8','9'] },
  { name: 'Uruguay', code: '+598', flag: '🇺🇾', digits: 9, starts: ['9'] },
  { name: 'Venezuela', code: '+58', flag: '🇻🇪', digits: 10, starts: ['4'] },
];

const DEFAULT_COUNTRY = COUNTRIES[0];

export default function PhoneScreen() {
  const router = useRouter();
  const [selectedCountry, setSelectedCountry] = useState(DEFAULT_COUNTRY);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showCountryModal, setShowCountryModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [checking, setChecking] = useState(false);
  const [phoneStatus, setPhoneStatus] = useState<'idle'|'checking'|'available'|'taken'>('idle');
  const debounceRef = useRef<any>(null);
  const [search, setSearch] = useState('');

  const filteredCountries = COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) || c.code.includes(search)
  );

  const cleanNumber = phoneNumber.replace(/\D/g, '');

  useEffect(() => {
    if (cleanNumber.length !== selectedCountry.digits) { setPhoneStatus('idle'); return; }
    setPhoneStatus('checking');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const full = selectedCountry.code + cleanNumber;
      const exists = await checkPhoneExists(full);
      setPhoneStatus(exists ? 'taken' : 'available');
    }, 600);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [cleanNumber, selectedCountry]);

  const canContinue = cleanNumber.length === selectedCountry.digits && !checking && phoneStatus !== 'taken' && phoneStatus !== 'checking';

  const hintText =
    phoneStatus === 'taken' ? '❌ Este número ya está registrado' :
    phoneStatus === 'available' ? '✅ Número disponible' :
    phoneStatus === 'checking' ? '🔍 Verificando...' :
    `${selectedCountry.digits} dígitos requeridos · ${cleanNumber.length}/${selectedCountry.digits}`;

  const checkPhoneExists = async (full: string): Promise<boolean> => {
    try {
      const withoutPlus = full.replace('+', '');
      const digitsOnly = full.replace(/^\+\d{2,3}/, '');
      const { data, error } = await supabase.from('users').select('id').or('phone.eq.' + full + ',phone.eq.' + withoutPlus + ',phone.eq.' + digitsOnly).maybeSingle();
      if (error) { console.error(error); return false; }
      return !!data;
    } catch { return false; }
  };

  const handleContinue = async () => {
    const startsOk = selectedCountry.starts.some(p => cleanNumber.startsWith(p));
    if (!startsOk) {
      setErrorMessage(`Para ${selectedCountry.name} el número debe empezar con ${selectedCountry.starts.join(' o ')}.`);
      setShowErrorModal(true);
      return;
    }
    setChecking(true);
    const full = selectedCountry.code + cleanNumber;
    const exists = await checkPhoneExists(full);
    setChecking(false);
    if (exists) {
      setErrorMessage('Este número ya está registrado. Usa otro número o inicia sesión con tu cuenta existente.');
      setShowErrorModal(true);
      return;
    }
    console.log('User confirmed phone number:', full);
    await AsyncStorage.setItem('onboarding_phone', JSON.stringify({ countryCode: selectedCountry.code, phoneNumber: full }));
    router.push('/onboarding/photo');
  };

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.content}>
          <Text style={styles.title}>¿Cuál es tu número de celular?</Text>
          <View style={styles.phoneRow}>
            <TouchableOpacity style={styles.countryButton} onPress={() => setShowCountryModal(true)} activeOpacity={0.75}>
              <Text style={styles.countryFlag}>{selectedCountry.flag}</Text>
              <Text style={styles.countryCode}>{selectedCountry.code}</Text>
              <Text style={styles.chevron}>▾</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.phoneInput}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              placeholder="Número de celular"
              placeholderTextColor="rgba(26, 0, 16, 0.4)"
              keyboardType="phone-pad"
              maxLength={selectedCountry.digits + 2}
            />
          </View>
          <Text style={[styles.hint, cleanNumber.length === selectedCountry.digits && styles.hintDone]}>{hintText}</Text>
          <View style={[styles.buttonWrapper, !canContinue && styles.buttonDisabled]}>
            <LinearGradient colors={['#1a0010', '#880E4F', '#AD1457']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.buttonGradient}>
              <TouchableOpacity style={styles.buttonInner} onPress={handleContinue} disabled={!canContinue} activeOpacity={0.8}>
                <Text style={styles.buttonText}>{checking ? 'Verificando...' : 'Continuar'}</Text>
              </TouchableOpacity>
            </LinearGradient>
          </View>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={showCountryModal} animationType="slide" onRequestClose={() => setShowCountryModal(false)}>
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Selecciona tu país</Text>
            <TouchableOpacity onPress={() => { setShowCountryModal(false); setSearch(''); }}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <TextInput style={styles.searchInput} value={search} onChangeText={setSearch} placeholder="Buscar país o código..." placeholderTextColor="#999" autoCorrect={false} />
          <FlatList
            data={filteredCountries}
            keyExtractor={(_, i) => String(i)}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.countryRow, item.name === selectedCountry.name && item.code === selectedCountry.code && styles.countryRowSelected]}
                onPress={() => { setSelectedCountry(item); setPhoneNumber(''); setShowCountryModal(false); setSearch(''); }}
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

      <Modal visible={showErrorModal} transparent animationType="fade" onRequestClose={() => setShowErrorModal(false)}>
        <View style={styles.errorOverlay}>
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>⚠️ Número Inválido</Text>
            <Text style={styles.errorMsg}>{errorMessage}</Text>
            <View style={styles.errorBtnWrapper}>
              <LinearGradient colors={['#1a0010', '#880E4F', '#AD1457']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.errorBtnGradient}>
                <TouchableOpacity style={styles.errorBtnInner} onPress={() => setShowErrorModal(false)}>
                  <Text style={styles.errorBtnText}>Entendido</Text>
                </TouchableOpacity>
              </LinearGradient>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  content: { width: '100%', maxWidth: 400, alignSelf: 'center' },
  title: { fontSize: 28, fontWeight: 'bold', color: HEADING, marginBottom: 32, textAlign: 'center' },
  phoneRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  countryButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderWidth: 2, borderColor: '#E5E7EB', borderRadius: 16, paddingVertical: 18, paddingHorizontal: 12, gap: 4 },
  countryFlag: { fontSize: 22 },
  countryCode: { fontSize: 16, color: HEADING, fontWeight: '700' },
  chevron: { fontSize: 12, color: HEADING, marginLeft: 2 },
  phoneInput: { flex: 1, backgroundColor: '#F9FAFB', borderWidth: 2, borderColor: '#E5E7EB', borderRadius: 16, paddingVertical: 18, paddingHorizontal: 20, fontSize: 18, color: HEADING },
  hint: { fontSize: 13, color: HEADING, opacity: 0.6, marginBottom: 24, textAlign: 'center' },
  hintDone: { color: '#16a34a', opacity: 1, fontWeight: '600' },
  buttonWrapper: { borderRadius: 16, overflow: 'hidden' },
  buttonGradient: { borderRadius: 16 },
  buttonInner: { paddingVertical: 18, alignItems: 'center' },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  modalSafe: { flex: 1, backgroundColor: '#fff' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#eee' },
  modalTitle: { fontSize: 20, fontWeight: '700', color: HEADING },
  modalClose: { fontSize: 20, color: HEADING, padding: 4 },
  searchInput: { margin: 16, borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: '#333' },
  countryRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 12 },
  countryRowSelected: { backgroundColor: 'rgba(136, 14, 79, 0.08)' },
  rowFlag: { fontSize: 26 },
  rowName: { flex: 1, fontSize: 16, color: '#222' },
  rowCode: { fontSize: 15, color: ACCENT, fontWeight: '600' },
  separator: { height: 1, backgroundColor: '#f0f0f0', marginLeft: 58 },
  errorOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorCard: { backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', maxWidth: 400, alignItems: 'center' },
  errorTitle: { fontSize: 22, fontWeight: 'bold', color: HEADING, marginBottom: 14, textAlign: 'center' },
  errorMsg: { fontSize: 16, color: MUTED, marginBottom: 24, textAlign: 'center', lineHeight: 24 },
  errorBtnWrapper: { borderRadius: 12, overflow: 'hidden', width: '100%' },
  errorBtnGradient: { borderRadius: 12 },
  errorBtnInner: { paddingVertical: 14, paddingHorizontal: 32, alignItems: 'center' },
  errorBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
