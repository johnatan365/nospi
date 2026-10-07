import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

// Fallback nativo requerido por Expo Router: todo archivo .web.tsx necesita un
// hermano sin extension de plataforma. Dividir un evento en grupos solo tiene
// UI en la version web del panel de administracion.
export default function DividirEventoScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Esta sección solo está disponible desde la versión web del panel de administración.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  text: { fontSize: 16, textAlign: 'center', color: '#666' },
});
