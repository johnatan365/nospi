import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import FloatingTabBar, { TabBarItem } from '@/components/FloatingTabBar';
import { useAuth } from '@/contexts/AuthContext';
import { useSupabase } from '@/contexts/SupabaseContext';

export default function TabLayout() {
  const { isLoading } = useAuth();
  const { loading: supabaseLoading } = useSupabase();

  // Block tab rendering until BOTH auth systems have fully resolved.
  // This prevents tabs from mounting and firing data fetches before the
  // Supabase session is established after an OAuth redirect.
  const isAuthReady = !isLoading && !supabaseLoading;

  if (!isAuthReady) {
    console.log('TabLayout: waiting for auth — isLoading:', isLoading, 'supabaseLoading:', supabaseLoading);
    return (
      <View style={{ flex: 1, backgroundColor: '#1a0010', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#AD1457" />
      </View>
    );
  }

  const tabs: TabBarItem[] = [
    {
      name: 'events',
      route: '/(tabs)/events',
      icon: 'calendar-today',
      label: 'Eventos',
    },
    {
      name: 'appointments',
      route: '/(tabs)/appointments',
      icon: 'check-circle',
      label: 'Citas',
    },
    {
      name: 'interaccion',
      route: '/(tabs)/interaccion',
      icon: 'chat',
      label: 'Interacción',
    },
    {
      name: 'profile',
      route: '/(tabs)/profile',
      icon: 'person',
      label: 'Perfil',
    },
  ];

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'none',
        }}
      >
        <Stack.Screen key="events" name="events" />
        <Stack.Screen key="appointments" name="appointments" />
        <Stack.Screen key="interaccion" name="interaccion" />
        <Stack.Screen key="profile" name="profile" />
      </Stack>
      <FloatingTabBar tabs={tabs} />
    </>
  );
}