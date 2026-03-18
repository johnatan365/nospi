
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Modal, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image as RNImage } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

WebBrowser.maybeCompleteAuthSession();

const HEADING = '#1a0010';
const BODY = '#333333';
const MUTED = '#555555';
const ACCENT = '#880E4F';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorModalMessage, setErrorModalMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      console.log('LoginScreen: Received URL callback:', url);
      if (url.includes('auth/callback')) {
        console.log('LoginScreen: OAuth callback detected, navigating to callback screen');
      }
    });
    return () => { subscription.remove(); };
  }, []);

  const showErrorAlert = (title: string, message: string) => {
    console.error(`${title}: ${message}`);
    setErrorModalMessage(message);
    setShowErrorModal(true);
  };

  const handleLogin = async () => {
    if (!email || !password) { setError('Por favor ingresa tu email y contraseña'); return; }
    setLoading(true); setError('');
    console.log('User attempting login with email:', email);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { console.error('Login error:', error); setError('Email o contraseña incorrectos'); return; }
      if (!data.user) { setError('Error al iniciar sesión'); return; }
      console.log('Login successful, user:', data.user.id);
      const { data: profile, error: profileError } = await supabase.from('users').select('id').eq('id', data.user.id).maybeSingle();
      if (profileError) console.error('Error checking profile:', profileError);
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
    setLoading(true); setError('');
    try {
      await AsyncStorage.setItem('oauth_flow_type', 'login');
      console.log('LoginScreen: Stored oauth_flow_type as login');
      const redirectUrl = Linking.createURL('auth/callback');
      console.log('LoginScreen: Google OAuth redirect URL:', redirectUrl);
      const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectUrl, skipBrowserRedirect: false, queryParams: { access_type: 'offline', prompt: 'consent' } } });
      if (error) {
        console.error('Google OAuth error:', error);
        if (error.message.includes('missing OAuth secret') || error.message.includes('Unsupported provider')) {
          showErrorAlert('Configuración Pendiente', 'El inicio de sesión con Google no está disponible en este momento. Por favor usa el inicio de sesión con email.');
        } else {
          setError('Error al conectar con Google. Por favor intenta de nuevo.');
        }
        setLoading(false); return;
      }
      console.log('Google OAuth initiated:', data);
      if (data.url) {
        console.log('LoginScreen: Opening Google OAuth URL');
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
        console.log('LoginScreen: WebBrowser result type:', result.type);
        if (result.type === 'success' && result.url) {
          console.log('LoginScreen: OAuth success, callback URL:', result.url);
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
            console.log('LoginScreen: PKCE code found, navigating to callback screen');
            router.push({ pathname: '/auth/callback', params: { code } });
          } else if (accessToken && refreshToken) {
            console.log('LoginScreen: Implicit tokens found, navigating to callback screen');
            router.push({ pathname: '/auth/callback', params: { access_token: accessToken, refresh_token: refreshToken } });
          } else {
            console.log('LoginScreen: No code or tokens in URL, navigating to callback screen anyway');
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
      if (error.message && (error.message.includes('missing OAuth secret') || error.message.includes('Unsupported provider'))) {
        showErrorAlert('Configuración Pendiente', 'El inicio de sesión con Google no está disponible en este momento. Por favor usa el inicio de sesión con email.');
      } else {
        setError('Error al iniciar sesión con Google');
      }
      setLoading(false);
    }
  };

  const handleAppleLogin = async () => {
    console.log('User tapped Login with Apple');
    setLoading(true); setError('');
    try {
      await AsyncStorage.setItem('oauth_flow_type', 'login');
      const redirectUrl = Linking.createURL('auth/callback');
      const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'apple', options: { redirectTo: redirectUrl, skipBrowserRedirect: false } });
      if (error) {
        console.error('Apple OAuth error:', error);
        if (error.message.includes('missing OAuth secret') || error.message.includes('Unsupported provider')) {
          showErrorAlert('Configuración Pendiente', 'El inicio de sesión con Apple no está disponible en este momento. Por favor usa el inicio de sesión con email.');
        } else {
          setError('Error al conectar con Apple. Por favor intenta de nuevo.');
        }
        setLoading(false); return;
      }
      if (data.url) {
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
        console.log('LoginScreen: Apple WebBrowser result type:', result.type);
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
          setError('Inicio de sesión cancelado');
          setLoading(false);
        } else {
          setLoading(false);
        }
      }
    } catch (error: any) {
      console.error('Apple login failed:', error);
      setError('Error al iniciar sesión con Apple');
      setLoading(false);
    }
  };

  const googleIconText = 'G';

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.content}>
            <Text style={styles.title}>Bienvenido de nuevo</Text>
            <Text style={styles.subtitle}>Inicia sesión para continuar</Text>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <View style={styles.inputContainer}>
              <View style={styles.inputWrapper}>
                <MaterialIcons name="email" size={20} color="#666" style={styles.inputIcon} />
                <TextInput style={styles.inputWithIcon} placeholder="Email" placeholderTextColor="#999" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
              </View>
              <View style={styles.inputWrapper}>
                <MaterialIcons name="lock" size={20} color="#666" style={styles.inputIcon} />
                <TextInput style={styles.inputWithIcon} placeholder="Contraseña" placeholderTextColor="#999" value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} />
                <TouchableOpacity onPress={() => { console.log('Toggle password visibility'); setShowPassword(!showPassword); }} style={styles.eyeButton}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color="#666" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={[styles.loginButtonWrapper, loading && styles.loginButtonDisabled]}>
              <LinearGradient colors={['#1a0010', '#880E4F', '#AD1457']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.loginButtonGradient}>
                <TouchableOpacity style={styles.loginButtonInner} onPress={handleLogin} disabled={loading} activeOpacity={0.8}>
                  {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.loginButtonText}>Iniciar Sesión</Text>}
                </TouchableOpacity>
              </LinearGradient>
            </View>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>O continúa con</Text>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.socialButtonsContainer}>
              <TouchableOpacity style={styles.socialButton} onPress={handleGoogleLogin} disabled={loading} activeOpacity={0.8}>
                <View style={styles.googleIconContainer}><Text style={styles.googleIcon}>{googleIconText}</Text></View>
                <Text style={styles.socialButtonText}>Google</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.socialButton} onPress={handleAppleLogin} disabled={loading} activeOpacity={0.8}>
                <View style={styles.appleIconContainer}>
                  <RNImage source={require('@/assets/images/icon_apple.png')} style={styles.appleIconImage} resizeMode="contain" />
                </View>
                <Text style={styles.socialButtonText}>Apple</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.backButton} onPress={() => { console.log('User pressed back on login'); router.back(); }} activeOpacity={0.8}>
              <Text style={styles.backButtonText}>Volver</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

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
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  content: { width: '100%', maxWidth: 400, alignSelf: 'center' },
  title: { fontSize: 32, fontWeight: 'bold', color: HEADING, marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 18, color: MUTED, marginBottom: 40, textAlign: 'center' },
  errorText: { fontSize: 14, color: '#FF6B6B', backgroundColor: '#FFF5F5', padding: 12, borderRadius: 8, marginBottom: 16, textAlign: 'center', borderWidth: 1, borderColor: '#FFCDD2' },
  inputContainer: { gap: 16, marginBottom: 24 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  inputIcon: { marginLeft: 16, marginRight: 8 },
  inputWithIcon: { flex: 1, paddingVertical: 16, paddingRight: 8, fontSize: 16, color: BODY },
  eyeButton: { paddingHorizontal: 14, justifyContent: 'center', alignSelf: 'stretch' },
  loginButtonWrapper: { borderRadius: 30, overflow: 'hidden', marginBottom: 24 },
  loginButtonGradient: { borderRadius: 30 },
  loginButtonInner: { paddingVertical: 18, alignItems: 'center' },
  loginButtonDisabled: { opacity: 0.6 },
  loginButtonText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  divider: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
  dividerText: { marginHorizontal: 16, fontSize: 14, color: MUTED, fontWeight: '600' },
  socialButtonsContainer: { flexDirection: 'row', gap: 16, marginBottom: 24 },
  socialButton: { flex: 1, backgroundColor: '#FFFFFF', paddingVertical: 16, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E5E7EB', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  googleIconContainer: { width: 28, height: 28, marginRight: 8, justifyContent: 'center', alignItems: 'center' },
  googleIcon: { fontSize: 20, color: '#4285F4', fontWeight: 'bold', lineHeight: 24, marginTop: 4 },
  appleIconImage: { width: 28, height: 28 },
  appleIconContainer: { width: 28, height: 28, marginRight: 8, justifyContent: 'center', alignItems: 'center' },
  socialButtonText: { fontSize: 16, color: BODY, fontWeight: '600' },
  backButton: { alignItems: 'center', paddingVertical: 12 },
  backButtonText: { fontSize: 16, color: MUTED, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorModalContent: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 32, width: '100%', maxWidth: 400, alignItems: 'center' },
  errorModalTitle: { fontSize: 24, fontWeight: 'bold', color: '#FF6B6B', marginBottom: 16, textAlign: 'center' },
  errorModalText: { fontSize: 16, color: BODY, lineHeight: 24, marginBottom: 24, textAlign: 'center' },
  errorModalButtonWrapper: { borderRadius: 16, overflow: 'hidden', width: '100%' },
  errorModalButtonGradient: { borderRadius: 16 },
  errorModalButtonInner: { paddingVertical: 16, paddingHorizontal: 48, alignItems: 'center' },
  errorModalButtonText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
});
