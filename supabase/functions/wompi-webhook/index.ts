// Supabase Edge Function: wompi-webhook
// Recibe los eventos que Wompi envia server-to-server (Configuracion > Desarrolladores > URL de Eventos).
// Verifica la firma con el secreto de eventos, y cuando una transaccion queda
// APPROVED, confirma la cita automaticamente sin depender de que el navegador
// del usuario siga abierto.
// verify_jwt=false porque Wompi no envia un JWT de Supabase: la autenticidad
// del request se valida con la firma HMAC propia de Wompi (verifySignature).
//
// v17 (23 sep 2026): CALIDAD DE COINCIDENCIA del Purchase que se manda a Meta.
// Hasta v16 solo se enviaban correo y telefono hasheados, y action_source
// 'system_generated'. Con eso Meta RECIBE el evento (events_received: 1) pero
// no lo puede ATRIBUIR a ninguna campana, asi que el reporte de anuncios
// muestra 0 compras aunque el evento este en el Administrador de Eventos.
// La pieza que faltaba ya estaba en la base sin usarse: users.click_id, donde
// public/index.html viene guardando el fbclid desde hace meses (871 de 1410
// usuarios de los ultimos 30 dias lo tienen). Ahora se convierte a fbc con el
// formato que Meta exige (fb.1.<ms>.<fbclid>) y se envia, junto con
// external_id, nombre, ciudad y pais. Tambien se corrige action_source a
// 'website' con event_source_url, que es lo que describe de verdad la compra.
// OJO: click_id guarda tambien ttclid y gclid, asi que solo se usa como fbc
// cuando utm_source es de Meta (ver META_SOURCES) — mandar un ttclid como fbc
// ensuciaria la atribucion.
//
// v8: cuando una RENOVACION se resuelve por este camino (el cobro del cron
// quedo PENDING y el banco lo aprobo/rechazo despues via webhook), ahora se
// envian los MISMOS correos que envia el cron: al suscriptor (exito o fallo,
// con marca Nospi) y al admin (nospisocial@gmail.com). Antes este camino
// actualizaba la suscripcion pero NO enviaba ningun correo, por eso las
// renovaciones resueltas via webhook pasaban en silencio.
//
// v5: el webhook ahora TAMBIEN reconoce las transacciones de RENOVACION
// mensual (referencia nospi_subrenew_{userId}_{timestamp}, generada por
// wompi-charge-subscriptions-cron), no solo la primera suscripcion
// (nospi_sub_{userId}_{timestamp}). Antes, si un cobro de renovacion
// quedaba PENDING y luego se resolvia via webhook, ese evento se
// descartaba silenciosamente igual que paso con las suscripciones
// iniciales antes del fix anterior. Ahora:
//   - APPROVED en una renovacion -> avanza next_charge_date un mes y
//     resetea failed_charge_count (idempotente: ignora si ya se proceso
//     esa misma transactionId).
//   - DECLINED/ERROR/VOIDED en una renovacion -> incrementa
//     failed_charge_count y expira la suscripcion tras 3 fallos, igual
//     que hace el cron.
//
// v4: reconoce transacciones de suscripcion mensual inicial (nospi_sub_).
// v3: envia Purchase a Meta e incrementa current_participants desde aqui
// (fuente confiable aunque el navegador del usuario no vuelva a la app).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const WOMPI_EVENTS_SECRET = 'prod_events_lHF2rYQsGvDoGPivvuWfXRElmtIkFqXg';
const SUPABASE_URL = 'https://wjdiraurfbawotlcndmk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const META_PIXEL_ID = '956701276734114';
const META_ACCESS_TOKEN = Deno.env.get('META_CONVERSIONS_TOKEN') || '';
const TIKTOK_PIXEL_CODE = 'DA1RGIBC77UE3FB79VU0';
const TIKTOK_EVENTS_TOKEN = Deno.env.get('TIKTOK_EVENTS_TOKEN') || '';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const ADMIN_EMAIL = 'nospisocial@gmail.com';
const APP_URL = 'https://app.nospi.co';

const MAX_FAILED_ATTEMPTS = 3;

