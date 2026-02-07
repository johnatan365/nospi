
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { nospiColors } from '@/constants/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AVATAR_EMOJIS = ['👨', '👩', '🧑', '👨‍💼', '👩‍💼', '👨‍🎓', '👩‍🎓', '🧑‍💻'];

export default function CompatibilityScreen() {
  const router = useRouter();
  const [rotateValues] = useState(
    AVATAR_EMOJIS.map(() => new Animated.Value(0))
  );
  const [percentage, setPercentage] = useState(0);
  const [showResult, setShowResult] = useState(false);

  const navigateToNext = useCallback(async () => {
    console.log('User compatibility:', percentage);
    
    // Save compatibility percentage to AsyncStorage
    await AsyncStorage.setItem('onboarding_compatibility', percentage.toString());
    
    router.push('/onboarding/phone');
  }, [percentage, router]);

  useEffect(() => {
    const randomPercentage = Math.floor(Math.random() * 5) + 95;
    
    const animations = rotateValues.map((rotateValue, index) => {
      return Animated.loop(
        Animated.timing(rotateValue, {
          toValue: 1,
          duration: 2000 + (index * 200),
          useNativeDriver: true,
        })
      );
    });

    animations.forEach(anim => anim.start());

    setTimeout(() => {
      animations.forEach(anim => anim.stop());
      setPercentage(randomPercentage);
      setShowResult(true);
    }, 3000);

    return () => {
      animations.forEach(anim => anim.stop());
    };
  }, [rotateValues]);

  const percentageText = percentage.toString();
  const line1 = 'Se encontraron 5 personas con un';
  const line2 = `${percentageText}% compatibles contigo y listas`;
  const line3 = 'para el encuentro.';

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
            <React.Fragment>
              <Text style={styles.title}>Analizando tu compatibilidad con otros usuarios</Text>
              
              <View style={styles.avatarContainer}>
                {AVATAR_EMOJIS.map((emoji, index) => {
                  const rotate = rotateValues[index].interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '360deg'],
                  });

                  const angle = (index / AVATAR_EMOJIS.length) * 2 * Math.PI;
                  const radius = 80;
                  const x = Math.cos(angle) * radius;
                  const y = Math.sin(angle) * radius;

                  return (
                    <Animated.View
                      key={index}
                      style={[
                        styles.avatar,
                        {
                          transform: [
                            { translateX: x },
                            { translateY: y },
                            { rotate },
                          ],
                        },
                      ]}
                    >
                      <Text style={styles.avatarEmoji}>{emoji}</Text>
                    </Animated.View>
                  );
                })}
              </View>
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
    color: nospiColors.white,
    marginBottom: 60,
    textAlign: 'center',
  },
  avatarContainer: {
    width: 200,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  avatar: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: nospiColors.white,
  },
  avatarEmoji: {
    fontSize: 28,
  },
  resultCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 8,
    borderColor: nospiColors.white,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  percentageText: {
    fontSize: 72,
    fontWeight: 'bold',
    color: nospiColors.white,
    lineHeight: 72,
  },
  percentageSymbol: {
    fontSize: 32,
    fontWeight: 'bold',
    color: nospiColors.white,
    marginTop: -8,
  },
  checkmarkContainer: {
    marginBottom: 24,
  },
  checkmarkCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: nospiColors.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmark: {
    fontSize: 32,
    color: nospiColors.purpleDark,
    fontWeight: 'bold',
  },
  celebrationText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: nospiColors.white,
    marginBottom: 20,
    textAlign: 'center',
  },
  messageContainer: {
    marginBottom: 24,
    alignItems: 'center',
  },
  messageText: {
    fontSize: 17,
    color: nospiColors.white,
    textAlign: 'center',
    lineHeight: 26,
  },
  ctaText: {
    fontSize: 14,
    color: nospiColors.white,
    textAlign: 'center',
    marginBottom: 24,
    opacity: 0.9,
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
