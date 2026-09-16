import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import FloatingTabBar, { TabBarItem } from '@/components/FloatingTabBar';
import { useSupabase } from '@/contexts/SupabaseContext';
import { useUnreadChatCount } from '@/hooks/useUnreadChatCount';

// Rutas de las cinco pestanas, para precargarlas.
const RUTAS_PESTANAS = [
  '/(tabs)/events',
  '/(tabs)/appointments',
  '/(tabs)/dinamica',
  '/(tabs)/chats',
  '/(tabs)/profile',
];

export default function TabLayout() {
  const { loading: supabaseLoading } = useSupabase();
  const unreadChats = useUnreadChatCount();
  const router = useRouter();

  // Precarga de las otras pestanas.
  //
  // En la web cada pantalla viaja en su propio archivo de codigo y se baja la
  // PRIMERA vez que se toca esa pestana. Por eso el primer salto a cada
  // pestana se veia en blanco un instante (el segundo ya no). Aca se bajan las
  // cinco calladamente un rato despues de abrir la app, cuando ya no compiten
  // con lo que la persona esta mirando, y asi el primer salto tambien es
  // instantaneo. En el celular esto no baja nada (el codigo ya viene dentro de
  // la app); solo deja las pantallas listas.
  useEffect(() => {
    const t = setTimeout(() => {
      for (const ruta of RUTAS_PESTANAS) {
        try {
          router.prefetch(ruta as any);
        } catch {
          // Si una falla, no pasa nada: esa pestana se carga al tocarla, como antes.
        }
      }
    }, 800);
    return () => clearTimeout(t);
  }, [router]);

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
