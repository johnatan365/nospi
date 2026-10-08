import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

// Events API de TikTok — espejo server-side de meta-purchase.
// Igual que con Meta, el evento de compra NO ocurre en el navegador (la compra
// se completa en la app), asi que el pixel de navegador nunca lo veria.
// Esta funcion lo manda directo desde el servidor.
const TIKTOK_PIXEL_CODE = 'DA1RGIBC77UE3FB79VU0';
const TIKTOK_ACCESS_TOKEN = Deno.env.get('TIKTOK_EVENTS_TOKEN') || '';
const TIKTOK_EVENTS_URL = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// TikTok, igual que Meta, exige email y telefono hasheados en SHA-256.
// No los hashea del lado del servidor.
async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!TIKTOK_ACCESS_TOKEN) {
      console.error('Falta el secret TIKTOK_EVENTS_TOKEN');
      return new Response(
        JSON.stringify({ error: 'TIKTOK_EVENTS_TOKEN no configurado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { transactionId, amount, currency, eventId, userEmail, userPhone } = await req.json();

    if (!transactionId) {
      return new Response(JSON.stringify({ error: 'transactionId requerido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const user: Record<string, string> = {};
    if (userEmail) {
      user['email'] = await sha256(userEmail.toLowerCase().trim());
    }
    if (userPhone) {
      // TikTok pide E.164 antes de hashear. Colombia: +57.
      let digits = userPhone.replace(/\D/g, '');
      if (digits) {
        if (!digits.startsWith('57') && digits.length === 10) digits = '57' + digits;
        user['phone'] = await sha256('+' + digits);
      }
    }

    const payload = {
      event_source: 'web',
      event_source_id: TIKTOK_PIXEL_CODE,
      data: [
        {
          event: 'CompletePayment',
          event_time: Math.floor(Date.now() / 1000),
          // Mismo esquema de id que Meta ('purchase_<txId>') para que ambos
          // sistemas dedupliquen contra el pixel de navegador si algun dia
          // llega a dispararse por esa via tambien.
          event_id: `purchase_${transactionId}`,
          user,
          properties: {
            currency: currency || 'COP',
            value: amount || 9900,
            contents: [
              {
                content_id: eventId || 'nospi_event',
                content_type: 'product',
                content_name: 'Cupo Nospi',
                quantity: 1,
                price: amount || 9900,
              },
            ],
          },
          page: { url: 'https://nospi.co' },
        },
      ],
    };

    const ttRes = await fetch(TIKTOK_EVENTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Access-Token': TIKTOK_ACCESS_TOKEN,
      },
      body: JSON.stringify(payload),
    });

    const ttData = await ttRes.json();

    // TikTok devuelve HTTP 200 con code != 0 cuando algo falla, asi que hay
    // que revisar el body y no solo el status.
    if (!ttRes.ok || ttData.code !== 0) {
      console.error('TikTok Events API error:', ttData);
      return new Response(
        JSON.stringify({ error: 'Error enviando a TikTok', details: ttData }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log('TikTok CompletePayment enviado:', ttData);

    return new Response(JSON.stringify({ success: true, tiktok: ttData }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error en tiktok-purchase:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
