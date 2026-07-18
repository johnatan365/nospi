import React, { useState } from 'react';
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
import { nospiColors } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { useSupabase } from '@/contexts/SupabaseContext';

// Pantalla a la que auth/callback.tsx redirige cuando el link que el usuario
// clickeó en su correo es de tipo "recovery" (olvidé mi contraseña). Para
// cuando llegamos acá, Supabase ya estableció una sesión temporal a partir
// de los tokens del link — solo falta pedir la nueva contraseña y llamar a
// supabase.auth.updateUser().
export default function ResetPasswordScreen() {
  const router = useRouter();
  const { clearPasswordRecovery } = useSupabase();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [checkingLink, setCheckingLink] = useState(true);
  const [linkValid, setLinkValid] = useState(true);

  // El link de recovery ya debería haber dejado una sesión temporal activa
  // (auth/callback.tsx la establece antes de mandarnos acá). Si no hay
  // sesión, el link venció o ya se usó — mejor avisar claro que mostrar un
  // formulario que va a fallar al guardar.
  React.useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setLinkValid(!!session);
      setCheckingLink(false);
    });
    return () => { mounted = false; };
  }, []);

  const handleSubmit = async () => {
    if (!password || password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        console.error('[ResetPassword] updateUser error:', updateError.message);
        setError('No pudimos actualizar tu contraseña. El link puede haber expirado — solicita uno nuevo.');
        return;
      }

      setDone(true);
      clearPasswordRecovery();
      setTimeout(() => {
        router.replace('/(tabs)/events');
      }, 1800);
    } catch (err: any) {
      console.error('[ResetPassword] Unexpected error:', err);
      setError('No pudimos actualizar tu contraseña. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  const eyeIcon = showPassword ? 'eye-off-outline' : 'eye-outline';

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient
        colors={['#1a0010', '#880E4F', '#AD1457']}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            contentContainerStyle={styles.container}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.content}>
              <Image
                source={require('@/assets/images/fa137ca3-b552-4ac8-9f1e-8268723ace00.png')}
                style={styles.logo}
                resizeMode="contain"
              />

              {checkingLink ? (
                <ActivityIndicator size="large" color={nospiColors.white} />
              ) : !linkValid ? (
                <>
                  <View style={styles.successIconWrap}>
                    <Ionicons name="alert-circle-outline" size={40} color={nospiColors.white} />
                  </View>
                  <Text style={styles.title}>Este link ya no es válido</Text>
                  <Text style={styles.subtitle}>Puede haber expirado o ya haberse usado. Solicita uno nuevo desde la pantalla de inicio de sesión.</Text>
                  <TouchableOpacity
                    style={styles.submitButton}
                    onPress={() => router.replace('/forgot-password')}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.submitButtonText}>Solicitar nuevo link</Text>
                  </TouchableOpacity>
                </>
              ) : done ? (
                <>
                  <View style={styles.successIconWrap}>
                    <Ionicons name="checkmark-circle-outline" size={40} color={nospiColors.white} />
                  </View>
                  <Text style={styles.title}>¡Listo!</Text>
                  <Text style={styles.subtitle}>Tu contraseña fue actualizada. Ya puedes usar Nospi.</Text>
                </>
              ) : (
                <>
                  <Text style={styles.title}>Crea una nueva contraseña</Text>
                  <Text style={styles.subtitle}>Elige una contraseña segura para tu cuenta de Nospi.</Text>

                  {error ? (
                    <View style={styles.errorContainer}>
                      <Ionicons name="alert-circle-outline" size={16} color="#FF6B6B" />
                      <Text style={styles.errorText}>{error}</Text>
                    </View>
                  ) : null}

                  <View style={styles.form}>
                    <View style={styles.inputWrapper}>
                      <MaterialIcons name="lock" size={20} color="#999" style={styles.inputIcon} />
                      <TextInput
                        style={styles.input}
                        placeholder="Nueva contraseña"
                        placeholderTextColor="#999"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry={!showPassword}
                        autoCapitalize="none"
                        autoCorrect={false}
                        editable={!submitting}
                      />
                      <TouchableOpacity
                        onPress={() => setShowPassword(!showPassword)}
                        style={styles.eyeButton}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name={eyeIcon} size={22} color="#999" />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.inputWrapper}>
                      <MaterialIcons name="lock-outline" size={20} color="#999" style={styles.inputIcon} />
                      <TextInput
                        style={styles.input}
                        placeholder="Confirma tu contraseña"
                        placeholderTextColor="#999"
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        secureTextEntry={!showPassword}
                        autoCapitalize="none"
                        autoCorrect={false}
                        editable={!submitting}
                      />
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
                    onPress={handleSubmit}
                    disabled={submitting}
                    activeOpacity={0.85}
                  >
                    {submitting ? (
                      <ActivityIndicator color={nospiColors.white} />
                    ) : (
                      <Text style={styles.submitButtonText}>Guardar contraseña</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gradient: { flex: 1 },
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
  successIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: nospiColors.white,
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 21,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginBottom: 28,
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
});
