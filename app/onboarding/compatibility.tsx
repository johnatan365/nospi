
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const HEADING = '#1a0010';
const MUTED = '#555555';
const ACCENT = '#880E4F';

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
    const spinAnimation = Animated.loop(Animated.timing(spinValue, { toValue: 1, duration: 1500, useNativeDriver: true }));
    const pulseAnimation = Animated.loop(Animated.sequence([
      Animated.timing(scaleValue, { toValue: 1.2, duration: 750, useNativeDriver: true }),
      Animated.timing(scaleValue, { toValue: 1, duration: 750, useNativeDriver: true }),
    ]));
    spinAnimation.start();
    pulseAnimation.start();
    setTimeout(() => {
      spinAnimation.stop(); pulseAnimation.stop();
      setPercentage(randomPercentage); setShowResult(true);
    }, 3000);
    return () => { spinAnimation.stop(); pulseAnimation.stop(); };
  }, [spinValue, scaleValue]);

  const spin = spinValue.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const percentageText = percentage.toString();
  const line1 = 'Se encontraron 5 personas con un';
  const line2 = `${percentageText}% compatibles contigo y listas`;
  const line3 = 'para el encuentro.';

  return (
    <View style={styles.screen}>
      <View style={styles.container}>
        <View style={styles.content}>
          {!showResult ? (
            <React.Fragment>
              <Text style={styles.title}>Analizando tu compatibilidad con otros usuarios</Text>
              <View style={styles.loaderContainer}>
                <Animated.View style={[styles.outerCircle, { transform: [{ rotate: spin }, { scale: scaleValue }] }]}>
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
              <View style={styles.buttonWrapper}>
                <LinearGradient colors={['#1a0010', '#880E4F', '#AD1457']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.buttonGradient}>
                  <TouchableOpacity style={styles.buttonInner} onPress={navigateToNext} activeOpacity={0.8}>
                    <Text style={styles.buttonText}>Inscribirme ahora</Text>
                  </TouchableOpacity>
                </LinearGradient>
              </View>
            </React.Fragment>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  content: { width: '100%', maxWidth: 400, alignSelf: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', color: HEADING, marginBottom: 60, textAlign: 'center' },
  loaderContainer: { width: 200, height: 200, justifyContent: 'center', alignItems: 'center', marginBottom: 40 },
  outerCircle: { width: 160, height: 160, borderRadius: 80, borderWidth: 8, borderColor: ACCENT, borderStyle: 'solid', borderTopColor: 'transparent', borderRightColor: '#AD1457', borderBottomColor: '#F8BBD0', borderLeftColor: ACCENT, justifyContent: 'center', alignItems: 'center' },
  innerCircle: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#F9FAFB', justifyContent: 'center', alignItems: 'center' },
  centerDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: ACCENT },
  loadingText: { fontSize: 16, color: HEADING, textAlign: 'center', fontWeight: '600' },
  resultCircle: { width: 180, height: 180, borderRadius: 90, borderWidth: 8, borderColor: ACCENT, backgroundColor: '#F9FAFB', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  percentageText: { fontSize: 72, fontWeight: 'bold', color: HEADING, lineHeight: 72 },
  percentageSymbol: { fontSize: 32, fontWeight: 'bold', color: HEADING, marginTop: -8 },
  checkmarkContainer: { marginBottom: 24 },
  checkmarkCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: ACCENT, justifyContent: 'center', alignItems: 'center' },
  checkmark: { fontSize: 32, color: '#FFFFFF', fontWeight: 'bold' },
  celebrationText: { fontSize: 24, fontWeight: 'bold', color: HEADING, marginBottom: 20, textAlign: 'center' },
  messageContainer: { marginBottom: 24, alignItems: 'center' },
  messageText: { fontSize: 17, color: HEADING, textAlign: 'center', lineHeight: 26 },
  ctaText: { fontSize: 14, color: MUTED, textAlign: 'center', marginBottom: 24 },
  buttonWrapper: { borderRadius: 25, overflow: 'hidden', minWidth: 250 },
  buttonGradient: { borderRadius: 25 },
  buttonInner: { paddingVertical: 16, paddingHorizontal: 48, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
