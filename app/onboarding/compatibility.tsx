
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { nospiColors } from '@/constants/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function CompatibilityScreen() {
  const router = useRouter();
  const [spinValue] = useState(new Animated.Value(0));
  const [scaleValue] = useState(new Animated.Value(1));
  const [percentage, setPercentage] = useState(0);
  const [showResult, setShowResult] = useState(false);

  const navigateToNext = useCallback(async () => {
    console.log('User compatibility:', percentage);
    
    await AsyncStorage.setItem('onboarding_compatibility', percentage.toString());
    
    router.push('/onboarding/phone');
  }, [percentage, router]);

  useEffect(() => {
    const randomPercentage = Math.floor(Math.random() * 5) + 95;
    
    // Continuous rotation animation
    const spinAnimation = Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 1500,
        useNativeDriver: true,
      })
    );

    // Pulsing scale animation
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(scaleValue, {
          toValue: 1.2,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(scaleValue, {
          toValue: 1,
          duration: 750,
          useNativeDriver: true,
        }),
      ])
    );

    spinAnimation.start();
    pulseAnimation.start();

    setTimeout(() => {
      spinAnimation.stop();
      pulseAnimation.stop();
      setPercentage(randomPercentage);
      setShowResult(true);
    }, 3000);

    return () => {
      spinAnimation.stop();
      pulseAnimation.stop();
    };
  }, [spinValue, scaleValue]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const percentageText = percentage.toString();
  const line1 = 'Se encontraron 5 personas con un';
  const line2 = `${percentageText}% compatibles contigo y listas`;
  const line3 = 'para el encuentro.';

  return (
    <LinearGradient
      colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
      style={styles.gradient}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <View style={styles.container}>
        <View style={styles.content}>
          {!showResult ? (
            <React.Fragment>
              <Text style={styles.title}>Analizando tu compatibilidad con otros usuarios</Text>
              
              <View style={styles.loaderContainer}>
                <Animated.View
                  style={[
                    styles.outerCircle,
                    {
                      transform: [{ rotate: spin }, { scale: scaleValue }],
                    },
                  ]}
                >
                  <View style={styles.innerCircle}>
                    <View style={styles.centerDot} />
                  </View>
                </Animated.View>
              </View>

              <Text style={styles.loadingText}>Buscando coincidencias perfectas...</Text>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <View style={styles.resultCircle}>
                <Text style={styles.percentageText}>{percentageText}</Text>
                <Text style={styles.percentageSymbol}>%</Text>
              </View>
              
              <View style={styles.checkmarkContainer}>
                <View style={styles.checkmarkCircle}>
                  <Text style={styles.checkmark}>✓</Text>
                </View>
              </View>
              
              <Text style={styles.celebrationText}>¡Excelente noticia!</Text>
              
              <View style={styles.messageContainer}>
                <Text style={styles.messageText}>{line1}</Text>
                <Text style={styles.messageText}>{line2}</Text>
                <Text style={styles.messageText}>{line3}</Text>
              </View>
              
              <Text style={styles.ctaText}>Inscríbete para programar el encuentro</Text>
              
              <TouchableOpacity
                style={styles.inscribeButton}
                onPress={navigateToNext}
                activeOpacity={0.8}
              >
                <Text style={styles.inscribeButtonText}>Inscribirme ahora</Text>
              </TouchableOpacity>
            </React.Fragment>
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
    fontSize: 24,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 60,
    textAlign: 'center',
  },
  loaderContainer: {
    width: 200,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  outerCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 8,
    borderColor: nospiColors.purpleDark,
    borderStyle: 'solid',
    borderTopColor: 'transparent',
    borderRightColor: nospiColors.purpleMid,
    borderBottomColor: nospiColors.purpleLight,
    borderLeftColor: nospiColors.purpleDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  innerCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: nospiColors.purpleDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  centerDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: nospiColors.purpleDark,
  },
  loadingText: {
    fontSize: 16,
    color: nospiColors.purpleDark,
    textAlign: 'center',
    fontWeight: '600',
  },
  resultCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 8,
    borderColor: nospiColors.purpleDark,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  percentageText: {
    fontSize: 72,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    lineHeight: 72,
  },
  percentageSymbol: {
    fontSize: 32,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginTop: -8,
  },
  checkmarkContainer: {
    marginBottom: 24,
  },
  checkmarkCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: nospiColors.purpleDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmark: {
    fontSize: 32,
    color: nospiColors.white,
    fontWeight: 'bold',
  },
  celebrationText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 20,
    textAlign: 'center',
  },
  messageContainer: {
    marginBottom: 24,
    alignItems: 'center',
  },
  messageText: {
    fontSize: 17,
    color: nospiColors.purpleDark,
    textAlign: 'center',
    lineHeight: 26,
  },
  ctaText: {
    fontSize: 14,
    color: nospiColors.purpleDark,
    textAlign: 'center',
    marginBottom: 24,
    opacity: 0.8,
  },
  inscribeButton: {
    backgroundColor: nospiColors.purpleDark,
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
    minWidth: 250,
  },
  inscribeButtonText: {
    color: nospiColors.white,
    fontSize: 16,
    fontWeight: '700',
  },
});
