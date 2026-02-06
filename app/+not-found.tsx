
import { Link, Stack } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import React from 'react';
import { nospiColors } from '@/constants/Colors';

export default function NotFoundScreen() {
  return (
    <React.Fragment>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={styles.container}>
        <Text style={styles.title}>Esta pantalla no existe.</Text>
        <Link href="/welcome" style={styles.link}>
          <Text style={styles.linkText}>Ir a la pantalla de inicio</Text>
        </Link>
      </View>
    </React.Fragment>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: nospiColors.white,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
  linkText: {
    fontSize: 14,
    color: nospiColors.purpleMid,
  },
});
