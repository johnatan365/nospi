import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Modal, TextInput, Alert, Platform, FlatList, SafeAreaView, Linking, KeyboardAvoidingView, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { useAppConfig } from '@/contexts/AppConfigContext';
import { useSupabase } from '@/contexts/SupabaseContext';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import Slider from '@react-native-community/slider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import Constants from 'expo-constants';
import { useFocusEffect } from '@react-navigation/native';
import { SkeletonBox } from '@/components/SkeletonBox';
import { getCached, setCached, clearCached } from '@/utils/cache';

const CACHE_KEY = 'cache_profile';

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

// ── Phone country data ────────────────────────────────────────────────────────
const PHONE_COUNTRIES = [
  { name: 'Colombia',        code: '+57',  flag: '🇨🇴', digits: 10, starts: ['3'] },
  { name: 'Argentina',       code: '+54',  flag: '🇦🇷', digits: 10, starts: ['1','2','3','4','9'] },
  { name: 'Bolivia',         code: '+591', flag: '🇧🇴', digits: 8,  starts: ['6','7'] },
  { name: 'Brasil',          code: '+55',  flag: '🇧🇷', digits: 11, starts: ['1','2','3','4','5','6','7','8','9'] },
  { name: 'Canadá',          code: '+1',   flag: '🇨🇦', digits: 10, starts: ['2','3','4','5','6','7','8','9'] },
  { name: 'Chile',           code: '+56',  flag: '🇨🇱', digits: 9,  starts: ['9'] },
  { name: 'Costa Rica',      code: '+506', flag: '🇨🇷', digits: 8,  starts: ['6','7','8'] },
  { name: 'Cuba',            code: '+53',  flag: '🇨🇺', digits: 8,  starts: ['5'] },
  { name: 'Ecuador',         code: '+593', flag: '🇪🇨', digits: 9,  starts: ['9'] },
  { name: 'El Salvador',     code: '+503', flag: '🇸🇻', digits: 8,  starts: ['6','7'] },
  { name: 'España',          code: '+34',  flag: '🇪🇸', digits: 9,  starts: ['6','7'] },
  { name: 'Estados Unidos',  code: '+1',   flag: '🇺🇸', digits: 10, starts: ['2','3','4','5','6','7','8','9'] },
  { name: 'Guatemala',       code: '+502', flag: '🇬🇹', digits: 8,  starts: ['3','4','5'] },
  { name: 'Honduras',        code: '+504', flag: '🇭🇳', digits: 8,  starts: ['3','8','9'] },
  { name: 'México',          code: '+52',  flag: '🇲🇽', digits: 10, starts: ['1','2','3','4','5','6','7','8','9'] },
  { name: 'Nicaragua',       code: '+505', flag: '🇳🇮', digits: 8,  starts: ['8'] },
  { name: 'Panamá',          code: '+507', flag: '🇵🇦', digits: 8,  starts: ['6'] },
  { name: 'Paraguay',        code: '+595', flag: '🇵🇾', digits: 9,  starts: ['9'] },
  { name: 'Perú',            code: '+51',  flag: '🇵🇪', digits: 9,  starts: ['9'] },
  { name: 'Puerto Rico',     code: '+1',   flag: '🇵🇷', digits: 10, starts: ['7'] },
  { name: 'Rep. Dominicana', code: '+1',   flag: '🇩🇴', digits: 10, starts: ['8','9'] },
  { name: 'Uruguay',         code: '+598', flag: '🇺🇾', digits: 9,  starts: ['9'] },
  { name: 'Venezuela',       code: '+58',  flag: '🇻🇪', digits: 10, starts: ['4'] },
];

const DEFAULT_PHONE_COUNTRY = PHONE_COUNTRIES[0]; // Colombia +57

function parsePhoneIntoCountryAndNumber(phone: string): { country: typeof PHONE_COUNTRIES[0]; number: string } {
  if (!phone || !phone.startsWith('+')) {
    return { country: DEFAULT_PHONE_COUNTRY, number: phone || '' };
  }
  // Sort by code length descending for longest-match-first
  const sorted = [...PHONE_COUNTRIES].sort((a, b) => b.code.length - a.code.length);
  for (const c of sorted) {
    if (phone.startsWith(c.code)) {
      return { country: c, number: phone.slice(c.code.length) };
    }
  }
  return { country: DEFAULT_PHONE_COUNTRY, number: phone };
}

const COUNTRIES = [
  'Colombia', 'Argentina', 'Brasil', 'Chile', 'Ecuador',
  'España', 'Estados Unidos', 'México', 'Perú', 'Venezuela',
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
  '🎵 Música', '🎬 Cine', '📚 Lectura', '✈️ Viajar', '🍳 Cocinar',
  '🏃 Deportes', '🎨 Arte', '📸 Fotografía', '🎮 Videojuegos', '🧘 Yoga',
  '🏋️ Gym', '🎭 Teatro', '🍷 Vino', '☕ Café', '🌱 Naturaleza',
  '🐕 Mascotas', '🎤 Karaoke', '💃 Bailar', '🏖️ Playa', '⛰️ Montaña',
  '🍕 Comida', '🎪 Festivales', '🚴 Ciclismo', '🏊 Natación', '🎸 Música en vivo',
];

const AVAILABLE_PERSONALITY = [
  '😊 Optimista', '🤗 Empático', '🎉 Divertido', '🧠 Intelectual', '💪 Aventurero',
  '🎯 Ambicioso', '😌 Tranquilo', '🤝 Sociable', '💭 Creativo', '📖 Curioso',
  '❤️ Romántico', '😂 Gracioso', '🎭 Espontáneo', '🧘 Zen', '🔥 Apasionado',
  '🤓 Geek', '🌟 Carismático', '💼 Profesional', '🎨 Artístico', '🏆 Competitivo',
];

