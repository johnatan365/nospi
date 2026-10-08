// Supabase Edge Function: wompi-pse-payment
// Fix: acceptance_token_personal_auth -> acceptance_token_personal_data_auth (correct Wompi field name)
// Ahora tambien registra cada intento (exitoso o no) en payment_attempts.
// Fix: redirect_url apuntaba a https://johnatan365.github.io/nospi-redirect,
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const {
      acceptanceToken,
      personalDataToken,
      amountCOP,
      userEmail,
      userId,
      eventId,
      userFullName,
      userPhone,
      userLegalId,
      userLegalIdType = 'CC',
      financialInstitutionCode,
      redirectUrl,
    } = await req.json();

    if (!acceptanceToken || !amountCOP || !userEmail || !userFullName || !userPhone || !userLegalId || !financialInstitutionCode)
      return new Response(JSON.stringify({ error: 'Faltan parámetros requeridos para PSE' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    const reference = `nospi_pse_${userId}_${eventId}_${Date.now()}`;
    const amountInCents = amountCOP * 100;
    const signature = await generateSignature(reference, amountInCents, 'COP');

    const finalRedirectUrl = redirectUrl || 'https://app.nospi.co/payment-callback';
    console.log('PSE payment - Using redirect URL:', finalRedirectUrl);

    const body: any = {
      acceptance_token: acceptanceToken,
      amount_in_cents: amountInCents,
      currency: 'COP',
      signature,
      customer_email: userEmail,
      reference,
      customer_data: {
        phone_number: userPhone,
        full_name: userFullName,
        legal_id: userLegalId,
        legal_id_type: userLegalIdType,
      },
      payment_method: {
        type: 'PSE',
        user_type: userLegalIdType === 'NIT' ? 1 : 0,
        user_legal_id_type: userLegalIdType,
        user_legal_id: userLegalId,
        financial_institution_code: financialInstitutionCode,
        payment_description: 'Pago evento Nospi',
      },
      redirect_url: finalRedirectUrl,
    };

    if (personalDataToken) body.acceptance_token_personal_data_auth = personalDataToken;

    const response = await fetch(`${WOMPI_API_URL}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${WOMPI_PRIVATE_KEY}` },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    console.log('Wompi PSE response:', JSON.stringify(data));

    if (!response.ok) {
      // Registrar tambien los intentos que fallan de una al crear la transaccion
      if (userId && eventId) {
        try {
          const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
          await supabase.from('payment_attempts').insert({
            user_id: userId, event_id: eventId, payment_method: 'pse', status: 'ERROR', amount: amountCOP,
          });
        } catch (e) { console.error('Error registrando payment_attempt:', e); }
      }
      return new Response(JSON.stringify({ error: data.error ? JSON.stringify(data.error) : data.message || 'Error PSE' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let pseRedirectUrl =
      data.data?.payment_method_extra?.async_payment_url ||
      data.data?.payment_method?.extra?.async_payment_url ||
      data.data?.payment_method?.extra?.pseURL ||
      null;

    if (!pseRedirectUrl && data.data?.id) {
      console.log('PSE URL not in POST, polling transaction...');
      for (let i = 1; i <= 3; i++) {
        await new Promise(resolve => setTimeout(resolve, i * 2000));
        const txRes = await fetch(`${WOMPI_API_URL}/transactions/${data.data.id}`, {
          headers: { 'Authorization': `Bearer ${WOMPI_PRIVATE_KEY}` },
        });
        const txData = await txRes.json();
        console.log(`PSE GET attempt ${i}:`, JSON.stringify(txData?.data?.payment_method?.extra));
        pseRedirectUrl =
          txData.data?.payment_method_extra?.async_payment_url ||
          txData.data?.payment_method?.extra?.async_payment_url ||
          txData.data?.payment_method?.extra?.pseURL ||
          null;
        if (pseRedirectUrl && pseRedirectUrl.length > 10) break;
      }
    }

    if (!pseRedirectUrl) {
      if (userId && eventId) {
        try {
          const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
          await supabase.from('payment_attempts').insert({
            user_id: userId, event_id: eventId, transaction_id: data.data?.id, payment_method: 'pse', status: 'ERROR', amount: amountCOP,
          });
        } catch (e) { console.error('Error registrando payment_attempt:', e); }
      }
      return new Response(JSON.stringify({ error: 'No se obtuvo URL de PSE', raw: data }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Registrar el intento (transaccion creada correctamente, aun pendiente)
    if (userId && eventId) {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        await supabase.from('payment_attempts').insert({
          user_id: userId, event_id: eventId, transaction_id: data.data?.id,
          payment_method: 'pse', status: data.data?.status || 'PENDING', amount: amountCOP,
        });
      } catch (e) { console.error('Error registrando payment_attempt:', e); }
    }

    return new Response(JSON.stringify({
      transactionId: data.data?.id,
      status: data.data?.status,
      redirectUrl: pseRedirectUrl,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
