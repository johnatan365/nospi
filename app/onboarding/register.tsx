import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, ActivityIndicator, Modal, Platform, Image as RNImage } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { nospiColors } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

WebBrowser.maybeCompleteAuthSession();

export default function RegisterScreen() {
  const router = useRouter();
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorModalMessage, setErrorModalMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [confirmPasswordFocused, setConfirmPasswordFocused] = useState(false);

  useEffect(() => {
    // Listen for deep link events (OAuth callback)
    const subscription = Linking.addEventListener('url', ({ url }) => {
      console.log('RegisterScreen: Received URL callback:', url);
      
      // Check if this is an OAuth callback
      if (url.includes('auth/callback')) {
        console.log('RegisterScreen: OAuth callback detected, navigating to callback screen');
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

  const handleAppleSignUp = async () => {
    console.log('User tapped Sign up with Apple');
    setLoading(true);
    setError('');

    try {
      // Store registration intent in AsyncStorage so callback knows this is a registration flow
      await AsyncStorage.setItem('oauth_flow_type', 'register');
      console.log('RegisterScreen: Stored oauth_flow_type as register');
      
      const redirectUrl = Linking.createURL('auth/callback');
      console.log('RegisterScreen: Apple OAuth redirect URL:', redirectUrl);

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
            'El inicio de sesión con Apple no está disponible en este momento. Por favor, usa el registro con email o contacta al administrador.'
          );
        } else {
          setError('Error al conectar con Apple. Por favor intenta de nuevo.');
        }
        
        setLoading(false);
        return;
      }

      console.log('Apple OAuth initiated:', data);
      
      if (data.url) {
        console.log('RegisterScreen: Opening Apple OAuth URL');
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
        console.log('RegisterScreen: Apple WebBrowser result type:', result.type);

        if (result.type === 'success' && result.url) {
          console.log('RegisterScreen: Apple OAuth success, callback URL:', result.url);
          const callbackUrl = result.url;

          // PKCE flow: extract the `code` param and let the callback screen exchange it
          const parsedUrl = new URL(callbackUrl);
          const code = parsedUrl.searchParams.get('code');

          // Also check for legacy implicit-flow tokens in query or hash
          let accessToken = parsedUrl.searchParams.get('access_token');
          let refreshToken = parsedUrl.searchParams.get('refresh_token');
          if (!accessToken || !refreshToken) {
            const hash = callbackUrl.split('#')[1] || '';
            const hashParams = new URLSearchParams(hash);
            accessToken = accessToken || hashParams.get('access_token');
            refreshToken = refreshToken || hashParams.get('refresh_token');
          }

          if (code) {
            console.log('RegisterScreen: Apple PKCE code found, navigating to callback screen');
            router.push({ pathname: '/auth/callback', params: { code } });
          } else if (accessToken && refreshToken) {
            console.log('RegisterScreen: Apple implicit tokens found, navigating to callback screen');
            router.push({
              pathname: '/auth/callback',
              params: { access_token: accessToken, refresh_token: refreshToken },
            });
          } else {
            console.log('RegisterScreen: No code or tokens in Apple URL, navigating to callback screen anyway');
            router.push('/auth/callback');
          }
        } else if (result.type === 'cancel') {
          console.log('RegisterScreen: User cancelled Apple OAuth');
          setError('Registro cancelado');
          setLoading(false);
        } else {
          console.log('RegisterScreen: Apple OAuth result type:', result.type);
          setLoading(false);
        }
      }
    } catch (error: any) {
      console.error('Apple sign-up failed:', error);
      
      // Check if it's a configuration error
      if (error.message && (error.message.includes('missing OAuth secret') || error.message.includes('Unsupported provider'))) {
        showErrorAlert(
          'Configuración Pendiente',
          'El inicio de sesión con Apple no está disponible en este momento. Por favor, usa el registro con email o contacta al administrador.'
        );
      } else {
        setError('Error al registrarse con Apple');
      }
      
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    console.log('User tapped Sign up with Google');
    setLoading(true);
    setError('');

    try {
      // Store registration intent in AsyncStorage so callback knows this is a registration flow
      await AsyncStorage.setItem('oauth_flow_type', 'register');
      console.log('RegisterScreen: Stored oauth_flow_type as register');
      
      const redirectUrl = Linking.createURL('auth/callback');
      console.log('RegisterScreen: Google OAuth redirect URL:', redirectUrl);

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
            'El inicio de sesión con Google no está disponible en este momento debido a un problema de configuración.\n\nPor favor:\n1. Usa el registro con email, o\n2. Contacta al administrador para configurar Google OAuth en Supabase\n\nPasos necesarios:\n- Configurar Client ID y Client Secret de Google en Supabase\n- Agregar la URL de redirección en Google Cloud Console'
          );
        } else {
          setError('Error al conectar con Google. Por favor intenta de nuevo.');
        }
        
        setLoading(false);
        return;
      }

      console.log('Google OAuth initiated:', data);
      
      if (data.url) {
        console.log('RegisterScreen: Opening Google OAuth URL');
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
        console.log('RegisterScreen: Google WebBrowser result type:', result.type);

        if (result.type === 'success' && result.url) {
          console.log('RegisterScreen: Google OAuth success, callback URL:', result.url);
          const callbackUrl = result.url;

          // PKCE flow: extract the `code` param and let the callback screen exchange it
          const parsedUrl = new URL(callbackUrl);
          const code = parsedUrl.searchParams.get('code');

          // Also check for legacy implicit-flow tokens in query or hash
          let accessToken = parsedUrl.searchParams.get('access_token');
          let refreshToken = parsedUrl.searchParams.get('refresh_token');
          if (!accessToken || !refreshToken) {
            const hash = callbackUrl.split('#')[1] || '';
            const hashParams = new URLSearchParams(hash);
            accessToken = accessToken || hashParams.get('access_token');
            refreshToken = refreshToken || hashParams.get('refresh_token');
          }

          if (code) {
            console.log('RegisterScreen: Google PKCE code found, navigating to callback screen');
            router.push({ pathname: '/auth/callback', params: { code } });
          } else if (accessToken && refreshToken) {
            console.log('RegisterScreen: Google implicit tokens found, navigating to callback screen');
            router.push({
              pathname: '/auth/callback',
              params: { access_token: accessToken, refresh_token: refreshToken },
            });
          } else {
            console.log('RegisterScreen: No code or tokens in Google URL, navigating to callback screen anyway');
            router.push('/auth/callback');
          }
        } else if (result.type === 'cancel') {
          console.log('RegisterScreen: User cancelled Google OAuth');
          setError('Registro cancelado');
          setLoading(false);
        } else {
          console.log('RegisterScreen: Google OAuth result type:', result.type);
          setLoading(false);
        }
      }
    } catch (error: any) {
      console.error('Google sign-up failed:', error);
      
      // Check if it's a configuration error
      if (error.message && (error.message.includes('missing OAuth secret') || error.message.includes('Unsupported provider'))) {
        showErrorAlert(
          'Configuración Pendiente',
          'El inicio de sesión con Google no está disponible en este momento debido a un problema de configuración.\n\nPor favor:\n1. Usa el registro con email, o\n2. Contacta al administrador para configurar Google OAuth en Supabase\n\nPasos necesarios:\n- Configurar Client ID y Client Secret de Google en Supabase\n- Agregar la URL de redirección en Google Cloud Console'
        );
      } else {
        setError('Error al registrarse con Google');
      }
      
      setLoading(false);
    }
  };

  const handleEmailSignUp = () => {
    console.log('User tapped Sign up with Email');
    setShowEmailForm(true);
  };

  const handleRegister = async () => {
    if (!email || !password || !confirmPassword) {
      setError('Por favor completa todos los campos');
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setLoading(true);
    setError('');
    console.log('User registering with email:', email);

    try {
      // Get all onboarding data from AsyncStorage
      const interestsData = await AsyncStorage.getItem('onboarding_interests');
      const personalityData = await AsyncStorage.getItem('onboarding_personality');
      const nameData = await AsyncStorage.getItem('onboarding_name');
      const birthdateData = await AsyncStorage.getItem('onboarding_birthdate');
      const ageData = await AsyncStorage.getItem('onboarding_age');
      const genderData = await AsyncStorage.getItem('onboarding_gender');
      const interestedInData = await AsyncStorage.getItem('onboarding_interested_in');
      const ageRangeData = await AsyncStorage.getItem('onboarding_age_range');
      const countryData = await AsyncStorage.getItem('onboarding_country');
      const cityData = await AsyncStorage.getItem('onboarding_city');
      const phoneData = await AsyncStorage.getItem('onboarding_phone');
      const photoData = await AsyncStorage.getItem('onboarding_photo');
      const compatibilityData = await AsyncStorage.getItem('onboarding_compatibility');

      console.log('Retrieved onboarding data:', {
        interests: interestsData,
        personality: personalityData,
        name: nameData,
        birthdate: birthdateData,
        age: ageData,
        gender: genderData,
        interestedIn: interestedInData,
        ageRange: ageRangeData,
        country: countryData,
        city: cityData,
        phone: phoneData,
        photo: photoData,
        compatibility: compatibilityData,
      });

      const interests = interestsData ? JSON.parse(interestsData) : [];
      const personality = personalityData ? JSON.parse(personalityData) : [];
      const name = nameData || '';
      const birthdate = birthdateData || '';
      const age = ageData ? parseInt(ageData) : 18;
      const gender = genderData || 'hombre';
      const interestedIn = interestedInData || 'ambos';
      const ageRange = ageRangeData ? JSON.parse(ageRangeData) : { min: 18, max: 60 };
      const country = countryData || 'Colombia';
      const city = cityData || 'Medellín';
      const phoneInfo = phoneData ? JSON.parse(phoneData) : { phoneNumber: '' };
      const photo = photoData || null;
      const compatibility = compatibilityData ? parseInt(compatibilityData) : 95;

      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) {
        console.error('Auth registration error:', authError);
        setError(`Error al crear la cuenta: ${authError.message}`);
        return;
      }

      if (!authData.user) {
        console.error('No user data returned from auth');
        setError('Error al crear la cuenta');
        return;
      }

      console.log('Auth user created:', authData.user.id);

      // Create user profile in users table
      const { error: profileError } = await supabase
        .from('users')
        .insert({
          id: authData.user.id,
          email,
          name,
          birthdate,
          age,
          gender,
          interested_in: interestedIn,
          age_range_min: ageRange.min,
          age_range_max: ageRange.max,
          country,
          city,
          phone: phoneInfo.phoneNumber,
          profile_photo_url: photo,
          interests: interests,
          personality_traits: personality,
          compatibility_percentage: compatibility,
          notification_preferences: {
            whatsapp: false,
            email: true,
            sms: false,
            push: true,
          },
        });

      if (profileError) {
        console.error('Profile creation error:', profileError);
        if (profileError.message.includes('users_phone_key') || profileError.message.includes('duplicate key')) {
          setError('Este número de celular ya está registrado. Por favor usa otro número o inicia sesión con tu cuenta existente.');
        } else if (profileError.message.includes('users_email_key') || profileError.message.includes('email')) {
          setError('Este correo ya está registrado. Por favor inicia sesión con tu cuenta existente.');
        } else {
          setError('Error al crear el perfil. Por favor intenta de nuevo.');
        }
        return;
      }

      console.log('User profile created successfully');

      // Clear onboarding data
      await AsyncStorage.multiRemove([
        'onboarding_interests',
        'onboarding_personality',
        'onboarding_name',
        'onboarding_birthdate',
        'onboarding_age',
        'onboarding_gender',
        'onboarding_interested_in',
        'onboarding_age_range',
        'onboarding_country',
        'onboarding_city',
        'onboarding_phone',
        'onboarding_photo',
        'onboarding_compatibility',
      ]);

      // Navigate to events screen
      router.replace('/(tabs)/events');
    } catch (error) {
      console.error('Registration failed:', error);
      setError('Error al registrarse. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const googleIconSource = require('@/assets/images/38dba063-6bcb-40a2-805f-8a862d8694ef.png');

  return (
    <LinearGradient
      colors={['#1a0010', '#880E4F', '#AD1457']}
      style={styles.gradient}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>¡Ya casi estás listo!</Text>
          <Text style={styles.subtitle}>Elige cómo quieres registrarte</Text>
          
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          
          <View style={styles.buttonContainer}>
            <TouchableOpacity 
              style={styles.buttonWhite}
              onPress={handleAppleSignUp}
              activeOpacity={0.8}
              disabled={loading}
            >
              <View style={styles.appleIconContainer}>
                <RNImage source={require('@/assets/images/icon_apple.png')} style={styles.appleIconImage} resizeMode="contain" />
              </View>
              <Text style={styles.buttonTextDark}>Regístrate con Apple</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.buttonWhite}
              onPress={handleGoogleSignUp}
              activeOpacity={0.8}
              disabled={loading}
            >
              <View style={styles.googleIconContainer}>
                <RNImage source={googleIconSource} style={styles.googleIconImage} resizeMode="contain" />
              </View>
              <Text style={styles.buttonTextDark}>Regístrate con Google</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.buttonDark}
              onPress={handleEmailSignUp}
              activeOpacity={0.8}
              disabled={loading}
            >
              <Ionicons name="mail-outline" size={22} color={nospiColors.white} style={styles.emailIcon} />
              <Text style={styles.buttonTextLight}>Inscribirse con el correo electrónico</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={nospiColors.purpleDark} />
              <Text style={styles.loadingText}>Procesando...</Text>
            </View>
          ) : null}

          <Text style={styles.termsText}>
            Al registrarte, aceptas nuestros Términos de Servicio y Política de Privacidad
          </Text>
        </View>
      </ScrollView>

      {/* Email Registration Modal */}
      <Modal
        visible={showEmailForm}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEmailForm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Registro con Email</Text>

            {error ? <Text style={styles.errorTextModal}>{error}</Text> : null}

            <TextInput
              style={[styles.input, emailFocused && styles.inputFocused]}
              placeholder="Email"
              placeholderTextColor="#999"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              selectionColor="#880E4F"
              underlineColorAndroid="transparent"
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
            />

            <View style={[styles.passwordWrapper, passwordFocused && styles.passwordWrapperFocused]}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Contraseña"
                placeholderTextColor="#999"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                selectionColor="#880E4F"
                underlineColorAndroid="transparent"
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
              />
              <TouchableOpacity
                onPress={() => { console.log('Toggle register password visibility'); setShowPassword(!showPassword); }}
                style={styles.eyeButton}
              >
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color="#666" />
              </TouchableOpacity>
            </View>

            <View style={[styles.passwordWrapper, confirmPasswordFocused && styles.passwordWrapperFocused]}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Confirmar Contraseña"
                placeholderTextColor="#999"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                autoCorrect={false}
                selectionColor="#880E4F"
                underlineColorAndroid="transparent"
                onFocus={() => setConfirmPasswordFocused(true)}
                onBlur={() => setConfirmPasswordFocused(false)}
              />
              <TouchableOpacity
                onPress={() => { console.log('Toggle register confirm password visibility'); setShowConfirmPassword(!showConfirmPassword); }}
                style={styles.eyeButton}
              >
                <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color="#666" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.registerButton, loading && styles.registerButtonDisabled]}
              onPress={handleRegister}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color={nospiColors.white} />
              ) : (
                <Text style={styles.registerButtonText}>Registrarse</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowEmailForm(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: '#FFFFFF',
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
  buttonContainer: {
    gap: 16,
    marginBottom: 32,
  },
  buttonWhite: {
    backgroundColor: nospiColors.white,
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonDark: {
    backgroundColor: nospiColors.purpleDark,
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  appleIconImage: {
    width: 28,
    height: 28,
  },
  appleIconContainer: {
    width: 28,
    height: 28,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appleIcon: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  googleIconContainer: {
    width: 28,
    height: 28,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  googleIconImage: {
    width: 22,
    height: 22,
  },
  emailIcon: {
    marginRight: 12,
  },
  buttonTextDark: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonTextLight: {
    color: nospiColors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    marginVertical: 20,
    alignItems: 'center',
  },
  loadingText: {
    color: nospiColors.purpleDark,
    fontSize: 16,
    marginTop: 12,
  },
  termsText: {
    fontSize: 12,
    color: '#FFFFFF',
    opacity: 0.85,
    textAlign: 'center',
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: nospiColors.white,
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 24,
    textAlign: 'center',
  },
  errorTextModal: {
    fontSize: 14,
    color: '#F44336',
    backgroundColor: '#FFEBEE',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#F5F5F5',
    borderWidth: 2,
    borderColor: 'transparent',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
    fontSize: 16,
    color: '#333',
    marginBottom: 16,
  },
  inputFocused: {
    borderColor: 'rgba(240, 98, 146, 0.50)',
  },
  passwordWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 16,
    marginBottom: 16,
  },
  passwordWrapperFocused: {
    borderColor: 'rgba(240, 98, 146, 0.50)',
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 16,
    paddingLeft: 20,
    paddingRight: 8,
    fontSize: 16,
    color: '#333',
  },
  eyeButton: {
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  registerButton: {
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
    marginBottom: 12,
  },
  registerButtonDisabled: {
    backgroundColor: 'rgba(136, 14, 79, 0.4)',
    borderColor: 'rgba(255, 255, 255, 0.20)',
    shadowOpacity: 0,
    elevation: 0,
  },
  registerButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  cancelButton: {
    backgroundColor: '#E0E0E0',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
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