
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, ActivityIndicator, Modal, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { nospiColors } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';

// CRITICAL: Call this at the top level to complete auth sessions (MOBILE ONLY)
if (Platform.OS !== 'web') {
  WebBrowser.maybeCompleteAuthSession();
}

export default function RegisterScreen() {
  const router = useRouter();
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    console.log('RegisterScreen: Monitoring auth state changes');
    
    // CRITICAL: Listen for auth state changes to handle OAuth redirect
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('RegisterScreen: Auth state changed:', event, 'Session exists:', !!session);
      
      // CRITICAL: Handle session existence (fires after OAuth redirect on web)
      if (session) {
        console.log('RegisterScreen: Session detected, user ID:', session.user?.id);
        setLoading(false); // Clear loading state
        
        // CRITICAL: Save onboarding data to profile
        await saveOnboardingDataToProfile(session.user.id, session.user);
      } else if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
        console.log('RegisterScreen: User signed out or deleted');
        setLoading(false);
      }
    });

    return () => {
      console.log('RegisterScreen: Cleaning up auth listener');
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  // Helper function to save onboarding data to profile
  const saveOnboardingDataToProfile = async (userId: string, user: any) => {
    try {
      console.log('RegisterScreen: Saving onboarding data for user:', userId);

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

      const interests = interestsData ? JSON.parse(interestsData) : [];
      const personality = personalityData ? JSON.parse(personalityData) : [];
      const name = nameData || user.user_metadata?.full_name || user.email?.split('@')[0] || '';
      const birthdate = birthdateData || '1999-01-01';
      const age = ageData ? parseInt(ageData) : 25;
      const gender = genderData || 'no binario';
      const interestedIn = interestedInData || 'ambos';
      const ageRange = ageRangeData ? JSON.parse(ageRangeData) : { min: 18, max: 60 };
      const country = countryData || 'Colombia';
      const city = cityData || 'Medellín';
      const phoneInfo = phoneData ? JSON.parse(phoneData) : { phoneNumber: '' };
      const photo = photoData || user.user_metadata?.avatar_url || null;
      const compatibility = compatibilityData ? parseInt(compatibilityData) : 95;

      console.log('RegisterScreen: Onboarding data retrieved:', {
        interests: interests.length,
        personality: personality.length,
        name,
        phone: phoneInfo.phoneNumber,
      });

      // Check if profile exists
      const { data: existingProfile } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (existingProfile) {
        // Profile exists - UPDATE with onboarding data
        console.log('RegisterScreen: Updating existing profile with onboarding data');
        
        const { error: updateError } = await supabase
          .from('users')
          .update({
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
            onboarding_completed: true, // CRITICAL: Mark onboarding as completed
          })
          .eq('id', userId);

        if (updateError) {
          console.error('RegisterScreen: Error updating profile:', updateError);
          setError('Error al guardar los datos del perfil');
          return;
        }

        console.log('✅ RegisterScreen: Profile updated successfully with onboarding data');
      } else {
        // Profile doesn't exist - CREATE with onboarding data
        console.log('RegisterScreen: Creating new profile with onboarding data');
        
        const { error: createError } = await supabase
          .from('users')
          .insert({
            id: userId,
            email: user.email,
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
            onboarding_completed: true, // CRITICAL: Mark onboarding as completed
          });

        if (createError) {
          console.error('RegisterScreen: Error creating profile:', createError);
          setError('Error al crear el perfil');
          return;
        }

        console.log('✅ RegisterScreen: Profile created successfully with onboarding data');
      }

      // Clear onboarding data from AsyncStorage
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

      console.log('RegisterScreen: Onboarding data cleared from AsyncStorage');

      // Navigate to main app
      console.log('RegisterScreen: Navigating to main app (tabs)');
      router.replace('/(tabs)/events');
    } catch (error) {
      console.error('RegisterScreen: Error saving onboarding data:', error);
      setError('Error al guardar los datos');
    }
  };

  const handleAppleSignUp = async () => {
    console.log('User tapped Sign up with Apple');
    setLoading(true);
    setError('');

    try {
      if (Platform.OS === 'web') {
        // WEB: Use direct OAuth redirect (NO WebBrowser)
        console.log('RegisterScreen: Web - Using direct OAuth redirect');
        
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'apple',
          options: {
            redirectTo: window.location.origin, // Redirect to https://nospi.vercel.app/
          },
        });

        if (error) {
          console.error('Apple OAuth error:', error);
          
          if (error.message.includes('provider is not enabled') || error.message.includes('Unsupported provider')) {
            setError('Apple OAuth no está habilitado. Por favor, habilita Apple como proveedor en el Panel de Supabase (Authentication → Providers → Apple).');
          } else {
            setError(`Error al conectar con Apple: ${error.message}`);
          }
          setLoading(false);
          return;
        }

        console.log('Web: Apple OAuth redirect initiated');
        // Browser will redirect automatically
      } else {
        // MOBILE: Use WebBrowser for in-app browser
        console.log('RegisterScreen: Mobile - Using WebBrowser for OAuth');
        
        const redirectUri = AuthSession.makeRedirectUri({ scheme: 'nospi' });
        console.log('RegisterScreen: Apple OAuth redirect URI:', redirectUri);

        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'apple',
          options: {
            redirectTo: redirectUri,
            skipBrowserRedirect: true,
          },
        });

        if (error) {
          console.error('Apple OAuth error:', error);
          
          if (error.message.includes('provider is not enabled') || error.message.includes('Unsupported provider')) {
            setError('Apple OAuth no está habilitado. Por favor, habilita Apple como proveedor en el Panel de Supabase (Authentication → Providers → Apple).');
          } else {
            setError(`Error al conectar con Apple: ${error.message}`);
          }
          setLoading(false);
          return;
        }

        console.log('Apple OAuth initiated:', data);
        
        if (data.url) {
          console.log('RegisterScreen: Opening Apple OAuth in IN-APP browser');
          
          const result = await WebBrowser.openAuthSessionAsync(
            data.url,
            redirectUri,
            {
              showInRecents: true,
            }
          );
          
          console.log('RegisterScreen: WebBrowser result:', result);
          
          if (result.type === 'cancel' || result.type === 'dismiss') {
            console.log('RegisterScreen: User cancelled or dismissed OAuth');
            setError(result.type === 'cancel' ? 'Registro con Apple cancelado' : 'Navegador cerrado');
            setLoading(false);
          }
        } else {
          console.log('RegisterScreen: No OAuth URL returned');
          setError('No se pudo iniciar el proceso de OAuth');
          setLoading(false);
        }
      }
    } catch (error) {
      console.error('Apple sign-up failed:', error);
      setError('Error al registrarse con Apple');
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    console.log('User tapped Sign up with Google');
    setLoading(true);
    setError('');

    try {
      if (Platform.OS === 'web') {
        // WEB: Use direct OAuth redirect (NO WebBrowser)
        console.log('RegisterScreen: Web - Using direct OAuth redirect');
        
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: window.location.origin, // Redirect to https://nospi.vercel.app/
            queryParams: {
              access_type: 'offline',
              prompt: 'consent',
            },
          },
        });

        if (error) {
          console.error('Google OAuth error:', error);
          
          if (error.message.includes('provider is not enabled') || error.message.includes('Unsupported provider')) {
            setError('Google OAuth no está habilitado correctamente. Por favor, verifica la configuración en el Panel de Supabase (Authentication → Providers → Google).');
          } else {
            setError(`Error al conectar con Google: ${error.message}`);
          }
          setLoading(false);
          return;
        }

        console.log('Web: Google OAuth redirect initiated');
        // Browser will redirect automatically
      } else {
        // MOBILE: Use WebBrowser for in-app browser
        console.log('RegisterScreen: Mobile - Using WebBrowser for OAuth');
        
        const redirectUri = AuthSession.makeRedirectUri({ scheme: 'nospi' });
        console.log('RegisterScreen: Google OAuth redirect URI:', redirectUri);

        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: redirectUri,
            skipBrowserRedirect: true,
            queryParams: {
              access_type: 'offline',
              prompt: 'consent',
            },
          },
        });

        if (error) {
          console.error('Google OAuth error:', error);
          
          if (error.message.includes('provider is not enabled') || error.message.includes('Unsupported provider')) {
            setError('Google OAuth no está habilitado correctamente. Por favor, verifica la configuración en el Panel de Supabase (Authentication → Providers → Google).');
          } else {
            setError(`Error al conectar con Google: ${error.message}`);
          }
          setLoading(false);
          return;
        }

        console.log('Google OAuth initiated:', data);
        
        if (data.url) {
          console.log('RegisterScreen: Opening Google OAuth in IN-APP browser');
          
          const result = await WebBrowser.openAuthSessionAsync(
            data.url,
            redirectUri,
            {
              showInRecents: true,
            }
          );
          
          console.log('RegisterScreen: WebBrowser result:', result);
          
          if (result.type === 'cancel' || result.type === 'dismiss') {
            console.log('RegisterScreen: User cancelled or dismissed OAuth');
            setError(result.type === 'cancel' ? 'Registro con Google cancelado' : 'Navegador cerrado');
            setLoading(false);
          }
        } else {
          console.log('RegisterScreen: No OAuth URL returned');
          setError('No se pudo iniciar el proceso de OAuth');
          setLoading(false);
        }
      }
    } catch (error) {
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
      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) {
        console.error('Auth registration error:', authError);
        setError(`Error al crear la cuenta: ${authError.message}`);
        setLoading(false);
        return;
      }

      if (!authData.user) {
        console.error('No user data returned from auth');
        setError('Error al crear la cuenta');
        setLoading(false);
        return;
      }

      console.log('Auth user created:', authData.user.id);

      // CRITICAL: Save onboarding data to profile
      await saveOnboardingDataToProfile(authData.user.id, authData.user);
      
      setLoading(false);
    } catch (error) {
      console.error('Registration failed:', error);
      setError('Error al registrarse. Intenta de nuevo.');
      setLoading(false);
    }
  };

  const appleIconText = '';
  const googleIconText = 'G';
  const emailIconText = '✉';

  return (
    <LinearGradient
      colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
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
                <Text style={styles.appleIcon}>{appleIconText}</Text>
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
                <Text style={styles.googleIcon}>{googleIconText}</Text>
              </View>
              <Text style={styles.buttonTextDark}>Regístrate con Google</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.buttonDark}
              onPress={handleEmailSignUp}
              activeOpacity={0.8}
              disabled={loading}
            >
              <Text style={styles.emailIcon}>{emailIconText}</Text>
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

            <TextInput
              style={styles.input}
              placeholder="Confirmar Contraseña"
              placeholderTextColor="#999"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />

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
  appleIconContainer: {
    width: 24,
    height: 24,
    marginRight: 12,
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
  googleIconContainer: {
    width: 24,
    height: 24,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  googleIcon: {
    fontSize: 18,
    color: '#4285F4',
    fontWeight: 'bold',
  },
  emailIcon: {
    fontSize: 20,
    marginRight: 12,
    color: nospiColors.white,
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
    color: nospiColors.purpleDark,
    opacity: 0.7,
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
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
    fontSize: 16,
    color: '#333',
    marginBottom: 16,
  },
  registerButton: {
    backgroundColor: nospiColors.purpleDark,
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  registerButtonDisabled: {
    backgroundColor: nospiColors.purpleMid,
    opacity: 0.6,
  },
  registerButtonText: {
    color: nospiColors.white,
    fontSize: 18,
    fontWeight: '700',
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
});
