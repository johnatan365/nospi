
import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';

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
    detectSessionInUrl: true, // Enable URL session detection for OAuth
    flowType: 'pkce', // Use PKCE flow for better security
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
