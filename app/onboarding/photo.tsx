
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { nospiColors } from '@/constants/Colors';
import * as ImagePicker from 'expo-image-picker';

export default function PhotoScreen() {
  const router = useRouter();
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (permissionResult.granted === false) {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería para seleccionar una foto.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      console.log('User selected photo:', result.assets[0].uri);
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handleContinue = () => {
    if (!photoUri) {
      Alert.alert('Foto requerida', 'Por favor selecciona una foto de perfil.');
      return;
    }

    console.log('User continuing with photo:', photoUri);
    // TODO: Backend Integration - POST /api/upload/profile-photo with photo file
    // TODO: Backend Integration - PUT /api/pre-registration with { profilePhotoUrl }
    router.push('/onboarding/register');
  };

  const canContinue = photoUri !== null;

  return (
    <LinearGradient
      colors={[nospiColors.purpleDark, nospiColors.purpleMid, nospiColors.purpleLight]}
      style={styles.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Añade tu foto de perfil</Text>
          <Text style={styles.subtitle}>Esta será tu foto principal</Text>
          
          <TouchableOpacity 
            style={styles.photoContainer}
            onPress={pickImage}
            activeOpacity={0.8}
          >
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photo} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Text style={styles.photoPlaceholderIcon}>📷</Text>
                <Text style={styles.photoPlaceholderText}>Seleccionar foto</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.continueButton, !canContinue && styles.continueButtonDisabled]}
            onPress={handleContinue}
            disabled={!canContinue}
            activeOpacity={0.8}
          >
            <Text style={styles.continueButtonText}>Continuar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: nospiColors.white,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: nospiColors.white,
    opacity: 0.9,
    marginBottom: 40,
    textAlign: 'center',
  },
  photoContainer: {
    width: 200,
    height: 200,
    borderRadius: 100,
    overflow: 'hidden',
    marginBottom: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 4,
    borderColor: nospiColors.white,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoPlaceholderIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  photoPlaceholderText: {
    fontSize: 16,
    color: nospiColors.white,
    fontWeight: '600',
  },
  continueButton: {
    backgroundColor: nospiColors.white,
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  continueButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    shadowOpacity: 0,
    elevation: 0,
  },
  continueButtonText: {
    color: nospiColors.purpleDark,
    fontSize: 18,
    fontWeight: '700',
  },
});
