import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { AgeFallback } from '@/utils/agePreferences';

export const AGE_FALLBACK_LABELS = {
  attend: 'Prefiero ir al evento de todas formas.',
  postpone: 'Prefiero que aplacen mi asistencia.',
};

export function AgeFallbackChoices({ value, onChange, light = false }: {
  value: AgeFallback | null;
  onChange: (value: AgeFallback) => void;
  light?: boolean;
}) {
  return <View>
    {(['attend', 'postpone'] as const).map(choice => <TouchableOpacity
      key={choice} accessibilityRole="radio" accessibilityState={{ checked: value === choice }}
      accessibilityLabel={AGE_FALLBACK_LABELS[choice]}
      onPress={() => onChange(choice)}
      style={[styles.option, light && styles.light, value === choice && styles.selected]}
    >
      <Text style={[styles.marker, (light || value === choice) && styles.dark]}>{value === choice ? '◉' : '○'}</Text>
      <View style={styles.copy}>
        <Text style={[styles.title, (light || value === choice) && styles.dark]}>{AGE_FALLBACK_LABELS[choice]}</Text>
        <Text style={[styles.description, (light || value === choice) && styles.dark]}>
          {choice === 'attend' ? 'Acepto compartir con personas fuera del rango que elegí.'
            : 'Acepto pasar mi reserva a otro evento. Nospi me avisará con al menos un día de anticipación y coordinaremos la nueva fecha.'}
        </Text>
      </View>
    </TouchableOpacity>)}
  </View>;
}
const styles = StyleSheet.create({
  option: { padding: 16, borderRadius: 14, borderWidth: 1, borderColor: '#FFFFFF80', marginTop: 14, flexDirection: 'row', gap: 12 },
  light: { borderColor: '#D5B5C4', backgroundColor: '#FFF' },
  selected: { backgroundColor: '#FFF', borderColor: '#880E4F' },
  marker: { color: '#FFF', fontSize: 23 },
  copy: { flex: 1 },
  title: { color: '#FFF', fontSize: 16, fontWeight: '600', lineHeight: 23 },
  description: { color: '#F4D9E6', fontSize: 14, lineHeight: 21, marginTop: 7 },
  dark: { color: '#72113E' },
});
