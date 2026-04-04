import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import FloatingTabBar, { TabBarItem } from '@/components/FloatingTabBar';
import { useSupabase } from '@/contexts/SupabaseContext';

export default function TabLayout() {
  const { loading: supabaseLoading } = useSupabase();

  // Show a spinner while Supabase session is being established.
  // This prevents the OAuth flicker: tabs render only once the session is ready.
  if (supabaseLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a0010' }}>
        <ActivityIndicator size="large" color="#F06292" />
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