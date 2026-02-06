
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { colors, commonStyles } from '@/styles/commonStyles';
import { nospiColors } from '@/constants/Colors';

const { width, height } = Dimensions.get('window');

export default function WelcomeScreen() {
  const router = useRouter();

  const handleStart = () => {
    console.log('User tapped Empezar button');
    router.push('/onboarding/interests');
  };

  const handleLogin = () => {
    console.log('User tapped Ya tengo una cuenta button');
    // TODO: Navigate to login screen when implemented
  };

  return (
    <LinearGradient
      colors={[nospiColors.purpleDark, nospiColors.purpleMid, nospiColors.purpleLight]}
      style={styles.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.logo}>Nospi</Text>
          
          <Text style={styles.tagline}>Tu dosis semanal de conexión</Text>
          
          <View style={styles.buttonContainer}>
            <TouchableOpacity 
              style={styles.primaryButton}
              onPress={handleStart}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText}>Empezar</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.secondaryButton}
              onPress={handleLogin}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryButtonText}>Ya tengo una cuenta</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  logo: {
    fontSize: 64,
    fontWeight: 'bold',
    color: nospiColors.white,
    marginBottom: 16,
    letterSpacing: 2,
  },
  tagline: {
    fontSize: 20,
    color: nospiColors.white,
    textAlign: 'center',
    marginBottom: 80,
    opacity: 0.95,
    fontWeight: '500',
  },
  buttonContainer: {
    width: '100%',
    gap: 16,
  },
  primaryButton: {
    backgroundColor: nospiColors.white,
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  primaryButtonText: {
    color: nospiColors.purpleDark,
    fontSize: 18,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: nospiColors.white,
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: nospiColors.white,
    fontSize: 18,
    fontWeight: '600',
  },
});
