
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, ActivityIndicator, Modal, Platform } from 'react-native';
import { Image as RNImage } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

WebBrowser.maybeCompleteAuthSession();

const HEADING = '#1a0010';
const MUTED = '#555555';
const ACCENT = '#880E4F';

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

  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      console.log('RegisterScreen: Received URL callback:', url);
      if (url.includes('auth/callback')) {
        console.log('RegisterScreen: OAuth callback detected, navigating to callback screen');
      }
    });
    return () => { subscription.remove(); };
  }, []);

  const showErrorAlert = (title: string, message: string) => {
    console.error(`${title}: ${message}`);
    setErrorModalMessage(message);
    setShowErrorModal(true);
  };

  const handleAppleSignUp = async () => {
    console.log('User tapped Sign up with Apple');
    setLoading(true); setError('');
    try {
      await AsyncStorage.setItem('oauth_flow_type', 'register');
      const redirectUrl = Linking.createURL('auth/callback');
      const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'apple', options: { redirectTo: redirectUrl, skipBrowserRedirect: false } });
      if (error) {
        console.error('Apple OAuth error:', error);
        if (error.message.includes('missing OAuth secret') || error.message.includes('Unsupported provider')) {
          showErrorAlert('Configuración Pendiente', 'El inicio de sesión con Apple no está disponible en este momento. Por favor, usa el registro con email.');
        } else {
          setError('Error al conectar con Apple. Por favor intenta de nuevo.');
        }
        setLoading(false); return;
      }
      if (data.url) {
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
        console.log('RegisterScreen: Apple WebBrowser result type:', result.type);
        if (result.type === 'success' && result.url) {
          const parsedUrl = new URL(result.url);
          const code = parsedUrl.searchParams.get('code');
          let accessToken = parsedUrl.searchParams.get('access_token');
          let refreshToken = parsedUrl.searchParams.get('refresh_token');
          if (!accessToken || !refreshToken) {
            const hash = result.url.split('#')[1] || '';
            const hashParams = new URLSearchParams(hash);
            accessToken = accessToken || hashParams.get('access_token');
            refreshToken = refreshToken || hashParams.get('refresh_token');
          }
          if (code) {
            router.push({ pathname: '/auth/callback', params: { code } });
          } else if (accessToken && refreshToken) {
            router.push({ pathname: '/auth/callback', params: { access_token: accessToken, refresh_token: refreshToken } });
          } else {
            router.push('/auth/callback');
          }
        } else if (result.type === 'cancel') {
          setError('Registro cancelado'); setLoading(false);
        } else {
          setLoading(false);
        }
      }
    } catch (error: any) {
      console.error('Apple sign-up failed:', error);
      setError('Error al registrarse con Apple');
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    console.log('User tapped Sign up with Google');
    setLoading(true); setError('');
    try {
      await AsyncStorage.setItem('oauth_flow_type', 'register');
      const redirectUrl = Linking.createURL('auth/callback');
      const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectUrl, skipBrowserRedirect: false, queryParams: { access_type: 'offline', prompt: 'consent' } } });
      if (error) {
        console.error('Google OAuth error:', error);
        if (error.message.includes('missing OAuth secret') || error.message.includes('Unsupported provider')) {
          showErrorAlert('Configuración Pendiente', 'El inicio de sesión con Google no está disponible en este momento. Por favor, usa el registro con email.');
        } else {
          setError('Error al conectar con Google. Por favor intenta de nuevo.');
        }
        setLoading(false); return;
      }
      if (data.url) {
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
        console.log('RegisterScreen: Google WebBrowser result type:', result.type);
        if (result.type === 'success' && result.url) {
          const parsedUrl = new URL(result.url);
          const code = parsedUrl.searchParams.get('code');
          let accessToken = parsedUrl.searchParams.get('access_token');
          let refreshToken = parsedUrl.searchParams.get('refresh_token');
          if (!accessToken || !refreshToken) {
            const hash = result.url.split('#')[1] || '';
            const hashParams = new URLSearchParams(hash);
            accessToken = accessToken || hashParams.get('access_token');
            refreshToken = refreshToken || hashParams.get('refresh_token');
          }
          if (code) {
            router.push({ pathname: '/auth/callback', params: { code } });
          } else if (accessToken && refreshToken) {
            router.push({ pathname: '/auth/callback', params: { access_token: accessToken, refresh_token: refreshToken } });
          } else {
            router.push('/auth/callback');
          }
        } else if (result.type === 'cancel') {
          setError('Registro cancelado'); setLoading(false);
        } else {
          setLoading(false);
        }
      }
    } catch (error: any) {
      console.error('Google sign-up failed:', error);
      setError('Error al registrarse con Google');
      setLoading(false);
    }
  };

  const handleEmailSignUp = () => {
    console.log('User tapped Sign up with Email');
    setShowEmailForm(true);
  };

  const handleRegister = async () => {
    if (!email || !password || !confirmPassword) { setError('Por favor completa todos los campos'); return; }
    if (password !== confirmPassword) { setError('Las contraseñas no coinciden'); return; }
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return; }
    setLoading(true); setError('');
    console.log('User registering with email:', email);
    try {
      const [interestsData, personalityData, nameData, birthdateData, ageData, genderData, interestedInData, ageRangeData, countryData, cityData, phoneData, photoData, compatibilityData] = await Promise.all([
        AsyncStorage.getItem('onboarding_interests'), AsyncStorage.getItem('onboarding_personality'), AsyncStorage.getItem('onboarding_name'), AsyncStorage.getItem('onboarding_birthdate'), AsyncStorage.getItem('onboarding_age'), AsyncStorage.getItem('onboarding_gender'), AsyncStorage.getItem('onboarding_interested_in'), AsyncStorage.getItem('onboarding_age_range'), AsyncStorage.getItem('onboarding_country'), AsyncStorage.getItem('onboarding_city'), AsyncStorage.getItem('onboarding_phone'), AsyncStorage.getItem('onboarding_photo'), AsyncStorage.getItem('onboarding_compatibility'),
      ]);
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

      const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
      if (authError) { setError(`Error al crear la cuenta: ${authError.message}`); return; }
      if (!authData.user) { setError('Error al crear la cuenta'); return; }
      console.log('Auth user created:', authData.user.id);

      const { error: profileError } = await supabase.from('users').insert({
        id: authData.user.id, email, name, birthdate, age, gender, interested_in: interestedIn,
        age_range_min: ageRange.min, age_range_max: ageRange.max, country, city,
        phone: phoneInfo.phoneNumber, profile_photo_url: photo, interests, personality_traits: personality,
        compatibility_percentage: compatibility, notification_preferences: { whatsapp: false, email: true, sms: false, push: true },
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
      await AsyncStorage.multiRemove(['onboarding_interests','onboarding_personality','onboarding_name','onboarding_birthdate','onboarding_age','onboarding_gender','onboarding_interested_in','onboarding_age_range','onboarding_country','onboarding_city','onboarding_phone','onboarding_photo','onboarding_compatibility']);
      router.replace('/(tabs)/events');
    } catch (error) {
      console.error('Registration failed:', error);
      setError('Error al registrarse. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const googleIconText = 'G';

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>¡Ya casi estás listo!</Text>
          <Text style={styles.subtitle}>Elige cómo quieres registrarte</Text>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.buttonWhite} onPress={handleAppleSignUp} activeOpacity={0.8} disabled={loading}>
              <View style={styles.appleIconContainer}>
                <RNImage source={require('@/assets/images/icon_apple.png')} style={styles.appleIconImage} resizeMode="contain" />
              </View>
              <Text style={styles.buttonTextDark}>Regístrate con Apple</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.buttonWhite} onPress={handleGoogleSignUp} activeOpacity={0.8} disabled={loading}>
              <View style={styles.googleIconContainer}>
                <Text style={styles.googleIcon}>{googleIconText}</Text>
              </View>
              <Text style={styles.buttonTextDark}>Regístrate con Google</Text>
            </TouchableOpacity>
            <View style={styles.emailButtonWrapper}>
              <LinearGradient colors={['#1a0010', '#880E4F', '#AD1457']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.emailButtonGradient}>
                <TouchableOpacity style={styles.emailButtonInner} onPress={handleEmailSignUp} activeOpacity={0.8} disabled={loading}>
                  <Ionicons name="mail-outline" size={22} color="#FFFFFF" style={styles.emailIcon} />
                  <Text style={styles.buttonTextLight}>Inscribirse con el correo electrónico</Text>
                </TouchableOpacity>
              </LinearGradient>
            </View>
          </View>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={ACCENT} />
              <Text style={styles.loadingText}>Procesando...</Text>
            </View>
          ) : null}
          <Text style={styles.termsText}>Al registrarte, aceptas nuestros Términos de Servicio y Política de Privacidad</Text>
        </View>
      </ScrollView>

      {/* Email Registration Modal */}
      <Modal visible={showEmailForm} transparent animationType="slide" onRequestClose={() => setShowEmailForm(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Registro con Email</Text>
            {error ? <Text style={styles.errorTextModal}>{error}</Text> : null}
            <TextInput style={styles.input} placeholder="Email" placeholderTextColor="#999" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
            <View style={styles.passwordWrapper}>
              <TextInput style={styles.passwordInput} placeholder="Contraseña" placeholderTextColor="#999" value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} />
              <TouchableOpacity onPress={() => { console.log('Toggle register password visibility'); setShowPassword(!showPassword); }} style={styles.eyeButton}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color="#666" />
              </TouchableOpacity>
            </View>
            <View style={styles.passwordWrapper}>
              <TextInput style={styles.passwordInput} placeholder="Confirmar Contraseña" placeholderTextColor="#999" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry={!showConfirmPassword} autoCapitalize="none" autoCorrect={false} />
              <TouchableOpacity onPress={() => { console.log('Toggle register confirm password visibility'); setShowConfirmPassword(!showConfirmPassword); }} style={styles.eyeButton}>
                <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color="#666" />
              </TouchableOpacity>
            </View>
            <View style={[styles.registerButtonWrapper, loading && styles.registerButtonDisabled]}>
              <LinearGradient colors={['#1a0010', '#880E4F', '#AD1457']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.registerButtonGradient}>
                <TouchableOpacity style={styles.registerButtonInner} onPress={handleRegister} disabled={loading} activeOpacity={0.8}>
                  {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.registerButtonText}>Registrarse</Text>}
                </TouchableOpacity>
              </LinearGradient>
            </View>
            <TouchableOpacity style={styles.cancelButton} onPress={() => setShowEmailForm(false)} activeOpacity={0.8}>
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Error Modal */}
      <Modal visible={showErrorModal} transparent animationType="fade" onRequestClose={() => setShowErrorModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.errorModalContent}>
            <Text style={styles.errorModalTitle}>⚠️ Configuración Pendiente</Text>
            <Text style={styles.errorModalText}>{errorModalMessage}</Text>
            <View style={styles.errorModalButtonWrapper}>
              <LinearGradient colors={['#1a0010', '#880E4F', '#AD1457']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.errorModalButtonGradient}>
                <TouchableOpacity style={styles.errorModalButtonInner} onPress={() => setShowErrorModal(false)} activeOpacity={0.8}>
                  <Text style={styles.errorModalButtonText}>Entendido</Text>
                </TouchableOpacity>
              </LinearGradient>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  content: { width: '100%', maxWidth: 400, alignSelf: 'center' },
  title: { fontSize: 32, fontWeight: 'bold', color: HEADING, marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 18, color: MUTED, marginBottom: 40, textAlign: 'center' },
  errorText: { fontSize: 14, color: '#FF6B6B', backgroundColor: '#FFF5F5', padding: 12, borderRadius: 8, marginBottom: 16, textAlign: 'center', borderWidth: 1, borderColor: '#FFCDD2' },
  buttonContainer: { gap: 16, marginBottom: 32 },
  buttonWhite: { backgroundColor: '#FFFFFF', paddingVertical: 18, paddingHorizontal: 24, borderRadius: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E5E7EB' },
  emailButtonWrapper: { borderRadius: 30, overflow: 'hidden' },
  emailButtonGradient: { borderRadius: 30 },
  emailButtonInner: { paddingVertical: 18, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  appleIconImage: { width: 28, height: 28 },
  appleIconContainer: { width: 28, height: 28, marginRight: 12, justifyContent: 'center', alignItems: 'center' },
  googleIconContainer: { width: 28, height: 28, marginRight: 12, justifyContent: 'center', alignItems: 'center' },
  googleIcon: { fontSize: 20, color: '#4285F4', fontWeight: 'bold', lineHeight: 24, marginTop: 4 },
  emailIcon: { marginRight: 12 },
  buttonTextDark: { color: '#000000', fontSize: 16, fontWeight: '600' },
  buttonTextLight: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  loadingContainer: { marginVertical: 20, alignItems: 'center' },
  loadingText: { color: HEADING, fontSize: 16, marginTop: 12 },
  termsText: { fontSize: 12, color: MUTED, textAlign: 'center', lineHeight: 18 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalContent: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, width: '100%', maxWidth: 400 },
  modalTitle: { fontSize: 24, fontWeight: 'bold', color: HEADING, marginBottom: 24, textAlign: 'center' },
  errorTextModal: { fontSize: 14, color: '#F44336', backgroundColor: '#FFEBEE', padding: 12, borderRadius: 8, marginBottom: 16, textAlign: 'center' },
  input: { backgroundColor: '#F5F5F5', paddingVertical: 16, paddingHorizontal: 20, borderRadius: 16, fontSize: 16, color: '#333', marginBottom: 16 },
  passwordWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F5F5', borderRadius: 16, marginBottom: 16 },
  passwordInput: { flex: 1, paddingVertical: 16, paddingLeft: 20, paddingRight: 8, fontSize: 16, color: '#333' },
  eyeButton: { paddingHorizontal: 14, justifyContent: 'center', alignSelf: 'stretch' },
  registerButtonWrapper: { borderRadius: 16, overflow: 'hidden', marginBottom: 12 },
  registerButtonGradient: { borderRadius: 16 },
  registerButtonInner: { paddingVertical: 18, alignItems: 'center' },
  registerButtonDisabled: { opacity: 0.6 },
  registerButtonText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  cancelButton: { backgroundColor: '#E0E0E0', paddingVertical: 18, borderRadius: 16, alignItems: 'center' },
  cancelButtonText: { color: '#333', fontSize: 16, fontWeight: '600' },
  errorModalContent: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 32, width: '100%', maxWidth: 400, alignItems: 'center' },
  errorModalTitle: { fontSize: 24, fontWeight: 'bold', color: '#FF6B6B', marginBottom: 16, textAlign: 'center' },
  errorModalText: { fontSize: 16, color: '#333', lineHeight: 24, marginBottom: 24, textAlign: 'center' },
  errorModalButtonWrapper: { borderRadius: 16, overflow: 'hidden', width: '100%' },
  errorModalButtonGradient: { borderRadius: 16 },
  errorModalButtonInner: { paddingVertical: 16, paddingHorizontal: 48, alignItems: 'center' },
  errorModalButtonText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
});
