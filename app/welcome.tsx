import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, Image, ImageSourcePropType } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { nospiColors } from '@/constants/Colors';
import { Asset } from 'expo-asset';

const { width, height } = Dimensions.get('window');

// Helper to resolve image sources (handles both local require() and remote URLs)
function resolveImageSource(source: string | number | ImageSourcePropType | undefined): ImageSourcePropType {
  if (!source) return { uri: '' };
  if (typeof source === 'string') return { uri: source };
  return source as ImageSourcePropType;
}

const logoSource = require('@/assets/images/icono Nospi.png');

export default function WelcomeScreen() {
  const router = useRouter();
  const [logoLoaded, setLogoLoaded] = useState(false);

  // Preload logo image to prevent delay
  useEffect(() => {
    console.log('Preloading logo image...');
    const preloadLogo = async () => {
      try {
        await Asset.fromModule(logoSource).downloadAsync();
        console.log('Logo preloaded successfully');
        setLogoLoaded(true);
      } catch (error) {
        console.error('Error preloading logo:', error);
        // Still set loaded to true to show the screen
        setLogoLoaded(true);
      }
    };

    preloadLogo();
  }, []);

  const handleStart = () => {
    console.log('User tapped Empezar button');
    router.push('/onboarding/interests');
  };

  const handleLogin = () => {
    console.log('User tapped Ya tengo una cuenta button');
    router.push('/login');
  };

  const tagline1 = 'Tu dosis semanal';
  const tagline2 = 'de conexión';
  const subtitle = 'Conoce personas reales en encuentros grupales cada semana';
  const startButtonText = 'Empezar';
  const loginButtonText = 'Ya tengo una cuenta';

  return (
    <LinearGradient
      colors={['#1a0010', '#880E4F', '#AD1457']}
      style={styles.gradient}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <View style={styles.container}>
        <View style={styles.content}>
          {/* Logo - Más grande con preload */}
          <View style={styles.logoContainer}>
            <Image 
              source={resolveImageSource(logoSource)} 
              style={[styles.logo, { opacity: logoLoaded ? 1 : 0 }]}
              resizeMode="contain"
              fadeDuration={0}
            />
          </View>
          
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
  logoContainer: {
    width: 240,
    height: 240,
    marginBottom: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  taglineContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  tagline: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 14,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 60,
    opacity: 0.7,
    fontWeight: '400',
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  buttonContainer: {
    width: '100%',
    gap: 16,
  },
  primaryButton: {
    backgroundColor: '#880E4F',
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
    borderWidth: 1.5,
    borderColor: 'rgba(240, 98, 146, 0.40)',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: 'rgba(240, 98, 146, 0.50)',
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#F06292',
    fontSize: 18,
    fontWeight: '600',
  },
});