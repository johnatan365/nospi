
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
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
    router.push('/login');
  };

  const heartIcon = '♥';
  const appName = 'Nospi';
  const tagline1 = 'Tu dosis semanal';
  const tagline2 = 'de conexión';
  const subtitle = 'Conoce personas reales en encuentros grupales cada viernes';
  const startButtonText = 'Empezar';
  const loginButtonText = 'Ya tengo una cuenta';

  return (
    <LinearGradient
      colors={[nospiColors.purpleDark, nospiColors.purpleMid, nospiColors.purpleLight]}
      style={styles.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      {/* Background Pattern */}
      <View style={styles.patternContainer}>
        <Text style={styles.patternEmoji}>💑</Text>
        <Text style={[styles.patternEmoji, styles.pattern2]}>🍷</Text>
        <Text style={[styles.patternEmoji, styles.pattern3]}>🌙</Text>
        <Text style={[styles.patternEmoji, styles.pattern4]}>🍽️</Text>
        <Text style={[styles.patternEmoji, styles.pattern5]}>💕</Text>
        <Text style={[styles.patternEmoji, styles.pattern6]}>🥂</Text>
        <Text style={[styles.patternEmoji, styles.pattern7]}>✨</Text>
        <Text style={[styles.patternEmoji, styles.pattern8]}>🌃</Text>
      </View>

      <View style={styles.container}>
        <View style={styles.content}>
          {/* Heart Icon */}
          <View style={styles.heartContainer}>
            <Text style={styles.heartIcon}>{heartIcon}</Text>
          </View>
          
          {/* App Name */}
          <Text style={styles.appName}>{appName}</Text>
          
          {/* Tagline */}
          <View style={styles.taglineContainer}>
            <Text style={styles.tagline}>{tagline1}</Text>
            <Text style={styles.tagline}>{tagline2}</Text>
          </View>
          
          {/* Subtitle */}
          <Text style={styles.subtitle}>{subtitle}</Text>
          
          {/* Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity 
              style={styles.primaryButton}
              onPress={handleStart}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText}>{startButtonText}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.secondaryButton}
              onPress={handleLogin}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryButtonText}>{loginButtonText}</Text>
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
  patternContainer: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  patternEmoji: {
    position: 'absolute',
    fontSize: 40,
    opacity: 0.15,
  },
  pattern2: {
    top: '15%',
    right: '10%',
    fontSize: 35,
  },
  pattern3: {
    top: '25%',
    left: '8%',
    fontSize: 45,
  },
  pattern4: {
    top: '40%',
    right: '15%',
    fontSize: 38,
  },
  pattern5: {
    top: '55%',
    left: '12%',
    fontSize: 42,
  },
  pattern6: {
    top: '70%',
    right: '8%',
    fontSize: 36,
  },
  pattern7: {
    top: '80%',
    left: '20%',
    fontSize: 30,
  },
  pattern8: {
    top: '10%',
    left: '85%',
    fontSize: 40,
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
  heartContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  heartIcon: {
    fontSize: 48,
    color: nospiColors.white,
  },
  appName: {
    fontSize: 28,
    fontWeight: '700',
    color: nospiColors.white,
    marginBottom: 8,
    letterSpacing: 1,
  },
  taglineContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  tagline: {
    fontSize: 24,
    fontWeight: 'bold',
    color: nospiColors.white,
    textAlign: 'center',
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 14,
    color: nospiColors.white,
    textAlign: 'center',
    marginBottom: 60,
    opacity: 0.95,
    fontWeight: '400',
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  buttonContainer: {
    width: '100%',
    gap: 16,
  },
  primaryButton: {
    backgroundColor: nospiColors.white,
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 30,
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
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: nospiColors.white,
    fontSize: 18,
    fontWeight: '600',
  },
});
