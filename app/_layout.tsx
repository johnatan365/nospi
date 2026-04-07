import "react-native-url-polyfill/auto";
import { useNetworkState } from "expo-network";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Stack } from "expo-router";
import "react-native-reanimated";
import React, { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { SupabaseProvider } from "@/contexts/SupabaseContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppConfigProvider } from "@/contexts/AppConfigContext";
import * as SplashScreen from "expo-splash-screen";
import { useColorScheme } from "react-native";
import { SystemBars } from "react-native-edge-to-edge";
import { ErrorBoundary } from "@/components/ErrorBoundary";

SplashScreen.preventAutoHideAsync();

function RootLayoutInner() {
  const colorScheme = useColorScheme();
  const { isConnected } = useNetworkState();

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <AppConfigProvider>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <SystemBars style="auto" />
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="welcome" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
          <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
          <Stack.Screen name="auth-popup" options={{ headerShown: false }} />
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
    </AppConfigProvider>
  );
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SupabaseProvider>
          <AuthProvider>
            <RootLayoutInner />
          </AuthProvider>
        </SupabaseProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
