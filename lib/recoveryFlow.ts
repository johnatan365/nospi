/**
 * lib/recoveryFlow.ts
 *
 * Bandera temporal para marcar que hay un flujo de "olvidé mi contraseña" en
 * curso. index.tsx la consulta para NO redirigir automaticamente a
 * /(tabs)/events cuando detecta una sesion activa mientras el usuario todavia
 * esta en /reset-password escribiendo su nueva contraseña — una sesion de
 * recovery es, para Supabase, una sesion valida como cualquier otra, asi que
 * sin esta bandera cualquier logica de "ya hay sesion -> entrar a la app"
 * puede robarle la pantalla al formulario de reset.
 *
 * Expira sola a los 10 minutos para no dejar la app trabada si el usuario
 * abandona el flujo sin terminarlo.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const KEY = 'nospi_password_recovery_in_progress';
const MAX_AGE_MS = 10 * 60 * 1000;

export async function markRecoveryInProgress(): Promise<void> {
  const value = String(Date.now());
  try {
    if (Platform.OS === 'web') {
      window.localStorage.setItem(KEY, value);
    } else {
      await AsyncStorage.setItem(KEY, value);
    }
  } catch (e) {
    console.warn('recoveryFlow: no se pudo marcar recovery en progreso', e);
  }
}

export async function clearRecoveryInProgress(): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      window.localStorage.removeItem(KEY);
    } else {
      await AsyncStorage.removeItem(KEY);
    }
  } catch (e) {
    console.warn('recoveryFlow: no se pudo limpiar recovery en progreso', e);
  }
}

export async function isRecoveryInProgress(): Promise<boolean> {
  try {
    let raw: string | null = null;
    if (Platform.OS === 'web') {
      raw = window.localStorage.getItem(KEY);
    } else {
      raw = await AsyncStorage.getItem(KEY);
    }
    if (!raw) return false;
    const ts = Number(raw);
    if (!ts || Date.now() - ts > MAX_AGE_MS) return false;
    return true;
  } catch (e) {
    return false;
  }
}
