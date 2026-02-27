
import React, { useEffect, useState, useCallback } from 'react';
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

  // Password change state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      console.log('🔄 Loading user profile for user:', user?.id);
      
      if (!user?.id) {
        console.log('❌ No user ID available');
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        console.error('❌ Error loading profile:', error);
        setLoading(false);
        return;
      }

      if (!data) {
        console.log('⚠️ No profile data found, creating default profile');
        
        // Get user metadata from auth
        const { data: { user: authUser } } = await supabase.auth.getUser();
        const metadata = authUser?.user_metadata || {};
        
        const fullName = metadata.full_name || metadata.name || authUser?.email?.split('@')[0] || 'Usuario';
        const profilePhotoUrl = metadata.avatar_url || metadata.picture || null;
        
        // Create a default profile
        const defaultProfile = {
          id: user.id,
          email: user.email || '',
          name: fullName,
          birthdate: '',
          age: 18,
          gender: 'hombre',
          interested_in: 'ambos',
          age_range_min: 18,
          age_range_max: 60,
          country: 'Colombia',
          city: 'Medellín',
          phone: '',
          profile_photo_url: profilePhotoUrl,
          interests: [],
          personality_traits: [],
          compatibility_percentage: 95,
          notification_preferences: {
            whatsapp: false,
            email: true,
            sms: false,
            push: true,
          },
        };

        console.log('📝 Creating default profile:', defaultProfile);

        const { error: insertError } = await supabase
          .from('users')
          .insert(defaultProfile);

        if (insertError) {
          console.error('❌ Error creating default profile:', insertError);
        } else {
          console.log('✅ Default profile created');
          setProfile(defaultProfile);
          setEditName(defaultProfile.name);
          setEditPhone(defaultProfile.phone);
          setEditCountry(defaultProfile.country);
          setEditCity(defaultProfile.city);
          setEditInterestedIn(defaultProfile.interested_in);
          setEditAgeRangeMin(defaultProfile.age_range_min);
          setEditAgeRangeMax(defaultProfile.age_range_max);
          setEditInterests(defaultProfile.interests);
          setEditPersonality(defaultProfile.personality_traits);
        }
        
        setLoading(false);
        return;
      }

      const profileData = data;
      console.log('✅ Profile loaded successfully:', profileData.name);
      
      // Add cache-busting to profile photo URL when loading
      if (profileData.profile_photo_url) {
        const baseUrl = profileData.profile_photo_url.split('?')[0];
        const cacheBustedUrl = `${baseUrl}?t=${Date.now()}`;
        console.log('🔄 Cache-busted photo URL:', cacheBustedUrl);
        profileData.profile_photo_url = cacheBustedUrl;
      }
      
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
      console.error('❌ Failed to load profile:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.email]);

  useEffect(() => {
    if (user) {
      loadProfile();
    }
  }, [user, loadProfile]);

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
      console.log('🖼️ === UPLOADING PROFILE PHOTO ===');
      console.log('URI:', uri);
      
      const response = await fetch(uri);
      const blob = await response.blob();
      
      const fileExt = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const timestamp = Date.now();
      const fileName = `${user?.id}-${timestamp}.${fileExt}`;
      const filePath = fileName;

      console.log('📤 Uploading to bucket: profile-photos, path:', filePath);

      // Delete old photos first
      console.log('🗑️ Deleting old photos...');
      const { data: existingFiles } = await supabase.storage
        .from('profile-photos')
        .list('', {
          search: user?.id || '',
        });

      if (existingFiles && existingFiles.length > 0) {
        const filesToDelete = existingFiles.map(f => f.name);
        const { error: deleteError } = await supabase.storage
          .from('profile-photos')
          .remove(filesToDelete);
        
        if (deleteError) {
          console.error('⚠️ Error deleting old photos:', deleteError);
        } else {
          console.log('✅ Deleted old photos:', filesToDelete);
        }
      }

      // Upload new photo
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('profile-photos')
        .upload(filePath, blob, {
          contentType: `image/${fileExt}`,
          cacheControl: '0',
          upsert: false,
        });

      if (uploadError) {
        console.error('❌ Upload error:', uploadError);
        Alert.alert('Error', `No se pudo subir la foto: ${uploadError.message}`);
        return;
      }

      console.log('✅ Upload successful:', uploadData);

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('profile-photos')
        .getPublicUrl(filePath);

      const basePhotoUrl = urlData.publicUrl;
      console.log('🔗 Base public URL:', basePhotoUrl);

      // Update database with base URL
      const { error: updateError } = await supabase
        .from('users')
        .update({ profile_photo_url: basePhotoUrl })
        .eq('id', user?.id);

      if (updateError) {
        console.error('❌ Database update error:', updateError);
        Alert.alert('Error', 'No se pudo actualizar el perfil');
        return;
      }

      console.log('✅ Database updated successfully');
      
      // Force immediate UI update with cache-busted URL
      const cacheBustedUrl = `${basePhotoUrl}?t=${timestamp}`;
      console.log('🔄 Updating UI with cache-busted URL:', cacheBustedUrl);
      
      setProfile(prev => prev ? { 
        ...prev, 
        profile_photo_url: cacheBustedUrl 
      } : null);
      
      console.log('✅ === PHOTO UPLOAD COMPLETE ===');
      Alert.alert('Éxito', 'Foto de perfil actualizada');
    } catch (error) {
      console.error('❌ Failed to upload photo:', error);
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

  const handleChangePassword = async () => {
    console.log('User attempting to change password');
    setPasswordError('');

    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('Por favor completa todos los campos');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError('La nueva contraseña debe tener al menos 6 caracteres');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Las contraseñas no coinciden');
      return;
    }

    try {
      // Verify current password by attempting to sign in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: profile?.email || '',
        password: currentPassword,
      });

      if (signInError) {
        setPasswordError('La contraseña actual es incorrecta');
        return;
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        console.error('Error updating password:', updateError);
        setPasswordError('No se pudo actualizar la contraseña');
        return;
      }

      console.log('Password updated successfully');
      Alert.alert('Éxito', 'Contraseña actualizada correctamente');
      setShowPasswordModal(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      console.error('Failed to change password:', error);
      setPasswordError('Error al cambiar la contraseña');
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
          <Text style={styles.loadingText}>Cargando perfil...</Text>
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
          <TouchableOpacity style={styles.retryButton} onPress={loadProfile}>
            <Text style={styles.retryButtonText}>Reintentar</Text>
          </TouchableOpacity>
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
                <Image 
                  source={{ uri: profile.profile_photo_url }} 
                  style={styles.profilePhoto}
                  key={profile.profile_photo_url}
                />
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
            <Text style={styles.infoValue}>{profile.phone || 'No especificado'}</Text>
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
            {profile.interests.length > 0 ? (
              profile.interests.map((interest, index) => (
                <View key={index} style={styles.tag}>
                  <Text style={styles.tagText}>{interest}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No has agregado intereses aún</Text>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personalidad</Text>
          <View style={styles.tagsContainer}>
            {profile.personality_traits.length > 0 ? (
              profile.personality_traits.map((trait, index) => (
                <View key={index} style={styles.tag}>
                  <Text style={styles.tagText}>{trait}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No has agregado rasgos de personalidad aún</Text>
            )}
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
          style={styles.section}
          onPress={() => setShowPasswordModal(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.sectionTitle}>Cambiar Contraseña</Text>
          <Text style={styles.sectionSubtitle}>Actualiza tu contraseña</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.signOutButton}
          onPress={handleSignOut}
          activeOpacity={0.8}
        >
          <Text style={styles.signOutButtonText}>Cerrar Sesión</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalScrollView} contentContainerStyle={styles.modalScrollContent}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Editar Perfil</Text>

              <Text style={styles.inputLabel}>Nombre</Text>
              <TextInput
                style={styles.modalInput}
                value={editName}
                onChangeText={setEditName}
                placeholder="Tu nombre"
                placeholderTextColor="#999"
              />

              <Text style={styles.inputLabel}>Teléfono</Text>
              <TextInput
                style={styles.modalInput}
                value={editPhone}
                onChangeText={setEditPhone}
                placeholder="Tu teléfono"
                placeholderTextColor="#999"
                keyboardType="phone-pad"
              />

              <Text style={styles.inputLabel}>País</Text>
              <TouchableOpacity 
                style={styles.pickerButton}
                onPress={() => setShowCountryPicker(true)}
              >
                <Text style={styles.pickerButtonText}>{editCountry}</Text>
              </TouchableOpacity>

              <Text style={styles.inputLabel}>Ciudad</Text>
              <TouchableOpacity 
                style={styles.pickerButton}
                onPress={() => setShowCityPicker(true)}
              >
                <Text style={styles.pickerButtonText}>{editCity}</Text>
              </TouchableOpacity>

              <Text style={styles.inputLabel}>Interesado en</Text>
              <View style={styles.optionsRow}>
                <TouchableOpacity
                  style={[styles.optionButton, editInterestedIn === 'hombres' && styles.optionButtonActive]}
                  onPress={() => setEditInterestedIn('hombres')}
                >
                  <Text style={[styles.optionButtonText, editInterestedIn === 'hombres' && styles.optionButtonTextActive]}>
                    Hombres
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.optionButton, editInterestedIn === 'mujeres' && styles.optionButtonActive]}
                  onPress={() => setEditInterestedIn('mujeres')}
                >
                  <Text style={[styles.optionButtonText, editInterestedIn === 'mujeres' && styles.optionButtonTextActive]}>
                    Mujeres
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.optionButton, editInterestedIn === 'ambos' && styles.optionButtonActive]}
                  onPress={() => setEditInterestedIn('ambos')}
                >
                  <Text style={[styles.optionButtonText, editInterestedIn === 'ambos' && styles.optionButtonTextActive]}>
                    Ambos
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Rango de edad: {editAgeRangeText}</Text>
              <View style={styles.ageSliderSection}>
                <View style={styles.ageSliderRow}>
                  <Text style={styles.ageSliderLabel}>Mínimo</Text>
                  <Text style={styles.ageSliderValue}>{editMinAgeText}</Text>
                </View>
                <Slider
                  style={styles.ageSlider}
                  minimumValue={18}
                  maximumValue={59}
                  step={1}
                  value={editAgeRangeMin}
                  onValueChange={handleMinAgeChange}
                  minimumTrackTintColor={nospiColors.purpleDark}
                  maximumTrackTintColor="#E0E0E0"
                  thumbTintColor={nospiColors.purpleDark}
                />
                <View style={styles.ageSliderRow}>
                  <Text style={styles.ageSliderLabel}>Máximo</Text>
                  <Text style={styles.ageSliderValue}>{editMaxAgeText}</Text>
                </View>
                <Slider
                  style={styles.ageSlider}
                  minimumValue={19}
                  maximumValue={60}
                  step={1}
                  value={editAgeRangeMax}
                  onValueChange={handleMaxAgeChange}
                  minimumTrackTintColor={nospiColors.purpleDark}
                  maximumTrackTintColor="#E0E0E0"
                  thumbTintColor={nospiColors.purpleDark}
                />
              </View>

              <Text style={styles.inputLabel}>Intereses</Text>
              <View style={styles.tagsEditContainer}>
                {AVAILABLE_INTERESTS.map((interest, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[styles.tagEdit, editInterests.includes(interest) && styles.tagEditActive]}
                    onPress={() => toggleInterest(interest)}
                  >
                    <Text style={[styles.tagEditText, editInterests.includes(interest) && styles.tagEditTextActive]}>
                      {interest}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Personalidad</Text>
              <View style={styles.tagsEditContainer}>
                {AVAILABLE_PERSONALITY.map((trait, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[styles.tagEdit, editPersonality.includes(trait) && styles.tagEditActive]}
                    onPress={() => togglePersonality(trait)}
                  >
                    <Text style={[styles.tagEditText, editPersonality.includes(trait) && styles.tagEditTextActive]}>
                      {trait}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSaveProfile}
                activeOpacity={0.8}
              >
                <Text style={styles.saveButtonText}>Guardar Cambios</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setEditModalVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCloseButtonText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Country Picker Modal */}
      <Modal
        visible={showCountryPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCountryPicker(false)}
      >
        <View style={styles.pickerModalOverlay}>
          <View style={styles.pickerModalContent}>
            <View style={styles.pickerModalHeader}>
              <Text style={styles.pickerModalTitle}>Selecciona tu país</Text>
              <TouchableOpacity onPress={() => setShowCountryPicker(false)}>
                <Text style={styles.pickerModalClose}>Listo</Text>
              </TouchableOpacity>
            </View>
            <Picker
              selectedValue={editCountry}
              onValueChange={(value) => {
                setEditCountry(value);
                const cities = CITIES_BY_COUNTRY[value] || [];
                if (cities.length > 0) {
                  setEditCity(cities[0]);
                }
              }}
              style={styles.picker}
            >
              {COUNTRIES.map((country) => (
                <Picker.Item key={country} label={country} value={country} />
              ))}
            </Picker>
          </View>
        </View>
      </Modal>

      {/* City Picker Modal */}
      <Modal
        visible={showCityPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCityPicker(false)}
      >
        <View style={styles.pickerModalOverlay}>
          <View style={styles.pickerModalContent}>
            <View style={styles.pickerModalHeader}>
              <Text style={styles.pickerModalTitle}>Selecciona tu ciudad</Text>
              <TouchableOpacity onPress={() => setShowCityPicker(false)}>
                <Text style={styles.pickerModalClose}>Listo</Text>
              </TouchableOpacity>
            </View>
            <Picker
              selectedValue={editCity}
              onValueChange={(value) => setEditCity(value)}
              style={styles.picker}
            >
              {availableCities.map((city) => (
                <Picker.Item key={city} label={city} value={city} />
              ))}
            </Picker>
          </View>
        </View>
      </Modal>

      {/* Password Change Modal */}
      <Modal
        visible={showPasswordModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPasswordModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Cambiar Contraseña</Text>
            <Text style={styles.modalSubtitle}>Ingresa tu contraseña actual y la nueva</Text>

            <Text style={styles.inputLabel}>Contraseña Actual *</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Contraseña actual"
              placeholderTextColor="#999"
              secureTextEntry
              value={currentPassword}
              onChangeText={(text) => {
                setCurrentPassword(text);
                setPasswordError('');
              }}
              autoCapitalize="none"
            />

            <Text style={styles.inputLabel}>Nueva Contraseña *</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Nueva contraseña (mínimo 6 caracteres)"
              placeholderTextColor="#999"
              secureTextEntry
              value={newPassword}
              onChangeText={(text) => {
                setNewPassword(text);
                setPasswordError('');
              }}
              autoCapitalize="none"
            />

            <Text style={styles.inputLabel}>Confirmar Nueva Contraseña *</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Confirma la nueva contraseña"
              placeholderTextColor="#999"
              secureTextEntry
              value={confirmPassword}
              onChangeText={(text) => {
                setConfirmPassword(text);
                setPasswordError('');
              }}
              autoCapitalize="none"
            />

            {passwordError ? (
              <Text style={styles.passwordError}>{passwordError}</Text>
            ) : null}

            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleChangePassword}
              activeOpacity={0.8}
            >
              <Text style={styles.saveButtonText}>Cambiar Contraseña</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => {
                setShowPasswordModal(false);
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
                setPasswordError('');
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.modalCloseButtonText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 24,
    paddingBottom: 120,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: nospiColors.purpleDark,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 16,
    color: nospiColors.purpleDark,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: nospiColors.purpleDark,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  retryButtonText: {
    color: nospiColors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    alignItems: 'center',
    marginTop: 48,
    marginBottom: 32,
  },
  profilePhoto: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 16,
    borderWidth: 4,
    borderColor: nospiColors.white,
  },
  profilePhotoPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: nospiColors.purpleLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 4,
    borderColor: nospiColors.white,
  },
  profilePhotoPlaceholderText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
  },
  photoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editPhotoIcon: {
    position: 'absolute',
    bottom: 16,
    right: 0,
    backgroundColor: nospiColors.white,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: nospiColors.purpleDark,
  },
  editPhotoIconText: {
    fontSize: 16,
  },
  name: {
    fontSize: 28,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 4,
  },
  age: {
    fontSize: 18,
    color: nospiColors.purpleDark,
    opacity: 0.8,
    marginBottom: 16,
  },
  editButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: nospiColors.purpleDark,
  },
  editButtonText: {
    color: nospiColors.purpleDark,
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 12,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 14,
    color: '#333',
    flex: 1,
    textAlign: 'right',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: nospiColors.purpleLight,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  tagText: {
    color: nospiColors.purpleDark,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
  signOutButton: {
    backgroundColor: '#F44336',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 32,
  },
  signOutButtonText: {
    color: nospiColors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalScrollView: {
    maxHeight: '90%',
  },
  modalScrollContent: {
    flexGrow: 1,
  },
  modalContent: {
    backgroundColor: nospiColors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 12,
  },
  modalInput: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#333',
    marginBottom: 8,
  },
  pickerButton: {
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  pickerButtonText: {
    fontSize: 16,
    color: '#333',
  },
  optionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  optionButton: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  optionButtonActive: {
    backgroundColor: nospiColors.purpleLight,
    borderColor: nospiColors.purpleDark,
  },
  optionButtonText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  optionButtonTextActive: {
    color: nospiColors.purpleDark,
  },
  ageSliderSection: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  ageSliderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  ageSliderLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  ageSliderValue: {
    fontSize: 18,
    color: nospiColors.purpleDark,
    fontWeight: 'bold',
  },
  ageSlider: {
    width: '100%',
    height: 40,
    marginBottom: 12,
  },
  tagsEditContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  tagEdit: {
    backgroundColor: '#F5F5F5',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  tagEditActive: {
    backgroundColor: nospiColors.purpleLight,
    borderColor: nospiColors.purpleDark,
  },
  tagEditText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
  },
  tagEditTextActive: {
    color: nospiColors.purpleDark,
  },
  saveButton: {
    backgroundColor: nospiColors.purpleDark,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  saveButtonText: {
    color: nospiColors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  notificationOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  notificationOptionText: {
    fontSize: 16,
    color: '#333',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#CCC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: {
    backgroundColor: nospiColors.purpleDark,
    borderColor: nospiColors.purpleDark,
  },
  checkmark: {
    color: nospiColors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalCloseButton: {
    backgroundColor: '#E0E0E0',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  modalCloseButtonText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
  },
  pickerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  pickerModalContent: {
    backgroundColor: nospiColors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
  },
  pickerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  pickerModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: nospiColors.purpleDark,
  },
  pickerModalClose: {
    fontSize: 16,
    fontWeight: '600',
    color: nospiColors.purpleMid,
  },
  picker: {
    width: '100%',
    height: 200,
  },
  passwordError: {
    fontSize: 14,
    color: '#EF4444',
    marginBottom: 12,
    textAlign: 'center',
  },
});