// Fuentes cuyo click_id ES un fbclid. Cualquier otra (tiktok, google,
// referido, app_ios, directo...) NO debe viajar como fbc.
const META_SOURCES = new Set(['fb', 'facebook', 'ig', 'instagram', 'meta', '{{site_source_name}}']);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function getByPath(obj: any, path: string): any {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Meta exige el formato fb.1.<milisegundos del clic>.<fbclid>. Como no
// guardamos la hora exacta del clic, se usa created_at del usuario: en la
// practica se registra a los pocos minutos de hacer clic en el anuncio.
function buildFbc(clickId: any, utmSource: any, createdAt: any): string {
  const id = String(clickId || '').trim();
  if (!id) return '';
  const src = String(utmSource || '').toLowerCase().trim();
  if (!META_SOURCES.has(src)) return '';
  if (id.startsWith('fb.')) return id;
  const ms = createdAt ? new Date(createdAt).getTime() : NaN;
  const t = Number.isFinite(ms) ? ms : Date.now();
  return `fb.1.${t}.${id}`;
}

function normalizeCountry(c: any): string {
  const v = String(c || '').toLowerCase().trim();
  if (!v) return '';
  if (v.length === 2) return v;
  if (v.startsWith('colomb')) return 'co';
  if (v.startsWith('mexic') || v.startsWith('méxic')) return 'mx';
  if (v.startsWith('espa')) return 'es';
  if (v.startsWith('argent')) return 'ar';
  if (v.startsWith('estados') || v.startsWith('united')) return 'us';
  return '';
}

async function verifySignature(payload: any): Promise<boolean> {
  try {
    const props: string[] = payload?.signature?.properties || [];
    const checksum: string = payload?.signature?.checksum || '';
    const timestamp = payload?.timestamp;
    if (!props.length || !checksum || timestamp === undefined) return false;

    let concat = '';
    for (const prop of props) {
      const value = getByPath(payload.data, prop);
      concat += String(value ?? '');
    }
    concat += String(timestamp);
    concat += WOMPI_EVENTS_SECRET;

    const computed = await sha256Hex(concat);
    return computed.toLowerCase() === String(checksum).toLowerCase();
  } catch (e) {
    console.error('wompi-webhook: error verifying signature:', e);
    return false;
  }
}

function parseReference(reference: string): { method: string; userId: string; eventId: string } | null {
  // Formato citas/eventos: nospi_{method}_{userId}_{eventId}_{timestamp}
  if (!reference || !reference.startsWith('nospi_')) return null;
  const rest = reference.slice('nospi_'.length);
  const parts = rest.split('_');
  if (parts.length !== 4) return null;
  const [method, userId, eventId, _ts] = parts;
  if (!userId || !eventId) return null;
  return { method, userId, eventId };
}

function parseSubscriptionReference(reference: string): { userId: string; isRenewal: boolean } | null {
  // Suscripcion inicial: nospi_sub_{userId}_{timestamp}
  // Renovacion mensual: nospi_subrenew_{userId}_{timestamp}
  let prefix = '';
  let isRenewal = false;
  if (reference?.startsWith('nospi_subrenew_')) {
    prefix = 'nospi_subrenew_';
    isRenewal = true;
  } else if (reference?.startsWith('nospi_sub_')) {
    prefix = 'nospi_sub_';
    isRenewal = false;
  } else {
    return null;
  }
  const rest = reference.slice(prefix.length); // {userId}_{timestamp}
  const lastUnderscore = rest.lastIndexOf('_');
  if (lastUnderscore === -1) return null;
  const userId = rest.slice(0, lastUnderscore);
  const ts = rest.slice(lastUnderscore + 1);
  if (!userId || !ts) return null;
  return { userId, isRenewal };
}

async function logResult(supabase: any, message: string, payload: any) {
  console.log(`wompi-webhook: ${message}`, JSON.stringify(payload).slice(0, 500));
}

// ----- Correos (mismo patron de marca que wompi-charge-subscriptions-cron) -----

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
      console.error('wompi-webhook: error enviando correo a', to, res.status, await res.text());
    }
  } catch (e) {
    console.error('wompi-webhook: excepcion enviando correo a', to, e);
  }
}

