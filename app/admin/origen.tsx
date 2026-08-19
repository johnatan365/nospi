import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

// Fallback nativo requerido por Expo Router: todo archivo .web.tsx necesita un
// hermano sin extension de plataforma. El panel de origen de registros solo
// tiene UI en la version web del panel de administracion.
export default function OrigenScreen() {
  return React.createElement(
    View,
    { style: styles.container },
    React.createElement(Text, { style: styles.text }, 'Esta seccion solo esta disponible desde la version web del panel de administracion.')
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  text: { fontSize: 16, textAlign: 'center', color: '#666' },
});
