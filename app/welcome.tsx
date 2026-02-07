
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
      {/* Background Pattern - Romantic/Dating Theme */}
      <View style={styles.patternContainer}>
        <Text style={[styles.patternEmoji, { top: '8%', left: '5%' }]}>👫</Text>
        <Text style={[styles.patternEmoji, { top: '12%', right: '15%', fontSize: 28 }]}>💕</Text>
        <Text style={[styles.patternEmoji, { top: '45%', left: '8%', fontSize: 32 }]}>❤️</Text>
        <Text style={[styles.patternEmoji, { top: '72%', right: '10%', fontSize: 26 }]}>💗</Text>
        <Text style={[styles.patternEmoji, { top: '18%', right: '8%', fontSize: 36 }]}>🍸</Text>
        <Text style={[styles.patternEmoji, { top: '65%', left: '12%', fontSize: 34 }]}>🥂</Text>
        <Text style={[styles.patternEmoji, { top: '82%', left: '25%', fontSize: 30 }]}>🍷</Text>
        <Text style={[styles.patternEmoji, { top: '28%', left: '50%', fontSize: 38 }]}>🏙️</Text>
        <Text style={[styles.patternEmoji, { top: '15%', left: '20%', fontSize: 35 }]}>🌙</Text>
        <Text style={[styles.patternEmoji, { top: '8%', right: '40%', fontSize: 20 }]}>✨</Text>
        <Text style={[styles.patternEmoji, { top: '35%', right: '5%', fontSize: 22 }]}>⭐</Text>
        <Text style={[styles.patternEmoji, { top: '88%', right: '30%', fontSize: 18 }]}>✨</Text>
        <Text style={[styles.patternEmoji, { top: '52%', right: '12%', fontSize: 36 }]}>🍽️</Text>
        <Text style={[styles.patternEmoji, { top: '75%', left: '40%', fontSize: 38 }]}>👥</Text>
        <Text style={[styles.patternEmoji, { top: '58%', right: '25%', fontSize: 32 }]}>📱</Text>
        <Text style={[styles.patternEmoji, { top: '85%', left: '8%', fontSize: 34 }]}>🚗</Text>
        <Text style={[styles.patternEmoji, { top: '40%', left: '25%', fontSize: 32 }]}>🍾</Text>
        <Text style={[styles.patternEmoji, { top: '22%', left: '70%', fontSize: 28 }]}>🎉</Text>
        <Text style={[styles.patternEmoji, { top: '32%', right: '35%', fontSize: 30 }]}>🌴</Text>
        <Text style={[styles.patternEmoji, { top: '68%', right: '40%', fontSize: 32 }]}>🎬</Text>
      </View>

      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.heartContainer}>
            <Text style={styles.heartIcon}>{heartIcon}</Text>
          </View>
          
          <Text style={styles.appName}>{appName}</Text>
          
          <View style={styles.taglineContainer}>
            <Text style={styles.tagline}>{tagline1}</Text>
            <Text style={styles.tagline}>{tagline2}</Text>
          </View>
          
          <Text style={styles.subtitle}>{subtitle}</Text>
          
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
