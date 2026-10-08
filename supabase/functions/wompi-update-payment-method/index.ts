// Supabase Edge Function: wompi-update-payment-method
// Dos acciones sobre la tarjeta de cobro de la suscripcion:
//  - action 'get':    devuelve marca / ultimos 4 / vencimiento de la tarjeta
//                     actual (consultada EN VIVO a Wompi; Nospi no guarda el
//                     numero ni datos de la tarjeta).
//  - action 'change': recibe un cardToken (tokenizado por la app directo con
//                     Wompi, igual que al suscribirse), crea la fuente de pago
//                     nueva y la deja como tarjeta de cobro de la suscripcion.
//                     NO cobra nada: el proximo cobro del cron usa la nueva.
//                     Reinicia failed_charge_count para que quien cambie la
//                     tarjeta porque rebotaba no arrastre intentos fallidos.
// No toca last_charge_status/last_charge_transaction_id: si habia un cobro
// PENDING en curso, el cron lo sigue resolviendo primero (anti doble cobro).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const WOMPI_PRIVATE_KEY = 'prv_prod_r8NTduTEKXxzoLZv302Gw4i9jC0lerlK';
const WOMPI_API_URL = 'https://production.wompi.co/v1';
const SUPABASE_URL = 'https://wjdiraurfbawotlcndmk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Extrae los datos mostrables de una fuente de pago de Wompi de forma
// defensiva (el shape de public_data varia un poco entre versiones).
function cardPublicInfo(source: any): { brand: string | null; lastFour: string | null; expMonth: string | null; expYear: string | null } {
  const pd = source?.public_data || {};
  const brand = pd.brand || pd.card_brand || pd.type || null;
  const lastFour = pd.last_four || pd.lastFour || (typeof pd.number === 'string' ? pd.number.slice(-4) : null) || null;
  const expMonth = pd.exp_month || pd.expMonth || null;
  const expYear = pd.exp_year || pd.expYear || null;
  return {
    brand: brand ? String(brand) : null,
    lastFour: lastFour ? String(lastFour) : null,
    expMonth: expMonth ? String(expMonth) : null,
    expYear: expYear ? String(expYear) : null,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { action, userId, userEmail, cardToken, acceptanceToken, personalDataToken } = await req.json();

    if (!action || !userId) return json({ error: 'Faltan parametros' }, 400);

    const { data: sub, error: subError } = await supabase
      .from('subscriptions')
      .select('id, status, wompi_payment_source_id, wompi_customer_email')
      .eq('user_id', userId)
      .maybeSingle();

    if (subError) return json({ error: subError.message }, 500);
    if (!sub) return json({ error: 'No hay suscripcion para este usuario' }, 404);

    if (action === 'get') {
      if (!sub.wompi_payment_source_id) return json({ card: null });
      const res = await fetch(`${WOMPI_API_URL}/payment_sources/${sub.wompi_payment_source_id}`, {
        headers: { Authorization: `Bearer ${WOMPI_PRIVATE_KEY}` },
      });
      const data = await res.json();
      if (!res.ok || !data?.data) {
        console.error('wompi-update-payment-method get: error consultando fuente', JSON.stringify(data));
        return json({ card: null });
      }
      return json({ card: cardPublicInfo(data.data) });
    }

    if (action === 'change') {
      if (!cardToken || !acceptanceToken || !userEmail) return json({ error: 'Faltan parametros' }, 400);

      const sourceBody: Record<string, unknown> = {
        type: 'CARD',
        token: cardToken,
        customer_email: userEmail,
        acceptance_token: acceptanceToken,
      };
      if (personalDataToken) sourceBody.acceptance_token_personal_data_auth = personalDataToken;

      const sourceRes = await fetch(`${WOMPI_API_URL}/payment_sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${WOMPI_PRIVATE_KEY}` },
        body: JSON.stringify(sourceBody),
      });
      const sourceData = await sourceRes.json();

      if (!sourceRes.ok || !sourceData?.data?.id) {
        console.error('wompi-update-payment-method change: error creando payment_source', JSON.stringify(sourceData));
        return json({
          error: sourceData.error?.messages
            ? Object.values(sourceData.error.messages).flat().join(', ')
            : (sourceData.error ? JSON.stringify(sourceData.error) : 'No se pudo guardar la tarjeta nueva'),
        }, 400);
      }

      const sourceStatus = sourceData.data.status;
      if (sourceStatus && sourceStatus !== 'AVAILABLE') {
        console.error('wompi-update-payment-method change: fuente no disponible', JSON.stringify(sourceData));
        return json({ error: `El banco no habilito esta tarjeta para pagos recurrentes (estado: ${sourceStatus}). Intenta con otra.` }, 400);
      }

      const { error: updError } = await supabase
        .from('subscriptions')
        .update({
          wompi_payment_source_id: sourceData.data.id,
          wompi_customer_email: userEmail,
          failed_charge_count: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sub.id);

      if (updError) {
        console.error('wompi-update-payment-method change: error guardando', updError.message);
        return json({ error: 'La tarjeta se registro pero no se pudo asociar a la suscripcion. Intenta de nuevo.' }, 500);
      }

      return json({ ok: true, card: cardPublicInfo(sourceData.data) });
    }

    return json({ error: `Accion desconocida: ${action}` }, 400);
  } catch (error: any) {
    console.error('wompi-update-payment-method error:', error);
    return json({ error: error.message }, 500);
  }
});
