import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, Image, ImageSourcePropType, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { trackOnboardingStep } from '@/utils/onboardingTracker';
import { nospiColors } from '@/constants/Colors';
import { Asset } from 'expo-asset';
import appJson from '@/app.json';
import { useIdioma } from '@/contexts/IdiomaContext';

const { width, height } = Dimensions.get('window');

function resolveImageSource(source: string | number | ImageSourcePropType | undefined): ImageSourcePropType {
  if (!source) return { uri: '' };
  if (typeof source === 'string') return { uri: source };
  return source as ImageSourcePropType;
}

const logoSource = require('../assets/images/fa137ca3-b552-4ac8-9f1e-8268723ace00.png');

export default function WelcomeScreen() {
  const { t, idioma, cambiarIdioma } = useIdioma();
  const router = useRouter();
  const [logoLoaded, setLogoLoaded] = useState(false);

  useEffect(() => {
    const preloadLogo = async () => {
      try {
        await Asset.fromModule(logoSource).downloadAsync();
        setLogoLoaded(true);
      } catch (error) {
        console.error('Error preloading logo:', error);
        setLogoLoaded(true);
      }
    };
    preloadLogo();
  }, []);

  const handleStart = async () => {
    await trackOnboardingStep('start');
    router.push('/onboarding/interests');
  };

  const handleLogin = () => {
    router.push('/login');
  };

  return (
    <LinearGradient
      colors={['#1a0010', '#880E4F', '#AD1457']}
      style={styles.gradient}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.logoContainer}>
            <Image 
              source={resolveImageSource(logoSource)} 
              style={[styles.logo, { opacity: logoLoaded ? 1 : 0 }]}
              resizeMode="contain"
              fadeDuration={0}
            />
          </View>
          
          <View style={styles.taglineContainer}>
            <Text style={styles.tagline}>{t('bienvenida.tagline1')}</Text>
            <Text style={styles.tagline}>{t('bienvenida.tagline2')}</Text>
          </View>
          
          <Text style={styles.subtitle}>{t('bienvenida.subtitulo')}</Text>
          
          <View style={styles.buttonContainer}>
            {/* Botón principal: blanco sólido, premium */}
            <TouchableOpacity 
              style={styles.primaryButton}
              onPress={handleStart}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>{t('bienvenida.empezar')}</Text>
            </TouchableOpacity>
            
            {/* Botón secundario: glass frosted, igualmente prominente */}
            <TouchableOpacity 
              style={styles.secondaryButton}
              onPress={handleLogin}
              activeOpacity={0.85}
            >
              <Text style={styles.secondaryButtonText}>{t('bienvenida.yaTengoCuenta')}</Text>
            </TouchableOpacity>
          </View>

          {/* Interruptor de idioma. La app ya detecta sola el idioma del celular;
              esto es para cuando esa deteccion falla — el extranjero que vive
              aqui con el celular en español, o al reves. Va al pie y chiquito
              para no competirle a los dos botones. */}
          <View style={styles.idiomaFila}>
            {(['es', 'en'] as const).map((cual) => (
              <TouchableOpacity
                key={cual}
                style={[styles.idiomaChip, idioma === cual && styles.idiomaChipActivo]}
                onPress={() => cambiarIdioma(cual)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected: idioma === cual }}
                accessibilityLabel={cual === 'es' ? 'Español' : 'English'}
              >
                <Text style={[styles.idiomaChipTexto, idioma === cual && styles.idiomaChipTextoActivo]}>
                  {cual === 'es' ? 'ES' : 'EN'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.versionText}>v{appJson.expo.version}{Platform.OS !== 'web' ? ` (${appJson.expo.android?.versionCode || '—'})` : ''}</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  idiomaFila: {
    flexDirection: 'row',
    alignSelf: 'center',
    marginTop: 22,
    padding: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    gap: 2,
  },
  idiomaChip: { paddingVertical: 6, paddingHorizontal: 15, borderRadius: 999 },
  idiomaChipActivo: { backgroundColor: '#FFFFFF' },
  idiomaChipTexto: { color: 'rgba(255,255,255,0.82)', fontSize: 12.5, fontWeight: '800' },
  idiomaChipTextoActivo: { color: '#880E4F' },
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
    gap: 14,
  },
  primaryButton: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 8,
  },
  primaryButtonText: {
    color: '#880E4F',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  secondaryButton: {
    backgroundColor: '#880E4F',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.50)',
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  versionText: {
    textAlign: 'center',
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 20,
  },
});
