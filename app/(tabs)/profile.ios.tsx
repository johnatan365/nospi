
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, Modal, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { useSupabase } from '@/contexts/SupabaseContext';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Picker } from '@react-native-picker/picker';
import Slider from '@react-native-community/slider';
import AsyncStorage from '@react-native-async-storage/async-storage';

const HEADING = '#1a0010';
const BODY = '#333333';
const MUTED = '#555555';
const ACCENT = '#880E4F';

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

const COUNTRIES = ['Colombia','Argentina','Brasil','Chile','Ecuador','España','Estados Unidos','México','Perú','Venezuela'];
const CITIES_BY_COUNTRY: { [key: string]: string[] } = {
  'Colombia': ['Medellín','Bogotá','Cali','Barranquilla','Cartagena','Bucaramanga','Pereira','Santa Marta'],
  'Argentina': ['Buenos Aires','Córdoba','Rosario','Mendoza','La Plata'],
  'Brasil': ['São Paulo','Rio de Janeiro','Brasília','Salvador','Fortaleza'],
  'Chile': ['Santiago','Valparaíso','Concepción','La Serena','Antofagasta'],
  'Ecuador': ['Quito','Guayaquil','Cuenca','Santo Domingo','Machala'],
  'España': ['Madrid','Barcelona','Valencia','Sevilla','Zaragoza'],
  'Estados Unidos': ['Nueva York','Los Ángeles','Chicago','Houston','Miami'],
  'México': ['Ciudad de México','Guadalajara','Monterrey','Puebla','Tijuana'],
  'Perú': ['Lima','Arequipa','Trujillo','Chiclayo','Cusco'],
  'Venezuela': ['Caracas','Maracaibo','Valencia','Barquisimeto','Maracay'],
};
const AVAILABLE_INTERESTS = ['🎵 Música','🎬 Cine','📚 Lectura','✈️ Viajar','🍳 Cocinar','🏃 Deportes','🎨 Arte','📸 Fotografía','🎮 Videojuegos','🧘 Yoga','🏋️ Gym','🎭 Teatro','🍷 Vino','☕ Café','🌱 Naturaleza','🐕 Mascotas','🎤 Karaoke','💃 Bailar','🏖️ Playa','⛰️ Montaña','🍕 Comida','🎪 Festivales','🚴 Ciclismo','🏊 Natación','🎸 Música en vivo'];
const AVAILABLE_PERSONALITY = ['😊 Optimista','🤗 Empático','🎉 Divertido','🧠 Intelectual','💪 Aventurero','🎯 Ambicioso','😌 Tranquilo','🤝 Sociable','💭 Creativo','📖 Curioso','❤️ Romántico','😂 Gracioso','🎭 Espontáneo','🧘 Zen','🔥 Apasionado','🤓 Geek','🌟 Carismático','💼 Profesional','🎨 Artístico','🏆 Competitivo'];