// Correos cuando una renovacion se APRUEBA via webhook (el cobro del cron
// quedo PENDING y el banco lo aprobo despues). Espejo de
// sendRenewalSuccessEmails del cron, sin la lista de eventos (el CTA lleva
// a la app donde estan todos).
async function sendRenewalSuccessEmailsFromWebhook(userEmail: string, price: number, nextChargeDate: string): Promise<void> {
  const priceText = `$${Number(price).toLocaleString('es-CO')} COP`;
  const nextChargeText = new Date(nextChargeDate).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Bogota' });

  // ---- Correo al suscriptor (con marca) ----
  const userSubject = 'Tu mes en Nospi está activo 🎉';
  const userText = [
    'Hola,',
    '',
    '¡Tu suscripción de Nospi se renovó y ya tenés tu cupo listo para todos los eventos de este mes! No tenés que pagar cada plan por separado: con tu suscripción entrás a todos.',
    '',
    'Reservá tu lugar en el que quieras desde la app, que los cupos se llenan rápido.',
    '',
    `Renovamos tu suscripción por ${priceText} · tu próximo cobro sería el ${nextChargeText}. Podés cancelar cuando quieras desde la app, sin enredos.`,
    '',
    '¡Nos pillamos pronto! 😄',
    'Equipo Nospi',
  ].join('\n');
  const userBodyHtml = [
    htmlParagraph('Hola,'),
    htmlParagraph('¡Tu suscripción de Nospi se renovó y ya tenés tu cupo listo para todos los eventos de este mes! 🙌 No tenés que pagar cada plan por separado: con tu suscripción entrás a todos.'),
    htmlParagraph('Reservá tu lugar en el que quieras desde la app, que los cupos se llenan rápido.'),
    htmlParagraph(`Renovamos tu suscripción por <strong>${priceText}</strong> · tu próximo cobro sería el <strong>${nextChargeText}</strong>. Podés cancelar cuando quieras desde la app, sin enredos.`, { muted: true }),
    htmlParagraph('¡Nos pillamos pronto! 😄'),
  ].join('');
  const userHtml = wrapBrandedHtml(userBodyHtml, APP_URL, 'Ver los eventos del mes');
  await sendEmail(userEmail, userSubject, userText, userHtml);

  // ---- Correo interno al admin (solo texto plano) ----
  const adminSubject = `Renovacion cobrada: ${userEmail}`;
  const adminText = [
    `Se cobro exitosamente la renovacion mensual de la suscripcion de ${userEmail}.`,
    `Valor: ${priceText}`,
    `Proximo cobro: ${nextChargeText}`,
    '(confirmada via webhook de Wompi: el cobro quedo PENDING y el banco lo aprobo despues)',
  ].join('\n');
  await sendEmail(ADMIN_EMAIL, adminSubject, adminText);
}