export default function ProfileScreen() {
  const { user, signOut } = useSupabase();
  const { appConfig } = useAppConfig();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  // Phone country selector state
  const [editPhoneCountry, setEditPhoneCountry] = useState(DEFAULT_PHONE_COUNTRY);
  const [editPhoneNumber, setEditPhoneNumber] = useState('');
  const [showPhoneCountryModal, setShowPhoneCountryModal] = useState(false);
  const [phoneCountrySearch, setPhoneCountrySearch] = useState('');
  const [phoneStatus, setPhoneStatus] = useState<'idle'|'checking'|'available'|'taken'>('idle');
  const [phoneInlineError, setPhoneInlineError] = useState('');
  const debounceRef = useRef<any>(null);

  // Support modal state
  const [showSupportEmailModal, setShowSupportEmailModal] = useState(false);
  const [supportSenderName, setSupportSenderName] = useState('');
  const [supportUserEmail, setSupportUserEmail] = useState('');
  const [supportMessage, setSupportMessage] = useState('');
  const [sendingSupportEmail, setSendingSupportEmail] = useState(false);
  const [supportEmailSent, setSupportEmailSent] = useState(false);

  // Password change state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Cache ref — avoids re-fetching on every tab focus
  const cacheRef = useRef<{ data: UserProfile; timestamp: number } | null>(null);

  const populateEditFields = (profileData: UserProfile) => {
    setEditName(profileData.name || '');
    setEditPhone(profileData.phone || '');
    setEditCountry(profileData.country || 'Colombia');
    setEditCity(profileData.city || 'Medellín');
    setEditInterestedIn(profileData.interested_in || 'ambos');
    setEditAgeRangeMin(profileData.age_range_min || 18);
    setEditAgeRangeMax(profileData.age_range_max || 60);
    setEditInterests(profileData.interests || []);
    setEditPersonality(profileData.personality_traits || []);
    // Parse phone into country + number
    const parsed = parsePhoneIntoCountryAndNumber(profileData.phone || '');
    setEditPhoneCountry(parsed.country);
    setEditPhoneNumber(parsed.number);
  };

  const loadProfile = useCallback(async (force = false) => {
    if (!user?.id) {
      setError('No se encontró información de usuario');
      setLoading(false);
      return;
    }

    // 1. Show in-memory cache instantly
    if (!force && cacheRef.current) {
      setProfile(cacheRef.current.data);
      populateEditFields(cacheRef.current.data);
      setLoading(false);
    } else if (!force) {
      // 2. Try AsyncStorage for cross-session persistence
      const persisted = await getCached<UserProfile>(CACHE_KEY);
      if (persisted) {
        
        cacheRef.current = { data: persisted, timestamp: Date.now() };
        setProfile(persisted);
        populateEditFields(persisted);
        setLoading(false);
      }
    }

    // 3. Always fetch fresh in background (or immediately if forced)
    try {
      if (force) setLoading(true);
      setError(null);
      

      const { data, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (fetchError) {
        
        setError('Error al cargar el perfil: ' + fetchError.message);
        setLoading(false);
        return;
      }

      if (!data) {
        
        const { data: { user: authUser } } = await supabase.auth.getUser();
        const metadata = authUser?.user_metadata || {};
        const fullName = metadata.full_name || metadata.name || authUser?.email?.split('@')[0] || 'Usuario';
        const profilePhotoUrl = metadata.avatar_url || metadata.picture || null;

        const defaultProfile = {
          id: user.id,
          email: user.email || '',
          name: fullName,
          date_of_birth: '2000-01-01',
          age: 24,
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
          notification_preferences: { whatsapp: false, email: true, sms: false, push: true },
        };

        const { error: insertError } = await supabase.from('users').upsert(defaultProfile);
        if (insertError) {
          
          setError('Error al crear el perfil: ' + insertError.message);
          setLoading(false);
          return;
        }

        
        cacheRef.current = { data: defaultProfile as UserProfile, timestamp: Date.now() };
        setCached(CACHE_KEY, defaultProfile as UserProfile);
        setProfile(defaultProfile as UserProfile);
        populateEditFields(defaultProfile as UserProfile);
        setLoading(false);
        return;
      }

      
      cacheRef.current = { data: data as UserProfile, timestamp: Date.now() };
      setCached(CACHE_KEY, data as UserProfile);
      setProfile(data as UserProfile);
      populateEditFields(data as UserProfile);
    } catch (err) {
      
      setError('Error inesperado al cargar el perfil');
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.email]);

  useFocusEffect(
    useCallback(() => {
      
      if (!user?.id) {
        setLoading(false);
        return;
      }
      loadProfile();
    }, [user?.id, loadProfile])
  );

  const handleSupportEmail = () => {
    
    setSupportSenderName(profile?.name || '');
    setSupportUserEmail(profile?.email || '');
    setSupportMessage('');
    setShowSupportEmailModal(true);
  };

  const closeSupportModal = () => {
    
    setShowSupportEmailModal(false);
    setSupportSenderName('');
    setSupportUserEmail('');
    setSupportMessage('');
    setSupportEmailSent(false);
  };

  const handleSendSupportEmail = async () => {
    
    

    if (!supportUserEmail.trim() || !supportMessage.trim()) {
      
      Alert.alert('Campos requeridos', 'Por favor completa tu correo y el mensaje');
      return;
    }

    const nameCopy = supportSenderName.trim();
    const emailCopy = supportUserEmail.trim();
    const messageCopy = supportMessage.trim();
    

    setSendingSupportEmail(true);
    

    try {
      const EDGE_URL = 'https://wjdiraurfbawotlcndmk.supabase.co/functions/v1/support-send-email';
      

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      

      
      const response = await fetch(EDGE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ senderEmail: emailCopy, senderName: nameCopy, message: messageCopy }),
      });

      

      if (!response.ok) {
        const errText = await response.text();
        
        Alert.alert('Error al enviar', `Código ${response.status}: ${errText || 'Error desconocido'}`);
        return;
      }

      const responseText = await response.text();
      
      

      setSupportSenderName('');
      setSupportUserEmail('');
      setSupportMessage('');
      setSupportEmailSent(true);
    } catch (err) {
      
      Alert.alert('Error de conexión', 'No se pudo enviar el mensaje. Verifica tu conexión e intenta de nuevo.');
    } finally {
      setSendingSupportEmail(false);
      
    }
  };

  const handleSupportWhatsApp = () => {
    
    const url = `https://wa.me/${appConfig.support_whatsapp}`;
    Linking.openURL(url).catch(() =>
      Alert.alert('Error', 'No se pudo abrir WhatsApp')
    );
  };

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error('No session');

      const response = await fetch(
        'https://wjdiraurfbawotlcndmk.supabase.co/functions/v1/delete-user-account',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Error al eliminar la cuenta');
      }

      // Cuenta eliminada en Supabase — limpiar localmente y navegar
      await AsyncStorage.clear();
      router.replace('/welcome');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo eliminar la cuenta. Intenta de nuevo.');
    } finally {
      setDeletingAccount(false);
      setShowDeleteAccountModal(false);
    }
  };

  const handleSignOut = async () => {
    try {
      
      await signOut();
      router.replace('/welcome');
    } catch (err) {
      
    }
  };

  const handleNotificationPress = () => {
    
    setNotificationModalVisible(true);
  };

  const handleEditPress = () => {
    
    setPhoneStatus('idle');
    setEditModalVisible(true);
  };

  const handlePhotoPress = async () => {
    
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permissionResult.granted === false) {
      Alert.alert('Permiso requerido', 'Necesitamos permiso para acceder a tus fotos');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0]) {
      await uploadPhoto(result.assets[0].uri);
    }
  };

  const uploadPhoto = async (uri: string) => {
    setUploadingPhoto(true);
    try {
      
      
      // On web, blob URIs don't have file extensions - default to jpg
      let fileExt = 'jpg';
      if (Platform.OS !== 'web') {
        fileExt = uri.split('.').pop()?.toLowerCase() || 'jpg';
      }
      
      const timestamp = Date.now();
      const fileName = `${user?.id}-${timestamp}.${fileExt}`;
      const filePath = `${user?.id}/${fileName}`;

      let uploadData: ArrayBuffer;
      if (Platform.OS === 'android') {
        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        const binaryStr = atob(base64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
        uploadData = bytes.buffer;
      } else {
        const response = await fetch(uri);
        const blob = await response.blob();
        uploadData = await new Response(blob).arrayBuffer();
      }

      const { data: existingFiles } = await supabase.storage
        .from('profile-photos')
        .list(user?.id || '', { search: user?.id || '' });

      if (existingFiles && existingFiles.length > 0) {
        const filesToDelete = existingFiles.map(f => `${user?.id}/${f.name}`);
        await supabase.storage.from('profile-photos').remove(filesToDelete);
      }

      const { error: uploadError } = await supabase.storage
        .from('profile-photos')
        .upload(filePath, uploadData, { contentType: `image/${fileExt}`, cacheControl: '3600', upsert: true });

      if (uploadError) {
        
        Alert.alert('Error', `No se pudo subir la foto: ${uploadError.message}`);
        return;
      }

      const { data: urlData } = supabase.storage.from('profile-photos').getPublicUrl(filePath);
      const basePhotoUrl = urlData.publicUrl;
      

      const { error: updateError } = await supabase
        .from('users')
        .update({ profile_photo_url: basePhotoUrl })
        .eq('id', user?.id);

      if (updateError) {
        
        Alert.alert('Error', 'No se pudo actualizar el perfil');
        return;
      }

      // Update cache and state with cache-busted URL for immediate display
      const cacheBustedUrl = `${basePhotoUrl}?t=${timestamp}`;
      setProfile(prev => {
        if (!prev) return null;
        const updated = { ...prev, profile_photo_url: cacheBustedUrl };
        const toCache = { ...updated, profile_photo_url: basePhotoUrl };
        cacheRef.current = { data: toCache, timestamp: Date.now() };
        clearCached(CACHE_KEY);
        setCached(CACHE_KEY, toCache);
        return updated;
      });

      
      Alert.alert('Éxito', 'Foto de perfil actualizada');
    } catch (err) {
      
      Alert.alert('Error', 'No se pudo subir la foto. Por favor intenta de nuevo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!editName.trim() || !editPhoneNumber.trim()) {
      Alert.alert('Error', 'Por favor completa todos los campos requeridos');
      return;
    }

    const combinedPhone = editPhoneCountry.code + editPhoneNumber;

    // Verificar si el número ya está registrado por otro usuario
    setPhoneInlineError('');
    const phoneTaken = await checkPhoneExists(combinedPhone);
    if (phoneTaken) {
      setPhoneInlineError('Este número de celular ya está registrado por otro usuario. Por favor usa un número diferente.');
      return;
    }

    try {
      
      const { error } = await supabase
        .from('users')
        .update({
          name: editName,
          phone: combinedPhone,
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
        
        // Detectar duplicado de teléfono (código 23505 = unique constraint violation)
        if (error.code === '23505' && error.message?.includes('users_phone_key')) {
          setPhoneInlineError('Este número de celular ya está registrado por otro usuario. Por favor usa un número diferente.');
        } else {
          Alert.alert('Error', 'No se pudo actualizar el perfil');
        }
        return;
      }

      
      setProfile(prev => {
        if (!prev) return null;
        const updated = {
          ...prev,
          name: editName, phone: combinedPhone, country: editCountry, city: editCity,
          interested_in: editInterestedIn, age_range_min: editAgeRangeMin,
          age_range_max: editAgeRangeMax, interests: editInterests, personality_traits: editPersonality,
        };
        cacheRef.current = { data: updated, timestamp: Date.now() };
        setCached(CACHE_KEY, updated);
        return updated;
      });
      setEditModalVisible(false);
      Alert.alert('Éxito', 'Perfil actualizado correctamente');
    } catch (err) {
      
      Alert.alert('Error', 'No se pudo actualizar el perfil');
    }
  };

  const toggleNotification = async (type: 'whatsapp' | 'email' | 'sms' | 'push') => {
    if (!profile) return;
    const newPreferences = { ...profile.notification_preferences, [type]: !profile.notification_preferences[type] };

    try {
      
      const { error } = await supabase
        .from('users')
        .update({ notification_preferences: newPreferences })
        .eq('id', user?.id);

      if (error) {  return; }

      const updated = { ...profile, notification_preferences: newPreferences };
      cacheRef.current = { data: updated, timestamp: Date.now() };
      setCached(CACHE_KEY, updated);
      setProfile(updated);
    } catch (err) {
      
    }
  };

  const toggleInterest = (interest: string) => {
    setEditInterests(prev => {
      const isSelected = prev.includes(interest);
      
      return isSelected ? prev.filter(i => i !== interest) : [...prev, interest];
    });
  };

  const togglePersonality = (trait: string) => {
    setEditPersonality(prev => {
      const isSelected = prev.includes(trait);
      
      return isSelected ? prev.filter(t => t !== trait) : [...prev, trait];
    });
  };

  const handleMinAgeChange = (value: number) => {
    const newMin = Math.round(value);
    if (newMin < editAgeRangeMax) setEditAgeRangeMin(newMin);
  };

  const handleMaxAgeChange = (value: number) => {
    const newMax = Math.round(value);
    if (newMax > editAgeRangeMin) setEditAgeRangeMax(newMax);
  };

  const handleChangePassword = async () => {
    
    setPasswordError('');

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
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: profile?.email || '',
        password: currentPassword,
      });
      if (signInError) { setPasswordError('La contraseña actual es incorrecta'); return; }

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        
        setPasswordError('No se pudo actualizar la contraseña');
        return;
      }

      
      Alert.alert('Éxito', 'Contraseña actualizada correctamente');
      setShowPasswordModal(false);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err) {
      
      setPasswordError('Error al cambiar la contraseña');
    }
  };

  const checkPhoneExists = useCallback(async (full: string): Promise<boolean> => {
    
    try {
      // Buscar por número exacto excluyendo al usuario actual
      const { data, error } = await supabase
        .from('users')
        .select('id')
        .eq('phone', full)
        .neq('id', user?.id ?? '')
        .maybeSingle();
      if (error) {  return false; }
      return !!data;
    } catch (err) {
      
      return false;
    }
  }, [user?.id]);

  // Phone check solo al guardar — no en tiempo real

  const filteredPhoneCountries = PHONE_COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(phoneCountrySearch.toLowerCase()) ||
    c.code.includes(phoneCountrySearch)
  );

  if (loading) {
    return (
      <LinearGradient
        colors={['#1a0010', '#880E4F', '#AD1457']}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
          {/* Header skeleton */}
          <View style={[styles.header, { alignItems: 'center' }]}>
            <SkeletonBox width={120} height={120} borderRadius={60} style={{ marginBottom: 16 }} />
            <SkeletonBox height={28} width="50%" borderRadius={8} style={{ marginBottom: 8 }} />
            <SkeletonBox height={18} width="30%" borderRadius={6} style={{ marginBottom: 16 }} />
            <SkeletonBox height={36} width={140} borderRadius={20} />
          </View>
          {/* Section skeletons */}
          {[1, 2, 3].map(i => (
            <View key={i} style={styles.skeletonSection}>
              <SkeletonBox height={20} width="45%" borderRadius={6} style={{ marginBottom: 16 }} />
              <SkeletonBox height={14} width="90%" borderRadius={6} style={{ marginBottom: 10 }} />
              <SkeletonBox height={14} width="75%" borderRadius={6} style={{ marginBottom: 10 }} />
              <SkeletonBox height={14} width="60%" borderRadius={6} />
            </View>
          ))}
        </ScrollView>
      </LinearGradient>
    );
  }

  if (error || !profile) {
    const errorMessage = error || 'Error al cargar el perfil';
    return (
      <LinearGradient
        colors={['#1a0010', '#880E4F', '#AD1457']}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => loadProfile(true)}>
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
  const phoneCountryFlag = editPhoneCountry.flag;
  const phoneCountryCode = editPhoneCountry.code;

  return (
    <LinearGradient
      colors={['#1a0010', '#880E4F', '#AD1457']}
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
                  <View style={styles.photoOverlay} />
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

          <TouchableOpacity style={styles.editButton} onPress={handleEditPress} activeOpacity={0.8}>
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
          <Text style={styles.sectionTitle}>Gustos</Text>
          <View style={styles.chipsContainer}>
            {profile.interests.length > 0 ? (
              profile.interests.map((interest, index) => (
                <View key={index} style={styles.chip}>
                  <Text style={styles.chipText}>{interest}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No has agregado intereses aún</Text>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personalidad</Text>
          <View style={styles.chipsContainer}>
            {profile.personality_traits.length > 0 ? (
              profile.personality_traits.map((trait, index) => (
                <View key={index} style={styles.chip}>
                  <Text style={styles.chipText}>{trait}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No has agregado rasgos de personalidad aún</Text>
            )}
          </View>
        </View>

        <TouchableOpacity style={styles.section} onPress={handleNotificationPress} activeOpacity={0.8}>
          <Text style={styles.sectionTitle}>Preferencias de Notificaciones</Text>
          <Text style={styles.sectionSubtitle}>Toca para configurar</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.section} onPress={() => setShowPasswordModal(true)} activeOpacity={0.8}>
          <Text style={styles.sectionTitle}>Cambiar Contraseña</Text>
          <Text style={styles.sectionSubtitle}>Actualiza tu contraseña</Text>
        </TouchableOpacity>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Soporte</Text>
          <Text style={styles.sectionSubtitle}>¿Necesitas ayuda? Contáctanos</Text>
          <View style={styles.supportButtonsRow}>
            <TouchableOpacity style={styles.supportCard} onPress={handleSupportEmail} activeOpacity={0.8}>
              <View style={styles.supportIconCircle}>
                <Ionicons name="mail-outline" size={22} color="#880E4F" />
              </View>
              <Text style={styles.supportCardTitle}>Correo</Text>
              <Text style={styles.supportCardSub}>Envíanos un mensaje</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.supportCard} onPress={handleSupportWhatsApp} activeOpacity={0.8}>
              <View style={styles.supportIconCircle}>
                <Ionicons name="chatbubble-ellipses-outline" size={22} color="#880E4F" />
              </View>
              <Text style={styles.supportCardTitle}>WhatsApp</Text>
              <Text style={styles.supportCardSub}>Chatea con nosotros</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={styles.deleteAccountButton}
          onPress={() => setShowDeleteAccountModal(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.deleteAccountButtonText}>Eliminar Cuenta</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut} activeOpacity={0.85}>
          <Text style={styles.signOutButtonText}>Cerrar Sesión</Text>
        </TouchableOpacity>
        <Text style={styles.versionText}>v{Constants.expoConfig?.version || '1.0.0'} ({Constants.expoConfig?.ios?.buildNumber || Constants.expoConfig?.android?.versionCode || '—'})</Text>
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal visible={editModalVisible} transparent animationType="slide" onRequestClose={() => setEditModalVisible(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalScrollView} contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Editar Perfil</Text>

              <Text style={styles.inputLabel}>Nombre</Text>
              <TextInput style={styles.modalInput} value={editName} onChangeText={setEditName} placeholder="Tu nombre" placeholderTextColor="#999" />

              <Text style={styles.inputLabel}>Teléfono</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={[styles.modalInput, { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, minWidth: 90, flex: 0 }]}
                  onPress={() => {  setShowPhoneCountryModal(true); }}
                >
                  <Text style={{ fontSize: 18 }}>{phoneCountryFlag}</Text>
                  <Text style={{ marginLeft: 6, color: '#000', fontSize: 15 }}>{phoneCountryCode}</Text>
                  <Text style={{ marginLeft: 4, color: '#666' }}>▾</Text>
                </TouchableOpacity>
                <TextInput
                  style={[styles.modalInput, { flex: 1 }]}
                  value={editPhoneNumber}
                  onChangeText={(value) => {
                    const cleaned = value.replace(/\D/g, '').slice(0, 10);
                    
                    setEditPhoneNumber(cleaned);
                  }}
                  placeholder="Tu teléfono"
                  placeholderTextColor="#999"
                  keyboardType="phone-pad"
                  maxLength={10}
                  returnKeyType="done"
                  onSubmitEditing={() => {  Keyboard.dismiss(); }}
                />
              </View>


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
                {(['hombres', 'mujeres', 'ambos'] as const).map(opt => (
                  <TouchableOpacity
                    key={opt}
                    style={[styles.optionButton, editInterestedIn === opt && styles.optionButtonActive]}
                    onPress={() => setEditInterestedIn(opt)}
                  >
                    <Text style={[styles.optionButtonText, editInterestedIn === opt && styles.optionButtonTextActive]}>
                      {opt.charAt(0).toUpperCase() + opt.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Rango de edad: {editAgeRangeText}</Text>
              <View style={styles.ageSliderSection}>
                <View style={styles.ageSliderRow}>
                  <Text style={styles.ageSliderLabel}>Mínimo</Text>
                  <Text style={styles.ageSliderValue}>{editMinAgeText}</Text>
                </View>
                <Slider style={styles.ageSlider} minimumValue={18} maximumValue={59} step={1} value={editAgeRangeMin} onValueChange={handleMinAgeChange} minimumTrackTintColor="#880E4F" maximumTrackTintColor="#E0E0E0" thumbTintColor="#880E4F" />
                <View style={styles.ageSliderRow}>
                  <Text style={styles.ageSliderLabel}>Máximo</Text>
                  <Text style={styles.ageSliderValue}>{editMaxAgeText}</Text>
                </View>
                <Slider style={styles.ageSlider} minimumValue={19} maximumValue={60} step={1} value={editAgeRangeMax} onValueChange={handleMaxAgeChange} minimumTrackTintColor="#880E4F" maximumTrackTintColor="#E0E0E0" thumbTintColor="#880E4F" />
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

              {phoneInlineError ? (
                <View style={styles.phoneInlineErrorBox}>
                  <Text style={styles.phoneInlineErrorText}>⚠️ {phoneInlineError}</Text>
                </View>
              ) : null}

              <TouchableOpacity style={styles.saveButton} onPress={handleSaveProfile} activeOpacity={0.8}>
                <Text style={styles.saveButtonText}>Guardar Cambios</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalCloseButton} onPress={() => { setPhoneStatus('idle'); setPhoneInlineError(''); setEditModalVisible(false); }} activeOpacity={0.8}>
                <Text style={styles.modalCloseButtonText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Phone Country Picker Modal */}
      <Modal
        visible={showPhoneCountryModal}
        animationType="slide"
        onRequestClose={() => { setShowPhoneCountryModal(false); setPhoneCountrySearch(''); }}
      >
        <SafeAreaView style={styles.phoneModalSafe}>
          <View style={styles.phoneModalHeader}>
            <Text style={styles.phoneModalTitle}>Selecciona tu país</Text>
            <TouchableOpacity onPress={() => { setShowPhoneCountryModal(false); setPhoneCountrySearch(''); }}>
              <Text style={styles.phoneModalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.phoneSearchInput}
            value={phoneCountrySearch}
            onChangeText={setPhoneCountrySearch}
            placeholder="Buscar país o código..."
            placeholderTextColor="#999"
            autoCorrect={false}
          />
          <FlatList
            data={filteredPhoneCountries}
            keyExtractor={(_, i) => String(i)}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.phoneCountryRow,
                  item.name === editPhoneCountry.name && item.code === editPhoneCountry.code && styles.phoneCountryRowSelected,
                ]}
                onPress={() => {
                  
                  setEditPhoneCountry(item);
                  setEditPhoneNumber('');
                  setShowPhoneCountryModal(false);
                  setPhoneCountrySearch('');
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.phoneRowFlag}>{item.flag}</Text>
                <Text style={styles.phoneRowName}>{item.name}</Text>
                <Text style={styles.phoneRowCode}>{item.code}</Text>
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={styles.phoneRowSeparator} />}
          />
        </SafeAreaView>
      </Modal>

      {/* Country Picker Modal */}
      <Modal visible={showCountryPicker} transparent animationType="slide" onRequestClose={() => setShowCountryPicker(false)}>
        <View style={styles.pickerModalOverlay}>
          <View style={styles.pickerModalContent}>
            <View style={styles.pickerModalHeader}>
              <Text style={styles.pickerModalTitle}>Selecciona tu país</Text>
              <TouchableOpacity onPress={() => setShowCountryPicker(false)}>
                <Text style={styles.pickerModalClose}>Listo</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.pickerListScroll}>
              {COUNTRIES.map(country => (
                <TouchableOpacity
                  key={country}
                  style={[styles.pickerListItem, editCountry === country && styles.pickerListItemSelected]}
                  onPress={() => {
                    
                    setEditCountry(country);
                    const cities = CITIES_BY_COUNTRY[country] || [];
                    if (cities.length > 0) setEditCity(cities[0]);
                    setShowCountryPicker(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.pickerListItemText, editCountry === country && styles.pickerListItemTextSelected]}>{country}</Text>
                  {editCountry === country && <Text style={styles.pickerListItemCheck}>✓</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* City Picker Modal */}
      <Modal visible={showCityPicker} transparent animationType="slide" onRequestClose={() => setShowCityPicker(false)}>
        <View style={styles.pickerModalOverlay}>
          <View style={styles.pickerModalContent}>
            <View style={styles.pickerModalHeader}>
              <Text style={styles.pickerModalTitle}>Selecciona tu ciudad</Text>
              <TouchableOpacity onPress={() => setShowCityPicker(false)}>
                <Text style={styles.pickerModalClose}>Listo</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.pickerListScroll}>
              {availableCities.map(city => (
                <TouchableOpacity
                  key={city}
                  style={[styles.pickerListItem, editCity === city && styles.pickerListItemSelected]}
                  onPress={() => {
                    
                    setEditCity(city);
                    setShowCityPicker(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.pickerListItemText, editCity === city && styles.pickerListItemTextSelected]}>{city}</Text>
                  {editCity === city && <Text style={styles.pickerListItemCheck}>✓</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Password Change Modal */}
      <Modal visible={showPasswordModal} transparent animationType="slide" onRequestClose={() => setShowPasswordModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Cambiar Contraseña</Text>
            <Text style={styles.modalSubtitle}>Ingresa tu contraseña actual y la nueva</Text>

            <Text style={styles.inputLabel}>Contraseña Actual *</Text>
            <View style={styles.passwordInputWrapper}>
              <TextInput style={styles.passwordModalInput} placeholder="Contraseña actual" placeholderTextColor="#999" secureTextEntry={!showCurrentPassword} value={currentPassword} onChangeText={(text) => { setCurrentPassword(text); setPasswordError(''); }} autoCapitalize="none" />
              <TouchableOpacity onPress={() => {  setShowCurrentPassword(!showCurrentPassword); }} style={styles.passwordEyeButton}>
                <Ionicons name={showCurrentPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color="#666" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Nueva Contraseña *</Text>
            <View style={styles.passwordInputWrapper}>
              <TextInput style={styles.passwordModalInput} placeholder="Nueva contraseña (mínimo 6 caracteres)" placeholderTextColor="#999" secureTextEntry={!showNewPassword} value={newPassword} onChangeText={(text) => { setNewPassword(text); setPasswordError(''); }} autoCapitalize="none" />
              <TouchableOpacity onPress={() => {  setShowNewPassword(!showNewPassword); }} style={styles.passwordEyeButton}>
                <Ionicons name={showNewPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color="#666" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Confirmar Nueva Contraseña *</Text>
            <View style={styles.passwordInputWrapper}>
              <TextInput style={styles.passwordModalInput} placeholder="Confirma la nueva contraseña" placeholderTextColor="#999" secureTextEntry={!showConfirmPassword} value={confirmPassword} onChangeText={(text) => { setConfirmPassword(text); setPasswordError(''); }} autoCapitalize="none" />
              <TouchableOpacity onPress={() => {  setShowConfirmPassword(!showConfirmPassword); }} style={styles.passwordEyeButton}>
                <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color="#666" />
              </TouchableOpacity>
            </View>

            {passwordError ? <Text style={styles.passwordError}>{passwordError}</Text> : null}

            <TouchableOpacity style={styles.saveButton} onPress={handleChangePassword} activeOpacity={0.8}>
              <Text style={styles.saveButtonText}>Cambiar Contraseña</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => { setShowPasswordModal(false); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setPasswordError(''); }} activeOpacity={0.8}>
              <Text style={styles.modalCloseButtonText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
        </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Support Email Modal */}
      <Modal visible={showSupportEmailModal} transparent animationType="slide" onRequestClose={closeSupportModal}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {supportEmailSent ? (
              <View style={styles.supportSuccessContainer}>
                <View style={styles.supportSuccessIconCircle}>
                  <Text style={styles.supportSuccessIcon}>✓</Text>
                </View>
                <Text style={styles.supportSuccessTitle}>¡Mensaje enviado!</Text>
                <Text style={styles.supportSuccessSubtext}>
                  Te responderemos pronto a
                </Text>
                <Text style={styles.supportSuccessEmail}>{profile?.email || ''}</Text>
                <TouchableOpacity style={styles.saveButton} onPress={closeSupportModal} activeOpacity={0.8}>
                  <Text style={styles.saveButtonText}>Cerrar</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={styles.modalTitle}>Contactar Soporte</Text>
                <Text style={styles.modalSubtitle}>Te responderemos lo antes posible</Text>

                <Text style={styles.inputLabel}>Nombre</Text>
                <TextInput
                  style={styles.modalInput}
                  value={supportSenderName}
                  onChangeText={setSupportSenderName}
                  placeholder="Tu nombre"
                  placeholderTextColor="#999"
                  autoCorrect={false}
                />

                <Text style={styles.inputLabel}>Tu correo electrónico</Text>
                <TextInput
                  style={styles.modalInput}
                  value={supportUserEmail}
                  onChangeText={setSupportUserEmail}
                  placeholder="tu@correo.com"
                  placeholderTextColor="#999"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <Text style={styles.inputLabel}>Mensaje</Text>
                <TextInput
                  style={[styles.modalInput, styles.supportMessageInput]}
                  value={supportMessage}
                  onChangeText={setSupportMessage}
                  placeholder="Describe tu consulta o problema..."
                  placeholderTextColor="#999"
                  multiline
                  numberOfLines={5}
                  textAlignVertical="top"
                />

                <TouchableOpacity style={[styles.saveButton, sendingSupportEmail && { opacity: 0.6 }]} onPress={handleSendSupportEmail} activeOpacity={0.8} disabled={sendingSupportEmail}>
                  <Text style={styles.saveButtonText}>{sendingSupportEmail ? 'Enviando...' : 'Enviar mensaje'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalCloseButton} onPress={closeSupportModal} activeOpacity={0.8}>
                  <Text style={styles.modalCloseButtonText}>Cancelar</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
        </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Notification Preferences Modal */}
      <Modal visible={notificationModalVisible} transparent animationType="slide" onRequestClose={() => setNotificationModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Preferencias de Notificaciones</Text>
            <Text style={styles.modalSubtitle}>¿Cómo quieres que te recordemos las citas?</Text>

            {(['whatsapp', 'email', 'sms', 'push'] as const).map(type => {
              const labels = { whatsapp: 'WhatsApp', email: 'Correo Electrónico', sms: 'SMS', push: 'Notificaciones Push' };
              return (
                <TouchableOpacity key={type} style={styles.notificationOption} onPress={() => toggleNotification(type)} activeOpacity={0.8}>
                  <Text style={styles.notificationOptionText}>{labels[type]}</Text>
                  <View style={[styles.checkbox, profile.notification_preferences[type] && styles.checkboxActive]}>
                    {profile.notification_preferences[type] && <Text style={styles.checkmark}>✓</Text>}
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
      {/* Delete Account Modal */}
      <Modal visible={showDeleteAccountModal} transparent animationType="fade" onRequestClose={() => setShowDeleteAccountModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderRadius: 24, marginHorizontal: 24 }]}>
            <Text style={[styles.modalTitle, { color: '#DC2626' }]}>⚠️ Eliminar Cuenta</Text>
            <Text style={[styles.modalSubtitle, { marginBottom: 16 }]}>
              Esta acción es permanente e irreversible. Se eliminarán todos tus datos, fotos y citas registradas.
            </Text>
            <Text style={{ fontSize: 15, color: '#333', marginBottom: 24, textAlign: 'center' }}>
              ¿Estás seguro de que deseas eliminar tu cuenta?
            </Text>
            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: '#DC2626', opacity: deletingAccount ? 0.6 : 1 }]}
              onPress={handleDeleteAccount}
              disabled={deletingAccount}
              activeOpacity={0.8}
            >
              <Text style={styles.saveButtonText}>
                {deletingAccount ? 'Eliminando...' : 'Sí, eliminar mi cuenta'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowDeleteAccountModal(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.modalCloseButtonText}>Cancelar</Text>
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
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  skeletonSection: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 16, padding: 20, marginBottom: 16 },
  errorText: { fontSize: 16, color: '#FFFFFF', textAlign: 'center', marginBottom: 16 },
  retryButton: { backgroundColor: '#880E4F', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12 },
  retryButtonText: { color: nospiColors.white, fontSize: 16, fontWeight: '600' },
  header: { alignItems: 'center', marginTop: 48, marginBottom: 32 },
  profilePhoto: { width: 120, height: 120, borderRadius: 60, marginBottom: 16, borderWidth: 4, borderColor: nospiColors.white },
  profilePhotoPlaceholder: { width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(173, 20, 87, 0.20)', justifyContent: 'center', alignItems: 'center', marginBottom: 16, borderWidth: 4, borderColor: nospiColors.white },
  profilePhotoPlaceholderText: { fontSize: 48, fontWeight: 'bold', color: '#FFFFFF' },
  photoOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 16, backgroundColor: 'rgba(0, 0, 0, 0.5)', borderRadius: 60 },
  editPhotoIcon: { position: 'absolute', bottom: 16, right: 0, backgroundColor: nospiColors.white, width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#880E4F' },
  editPhotoIconText: { fontSize: 16 },
  name: { fontSize: 28, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  age: { fontSize: 18, color: '#FFFFFF', opacity: 0.8, marginBottom: 16 },
  editButton: { backgroundColor: 'rgba(255, 255, 255, 0.9)', paddingVertical: 10, paddingHorizontal: 24, borderRadius: 20, borderWidth: 2, borderColor: '#880E4F' },
  editButtonText: { color: '#880E4F', fontSize: 14, fontWeight: '600' },
  section: { backgroundColor: 'rgba(255, 255, 255, 0.95)', borderRadius: 16, padding: 20, marginBottom: 16 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#880E4F', marginBottom: 12 },
  sectionSubtitle: { fontSize: 14, color: '#666', marginTop: 4 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  infoLabel: { fontSize: 14, color: '#666', fontWeight: '600' },
  infoValue: { fontSize: 14, color: '#333', flex: 1, textAlign: 'right' },
  chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { backgroundColor: '#FFFFFF', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 20, borderWidth: 2, borderColor: 'rgba(240, 98, 146, 0.50)' },
  chipText: { color: '#880E4F', fontSize: 14, fontWeight: '500' },
  emptyText: { fontSize: 14, color: '#999', fontStyle: 'italic' },
  deleteAccountButton: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: 'rgba(220, 38, 38, 0.5)', paddingVertical: 16, paddingHorizontal: 32, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginTop: 8, marginBottom: 8 },
  deleteAccountButtonText: { color: '#DC2626', fontSize: 16, fontWeight: '600' },
  signOutButton: { backgroundColor: '#880E4F', borderWidth: 1.5, borderColor: 'rgba(255, 255, 255, 0.50)', paddingVertical: 18, paddingHorizontal: 32, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginTop: 16, marginBottom: 32, shadowColor: '#000000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 5 },
  signOutButtonText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', letterSpacing: 0.3 },
  versionText: { textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 24 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
  modalScrollView: { maxHeight: '90%' },
  modalScrollContent: { flexGrow: 1 },
  modalContent: { backgroundColor: nospiColors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalTitle: { fontSize: 24, fontWeight: 'bold', color: '#880E4F', marginBottom: 8 },
  modalSubtitle: { fontSize: 16, color: '#666', marginBottom: 24 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8, marginTop: 12 },
  modalInput: { backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, fontSize: 16, color: '#333', marginBottom: 8 },
  pickerButton: { backgroundColor: '#F5F5F5', borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 8 },
  pickerButtonText: { fontSize: 16, color: '#333' },
  optionsRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  optionButton: { flex: 1, backgroundColor: '#F5F5F5', paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 2, borderColor: '#E0E0E0' },
  optionButtonActive: { backgroundColor: 'rgba(173, 20, 87, 0.12)', borderColor: '#880E4F' },
  optionButtonText: { fontSize: 14, color: '#666', fontWeight: '600' },
  optionButtonTextActive: { color: '#880E4F' },
  ageSliderSection: { backgroundColor: '#F5F5F5', borderRadius: 12, padding: 16, marginBottom: 8 },
  ageSliderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  ageSliderLabel: { fontSize: 14, color: '#666', fontWeight: '600' },
  ageSliderValue: { fontSize: 18, color: '#880E4F', fontWeight: 'bold' },
  ageSlider: { width: '100%', height: 40, marginBottom: 12 },
  tagsEditContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  tagEdit: { backgroundColor: '#F5F5F5', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, borderWidth: 2, borderColor: '#E0E0E0' },
  tagEditActive: { backgroundColor: 'rgba(173, 20, 87, 0.12)', borderColor: '#880E4F' },
  tagEditText: { color: '#666', fontSize: 14, fontWeight: '600' },
  tagEditTextActive: { color: '#880E4F' },
  saveButton: { backgroundColor: '#880E4F', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  saveButtonText: { color: nospiColors.white, fontSize: 16, fontWeight: '600' },
  notificationOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  notificationOptionText: { fontSize: 16, color: '#333' },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#CCC', justifyContent: 'center', alignItems: 'center' },
  checkboxActive: { backgroundColor: '#880E4F', borderColor: '#880E4F' },
  checkmark: { color: nospiColors.white, fontSize: 16, fontWeight: 'bold' },
  modalCloseButton: { backgroundColor: '#E0E0E0', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 16 },
  modalCloseButtonText: { color: '#333', fontSize: 16, fontWeight: '600' },
  pickerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  pickerModalContent: {
    backgroundColor: nospiColors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '60%',
  },
  pickerModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(0, 0, 0, 0.1)' },
  pickerModalTitle: { fontSize: 18, fontWeight: '700', color: '#880E4F' },
  pickerModalClose: { fontSize: 16, fontWeight: '600', color: '#AD1457' },
  pickerListScroll: { maxHeight: 320 },
  pickerListItem: { paddingVertical: 16, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  pickerListItemSelected: { backgroundColor: 'rgba(136, 14, 79, 0.08)' },
  pickerListItemText: { fontSize: 16, color: '#333' },
  pickerListItemTextSelected: { color: '#880E4F', fontWeight: '600' },
  pickerListItemCheck: { fontSize: 16, color: '#880E4F', fontWeight: 'bold' },
  passwordInputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, marginBottom: 8 },
  passwordModalInput: { flex: 1, paddingVertical: 14, paddingLeft: 16, paddingRight: 8, fontSize: 16, color: '#333' },
  passwordEyeButton: { paddingHorizontal: 14, justifyContent: 'center', alignSelf: 'stretch' },
  passwordError: { fontSize: 14, color: '#EF4444', marginBottom: 12, textAlign: 'center' },
  // Phone country modal styles
  phoneModalSafe: { flex: 1, backgroundColor: '#fff' },
  phoneModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#eee' },
  phoneModalTitle: { fontSize: 20, fontWeight: '700', color: '#880E4F' },
  phoneModalClose: { fontSize: 20, color: '#880E4F', padding: 4 },
  phoneSearchInput: { margin: 16, borderWidth: 1.5, borderColor: 'rgba(240, 98, 146, 0.40)', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: '#333' },
  phoneCountryRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 12 },
  phoneCountryRowSelected: { backgroundColor: 'rgba(136, 14, 79, 0.08)' },
  phoneRowFlag: { fontSize: 26 },
  phoneRowName: { flex: 1, fontSize: 16, color: '#222' },
  phoneRowCode: { fontSize: 15, color: '#880E4F', fontWeight: '600' },
  phoneRowSeparator: { height: 1, backgroundColor: '#f0f0f0', marginLeft: 58 },
  supportButtonsRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  supportCard: { flex: 1, backgroundColor: 'rgba(136, 14, 79, 0.06)', borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(136, 14, 79, 0.15)' },
  supportIconCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(136, 14, 79, 0.12)', justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  supportCardTitle: { fontSize: 15, fontWeight: '700', color: '#880E4F', marginBottom: 4 },
  supportCardSub: { fontSize: 12, color: '#666', textAlign: 'center' },
  supportMessageInput: { height: 120, paddingTop: 14 },
  supportSuccessContainer: { alignItems: 'center', paddingVertical: 24 },
  supportSuccessIconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  supportSuccessIcon: { fontSize: 36, color: '#2E7D32', fontWeight: 'bold' },
  supportSuccessTitle: { fontSize: 22, fontWeight: 'bold', color: '#880E4F', marginBottom: 12, textAlign: 'center' },
  supportSuccessSubtext: { fontSize: 15, color: '#666', textAlign: 'center' },
  supportSuccessEmail: { fontSize: 15, color: '#333', fontWeight: '600', textAlign: 'center', marginBottom: 28 },
  phoneErrorOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  phoneErrorCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 24,
    width: '100%', maxWidth: 400, alignItems: 'center',
  },
  phoneErrorTitle: { fontSize: 20, fontWeight: 'bold', color: '#880E4F', marginBottom: 12, textAlign: 'center' },
  phoneErrorMsg: { fontSize: 15, color: '#6B7280', marginBottom: 24, textAlign: 'center', lineHeight: 22 },
  phoneErrorBtn: { backgroundColor: '#880E4F', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32, width: '100%' },
  phoneErrorBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold', textAlign: 'center' },
  phoneInlineErrorBox: {
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
    borderWidth: 1, borderColor: 'rgba(220, 38, 38, 0.3)',
    borderRadius: 12, padding: 12, marginBottom: 12,
  },
  phoneInlineErrorText: { color: '#dc2626', fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
