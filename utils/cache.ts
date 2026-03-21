import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Stale-while-revalidate persistent cache backed by AsyncStorage.
 * Keys are namespaced with a prefix to avoid collisions.
 */

const KEY_PREFIX = 'nospi_cache_';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    console.log(`[cache] HIT key="${key}" age=${Math.round((Date.now() - entry.timestamp) / 1000)}s`);
    return entry.data;
  } catch (err) {
    console.warn(`[cache] getCached error for key="${key}":`, err);
    return null;
  }
}

export async function setCached<T>(key: string, data: T): Promise<void> {
  try {
    const entry: CacheEntry<T> = { data, timestamp: Date.now() };
    await AsyncStorage.setItem(KEY_PREFIX + key, JSON.stringify(entry));
    console.log(`[cache] SET key="${key}"`);
  } catch (err) {
    console.warn(`[cache] setCached error for key="${key}":`, err);
  }
}

export async function clearCached(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY_PREFIX + key);
    console.log(`[cache] CLEAR key="${key}"`);
  } catch (err) {
    console.warn(`[cache] clearCached error for key="${key}":`, err);
  }
}