// Correos cuando una renovacion FALLA via webhook. Espejo de
// sendRenewalFailedEmail del cron (suscriptor con marca + aviso al admin).
async function sendRenewalFailedEmailsFromWebhook(userEmail: string, expired: boolean): Promise<void> {
  const subject = expired
    ? 'No pudimos renovar tu suscripcion de Nospi'
    : 'Hubo un problema al cobrar tu suscripcion de Nospi';
  const text = expired
    ? 'Intentamos cobrar tu suscripcion mensual varias veces y no fue posible. Por seguridad, la desactivamos: dejaste de tener acceso ilimitado a eventos. Puedes volver a suscribirte cuando quieras desde la app con una tarjeta valida.'
    : 'No pudimos procesar el cobro de tu suscripcion mensual de Nospi con la tarjeta registrada. Vamos a reintentarlo en las proximas horas. Si el problema persiste, tu suscripcion se desactivara automaticamente tras varios intentos. Puedes actualizar tu metodo de pago desde la app.';
  const bodyHtml = [
    htmlParagraph(expired
      ? 'Intentamos cobrar tu suscripción mensual varias veces y no fue posible. Por seguridad, la desactivamos: dejaste de tener acceso ilimitado a eventos.'
      : 'No pudimos procesar el cobro de tu suscripción mensual de Nospi con la tarjeta registrada. Vamos a reintentarlo en las próximas horas.'),
    htmlParagraph(expired
      ? 'Puedes volver a suscribirte cuando quieras desde la app con una tarjeta válida.'
      : 'Si el problema persiste, tu suscripción se desactivará automáticamente tras varios intentos. Puedes actualizar tu método de pago desde la app.', { muted: true }),
  ].join('');
  const html = wrapBrandedHtml(bodyHtml, APP_URL, expired ? 'Suscribirme de nuevo' : 'Actualizar mi tarjeta');
  await sendEmail(userEmail, subject, text, html);

  const adminSubject = expired
    ? `🛑 Suscripcion DESACTIVADA (renovacion fallida): ${userEmail}`
    : `⚠️ Renovacion FALLIDA: ${userEmail}`;
  const adminText = expired
    ? [
        `La suscripcion de ${userEmail} se DESACTIVO tras ${MAX_FAILED_ATTEMPTS} intentos fallidos de cobro de la renovacion mensual.`,
        `Correo del suscriptor: ${userEmail}`,
        'Dejo de tener acceso ilimitado. Puede volver a suscribirse desde la app con una tarjeta valida.',
        '(resuelta via webhook de Wompi: el cobro quedo PENDING y el banco lo rechazo despues)',
      ].join('\n')
    : [
        `Fallo el cobro de la renovacion mensual de la suscripcion de ${userEmail}.`,
        `Correo del suscriptor: ${userEmail}`,
        'Se reintentara automaticamente en las proximas horas. Si falla varias veces, la suscripcion se desactivara sola.',
        '(resuelta via webhook de Wompi: el cobro quedo PENDING y el banco lo rechazo despues)',
      ].join('\n');
  await sendEmail(ADMIN_EMAIL, adminSubject, adminText);
}

