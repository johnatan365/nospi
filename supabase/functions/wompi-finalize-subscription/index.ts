// Supabase Edge Function: wompi-finalize-subscription
// Se llama despues de que el usuario vuelve de completar una verificacion 3DS
// (redirect_url). Consulta el estado FINAL de la transaccion en Wompi y, si
// quedo APPROVED, activa la suscripcion (mismo upsert que wompi-create-subscription).
// No crea ninguna transaccion nueva, solo lee el resultado de una que ya existe.
//
// v5 (noviembre de 2026): ya no se le cree al body. Antes cualquiera con la
// llave publica podia mandar el id de CUALQUIER transaccion aprobada (incluso
// el pago de un evento), el userId que quisiera y planType '6_months', y salia
// una suscripcion de 6 meses. Ahora:
//   - la transaccion tiene que ser de suscripcion (nospi_sub_{userId}_...) y
//     de la misma persona que manda el body;
//   - el plan sale de lo que se PAGO, no de planType;
//   - la misma transaccion no vuelve a correr el periodo (antes, llamar dos
//     veces volvia a empezar la suscripcion desde hoy);
//   - el medio de pago guardado sale de la transaccion, no del body.
// El body mantiene la misma forma para que las versiones actuales de la app
// sigan funcionando sin OTA.
//
// Ojo: esta funcion debe mantenerse en sintonia con wompi-create-subscription;
// las dos escriben la misma fila de subscriptions.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const WOMPI_API_URL = 'https://production.wompi.co/v1';
const SUPABASE_URL = 'https://wjdiraurfbawotlcndmk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

type Plan = { clave: '1_month' | '3_months' | '6_months'; meses: number; configKey: string };

// De mayor a menor: si lo pagado no coincide exacto con ningun precio (porque
// el precio cambio entre el cobro y este momento), se da el plan mas largo que
// alcance a cubrir lo pagado. Nunca uno mas largo de lo que se pago.
const PLANES: Plan[] = [
  { clave: '6_months', meses: 6, configKey: 'subscription_price_6m' },
  { clave: '3_months', meses: 3, configKey: 'subscription_price_3m' },
  { clave: '1_month',  meses: 1, configKey: 'subscription_price' },
];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// Mismo formato que wompi-create-subscription y wompi-webhook:
// nospi_sub_{userId}_{timestamp}. Las renovaciones (nospi_subrenew_) no pasan
// por aqui: las procesa el cron/webhook.
function userIdDeReferencia(reference: unknown): string | null {
  if (typeof reference !== 'string' || !reference.startsWith('nospi_sub_')) return null;
  const resto = reference.slice('nospi_sub_'.length);
  const corte = resto.lastIndexOf('_');
  if (corte <= 0) return null;
  return resto.slice(0, corte);
}

function addMonths(d: Date, n: number): Date {
  const nd = new Date(d);
  nd.setMonth(nd.getMonth() + n);
  return nd;
}

// deno-lint-ignore no-explicit-any
async function planPorMontoPagado(supabase: any, pagadoCOP: number): Promise<(Plan & { precio: number }) | null> {
  const { data } = await supabase
    .from('app_config')
    .select('key, value')
    .in('key', PLANES.map((p) => p.configKey));
  const precios = new Map<string, number>();
  for (const fila of data ?? []) {
    const n = parseInt(String(fila.value), 10);
    if (Number.isFinite(n) && n > 0) precios.set(fila.key, n);
  }
  const conPrecio = PLANES
    .filter((p) => precios.has(p.configKey))
    .map((p) => ({ ...p, precio: precios.get(p.configKey)! }));

  const exacto = conPrecio.find((p) => p.precio === pagadoCOP);
  if (exacto) return exacto;
  return conPrecio.find((p) => p.precio <= pagadoCOP) ?? null;
}

const ADMIN_EMAIL = 'nospisocial@gmail.com';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';

