import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://wjdiraurfbawotlcndmk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Token que TU eliges (cualquier texto) y pegas tambien en el panel de Meta
// al configurar el webhook, para que Meta pueda verificar que este endpoint
// es tuyo. Configurar en Supabase -> Edge Functions -> Secrets.
const META_WEBHOOK_VERIFY_TOKEN = Deno.env.get('META_WEBHOOK_VERIFY_TOKEN') || '';

// App Secret de Meta. Se usa para verificar la firma X-Hub-Signature-256 que
// Meta envia en cada POST (HMAC-SHA256 del cuerpo crudo). Configurar en
// Supabase -> Edge Functions -> Secrets. Mientras este VACIO, la firma NO se
// verifica (migracion segura / fail-open) para no romper las confirmaciones.
const META_APP_SECRET = Deno.env.get('META_APP_SECRET') || '';

// Calcula el HMAC-SHA256 de `message` con `secret` y lo devuelve en hex.
async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Comparacion en tiempo constante de dos strings (evita timing attacks).
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

serve(async (req) => {
  const url = new URL(req.url);

  // --- Paso 1: Meta verifica el webhook con un GET al activarlo ---
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === META_WEBHOOK_VERIFY_TOKEN) {
      return new Response(challenge || '', { status: 200 });
    }
    return new Response('Verification failed', { status: 403 });
  }

  // --- Paso 2: Meta manda aqui cada mensaje/respuesta entrante ---
  if (req.method === 'POST') {
    try {
      // Leemos el cuerpo crudo UNA SOLA VEZ (leerlo dos veces rompe con
      // "Body is unusable"). Lo necesitamos crudo para verificar la firma.
      const raw = await req.text();

      // --- Verificacion de firma X-Hub-Signature-256 (HMAC-SHA256) ---
      if (META_APP_SECRET) {
        const headerSig = (req.headers.get('x-hub-signature-256') || '').trim().toLowerCase();
        const expectedSig = ('sha256=' + (await hmacHex(META_APP_SECRET, raw))).toLowerCase();

        if (!headerSig || !timingSafeEqual(headerSig, expectedSig)) {
          console.warn('whatsapp-webhook: firma X-Hub-Signature-256 invalida, evento rechazado');
          return new Response('Invalid signature', { status: 401 });
        }
      } else {
        // Migracion segura: sin secreto configurado NO verificamos, pero
        // avisamos para que el dueno cargue el secreto cuanto antes.
        console.warn('whatsapp-webhook: META_APP_SECRET no configurado, firma NO verificada');
      }

      const body = JSON.parse(raw);
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      const entry = body.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;
      const message = value?.messages?.[0];

      if (message?.type === 'button' || message?.type === 'interactive') {
        const fromPhoneRaw = message.from; // numero sin '+', ej: '573001234567'
        const buttonId =
          message.button?.payload ||
          message.interactive?.button_reply?.id ||
          '';

        // Buscar el usuario por telefono (probamos con y sin '+' al inicio)
        const { data: users } = await supabase
          .from('users')
          .select('id')
          .or(`phone.eq.+${fromPhoneRaw},phone.eq.${fromPhoneRaw}`);

        const userId = users?.[0]?.id;
        if (userId) {
          // Actualizar la cita mas reciente de este usuario que ya tenga
          // el recordatorio enviado y aun no tenga respuesta.
          const { data: appt } = await supabase
            .from('appointments')
            .select('id')
            .eq('user_id', userId)
            .not('reminder_48h_sent_at', 'is', null)
            .is('attendance_confirmed', null)
            .order('reminder_48h_sent_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (appt?.id) {
            const confirmed = buttonId === 'CONFIRM_YES';
            await supabase
              .from('appointments')
              .update({ attendance_confirmed: confirmed })
              .eq('id', appt.id);
          }
        }
      }

      return new Response('EVENT_RECEIVED', { status: 200 });
    } catch (err) {
      console.error('whatsapp-webhook error:', err);
      // Igual respondemos 200 para que Meta no reintente indefinidamente
      return new Response('EVENT_RECEIVED', { status: 200 });
    }
  }

  return new Response('Method not allowed', { status: 405 });
});
