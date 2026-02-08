
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { nospiColors } from '@/constants/Colors';
import { useRouter, Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    console.log('LoginScreen: Setting up OAuth callback listener');
    
    // Handle OAuth callback
    const handleUrl = async (event: { url: string }) => {
      console.log('LoginScreen: Received URL callback:', event.url);
      
      if (event.url.includes('#access_token=')) {
        console.log('LoginScreen: OAuth callback detected, processing...');
        setLoading(true);
        
        try {
          // Extract the session from the URL
          const { data, error } = await supabase.auth.getSession();
          
          if (error) {
            console.error('LoginScreen: Error getting session after OAuth:', error);
            setError('Error al completar el inicio de sesión con OAuth');
            setLoading(false);
            return;
          }

          if (data.session) {
            console.log('LoginScreen: OAuth session established, user:', data.session.user.id);
            
            // Check if user profile exists
            const { data: existingProfile, error: profileError } = await supabase
              .from('users')
              .select('*')
              .eq('id', data.session.user.id)
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
                  id: data.session.user.id,
                  email: data.session.user.email,
                  name: data.session.user.user_metadata?.full_name || '',
                  birthdate: '',
                  age: 18,
                  gender: 'hombre',
                  interested_in: 'ambos',
                  age_range_min: 18,
                  age_range_max: 60,
                  country: 'Colombia',
                  city: 'Medellín',
                  phone: '',
                  profile_photo_url: data.session.user.user_metadata?.avatar_url || null,
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
          }
        } catch (error) {
          console.error('LoginScreen: OAuth callback processing failed:', error);
          setError('Error al procesar el inicio de sesión');
        } finally {
          setLoading(false);
        }
      }
    };

    // Add URL listener
    const subscription = Linking.addEventListener('url', handleUrl);

    // Check if app was opened with a URL
    Linking.getInitialURL().then((url) => {
      if (url) {
        console.log('LoginScreen: App opened with URL:', url);
        handleUrl({ url });
      }
    });

    return () => {
      console.log('LoginScreen: Cleaning up URL listener');
      subscription.remove();
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
      const redirectUrl = Linking.createURL('auth/callback');
      console.log('LoginScreen: Google OAuth redirect URL:', redirectUrl);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: false,
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
        console.log('LoginScreen: Opening Google OAuth URL');
        await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
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
        setError('Error al conectar con Apple. Asegúrate de que Apple OAuth esté habilitado en Supabase.');
        setLoading(false);
        return;
      }

      console.log('Apple OAuth initiated:', data);
      
      if (data.url) {
        console.log('LoginScreen: Opening Apple OAuth URL');
        await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
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
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: 'Iniciar Sesión', headerBackTitle: 'Atrás' }} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: nospiColors.purpleLight,
  },
  scrollContent: {
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
    borderColor: 'rgba(107, 33, 168, 0.3)',
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
    backgroundColor: 'rgba(107, 33, 168, 0.3)',
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
    borderColor: 'rgba(107, 33, 168, 0.3)',
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
