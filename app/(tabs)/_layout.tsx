
import React from 'react';
import { Stack } from 'expo-router';
import FloatingTabBar, { TabBarItem } from '@/components/FloatingTabBar';

export default function TabLayout() {
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
        <Stack.Screen key="profile" name="profile" />
      </Stack>
      <FloatingTabBar tabs={tabs} />
    </>
  );
}
