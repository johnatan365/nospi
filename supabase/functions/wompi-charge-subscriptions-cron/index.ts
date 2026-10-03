// Supabase Edge Function: wompi-charge-subscriptions-cron
// Cobra automaticamente las suscripciones activas cuyo next_charge_date ya paso,
// usando el payment_source_id guardado en Wompi (sin pedirle la tarjeta de nuevo
// al usuario). Disparada diariamente por pg_cron.
// verify_jwt=false porque la invoca pg_cron/pg_net, no un usuario logueado:
// se protege con un secreto compartido en el header x-cron-secret.
//
// v15: SOLO TEXTOS DE LOS DOS CORREOS DE COBRO FALLIDO. El texto viejo nunca
// decia que NO se habia cobrado nada, no mencionaba el monto, y la frase "tu
// suscripcion se desactivara automaticamente" sonaba a amenaza cuando en
// realidad es la salida suave. Un suscriptor real (3 oct 2026) lo leyo como si
// le estuvieran cobrando y escribio alarmado por WhatsApp. NO se toco nada de
// la logica de cobro ni de fechas.
//
// v14: SOLO TEXTOS DE CORREO. El aviso al admin de una renovacion cobrada era el
// unico de los seis sin emoji y sin el nombre de la persona (decia solo
// "Renovacion cobrada: correo@x.com"), asi que se perdia en la bandeja y el
// dueno creia que no le llegaba nada cuando alguien renovaba. Ahora lleva emoji,
// nombre y plan, igual que los demas avisos. NO se toco nada de la logica de
// cobro ni de fechas.
//
// v11: PLANES DE 1, 3 Y 6 MESES.
// Antes la renovacion avanzaba next_charge_date con addOneMonth() SIEMPRE, sin
// mirar plan_type. Con planes de 3 y 6 meses eso habria cobrado cada mes el
// precio del plan completo. Ahora el periodo sale de plan_type.
// El monto NO cambia: sigue saliendo de sub.price, congelado al suscribirse.
//
// v10: cuando una renovacion FALLA (o la suscripcion se desactiva tras varios
// intentos), ademas del correo al suscriptor se avisa al ADMIN.
// v9: la lista de eventos del correo se filtra por GENERO del suscriptor.
// v8: el correo de renovacion exitosa muestra los proximos eventos del mes.
// v6: los correos al suscriptor tienen version HTML con marca Nospi.
// v3: FIX - solo un status realmente APPROVED avanza next_charge_date.
// v2: FIX - payment_source_id debe ir en el nivel raiz del body.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const WOMPI_PRIVATE_KEY = 'prv_prod_r8NTduTEKXxzoLZv302Gw4i9jC0lerlK';
const WOMPI_INTEGRITY_KEY = 'prod_integrity_0jyUS7YAMjKTmrIF7A0z8094tZlMItoH';
const WOMPI_API_URL = 'https://production.wompi.co/v1';
const SUPABASE_URL = 'https://wjdiraurfbawotlcndmk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const CRON_SECRET = 'vNaLuI2S0SwQzCxXgO6WEKMp5RaBamOAOog6AJCNyq4';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const ADMIN_EMAIL = 'nospisocial@gmail.com';
const MAX_FAILED_ATTEMPTS = 3;
const APP_URL = 'https://app.nospi.co';

// Cuantos meses suma cada plan a next_charge_date. Un plan desconocido cuenta
// como 1 mes: cobrar antes de tiempo se corrige devolviendo; regalar meses no.
const MESES_POR_PLAN: Record<string, number> = {
  '1_month': 1,
  '3_months': 3,
  '6_months': 6,
};
const PLAN_LABEL: Record<string, string> = {
  '1_month': 'Mensual',
  '3_months': '3 meses',
  '6_months': '6 meses',
};
function mesesDelPlan(planType: unknown): number {
  return (typeof planType === 'string' && MESES_POR_PLAN[planType]) || 1;
}
function etiquetaPlan(planType: unknown): string {
  return (typeof planType === 'string' && PLAN_LABEL[planType]) || 'Mensual';
}

