import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

// Genera un UUID simple sin dependencias externas
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Obtiene o crea un device_id anónimo persistente
export async function getDeviceId(): Promise<string> {
  let deviceId = await AsyncStorage.getItem('nospi_device_id');
  if (!deviceId) {
    deviceId = generateUUID();
    await AsyncStorage.setItem('nospi_device_id', deviceId);
  }
  return deviceId;
}

// Actualiza el paso actual del onboarding en Supabase
export async function trackOnboardingStep(step: string): Promise<void> {
  try {
    const deviceId = await getDeviceId();
    
    // Intentar update primero
    const { data, error } = await supabase
      .from('onboarding_sessions')
      .update({ last_step: step, updated_at: new Date().toISOString() })
      .eq('device_id', deviceId)
      .select();

    // Si no existe, hacer insert
    if (!error && (!data || data.length === 0)) {
      await supabase
        .from('onboarding_sessions')
        .insert({ device_id: deviceId, last_step: step });
    }
  } catch (e) {
    // Silencioso — no interrumpe el flujo
    console.warn('[OnboardingTracker] Error:', e);
  }
}

// Marca el onboarding como completado
export async function completeOnboardingSession(): Promise<void> {
  try {
    const deviceId = await getDeviceId();
    await supabase
      .from('onboarding_sessions')
      .update({ last_step: 'completed', completed: true, updated_at: new Date().toISOString() })
      .eq('device_id', deviceId);
  } catch (e) {
    console.warn('[OnboardingTracker] Complete error:', e);
  }
}