// Mismo aviso que en wompi-create-subscription: si el cobro paso pero la
// suscripcion no se guardo, el admin tiene que enterarse de una, no por el
// reclamo de la persona.
async function avisarAdminCobroSinSuscripcion(
  datos: { userId: string; userEmail: string; transactionId: string; price: number; motivo: string },
): Promise<void> {
  if (!RESEND_API_KEY) return;
  const texto = [
    'Se cobro una suscripcion en Wompi pero NO se pudo guardar en la base de datos.',
    '',
    'Funcion: wompi-finalize-subscription',
    `Usuario: ${datos.userEmail} (${datos.userId})`,
    `Transaccion Wompi: ${datos.transactionId}`,
    `Valor: $${Number(datos.price).toLocaleString('es-CO')} COP`,
    `Motivo: ${datos.motivo}`,
    '',
    'La persona YA pago. Hay que crearle la suscripcion a mano o devolverle la plata.',
  ].join('\n');
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Nospi <noreply@nospi.co>',
        to: [ADMIN_EMAIL],
        subject: 'URGENTE: cobro de suscripcion sin suscripcion creada',
        text: texto,
      }),
    });
  } catch (e) {
    console.error('wompi-finalize-subscription: no se pudo avisar al admin:', e);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { transactionId, userId, userEmail } = await req.json();

    if (typeof transactionId !== 'string' || !transactionId || typeof userId !== 'string' || !userId) {
      return json({ error: 'Faltan parámetros' }, 400);
    }

    const txRes = await fetch(`${WOMPI_API_URL}/transactions/${encodeURIComponent(transactionId)}`);
    const txData = await txRes.json().catch(() => null);
    const tx = txData?.data;
    const txStatus = tx?.status;

    if (!txRes.ok || !tx) {
      return json({ error: 'No se pudo verificar la transacción', status: 'ERROR' });
    }

    if (txStatus === 'DECLINED' || txStatus === 'ERROR' || txStatus === 'VOIDED') {
      return json({ status: txStatus, error: tx.status_message || 'Pago rechazado' });
    }

    if (txStatus !== 'APPROVED') {
      // Sigue PENDING
      return json({ status: txStatus });
    }

    // La transaccion tiene que ser el cobro de suscripcion de ESTA persona.
    if (userIdDeReferencia(tx.reference) !== userId) {
      console.warn('wompi-finalize-subscription: transaccion ajena o que no es de suscripcion', JSON.stringify({ tx: tx.id, reference: tx.reference, userId }));
      return json({ error: 'Esta transacción no corresponde a tu suscripción', status: 'ERROR' }, 403);
    }

    // El perfil (tabla users) tiene que existir: subscriptions tiene una llave
    // foranea contra users. Si no existe, el upsert de abajo falla y el cobro
    // queda sin suscripcion. Se avisa al admin en vez de responder APPROVED.
    const { data: perfil } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .maybeSingle();
    if (!perfil) {
      console.error('wompi-finalize-subscription: pago aprobado de alguien sin perfil creado', userId);
      await avisarAdminCobroSinSuscripcion({
        userId,
        userEmail: tx.customer_email || userEmail || '',
        transactionId: tx.id,
        price: Math.round(Number(tx.amount_in_cents || 0) / 100),
        motivo: 'El usuario no tiene fila en la tabla users (perfil sin completar)',
      });
      return json({
        status: 'GUARDADO_FALLIDO',
        error: 'Tu pago quedó registrado pero falta completar tu perfil para activar la suscripción. Ya avisamos a soporte.',
      });
    }

    // Ya procesada (por una llamada anterior o por el webhook): no se vuelve a
    // empezar el periodo desde hoy.
    const { data: actual } = await supabase
      .from('subscriptions')
      .select('plan_type, price, next_charge_date, last_charge_transaction_id, wompi_payment_source_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (actual && actual.last_charge_transaction_id === tx.id) {
      return json({
        status: 'APPROVED',
        transactionId: tx.id,
        planType: actual.plan_type,
        price: actual.price,
        nextChargeDate: actual.next_charge_date,
      });
    }

    // El plan sale de lo que se pago.
    const pagadoCOP = Math.round(Number(tx.amount_in_cents || 0) / 100);
    const plan = await planPorMontoPagado(supabase, pagadoCOP);
    if (!plan) {
      console.error('wompi-finalize-subscription: lo pagado no alcanza para ningun plan', JSON.stringify({ tx: tx.id, userId, pagadoCOP }));
      return json({ error: 'El valor pagado no corresponde a ningún plan. Escríbenos por soporte.', status: 'ERROR' }, 409);
    }

    const now = new Date();
    const nextCharge = addMonths(now, plan.meses);

    const { error: upsertError } = await supabase.from('subscriptions').upsert(
      {
        user_id: userId,
        plan_type: plan.clave,
        price: plan.precio,
        status: 'active',
        start_date: now.toISOString(),
        end_date: nextCharge.toISOString(),
        next_charge_date: nextCharge.toISOString(),
        payment_method: 'card',
        auto_renew: true,
        // El medio de pago con el que de verdad se cobro, no uno del body: el
        // cron de renovaciones cobra a este id.
        wompi_payment_source_id: tx.payment_source_id || actual?.wompi_payment_source_id || null,
        wompi_customer_email: tx.customer_email || userEmail || '',
        last_charge_transaction_id: tx.id,
        last_charge_status: txStatus,
        failed_charge_count: 0,
        updated_at: now.toISOString(),
      },
      { onConflict: 'user_id' },
    );

    if (upsertError) {
      // OJO: aca NO se puede responder status 'APPROVED'. La app manda el
      // correo de "tu suscripcion ya esta activa" en cuanto ve APPROVED, asi
      // que devolverlo con el guardado fallido le avisa a la persona que tiene
      // algo que en realidad no tiene. Con un status desconocido la app lo
      // trata como pendiente y no manda nada.
      console.error('wompi-finalize-subscription: error guardando suscripción', upsertError.message);
      await avisarAdminCobroSinSuscripcion({
        userId,
        userEmail: tx.customer_email || userEmail || '',
        transactionId: tx.id,
        price: plan.precio,
        motivo: upsertError.message,
      });
      return json({
        status: 'GUARDADO_FALLIDO',
        error: 'Tu pago quedó registrado pero no pudimos activar la suscripción. Ya avisamos a soporte.',
      });
    }

    return json({ status: 'APPROVED', transactionId: tx.id, planType: plan.clave, price: plan.precio, nextChargeDate: nextCharge.toISOString() });
  } catch (error) {
    console.error('wompi-finalize-subscription error:', error);
    return json({ error: 'Error interno', status: 'ERROR' }, 500);
  }
});
