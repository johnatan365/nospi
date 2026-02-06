
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { nospiColors } from '@/constants/Colors';

export default function CompatibilityScreen() {
  const router = useRouter();
  const [spinValue] = useState(new Animated.Value(0));
  const [percentage, setPercentage] = useState(0);
  const [showResult, setShowResult] = useState(false);

  const navigateToNext = useCallback(() => {
    console.log('User compatibility:', percentage);
    // TODO: Backend Integration - PUT /api/pre-registration with { compatibilityPercentage }
    router.push('/onboarding/phone');
  }, [percentage, router]);

  useEffect(() => {
    // Generate random percentage between 95-99
    const randomPercentage = Math.floor(Math.random() * 5) + 95;
    
    // Animate spinner
    Animated.timing(spinValue, {
      toValue: 1,
      duration: 2000,
      useNativeDriver: true,
    }).start(() => {
      setPercentage(randomPercentage);
      setShowResult(true);
      
      // Navigate to next screen after showing result
      setTimeout(() => {
        navigateToNext();
      }, 3000);
    });
  }, [spinValue, navigateToNext]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '720deg'],
  });

  const percentageText = percentage.toString();

  return (
    <LinearGradient
      colors={[nospiColors.purpleDark, nospiColors.purpleMid, nospiColors.purpleLight]}
      style={styles.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <View style={styles.container}>
        <View style={styles.content}>
          {!showResult ? (
            <>
              <Text style={styles.title}>Calculando tu compatibilidad...</Text>
              <Animated.View style={[styles.spinner, { transform: [{ rotate: spin }] }]}>
                <View style={styles.spinnerInner}>
                  <Text style={styles.spinnerText}>🎯</Text>
                </View>
              </Animated.View>
            </>
          ) : (
            <>
              <View style={styles.resultContainer}>
                <Text style={styles.percentageText}>{percentageText}</Text>
                <Text style={styles.percentageSymbol}>%</Text>
              </View>
              
              <Text style={styles.celebrationText}>¡Increíble!</Text>
              
              <Text style={styles.messageText}>Se encontraron 5 personas compatibles en un</Text>
              <Text style={styles.messageText}>{percentageText}% contigo</Text>
              <Text style={styles.messageText}>y listas para el encuentro en algún lugar de la ciudad</Text>
              
              <View style={styles.ctaContainer}>
                <Text style={styles.ctaText}>Inscríbete para programar el encuentro</Text>
              </View>
            </>
          )}
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
    padding: 24,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: nospiColors.white,
    marginBottom: 60,
    textAlign: 'center',
  },
  spinner: {
    width: 150,
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
  },
  spinnerInner: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: nospiColors.white,
  },
  spinnerText: {
    fontSize: 60,
  },
  resultContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  percentageText: {
    fontSize: 80,
    fontWeight: 'bold',
    color: nospiColors.white,
  },
  percentageSymbol: {
    fontSize: 40,
    fontWeight: 'bold',
    color: nospiColors.white,
    marginTop: 10,
  },
  celebrationText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: nospiColors.white,
    marginBottom: 24,
  },
  messageText: {
    fontSize: 18,
    color: nospiColors.white,
    textAlign: 'center',
    marginBottom: 8,
    opacity: 0.95,
  },
  ctaContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    marginTop: 32,
    borderWidth: 2,
    borderColor: nospiColors.white,
  },
  ctaText: {
    fontSize: 18,
    fontWeight: '600',
    color: nospiColors.white,
    textAlign: 'center',
  },
});
