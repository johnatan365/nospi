// Supabase Edge Function: wompi-finalize-subscription
// Se llama despues de que el usuario vuelve de completar una verificacion 3DS
// (redirect_url). Consulta el estado FINAL de la transaccion en Wompi y, si
// quedo APPROVED, activa la suscripcion (mismo upsert que wompi-create-subscription).
// No crea ninguna transaccion nueva, solo lee el resultado de una que ya existe.
//
// v4: PLANES DE 1, 3 Y 6 MESES. Antes el precio salia siempre de
// app_config.subscription_price y el periodo era addOneMonth() fijo, aunque la
// app mandara planType. Ahora ambos salen del plan. Un planType desconocido
// cae a '1_month' — cobrar de menos se corrige, regalar 6 meses no.
//
// Ojo: esta funcion debe mantenerse en sintonia con wompi-create-subscription;
// las dos escriben la misma fila de subscriptions.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const WOMPI_API_URL = 'https://production.wompi.co/v1';
const SUPABASE_URL = 'https://wjdiraurfbawotlcndmk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const PLANES: Record<string, { meses: number; configKey: string; respaldo: number }> = {
  '1_month':  { meses: 1, configKey: 'subscription_price',    respaldo: 29900 },
  '3_months': { meses: 3, configKey: 'subscription_price_3m', respaldo: 74900 },
  '6_months': { meses: 6, configKey: 'subscription_price_6m', respaldo: 125900 },
};
const PLAN_POR_DEFECTO = '1_month';

function resolverPlan(planType: unknown) {
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { transactionId, userId, userEmail, paymentSourceId, planType } = await req.json();

    if (!transactionId || !userId) {
      return new Response(JSON.stringify({ error: 'Faltan parámetros' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const txRes = await fetch(`${WOMPI_API_URL}/transactions/${transactionId}`);
    const txData = await txRes.json();
    const txStatus = txData?.data?.status;

    if (!txRes.ok) {
      return new Response(JSON.stringify({ error: 'No se pudo verificar la transacción', status: 'ERROR' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (txStatus === 'DECLINED' || txStatus === 'ERROR' || txStatus === 'VOIDED') {
      return new Response(
        JSON.stringify({ status: txStatus, error: txData?.data?.status_message || 'Pago rechazado' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (txStatus !== 'APPROVED') {
      // Sigue PENDING
      return new Response(JSON.stringify({ status: txStatus }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // APROBADO: activar la suscripcion segun el plan elegido.
    const plan = resolverPlan(planType);

    const { data: priceRow } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', plan.configKey)
      .maybeSingle();
    const parsed = Number(priceRow?.value);
    const price = Number.isFinite(parsed) && parsed > 0 ? parsed : plan.respaldo;

    const resolvedPaymentSourceId = paymentSourceId || txData?.data?.payment_source_id || null;

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
        wompi_payment_source_id: resolvedPaymentSourceId,
        wompi_customer_email: userEmail || txData?.data?.customer_email || '',
        last_charge_transaction_id: txData.data.id,
        last_charge_status: txStatus,
        failed_charge_count: 0,
        updated_at: now.toISOString(),
      },
      { onConflict: 'user_id' },
    );

    if (upsertError) {
      console.error('wompi-finalize-subscription: error guardando suscripción', upsertError.message);
      return new Response(JSON.stringify({ error: 'Pago aprobado pero no se pudo guardar la suscripción', status: 'APPROVED' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({ status: 'APPROVED', transactionId: txData.data.id, planType: plan.clave, price, nextChargeDate: nextCharge.toISOString() }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: any) {
    console.error('wompi-finalize-subscription error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
