
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, ActivityIndicator, Modal } from 'react-native';
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

  useEffect(() => {
    console.log('RegisterScreen: Setting up OAuth callback listener');
    
    // Handle OAuth callback
    const handleUrl = async (event: { url: string }) => {
      console.log('RegisterScreen: Received URL callback:', event.url);
      
      if (event.url.includes('#access_token=') || event.url.includes('?access_token=')) {
        console.log('RegisterScreen: OAuth callback detected, processing...');
        setLoading(true);
        
        try {
          // Wait a moment for Supabase to process the session
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Extract the session from the URL
          const { data, error } = await supabase.auth.getSession();
          
          if (error) {
            console.error('RegisterScreen: Error getting session after OAuth:', error);
            setError('Error al completar el registro con OAuth');
            setLoading(false);
            return;
          }

          if (data.session) {
            console.log('RegisterScreen: OAuth session established, user:', data.session.user.id);
            
            // Check if user profile exists
            const { data: existingProfile, error: profileError } = await supabase
              .from('users')
              .select('*')
              .eq('id', data.session.user.id)
              .maybeSingle();

            if (profileError) {
              console.error('RegisterScreen: Error checking profile:', profileError);
            }

            // If profile doesn't exist, create it with OAuth data
            if (!existingProfile) {
              console.log('RegisterScreen: Creating new profile for OAuth user');
              
              // Get onboarding data from AsyncStorage
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
              const name = nameData || data.session.user.user_metadata?.full_name || '';
              const birthdate = birthdateData || '';
              const age = ageData ? parseInt(ageData) : 18;
              const gender = genderData || 'hombre';
              const interestedIn = interestedInData || 'ambos';
              const ageRange = ageRangeData ? JSON.parse(ageRangeData) : { min: 18, max: 60 };
              const country = countryData || 'Colombia';
              const city = cityData || 'Medellín';
              const phoneInfo = phoneData ? JSON.parse(phoneData) : { phoneNumber: '' };
              const photo = photoData || data.session.user.user_metadata?.avatar_url || null;
              const compatibility = compatibilityData ? parseInt(compatibilityData) : 95;

              const { error: createProfileError } = await supabase
                .from('users')
                .insert({
                  id: data.session.user.id,
                  email: data.session.user.email,
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

              if (createProfileError) {
                console.error('RegisterScreen: Error creating profile:', createProfileError);
                setError('Error al crear el perfil');
                setLoading(false);
                return;
              }

              console.log('RegisterScreen: Profile created successfully');

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
            }

            // Navigate to events screen
            console.log('RegisterScreen: Navigating to events screen');
            router.replace('/(tabs)/events');
          } else {
            console.log('RegisterScreen: No session found after OAuth callback');
            setError('No se pudo establecer la sesión. Intenta de nuevo.');
            setLoading(false);
          }
        } catch (error) {
          console.error('RegisterScreen: OAuth callback processing failed:', error);
          setError('Error al procesar el registro');
          setLoading(false);
        }
      }
    };

    // Add URL listener
    const subscription = Linking.addEventListener('url', handleUrl);

    // Check if app was opened with a URL
    Linking.getInitialURL().then((url) => {
      if (url) {
        console.log('RegisterScreen: App opened with URL:', url);
        handleUrl({ url });
      }
    });

    return () => {
      console.log('RegisterScreen: Cleaning up URL listener');
      subscription.remove();
    };
  }, [router]);

  const handleAppleSignUp = async () => {
    console.log('User tapped Sign up with Apple');
    setLoading(true);
    setError('');

    try {
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
        
        // Check for specific error about provider not enabled
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
        console.log('RegisterScreen: Opening Apple OAuth URL');
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
        console.log('RegisterScreen: WebBrowser result:', result);
        
        if (result.type === 'cancel') {
          console.log('RegisterScreen: User cancelled Apple OAuth');
          setError('Registro con Apple cancelado');
          setLoading(false);
        }
      } else {
        console.log('RegisterScreen: No OAuth URL returned');
        setError('No se pudo iniciar el proceso de OAuth');
        setLoading(false);
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
      const redirectUrl = Linking.createURL('auth/callback');
      console.log('RegisterScreen: Google OAuth redirect URL:', redirectUrl);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: false,
        },
      });

      if (error) {
        console.error('Google OAuth error:', error);
        
        // Check for specific error about provider not enabled
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
        console.log('RegisterScreen: Opening Google OAuth URL');
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
        console.log('RegisterScreen: WebBrowser result:', result);
        
        if (result.type === 'cancel') {
          console.log('RegisterScreen: User cancelled Google OAuth');
          setError('Registro con Google cancelado');
          setLoading(false);
        }
      } else {
        console.log('RegisterScreen: No OAuth URL returned');
        setError('No se pudo iniciar el proceso de OAuth');
        setLoading(false);
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
        setError(`Error al crear el perfil: ${profileError.message}`);
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
</write file>

<write file="app/login.tsx">
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
      
      if (event.url.includes('#access_token=') || event.url.includes('?access_token=')) {
        console.log('LoginScreen: OAuth callback detected, processing...');
        setLoading(true);
        
        try {
          // Wait a moment for Supabase to process the session
          await new Promise(resolve => setTimeout(resolve, 1000));
          
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
          } else {
            console.log('LoginScreen: No session found after OAuth callback');
            setError('No se pudo establecer la sesión. Intenta de nuevo.');
            setLoading(false);
          }
        } catch (error) {
          console.error('LoginScreen: OAuth callback processing failed:', error);
          setError('Error al procesar el inicio de sesión');
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
        
        // Check for specific error about provider not enabled
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
        console.log('LoginScreen: Opening Google OAuth URL');
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
        console.log('LoginScreen: WebBrowser result:', result);
        
        if (result.type === 'cancel') {
          console.log('LoginScreen: User cancelled Google OAuth');
          setError('Inicio de sesión con Google cancelado');
          setLoading(false);
        }
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
        
        // Check for specific error about provider not enabled
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
        console.log('LoginScreen: Opening Apple OAuth URL');
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
        console.log('LoginScreen: WebBrowser result:', result);
        
        if (result.type === 'cancel') {
          console.log('LoginScreen: User cancelled Apple OAuth');
          setError('Inicio de sesión con Apple cancelado');
          setLoading(false);
        }
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
