
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { nospiColors } from '@/constants/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { trackOnboardingStep } from '@/utils/onboardingTracker';
import { supabase } from '@/lib/supabase';


export default function CompatibilityScreen() {
  const router = useRouter();
  const [spinValue] = useState(new Animated.Value(0));
  const [scaleValue] = useState(new Animated.Value(1));
  // null = todavia no se sabe, o la consulta fallo. Nunca se rellena con un
  // numero inventado: si no hay dato, la pantalla no muestra cifra.
  const [compatibles, setCompatibles] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);

  const navigateToNext = useCallback(async () => {
    await trackOnboardingStep('compatibility');
    // users.compatibility_percentage guardaba el porcentaje inventado. Ahora
    // guarda el conteo real de personas compatibles por edad, que sirve para
    // medir con que expectativa entro cada quien.
    if (compatibles !== null) {
      await AsyncStorage.setItem('onboarding_compatibility', compatibles.toString());
    }
    router.push('/onboarding/phone');
  }, [compatibles, router]);

  useEffect(() => {
    // Antes esta linea era `Math.floor(Math.random() * 5) + 95`: un numero
    // inventado entre 95 y 99 que se presentaba como el resultado de un
    // analisis. A cada persona que entraba a Nospi se le prometia, en el
    // momento de registrarse, "5 personas 97% compatibles contigo". Despues
    // llegaba a una mesa donde las edades no le cuadraban, y la decepcion no
    // nacia en la mesa: nacia aqui.
    //
    // Ahora se cuenta de verdad, con la MISMA regla con la que se arman las
    // mesas: compatibilidad mutua por edad. El numero que se muestra es el
    // universo real del que despues sale su grupo.
    let vivo = true;
    (async () => {
      try {
        const edadTxt = await AsyncStorage.getItem('onboarding_age');
        const rangoTxt = await AsyncStorage.getItem('onboarding_age_range');
        const edad = edadTxt ? parseInt(edadTxt, 10) : null;
        const rango = rangoTxt ? JSON.parse(rangoTxt) : null;

        if (edad && rango?.min != null && rango?.max != null) {
          const { data, error } = await supabase.rpc('contar_personas_compatibles_por_edad', {
            p_edad: edad,
            p_rango_min: rango.min,
            p_rango_max: rango.max,
          });
          if (!error && vivo) setCompatibles(typeof data === 'number' ? data : null);
        }
      } catch (e) {
        // Si falla, la pantalla no inventa nada: muestra el mensaje neutro.
        console.error('compatibility: no se pudo contar', e);
      }
    })();

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
      setShowResult(true);
    }, 3000);

    return () => {
      vivo = false;
      spinAnimation.stop();
      pulseAnimation.stop();
    };
  }, [spinValue, scaleValue]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Community matches are not registrations for a particular event.
  const sinDato = compatibles === null;
  const cero = compatibles === 0;
  const titular = sinDato ? 'Tu comunidad Nospi' : cero ? 'Tus coincidencias por edad' : 'Hay personas con quienes coincides por edad';
  const mensaje = sinDato
    ? 'No pudimos consultar las coincidencias por edad en este momento. Puedes continuar con tu registro.'
    : cero
      ? 'Por ahora no encontramos coincidencias por edad en la comunidad con el rango que elegiste.'
      : `En la comunidad Nospi hay ${compatibles} ${compatibles === 1 ? 'persona con quien coincides' : 'personas con quienes coincides'} según el rango de edad que elegiste.`;

  return (
    <LinearGradient
      colors={['#1a0010', '#880E4F', '#AD1457']}
      style={styles.gradient}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.content}>
          {!showResult ? (
            <React.Fragment>
              <Text style={styles.title}>Explorando coincidencias en la comunidad Nospi…</Text>
              
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

              {/* "coincidencias perfectas" prometia de nuevo un resultado.
                  Ahora la pantalla describe lo que de verdad esta haciendo. */}
              <Text style={styles.loadingText}>Revisando coincidencias por edad</Text>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <Text style={styles.ctaText}>COMUNIDAD NOSPI</Text>
              {!sinDato && (
                <View style={styles.resultCircle}>
                  <Text style={styles.percentageText}>{compatibles}</Text>
                  <Text style={{ color: '#880E4F', fontSize: 16 }}>{compatibles === 1 ? 'persona' : 'personas'}</Text>
                </View>
              )}

              <Text style={styles.celebrationText}>{titular}</Text>

              <View style={styles.messageContainer}>
                <Text style={styles.messageText}>{mensaje}</Text>
              </View>

              <Text style={styles.ctaText}>Las personas que conocerás dependerán de quiénes se inscriban en cada evento.</Text>

              <TouchableOpacity
                style={styles.inscribeButton}
                onPress={navigateToNext}
                activeOpacity={0.8}
              >
                <Text style={styles.inscribeButtonText}>Continuar</Text>
              </TouchableOpacity>
            </React.Fragment>
          )}
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
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
    color: '#FFFFFF',
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
    borderColor: '#F06292',
    borderStyle: 'solid',
    borderTopColor: 'transparent',
    borderRightColor: '#AD1457',
    borderBottomColor: 'rgba(240,98,146,0.5)',
    borderLeftColor: '#F06292',
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  centerDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#880E4F',
  },
  loadingText: {
    fontSize: 16,
    color: '#FFFFFF',
    textAlign: 'center',
    fontWeight: '600',
  },
  resultCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 8,
    borderColor: '#F06292',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  // Antes aqui iba un porcentaje de 2 digitos. Ahora puede ser un conteo de
  // hasta 4, asi que el tamano baja para que no se salga del circulo.
  percentageText: {
    fontSize: 52,
    fontWeight: 'bold',
    color: '#880E4F',
    lineHeight: 58,
  },
  percentageSymbol: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#880E4F',
    marginTop: -8,
  },
  checkmarkContainer: {
    marginBottom: 24,
  },
  checkmarkCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#880E4F',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmark: {
    fontSize: 32,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  celebrationText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 20,
    textAlign: 'center',
  },
  messageContainer: {
    marginBottom: 24,
    alignItems: 'center',
  },
  messageText: {
    fontSize: 17,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 26,
  },
  ctaText: {
    fontSize: 14,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 24,
    opacity: 0.8,
  },
  inscribeButton: {
    backgroundColor: '#880E4F',
    paddingVertical: 18,
    paddingHorizontal: 48,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.50)',
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
    minWidth: 250,
  },
  inscribeButtonText: {
    color: nospiColors.white,
    fontSize: 18,
    fontWeight: '700',
  },
  // Secundario a proposito: es una salida util, no la accion principal.
  ajustarButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.55)',
    marginBottom: 20,
  },
  ajustarButtonText: {
    color: nospiColors.white,
    fontSize: 15,
    fontWeight: '600',
  },
});