async function generateSignature(reference: string, amountInCents: number, currency: string): Promise<string> {
  const data = `${reference}${amountInCents}${currency}${WOMPI_INTEGRITY_KEY}`;
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function addMonths(d: Date, n: number): Date {
  const nd = new Date(d);
  nd.setMonth(nd.getMonth() + n);
  return nd;
}

function addOneDay(d: Date): Date {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + 1);
  return nd;
}

function markFailure(now: Date, sub: any) {
  const failedCount = (sub.failed_charge_count || 0) + 1;
  const expired = failedCount >= MAX_FAILED_ATTEMPTS;
  return {
    failed_charge_count: failedCount,
    status: expired ? 'expired' : 'active',
    auto_renew: expired ? false : true,
    next_charge_date: expired ? sub.next_charge_date : addOneDay(now).toISOString(),
    updated_at: now.toISOString(),
    expired,
    failedCount,
  };
}

function wrapBrandedHtml(bodyHtml: string, ctaUrl?: string, ctaLabel?: string): string {
  const ctaBlock = ctaUrl && ctaLabel ? `
    <tr>
      <td style="padding: 4px 32px 8px;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
          <tr>
            <td style="background-color:#AD1457; border-radius:10px;">
              <a href="${ctaUrl}" style="display:inline-block; padding:14px 28px; color:#ffffff; text-decoration:none; font-weight:bold; font-size:15px; font-family: -apple-system, Helvetica, Arial, sans-serif;">${ctaLabel}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>` : '';
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0; padding:0; background-color:#f4f0f2;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f0f2; padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:16px; overflow:hidden; font-family: -apple-system, Helvetica, Arial, sans-serif;">
          <tr>
            <td style="background-color:#880E4F; padding:24px 32px; text-align:center;">
              <img src="https://wjdiraurfbawotlcndmk.supabase.co/storage/v1/object/public/branding/icon-small.png" width="72" height="72" alt="Nospi" style="display:inline-block; width:72px; height:72px; border-radius:16px; border:0;" />
            </td>
          </tr>
          <tr>
            <td style="padding: 30px 32px 8px;">
              ${bodyHtml}
            </td>
          </tr>
          ${ctaBlock}
          <tr>
            <td style="padding: 8px 32px 30px;"></td>
          </tr>
          <tr>
            <td style="background-color:#faf7f8; padding:18px 32px; text-align:center; border-top:1px solid #eee;">
              <p style="margin:0; font-size:12px; color:#9ca3af; font-family: -apple-system, Helvetica, Arial, sans-serif;">Equipo Nospi · app.nospi.co</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function htmlParagraph(txt: string, opts?: { muted?: boolean }): string {
  const color = opts?.muted ? '#6b7280' : '#1f2937';
  const size = opts?.muted ? '14px' : '16px';
  return `<p style="margin:0 0 12px; font-size:${size}; color:${color}; line-height:1.6; font-family: -apple-system, Helvetica, Arial, sans-serif;">${txt}</p>`;
}

function eventEmoji(type?: string): string {
  switch ((type || '').toLowerCase()) {
    case 'restaurante': return '🍽️';
    case 'cafe': return '☕';
    case 'caminata': return '🚶';
    case 'picnic': return '🧺';
    case 'brunch': return '🍳';
    default: return '✨';
  }
}

function cleanEventName(name?: string): string {
  return (name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
}

function formatEventWhen(dateISO: string): string {
  const d = new Date(dateISO);
  let dateStr = d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'America/Bogota' });
  dateStr = dateStr.replace(/\.$/, '');
  dateStr = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
  const timeStr = d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Bogota' })
    .replace(/\s+/g, ' ')
    .replace('a. m.', 'a.m.')
    .replace('p. m.', 'p.m.');
  return `${dateStr} · ${timeStr}`;
}

async function fetchUpcomingEvents(supabase: any, now: Date): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('events')
      .select('name, type, date')
      .eq('event_status', 'published')
      .eq('status', 'active')
      .gte('date', now.toISOString())
      .order('date', { ascending: true })
      .limit(10);
    if (!error && Array.isArray(data)) return data;
  } catch (e) {
    console.error('wompi-charge-subscriptions-cron: error trayendo eventos para el correo', e);
  }
  return [];
}

