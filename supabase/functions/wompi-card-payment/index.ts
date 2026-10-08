// Supabase Edge Function: wompi-card-payment
// Fix WS02: ensure installments is always an integer, amountInCents is always an integer,
// and log the full request body sent to Wompi for debugging.
// Ahora tambien registra cada intento (exitoso o no) en payment_attempts.

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
      payment_method: 'card', status, amount: amountCOP,
    });
  } catch (e) { console.error('Error registrando payment_attempt:', e); }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const {
      cardToken,
      acceptanceToken,
      personalDataToken,
      installments,
      amountCOP,
      userEmail,
      userId,
      eventId,
      redirectUrl,
    } = await req.json();

    if (!cardToken || !acceptanceToken || !amountCOP || !userEmail)
      return new Response(
        JSON.stringify({ error: 'Faltan parámetros' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    const reference = `nospi_card_${userId}_${eventId}_${Date.now()}`;
    const amountInCents = Math.round(Number(amountCOP) * 100);
    const installmentsInt = Math.max(1, Math.round(Number(installments) || 1));
    const signature = await generateSignature(reference, amountInCents, 'COP');

    const body: Record<string, unknown> = {
      acceptance_token: acceptanceToken,
      amount_in_cents: amountInCents,
      currency: 'COP',
      signature,
      customer_email: userEmail,
      reference,
      payment_method: {
        type: 'CARD',
        installments: installmentsInt,
        token: cardToken,
      },
      redirect_url: redirectUrl || 'https://app.nospi.co/payment-callback',
    };

    if (personalDataToken) body.acceptance_token_personal_data_auth = personalDataToken;

    const response = await fetch(`${WOMPI_API_URL}/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${WOMPI_PRIVATE_KEY}`,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    console.log('wompi-card-payment: Wompi HTTP status:', response.status, '| tx status:', data.data?.status, '| tx id:', data.data?.id);

    if (!response.ok) {
      await logAttempt(userId, eventId, undefined, 'ERROR', amountCOP);
      return new Response(
        JSON.stringify({ error: data.error ? JSON.stringify(data.error) : data.message || 'Error al procesar pago' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (data.data?.status === 'DECLINED' || data.data?.status === 'ERROR' || data.data?.status === 'VOIDED') {
      const declineReason = data.data?.status_message || data.data?.status || 'Tarjeta rechazada';
      await logAttempt(userId, eventId, data.data?.id, data.data?.status, amountCOP);
      return new Response(
        JSON.stringify({
          error: declineReason,
          status: data.data?.status,
          transactionId: data.data?.id,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await logAttempt(userId, eventId, data.data?.id, data.data?.status || 'PENDING', amountCOP);

    const threeDsUrl: string | null =
      data.data?.payment_method?.extra?.async_payment_url ??
      data.data?.redirect_url ??
      null;

    return new Response(
      JSON.stringify({
        status: data.data?.status,
        transactionId: data.data?.id,
        message: data.data?.status,
        redirectUrl: threeDsUrl,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('wompi-card-payment error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
