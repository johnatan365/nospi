
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { nospiColors } from '@/constants/Colors';
import Slider from '@react-native-community/slider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { trackOnboardingStep } from '@/utils/onboardingTracker';
import { moveAgeBound, validAgeRange, esRangoAbierto, RANGO_ABIERTO, EDAD_MIN, EDAD_MAX } from '@/utils/agePreferences';


export default function AgeRangeScreen() {
  const router = useRouter();
  const [ageRange, setAgeRange] = useState({ min: 25, max: 40 });
  // null = todavia no eligio. Obliga a tocar una de las dos, sin dar por hecho
  // ninguna: si "me da igual" viniera marcado de entrada, la mayoria pasaria de
  // largo sin leer, y si viniera "rango", volveriamos al problema de antes.
  const [leImporta, setLeImporta] = useState<boolean | null>(null);
  const [age, setAge] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useFocusEffect(React.useCallback(() => {
    let active = true;
    setReady(false);
    AsyncStorage.multiGet(['onboarding_age_range', 'onboarding_age']).then(pairs => {
      if (!active) return;
      const stored = pairs[0][1] ? JSON.parse(pairs[0][1]) : null;
      if (validAgeRange(stored)) {
        setAgeRange(stored);
        setLeImporta(!esRangoAbierto(stored));
      }
      const storedAge = pairs[1][1] ? Number(pairs[1][1]) : NaN;
      setAge(Number.isInteger(storedAge) && storedAge >= 18 ? storedAge : null);
      setReady(true);
    }).catch(() => { if (active) setError('No pudimos cargar tus preferencias. Vuelve a intentarlo.'); });
    return () => { active = false; };
  }, []));

  const handleContinue = async () => {
    if (leImporta === null || !ready || saving) return;
    setSaving(true);
    setError('');
    try {
    console.log('User selected age range:', ageRange.min, '-', ageRange.max);
    
    await trackOnboardingStep('age_range');
    // "Me da igual" se guarda como el rango completo: es lo mismo que decir que
    // no hay restriccion, y asi todo lo que ya lee age_range_min/max sigue
    // funcionando sin cambiar nada.
    const aGuardar = leImporta ? { min: ageRange.min, max: ageRange.max } : RANGO_ABIERTO;
    await AsyncStorage.setItem('onboarding_age_range', JSON.stringify(aGuardar));
    router.push('/onboarding/location');
    } catch { setError('No pudimos guardar tu rango. Intenta de nuevo.'); }
    finally { setSaving(false); }
  };

  const handleMinChange = (value: number) => setAgeRange(prev => moveAgeBound(prev, 'min', value));
  const handleMaxChange = (value: number) => setAgeRange(prev => moveAgeBound(prev, 'max', value));

  const minAgeText = ageRange.min.toString();
  const maxAgeText = ageRange.max.toString();
  const rangeText = `${minAgeText} - ${maxAgeText} años`;

  return (
    <LinearGradient
      colors={['#1a0010', '#880E4F', '#AD1457']}
      style={styles.gradient}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.content}>
          {/* La pregunta anterior era "¿Qué rango de edad te gustaría CONOCER?".
              Eso se lee como un filtro de emparejamiento, y por eso el 18% de la
              base se excluia a si misma del rango que pedia (alguien de 45
              pidiendo 28-35). Nospi no empareja: arma mesas.

              Y decia "Quiero compartir mesa con personas de X a Y", que se lee
              como un encargo. Ahora se pregunta por comodidad y se dice en voz
              alta que se tiene en cuenta pero no se garantiza -- porque con 6 a
              15 personas por evento no siempre se puede cuadrar, y prometerlo
              es lo que dejo a 312 personas esperando un aviso que no llegaba. */}
          <Text style={styles.title}>¿Con qué edades te sentirías más cómodo?</Text>
          <Text style={styles.subtitle}>
            Lo tenemos en cuenta al armar las mesas, aunque no siempre se puede cuadrar.
          </Text>

          <TouchableOpacity
            accessibilityRole="radio"
            accessibilityState={{ selected: leImporta === false }}
            disabled={!ready || saving}
            onPress={() => setLeImporta(false)}
            style={[styles.opcion, leImporta === false && styles.opcionActiva]}
            activeOpacity={0.85}
          >
            <Text style={styles.opcionMarca}>{leImporta === false ? '◉' : '○'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.opcionTitulo}>La edad me da igual</Text>
              <Text style={styles.opcionAyuda}>Me acomodo con cualquier grupo</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="radio"
            accessibilityState={{ selected: leImporta === true }}
            disabled={!ready || saving}
            onPress={() => setLeImporta(true)}
            style={[styles.opcion, leImporta === true && styles.opcionActiva]}
            activeOpacity={0.85}
          >
            <Text style={styles.opcionMarca}>{leImporta === true ? '◉' : '○'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.opcionTitulo}>Prefiero un rango</Text>
              <Text style={styles.opcionAyuda}>Me siento mejor con edades parecidas</Text>
            </View>
          </TouchableOpacity>

          {/* Los deslizadores solo aparecen si de verdad tiene una preferencia.
              Mostrarlos siempre es lo que hacia que la gente moviera algo por
              inercia y quedara con un rango que no habia pensado. */}
          {leImporta === true && (
            <>
              <View style={styles.rangeDisplay}>
                <Text style={styles.rangeText}>{rangeText}</Text>
              </View>

              <View style={styles.sliderSection}>
                <View style={styles.sliderRow}>
                  <View style={styles.sliderLabelContainer}>
                    <Text style={styles.sliderLabel}>Mínimo</Text>
                    <Text style={styles.sliderValue}>{minAgeText}</Text>
                  </View>
                  <Slider
                    style={styles.slider}
                    minimumValue={EDAD_MIN}
                    maximumValue={EDAD_MAX}
                    disabled={!ready || saving}
                    accessibilityLabel="Edad mínima"
                    step={1}
                    value={ageRange.min}
                    onValueChange={handleMinChange}
                    minimumTrackTintColor="#FFFFFF"
                    maximumTrackTintColor="rgba(255, 255, 255, 0.35)"
                    thumbTintColor="#FFFFFF"
                  />
                </View>

                <View style={styles.sliderRow}>
                  <View style={styles.sliderLabelContainer}>
                    <Text style={styles.sliderLabel}>Máximo</Text>
                    <Text style={styles.sliderValue}>{maxAgeText}</Text>
                  </View>
                  <Slider
                    style={styles.slider}
                    minimumValue={EDAD_MIN}
                    disabled={!ready || saving}
                    accessibilityLabel="Edad máxima"
                    maximumValue={EDAD_MAX}
                    step={1}
                    value={ageRange.max}
                    onValueChange={handleMaxChange}
                    minimumTrackTintColor="#FFFFFF"
                    maximumTrackTintColor="rgba(255, 255, 255, 0.35)"
                    thumbTintColor="#FFFFFF"
                  />
                </View>
              </View>

              {age !== null && (age < ageRange.min || age > ageRange.max) && (
                <Text accessibilityLiveRegion="polite" style={styles.warning}>
                  Tienes {age} años y elegiste de {ageRange.min} a {ageRange.max}, que te deja
                  a ti por fuera. Puedes mantenerlo si es lo que buscas.
                </Text>
              )}
            </>
          )}

          {!!error && <Text accessibilityRole="alert" style={styles.help}>{error}</Text>}
          <TouchableOpacity
            accessibilityRole="button"
            disabled={leImporta === null || !ready || saving}
            style={[styles.continueButton, (leImporta === null || !ready || saving) && { opacity: 0.4 }]}
            onPress={handleContinue}
            activeOpacity={0.8}
          >
            <Text style={styles.continueButtonText}>{saving ? 'Guardando…' : 'Continuar'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  help: { color: '#F4D9E6', fontSize: 13, lineHeight: 20, marginBottom: 12 },
  warning: { color: '#624319', backgroundColor: '#FFF2D9', padding: 14, borderRadius: 12, lineHeight: 21, marginBottom: 14 },
  opcion: {
    flexDirection: 'row', gap: 12, padding: 16, borderRadius: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#FFFFFF60', backgroundColor: 'rgba(255,255,255,0.06)',
  },
  opcionActiva: { borderColor: '#FFFFFF', backgroundColor: 'rgba(255,255,255,0.16)' },
  opcionMarca: { color: '#FFF', fontSize: 20, lineHeight: 24 },
  opcionTitulo: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  opcionAyuda: { color: '#F4D9E6', fontSize: 13, marginTop: 2 },
  gradient: {
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
    fontSize: 26,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#FFFFFF',
    opacity: 0.8,
    marginBottom: 18,
    textAlign: 'center',
    lineHeight: 21,
  },
  rangeDisplay: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingVertical: 24,
    paddingHorizontal: 32,
    borderRadius: 20,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: 'rgba(240, 98, 146, 0.50)',
  },
  rangeText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#880E4F',
  },
  sliderSection: {
    marginBottom: 18,
  },
  sliderRow: {
    marginBottom: 24,
  },
  sliderLabelContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sliderLabel: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  sliderValue: {
    fontSize: 20,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  slider: {
    width: '100%',
    height: 40,
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
  continueButtonText: {
    color: nospiColors.white,
    fontSize: 18,
    fontWeight: '700',
  },
});
