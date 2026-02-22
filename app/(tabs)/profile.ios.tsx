
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, Modal, TextInput, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { useSupabase } from '@/contexts/SupabaseContext';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Picker } from '@react-native-picker/picker';
import Slider from '@react-native-community/slider';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface UserProfile {
  id: string;
  email: string;
  name: string;
  birthdate: string;
  age: number;
  gender: string;
  interested_in: string;
  age_range_min: number;
  age_range_max: number;
  country: string;
  city: string;
  phone: string;
  profile_photo_url: string | null;
  interests: string[];
  personality_traits: string[];
  compatibility_percentage: number;
  notification_preferences: {
    whatsapp: boolean;
    email: boolean;
    sms: boolean;
    push: boolean;
  };
}

const COUNTRIES = [
  'Colombia',
  'Argentina',
  'Brasil',
  'Chile',
  'Ecuador',
  'España',
  'Estados Unidos',
  'México',
  'Perú',
  'Venezuela',
];

const CITIES_BY_COUNTRY: { [key: string]: string[] } = {
  'Colombia': ['Medellín', 'Bogotá', 'Cali', 'Barranquilla', 'Cartagena', 'Bucaramanga', 'Pereira', 'Santa Marta'],
  'Argentina': ['Buenos Aires', 'Córdoba', 'Rosario', 'Mendoza', 'La Plata'],
  'Brasil': ['São Paulo', 'Rio de Janeiro', 'Brasília', 'Salvador', 'Fortaleza'],
  'Chile': ['Santiago', 'Valparaíso', 'Concepción', 'La Serena', 'Antofagasta'],
  'Ecuador': ['Quito', 'Guayaquil', 'Cuenca', 'Santo Domingo', 'Machala'],
  'España': ['Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Zaragoza'],
  'Estados Unidos': ['Nueva York', 'Los Ángeles', 'Chicago', 'Houston', 'Miami'],
  'México': ['Ciudad de México', 'Guadalajara', 'Monterrey', 'Puebla', 'Tijuana'],
  'Perú': ['Lima', 'Arequipa', 'Trujillo', 'Chiclayo', 'Cusco'],
  'Venezuela': ['Caracas', 'Maracaibo', 'Valencia', 'Barquisimeto', 'Maracay'],
};

const AVAILABLE_INTERESTS = [
  'Música', 'Deportes', 'Viajes', 'Cine', 'Arte', 'Lectura', 'Cocina', 
  'Tecnología', 'Fotografía', 'Baile', 'Yoga', 'Fitness'
];

const AVAILABLE_PERSONALITY = [
  'Extrovertido', 'Introvertido', 'Aventurero', 'Tranquilo', 'Creativo',
  'Analítico', 'Empático', 'Optimista', 'Realista', 'Espontáneo'
];

