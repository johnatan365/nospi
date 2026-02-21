
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { useRouter, Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';

// CRITICAL: Call this at the top level to complete auth sessions
WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    console.log('LoginScreen: Monitoring auth state changes');
    
    // CRITICAL: Listen for auth state changes to handle OAuth redirect
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('LoginScreen: Auth state changed:', event, 'Session exists:', !!session);
      
      // CRITICAL: Handle SIGNED_IN event (fires after OAuth redirect on web)
      if (session) {
        console.log('LoginScreen: Session detected, user ID:', session.user?.id);
        setLoading(false); // Clear loading state
        
        // Check if user profile exists
        const { data: existingProfile, error: profileError } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle();

        if (profileError) {
          console.error('LoginScreen: Error checking profile:', profileError);
        }

        // If profile doesn't exist, create a basic one
        if (!existingProfile) {
          console.log('LoginScreen: Creating new profile for OAuth user');
          
          const { error: createProfileError } = await supabase
            .from('users')
            .insert({
              id: session.user.id,
              email: session.user.email,
              name: session.user.user_metadata?.full_name || '',
              birthdate: '',
              age: 18,
              gender: 'hombre',
              interested_in: 'ambos',
              age_range_min: 18,
              age_range_max: 60,
              country: 'Colombia',
              city: 'Medellín',
              phone: '',
              profile_photo_url: session.user.user_metadata?.avatar_url || null,
              interests: [],
              personality_traits: [],
              compatibility_percentage: 95,
              notification_preferences: {
                whatsapp: false,
                email: true,
                sms: false,
                push: true,
              },
            });

          if (createProfileError) {
            console.error('LoginScreen: Error creating profile:', createProfileError);
          }
        }

        // Navigate to events screen
        console.log('LoginScreen: Navigating to events screen');
        router.replace('/(tabs)/events');
      } else if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
        console.log('LoginScreen: User signed out or deleted');
        setLoading(false);
      }
    });

    return () => {
      console.log('LoginScreen: Cleaning up auth listener');
      authListener.subscription.unsubscribe();
    };
  }, [router]);

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
        setLoading(false);
        return;
      }

      console.log('Login successful, user:', data.user?.id);
      // Don't set loading to false here - let the auth state change handler do it
      router.replace('/(tabs)/events');
    } catch (error) {
      console.error('Login failed:', error);
      setError('Error al iniciar sesión. Intenta de nuevo.');
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    console.log('User tapped Google login');
    setLoading(true);
    setError('');

    try {
      // CRITICAL: Use AuthSession.makeRedirectUri for proper PKCE flow
      const redirectUri = AuthSession.makeRedirectUri({
        scheme: 'nospi',
        path: 'auth',
      });
      console.log('LoginScreen: Google OAuth redirect URI:', redirectUri);

      // CRITICAL: signInWithOAuth with skipBrowserRedirect to get the URL
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUri,
          skipBrowserRedirect: true, // CRITICAL: We handle browser opening manually
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) {
        console.error('Google OAuth error:', error);
        setError('Error al conectar con Google. Asegúrate de que Google OAuth esté habilitado en Supabase.');
        setLoading(false);
        return;
      }

      console.log('Google OAuth initiated:', data);
      
      if (data.url) {
        console.log('LoginScreen: Opening Google OAuth in IN-APP browser');
        
        // CRITICAL: Use WebBrowser.openAuthSessionAsync to open in-app browser (NOT external Chrome)
        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          redirectUri,
          {
            // Ensure we use the in-app browser, not external browser
            showInRecents: true,
          }
        );
        
        console.log('LoginScreen: WebBrowser result:', result);
        
        // Handle cancellation or dismissal
        if (result.type === 'cancel' || result.type === 'dismiss') {
          console.log('LoginScreen: User cancelled or dismissed OAuth');
          setError(result.type === 'cancel' ? 'Inicio de sesión cancelado' : 'Navegador cerrado');
          setLoading(false);
        }
        // Success case is handled by the auth state change listener above
        // The loading state will be cleared when SIGNED_IN event fires
      } else {
        console.log('LoginScreen: No OAuth URL returned');
        setError('No se pudo iniciar el proceso de OAuth');
        setLoading(false);
      }
    } catch (error) {
      console.error('Google login failed:', error);
      setError('Error al iniciar sesión con Google');
      setLoading(false);
    }
  };

  const handleAppleLogin = async () => {
    console.log('User tapped Apple login');
    setLoading(true);
    setError('');

    try {
      // CRITICAL: Use AuthSession.makeRedirectUri for proper PKCE flow
      const redirectUri = AuthSession.makeRedirectUri({
        scheme: 'nospi',
        path: 'auth',
      });
      console.log('LoginScreen: Apple OAuth redirect URI:', redirectUri);

      // CRITICAL: signInWithOAuth with skipBrowserRedirect to get the URL
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo: redirectUri,
          skipBrowserRedirect: true, // CRITICAL: We handle browser opening manually
        },
      });

      if (error) {
        console.error('Apple OAuth error:', error);
        setError('Error al conectar con Apple. Asegúrate de que Apple OAuth esté habilitado en Supabase.');
        setLoading(false);
        return;
      }

      console.log('Apple OAuth initiated:', data);
      
      if (data.url) {
        console.log('LoginScreen: Opening Apple OAuth in IN-APP browser');
        
        // CRITICAL: Use WebBrowser.openAuthSessionAsync to open in-app browser (NOT external Chrome)
        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          redirectUri,
          {
            // Ensure we use the in-app browser, not external browser
            showInRecents: true,
          }
        );
        
        console.log('LoginScreen: WebBrowser result:', result);
        
        // Handle cancellation or dismissal
        if (result.type === 'cancel' || result.type === 'dismiss') {
          console.log('LoginScreen: User cancelled or dismissed OAuth');
          setError(result.type === 'cancel' ? 'Inicio de sesión cancelado' : 'Navegador cerrado');
          setLoading(false);
        }
        // Success case is handled by the auth state change listener above
        // The loading state will be cleared when SIGNED_IN event fires
      } else {
        console.log('LoginScreen: No OAuth URL returned');
        setError('No se pudo iniciar el proceso de OAuth');
        setLoading(false);
      }
    } catch (error) {
      console.error('Apple login failed:', error);
      setError('Error al iniciar sesión con Apple');
      setLoading(false);
    }
  };

  const appleIconText = '';
  const googleIconText = 'G';

  return (
    <LinearGradient
      colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
      style={styles.gradient}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <Stack.Screen options={{ headerShown: true, title: 'Iniciar Sesión', headerBackTitle: 'Atrás' }} />

      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Bienvenido de nuevo</Text>
          <Text style={styles.subtitle}>Inicia sesión para continuar</Text>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="rgba(107, 33, 168, 0.5)"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TextInput
              style={styles.input}
              placeholder="Contraseña"
              placeholderTextColor="rgba(107, 33, 168, 0.5)"
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
                <ActivityIndicator color={nospiColors.white} />
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

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={nospiColors.purpleDark} />
              <Text style={styles.loadingText}>Procesando...</Text>
            </View>
          ) : null}
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
    color: nospiColors.purpleDark,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: nospiColors.purpleDark,
    opacity: 0.8,
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
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderWidth: 2,
    borderColor: nospiColors.purpleLight,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
    fontSize: 16,
    color: nospiColors.purpleDark,
    marginBottom: 16,
  },
  loginButton: {
    backgroundColor: nospiColors.purpleDark,
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
    backgroundColor: nospiColors.purpleMid,
    shadowOpacity: 0,
    elevation: 0,
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
    backgroundColor: nospiColors.purpleLight,
  },
  dividerText: {
    color: nospiColors.purpleDark,
    fontSize: 14,
    marginHorizontal: 16,
    opacity: 0.7,
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
    borderWidth: 1,
    borderColor: nospiColors.purpleLight,
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
  loadingContainer: {
    marginTop: 20,
    alignItems: 'center',
  },
  loadingText: {
    color: nospiColors.purpleDark,
    fontSize: 16,
    marginTop: 12,
  },
});
