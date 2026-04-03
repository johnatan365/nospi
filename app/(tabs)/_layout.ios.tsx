import React from 'react';
import { Stack } from 'expo-router';
import FloatingTabBar, { TabBarItem } from '@/components/FloatingTabBar';

export default function TabLayout() {
  // NOTE: Removed useAuth().isLoading gate — all real auth goes through
  // Supabase, not better-auth. Each tab handles its own loading state.
  // The old gate caused flicker on OAuth sign-in because deep links
  // triggered fetchUser() which reset loading=true repeatedly.

  const tabs: TabBarItem[] = [
    {
      name: 'events',
      route: '/(tabs)/events',
      icon: 'star.fill',
      label: 'Eventos',
    },
    {
      name: 'appointments',
      route: '/(tabs)/appointments',
      icon: 'bookmark.fill',
      label: 'Citas',
    },
    {
      name: 'interaccion',
      route: '/(tabs)/interaccion',
      icon: 'message.fill',
      label: 'Interacción',
    },
    {
      name: 'profile',
      route: '/(tabs)/profile',
      icon: 'person.fill',
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