import React, { useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AgeFallbackChoices } from '@/components/AgeFallbackChoices';
import { AgeFallback, validAgeRange } from '@/utils/agePreferences';

export default function AgeFallbackScreen() {
  const router = useRouter();
  const [range, setRange] = useState<{ min: number; max: number } | null>(null);
  const [choice, setChoice] = useState<AgeFallback | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useFocusEffect(React.useCallback(() => {
    let active = true;
    setChoice(null);
    AsyncStorage.getItem('onboarding_age_range').then(raw => {
      const parsed = raw ? JSON.parse(raw) : null;
      if (!active) return;
      if (validAgeRange(parsed)) setRange(parsed);
      else router.replace('/onboarding/age-range');
    }).catch(() => { if (active) setError('No pudimos leer tu rango. Vuelve al paso anterior.'); });
    return () => { active = false; };
  }, [router]));
  async function continueRegistration() {
    if (!choice || !range || saving) return;
    setSaving(true);
    setError('');
    try {
      await AsyncStorage.multiSet([
        ['onboarding_age_fallback', choice],
        ['onboarding_age_confirmed_at', new Date().toISOString()],
      ]);
      router.push('/onboarding/location');
    } catch { setError('No pudimos guardar tu elección. Intenta de nuevo.'); }
    finally { setSaving(false); }
  }
  return <LinearGradient colors={['#1a0010', '#880E4F', '#AD1457']} style={{ flex: 1 }}>
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>¿Qué prefieres si en un evento no logramos completar tu mesa dentro del rango elegido?</Text>
        {range && <Text style={styles.help}>Tu rango elegido: {range.min} a {range.max} años.</Text>}
        <AgeFallbackChoices value={choice} onChange={setChoice} />
        {!!error && <Text accessibilityRole="alert" style={styles.help}>{error}</Text>}
        <TouchableOpacity accessibilityRole="button" disabled={!choice || !range || saving}
          style={[styles.button, (!choice || !range || saving) && { opacity: 0.4 }]}
          onPress={continueRegistration}>
          <Text style={styles.buttonText}>{saving ? 'Guardando…' : 'Guardar y continuar'}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  </LinearGradient>;
}
const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  content: { width: '100%', maxWidth: 400, alignSelf: 'center' },
  title: { color: '#FFF', fontSize: 26, fontWeight: 'bold', lineHeight: 32 },
  help: { color: '#F4D9E6', fontSize: 15, lineHeight: 23, marginTop: 16 },
  button: { backgroundColor: '#FFF', borderRadius: 30, padding: 18, marginTop: 26, alignItems: 'center' },
  buttonText: { color: '#880E4F', fontWeight: '700', fontSize: 17 },
});
