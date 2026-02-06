
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { nospiColors } from '@/constants/Colors';

export default function RegisterScreen() {
  const router = useRouter();

  const handleAppleSignUp = () => {
    console.log('User tapped Sign up with Apple');
    // TODO: Implement Apple Sign In
  };

  const handleGoogleSignUp = () => {
    console.log('User tapped Sign up with Google');
    // TODO: Implement Google Sign In
  };

  const handleEmailSignUp = () => {
    console.log('User tapped Sign up with Email');
    // TODO: Navigate to email registration screen
  };

  return (
    <LinearGradient
      colors={[nospiColors.purpleDark, nospiColors.purpleMid, nospiColors.purpleLight]}
      style={styles.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>¡Ya casi estás listo!</Text>
          <Text style={styles.subtitle}>Elige cómo quieres registrarte</Text>
          
          <View style={styles.buttonContainer}>
            <TouchableOpacity 
              style={styles.button}
              onPress={handleAppleSignUp}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonIcon}>🍎</Text>
              <Text style={styles.buttonText}>Regístrate con Apple</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.button}
              onPress={handleGoogleSignUp}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonIcon}>🔍</Text>
              <Text style={styles.buttonText}>Regístrate con Google</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.button}
              onPress={handleEmailSignUp}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonIcon}>✉️</Text>
              <Text style={styles.buttonText}>Regístrate con correo electrónico</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.termsText}>
            Al registrarte, aceptas nuestros Términos de Servicio y Política de Privacidad
          </Text>
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
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: nospiColors.white,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: nospiColors.white,
    opacity: 0.9,
    marginBottom: 40,
    textAlign: 'center',
  },
  buttonContainer: {
    gap: 16,
    marginBottom: 32,
  },
  button: {
    backgroundColor: nospiColors.white,
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  buttonText: {
    color: nospiColors.purpleDark,
    fontSize: 16,
    fontWeight: '700',
  },
  termsText: {
    fontSize: 12,
    color: nospiColors.white,
    opacity: 0.8,
    textAlign: 'center',
    lineHeight: 18,
  },
});