function isWomenOnly(name?: string): boolean {
  return /solo\s+mujeres/i.test(name || '');
}
function isMenOnly(name?: string): boolean {
  return /solo\s+hombres/i.test(name || '');
}

function buildEventsBlocks(allEvents: any[], gender?: string): { html: string; text: string; hasEvents: boolean } {
  const g = (gender || '').toLowerCase();
  const filtered = allEvents.filter((e) => {
    const women = isWomenOnly(e.name);
    const men = isMenOnly(e.name);
    if (g === 'hombre') return !women;
    if (g === 'mujer') return !men;
    return !women && !men;
  }).slice(0, 5);

  if (!filtered.length) {
    const fallbackHtml = htmlParagraph('Ya estamos armando los planes de este mes — te avisamos apenas estén, y tu cupo ya está listo para entrar a todos. 🙌');
    const fallbackText = 'Ya estamos armando los planes de este mes - te avisamos apenas esten, y tu cupo ya esta listo para entrar a todos.';
    return { html: fallbackHtml, text: fallbackText, hasEvents: false };
  }

  const events = filtered;
  const rowsHtml = events.map((e) => {
    const label = `${eventEmoji(e.type)} ${cleanEventName(e.name)}`;
    const when = formatEventWhen(e.date);
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px;">
      <tr>
        <td style="padding:12px 16px; background-color:#faf5f8; border-radius:12px; font-family: -apple-system, Helvetica, Arial, sans-serif;">
          <span style="display:block; font-size:15px; font-weight:bold; color:#1f2937; line-height:1.4;">${label}</span>
          <span style="display:block; font-size:13px; color:#880E4F; margin-top:2px;">${when}</span>
        </td>
      </tr>
    </table>`;
  }).join('');

  const html = `${htmlParagraph('<strong>Estos son algunos de los planes que se vienen:</strong>')}${rowsHtml}`;
  const text = ['Estos son algunos de los planes que se vienen:', '', ...events.map((e) => `- ${cleanEventName(e.name)} — ${formatEventWhen(e.date)}`)].join('\n');

  return { html, text, hasEvents: true };
}

async function sendEmail(to: string, subject: string, text: string, html?: string): Promise<void> {
  if (!RESEND_API_KEY || !to) return;
  try {
    const payload: Record<string, unknown> = { from: 'Nospi <noreply@nospi.co>', to: [to], subject, text };
    if (html) payload.html = html;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error('wompi-charge-subscriptions-cron: error enviando correo a', to, res.status, await res.text());
    }
  } catch (e) {
    console.error('wompi-charge-subscriptions-cron: excepcion enviando correo a', to, e);
  }
}

async function sendRenewalFailedEmail(email: string, expired: boolean, userName?: string, planType?: string, price?: number): Promise<void> {
  const subject = expired
    ? 'Cerramos tu suscripcion de Nospi (no te cobramos nada)'
    : 'No se pudo renovar tu suscripcion (no te cobramos nada)';
  const montoTxt = price ? `$${Number(price).toLocaleString('es-CO')}` : '';
  const text = expired
    ? `Como no fue posible renovar tu suscripcion de Nospi, la cerramos. NO se te cobro nada en ninguno de los intentos y no tienes ningun saldo pendiente con nosotros.\n\nCuando quieras volver, puedes suscribirte de nuevo desde la app con otra tarjeta, o entrar a los eventos pagando solo el que te interese.`
    : `Intentamos renovar tu suscripcion mensual de Nospi${montoTxt ? ` por ${montoTxt}` : ''} y el banco no aprobo el cobro. NO se te debito nada y no tienes ningun saldo pendiente con nosotros.\n\nVamos a intentarlo un par de veces mas en los proximos dias. Si quieres continuar, puedes actualizar tu tarjeta desde la app. Si prefieres no seguir, no tienes que hacer nada: la suscripcion se cierra sola y no te llegara ningun cobro.\n\nMientras tanto puedes seguir entrando a cualquier evento pagandolo por separado.`;
  // El texto viejo nunca decia que NO se habia cobrado nada, y "se desactivara
  // automaticamente" sonaba a amenaza cuando en realidad es la salida suave.
  // Un suscriptor real (3 oct 2026) leyo este correo como si le estuvieran
  // cobrando y escribio alarmado por WhatsApp. Ahora lo primero que se lee es
  // que no hubo debito, y no hacer nada se presenta como una opcion valida.
  const bodyHtml = [
    htmlParagraph(expired
      ? 'Como no fue posible renovar tu suscripción de Nospi, la cerramos.'
      : `Intentamos renovar tu suscripción mensual de Nospi${montoTxt ? ` por <strong>${montoTxt}</strong>` : ''} y el banco no aprobó el cobro.`),
    htmlParagraph(expired
      ? '<strong>No se te cobró nada</strong> en ninguno de los intentos y no tienes ningún saldo pendiente con nosotros.'
      : '<strong>No se te debitó nada</strong> y no tienes ningún saldo pendiente con nosotros.'),
    htmlParagraph(expired
      ? 'Cuando quieras volver, puedes suscribirte de nuevo desde la app con otra tarjeta, o entrar a los eventos pagando solo el que te interese.'
      : 'Vamos a intentarlo un par de veces más en los próximos días. Si quieres continuar, actualiza tu tarjeta desde la app. Si prefieres no seguir, no tienes que hacer nada: la suscripción se cierra sola y no te llegará ningún cobro.', { muted: true }),
    expired ? '' : htmlParagraph('Mientras tanto puedes seguir entrando a cualquier evento pagándolo por separado.', { muted: true }),
  ].join('');
  const html = wrapBrandedHtml(bodyHtml, APP_URL, expired ? 'Suscribirme de nuevo' : 'Actualizar mi tarjeta');
  await sendEmail(email, subject, text, html);

  const nombre = userName || email;
  const planText = etiquetaPlan(planType);
  const adminSubject = expired
    ? `🛑 Suscripcion DESACTIVADA (${planText}): ${nombre}`
    : `⚠️ Renovacion FALLIDA (${planText}): ${nombre}`;
  const adminText = expired
    ? [
        `La suscripcion de ${nombre} se DESACTIVO tras ${MAX_FAILED_ATTEMPTS} intentos fallidos de cobro.`,
        `Usuario: ${nombre}`,
        `Correo: ${email}`,
        `Plan: ${planText}`,
        'Dejo de tener acceso ilimitado. Puede volver a suscribirse desde la app con una tarjeta valida.',
      ].join('\n')
    : [
        `Fallo el cobro de la renovacion de la suscripcion de ${nombre}.`,
        `Usuario: ${nombre}`,
        `Correo: ${email}`,
        `Plan: ${planText}`,
        'Se reintentara automaticamente en las proximas horas. Si falla varias veces, la suscripcion se desactivara sola.',
      ].join('\n');
  await sendEmail(ADMIN_EMAIL, adminSubject, adminText);
}

async function sendRenewalSuccessEmails(
  userEmail: string,
  price: number,
  nextChargeDate: string,
  eventsBlocks: { html: string; text: string; hasEvents: boolean },
  userName?: string,
  planType?: string,
): Promise<void> {
  const priceText = `$${Number(price).toLocaleString('es-CO')} COP`;
  const nextChargeText = new Date(nextChargeDate).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Bogota' });

  const userSubject = 'Tu suscripción de Nospi está activa 🎉 estos son los planes';

  const userText = [
    'Hola,',
    '',
    'Tu suscripcion de Nospi se renovo y ya tienes tu cupo listo para todos los eventos! No tienes que pagar cada plan por separado: con tu suscripcion entras a todos.',
    '',
    eventsBlocks.text,
    '',
    eventsBlocks.hasEvents ? 'Reserva tu lugar en el que quieras desde la app, que los cupos se llenan rapido.' : '',
    '',
    `Renovamos tu suscripcion por ${priceText} - tu proximo cobro seria el ${nextChargeText}. Puedes cancelar cuando quieras desde la app, sin enredos.`,
    '',
    'Nos pillamos pronto!',
    'Equipo Nospi',
  ].filter((l) => l !== '').join('\n');

  const userBodyHtml = [
    htmlParagraph('Hola,'),
    htmlParagraph('¡Tu suscripción de Nospi se renovó y ya tienes tu cupo listo para todos los eventos! 🙌 No tienes que pagar cada plan por separado: con tu suscripción entras a todos.'),
    eventsBlocks.html,
    eventsBlocks.hasEvents ? htmlParagraph('Reserva tu lugar en el que quieras desde la app, que los cupos se llenan rápido.') : '',
    htmlParagraph(`Renovamos tu suscripción por <strong>${priceText}</strong> · tu próximo cobro sería el <strong>${nextChargeText}</strong>. Puedes cancelar cuando quieras desde la app, sin enredos.`, { muted: true }),
    htmlParagraph('¡Nos pillamos pronto! 😄'),
  ].join('');
  const userHtml = wrapBrandedHtml(userBodyHtml, APP_URL, 'Ver los eventos');
  await sendEmail(userEmail, userSubject, userText, userHtml);

  // Aviso al admin. Lleva emoji, nombre y plan igual que los otros cinco avisos:
  // antes era el unico que decia solo "Renovacion cobrada: correo@x.com" y por
  // eso se perdia en la bandeja.
  const nombre = userName || userEmail;
  const planText = etiquetaPlan(planType);
  const adminSubject = `🔁 Renovacion cobrada (${planText}): ${nombre}`;
  const adminText = [
    `${nombre} renovo su suscripcion de Nospi y el cobro fue aprobado.`,
    '',
    `Usuario: ${nombre}`,
    `Correo: ${userEmail}`,
    `Plan: ${planText}`,
    `Valor cobrado: ${priceText}`,
    `Proximo cobro: ${nextChargeText}`,
  ].join('\n');
  await sendEmail(ADMIN_EMAIL, adminSubject, adminText);
}

Deno.serve(async (req: Request) => {
  const secretHeader = req.headers.get('x-cron-secret');
  if (secretHeader !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const now = new Date();

  const allEvents = await fetchUpcomingEvents(supabase, now);

  const { data: due, error: fetchError } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('status', 'active')
    .eq('auto_renew', true)
    .lte('next_charge_date', now.toISOString());

  if (fetchError) {
    console.error('wompi-charge-subscriptions-cron: error consultando suscripciones', fetchError.message);
    return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 });
  }

  const genderByUser = new Map<string, string>();
  const nameByUser = new Map<string, string>();
  const dueUserIds = (due || []).map((s: any) => s.user_id).filter(Boolean);
  if (dueUserIds.length) {
    try {
      const { data: usersData } = await supabase.from('users').select('id, gender, name').in('id', dueUserIds);
      for (const u of usersData || []) {
        genderByUser.set(u.id, u.gender);
        if (u.name) nameByUser.set(u.id, u.name);
      }
    } catch (e) {
      console.error('wompi-charge-subscriptions-cron: error trayendo generos', e);
    }
  }

  const results: any[] = [];

  for (const sub of due || []) {
    try {
      if (!sub.wompi_payment_source_id) {
        results.push({ user_id: sub.user_id, skipped: 'sin payment_source_id' });
        continue;
      }

      // Cuantos meses avanza ESTA suscripcion segun su plan.
      const meses = mesesDelPlan(sub.plan_type);
      const nombreUsuario = nameByUser.get(sub.user_id);

      if (sub.last_charge_status === 'PENDING' && sub.last_charge_transaction_id) {
        const checkRes = await fetch(`${WOMPI_API_URL}/transactions/${sub.last_charge_transaction_id}`, {
          headers: { Authorization: `Bearer ${WOMPI_PRIVATE_KEY}` },
        });
        const checkData = await checkRes.json();
        const checkStatus = checkData?.data?.status;

        if (checkStatus === 'APPROVED') {
          const nextCharge = addMonths(now, meses);
          await supabase.from('subscriptions').update({
            next_charge_date: nextCharge.toISOString(),
            end_date: nextCharge.toISOString(),
            last_charge_status: 'APPROVED',
            failed_charge_count: 0,
            updated_at: now.toISOString(),
          }).eq('id', sub.id);
          results.push({ user_id: sub.user_id, status: 'APPROVED', plan_type: sub.plan_type, meses, resolved_from: 'PENDING', next_charge_date: nextCharge.toISOString() });
          await sendRenewalSuccessEmails(sub.wompi_customer_email, sub.price, nextCharge.toISOString(), buildEventsBlocks(allEvents, genderByUser.get(sub.user_id)), nombreUsuario, sub.plan_type);
          continue;
        }
        if (checkStatus === 'DECLINED' || checkStatus === 'ERROR' || checkStatus === 'VOIDED') {
          const fail = markFailure(now, sub);
          await supabase.from('subscriptions').update({
            failed_charge_count: fail.failed_charge_count,
            last_charge_status: checkStatus,
            status: fail.status,
            auto_renew: fail.auto_renew,
            next_charge_date: fail.next_charge_date,
            updated_at: fail.updated_at,
          }).eq('id', sub.id);
          results.push({ user_id: sub.user_id, status: checkStatus, resolved_from: 'PENDING', failedCount: fail.failedCount, expired: fail.expired });
          await sendRenewalFailedEmail(sub.wompi_customer_email, fail.expired, nombreUsuario, sub.plan_type, sub.price);
          continue;
        }
        results.push({ user_id: sub.user_id, status: 'PENDING', still_pending: true });
        continue;
      }

      const amountInCents = Math.round(Number(sub.price) * 100);
      const reference = `nospi_subrenew_${sub.user_id}_${Date.now()}`;
      const signature = await generateSignature(reference, amountInCents, 'COP');

      const txRes = await fetch(`${WOMPI_API_URL}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${WOMPI_PRIVATE_KEY}` },
        body: JSON.stringify({
          amount_in_cents: amountInCents,
          currency: 'COP',
          signature,
          customer_email: sub.wompi_customer_email,
          reference,
          payment_source_id: sub.wompi_payment_source_id,
          payment_method: { installments: 1 },
        }),
      });
      const txData = await txRes.json();
      const txStatus = txData?.data?.status;

      if (txRes.ok && txStatus === 'APPROVED') {
        const nextCharge = addMonths(now, meses);
        await supabase
          .from('subscriptions')
          .update({
            next_charge_date: nextCharge.toISOString(),
            end_date: nextCharge.toISOString(),
            last_charge_transaction_id: txData.data.id,
            last_charge_status: txStatus,
            failed_charge_count: 0,
            updated_at: now.toISOString(),
          })
          .eq('id', sub.id);
        results.push({ user_id: sub.user_id, status: txStatus, plan_type: sub.plan_type, meses, next_charge_date: nextCharge.toISOString() });
        await sendRenewalSuccessEmails(sub.wompi_customer_email, sub.price, nextCharge.toISOString(), buildEventsBlocks(allEvents, genderByUser.get(sub.user_id)), nombreUsuario, sub.plan_type);
      } else if (txRes.ok && txStatus === 'PENDING') {
        await supabase
          .from('subscriptions')
          .update({
            last_charge_transaction_id: txData.data.id,
            last_charge_status: 'PENDING',
            updated_at: now.toISOString(),
          })
          .eq('id', sub.id);
        results.push({ user_id: sub.user_id, status: 'PENDING', pending: true });
      } else {
        const fail = markFailure(now, sub);
        await supabase
          .from('subscriptions')
          .update({
            failed_charge_count: fail.failed_charge_count,
            last_charge_status: txStatus || 'ERROR',
            last_charge_transaction_id: txData?.data?.id || sub.last_charge_transaction_id,
            status: fail.status,
            auto_renew: fail.auto_renew,
            next_charge_date: fail.next_charge_date,
            updated_at: fail.updated_at,
          })
          .eq('id', sub.id);
        results.push({ user_id: sub.user_id, status: txStatus || 'ERROR', failedCount: fail.failedCount, expired: fail.expired });
        console.error(`wompi-charge-subscriptions-cron: cobro fallido user ${sub.user_id}`, JSON.stringify(txData));
        await sendRenewalFailedEmail(sub.wompi_customer_email, fail.expired, nombreUsuario, sub.plan_type, sub.price);
      }
    } catch (e: any) {
      console.error('wompi-charge-subscriptions-cron: excepcion procesando suscripcion', sub.id, e.message);
      results.push({ user_id: sub.user_id, error: e.message });
    }
  }

  return new Response(JSON.stringify({ processed: (due || []).length, results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
