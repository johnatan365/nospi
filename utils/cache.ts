import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

/**
 * Stale-while-revalidate persistent cache backed by AsyncStorage.
 * Keys are namespaced with a prefix to avoid collisions.
 *
 * The events list is user-specific because availability depends on the
 * current user's appointments and gender. Keeping a single global key could
 * make one account inherit an empty/stale list produced by another account
 * on the same browser/device. Scope only that cache by the authenticated user
 * so existing callers do not need to change.
 */

const KEY_PREFIX = 'nospi_cache_';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

async function getStorageKey(key: string): Promise<string> {
  if (key !== 'cache_events') return KEY_PREFIX + key;

  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user?.id ?? 'anon';
    return `${KEY_PREFIX}${key}_${userId}`;
  } catch (err) {
    console.warn('[cache] Could not resolve user-scoped events key:', err);
    return `${KEY_PREFIX}${key}_anon`;
  }
}

export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const storageKey = await getStorageKey(key);
    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    console.log(`[cache] HIT key="${key}" age=${Math.round((Date.now() - entry.timestamp) / 1000)}s`);
    return entry.data;
  } catch (err) {
    console.warn(`[cache] getCached error for key="${key}":`, err);
    return null;
  }
}

/**
 * Igual que getCached, pero devuelve la ENTRADA completa en vez del dato.
 *
 * Por que hace falta: getCached devuelve null tanto si no hay nada guardado
 * como si lo guardado ES null. Para la pantalla de Dinamica eso importaba
 * mucho: a quien no tiene ningun evento confirmado se le guarda null, asi que
 * su cache nunca contaba como cache y CADA vez tenia que esperar a la red
 * (revisar sesion + consultar) antes de poder decirle "no tienes eventos".
 * Con esto, "guardado y es null" se pinta al instante.
 */
export async function getCachedEntry<T>(key: string): Promise<{ data: T; timestamp: number } | null> {
  try {
    const storageKey = await getStorageKey(key);
    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    return { data: entry.data, timestamp: entry.timestamp };
  } catch (err) {
    console.warn(`[cache] getCachedEntry error for key="${key}":`, err);
    return null;
  }
}

export async function setCached<T>(key: string, data: T): Promise<void> {
  try {
    const storageKey = await getStorageKey(key);
    const entry: CacheEntry<T> = { data, timestamp: Date.now() };
    await AsyncStorage.setItem(storageKey, JSON.stringify(entry));
    console.log(`[cache] SET key="${key}"`);
  } catch (err) {
    console.warn(`[cache] setCached error for key="${key}":`, err);
  }
}

export async function clearCached(key: string): Promise<void> {
  try {
    const storageKey = await getStorageKey(key);
    await AsyncStorage.removeItem(storageKey);
    console.log(`[cache] CLEAR key="${key}"`);
  } catch (err) {
    console.warn(`[cache] clearCached error for key="${key}":`, err);
  }
}