async function sendMetaPurchase(
  supabase: any,
  params: { userId: string; eventId: string; transactionId: string; amount: number },
): Promise<void> {
  try {
    if (!META_ACCESS_TOKEN) {
      console.error('wompi-webhook: META_CONVERSIONS_TOKEN no configurado, no se envia Purchase a Meta');
      return;
    }

    const { data: user } = await supabase
      .from('users')
      .select('email, phone, name, city, country, click_id, utm_source, created_at')
      .eq('id', params.userId)
      .maybeSingle();

    const userData: Record<string, string> = {};
    if (user?.email) {
      userData['em'] = await sha256Hex(user.email.toLowerCase().trim());
    }
    if (user?.phone) {
      const normalizedPhone = String(user.phone).replace(/\D/g, '');
      if (normalizedPhone) userData['ph'] = await sha256Hex(normalizedPhone);
    }

    // external_id: estable por usuario, deja a Meta unir varios eventos de la
    // misma persona aunque cambie de dispositivo.
    if (params.userId) {
      userData['external_id'] = await sha256Hex(String(params.userId));
    }

    // Nombre de pila, ciudad y pais: Meta los usa como llaves adicionales de
    // coincidencia. Van hasheados y normalizados (minusculas, sin espacios).
    const firstName = String(user?.name || '').trim().split(' ')[0];
    if (firstName) {
      userData['fn'] = await sha256Hex(firstName.toLowerCase());
    }
    const city = String(user?.city || '').toLowerCase().replace(/\s+/g, '').trim();
    if (city) {
      userData['ct'] = await sha256Hex(city);
    }
    const country = normalizeCountry(user?.country);
    if (country) {
      userData['country'] = await sha256Hex(country);
    }

    // fbc: EL dato que faltaba. Sin esto Meta recibe el evento pero no lo
    // puede atribuir a la campana que genero el clic.
    const fbc = buildFbc(user?.click_id, user?.utm_source, user?.created_at);
    if (fbc) userData['fbc'] = fbc;

    const payload = {
      data: [
        {
          event_name: 'Purchase',
          event_time: Math.floor(Date.now() / 1000),
          event_id: `purchase_${params.transactionId}`,
          // 'website' + event_source_url describe lo que de verdad paso (una
          // compra en app.nospi.co) y es lo que permite que el fbc se use
          // para atribuir. 'system_generated' le decia a Meta que no hubo
          // accion de usuario, que es justo lo contrario.
          action_source: 'website',
          event_source_url: APP_URL,
          custom_data: {
            value: params.amount || 9900,
            currency: 'COP',
            content_type: 'product',
            content_ids: [params.eventId || 'nospi_event'],
          },
          user_data: userData,
        },
      ],
    };

    const metaRes = await fetch(
      `https://graph.facebook.com/v18.0/${META_PIXEL_ID}/events?access_token=${META_ACCESS_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    const metaData = await metaRes.json();

    if (!metaRes.ok) {
      console.error('wompi-webhook: Meta API error al enviar Purchase:', JSON.stringify(metaData));
      return;
    }
    await logResult(supabase, 'Purchase enviado a Meta desde webhook', {
      tx: params.transactionId,
      llaves: Object.keys(userData).join(','),
      con_fbc: !!fbc,
      utm_source: user?.utm_source || null,
      metaData,
    });
  } catch (e) {
    console.error('wompi-webhook: error enviando Purchase a Meta:', e);
  }
}


// Espejo de sendMetaPurchase para TikTok. Va AQUI y no en el front
// (payment-callback) porque en Bancolombia/PSE el usuario muchas veces no
// vuelve al navegador despues de pagar: el webhook es la unica fuente
// confiable. Mismo event_id que Meta para deduplicar y poder comparar.
async function sendTikTokPurchase(
  supabase: any,
  params: { userId: string; eventId: string; transactionId: string; amount: number },
): Promise<void> {
  try {
    if (!TIKTOK_EVENTS_TOKEN) {
      console.error('wompi-webhook: TIKTOK_EVENTS_TOKEN no configurado');
      return;
    }
    const { data: user } = await supabase
      .from('users').select('email, phone').eq('id', params.userId).maybeSingle();
    const userData: Record<string, string> = {};
    if (user?.email) userData['email'] = await sha256Hex(user.email.toLowerCase().trim());
    if (user?.phone) {
      let digits = String(user.phone).replace(/\D/g, '');
      if (digits.length === 10) digits = '57' + digits;
      if (digits) userData['phone'] = await sha256Hex('+' + digits);
    }
    const payload = {
      event_source: 'web',
      event_source_id: TIKTOK_PIXEL_CODE,
      data: [
        {
          event: 'CompletePayment',
          event_time: Math.floor(Date.now() / 1000),
          event_id: `purchase_${params.transactionId}`,
          user: userData,
          properties: {
            currency: 'COP',
            value: params.amount || 15000,
            content_type: 'product',
            content_id: params.eventId || 'nospi_event',
          },
        },
      ],
    };
    const ttRes = await fetch('https://business-api.tiktok.com/open_api/v1.3/event/track/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Access-Token': TIKTOK_EVENTS_TOKEN },
      body: JSON.stringify(payload),
    });
    const ttData = await ttRes.json();
    // TikTok responde HTTP 200 aunque haya error logico: hay que mirar code.
    if (!ttRes.ok || ttData?.code !== 0) {
      console.error('wompi-webhook: TikTok Events API error:', JSON.stringify(ttData));
      return;
    }
    await logResult(supabase, 'CompletePayment enviado a TikTok desde webhook', { tx: params.transactionId, ttData });
  } catch (e) {
    console.error('wompi-webhook: error enviando CompletePayment a TikTok:', e);
  }
}

function addOneMonth(d: Date): Date {
  const nd = new Date(d);
  nd.setMonth(nd.getMonth() + 1);
  return nd;
}

async function activateSubscriptionFromWebhook(
  supabase: any,
  params: { userId: string; transactionId: string; amountInCents: number; customerEmail: string; paymentSourceId: string | null },
): Promise<void> {
  try {
    const { data: existing } = await supabase
      .from('subscriptions')
      .select('last_charge_transaction_id, status')
      .eq('user_id', params.userId)
      .maybeSingle();

    if (existing?.last_charge_transaction_id === params.transactionId) {
      await logResult(supabase, 'Suscripcion ya procesada para esta transaccion, se ignora reintento del webhook', { tx: params.transactionId });
      return;
    }

    const now = new Date();
    const nextCharge = addOneMonth(now);
    const price = params.amountInCents ? Math.round(params.amountInCents / 100) : 29900;

    const { error: upsertError } = await supabase.from('subscriptions').upsert(
      {
        user_id: params.userId,
        plan_type: '1_month',
        price,
        status: 'active',
        start_date: now.toISOString(),
        end_date: nextCharge.toISOString(),
        next_charge_date: nextCharge.toISOString(),
        payment_method: 'card',
        auto_renew: true,
        wompi_payment_source_id: params.paymentSourceId || existing?.wompi_payment_source_id || null,
        wompi_customer_email: params.customerEmail,
        last_charge_transaction_id: params.transactionId,
        last_charge_status: 'APPROVED',
        failed_charge_count: 0,
        updated_at: now.toISOString(),
      },
      { onConflict: 'user_id' },
    );

    if (upsertError) {
      console.error('wompi-webhook: error activando suscripcion desde webhook:', upsertError.message);
      return;
    }

    await logResult(supabase, `Suscripcion activada automaticamente via webhook para user ${params.userId}`, { tx: params.transactionId });
  } catch (e) {
    console.error('wompi-webhook: error en activateSubscriptionFromWebhook:', e);
  }
}

async function finalizeRenewalFromWebhook(
  supabase: any,
  params: { userId: string; transactionId: string },
): Promise<void> {
  try {
    const { data: existing } = await supabase
      .from('subscriptions')
      .select('last_charge_transaction_id, last_charge_status, price, wompi_customer_email')
      .eq('user_id', params.userId)
      .maybeSingle();

    if (!existing) return;
    if (existing.last_charge_transaction_id === params.transactionId && existing.last_charge_status === 'APPROVED') {
      await logResult(supabase, 'Renovacion ya procesada para esta transaccion, se ignora reintento del webhook', { tx: params.transactionId });
      return;
    }

    const now = new Date();
    const nextCharge = addOneMonth(now);

    await supabase.from('subscriptions').update({
      status: 'active',
      next_charge_date: nextCharge.toISOString(),
      end_date: nextCharge.toISOString(),
      last_charge_transaction_id: params.transactionId,
      last_charge_status: 'APPROVED',
      failed_charge_count: 0,
      updated_at: now.toISOString(),
    }).eq('user_id', params.userId);

    await logResult(supabase, `Renovacion mensual confirmada via webhook para user ${params.userId}`, { tx: params.transactionId });

    // v8: mismos correos que envia el cron cuando la renovacion se aprueba.
    if (existing.wompi_customer_email) {
      await sendRenewalSuccessEmailsFromWebhook(existing.wompi_customer_email, existing.price, nextCharge.toISOString());
    }
  } catch (e) {
    console.error('wompi-webhook: error en finalizeRenewalFromWebhook:', e);
  }
}

async function failRenewalFromWebhook(
  supabase: any,
  params: { userId: string; transactionId: string; status: string },
): Promise<void> {
  try {
    const { data: existing } = await supabase
      .from('subscriptions')
      .select('last_charge_transaction_id, last_charge_status, failed_charge_count, next_charge_date, wompi_customer_email')
      .eq('user_id', params.userId)
      .maybeSingle();

    if (!existing) return;
    if (existing.last_charge_transaction_id === params.transactionId && existing.last_charge_status !== 'PENDING') {
      await logResult(supabase, 'Fallo de renovacion ya procesado para esta transaccion, se ignora reintento', { tx: params.transactionId });
      return;
    }

    const now = new Date();
    const failedCount = (existing.failed_charge_count || 0) + 1;
    const expired = failedCount >= MAX_FAILED_ATTEMPTS;
    const nd = new Date(now);
    nd.setDate(nd.getDate() + 1);

    await supabase.from('subscriptions').update({
      failed_charge_count: failedCount,
      last_charge_status: params.status,
      last_charge_transaction_id: params.transactionId,
      status: expired ? 'expired' : 'active',
      auto_renew: expired ? false : true,
      next_charge_date: expired ? existing.next_charge_date : nd.toISOString(),
      updated_at: now.toISOString(),
    }).eq('user_id', params.userId);

    await logResult(supabase, `Renovacion mensual fallida via webhook para user ${params.userId}`, { tx: params.transactionId, status: params.status, failedCount, expired });

    // v8: mismos correos que envia el cron cuando la renovacion falla.
    if (existing.wompi_customer_email) {
      await sendRenewalFailedEmailsFromWebhook(existing.wompi_customer_email, expired);
    }
  } catch (e) {
    console.error('wompi-webhook: error en failRenewalFromWebhook:', e);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const payload = await req.json();

    const isValid = await verifySignature(payload);
    if (!isValid) {
      await logResult(supabase, 'Firma invalida, evento rechazado', payload);
      return new Response(JSON.stringify({ error: 'Firma invalida' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tx = payload?.data?.transaction;
    if (!tx) {
      return new Response(JSON.stringify({ received: true, note: 'Sin transaccion en el payload' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const parsed = parseReference(tx.reference);
    const subParsed = !parsed ? parseSubscriptionReference(tx.reference) : null;
    const status = tx.status;

    await supabase
      .from('payment_attempts')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('transaction_id', tx.id);

    if (status === 'APPROVED' && parsed) {
      const { userId, eventId, method } = parsed;

      const { data: existing } = await supabase
        .from('appointments')
        .select('payment_status')
        .eq('user_id', userId)
        .eq('event_id', eventId)
        .maybeSingle();

      const wasAlreadyCompleted = existing?.payment_status === 'completed';

      const { error: upsertError } = await supabase
        .from('appointments')
        .upsert(
          {
            user_id: userId,
            event_id: eventId,
            status: 'confirmada',
            payment_status: 'completed',
            transaction_id: tx.id,
            payment_method: method,
            confirmed_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,event_id', ignoreDuplicates: false },
        );

      if (upsertError) {
        await logResult(supabase, 'Error al confirmar cita: ' + upsertError.message, { tx: tx.id, userId, eventId });
      } else {
        await logResult(supabase, `Cita confirmada automaticamente via webhook para user ${userId} evento ${eventId}`, { tx: tx.id });

        if (!wasAlreadyCompleted) {
          const { error: incError } = await supabase.rpc('increment_event_participants', { p_event_id: eventId });
          if (incError) {
            console.error('wompi-webhook: error incrementando current_participants:', incError.message);
          }

          const __amount = tx.amount_in_cents ? Math.round(tx.amount_in_cents / 100) : 15000;

          await sendMetaPurchase(supabase, {
            userId,
            eventId,
            transactionId: tx.id,
            amount: __amount,
          });

          await sendTikTokPurchase(supabase, {
            userId,
            eventId,
            transactionId: tx.id,
            amount: __amount,
          });
        }
      }
    } else if (status === 'APPROVED' && subParsed && !subParsed.isRenewal) {
      await activateSubscriptionFromWebhook(supabase, {
        userId: subParsed.userId,
        transactionId: tx.id,
        amountInCents: tx.amount_in_cents,
        customerEmail: tx.customer_email,
        paymentSourceId: tx.payment_source_id || null,
      });
    } else if (status === 'APPROVED' && subParsed && subParsed.isRenewal) {
      await finalizeRenewalFromWebhook(supabase, { userId: subParsed.userId, transactionId: tx.id });
    } else if ((status === 'DECLINED' || status === 'ERROR' || status === 'VOIDED') && subParsed?.isRenewal) {
      await failRenewalFromWebhook(supabase, { userId: subParsed.userId, transactionId: tx.id, status });
    } else if (status === 'APPROVED' && !parsed && !subParsed) {
      await logResult(supabase, 'Transaccion APPROVED pero no se pudo parsear userId/eventId de la referencia', { reference: tx.reference, tx: tx.id });
    }

    return new Response(JSON.stringify({ received: true, status, matched: !!parsed, subscriptionMatched: !!subParsed }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('wompi-webhook error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
