import "react-native-url-polyfill/auto";
import { useNetworkState } from "expo-network";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Stack } from "expo-router";
import "react-native-reanimated";
import React, { useState, useRef, useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { SupabaseProvider } from "@/contexts/SupabaseContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppConfigProvider } from "@/contexts/AppConfigContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useDeviceActivity } from "@/hooks/useDeviceActivity";
import { useNotificationRouting } from "@/hooks/useNotificationRouting";
import * as SplashScreen from "expo-splash-screen";
import { useColorScheme, Platform, View, Animated, StyleSheet } from "react-native";
import { SystemBars } from "react-native-edge-to-edge";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import * as Sentry from "@sentry/react-native";

Sentry.init({
  dsn: "https://b2517bba95f69144b1b2b63ab48321aa@o4511187847151616.ingest.us.sentry.io/4511187857047552",
  debug: Platform.OS === 'android',
  enableNativeNagger: false,
  tracesSampleRate: 1.0,
  integrations: [
    Sentry.breadcrumbsIntegration({ console: true }),
  ],
});

// El splash se mantiene visible hasta que index.tsx decida a dónde navegar,
// eliminando la pantalla blanca entre el splash y la pantalla de bienvenida.
SplashScreen.preventAutoHideAsync();

// ---------------------------------------------------------------------------
// Splash animado "Avatares que se juntan": círculos de colores (personas) que
// entran desde los bordes y se agrupan en el centro, y luego aparece el logo.
// Corre una sola vez al abrir la app, sobre el fondo real del splash (#1a0010),
// así se ve IGUAL en iPhone y Android. Hecho solo con Animated de React Native
// (sin librerías nuevas). Al terminar, llama onFinish() y se desmonta.
// ---------------------------------------------------------------------------
const SPLASH_BG = "#1a0010";
const AV_COLORS = ["#f28fb1", "#ffd27a", "#9ad0ff", "#b6e3a7", "#d7a7ff"];
const AV_OFFSETS = [
  { x: -90, y: -74 },
  { x: 92, y: -68 },
  { x: -100, y: 44 },
  { x: 96, y: 56 },
  { x: 0, y: 100 },
];

function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  const circles = useRef(AV_OFFSETS.map(() => new Animated.Value(0))).current;
  const logo = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Tomamos el control del splash de una para que la animación se vea completa.
    SplashScreen.hideAsync().catch(() => {});
    Animated.sequence([
      Animated.stagger(
        80,
        circles.map((a) =>
          Animated.spring(a, {
            toValue: 1,
            useNativeDriver: true,
            friction: 6,
            tension: 55,
          })
        )
      ),
      Animated.timing(logo, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.delay(650),
      Animated.timing(fade, { toValue: 0, duration: 420, useNativeDriver: true }),
    ]).start(() => onFinish());
  }, []);

  const logoScale = logo.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.5, 1.06, 1] });
  const circlesFadeOut = logo.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <Animated.View style={[styles.splashFill, { opacity: fade }]} pointerEvents="none">
      <View style={styles.splashCenter}>
        {AV_OFFSETS.map((off, i) => {
          const translateX = circles[i].interpolate({ inputRange: [0, 1], outputRange: [off.x, 0] });
          const translateY = circles[i].interpolate({ inputRange: [0, 1], outputRange: [off.y, 0] });
          const appear = circles[i].interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] });
          const opacity = Animated.multiply(appear, circlesFadeOut);
          return (
            <Animated.View
              key={i}
              style={[
                styles.avatar,
                {
                  backgroundColor: AV_COLORS[i],
                  opacity,
                  transform: [{ translateX }, { translateY }],
                },
              ]}
            />
          );
        })}
        <Animated.Image
          source={require("../assets/icon.png")}
          style={[styles.splashLogo, { opacity: logo, transform: [{ scale: logoScale }] }]}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  splashFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: SPLASH_BG,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
    elevation: 999,
  },
  splashCenter: {
    width: 200,
    height: 200,
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    position: "absolute",
    top: 77,
    left: 77,
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  splashLogo: {
    width: 100,
    height: 100,
    borderRadius: 25,
  },
});

function RootLayoutInner() {
  const colorScheme = useColorScheme();
  const { isConnected } = useNetworkState();
  const { user, loading: authLoading } = useAuth();
  usePushNotifications(user?.id);
  useDeviceActivity(user?.id);
  useNotificationRouting(!authLoading);

  const [showSplashAnim, setShowSplashAnim] = useState(true);

  return (
    <AppConfigProvider>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <SystemBars style="auto" />
        <StatusBar style="dark" />
        <View style={{ flex: 1 }}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="welcome" options={{ headerShown: false }} />
            <Stack.Screen name="login" options={{ headerShown: false }} />
            <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
            <Stack.Screen name="reset-password" options={{ headerShown: false }} />
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
            <Stack.Screen name="chat/[conversationId]" options={{ headerShown: false }} />
            <Stack.Screen name="catch-up-rating/[eventId]" options={{ headerShown: false }} />
            <Stack.Screen name="subscription-plans" options={{ headerShown: false }} />
            <Stack.Screen name="admin" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="+not-found" />
          </Stack>
          {showSplashAnim && <AnimatedSplash onFinish={() => setShowSplashAnim(false)} />}
        </View>
      </ThemeProvider>
    </AppConfigProvider>
  );
}

export default Sentry.wrap(function RootLayout() {
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
});