export default function ProfileScreen() {
  const { user, signOut } = useSupabase();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notificationModalVisible, setNotificationModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [showCityPicker, setShowCityPicker] = useState(false);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCountry, setEditCountry] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editInterestedIn, setEditInterestedIn] = useState('');
  const [editAgeRangeMin, setEditAgeRangeMin] = useState(18);
  const [editAgeRangeMax, setEditAgeRangeMax] = useState(60);
  const [editInterests, setEditInterests] = useState<string[]>([]);
  const [editPersonality, setEditPersonality] = useState<string[]>([]);

  useEffect(() => {
    if (user) {
      loadProfile();
    }
  }, [user]); // loadProfile is stable, no need in deps

  const loadProfile = async () => {
    try {
      setLoading(true);
      console.log('Loading user profile...');
      
      if (!user?.id) {
        console.log('No user ID available');
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .limit(1);

      if (error) {
        console.error('Error loading profile:', error);
        setLoading(false);
        return;
      }

      if (!data || data.length === 0) {
        console.log('No profile data found');
        setLoading(false);
        return;
      }

      const profileData = data[0];
      console.log('Profile loaded successfully');
      setProfile(profileData);
      setEditName(profileData.name || '');
      setEditPhone(profileData.phone || '');
      setEditCountry(profileData.country || 'Colombia');
      setEditCity(profileData.city || 'Medellín');
      setEditInterestedIn(profileData.interested_in || 'ambos');
      setEditAgeRangeMin(profileData.age_range_min || 18);
      setEditAgeRangeMax(profileData.age_range_max || 60);
      setEditInterests(profileData.interests || []);
      setEditPersonality(profileData.personality_traits || []);
    } catch (error) {
      console.error('Failed to load profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      console.log('User signing out...');
      await signOut();
      router.replace('/welcome');
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  };

  const handleNotificationPress = () => {
    console.log('User tapped notification preferences');
    setNotificationModalVisible(true);
  };

  const handleEditPress = () => {
    console.log('User tapped edit profile');
    setEditModalVisible(true);
  };

  const handlePhotoPress = async () => {
    console.log('User tapped profile photo to edit');
    
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (permissionResult.granted === false) {
      Alert.alert('Permiso requerido', 'Necesitamos permiso para acceder a tus fotos');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await uploadPhoto(result.assets[0].uri);
    }
  };

  const uploadPhoto = async (uri: string) => {
    setUploadingPhoto(true);
    try {
      console.log('Uploading photo from URI:', uri);
      
      const response = await fetch(uri);
      const blob = await response.blob();
      
      const fileExt = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${user?.id}-${Date.now()}.${fileExt}`;
      const filePath = fileName;

      console.log('Uploading to bucket: profile-photos, path:', filePath);

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('profile-photos')
        .upload(filePath, blob, {
          contentType: `image/${fileExt}`,
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        Alert.alert('Error', `No se pudo subir la foto: ${uploadError.message}`);
        return;
      }

      console.log('Upload successful:', uploadData);

      const { data: urlData } = supabase.storage
        .from('profile-photos')
        .getPublicUrl(filePath);

      const photoUrl = urlData.publicUrl;
      console.log('Public URL:', photoUrl);

      const { error: updateError } = await supabase
        .from('users')
        .update({ profile_photo_url: photoUrl })
        .eq('id', user?.id);

      if (updateError) {
        console.error('Update error:', updateError);
        Alert.alert('Error', 'No se pudo actualizar el perfil');
        return;
      }

      console.log('Photo uploaded and profile updated successfully');
      setProfile(prev => prev ? { ...prev, profile_photo_url: photoUrl } : null);
      Alert.alert('Éxito', 'Foto de perfil actualizada');
    } catch (error) {
      console.error('Failed to upload photo:', error);
      Alert.alert('Error', 'No se pudo subir la foto. Por favor intenta de nuevo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!editName.trim() || !editPhone.trim()) {
      Alert.alert('Error', 'Por favor completa todos los campos requeridos');
      return;
    }

    try {
      console.log('Saving profile changes...');
      const { error } = await supabase
        .from('users')
        .update({
          name: editName,
          phone: editPhone,
          country: editCountry,
          city: editCity,
          interested_in: editInterestedIn,
          age_range_min: editAgeRangeMin,
          age_range_max: editAgeRangeMax,
          interests: editInterests,
          personality_traits: editPersonality,
        })
        .eq('id', user?.id);

      if (error) {
        console.error('Error updating profile:', error);
        Alert.alert('Error', 'No se pudo actualizar el perfil');
        return;
      }

      console.log('Profile updated successfully');
      setProfile(prev => prev ? {
        ...prev,
        name: editName,
        phone: editPhone,
        country: editCountry,
        city: editCity,
        interested_in: editInterestedIn,
        age_range_min: editAgeRangeMin,
        age_range_max: editAgeRangeMax,
        interests: editInterests,
        personality_traits: editPersonality,
      } : null);
      setEditModalVisible(false);
      Alert.alert('Éxito', 'Perfil actualizado correctamente');
    } catch (error) {
      console.error('Failed to update profile:', error);
      Alert.alert('Error', 'No se pudo actualizar el perfil');
    }
  };

  const toggleNotification = async (type: 'whatsapp' | 'email' | 'sms' | 'push') => {
    if (!profile) return;

    const newPreferences = {
      ...profile.notification_preferences,
      [type]: !profile.notification_preferences[type],
    };

    try {
      console.log('Updating notification preferences:', type);
      const { error } = await supabase
        .from('users')
        .update({ notification_preferences: newPreferences })
        .eq('id', user?.id);

      if (error) {
        console.error('Error updating preferences:', error);
        return;
      }

      setProfile({ ...profile, notification_preferences: newPreferences });
    } catch (error) {
      console.error('Failed to update preferences:', error);
    }
  };

  const toggleInterest = (interest: string) => {
    if (editInterests.includes(interest)) {
      setEditInterests(editInterests.filter(i => i !== interest));
    } else {
      setEditInterests([...editInterests, interest]);
    }
  };

  const togglePersonality = (trait: string) => {
    if (editPersonality.includes(trait)) {
      setEditPersonality(editPersonality.filter(t => t !== trait));
    } else {
      setEditPersonality([...editPersonality, trait]);
    }
  };

  const handleMinAgeChange = (value: number) => {
    const newMin = Math.round(value);
    if (newMin < editAgeRangeMax) {
      setEditAgeRangeMin(newMin);
    }
  };

  const handleMaxAgeChange = (value: number) => {
    const newMax = Math.round(value);
    if (newMax > editAgeRangeMin) {
      setEditAgeRangeMax(newMax);
    }
  };

  if (loading) {
    return (
      <LinearGradient
        colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={nospiColors.purpleDark} />
        </View>
      </LinearGradient>
    );
  }

  if (!profile) {
    return (
      <LinearGradient
        colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>Error al cargar el perfil</Text>
        </View>
      </LinearGradient>
    );
  }

  const genderText = profile.gender === 'hombre' ? 'Hombre' : profile.gender === 'mujer' ? 'Mujer' : 'No binario';
  const interestedInText = profile.interested_in === 'hombres' ? 'Hombres' : profile.interested_in === 'mujeres' ? 'Mujeres' : 'Ambos';
  const ageRangeText = `${profile.age_range_min} - ${profile.age_range_max} años`;
  const locationText = `${profile.city}, ${profile.country}`;
  const availableCities = CITIES_BY_COUNTRY[editCountry] || [];
  const editAgeRangeText = `${editAgeRangeMin} - ${editAgeRangeMax} años`;
  const editMinAgeText = editAgeRangeMin.toString();
  const editMaxAgeText = editAgeRangeMax.toString();

  return (
    <LinearGradient
      colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
      style={styles.gradient}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handlePhotoPress} activeOpacity={0.8}>
            {profile.profile_photo_url ? (
              <View>
                <Image source={{ uri: profile.profile_photo_url }} style={styles.profilePhoto} />
                {uploadingPhoto && (
                  <View style={styles.photoOverlay}>
                    <ActivityIndicator size="large" color={nospiColors.white} />
                  </View>
                )}
                <View style={styles.editPhotoIcon}>
                  <Text style={styles.editPhotoIconText}>✏️</Text>
                </View>
              </View>
            ) : (
              <View style={styles.profilePhotoPlaceholder}>
                <Text style={styles.profilePhotoPlaceholderText}>
                  {profile.name.charAt(0).toUpperCase()}
                </Text>
                <View style={styles.editPhotoIcon}>
                  <Text style={styles.editPhotoIconText}>✏️</Text>
                </View>
              </View>
            )}
          </TouchableOpacity>
          <Text style={styles.name}>{profile.name}</Text>
          <Text style={styles.age}>{profile.age} años</Text>
          
          <TouchableOpacity
            style={styles.editButton}
            onPress={handleEditPress}
            activeOpacity={0.8}
          >
            <Text style={styles.editButtonText}>Editar Perfil</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Información Personal</Text>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email:</Text>
            <Text style={styles.infoValue}>{profile.email}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Teléfono:</Text>
            <Text style={styles.infoValue}>{profile.phone}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Género:</Text>
            <Text style={styles.infoValue}>{genderText}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Interesado en:</Text>
            <Text style={styles.infoValue}>{interestedInText}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Rango de edad:</Text>
            <Text style={styles.infoValue}>{ageRangeText}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Ubicación:</Text>
            <Text style={styles.infoValue}>{locationText}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Intereses</Text>
          <View style={styles.tagsContainer}>
            {profile.interests.map((interest, index) => (
              <View key={index} style={styles.tag}>
                <Text style={styles.tagText}>{interest}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personalidad</Text>
          <View style={styles.tagsContainer}>
            {profile.personality_traits.map((trait, index) => (
              <View key={index} style={styles.tag}>
                <Text style={styles.tagText}>{trait}</Text>
              </View>
            ))}
          </View>
        </View>

        <TouchableOpacity
          style={styles.section}
          onPress={handleNotificationPress}
          activeOpacity={0.8}
        >
          <Text style={styles.sectionTitle}>Preferencias de Notificaciones</Text>
          <Text style={styles.sectionSubtitle}>Toca para configurar</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.signOutButton}
          onPress={handleSignOut}
          activeOpacity={0.8}
        >
          <Text style={styles.signOutButtonText}>Cerrar Sesión</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Notification Preferences Modal */}
      <Modal
        visible={notificationModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setNotificationModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Preferencias de Notificaciones</Text>
            <Text style={styles.modalSubtitle}>¿Cómo quieres que te recordemos las citas?</Text>

            <TouchableOpacity
              style={styles.notificationOption}
              onPress={() => toggleNotification('whatsapp')}
              activeOpacity={0.8}
            >
              <Text style={styles.notificationOptionText}>WhatsApp</Text>
              <View style={[styles.checkbox, profile.notification_preferences.whatsapp && styles.checkboxActive]}>
                {profile.notification_preferences.whatsapp && <Text style={styles.checkmark}>✓</Text>}
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.notificationOption}
              onPress={() => toggleNotification('email')}
              activeOpacity={0.8}
            >
              <Text style={styles.notificationOptionText}>Correo Electrónico</Text>
              <View style={[styles.checkbox, profile.notification_preferences.email && styles.checkboxActive]}>
                {profile.notification_preferences.email && <Text style={styles.checkmark}>✓</Text>}
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.notificationOption}
              onPress={() => toggleNotification('sms')}
              activeOpacity={0.8}
            >
              <Text style={styles.notificationOptionText}>SMS</Text>
              <View style={[styles.checkbox, profile.notification_preferences.sms && styles.checkboxActive]}>
                {profile.notification_preferences.sms && <Text style={styles.checkmark}>✓</Text>}
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.notificationOption}
              onPress={() => toggleNotification('push')}
              activeOpacity={0.8}
            >
              <Text style={styles.notificationOptionText}>Notificaciones Push</Text>
              <View style={[styles.checkbox, profile.notification_preferences.push && styles.checkboxActive]}>
                {profile.notification_preferences.push && <Text style={styles.checkmark}>✓</Text>}
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setNotificationModalVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.modalCloseButtonText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  container: { flex: 1 },
  contentContainer: { padding: 24, paddingBottom: 120 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 16, color: nospiColors.purpleDark, textAlign: 'center' },
  header: { alignItems: 'center', marginTop: 48, marginBottom: 32 },
  profilePhoto: { width: 120, height: 120, borderRadius: 60, marginBottom: 16, borderWidth: 4, borderColor: nospiColors.white },
  profilePhotoPlaceholder: { width: 120, height: 120, borderRadius: 60, backgroundColor: nospiColors.purpleLight, justifyContent: 'center', alignItems: 'center', marginBottom: 16, borderWidth: 4, borderColor: nospiColors.white },
  profilePhotoPlaceholderText: { fontSize: 48, fontWeight: 'bold', color: nospiColors.purpleDark },
  photoOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 16, backgroundColor: 'rgba(0, 0, 0, 0.5)', borderRadius: 60, justifyContent: 'center', alignItems: 'center' },
  editPhotoIcon: { position: 'absolute', bottom: 16, right: 0, backgroundColor: nospiColors.white, width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: nospiColors.purpleDark },
  editPhotoIconText: { fontSize: 16 },
  name: { fontSize: 28, fontWeight: 'bold', color: nospiColors.purpleDark, marginBottom: 4 },
  age: { fontSize: 18, color: nospiColors.purpleDark, opacity: 0.8, marginBottom: 16 },
  editButton: { backgroundColor: 'rgba(255, 255, 255, 0.9)', paddingVertical: 10, paddingHorizontal: 24, borderRadius: 20, borderWidth: 2, borderColor: nospiColors.purpleDark },
  editButtonText: { color: nospiColors.purpleDark, fontSize: 14, fontWeight: '600' },
  section: { backgroundColor: 'rgba(255, 255, 255, 0.95)', borderRadius: 16, padding: 20, marginBottom: 16 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: nospiColors.purpleDark, marginBottom: 12 },
  sectionSubtitle: { fontSize: 14, color: '#666', marginTop: 4 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  infoLabel: { fontSize: 14, color: '#666', fontWeight: '600' },
  infoValue: { fontSize: 14, color: '#333', flex: 1, textAlign: 'right' },
  tagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { backgroundColor: nospiColors.purpleLight, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20 },
  tagText: { color: nospiColors.purpleDark, fontSize: 14, fontWeight: '600' },
  signOutButton: { backgroundColor: '#F44336', paddingVertical: 16, borderRadius: 16, alignItems: 'center', marginTop: 16, marginBottom: 32 },
  signOutButtonText: { color: nospiColors.white, fontSize: 16, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: nospiColors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalTitle: { fontSize: 24, fontWeight: 'bold', color: nospiColors.purpleDark, marginBottom: 8 },
  modalSubtitle: { fontSize: 16, color: '#666', marginBottom: 24 },
  notificationOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  notificationOptionText: { fontSize: 16, color: '#333' },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#CCC', justifyContent: 'center', alignItems: 'center' },
  checkboxActive: { backgroundColor: nospiColors.purpleDark, borderColor: nospiColors.purpleDark },
  checkmark: { color: nospiColors.white, fontSize: 16, fontWeight: 'bold' },
  modalCloseButton: { backgroundColor: '#E0E0E0', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 16 },
  modalCloseButtonText: { color: '#333', fontSize: 16, fontWeight: '600' },
});
