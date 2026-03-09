
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Modal, Platform } from 'react-native';
import { Image as RNImage } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, Stack } from 'expo-router';
import { nospiColors } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorModalMessage, setErrorModalMessage] = useState('');

  useEffect(() => {
    // Listen for deep link events (OAuth callback)
    const subscription = Linking.addEventListener('url', ({ url }) => {
      console.log('LoginScreen: Received URL callback:', url);
      
      // Check if this is an OAuth callback
      if (url.includes('auth/callback')) {
        console.log('LoginScreen: OAuth callback detected, navigating to callback screen');
        // The callback screen will handle the session
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const showErrorAlert = (title: string, message: string) => {
    console.error(`${title}: ${message}`);
    setErrorModalMessage(message);
    setShowErrorModal(true);
  };

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

      if (!data.user) {
        console.error('No user data returned');
        setError('Error al iniciar sesión');
        return;
      }

      console.log('Login successful, user:', data.user.id);

      // Check if user has a profile
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('id')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profileError) {
        console.error('Error checking profile:', profileError);
      }

      if (!profile) {
        console.log('No profile found, redirecting to onboarding');
        router.replace('/onboarding/name');
      } else {
        console.log('Profile found, redirecting to events');
        router.replace('/(tabs)/events');
      }
    } catch (error) {
      console.error('Login failed:', error);
      setError('Error al iniciar sesión. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    console.log('User tapped Login with Google');
    setLoading(true);
    setError('');

    try {
      // Store login intent in AsyncStorage so callback knows this is a login flow
      await AsyncStorage.setItem('oauth_flow_type', 'login');
      console.log('LoginScreen: Stored oauth_flow_type as login');
      
      const redirectUrl = Linking.createURL('auth/callback');
      console.log('LoginScreen: Google OAuth redirect URL:', redirectUrl);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: false,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) {
        console.error('Google OAuth error:', error);
        
        // Check for specific OAuth configuration errors
        if (error.message.includes('missing OAuth secret') || error.message.includes('Unsupported provider')) {
          showErrorAlert(
            'Configuración Pendiente',
            'El inicio de sesión con Google no está disponible en este momento debido a un problema de configuración.\n\nPor favor:\n1. Usa el inicio de sesión con email, o\n2. Contacta al administrador para configurar Google OAuth en Supabase\n\nPasos necesarios:\n- Configurar Client ID y Client Secret de Google en Supabase\n- Agregar la URL de redirección en Google Cloud Console'
          );
        } else {
          setError('Error al conectar con Google. Por favor intenta de nuevo.');
        }
        
        setLoading(false);
        return;
      }

      console.log('Google OAuth initiated:', data);
      
      if (data.url) {
        console.log('LoginScreen: Opening Google OAuth URL');
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
        console.log('LoginScreen: WebBrowser result:', result);
        
        if (result.type === 'success' && result.url) {
          console.log('LoginScreen: OAuth success, callback URL:', result.url);
          const callbackUrl = result.url;
          
          const url = new URL(callbackUrl);
          const accessToken = url.searchParams.get('access_token');
          const refreshToken = url.searchParams.get('refresh_token');
          
          if (accessToken && refreshToken) {
            console.log('LoginScreen: Tokens found in callback URL, navigating to callback screen');
            router.push({
              pathname: '/auth/callback',
              params: {
                access_token: accessToken,
                refresh_token: refreshToken,
                type: 'recovery',
              },
            });
          } else {
            console.log('LoginScreen: No tokens in URL, navigating to callback screen anyway');
            router.push('/auth/callback');
          }
        } else if (result.type === 'cancel') {
          console.log('LoginScreen: User cancelled OAuth');
          setError('Inicio de sesión cancelado');
          setLoading(false);
        } else {
          console.log('LoginScreen: OAuth result type:', result.type);
          setLoading(false);
        }
      }
    } catch (error: any) {
      console.error('Google login failed:', error);
      
      // Check if it's a configuration error
      if (error.message && (error.message.includes('missing OAuth secret') || error.message.includes('Unsupported provider'))) {
        showErrorAlert(
          'Configuración Pendiente',
          'El inicio de sesión con Google no está disponible en este momento debido a un problema de configuración.\n\nPor favor:\n1. Usa el inicio de sesión con email, o\n2. Contacta al administrador para configurar Google OAuth en Supabase\n\nPasos necesarios:\n- Configurar Client ID y Client Secret de Google en Supabase\n- Agregar la URL de redirección en Google Cloud Console'
        );
      } else {
        setError('Error al iniciar sesión con Google');
      }
      
      setLoading(false);
    }
  };

  const handleAppleLogin = async () => {
    console.log('User tapped Login with Apple');
    setLoading(true);
    setError('');

    try {
      // Store login intent in AsyncStorage so callback knows this is a login flow
      await AsyncStorage.setItem('oauth_flow_type', 'login');
      console.log('LoginScreen: Stored oauth_flow_type as login');
      
      const redirectUrl = Linking.createURL('auth/callback');
      console.log('LoginScreen: Apple OAuth redirect URL:', redirectUrl);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: false,
        },
      });

      if (error) {
        console.error('Apple OAuth error:', error);
        
        // Check for specific OAuth configuration errors
        if (error.message.includes('missing OAuth secret') || error.message.includes('Unsupported provider')) {
          showErrorAlert(
            'Configuración Pendiente',
            'El inicio de sesión con Apple no está disponible en este momento. Por favor, usa el inicio de sesión con email o contacta al administrador.'
          );
        } else {
          setError('Error al conectar con Apple. Por favor intenta de nuevo.');
        }
        
        setLoading(false);
        return;
      }

      console.log('Apple OAuth initiated:', data);
      
      if (data.url) {
        console.log('LoginScreen: Opening Apple OAuth URL');
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
        console.log('LoginScreen: WebBrowser result:', result);
        
        if (result.type === 'success' && result.url) {
          console.log('LoginScreen: OAuth success, callback URL:', result.url);
          const callbackUrl = result.url;
          
          const url = new URL(callbackUrl);
          const accessToken = url.searchParams.get('access_token');
          const refreshToken = url.searchParams.get('refresh_token');
          
          if (accessToken && refreshToken) {
            console.log('LoginScreen: Tokens found in callback URL, navigating to callback screen');
            router.push({
              pathname: '/auth/callback',
              params: {
                access_token: accessToken,
                refresh_token: refreshToken,
                type: 'recovery',
              },
            });
          } else {
            console.log('LoginScreen: No tokens in URL, navigating to callback screen anyway');
            router.push('/auth/callback');
          }
        } else if (result.type === 'cancel') {
          console.log('LoginScreen: User cancelled OAuth');
          setError('Inicio de sesión cancelado');
          setLoading(false);
        } else {
          console.log('LoginScreen: OAuth result type:', result.type);
          setLoading(false);
        }
      }
    } catch (error: any) {
      console.error('Apple login failed:', error);
      
      // Check if it's a configuration error
      if (error.message && (error.message.includes('missing OAuth secret') || error.message.includes('Unsupported provider'))) {
        showErrorAlert(
          'Configuración Pendiente',
          'El inicio de sesión con Apple no está disponible en este momento. Por favor, usa el inicio de sesión con email o contacta al administrador.'
        );
      } else {
        setError('Error al iniciar sesión con Apple');
      }
      
      setLoading(false);
    }
  };

  const appleIconText = '';
  const googleIconText = 'G';

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient
        colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.content}>
            <Text style={styles.title}>Bienvenido de nuevo</Text>
            <Text style={styles.subtitle}>Inicia sesión para continuar</Text>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor="#999"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <TextInput
                style={styles.input}
                placeholder="Contraseña"
                placeholderTextColor="#999"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <TouchableOpacity
              style={[styles.loginButton, loading && styles.loginButtonDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color={nospiColors.white} />
              ) : (
                <Text style={styles.loginButtonText}>Iniciar Sesión</Text>
              )}
            </TouchableOpacity>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>O continúa con</Text>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.socialButtonsContainer}>
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
                  <RNImage source={require('@/assets/images/icon_apple.png')} style={styles.appleIconImage} resizeMode="contain" />
                </View>
                <Text style={styles.socialButtonText}>Apple</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
              activeOpacity={0.8}
            >
              <Text style={styles.backButtonText}>Volver</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Error Modal for OAuth Configuration Issues */}
        <Modal
          visible={showErrorModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowErrorModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.errorModalContent}>
              <Text style={styles.errorModalTitle}>⚠️ Configuración Pendiente</Text>
              <Text style={styles.errorModalText}>{errorModalMessage}</Text>
              <TouchableOpacity
                style={styles.errorModalButton}
                onPress={() => setShowErrorModal(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.errorModalButtonText}>Entendido</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </LinearGradient>
    </>
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
    color: nospiColors.purpleDark,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: nospiColors.purpleDark,
    opacity: 0.8,
    marginBottom: 40,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#FF6B6B',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    textAlign: 'center',
  },
  inputContainer: {
    gap: 16,
    marginBottom: 24,
  },
  input: {
    backgroundColor: nospiColors.white,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
    fontSize: 16,
    color: '#333',
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  loginButton: {
    backgroundColor: nospiColors.purpleDark,
    paddingVertical: 18,
    borderRadius: 30,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  loginButtonDisabled: {
    backgroundColor: nospiColors.purpleMid,
    opacity: 0.6,
  },
  loginButtonText: {
    color: nospiColors.white,
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
    backgroundColor: nospiColors.purpleDark,
    opacity: 0.2,
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 14,
    color: nospiColors.purpleDark,
    opacity: 0.6,
  },
  socialButtonsContainer: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
  },
  socialButton: {
    flex: 1,
    backgroundColor: nospiColors.white,
    paddingVertical: 16,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  googleIconContainer: {
    width: 24,
    height: 24,
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  googleIcon: {
    fontSize: 18,
    color: '#4285F4',
    fontWeight: 'bold',
  },
  appleIconContainer: {
    width: 24,
    height: 24,
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
    borderRadius: 12,
  },
  appleIcon: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  socialButtonText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '600',
  },
  backButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  backButtonText: {
    fontSize: 16,
    color: nospiColors.purpleDark,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorModalContent: {
    backgroundColor: nospiColors.white,
    borderRadius: 24,
    padding: 32,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  errorModalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FF6B6B',
    marginBottom: 16,
    textAlign: 'center',
  },
  errorModalText: {
    fontSize: 16,
    color: '#333',
    lineHeight: 24,
    marginBottom: 24,
    textAlign: 'center',
  },
  errorModalButton: {
    backgroundColor: nospiColors.purpleDark,
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 16,
    alignItems: 'center',
  },
  errorModalButtonText: {
    color: nospiColors.white,
    fontSize: 18,
    fontWeight: '700',
  },
});
