import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Tabs } from 'expo-router';
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
      name: 'dinamica',
      route: '/(tabs)/dinamica',
      icon: 'gamecontroller.fill',
      label: 'Dinámica',
    },
    {
      name: 'chats',
      route: '/(tabs)/chats',
      icon: 'bubble.left.and.bubble.right.fill',
      label: 'Chat',
      badge: unreadChats,
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
      <Tabs
        screenOptions={{
          headerShown: false,
          // SIN animacion, a proposito.
          //
          // Antes esto era un Stack con animation: 'fade'. Dos problemas: se
          // veia el parpadeo del fundido en cada toque, y cada pestana se
          // MONTABA DE CERO al entrar, asi que ademas del fundido aparecian los
          // esqueletos grises mientras volvia a cargar lo mismo de siempre.
          //
          // Ahora es un navegador de pestanas de verdad: las cinco pantallas se
          // quedan vivas y cambiar de pestana solo muestra la que ya estaba
          // armada. Es lo que hace Instagram: instantaneo, sin fundido, y al
          // volver te encuentras la lista donde la dejaste.
          //
          // Los datos NO se quedan viejos: las cinco pantallas ya refrescan con
          // useFocusEffect, que se dispara cada vez que la pestana toma el
          // foco. La primera vez que se abre una pestana si se monta (y ahi si
          // carga), pero una sola vez por sesion.
          animation: 'none',
          // La barra de abajo la dibuja FloatingTabBar, que va flotando encima
          // del contenido. La barra propia del navegador se esconde para que no
          // reserve espacio ni se vean las dos.
          tabBarStyle: { display: 'none' },
        }}
        // OJO: iPhone usa ESTE archivo, no app/(tabs)/_layout.tsx. Si se
        // cambia la navegacion alli, hay que cambiarla aqui tambien.
      >
        <Tabs.Screen key="events" name="events" />
        <Tabs.Screen key="appointments" name="appointments" />
        <Tabs.Screen key="dinamica" name="dinamica" />
        <Tabs.Screen key="chats" name="chats" />
        <Tabs.Screen key="profile" name="profile" />
      </Tabs>
      <FloatingTabBar tabs={tabs} />
    </>
  );
}
