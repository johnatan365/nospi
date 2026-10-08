// Supabase Edge Function: wompi-bancolombia-payment
// Fix: acceptance_token_personal_auth -> acceptance_token_personal_data_auth (correct Wompi field name)
// Ahora tambien registra cada intento (exitoso o no) en payment_attempts.
// Fix: ecommerce_url apuntaba a https://johnatan365.github.io/nospi-redirect,
// que es un 404 (GitHub Pages sin publicar). Se cambia al mismo callback que
// ya usa el pago con tarjeta, para que el usuario vuelva a una pagina real.

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

async function logAttempt(userId: string, eventId: string, transactionId: string | undefined, status: string, amountCOP: number) {
  if (!userId || !eventId) return;
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    await supabase.from('payment_attempts').insert({
      user_id: userId, event_id: eventId, transaction_id: transactionId,
      payment_method: 'bancolombia', status, amount: amountCOP,
    });
  } catch (e) { console.error('Error registrando payment_attempt:', e); }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { acceptanceToken, personalDataToken, amountCOP, userEmail, userId, eventId, redirectUrl } = await req.json();
    if (!acceptanceToken || !amountCOP || !userEmail)
      return new Response(JSON.stringify({ error: 'Faltan parámetros' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const reference = `nospi_banc_${userId}_${eventId}_${Date.now()}`;
    const amountInCents = amountCOP * 100;
    const signature = await generateSignature(reference, amountInCents, 'COP');

    const ecommerceUrl = redirectUrl || 'https://app.nospi.co/payment-callback';
    console.log('Bancolombia payment - Using redirect URL:', ecommerceUrl);

    const body: any = {
      acceptance_token: acceptanceToken,
      amount_in_cents: amountInCents,
      currency: 'COP',
      signature,
      customer_email: userEmail,
      reference,
      payment_method: {
        type: 'BANCOLOMBIA_TRANSFER',
        user_type: 'PERSON',
        payment_description: 'Pago evento Nospi',
        ecommerce_url: ecommerceUrl,
      },
    };
    if (personalDataToken) body.acceptance_token_personal_data_auth = personalDataToken;

    const response = await fetch(`${WOMPI_API_URL}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${WOMPI_PRIVATE_KEY}` },
      body: JSON.stringify(body),
    });
    const data = await response.json();

    if (!response.ok) {
      await logAttempt(userId, eventId, undefined, 'ERROR', amountCOP);
      return new Response(JSON.stringify({ error: data.error ? JSON.stringify(data.error) : data.message || 'Error Bancolombia' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const transactionId = data.data?.id;

    let asyncPaymentUrl = data.data?.payment_method?.extra?.async_payment_url;

    if (!asyncPaymentUrl) {
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const pollRes = await fetch(`${WOMPI_API_URL}/transactions/${transactionId}`, {
          headers: { 'Authorization': `Bearer ${WOMPI_PRIVATE_KEY}` }
        });
        const pollData = await pollRes.json();
        asyncPaymentUrl = pollData.data?.payment_method?.extra?.async_payment_url;
        console.log(`Polling ${i+1}: status=${pollData.data?.status}, url=${asyncPaymentUrl}`);
        if (asyncPaymentUrl) break;
        if (['DECLINED', 'ERROR', 'VOIDED'].includes(pollData.data?.status)) {
          await logAttempt(userId, eventId, transactionId, pollData.data?.status, amountCOP);
          return new Response(JSON.stringify({ error: 'Pago rechazado por Bancolombia' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }
    }

    if (!asyncPaymentUrl) {
      await logAttempt(userId, eventId, transactionId, 'ERROR', amountCOP);
      return new Response(JSON.stringify({ error: 'No se obtuvo URL de Bancolombia. Intenta de nuevo.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    await logAttempt(userId, eventId, transactionId, data.data?.status || 'PENDING', amountCOP);

    return new Response(JSON.stringify({
      transactionId,
      status: data.data?.status,
      redirectUrl: asyncPaymentUrl,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
