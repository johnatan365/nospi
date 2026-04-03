import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAuth } from '@/contexts/AuthContext';
import { nospiColors } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';

WebBrowser.maybeCompleteAuthSession();

const googleIconSource = require('@/assets/images/38dba063-6bcb-40a2-805f-8a862d8694ef.png');
const appleIconSource = require('@/assets/images/icon_apple.png');

export default function LoginScreen() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Navigate after successful auth (better-auth)
  useEffect(() => {
    if (user) {
      console.log('LoginScreen: user authenticated via AuthContext, navigating to tabs', user.id);
      router.replace('/(tabs)');
    }
  }, [user, router]);

  const handleEmailAuth = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Por favor ingresa tu email y contraseña');
      return;
    }
    if (isSignUp && !name.trim()) {
      setError('Por favor ingresa tu nombre');
      return;
    }

    setSubmitting(true);
    setError('');
    console.log(`LoginScreen: ${isSignUp ? 'sign up' : 'sign in'} with email:`, email);

    try {
      if (isSignUp) {
        // Registro con Supabase
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: name.trim() },
          },
        });

        if (error) {
          console.error('SignUp error:', error);
          if (error.message.includes('already')) {
            setError('Ya existe una cuenta con este email');
          } else {
            setError('Error al crear cuenta. Intenta de nuevo.');
          }
          return;
        }

        if (data.user) {
          console.log('SignUp successful, user:', data.user.id);
          router.replace('/onboarding/name');
        }
      } else {
        // Login con Supabase
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          console.error('Login error:', error);
          setError('Email o contraseña incorrectos');
          return;
        }

        if (!data.user) {
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
      }
    } catch (err: any) {
      console.error('LoginScreen: email auth error:', err);
      setError(isSignUp ? 'Error al crear cuenta. Intenta de nuevo.' : 'Error al iniciar sesión. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApple = async () => {
    console.log('LoginScreen: user tapped Sign in with Apple');
    setError('');
    setSubmitting(true);

    try {
      await AsyncStorage.setItem('oauth_flow_type', 'login');
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
        setError('Error al conectar con Apple. Intenta de nuevo.');
        setSubmitting(false);
        return;
      }

      console.log('Apple OAuth initiated:', data);

      if (data.url) {
        console.log('LoginScreen: Opening Apple OAuth URL');
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
        console.log('LoginScreen: WebBrowser result type:', result.type);

        if (result.type === 'success' && result.url) {
          const callbackUrl = result.url;
          const parsedUrl = new URL(callbackUrl);
          const code = parsedUrl.searchParams.get('code');

          let accessToken = parsedUrl.searchParams.get('access_token');
          let refreshToken = parsedUrl.searchParams.get('refresh_token');
          if (!accessToken || !refreshToken) {
            const hash = callbackUrl.split('#')[1] || '';
            const hashParams = new URLSearchParams(hash);
            accessToken = accessToken || hashParams.get('access_token');
            refreshToken = refreshToken || hashParams.get('refresh_token');
          }

          if (code) {
            router.push({ pathname: '/auth/callback', params: { code } });
          } else if (accessToken && refreshToken) {
            router.push({
              pathname: '/auth/callback',
              params: { access_token: accessToken, refresh_token: refreshToken },
            });
          } else {
            router.push('/auth/callback');
          }
        } else if (result.type === 'cancel') {
          setError('Inicio de sesión cancelado');
          setSubmitting(false);
        } else {
          setSubmitting(false);
        }
      }
    } catch (err: any) {
      console.error('Apple login failed:', err);
      setError('Error al iniciar sesión con Apple');
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    console.log('LoginScreen: user tapped Sign in with Google');
    setError('');
    setSubmitting(true);

    try {
      await AsyncStorage.setItem('oauth_flow_type', 'login');
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
        setError('Error al conectar con Google. Intenta de nuevo.');
        setSubmitting(false);
        return;
      }

      console.log('Google OAuth initiated:', data);

      if (data.url) {
        console.log('LoginScreen: Opening Google OAuth URL');
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
        console.log('LoginScreen: WebBrowser result type:', result.type);

        if (result.type === 'success' && result.url) {
          const callbackUrl = result.url;
          const parsedUrl = new URL(callbackUrl);
          const code = parsedUrl.searchParams.get('code');

          let accessToken = parsedUrl.searchParams.get('access_token');
          let refreshToken = parsedUrl.searchParams.get('refresh_token');
          if (!accessToken || !refreshToken) {
            const hash = callbackUrl.split('#')[1] || '';
            const hashParams = new URLSearchParams(hash);
            accessToken = accessToken || hashParams.get('access_token');
            refreshToken = refreshToken || hashParams.get('refresh_token');
          }

          if (code) {
            router.push({ pathname: '/auth/callback', params: { code } });
          } else if (accessToken && refreshToken) {
            router.push({
              pathname: '/auth/callback',
              params: { access_token: accessToken, refresh_token: refreshToken },
            });
          } else {
            router.push('/auth/callback');
          }
        } else if (result.type === 'cancel') {
          setError('Inicio de sesión cancelado');
          setSubmitting(false);
        } else {
          setSubmitting(false);
        }
      }
    } catch (err: any) {
      console.error('Google login failed:', err);
      setError('Error al iniciar sesión con Google');
      setSubmitting(false);
    }
  };

  const toggleMode = () => {
    if (!isSignUp) {
      // User tapped "Regístrate" → send to welcome screen
      console.log('LoginScreen: user wants to register, redirecting to welcome');
      router.replace('/welcome');
      return;
    }
    // User is in signup mode and tapped "Inicia sesión" → switch to login
    console.log('LoginScreen: toggling mode to sign in');
    setIsSignUp(false);
    setError('');
    setName('');
    setEmail('');
    setPassword('');
  };

  const togglePasswordVisibility = () => {
    console.log('LoginScreen: toggling password visibility');
    setShowPassword(!showPassword);
  };

  const isLoading = loading || submitting;
  const eyeIcon = showPassword ? 'eye-off-outline' : 'eye-outline';
  const titleText = isSignUp ? 'Crear cuenta' : 'Bienvenido de nuevo';
  const subtitleText = isSignUp ? 'Únete a Nospi' : 'Inicia sesión para continuar';
  const submitText = isSignUp ? 'Crear cuenta' : 'Iniciar sesión';
  const toggleText = isSignUp ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate';

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient
        colors={['#1a0010', '#880E4F', '#AD1457']}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={styles.container}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.content}>
              {/* Logo */}
              <Image
                source={require('@/assets/images/fa137ca3-b552-4ac8-9f1e-8268723ace00.png')}
                style={styles.logo}
                resizeMode="contain"
              />

              <Text style={styles.title}>{titleText}</Text>
              <Text style={styles.subtitle}>{subtitleText}</Text>

              {/* Error */}
              {error ? (
                <View style={styles.errorContainer}>
                  <Ionicons name="alert-circle-outline" size={16} color="#FF6B6B" />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              {/* Social buttons — Apple FIRST (App Store requirement) */}
              <TouchableOpacity
                style={styles.appleButton}
                onPress={handleApple}
                disabled={isLoading}
                activeOpacity={0.85}
              >
                <Image source={appleIconSource} style={styles.appleIcon} resizeMode="contain" />
                <Text style={styles.appleButtonText}>Continuar con Apple</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.googleButton}
                onPress={handleGoogle}
                disabled={isLoading}
                activeOpacity={0.85}
              >
                <Image source={googleIconSource} style={styles.googleIcon} resizeMode="contain" />
                <Text style={styles.googleButtonText}>Continuar con Google</Text>
              </TouchableOpacity>

              {/* Divider */}
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>o con email</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Email form */}
              <View style={styles.form}>
                {isSignUp ? (
                  <View style={styles.inputWrapper}>
                    <MaterialIcons name="person" size={20} color="#999" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="Nombre completo"
                      placeholderTextColor="#999"
                      value={name}
                      onChangeText={setName}
                      autoCapitalize="words"
                      autoCorrect={false}
                      editable={!isLoading}
                    />
                  </View>
                ) : null}

                <View style={styles.inputWrapper}>
                  <MaterialIcons name="email" size={20} color="#999" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Email"
                    placeholderTextColor="#999"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!isLoading}
                  />
                </View>

                <View style={styles.inputWrapper}>
                  <MaterialIcons name="lock" size={20} color="#999" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Contraseña"
                    placeholderTextColor="#999"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!isLoading}
                  />
                  <TouchableOpacity
                    onPress={togglePasswordVisibility}
                    style={styles.eyeButton}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name={eyeIcon} size={22} color="#999" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Submit */}
              <TouchableOpacity
                style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
                onPress={handleEmailAuth}
                disabled={isLoading}
                activeOpacity={0.85}
              >
                {isLoading ? (
                  <ActivityIndicator color={nospiColors.white} />
                ) : (
                  <Text style={styles.submitButtonText}>{submitText}</Text>
                )}
              </TouchableOpacity>

              {/* Toggle sign in / sign up */}
              <TouchableOpacity
                style={styles.toggleButton}
                onPress={toggleMode}
                disabled={isLoading}
                activeOpacity={0.7}
              >
                <Text style={styles.toggleText}>{toggleText}</Text>
              </TouchableOpacity>

              {/* Back */}
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => { console.log('LoginScreen: user tapped back'); router.back(); }}
                disabled={isLoading}
                activeOpacity={0.7}
              >
                <Text style={styles.backText}>Volver</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  logo: {
    width: 100,
    height: 100,
    alignSelf: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: nospiColors.white,
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginBottom: 32,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,107,107,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,107,0.4)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 20,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#FF6B6B',
  },
  appleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
    borderRadius: 16,
    paddingVertical: 16,
    marginBottom: 12,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  appleIcon: {
    width: 22,
    height: 22,
  },
  appleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: nospiColors.white,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: nospiColors.white,
    borderRadius: 16,
    paddingVertical: 16,
    marginBottom: 24,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  googleIcon: {
    width: 22,
    height: 22,
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  dividerText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
  },
  form: {
    gap: 14,
    marginBottom: 20,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 14,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 16,
    fontSize: 16,
    color: '#1a1a1a',
  },
  eyeButton: {
    paddingLeft: 8,
    paddingVertical: 4,
  },
  submitButton: {
    backgroundColor: '#880E4F',
    borderRadius: 30,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(240,98,146,0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: nospiColors.white,
    letterSpacing: 0.3,
  },
  toggleButton: {
    alignItems: 'center',
    paddingVertical: 10,
    marginBottom: 4,
  },
  toggleText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  backButton: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  backText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
  },
});