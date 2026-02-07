
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, Modal, TextInput, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { useSupabase } from '@/contexts/SupabaseContext';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

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

interface Subscription {
  id: string;
  plan_type: string;
  price: number;
  status: string;
  start_date: string;
  end_date: string;
  payment_method: string;
  auto_renew: boolean;
}

export default function ProfileScreen() {
  const { user, signOut } = useSupabase();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [notificationModalVisible, setNotificationModalVisible] = useState(false);
  const [subscriptionModalVisible, setSubscriptionModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCountry, setEditCountry] = useState('');
  const [editCity, setEditCity] = useState('');

  useEffect(() => {
    if (user) {
      loadProfile();
      loadSubscription();
    }
  }, [user]);

  const loadProfile = async () => {
    try {
      console.log('Loading user profile...');
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user?.id)
        .single();

      if (error) {
        console.error('Error loading profile:', error);
        return;
      }

      console.log('Profile loaded successfully');
      setProfile(data);
      setEditName(data.name);
      setEditPhone(data.phone);
      setEditCountry(data.country);
      setEditCity(data.city);
    } catch (error) {
      console.error('Failed to load profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSubscription = async () => {
    try {
      console.log('Loading subscription...');
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user?.id)
        .eq('status', 'active')
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading subscription:', error);
        return;
      }

      console.log('Subscription loaded:', data ? 'Active' : 'None');
      setSubscription(data);
    } catch (error) {
      console.error('Failed to load subscription:', error);
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

  const handleSubscriptionPress = () => {
    console.log('User tapped subscription section');
    setSubscriptionModalVisible(true);
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
      console.log('Uploading photo...');
      
      // Convert URI to blob
      const response = await fetch(uri);
      const blob = await response.blob();
      
      // Create file name
      const fileExt = uri.split('.').pop();
      const fileName = `${user?.id}-${Date.now()}.${fileExt}`;
      const filePath = `profile-photos/${fileName}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('profile-photos')
        .upload(filePath, blob);

      if (uploadError) {
        console.error('Upload error:', uploadError);
        Alert.alert('Error', 'No se pudo subir la foto');
        return;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('profile-photos')
        .getPublicUrl(filePath);

      const photoUrl = urlData.publicUrl;

      // Update profile in database
      const { error: updateError } = await supabase
        .from('users')
        .update({ profile_photo_url: photoUrl })
        .eq('id', user?.id);

      if (updateError) {
        console.error('Update error:', updateError);
        Alert.alert('Error', 'No se pudo actualizar el perfil');
        return;
      }

      console.log('Photo uploaded successfully');
      setProfile(prev => prev ? { ...prev, profile_photo_url: photoUrl } : null);
      Alert.alert('Éxito', 'Foto de perfil actualizada');
    } catch (error) {
      console.error('Failed to upload photo:', error);
      Alert.alert('Error', 'No se pudo subir la foto');
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

  const getPlanName = (planType: string) => {
    switch (planType) {
      case '1_month':
        return '1 Mes';
      case '3_months':
        return '3 Meses';
      case '6_months':
        return '6 Meses';
      default:
        return planType;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  if (loading) {
    return (
      <LinearGradient
        colors={[nospiColors.purpleDark, nospiColors.purpleMid, nospiColors.purpleLight]}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={nospiColors.white} />
        </View>
      </LinearGradient>
    );
  }

  if (!profile) {
    return (
      <LinearGradient
        colors={[nospiColors.purpleDark, nospiColors.purpleMid, nospiColors.purpleLight]}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
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

  return (
    <LinearGradient
      colors={[nospiColors.purpleDark, nospiColors.purpleMid, nospiColors.purpleLight]}
      style={styles.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
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
          style={styles.section}
          onPress={handleSubscriptionPress}
          activeOpacity={0.8}
        >
          <Text style={styles.sectionTitle}>Suscripción y Pagos</Text>
          {subscription ? (
            <View>
              <Text style={styles.subscriptionActive}>Plan Activo: {getPlanName(subscription.plan_type)}</Text>
              <Text style={styles.subscriptionDetails}>
                Válido hasta: {formatDate(subscription.end_date)}
              </Text>
            </View>
          ) : (
            <Text style={styles.subscriptionInactive}>Sin suscripción activa</Text>
          )}
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
            <TextInput
              style={styles.modalInput}
              value={editCountry}
              onChangeText={setEditCountry}
              placeholder="Tu país"
              placeholderTextColor="#999"
            />

            <Text style={styles.inputLabel}>Ciudad</Text>
            <TextInput
              style={styles.modalInput}
              value={editCity}
              onChangeText={setEditCity}
              placeholder="Tu ciudad"
              placeholderTextColor="#999"
            />

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

      {/* Subscription Modal */}
      <Modal
        visible={subscriptionModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSubscriptionModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Suscripción y Pagos</Text>
            
            {subscription ? (
              <View>
                <Text style={styles.subscriptionModalActive}>
                  Plan Activo: {getPlanName(subscription.plan_type)}
                </Text>
                <Text style={styles.subscriptionModalDetails}>
                  Precio: ${subscription.price}
                </Text>
                <Text style={styles.subscriptionModalDetails}>
                  Válido hasta: {formatDate(subscription.end_date)}
                </Text>
                <Text style={styles.subscriptionModalDetails}>
                  Método de pago: {subscription.payment_method}
                </Text>
                
                <TouchableOpacity
                  style={styles.cancelPlanButton}
                  onPress={() => {
                    console.log('User wants to cancel subscription');
                    router.push('/subscription-cancel');
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.cancelPlanButtonText}>Cancelar Plan</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                <Text style={styles.noSubscriptionText}>
                  No tienes una suscripción activa
                </Text>
                <TouchableOpacity
                  style={styles.subscribButton}
                  onPress={() => {
                    console.log('User wants to subscribe');
                    router.push('/subscription-plans');
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.subscribButtonText}>Ver Planes</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setSubscriptionModalVisible(false)}
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
  },
  errorText: {
    fontSize: 16,
    color: nospiColors.white,
    textAlign: 'center',
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
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 4,
    borderColor: nospiColors.white,
  },
  profilePhotoPlaceholderText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: nospiColors.white,
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
    color: nospiColors.white,
    marginBottom: 4,
  },
  age: {
    fontSize: 18,
    color: nospiColors.white,
    opacity: 0.9,
    marginBottom: 16,
  },
  editButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: nospiColors.white,
  },
  editButtonText: {
    color: nospiColors.white,
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
  subscriptionActive: {
    fontSize: 16,
    color: '#4CAF50',
    fontWeight: '600',
    marginBottom: 4,
  },
  subscriptionDetails: {
    fontSize: 14,
    color: '#666',
  },
  subscriptionInactive: {
    fontSize: 14,
    color: '#666',
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
  modalContent: {
    backgroundColor: nospiColors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '80%',
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
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#333',
    marginBottom: 8,
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
  subscriptionModalActive: {
    fontSize: 18,
    color: '#4CAF50',
    fontWeight: 'bold',
    marginBottom: 12,
  },
  subscriptionModalDetails: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  cancelPlanButton: {
    backgroundColor: '#F44336',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  cancelPlanButtonText: {
    color: nospiColors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  noSubscriptionText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  subscribButton: {
    backgroundColor: nospiColors.purpleDark,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  subscribButtonText: {
    color: nospiColors.white,
    fontSize: 16,
    fontWeight: '600',
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
});
