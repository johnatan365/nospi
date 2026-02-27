
import { useNetworkState } from "expo-network";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Stack } from "expo-router";
import "react-native-reanimated";
import { useFonts } from "expo-font";
import React, { useEffect } from "react";
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
            <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
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
