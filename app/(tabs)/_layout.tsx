import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import FloatingTabBar, { TabBarItem } from '@/components/FloatingTabBar';
import { useSupabase } from '@/contexts/SupabaseContext';
import { useUnreadChatCount } from '@/hooks/useUnreadChatCount';

export default function TabLayout() {
  const { loading: supabaseLoading } = useSupabase();
  const unreadChats = useUnreadChatCount();

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
      name: 'dinamica',
      route: '/(tabs)/dinamica',
      icon: 'sports-esports',
      label: 'Dinámica',
    },
    {
      name: 'chats',
      route: '/(tabs)/chats',
      icon: 'forum',
      label: 'Chat',
      badge: unreadChats,
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
          // Antes estaba en 'none' y las pantallas aparecian de golpe, que es
          // de las cosas que mas hacen sentir basica una app.
          //
          // Se usa fundido y NO deslizamiento: estas cinco son pestanas
          // hermanas, no una dentro de otra. Deslizar sugiere que entras un
          // nivel mas adentro, y aqui eso seria mentira.
          //
          // 180 ms es el punto donde se percibe suave sin sentirse lento;
          // por encima de ~250 ms empieza a estorbar al ir y volver rapido.
          animation: 'fade',
          animationDuration: 180,
        }}
      >
        <Stack.Screen key="events" name="events" />
        <Stack.Screen key="appointments" name="appointments" />
        <Stack.Screen key="dinamica" name="dinamica" />
          <Stack.Screen key="chats" name="chats" />
        <Stack.Screen key="profile" name="profile" />
      </Stack>
      <FloatingTabBar tabs={tabs} />
    </>
  );
}
