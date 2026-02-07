
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { useRouter, Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Por favor ingresa tu email y contraseña');
      return;
    }

    setLoading(true);
    setError('');
    console.log('User attempting login with email:', email);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('Login error:', error);
        setError('Email o contraseña incorrectos');
        return;
      }

      console.log('Login successful, user:', data.user?.id);
      router.replace('/(tabs)/events');
    } catch (error) {
      console.error('Login failed:', error);
      setError('Error al iniciar sesión. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    console.log('User tapped Google login');
    setLoading(true);
    setError('');

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: 'nospi://auth/callback',
        },
      });

      if (error) {
        console.error('Google OAuth error:', error);
        setError('Error al conectar con Google');
        return;
      }

      console.log('Google OAuth initiated:', data);
    } catch (error) {
      console.error('Google login failed:', error);
      setError('Error al iniciar sesión con Google');
    } finally {
      setLoading(false);
    }
  };

  const handleAppleLogin = async () => {
    console.log('User tapped Apple login');
    setLoading(true);
    setError('');

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo: 'nospi://auth/callback',
        },
      });

      if (error) {
        console.error('Apple OAuth error:', error);
        setError('Error al conectar con Apple');
        return;
      }

      console.log('Apple OAuth initiated:', data);
    } catch (error) {
      console.error('Apple login failed:', error);
      setError('Error al iniciar sesión con Apple');
    } finally {
      setLoading(false);
    }
  };

  const appleIconText = '';
  const googleIconText = 'G';

  return (
    <LinearGradient
      colors={[nospiColors.purpleDark, nospiColors.purpleMid, nospiColors.purpleLight]}
      style={styles.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <Stack.Screen options={{ headerShown: true, title: 'Iniciar Sesión', headerBackTitle: 'Atrás' }} />
      
      {/* Background Pattern - Romantic/Dating Theme from Image */}
      <View style={styles.patternContainer}>
        {/* Couple dining */}
        <Text style={[styles.patternEmoji, { top: '10%', left: '8%' }]}>👫</Text>
        {/* Hearts */}
        <Text style={[styles.patternEmoji, { top: '15%', right: '12%', fontSize: 28 }]}>💕</Text>
        <Text style={[styles.patternEmoji, { top: '48%', left: '10%', fontSize: 32 }]}>❤️</Text>
        <Text style={[styles.patternEmoji, { top: '75%', right: '8%', fontSize: 26 }]}>💗</Text>
        {/* Drinks */}
        <Text style={[styles.patternEmoji, { top: '22%', right: '10%', fontSize: 36 }]}>🍸</Text>
        <Text style={[styles.patternEmoji, { top: '68%', left: '15%', fontSize: 34 }]}>🥂</Text>
        {/* Cityscape */}
        <Text style={[styles.patternEmoji, { top: '32%', left: '45%', fontSize: 38 }]}>🏙️</Text>
        {/* Moon and stars */}
        <Text style={[styles.patternEmoji, { top: '18%', left: '25%', fontSize: 35 }]}>🌙</Text>
        <Text style={[styles.patternEmoji, { top: '12%', right: '35%', fontSize: 20 }]}>✨</Text>
        <Text style={[styles.patternEmoji, { top: '38%', right: '8%', fontSize: 22 }]}>⭐</Text>
        {/* Dining */}
        <Text style={[styles.patternEmoji, { top: '55%', right: '15%', fontSize: 36 }]}>🍽️</Text>
        {/* Group of people */}
        <Text style={[styles.patternEmoji, { top: '78%', left: '35%', fontSize: 38 }]}>👥</Text>
        {/* Phone with heart */}
        <Text style={[styles.patternEmoji, { top: '62%', right: '28%', fontSize: 32 }]}>📱</Text>
        {/* Champagne bottles */}
        <Text style={[styles.patternEmoji, { top: '42%', left: '22%', fontSize: 32 }]}>🍾</Text>
        {/* Party decorations */}
        <Text style={[styles.patternEmoji, { top: '25%', left: '65%', fontSize: 28 }]}>🎉</Text>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Bienvenido de nuevo</Text>
          <Text style={styles.subtitle}>Inicia sesión para continuar</Text>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="rgba(255, 255, 255, 0.6)"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TextInput
              style={styles.input}
              placeholder="Contraseña"
              placeholderTextColor="rgba(255, 255, 255, 0.6)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TouchableOpacity
              style={[styles.loginButton, loading && styles.loginButtonDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color={nospiColors.purpleDark} />
              ) : (
                <Text style={styles.loginButtonText}>Iniciar Sesión</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>O continúa con</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.socialButtons}>
            <TouchableOpacity
              style={styles.socialButton}
              onPress={handleGoogleLogin}
              disabled={loading}
              activeOpacity={0.8}
            >
              <View style={styles.googleIconContainer}>
                <Text style={styles.googleIcon}>{googleIconText}</Text>
              </View>
              <Text style={styles.socialButtonText}>Google</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.socialButton}
              onPress={handleAppleLogin}
              disabled={loading}
              activeOpacity={0.8}
            >
              <View style={styles.appleIconContainer}>
                <Text style={styles.appleIcon}>{appleIconText}</Text>
              </View>
              <Text style={styles.socialButtonText}>Apple</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
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
    opacity: 0.12,
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
    fontSize: 16,
    color: nospiColors.white,
    opacity: 0.9,
    marginBottom: 32,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#FF6B6B',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    textAlign: 'center',
  },
  form: {
    marginBottom: 24,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
    fontSize: 16,
    color: nospiColors.white,
    marginBottom: 16,
  },
  loginButton: {
    backgroundColor: nospiColors.white,
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  loginButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    shadowOpacity: 0,
    elevation: 0,
  },
  loginButtonText: {
    color: nospiColors.purpleDark,
    fontSize: 18,
    fontWeight: '700',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  dividerText: {
    color: nospiColors.white,
    fontSize: 14,
    marginHorizontal: 16,
    opacity: 0.8,
  },
  socialButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  socialButton: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  googleIconContainer: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  googleIcon: {
    fontSize: 16,
    color: '#4285F4',
    fontWeight: 'bold',
  },
  appleIconContainer: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
    borderRadius: 10,
  },
  appleIcon: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  socialButtonText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
  },
});
