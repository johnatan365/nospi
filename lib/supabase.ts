import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

// El componente SupabaseProvider se monta dos veces al arrancar en web (parte
// de como Expo Router resuelve la ruta inicial) y para el segundo montaje
// Supabase ya proceso y limpio el hash de la URL (#access_token=...) de forma
// asincrona. Por eso el flag de "vengo de un link de recuperar contraseña" no
// puede depender de leer window.location.hash dentro de un useState/efecto de
// React (se reevalua en cada montaje). Este modulo SI se evalua una sola vez
// por carga de pagina real (confirmado: no vuelve a importarse), asi que acá
// es donde toca leerlo, apenas se importa este archivo -- antes de que
// createClient() dispare el procesamiento interno del hash.
export const RECOVERY_FLOW_DETECTED_ON_LOAD: boolean = (() => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  try {
    return window.location.hash.includes('type=recovery');
  } catch {
    return false;
  }
})();

// Get Supabase credentials from app.json extra config
const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || '';
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || '';

// Validate credentials
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '⚠️ Supabase credentials not found in app.json. Please add them to extra.supabaseUrl and extra.supabaseAnonKey'
  );
}

// Create Supabase client with AsyncStorage for session persistence
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web', // Only enable on web, native uses manual token extraction
    flowType: Platform.OS === 'web' ? 'implicit' : 'pkce', // Web uses implicit (no localStorage race), native uses PKCE
  },
});

// Expose the supabase URL and key for Edge Function calls
(supabase as any).supabaseUrl = supabaseUrl;
(supabase as any).supabaseKey = supabaseAnonKey;

// Helper to check connection
export async function testSupabaseConnection(): Promise<{
  connected: boolean;
  error?: string;
}> {
  try {
    console.log('Testing Supabase connection...');
    
    // Simple health check - try to get the current session
    const { data, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('Supabase connection error:', error.message);
      return { connected: false, error: error.message };
    }
    
    console.log('✅ Supabase connected successfully');
    return { connected: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Supabase connection failed:', errorMessage);
    return { connected: false, error: errorMessage };
  }
}
