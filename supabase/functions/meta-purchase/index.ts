import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// v17 (23 sep 2026): misma mejora de calidad de coincidencia que se le hizo a
// wompi-webhook. IMPORTANTE que las dos manden lo mismo: el cliente
// (payment-callback) y el webhook disparan el MISMO event_id, y Meta se queda
// con el primero que le llegue. Si el del cliente llegaba pelado (solo correo
// y telefono) podia ganarle al del webhook y tumbar la atribucion.
//
// El cliente no manda userId, solo userEmail, asi que el usuario se busca por
// correo para sacarle click_id (el fbclid guardado por public/index.html),
// ciudad, pais y nombre.

const META_PIXEL_ID = '956701276734114';
const META_ACCESS_TOKEN = Deno.env.get('META_CONVERSIONS_TOKEN') || '';
const SUPABASE_URL = 'https://wjdiraurfbawotlcndmk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const APP_URL = 'https://app.nospi.co';

// Fuentes cuyo click_id ES un fbclid. click_id tambien guarda ttclid y gclid:
// mandar un ttclid como fbc ensuciaria la atribucion de Meta.
const META_SOURCES = new Set(['fb', 'facebook', 'ig', 'instagram', 'meta', '{{site_source_name}}']);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Meta requiere que em/ph vayan hasheados con SHA-256 antes de enviarse.
// Meta NO los hashea automaticamente en la API de Conversiones server-side.
async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Formato exigido por Meta: fb.1.<milisegundos del clic>.<fbclid>. Como no
// guardamos la hora exacta del clic, se usa created_at del usuario: en la
// practica se registra a los pocos minutos de hacer clic en el anuncio.
function buildFbc(clickId: any, utmSource: any, createdAt: any): string {
  const id = String(clickId || '').trim();
  if (!id) return '';
  const src = String(utmSource || '').toLowerCase().trim();
  if (!META_SOURCES.has(src)) return '';
  if (id.startsWith('fb.')) return id;
  const ms = createdAt ? new Date(createdAt).getTime() : NaN;
  const t = Number.isFinite(ms) ? ms : Date.now();
  return `fb.1.${t}.${id}`;
}

function normalizeCountry(c: any): string {
  const v = String(c || '').toLowerCase().trim();
  if (!v) return '';
  if (v.length === 2) return v;
  if (v.startsWith('colomb')) return 'co';
  if (v.startsWith('mexic') || v.startsWith('méxic')) return 'mx';
  if (v.startsWith('espa')) return 'es';
  if (v.startsWith('argent')) return 'ar';
  if (v.startsWith('estados') || v.startsWith('united')) return 'us';
  return '';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { transactionId, amount, currency, eventId, userId, userEmail, userPhone } = await req.json();

    if (!transactionId) {
      return new Response(JSON.stringify({ error: 'transactionId requerido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userData: Record<string, string> = {};
    if (userEmail) {
      const normalizedEmail = String(userEmail).toLowerCase().trim();
      userData['em'] = await sha256(normalizedEmail);
    }
    if (userPhone) {
      const normalizedPhone = String(userPhone).replace(/\D/g, '');
      if (normalizedPhone) userData['ph'] = await sha256(normalizedPhone);
    }

    // Buscar al usuario para sacarle el fbclid y las llaves extra. Si algo
    // falla aqui NO se aborta: se manda el evento con lo que haya, que es
    // exactamente lo que hacia la version anterior.
    let fbc = '';
    let utmSourceLog: string | null = null;
    try {
      if (SUPABASE_SERVICE_ROLE_KEY && (userId || userEmail)) {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const q = supabase
          .from('users')
          .select('id, name, city, country, click_id, utm_source, created_at');
        const { data: user } = userId
          ? await q.eq('id', userId).maybeSingle()
          : await q.ilike('email', String(userEmail).trim()).maybeSingle();

        if (user) {
          utmSourceLog = user.utm_source || null;
          if (user.id) userData['external_id'] = await sha256(String(user.id));

          const firstName = String(user.name || '').trim().split(' ')[0];
          if (firstName) userData['fn'] = await sha256(firstName.toLowerCase());

          const city = String(user.city || '').toLowerCase().replace(/\s+/g, '').trim();
          if (city) userData['ct'] = await sha256(city);

          const country = normalizeCountry(user.country);
          if (country) userData['country'] = await sha256(country);

          fbc = buildFbc(user.click_id, user.utm_source, user.created_at);
          if (fbc) userData['fbc'] = fbc;
        }
      }
    } catch (e) {
      console.error('meta-purchase: no se pudo enriquecer user_data:', e);
    }

    const eventTime = Math.floor(Date.now() / 1000);

    const payload = {
      data: [
        {
          event_name: 'Purchase',
          event_time: eventTime,
          event_id: `purchase_${transactionId}`,
          // 'website' + event_source_url describe lo que de verdad paso (una
          // compra en app.nospi.co) y es lo que permite que el fbc se use para
          // atribuir. 'system_generated' le decia a Meta que no hubo accion de
          // usuario, que es justo lo contrario.
          action_source: 'website',
          event_source_url: APP_URL,
          custom_data: {
            value: amount || 9900,
            currency: currency || 'COP',
            content_type: 'product',
            content_ids: [eventId || 'nospi_event'],
          },
          user_data: {
            ...userData,
          },
        },
      ],
    };

    const metaRes = await fetch(
      `https://graph.facebook.com/v18.0/${META_PIXEL_ID}/events?access_token=${META_ACCESS_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );

    const metaData = await metaRes.json();

    if (!metaRes.ok) {
      console.error('Meta API error:', metaData);
      return new Response(JSON.stringify({ error: 'Error enviando a Meta', details: metaData }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Meta Purchase enviado:', JSON.stringify({
      tx: transactionId,
      llaves: Object.keys(userData).join(','),
      con_fbc: !!fbc,
      utm_source: utmSourceLog,
      metaData,
    }));

    return new Response(JSON.stringify({ success: true, meta: metaData }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Error en meta-purchase:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
