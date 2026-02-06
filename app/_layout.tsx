
import { WidgetProvider } from "@/contexts/WidgetContext";
import { SupabaseProvider } from "@/contexts/SupabaseContext";
import { useColorScheme, Alert } from "react-native";
import { useNetworkState } from "expo-network";
import { useFonts } from "expo-font";
import {
  DarkTheme,
  DefaultTheme,
  Theme,
  ThemeProvider,
} from "@react-navigation/native";
import "react-native-reanimated";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import * as SplashScreen from "expo-splash-screen";
import { Stack } from "expo-router";
import { SystemBars } from "react-native-edge-to-edge";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { isConnected } = useNetworkState();
  const colorScheme = useColorScheme();

  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  useEffect(() => {
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
        <WidgetProvider>
          <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
            <SystemBars style={colorScheme === "dark" ? "light" : "dark"} />
            <Stack>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="+not-found" />
            </Stack>
            <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
          </ThemeProvider>
        </WidgetProvider>
      </SupabaseProvider>
    </GestureHandlerRootView>
  );
}