export default function ProfileScreen() {
  const { user, signOut } = useSupabase();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notificationModalVisible, setNotificationModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCountry, setEditCountry] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editInterestedIn, setEditInterestedIn] = useState('');
  const [editAgeRangeMin, setEditAgeRangeMin] = useState(18);
  const [editAgeRangeMax, setEditAgeRangeMax] = useState(60);
  const [editInterests, setEditInterests] = useState<string[]>([]);
  const [editPersonality, setEditPersonality] = useState<string[]>([]);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      console.log('Loading user profile for user:', user?.id);
      if (!user?.id) { setError('No se encontró información de usuario'); setLoading(false); return; }
      const { data, error: fetchError } = await supabase.from('users').select('*').eq('id', user.id).maybeSingle();
      if (fetchError) { setError('Error al cargar el perfil: ' + fetchError.message); setLoading(false); return; }
      if (!data) {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        const metadata = authUser?.user_metadata || {};
        const fullName = metadata.full_name || metadata.name || authUser?.email?.split('@')[0] || 'Usuario';
        const defaultProfile = { id: user.id, email: user.email || '', name: fullName, birthdate: '2000-01-01', age: 24, gender: 'hombre', interested_in: 'ambos', age_range_min: 18, age_range_max: 60, country: 'Colombia', city: 'Medellín', phone: '', profile_photo_url: metadata.avatar_url || null, interests: [], personality_traits: [], compatibility_percentage: 95, notification_preferences: { whatsapp: false, email: true, sms: false, push: true } };
        await supabase.from('users').insert(defaultProfile);
        setProfile(defaultProfile as any);
        setEditName(defaultProfile.name); setEditPhone(defaultProfile.phone); setEditCountry(defaultProfile.country); setEditCity(defaultProfile.city); setEditInterestedIn(defaultProfile.interested_in); setEditAgeRangeMin(defaultProfile.age_range_min); setEditAgeRangeMax(defaultProfile.age_range_max); setEditInterests(defaultProfile.interests); setEditPersonality(defaultProfile.personality_traits);
        setLoading(false); return;
      }
      const profileData = data;
      if (profileData.profile_photo_url) {
        const baseUrl = profileData.profile_photo_url.split('?')[0];
        profileData.profile_photo_url = `${baseUrl}?t=${Date.now()}`;
      }
      setProfile(profileData);
      setEditName(profileData.name || ''); setEditPhone(profileData.phone || ''); setEditCountry(profileData.country || 'Colombia'); setEditCity(profileData.city || 'Medellín'); setEditInterestedIn(profileData.interested_in || 'ambos'); setEditAgeRangeMin(profileData.age_range_min || 18); setEditAgeRangeMax(profileData.age_range_max || 60); setEditInterests(profileData.interests || []); setEditPersonality(profileData.personality_traits || []);
    } catch (err) { console.error('Failed to load profile:', err); setError('Error inesperado al cargar el perfil'); }
    finally { setLoading(false); }
  }, [user?.id, user?.email]);

  useEffect(() => { if (user) loadProfile(); }, [user, loadProfile]);

  const handleSignOut = async () => {
    try { console.log('User signing out...'); await signOut(); router.replace('/welcome'); }
    catch (err) { console.error('Sign out failed:', err); }
  };

  const handlePhotoPress = async () => {
    console.log('User tapped profile photo to edit');
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) { Alert.alert('Permiso requerido', 'Necesitamos permiso para acceder a tus fotos'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8, base64: true });
    if (!result.canceled && result.assets && result.assets[0]) {
      const asset = result.assets[0];
      await uploadPhoto(asset.uri, asset.base64 || null);
    }
  };

  const uploadPhoto = async (uri: string, base64Data: string | null) => {
    setUploadingPhoto(true);
    try {
      console.log('Uploading profile photo (iOS), URI:', uri);
      const timestamp = Date.now();
      const filePath = `${user?.id}/${user?.id}-${timestamp}.jpg`;
      let uploadPayload: ArrayBuffer | Blob;
      if (base64Data) {
        const binaryStr = atob(base64Data);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
        uploadPayload = bytes.buffer;
      } else {
        const fetchResponse = await fetch(uri);
        if (!fetchResponse.ok) throw new Error(`Failed to read image file: ${fetchResponse.status}`);
        uploadPayload = await fetchResponse.blob();
      }
      const { data: existingFiles } = await supabase.storage.from('profile-photos').list(user?.id || '', { search: user?.id || '' });
      if (existingFiles && existingFiles.length > 0) {
        await supabase.storage.from('profile-photos').remove(existingFiles.map(f => `${user?.id}/${f.name}`));
      }
      const { error: uploadError } = await supabase.storage.from('profile-photos').upload(filePath, uploadPayload, { contentType: 'image/jpeg', cacheControl: '0', upsert: true });
      if (uploadError) { Alert.alert('Error', `No se pudo subir la foto: ${uploadError.message}`); return; }
      const { data: urlData } = supabase.storage.from('profile-photos').getPublicUrl(filePath);
      const basePhotoUrl = urlData.publicUrl;
      await supabase.from('users').update({ profile_photo_url: basePhotoUrl }).eq('id', user?.id);
      setProfile(prev => prev ? { ...prev, profile_photo_url: `${basePhotoUrl}?t=${timestamp}` } : null);
      Alert.alert('Éxito', 'Foto de perfil actualizada');
    } catch (err) { console.error('Failed to upload photo:', err); Alert.alert('Error', 'No se pudo subir la foto.'); }
    finally { setUploadingPhoto(false); }
  };

  const handleSaveProfile = async () => {
    if (!editName.trim() || !editPhone.trim()) { Alert.alert('Error', 'Por favor completa todos los campos requeridos'); return; }
    try {
      console.log('Saving profile changes...');
      const { error } = await supabase.from('users').update({ name: editName, phone: editPhone, country: editCountry, city: editCity, interested_in: editInterestedIn, age_range_min: editAgeRangeMin, age_range_max: editAgeRangeMax, interests: editInterests, personality_traits: editPersonality }).eq('id', user?.id);
      if (error) { Alert.alert('Error', 'No se pudo actualizar el perfil'); return; }
      console.log('Profile updated successfully');
      setProfile(prev => prev ? { ...prev, name: editName, phone: editPhone, country: editCountry, city: editCity, interested_in: editInterestedIn, age_range_min: editAgeRangeMin, age_range_max: editAgeRangeMax, interests: editInterests, personality_traits: editPersonality } : null);
      setEditModalVisible(false);
      Alert.alert('Éxito', 'Perfil actualizado correctamente');
    } catch (err) { console.error('Failed to update profile:', err); Alert.alert('Error', 'No se pudo actualizar el perfil'); }
  };

  const toggleNotification = async (type: 'whatsapp' | 'email' | 'sms' | 'push') => {
    if (!profile) return;
    console.log('Updating notification preferences:', type);
    const newPreferences = { ...profile.notification_preferences, [type]: !profile.notification_preferences[type] };
    try {
      const { error } = await supabase.from('users').update({ notification_preferences: newPreferences }).eq('id', user?.id);
      if (error) { console.error('Error updating preferences:', error); return; }
      setProfile({ ...profile, notification_preferences: newPreferences });
    } catch (err) { console.error('Failed to update preferences:', err); }
  };

  const toggleInterest = (interest: string) => {
    setEditInterests(prev => {
      const isSelected = prev.includes(interest);
      console.log(`User toggled interest "${interest}": ${isSelected ? 'removed' : 'added'}`);
      return isSelected ? prev.filter(i => i !== interest) : [...prev, interest];
    });
  };

  const togglePersonality = (trait: string) => {
    setEditPersonality(prev => {
      const isSelected = prev.includes(trait);
      console.log(`User toggled personality trait "${trait}": ${isSelected ? 'removed' : 'added'}`);
      return isSelected ? prev.filter(t => t !== trait) : [...prev, trait];
    });
  };

  const handleChangePassword = async () => {
    console.log('User attempting to change password');
    setPasswordError('');
    if (!currentPassword || !newPassword || !confirmPassword) { setPasswordError('Por favor completa todos los campos'); return; }
    if (newPassword.length < 6) { setPasswordError('La nueva contraseña debe tener al menos 6 caracteres'); return; }
    if (newPassword !== confirmPassword) { setPasswordError('Las contraseñas no coinciden'); return; }
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: profile?.email || '', password: currentPassword });
      if (signInError) { setPasswordError('La contraseña actual es incorrecta'); return; }
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) { setPasswordError('No se pudo actualizar la contraseña'); return; }
      console.log('Password updated successfully');
      Alert.alert('Éxito', 'Contraseña actualizada correctamente');
      setShowPasswordModal(false); setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err) { console.error('Failed to change password:', err); setPasswordError('Error al cambiar la contraseña'); }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={ACCENT} />
        <Text style={styles.loadingText}>Cargando perfil...</Text>
      </View>
    );
  }

  if (error || !profile) {
    const errorMessage = error || 'Error al cargar el perfil';
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>{errorMessage}</Text>
        <View style={styles.retryButtonWrapper}>
          <LinearGradient colors={['#1a0010', '#880E4F', '#AD1457']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.retryGradient}>
            <TouchableOpacity style={styles.retryButtonInner} onPress={loadProfile}>
              <Text style={styles.retryButtonText}>Reintentar</Text>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </View>
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
  const profileInitial = profile.name.charAt(0).toUpperCase();

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handlePhotoPress} activeOpacity={0.8}>
            {profile.profile_photo_url ? (
              <View>
                <Image source={{ uri: profile.profile_photo_url }} style={styles.profilePhoto} key={profile.profile_photo_url} />
                {uploadingPhoto && <View style={styles.photoOverlay}><ActivityIndicator size="large" color="#FFFFFF" /></View>}
                <View style={styles.editPhotoIcon}><Text style={styles.editPhotoIconText}>✏️</Text></View>
              </View>
            ) : (
              <View style={styles.profilePhotoPlaceholder}>
                <Text style={styles.profilePhotoPlaceholderText}>{profileInitial}</Text>
                <View style={styles.editPhotoIcon}><Text style={styles.editPhotoIconText}>✏️</Text></View>
              </View>
            )}
          </TouchableOpacity>
          <Text style={styles.name}>{profile.name}</Text>
          <Text style={styles.age}>{profile.age} años</Text>
          <View style={styles.editButtonWrapper}>
            <LinearGradient colors={['#1a0010', '#880E4F', '#AD1457']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.editButtonGradient}>
              <TouchableOpacity style={styles.editButtonInner} onPress={() => { console.log('User tapped edit profile'); setEditModalVisible(true); }} activeOpacity={0.8}>
                <Text style={styles.editButtonText}>Editar Perfil</Text>
              </TouchableOpacity>
            </LinearGradient>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Información Personal</Text>
          <View style={styles.infoRow}><Text style={styles.infoLabel}>Email:</Text><Text style={styles.infoValue}>{profile.email}</Text></View>
          <View style={styles.infoRow}><Text style={styles.infoLabel}>Teléfono:</Text><Text style={styles.infoValue}>{profile.phone || 'No especificado'}</Text></View>
          <View style={styles.infoRow}><Text style={styles.infoLabel}>Género:</Text><Text style={styles.infoValue}>{genderText}</Text></View>
          <View style={styles.infoRow}><Text style={styles.infoLabel}>Interesado en:</Text><Text style={styles.infoValue}>{interestedInText}</Text></View>
          <View style={styles.infoRow}><Text style={styles.infoLabel}>Rango de edad:</Text><Text style={styles.infoValue}>{ageRangeText}</Text></View>
          <View style={styles.infoRow}><Text style={styles.infoLabel}>Ubicación:</Text><Text style={styles.infoValue}>{locationText}</Text></View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Intereses</Text>
          <View style={styles.tagsContainer}>
            {profile.interests.length > 0 ? profile.interests.map((interest, index) => (
              <View key={index} style={styles.tag}><Text style={styles.tagText}>{interest}</Text></View>
            )) : <Text style={styles.emptyText}>No has agregado intereses aún</Text>}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personalidad</Text>
          <View style={styles.tagsContainer}>
            {profile.personality_traits.length > 0 ? profile.personality_traits.map((trait, index) => (
              <View key={index} style={styles.tag}><Text style={styles.tagText}>{trait}</Text></View>
            )) : <Text style={styles.emptyText}>No has agregado rasgos de personalidad aún</Text>}
          </View>
        </View>

        <TouchableOpacity style={styles.section} onPress={() => { console.log('User tapped notification preferences'); setNotificationModalVisible(true); }} activeOpacity={0.8}>
          <Text style={styles.sectionTitle}>Preferencias de Notificaciones</Text>
          <Text style={styles.sectionSubtitle}>Toca para configurar</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.section} onPress={() => { console.log('User tapped change password'); setShowPasswordModal(true); }} activeOpacity={0.8}>
          <Text style={styles.sectionTitle}>Cambiar Contraseña</Text>
          <Text style={styles.sectionSubtitle}>Actualiza tu contraseña</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut} activeOpacity={0.8}>
          <Text style={styles.signOutButtonText}>Cerrar Sesión</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal visible={editModalVisible} transparent animationType="slide" onRequestClose={() => setEditModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalScrollView} contentContainerStyle={styles.modalScrollContent}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Editar Perfil</Text>
              <Text style={styles.inputLabel}>Nombre</Text>
              <TextInput style={styles.modalInput} value={editName} onChangeText={setEditName} placeholder="Tu nombre" placeholderTextColor="#999" />
              <Text style={styles.inputLabel}>Teléfono</Text>
              <TextInput style={styles.modalInput} value={editPhone} onChangeText={setEditPhone} placeholder="Tu teléfono" placeholderTextColor="#999" keyboardType="phone-pad" />
              <Text style={styles.inputLabel}>País</Text>
              <TouchableOpacity style={styles.pickerButton} onPress={() => setShowCountryPicker(true)}>
                <Text style={styles.pickerButtonText}>{editCountry}</Text>
              </TouchableOpacity>
              <Text style={styles.inputLabel}>Ciudad</Text>
              <TouchableOpacity style={styles.pickerButton} onPress={() => setShowCityPicker(true)}>
                <Text style={styles.pickerButtonText}>{editCity}</Text>
              </TouchableOpacity>
              <Text style={styles.inputLabel}>Interesado en</Text>
              <View style={styles.optionsRow}>
                {(['hombres', 'mujeres', 'ambos'] as const).map((opt) => {
                  const labels = { hombres: 'Hombres', mujeres: 'Mujeres', ambos: 'Ambos' };
                  return (
                    <TouchableOpacity key={opt} style={[styles.optionButton, editInterestedIn === opt && styles.optionButtonActive]} onPress={() => setEditInterestedIn(opt)}>
                      <Text style={[styles.optionButtonText, editInterestedIn === opt && styles.optionButtonTextActive]}>{labels[opt]}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.inputLabel}>Rango de edad: {editAgeRangeText}</Text>
              <View style={styles.ageSliderSection}>
                <View style={styles.ageSliderRow}><Text style={styles.ageSliderLabel}>Mínimo</Text><Text style={styles.ageSliderValue}>{editMinAgeText}</Text></View>
                <Slider style={styles.ageSlider} minimumValue={18} maximumValue={59} step={1} value={editAgeRangeMin} onValueChange={(v) => { const n = Math.round(v); if (n < editAgeRangeMax) setEditAgeRangeMin(n); }} minimumTrackTintColor={ACCENT} maximumTrackTintColor="#E0E0E0" thumbTintColor={ACCENT} />
                <View style={styles.ageSliderRow}><Text style={styles.ageSliderLabel}>Máximo</Text><Text style={styles.ageSliderValue}>{editMaxAgeText}</Text></View>
                <Slider style={styles.ageSlider} minimumValue={19} maximumValue={60} step={1} value={editAgeRangeMax} onValueChange={(v) => { const n = Math.round(v); if (n > editAgeRangeMin) setEditAgeRangeMax(n); }} minimumTrackTintColor={ACCENT} maximumTrackTintColor="#E0E0E0" thumbTintColor={ACCENT} />
              </View>
              <Text style={styles.inputLabel}>Intereses</Text>
              <View style={styles.tagsEditContainer}>
                {AVAILABLE_INTERESTS.map((interest, index) => (
                  <TouchableOpacity key={index} style={[styles.tagEdit, editInterests.includes(interest) && styles.tagEditActive]} onPress={() => toggleInterest(interest)}>
                    <Text style={[styles.tagEditText, editInterests.includes(interest) && styles.tagEditTextActive]}>{interest}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.inputLabel}>Personalidad</Text>
              <View style={styles.tagsEditContainer}>
                {AVAILABLE_PERSONALITY.map((trait, index) => (
                  <TouchableOpacity key={index} style={[styles.tagEdit, editPersonality.includes(trait) && styles.tagEditActive]} onPress={() => togglePersonality(trait)}>
                    <Text style={[styles.tagEditText, editPersonality.includes(trait) && styles.tagEditTextActive]}>{trait}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.saveButtonWrapper}>
                <LinearGradient colors={['#1a0010', '#880E4F', '#AD1457']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveButtonGradient}>
                  <TouchableOpacity style={styles.saveButtonInner} onPress={handleSaveProfile} activeOpacity={0.8}>
                    <Text style={styles.saveButtonText}>Guardar Cambios</Text>
                  </TouchableOpacity>
                </LinearGradient>
              </View>
              <TouchableOpacity style={styles.modalCloseButton} onPress={() => setEditModalVisible(false)} activeOpacity={0.8}>
                <Text style={styles.modalCloseButtonText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Country Picker Modal */}
      <Modal visible={showCountryPicker} transparent animationType="slide" onRequestClose={() => setShowCountryPicker(false)}>
        <View style={styles.pickerModalOverlay}>
          <View style={styles.pickerModalContent}>
            <View style={styles.pickerModalHeader}>
              <Text style={styles.pickerModalTitle}>Selecciona tu país</Text>
              <TouchableOpacity onPress={() => setShowCountryPicker(false)}><Text style={styles.pickerModalClose}>Listo</Text></TouchableOpacity>
            </View>
            <Picker selectedValue={editCountry} onValueChange={(value) => { setEditCountry(value); const cities = CITIES_BY_COUNTRY[value] || []; if (cities.length > 0) setEditCity(cities[0]); }} style={styles.picker} color="#000000" dropdownIconColor="#000000">
              {COUNTRIES.map((country) => <Picker.Item key={country} label={country} value={country} color="#000000" />)}
            </Picker>
          </View>
        </View>
      </Modal>

      {/* City Picker Modal */}
      <Modal visible={showCityPicker} transparent animationType="slide" onRequestClose={() => setShowCityPicker(false)}>
        <View style={styles.pickerModalOverlay}>
          <View style={styles.pickerModalContent}>
            <View style={styles.pickerModalHeader}>
              <Text style={styles.pickerModalTitle}>Selecciona tu ciudad</Text>
              <TouchableOpacity onPress={() => setShowCityPicker(false)}><Text style={styles.pickerModalClose}>Listo</Text></TouchableOpacity>
            </View>
            <Picker selectedValue={editCity} onValueChange={(value) => setEditCity(value)} style={styles.picker} color="#000000" dropdownIconColor="#000000">
              {(CITIES_BY_COUNTRY[editCountry] || []).map((city) => <Picker.Item key={city} label={city} value={city} color="#000000" />)}
            </Picker>
          </View>
        </View>
      </Modal>

      {/* Password Change Modal */}
      <Modal visible={showPasswordModal} transparent animationType="slide" onRequestClose={() => setShowPasswordModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Cambiar Contraseña</Text>
            <Text style={styles.modalSubtitle}>Ingresa tu contraseña actual y la nueva</Text>
            <Text style={styles.inputLabel}>Contraseña Actual *</Text>
            <View style={styles.passwordInputWrapper}>
              <TextInput style={styles.passwordModalInput} placeholder="Contraseña actual" placeholderTextColor="#999" secureTextEntry={!showCurrentPassword} value={currentPassword} onChangeText={(text) => { setCurrentPassword(text); setPasswordError(''); }} autoCapitalize="none" />
              <TouchableOpacity onPress={() => { console.log('Toggle current password visibility'); setShowCurrentPassword(!showCurrentPassword); }} style={styles.passwordEyeButton}>
                <Ionicons name={showCurrentPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color="#666" />
              </TouchableOpacity>
            </View>
            <Text style={styles.inputLabel}>Nueva Contraseña *</Text>
            <View style={styles.passwordInputWrapper}>
              <TextInput style={styles.passwordModalInput} placeholder="Nueva contraseña (mínimo 6 caracteres)" placeholderTextColor="#999" secureTextEntry={!showNewPassword} value={newPassword} onChangeText={(text) => { setNewPassword(text); setPasswordError(''); }} autoCapitalize="none" />
              <TouchableOpacity onPress={() => { console.log('Toggle new password visibility'); setShowNewPassword(!showNewPassword); }} style={styles.passwordEyeButton}>
                <Ionicons name={showNewPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color="#666" />
              </TouchableOpacity>
            </View>
            <Text style={styles.inputLabel}>Confirmar Nueva Contraseña *</Text>
            <View style={styles.passwordInputWrapper}>
              <TextInput style={styles.passwordModalInput} placeholder="Confirma la nueva contraseña" placeholderTextColor="#999" secureTextEntry={!showConfirmPassword} value={confirmPassword} onChangeText={(text) => { setConfirmPassword(text); setPasswordError(''); }} autoCapitalize="none" />
              <TouchableOpacity onPress={() => { console.log('Toggle confirm password visibility'); setShowConfirmPassword(!showConfirmPassword); }} style={styles.passwordEyeButton}>
                <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color="#666" />
              </TouchableOpacity>
            </View>
            {passwordError ? <Text style={styles.passwordError}>{passwordError}</Text> : null}
            <View style={styles.saveButtonWrapper}>
              <LinearGradient colors={['#1a0010', '#880E4F', '#AD1457']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveButtonGradient}>
                <TouchableOpacity style={styles.saveButtonInner} onPress={handleChangePassword} activeOpacity={0.8}>
                  <Text style={styles.saveButtonText}>Cambiar Contraseña</Text>
                </TouchableOpacity>
              </LinearGradient>
            </View>
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => { setShowPasswordModal(false); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setPasswordError(''); }} activeOpacity={0.8}>
              <Text style={styles.modalCloseButtonText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Notification Preferences Modal */}
      <Modal visible={notificationModalVisible} transparent animationType="slide" onRequestClose={() => setNotificationModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Preferencias de Notificaciones</Text>
            <Text style={styles.modalSubtitle}>¿Cómo quieres que te recordemos las citas?</Text>
            {(['whatsapp', 'email', 'sms', 'push'] as const).map((type) => {
              const labels = { whatsapp: 'WhatsApp', email: 'Correo Electrónico', sms: 'SMS', push: 'Notificaciones Push' };
              return (
                <TouchableOpacity key={type} style={styles.notificationOption} onPress={() => toggleNotification(type)} activeOpacity={0.8}>
                  <Text style={styles.notificationOptionText}>{labels[type]}</Text>
                  <View style={[styles.checkbox, profile.notification_preferences[type] && styles.checkboxActive]}>
                    {profile.notification_preferences[type] ? <Text style={styles.checkmark}>✓</Text> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setNotificationModalVisible(false)} activeOpacity={0.8}>
              <Text style={styles.modalCloseButtonText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { flex: 1 },
  contentContainer: { padding: 24, paddingBottom: 120 },
  loadingContainer: { flex: 1, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 16, fontSize: 16, color: HEADING, textAlign: 'center' },
  errorText: { fontSize: 16, color: HEADING, textAlign: 'center', marginBottom: 16 },
  retryButtonWrapper: { borderRadius: 12, overflow: 'hidden' },
  retryGradient: { borderRadius: 12 },
  retryButtonInner: { paddingVertical: 12, paddingHorizontal: 24, alignItems: 'center' },
  retryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  header: { alignItems: 'center', marginTop: 48, marginBottom: 32 },
  profilePhoto: { width: 120, height: 120, borderRadius: 60, marginBottom: 16, borderWidth: 3, borderColor: ACCENT },
  profilePhotoPlaceholder: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#F8BBD0', justifyContent: 'center', alignItems: 'center', marginBottom: 16, borderWidth: 3, borderColor: ACCENT },
  profilePhotoPlaceholderText: { fontSize: 48, fontWeight: 'bold', color: HEADING },
  photoOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 16, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 60, justifyContent: 'center', alignItems: 'center' },
  editPhotoIcon: { position: 'absolute', bottom: 16, right: 0, backgroundColor: '#FFFFFF', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: ACCENT },
  editPhotoIconText: { fontSize: 16 },
  name: { fontSize: 28, fontWeight: 'bold', color: HEADING, marginBottom: 4 },
  age: { fontSize: 18, color: MUTED, marginBottom: 16 },
  editButtonWrapper: { borderRadius: 20, overflow: 'hidden' },
  editButtonGradient: { borderRadius: 20 },
  editButtonInner: { paddingVertical: 10, paddingHorizontal: 24, alignItems: 'center' },
  editButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  section: { backgroundColor: '#F9FAFB', borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#E5E7EB' },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: HEADING, marginBottom: 12 },
  sectionSubtitle: { fontSize: 14, color: MUTED, marginTop: 4 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  infoLabel: { fontSize: 14, color: MUTED, fontWeight: '600' },
  infoValue: { fontSize: 14, color: BODY, flex: 1, textAlign: 'right' },
  tagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { backgroundColor: '#F8BBD0', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20 },
  tagText: { color: HEADING, fontSize: 14, fontWeight: '600' },
  emptyText: { fontSize: 14, color: '#999', fontStyle: 'italic' },
  signOutButton: { backgroundColor: '#F44336', paddingVertical: 16, borderRadius: 16, alignItems: 'center', marginTop: 16, marginBottom: 32 },
  signOutButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalScrollView: { maxHeight: '90%' },
  modalScrollContent: { flexGrow: 1 },
  modalContent: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalTitle: { fontSize: 24, fontWeight: 'bold', color: HEADING, marginBottom: 8 },
  modalSubtitle: { fontSize: 16, color: MUTED, marginBottom: 24 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: BODY, marginBottom: 8, marginTop: 12 },
  modalInput: { backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, fontSize: 16, color: BODY, marginBottom: 8 },
  pickerButton: { backgroundColor: '#F5F5F5', borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 8 },
  pickerButtonText: { fontSize: 16, color: BODY },
  optionsRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  optionButton: { flex: 1, backgroundColor: '#F5F5F5', paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 2, borderColor: '#E0E0E0' },
  optionButtonActive: { backgroundColor: '#F8BBD0', borderColor: ACCENT },
  optionButtonText: { fontSize: 14, color: MUTED, fontWeight: '600' },
  optionButtonTextActive: { color: HEADING },
  ageSliderSection: { backgroundColor: '#F5F5F5', borderRadius: 12, padding: 16, marginBottom: 8 },
  ageSliderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  ageSliderLabel: { fontSize: 14, color: MUTED, fontWeight: '600' },
  ageSliderValue: { fontSize: 18, color: HEADING, fontWeight: 'bold' },
  ageSlider: { width: '100%', height: 40, marginBottom: 12 },
  tagsEditContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  tagEdit: { backgroundColor: '#F5F5F5', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, borderWidth: 2, borderColor: '#E0E0E0' },
  tagEditActive: { backgroundColor: '#F8BBD0', borderColor: ACCENT },
  tagEditText: { color: MUTED, fontSize: 14, fontWeight: '600' },
  tagEditTextActive: { color: HEADING },
  saveButtonWrapper: { borderRadius: 12, overflow: 'hidden', marginTop: 24 },
  saveButtonGradient: { borderRadius: 12 },
  saveButtonInner: { paddingVertical: 14, alignItems: 'center' },
  saveButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  notificationOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  notificationOptionText: { fontSize: 16, color: BODY },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#CCC', justifyContent: 'center', alignItems: 'center' },
  checkboxActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  checkmark: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  modalCloseButton: { backgroundColor: '#E0E0E0', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 16 },
  modalCloseButtonText: { color: BODY, fontSize: 16, fontWeight: '600' },
  pickerModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pickerModalContent: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40 },
  pickerModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.1)' },
  pickerModalTitle: { fontSize: 18, fontWeight: '700', color: HEADING },
  pickerModalClose: { fontSize: 16, fontWeight: '600', color: ACCENT },
  picker: { width: '100%', height: 200 },
  passwordError: { fontSize: 14, color: '#EF4444', marginBottom: 12, textAlign: 'center' },
  passwordInputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, marginBottom: 8 },
  passwordModalInput: { flex: 1, paddingVertical: 14, paddingLeft: 16, paddingRight: 8, fontSize: 16, color: BODY },
  passwordEyeButton: { paddingHorizontal: 14, justifyContent: 'center', alignSelf: 'stretch' },
});
