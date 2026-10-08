
import { Link, Stack } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import React from 'react';
import { nospiColors } from '@/constants/Colors';

import { useIdioma } from '@/contexts/IdiomaContext';
export default function NotFoundScreen() {
  const { t } = useIdioma();
  return (
    <React.Fragment>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={styles.container}>
        <Text style={styles.title}>{t('nf.noExiste')}</Text>
        <Link href="/welcome" style={styles.link}>
          <Text style={styles.linkText}>{t('nf.irInicio')}</Text>
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
