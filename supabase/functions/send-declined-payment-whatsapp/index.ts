import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://wjdiraurfbawotlcndmk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Se configuran en Supabase -> Edge Functions -> Secrets una vez Meta apruebe
// el numero y se agregue metodo de pago.
const META_WHATSAPP_TOKEN = Deno.env.get('META_WHATSAPP_TOKEN') || '';
const META_PHONE_NUMBER_ID = Deno.env.get('META_PHONE_NUMBER_ID') || '';

const TEMPLATE_NAME = 'pago_declinado';
const TEMPLATE_LANG = 'es_CO';

// event_date es el instante UTC exacto del evento (ej. viernes 7pm Bogota =
// sabado 00:00 UTC). El server corre en UTC, asi que hay que pasar
// timeZone: 'America/Bogota' explicitamente al formatear, si no el dia de
// la semana/mes sale un dia adelantado.
function formatEventDateBogota(eventDateISO: string): string {
  return new Date(eventDateISO).toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Bogota',
  });
}

serve(async (req) => {
  try {
    if (!META_WHATSAPP_TOKEN || !META_PHONE_NUMBER_ID) {
      return new Response(JSON.stringify({ skipped: true, reason: 'META_WHATSAPP_TOKEN o META_PHONE_NUMBER_ID no configurados aun' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Reusa la misma logica que ya usa el admin panel para la lista de
    // "Declinados" (incluye el margen de 1h de gracia para reintentos).
    const { data: declined, error } = await supabase.rpc('get_declined_payments_global');

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const results: any[] = [];

    for (const row of declined || []) {
      if (row.declined_whatsapp_sent_at) continue; // ya enviado
      if (!row.user_phone) continue;

      const digits = row.user_phone.replace(/\D/g, '');
      const firstName = (row.user_name || '').trim().split(' ')[0] || 'ahi';
      const formattedDate = row.event_date ? formatEventDateBogota(row.event_date) : '';
      const eventPart = row.event_name
        ? `${row.event_name}${formattedDate ? ` del ${formattedDate}` : ''}`
        : 'el evento';

      const payload = {
        messaging_product: 'whatsapp',
        to: digits,
        type: 'template',
        template: {
          name: TEMPLATE_NAME,
          language: { code: TEMPLATE_LANG },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: firstName },
                { type: 'text', text: eventPart },
              ],
            },
          ],
        },
      };

      const res = await fetch(`https://graph.facebook.com/v20.0/${META_PHONE_NUMBER_ID}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${META_WHATSAPP_TOKEN}` },
        body: JSON.stringify(payload),
      });
      const resData = await res.json();

      if (res.ok) {
        const sentAt = new Date().toISOString();
        const { data: latest } = await supabase
          .from('payment_attempts')
          .select('id')
          .eq('user_id', row.user_id)
          .eq('event_id', row.event_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (latest?.id) {
          await supabase.from('payment_attempts').update({ declined_whatsapp_sent_at: sentAt }).eq('id', latest.id);
        }
      }

      results.push({ userId: row.user_id, eventId: row.event_id, ok: res.ok, response: resData });
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
