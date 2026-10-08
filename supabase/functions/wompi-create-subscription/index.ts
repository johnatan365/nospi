// Supabase Edge Function: wompi-create-subscription
//
// v7: PLANES DE 1, 3 Y 6 MESES.
// Antes el precio salia siempre de app_config.subscription_price y el periodo
// era siempre addOneMonth(), sin importar el planType que mandara la app. Eso
// significaba que un plan de 3 meses se habria cobrado cada mes al precio de
// uno. Ahora el precio Y el periodo salen de la tabla PLANES de abajo.
//
// Regla de seguridad: un planType desconocido cae a '1_month'. Nunca al reves.
// Cobrar 1 mes cuando pidieron 3 es un error recuperable (se devuelve la plata);
// dar 6 meses de acceso cobrando 1 mes no se recupera.
//
// v6: el campo txData.data.redirect_url es solo el ECO de nuestro propio
// redirect_url enviado en la peticion, NO una URL real de verificacion 3DS.
// Usarlo como threeDsUrl causaba un redirect inmediato sin desafio real.
// Ahora solo se confia en payment_method.extra.async_payment_url o
// payment_method.extra.threeDsAuth.url (URLs genuinas de desafio).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const WOMPI_PRIVATE_KEY = 'prv_prod_r8NTduTEKXxzoLZv302Gw4i9jC0lerlK';
const WOMPI_INTEGRITY_KEY = 'prod_integrity_0jyUS7YAMjKTmrIF7A0z8094tZlMItoH';
const WOMPI_API_URL = 'https://production.wompi.co/v1';
const SUPABASE_URL = 'https://wjdiraurfbawotlcndmk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const DEFAULT_REDIRECT_URL = 'https://app.nospi.co/payment-callback';

// Definicion de los planes. configKey apunta a la llave de app_config con el
// precio; respaldo es lo que se usa SOLO si esa llave falta o trae basura.
const PLANES: Record<string, { meses: number; configKey: string; respaldo: number }> = {
  '1_month':  { meses: 1, configKey: 'subscription_price',    respaldo: 29900 },
  '3_months': { meses: 3, configKey: 'subscription_price_3m', respaldo: 74900 },
  '6_months': { meses: 6, configKey: 'subscription_price_6m', respaldo: 125900 },
};
const PLAN_POR_DEFECTO = '1_month';

function resolverPlan(planType: unknown): { clave: string; meses: number; configKey: string; respaldo: number } {
  const clave = typeof planType === 'string' && PLANES[planType] ? planType : PLAN_POR_DEFECTO;
  return { clave, ...PLANES[clave] };
}

