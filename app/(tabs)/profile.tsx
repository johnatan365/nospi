
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { useSupabase } from '@/contexts/SupabaseContext';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';

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
          {profile.profile_photo_url ? (
            <Image source={{ uri: profile.profile_photo_url }} style={styles.profilePhoto} />
          ) : (
            <View style={styles.profilePhotoPlaceholder}>
              <Text style={styles.profilePhotoPlaceholderText}>
                {profile.name.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={styles.name}>{profile.name}</Text>
          <Text style={styles.age}>{profile.age} años</Text>
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
    paddingBottom: 100,
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
