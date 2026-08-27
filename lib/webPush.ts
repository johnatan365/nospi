import { supabase } from '@/lib/supabase';

// Notificaciones push en la version WEB.
//
// En el telefono las manda Expo; en el navegador hay que usar el estandar Web
// Push, que funciona distinto: el navegador entrega una "suscripcion" (una URL
// unica del navegador mas dos llaves de cifrado) y el servidor le manda ahi los
// avisos, firmados con nuestra llave VAPID. El service worker (/sw.js) es el
// que muestra la notificacion, y sigue vivo aunque la pestana este cerrada.
//
// La llave publica VAPID se puede publicar sin problema: solo sirve para que el
// navegador verifique que el aviso viene de nosotros. La privada vive como
// secreto en el servidor.
export const VAPID_PUBLIC_KEY =
  'BIgXk-tbVSGK1dg4DI75rY234VuTRhWcApOOKSendVxljzkdeDLjMiLNzKmuTplPDsIkQdgmoRmhdSBDaXWdcPI';

function isBrowser() {
  return typeof window !== 'undefined' && typeof navigator !== 'undefined';
}

/** Si el navegador soporta notificaciones web. */
export function isWebPushSupported(): boolean {
  return (
    isBrowser() &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    typeof Notification !== 'undefined'
  );
}

/**
 * En iPhone/iPad, Safari solo permite notificaciones si la persona agrego la
 * pagina a la pantalla de inicio. Sirve para explicarle por que no le aparece.
 */
export function needsHomeScreenOnIOS(): boolean {
  if (!isBrowser()) return false;
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS se hace pasar por Mac, pero tiene pantalla tactil.
    (/Macintosh/.test(ua) && (navigator as any).maxTouchPoints > 1);
  if (!isIOS) return false;
  const standalone =
    (window.navigator as any).standalone === true ||
    window.matchMedia?.('(display-mode: standalone)')?.matches === true;
  return !standalone;
}

/** 'granted' | 'denied' | 'default' | 'unsupported' */
export function webPushPermission(): string {
  if (!isWebPushSupported()) return 'unsupported';
  return Notification.permission;
}

// La llave VAPID viaja en base64url; el navegador la pide como bytes.
function urlBase64ToUint8Array(base64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out.buffer;
}

async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch (e) {
    console.warn('No se pudo registrar el service worker:', e);
    return null;
  }
}

/**
 * Guarda la suscripcion en su propia tabla (NO en push_tokens, que es solo para
 * los tokens de Expo del telefono). El servidor necesita la URL y las dos
 * llaves para poder cifrarle el aviso a ESTE navegador en concreto.
 */
async function saveSubscription(userId: string, sub: PushSubscription) {
  const json: any = sub.toJSON();
  if (!json?.endpoint || !json?.keys?.p256dh || !json?.keys?.auth) return false;

  const { error } = await supabase.from('web_push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent: navigator.userAgent?.slice(0, 300) ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' }
  );
  if (error) console.warn('No se pudo guardar la suscripcion web:', error.message);
  return !error;
}

/**
 * Reengancha una suscripcion que ya existe, SIN mostrarle nada a la persona.
 * Se llama al abrir la app: si ya habia dado permiso antes, esto se asegura de
 * que el token siga guardado (el navegador puede rotarlo).
 */
export async function syncWebPush(userId: string): Promise<boolean> {
  if (!isWebPushSupported() || Notification.permission !== 'granted') return false;
  const reg = await registerServiceWorker();
  if (!reg) return false;
  try {
    const ready = await navigator.serviceWorker.ready;
    let sub = await ready.pushManager.getSubscription();
    if (!sub) {
      sub = await ready.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    return await saveSubscription(userId, sub);
  } catch (e) {
    console.warn('syncWebPush:', e);
    return false;
  }
}

/**
 * Pide el permiso y se suscribe. DEBE llamarse desde un toque de la persona:
 * Safari ignora la peticion si no viene de un gesto suyo.
 * Devuelve un motivo cuando no se pudo, para poder explicarselo.
 */
export async function enableWebPush(
  userId: string
): Promise<{ ok: boolean; reason?: 'unsupported' | 'ios-home-screen' | 'denied' | 'error' }> {
  if (!isWebPushSupported()) {
    return { ok: false, reason: needsHomeScreenOnIOS() ? 'ios-home-screen' : 'unsupported' };
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return { ok: false, reason: 'denied' };

    const reg = await registerServiceWorker();
    if (!reg) return { ok: false, reason: 'error' };

    const ready = await navigator.serviceWorker.ready;
    let sub = await ready.pushManager.getSubscription();
    if (!sub) {
      sub = await ready.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    const saved = await saveSubscription(userId, sub);
    return saved ? { ok: true } : { ok: false, reason: 'error' };
  } catch (e) {
    console.warn('enableWebPush:', e);
    return { ok: false, reason: 'error' };
  }
}
