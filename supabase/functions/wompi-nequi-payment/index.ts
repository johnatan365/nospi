// Supabase Edge Function: wompi-nequi-payment
// Fix: acceptance_token_personal_auth -> acceptance_token_personal_data_auth (correct Wompi field name)
// Ahora tambien registra cada intento (exitoso o no) en payment_attempts, para
// poder identificar pagos declinados sin perder de vista si luego se aprobo.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const WOMPI_PRIVATE_KEY = 'prv_prod_r8NTduTEKXxzoLZv302Gw4i9jC0lerlK';
const WOMPI_INTEGRITY_KEY = 'prod_integrity_0jyUS7YAMjKTmrIF7A0z8094tZlMItoH';
const WOMPI_API_URL = 'https://production.wompi.co/v1';
const SUPABASE_URL = 'https://wjdiraurfbawotlcndmk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function generateSignature(reference: string, amountInCents: number, currency: string): Promise<string> {
  const data = `${reference}${amountInCents}${currency}${WOMPI_INTEGRITY_KEY}`;
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { phoneNumber, acceptanceToken, personalDataToken, amountCOP, userEmail, userId, eventId } = await req.json();
    if (!phoneNumber || !acceptanceToken || !amountCOP || !userEmail)
      return new Response(JSON.stringify({ error: 'Faltan parámetros' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const reference = `nospi_nequi_${userId}_${eventId}_${Date.now()}`;
    const amountInCents = amountCOP * 100;
    const signature = await generateSignature(reference, amountInCents, 'COP');

    const body: any = {
      acceptance_token: acceptanceToken,
      amount_in_cents: amountInCents,
      currency: 'COP',
      signature,
      customer_email: userEmail,
      reference,
      payment_method: {
        type: 'NEQUI',
        phone_number: phoneNumber,
      },
    };
    if (personalDataToken) body.acceptance_token_personal_data_auth = personalDataToken;

    const response = await fetch(`${WOMPI_API_URL}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${WOMPI_PRIVATE_KEY}` },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    console.log('Wompi nequi response:', JSON.stringify(data));

    if (!response.ok) {
      return new Response(JSON.stringify({ error: data.error ? JSON.stringify(data.error) : data.message || 'Error Nequi' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Registrar el intento (no bloquea la respuesta al usuario si falla)
    if (userId && eventId) {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        await supabase.from('payment_attempts').insert({
          user_id: userId,
          event_id: eventId,
          transaction_id: data.data?.id,
          payment_method: 'nequi',
          status: data.data?.status || 'PENDING',
          amount: amountCOP,
        });
      } catch (e) { console.error('Error registrando payment_attempt:', e); }
    }

    return new Response(JSON.stringify({
      transactionId: data.data?.id,
      status: data.data?.status,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
