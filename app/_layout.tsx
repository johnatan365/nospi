
import { useNetworkState } from "expo-network";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Stack } from "expo-router";
import "react-native-reanimated";
import { useFonts } from "expo-font";
import React, { useEffect, useRef } from "react";
import { StatusBar } from "expo-status-bar";
import {
  DarkTheme,
  DefaultTheme,
  Theme,
  ThemeProvider,
} from "@react-navigation/native";
import { SupabaseProvider } from "@/contexts/SupabaseContext";
import * as SplashScreen from "expo-splash-screen";
import { useColorScheme } from "react-native";
import { SystemBars } from "react-native-edge-to-edge";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "@/lib/supabase";

// CRITICAL: Call this at the top level to complete auth sessions
WebBrowser.maybeCompleteAuthSession();

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded] = useFonts({
    SpaceMonoRegular: require("../assets/fonts/SpaceMono-Regular.ttf"),
    SpaceMonoBold: require("../assets/fonts/SpaceMono-Bold.ttf"),
    SpaceMonoItalic: require("../assets/fonts/SpaceMono-Italic.ttf"),
    SpaceMonoBoldItalic: require("../assets/fonts/SpaceMono-BoldItalic.ttf"),
  });

  const colorScheme = useColorScheme();
  const { isConnected } = useNetworkState();
  const listenerRef = useRef<any>(null);

  useEffect(() => {
    console.log('Root layout mounted - Setting up global OAuth listener');
    
    // CRITICAL: Global deep link handler for OAuth callbacks
    const handleDeepLink = async (event: { url: string }) => {
      const url = event.url;
      console.log('Global deep link received:', url);
      
      // Check if this is an OAuth callback
      if (url.includes('auth') || url.includes('callback')) {
        console.log('OAuth callback detected, exchanging code for session...');
        
        try {
          // CRITICAL: Use exchangeCodeForSession for PKCE flow
          const { data, error } = await supabase.auth.exchangeCodeForSession(url);
          
          if (error) {
            console.error('Error exchanging code for session:', error);
            return;
          }
          
          if (data.session) {
            console.log('✅ Session exchanged successfully, user:', data.session.user.id);
            console.log('Session will be persisted automatically by Supabase client');
          } else {
            console.log('⚠️ No session returned from exchangeCodeForSession');
          }
        } catch (error) {
          console.error('Failed to exchange code for session:', error);
        }
      }
    };

    // Add listener only once
    if (!listenerRef.current) {
      console.log('Adding global Linking listener');
      listenerRef.current = Linking.addEventListener('url', handleDeepLink);
    }

    // Check if app was opened with a URL
    Linking.getInitialURL().then((url) => {
      if (url) {
        console.log('App opened with initial URL:', url);
        handleDeepLink({ url });
      }
    });

    // Cleanup listener on unmount
    return () => {
      if (listenerRef.current) {
        console.log('Removing global Linking listener');
        listenerRef.current.remove();
        listenerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    console.log('Root layout mounted');
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SupabaseProvider>
        <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
          <SystemBars style="auto" />
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="welcome" options={{ headerShown: false }} />
            <Stack.Screen name="login" options={{ headerShown: false }} />
            <Stack.Screen name="onboarding/interests" options={{ headerShown: true, title: 'Tus Gustos', headerBackTitle: 'Atrás' }} />
            <Stack.Screen name="onboarding/name" options={{ headerShown: true, title: 'Tu Nombre', headerBackTitle: 'Atrás' }} />
            <Stack.Screen name="onboarding/birthdate" options={{ headerShown: true, title: 'Fecha de Nacimiento', headerBackTitle: 'Atrás' }} />
            <Stack.Screen name="onboarding/gender" options={{ headerShown: true, title: 'Tu Género', headerBackTitle: 'Atrás' }} />
            <Stack.Screen name="onboarding/interested-in" options={{ headerShown: true, title: 'Intereses', headerBackTitle: 'Atrás' }} />
            <Stack.Screen name="onboarding/age-range" options={{ headerShown: true, title: 'Rango de Edad', headerBackTitle: 'Atrás' }} />
            <Stack.Screen name="onboarding/location" options={{ headerShown: true, title: 'Ubicación', headerBackTitle: 'Atrás' }} />
            <Stack.Screen name="onboarding/compatibility" options={{ headerShown: true, title: 'Compatibilidad', headerBackTitle: 'Atrás' }} />
            <Stack.Screen name="onboarding/phone" options={{ headerShown: true, title: 'Teléfono', headerBackTitle: 'Atrás' }} />
            <Stack.Screen name="onboarding/photo" options={{ headerShown: true, title: 'Foto de Perfil', headerBackTitle: 'Atrás' }} />
            <Stack.Screen name="onboarding/register" options={{ headerShown: true, title: 'Registro', headerBackTitle: 'Atrás' }} />
            <Stack.Screen name="event-details/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="subscription-plans" options={{ headerShown: false }} />
            <Stack.Screen name="admin" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="+not-found" />
          </Stack>
        </ThemeProvider>
      </SupabaseProvider>
    </GestureHandlerRootView>
  );
}
