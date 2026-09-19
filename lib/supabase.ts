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

// Se exportan para las subidas a Storage que NO pasan por supabase-js: en
// movil los archivos grandes (videos del chat) se suben con streaming via
// FileSystem.uploadAsync, que necesita la URL del endpoint y la anon key.
export const SUPABASE_URL: string = supabaseUrl;
export const SUPABASE_ANON_KEY: string = supabaseAnonKey;

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

// Cliente dedicado UNICAMENTE a pedir el correo de "olvide mi contrasena".
//
// Por que existe: el cliente principal usa PKCE en movil. Con PKCE,
// resetPasswordForEmail() guarda un code_verifier dentro del AsyncStorage de
// la app y el link del correo vuelve como '?code=...', sin 'type=recovery'.
// Ese code solo se puede canjear en el mismo sitio que guardo el verifier, y
// el link nunca aterriza ahi:
//   - Android abre la app por App Link, pero callback.tsx no reconocia el
//     link como recuperacion porque no traia 'type=recovery'.
//   - iOS no tiene associatedDomains, asi que abre Safari, donde el verifier
//     no existe y el canje falla siempre.
// En ambos casos la persona veia que el link "no hacia nada". Pedido desde la
// web si funcionaba, porque ahi el flow ya era implicit — de ahi que el bug
// pareciera intermitente.
//
// Con flowType 'implicit' el link vuelve con '#access_token=...&type=recovery',
// que es justo lo que las dos ramas de callback.tsx ya saben manejar, y no
// depende de ningun dato guardado en el dispositivo. Va en un cliente aparte
// para no tocar el PKCE del login con Google/Apple, que si lo necesita.
//
// persistSession: false — este cliente solo manda el correo, nunca abre sesion,
// y no debe pisar la sesion real guardada por el cliente principal.
export const supabaseRecovery = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
    flowType: 'implicit',
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
