import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------------------------------------------------------------------------
// pendingRoute — "miga de pan" para abrir una pantalla en cuanto la app sea
// usable. Sirve de puente para el caso borde del muro de actualizacion
// obligatoria (ForceUpdateGate): si el usuario toca un push (p.ej. de chat)
// pero su version esta por debajo de min_app_version, el muro tapa todo y no
// tiene sentido navegar. En vez de eso guardamos aqui la ruta; cuando la
// persona actualiza y reabre, el ruteo de notificaciones la consume y la lleva
// directo a esa pantalla (ver hooks/useNotificationRouting.ts).
// ---------------------------------------------------------------------------

const KEY = 'pending_route_v1';
// Solo consumimos migas recientes: asi evitamos mandar a alguien a un chat
// viejo en una apertura normal que no tenga que ver con el push.
const MAX_AGE_MS = 10 * 60 * 1000; // 10 minutos

type Pending = { route: string; ts: number };

export async function setPendingRoute(route: string): Promise<void> {
  try {
    const payload: Pending = { route, ts: Date.now() };
    await AsyncStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // no-op: si no se puede guardar, simplemente no hay deep link diferido.
  }
}

export async function clearPendingRoute(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // no-op
  }
}

// Lee y CONSUME (borra) la ruta pendiente. Devuelve la ruta solo si existe y
// es reciente; si esta vencida o no hay, devuelve null. Se consume una sola vez.
export async function takePendingRoute(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    await AsyncStorage.removeItem(KEY);
    const parsed = JSON.parse(raw) as Pending;
    if (!parsed || typeof parsed.route !== 'string') return null;
    if (!Number.isFinite(parsed.ts) || Date.now() - parsed.ts > MAX_AGE_MS) {
      return null; // vencida
    }
    return parsed.route;
  } catch {
    return null;
  }
}
