
import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { nospiColors } from '@/constants/Colors';
import { LinearGradient } from 'expo-linear-gradient';

export default function AuthCallbackScreen() {
  const router = useRouter();

  useEffect(() => {
    console.log('AuthCallbackScreen: OAuth callback received, redirecting to root...');
    
    // Immediately redirect to root
    // The URL listeners in login.tsx and register.tsx will handle the session
    const timer = setTimeout(() => {
      router.replace('/');
    }, 100);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <LinearGradient
      colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
      style={styles.container}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <View style={styles.content}>
        <ActivityIndicator size="large" color={nospiColors.purpleDark} />
        <Text style={styles.text}>Completando inicio de sesión...</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  text: {
    marginTop: 16,
    fontSize: 16,
    color: nospiColors.purpleDark,
    textAlign: 'center',
  },
});
