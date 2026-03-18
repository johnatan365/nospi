
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

const HEADING = '#1a0010';
const MUTED = '#555555';
const ACCENT = '#880E4F';

export default function PhotoScreen() {
  const router = useRouter();
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) { Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería para seleccionar una foto.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled) {
      console.log('User selected photo:', result.assets[0].uri);
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handleContinue = async () => {
    if (!photoUri) { Alert.alert('Foto requerida', 'Por favor selecciona una foto de perfil.'); return; }
    console.log('User continuing with photo:', photoUri);
    await AsyncStorage.setItem('onboarding_photo', photoUri);
    router.push('/onboarding/register');
  };

  const handleSkip = async () => {
    console.log('User skipped photo upload');
    await AsyncStorage.setItem('onboarding_photo', '');
    router.push('/onboarding/register');
  };

  return (
    <View style={styles.screen}>
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Añade tu foto de perfil</Text>
          <Text style={styles.subtitle}>Esta será tu foto principal</Text>
          <TouchableOpacity style={styles.photoContainer} onPress={pickImage} activeOpacity={0.8}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photo} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Text style={styles.photoPlaceholderIcon}>📷</Text>
                <Text style={styles.photoPlaceholderText}>Seleccionar foto</Text>
              </View>
            )}
          </TouchableOpacity>
          <View style={[styles.buttonWrapper, !photoUri && styles.buttonDisabled]}>
            <LinearGradient colors={['#1a0010', '#880E4F', '#AD1457']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.buttonGradient}>
              <TouchableOpacity style={styles.buttonInner} onPress={handleContinue} disabled={!photoUri} activeOpacity={0.8}>
                <Text style={styles.buttonText}>Continuar</Text>
              </TouchableOpacity>
            </LinearGradient>
          </View>
          <TouchableOpacity style={styles.skipButton} onPress={handleSkip} activeOpacity={0.8}>
            <Text style={styles.skipButtonText}>Ahora no</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  content: { width: '100%', maxWidth: 400, alignSelf: 'center', alignItems: 'center' },
  title: { fontSize: 28, fontWeight: 'bold', color: HEADING, marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 16, color: MUTED, marginBottom: 40, textAlign: 'center' },
  photoContainer: { width: 200, height: 200, borderRadius: 100, overflow: 'hidden', marginBottom: 40, backgroundColor: '#F9FAFB', borderWidth: 4, borderColor: '#E5E7EB' },
  photo: { width: '100%', height: '100%' },
  photoPlaceholder: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  photoPlaceholderIcon: { fontSize: 48, marginBottom: 8 },
  photoPlaceholderText: { fontSize: 16, color: HEADING, fontWeight: '600' },
  buttonWrapper: { borderRadius: 16, overflow: 'hidden', width: '100%' },
  buttonGradient: { borderRadius: 16 },
  buttonInner: { paddingVertical: 18, paddingHorizontal: 32, alignItems: 'center' },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  skipButton: { backgroundColor: 'transparent', paddingVertical: 18, paddingHorizontal: 32, borderRadius: 16, alignItems: 'center', width: '100%', marginTop: 12 },
  skipButtonText: { color: MUTED, fontSize: 16, fontWeight: '600', textDecorationLine: 'underline' },
});