function addMonths(d: Date, n: number): Date {
  const nd = new Date(d);
  nd.setMonth(nd.getMonth() + n);
  return nd;
}

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

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const {
      cardToken,
      acceptanceToken,
      personalDataToken,
      userId,
      userEmail,
      planType,
      redirectUrl,
    } = await req.json();

    if (!cardToken || !acceptanceToken || !userId || !userEmail) {
      return new Response(JSON.stringify({ error: 'Faltan parámetros' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const plan = resolverPlan(planType);

    const { data: priceRow } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', plan.configKey)
      .maybeSingle();
    const parsed = Number(priceRow?.value);
    const price = Number.isFinite(parsed) && parsed > 0 ? parsed : plan.respaldo;
    const amountInCents = Math.round(price * 100);

    const sourceBody: Record<string, unknown> = {
      type: 'CARD',
      token: cardToken,
      customer_email: userEmail,
      acceptance_token: acceptanceToken,
    };
    if (personalDataToken) sourceBody.acceptance_token_personal_data_auth = personalDataToken;

    const sourceRes = await fetch(`${WOMPI_API_URL}/payment_sources`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${WOMPI_PRIVATE_KEY}`,
      },
      body: JSON.stringify(sourceBody),
    });
    const sourceData = await sourceRes.json();

    if (!sourceRes.ok || !sourceData?.data?.id) {
      console.error('wompi-create-subscription: error creando payment_source', JSON.stringify(sourceData));
      return new Response(
        JSON.stringify({
          error: sourceData.error?.messages
            ? Object.values(sourceData.error.messages).flat().join(', ')
            : (sourceData.error ? JSON.stringify(sourceData.error) : 'No se pudo guardar el medio de pago'),
          stage: 'payment_source',
          bankResponse: sourceData,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const paymentSourceId = sourceData.data.id;
    const sourceStatus = sourceData.data.status;

    if (sourceStatus && sourceStatus !== 'AVAILABLE') {
      console.error('wompi-create-subscription: payment_source no disponible', JSON.stringify(sourceData));
      return new Response(
        JSON.stringify({
          error: `El banco no habilitó la tarjeta para pagos recurrentes (estado: ${sourceStatus}).`,
          stage: 'payment_source_status',
          bankResponse: sourceData,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const reference = `nospi_sub_${userId}_${Date.now()}`;
    const signature = await generateSignature(reference, amountInCents, 'COP');

    const txRes = await fetch(`${WOMPI_API_URL}/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${WOMPI_PRIVATE_KEY}`,
      },
      body: JSON.stringify({
        acceptance_token: acceptanceToken,
        amount_in_cents: amountInCents,
        currency: 'COP',
        signature,
        customer_email: userEmail,
        reference,
        payment_source_id: paymentSourceId,
        payment_method: {
          installments: 1,
        },
        redirect_url: redirectUrl || DEFAULT_REDIRECT_URL,
      }),
    });
    const txData = await txRes.json();
    const txStatus = txData?.data?.status;

    if (!txRes.ok || txStatus === 'DECLINED' || txStatus === 'ERROR' || txStatus === 'VOIDED') {
      console.error('wompi-create-subscription: cobro inicial rechazado', JSON.stringify(txData));
      return new Response(
        JSON.stringify({
          error: txData?.data?.status_message || (txData?.error ? JSON.stringify(txData.error) : 'Pago rechazado'),
          status: txStatus,
          stage: 'transaction',
          bankResponse: txData,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (txStatus !== 'APPROVED') {
      // Solo confiar en URLs REALES de desafio 3DS. txData.data.redirect_url es
      // apenas el eco de lo que nosotros mismos enviamos, no un desafio real.
      const threeDsUrl =
        txData?.data?.payment_method?.extra?.async_payment_url ||
        txData?.data?.payment_method?.extra?.threeDsAuth?.url ||
        txData?.data?.payment_method?.extra?.external_url ||
        null;
      console.log('wompi-create-subscription: transacción en estado intermedio', txStatus, JSON.stringify(txData));
      return new Response(
        JSON.stringify({
          status: txStatus,
          transactionId: txData?.data?.id,
          paymentSourceId,
          threeDsUrl,
          bankResponse: txData,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const now = new Date();
    const nextCharge = addMonths(now, plan.meses);

    const { error: upsertError } = await supabase.from('subscriptions').upsert(
      {
        user_id: userId,
        plan_type: plan.clave,
        price,
        status: 'active',
        start_date: now.toISOString(),
        end_date: nextCharge.toISOString(),
        next_charge_date: nextCharge.toISOString(),
        payment_method: 'card',
        auto_renew: true,
        wompi_payment_source_id: paymentSourceId,
        wompi_customer_email: userEmail,
        last_charge_transaction_id: txData.data.id,
        last_charge_status: txStatus,
        failed_charge_count: 0,
        updated_at: now.toISOString(),
      },
      { onConflict: 'user_id' },
    );

    if (upsertError) {
      console.error('wompi-create-subscription: error guardando suscripción', upsertError.message);
      return new Response(JSON.stringify({ error: 'Pago aprobado pero no se pudo guardar la suscripción' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({ status: txStatus, transactionId: txData.data.id, planType: plan.clave, price, nextChargeDate: nextCharge.toISOString() }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: any) {
    console.error('wompi-create-subscription error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
