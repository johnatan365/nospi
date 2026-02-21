
import { useNetworkState } from "expo-network";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Stack, useRouter } from "expo-router";
import "react-native-reanimated";
import { useFonts } from "expo-font";
import React, { useEffect, useRef, useState } from "react";
import { StatusBar } from "expo-status-bar";
import {
  DarkTheme,
  DefaultTheme,
  Theme,
  ThemeProvider,
} from "@react-navigation/native";
import { SupabaseProvider } from "@/contexts/SupabaseContext";
import * as SplashScreen from "expo-splash-screen";
import { useColorScheme, Platform } from "react-native";
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
  const router = useRouter();
  
  // CRITICAL: State to control app rendering until OAuth code exchange completes
  const [initializing, setInitializing] = useState(true);

  // CRITICAL: Web-specific OAuth code exchange handler - RUNS BEFORE APP RENDERS
  useEffect(() => {
    if (Platform.OS === 'web') {
      console.log('Web: Checking for OAuth code in URL before rendering app');
      
      const handleWebOAuthRedirect = async () => {
        // Check if we're on the web platform
        if (typeof window === 'undefined') {
          setInitializing(false);
          return;
        }
        
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');

        if (code) {
          console.log('Web: Found OAuth code in URL, exchanging for session BEFORE rendering...');
          
          try {
            const { data, error } = await supabase.auth.exchangeCodeForSession(code);
            
            if (error) {
              console.error('Web: Error exchanging code for session:', error);
              // Clean URL even on error
              window.history.replaceState({}, document.title, window.location.pathname);
              setInitializing(false);
            } else {
              console.log('Web: Code exchanged successfully, session created');
              
              // CRITICAL: Clean the URL to remove the code parameter
              window.history.replaceState({}, document.title, window.location.pathname);
              
              // Check session and navigate
              const { data: sessionData } = await supabase.auth.getSession();
              if (sessionData.session) {
                console.log('Web: Session found, user:', sessionData.session.user.id);
                // Session exists, app will render and auth listeners will handle navigation
              }
              
              // CRITICAL: Allow app to render now that exchange is complete
              setInitializing(false);
            }
          } catch (e) {
            console.error('Web: Exception during code exchange:', e);
            // Clean URL even on exception
            if (typeof window !== 'undefined') {
              window.history.replaceState({}, document.title, window.location.pathname);
            }
            setInitializing(false);
          }
        } else {
          // No code in URL, proceed normally
          console.log('Web: No OAuth code in URL, proceeding normally');
          setInitializing(false);
        }
      };

      handleWebOAuthRedirect();
    } else {
      // Mobile: No need to block rendering
      setInitializing(false);
    }
  }, []);

  // CRITICAL: Mobile-specific deep link handler for OAuth callbacks
  useEffect(() => {
    if (Platform.OS !== 'web') {
      console.log('Mobile: Setting up global OAuth listener');
      
      const handleDeepLink = async (event: { url: string }) => {
        const url = event.url;
        console.log('Mobile: Deep link received:', url);
        
        // Check if this is an OAuth callback (nospi://auth)
        if (url.includes('nospi://auth') || url.includes('/auth')) {
          console.log('Mobile: OAuth callback detected, exchanging code for session...');
          
          try {
            // CRITICAL: Use exchangeCodeForSession for PKCE flow
            const { data, error } = await supabase.auth.exchangeCodeForSession(url);
            
            if (error) {
              console.error('Mobile: Error exchanging code for session:', error);
              return;
            }
            
            if (data.session) {
              console.log('✅ Mobile: Session exchanged successfully, user:', data.session.user.id);
              console.log('Mobile: Session will be persisted automatically by Supabase client');
              // The onAuthStateChange listeners in login.tsx and register.tsx will handle navigation
            } else {
              console.log('⚠️ Mobile: No session returned from exchangeCodeForSession');
            }
          } catch (error) {
            console.error('Mobile: Failed to exchange code for session:', error);
          }
        }
      };

      // Add listener only once
      if (!listenerRef.current) {
        console.log('Mobile: Adding global Linking listener for OAuth callbacks');
        listenerRef.current = Linking.addEventListener('url', handleDeepLink);
      }

      // Check if app was opened with a URL (cold start)
      Linking.getInitialURL().then((url) => {
        if (url) {
          console.log('Mobile: App opened with initial URL:', url);
          handleDeepLink({ url });
        }
      });

      // Cleanup listener on unmount
      return () => {
        if (listenerRef.current) {
          console.log('Mobile: Removing global Linking listener');
          listenerRef.current.remove();
          listenerRef.current = null;
        }
      };
    }
  }, []);

  useEffect(() => {
    console.log('Root layout mounted');
    if (loaded && !initializing) {
      SplashScreen.hideAsync();
    }
  }, [loaded, initializing]);

  // CRITICAL: Don't render app until fonts are loaded AND OAuth exchange is complete
  if (!loaded || initializing) {
    console.log('RootLayout: Waiting for initialization...', { loaded, initializing });
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
