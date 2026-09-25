// Supabase Edge Function: send-email-reminders
//
// Modos de invocacion:
//
// 1) Bajo demanda con { event_id } en el body (boton 'Revelar ubicacion' del
//    admin, o trigger de Postgres cuando is_location_revealed pasa a true):
//    envia de inmediato el correo de ubicacion revelada a los confirmados
//    de ESE evento que aun no lo hayan recibido (reminder_48h_email_sent_at
//    IS NULL).
//
// 2) Invocacion normal por pg_cron (sin event_id, cada 5 min):
//    a) A cualquier hora: recordatorio de 'faltan 3 dias' para eventos que
//       caen exactamente 3 dias de calendario (hora Bogota) despues de hoy.
//       No depende de is_location_revealed -sale con o sin ubicacion.
//    b) Recordatorio del mismo dia: cada evento tiene su propia hora
//       objetivo (ver sameDaySendMinutesBogota).
//    c) Inicio del evento + 5 min: aviso de 'rompan el hielo, abran la
//       Dinamica', justo cuando la app libera "Continuar" (con ventana de
//       gracia por si el cron se atrasa). Espejo del bloque equivalente de push.
//
// 3) Preview con { event_id, preview_email, preview_type } ('48h' | 'sameday'
//    | '3d' | 'event_start'): arma el mismo texto que se enviaria y lo manda
//    SOLO a preview_email, sin tocar nada de asistentes reales. Acepta
//    tambien preview_tag opcional para que el asunto sea unico y Gmail no
//    agrupe los previews de prueba en el mismo hilo colapsado.
//
// 4) Correccion puntual con { event_id, send_correction: true, only_emails? }.
//
// IMPORTANTE - zona horaria: 'event.date' es el INSTANTE UTC exacto del
// evento (ej. viernes 7pm Bogota = sabado 00:00 UTC). El server corre en
// UTC, asi que cualquier formateo de fecha para el usuario tiene que pasar
// timeZone: 'America/Bogota' explicitamente.
//
// v25: guino de marca Nospi (nos pillamos) en las despedidas de todos los
// correos, tanto en texto plano como en el HTML visible.
//
// v26: se agrega la politica de asistencia (cancelacion 24h/saldo/amonestacion)
// a los correos de 3 dias y dia anterior, la valvula de soporte al del mismo
// dia, y el enlace "Ver la politica de asistencia" (nospi.co/#politica) en los
// tres. No se toca ningun otro texto.
//
// v30: se agrega en el correo del mismo dia una linea corta sobre el cierre de
// la dinamica: eleccion de afinidad privada (solo se revela si hay match) y
// calificacion de la experiencia.
//
// v32: el correo de inicio de evento (event_start) ya no sale a la hora exacta
// sino a la hora + EVENT_START_DELAY_MS (5 min), el mismo instante en que la
// app libera el boton "Continuar" (START_WINDOW_MINUTES en dinamica.tsx).
//
// v41: eventos de videollamada (type='virtual'). Los cuatro correos tienen
// version virtual. NINGUNA lleva el enlace del Meet: ese vive detras del boton
// de la app (events.meet_link) porque tocarlo es lo que registra la asistencia.
// Si viajara por correo se reenviaria y se entraria sin pasar por la app, que
// es justo lo que medimos. Por eso en virtual el boton del correo apunta a
// app.nospi.co y nunca a maps_link.
//
// v45: videollamada — el correo del mismo dia y el de inicio dicen que hacer al
// entrar (camara, ronda de saludo, quien toca "Quiero ser el moderador",
// papel y lapiz): en un Meet sin nadie de Nospi, nadie arrancaba solo.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://wjdiraurfbawotlcndmk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';

const BOGOTA_TZ = 'America/Bogota';
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;
const SAMEDAY_SEND_HOUR = 9;
const EARLY_EVENT_BUFFER_MINUTES = 120;
const PRECISION_GRACE_MS = 45 * 60 * 1000;

// Cuanto DESPUES de la hora del evento sale el correo de inicio. Debe
// coincidir con START_WINDOW_MINUTES de la app (app/(tabs)/dinamica.tsx) y con
// EVENT_START_DELAY_MS de send-push-reminders.
const EVENT_START_DELAY_MS = 5 * 60 * 1000;

// Cuanto ANTES de la hora se habilita el boton de entrar a la videollamada.
// Debe coincidir con MINUTOS_ANTES_ENTRAR de app/event-details/[id].tsx.
const MINUTOS_ANTES_ENTRAR = 15;

// En un evento virtual el boton del correo lleva a la app, nunca al Meet.
const URL_APP = 'https://app.nospi.co';

async function sendEmail(to: string, subject: string, text: string, html?: string): Promise<{ ok: boolean; errorText?: string }> {
  if (!RESEND_API_KEY || !to) return { ok: false, errorText: 'sin API key o destinatario' };
  try {
    const payload: Record<string, unknown> = { from: 'Nospi <noreply@nospi.co>', to: [to], subject, text };
    if (html) payload.html = html;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error('send-email-reminders: Resend error', res.status, errText);
      return { ok: false, errorText: errText };
    }
    return { ok: true };
  } catch (e) {
    console.error('send-email-reminders: excepcion enviando correo', e);
    return { ok: false, errorText: String(e) };
  }
}

function daysUntilEventBogota(nowUTC: Date, eventDateISO: string): number {
  const nowBogota = new Date(nowUTC.getTime() - BOGOTA_OFFSET_MS);
  const eventBogota = new Date(new Date(eventDateISO).getTime() - BOGOTA_OFFSET_MS);
  const startOfToday = Date.UTC(nowBogota.getUTCFullYear(), nowBogota.getUTCMonth(), nowBogota.getUTCDate());
  const startOfEventDay = Date.UTC(eventBogota.getUTCFullYear(), eventBogota.getUTCMonth(), eventBogota.getUTCDate());
  return Math.round((startOfEventDay - startOfToday) / (24 * 60 * 60 * 1000));
}

function daysRemainingCopy(daysUntil: number): { subjectPhrase: string; bodyPhrase: string } {
  if (daysUntil <= 0) return { subjectPhrase: 'Es hoy', bodyPhrase: 'hoy es' };
  if (daysUntil === 1) return { subjectPhrase: 'Falta 1 día', bodyPhrase: 'en 1 día tienes' };
  return { subjectPhrase: `Faltan ${daysUntil} días`, bodyPhrase: `en ${daysUntil} días tienes` };
}

function buildLocationFull(locationName?: string | null, locationAddress?: string | null): string {
  if (!locationName) return '';
  return locationAddress ? `${locationName} (${locationAddress})` : locationName;
}

function formatEventDateBogota(eventDateISO: string): string {
  return new Date(eventDateISO).toLocaleDateString('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: BOGOTA_TZ,
  });
}

function formatEventDateBuggyUTC(eventDateISO: string): string {
  return new Date(eventDateISO).toLocaleDateString('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  });
}

function formatTimeAmPm(time24: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec((time24 || '').trim());
  if (!match) return time24 || '';
  let h = parseInt(match[1], 10);
  const m = match[2];
  const suffix = h >= 12 ? 'p.m.' : 'a.m.';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${suffix}`;
}

// La hora en que se habilita el boton de entrar: la del evento menos 15 min.
function restarMinutos(time24?: string | null, minutos: number = MINUTOS_ANTES_ENTRAR): string {
  const m = /^(\d{1,2}):(\d{2})/.exec((time24 || '').trim());
  if (!m) return '';
  let total = parseInt(m[1], 10) * 60 + parseInt(m[2], 10) - minutos;
  if (total < 0) total += 24 * 60;
  const h24 = Math.floor(total / 60);
  const mm = total % 60;
  const suf = h24 >= 12 ? 'p.m.' : 'a.m.';
  let h = h24 % 12;
  if (h === 0) h = 12;
  return `${h}:${String(mm).padStart(2, '0')} ${suf}`;
}

function esVirtual(event: any): boolean {
  return event?.type === 'virtual';
}

function sameDaySendMinutesBogota(eventDateISO: string): number {
  const eventBogota = new Date(new Date(eventDateISO).getTime() - BOGOTA_OFFSET_MS);
  const eventMinutes = eventBogota.getUTCHours() * 60 + eventBogota.getUTCMinutes();
  const defaultSendMinutes = SAMEDAY_SEND_HOUR * 60;
  if (eventMinutes < defaultSendMinutes) {
    return Math.max(0, eventMinutes - EARLY_EVENT_BUFFER_MINUTES);
  }
  return defaultSendMinutes;
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

function htmlParagraph(txt: string, opts?: { strong?: boolean; muted?: boolean }): string {
  const color = opts?.muted ? '#6b7280' : '#1f2937';
  const size = opts?.muted ? '14px' : '16px';
  const inner = opts?.strong ? `<strong>${txt}</strong>` : txt;
  return `<p style="margin:0 0 12px; font-size:${size}; color:${color}; line-height:1.6; font-family: -apple-system, Helvetica, Arial, sans-serif;">${inner}</p>`;
}

// Links de las tiendas. La recomendacion de instalar la app cuelga de la
// dinamica, que es lo unico que de verdad se hace mejor desde la app: no se
// obliga a nadie, se recomienda en el momento en que tiene sentido.
// EXCEPCION: en un evento virtual la app no es una recomendacion, es la unica
// puerta al Meet. Ahi el tono cambia.
const TIENDA_ANDROID = 'https://play.google.com/store/apps/details?id=app.nospi.mobile';
const TIENDA_IPHONE = 'https://apps.apple.com/co/app/nospi/id6761556688';

// Dos botones pequenos, uno por tienda. Van dentro del cuerpo y no como CTA
// principal porque el correo ya usa el CTA para "Como llegar", y porque un
// correo no puede saber que telefono tiene quien lo abre.
function htmlBotonesTienda(): string {
  const boton = (url: string, label: string) =>
    `<a href="${url}" style="display:inline-block; margin:0 8px 8px 0; padding:10px 16px; border:1px solid #AD1457; border-radius:8px; color:#880E4F; text-decoration:none; font-size:14px; font-weight:bold; font-family: -apple-system, Helvetica, Arial, sans-serif;">${label}</a>`;
  return `<p style="margin:0 0 12px;">${boton(TIENDA_ANDROID, '🤖 Instalar en Android')}${boton(TIENDA_IPHONE, '🍎 Instalar en iPhone')}</p>`;
}

// Videollamada: en un Meet entre desconocidos nadie arranca solo. Estos pasos
// le dicen a cada uno que hacer al entrar, sin que nadie de Nospi este en la
// llamada. Mismo texto que BLOQUE_AL_ENTRAR_VIRTUAL del WhatsApp del admin.
const AL_ENTRAR_VIRTUAL = [
  '📹 Prende la cámara y saluda: venimos a conocernos, y eso pasa viéndonos las caras. Busca un lugar tranquilo con buena señal',
  '👋 Hagan una ronda rápida: cada uno dice su nombre y desde dónde se conecta. El que termine le pasa la palabra a otro',
  '🙋 Abran la Dinámica en la app: el primero que toque "Quiero ser el moderador" lleva el juego (la app le va diciendo qué hacer)',
  '✏️ Ten a mano papel y lápiz',
];

function buildSameDayText(firstName: string, event: any): { subject: string; text: string; html: string } {
  const virtual = esVirtual(event);
  const subject = event.time
    ? `Hoy, ${formatTimeAmPm(event.time)} · ${event.name || 'Nospi'}`
    : `Hoy · ${event.name || 'Nospi'}`;

  if (virtual) {
    const horaBoton = restarMinutos(event.time) || '15 minutos antes';
    const text = [
      `Hola ${firstName},`, '', `Hoy es "${event.name || 'tu evento'}" 🎉`,
      event.time ? `🕖 ${formatTimeAmPm(event.time)}` : null,
      '🎥 Por videollamada.', '',
      'Así entras:',
      '1. Abre Nospi y entra al evento',
      `2. Desde las ${horaBoton} aparece el botón "Entrar a la videollamada"`,
      '3. Tócalo: registra tu asistencia y abre la llamada', '',
      '⚠️ El enlace solo está ahí. Si no entras desde la app cuenta como falta, y con faltas se suspende la cuenta para reservar.', '',
      'Al entrar a la llamada:',
      ...AL_ENTRAR_VIRTUAL, '',
      'Al final eliges con quién hiciste clic: nadie se entera, y si es mutuo se abre un chat privado 🔒', '',
      '📲 ¿Aún sin la app? Instálala ya, o entra desde app.nospi.co',
      `🤖 ${TIENDA_ANDROID}`,
      `🍎 ${TIENDA_IPHONE}`, '',
      '¡Hoy Nospi! 🎉',
    ].filter((l) => l !== null).join('\n');

    const bodyHtml = [
      htmlParagraph(`Hola ${firstName},`),
      htmlParagraph(`Hoy es <strong>"${event.name || 'tu evento'}"</strong> 🎉`),
      htmlParagraph(`${event.time ? `🕖 <strong>${formatTimeAmPm(event.time)}</strong><br />` : ''}🎥 Por videollamada.`),
      htmlParagraph(`<strong>Así entras:</strong><br />1. Abre Nospi y entra al evento<br />2. Desde las <strong>${horaBoton}</strong> aparece el botón "Entrar a la videollamada"<br />3. Tócalo: registra tu asistencia y abre la llamada`),
      htmlParagraph('⚠️ El enlace solo está ahí. <strong>Si no entras desde la app cuenta como falta</strong>, y con faltas se suspende la cuenta para reservar.'),
      htmlParagraph(`<strong>Al entrar a la llamada:</strong><br />${AL_ENTRAR_VIRTUAL.join('<br />')}`),
      htmlParagraph('Al final eliges con quién hiciste clic: nadie se entera, y si es mutuo se abre un <strong>chat privado</strong> 🔒'),
      htmlParagraph('📲 ¿Aún sin la app? Instálala ya, o entra desde app.nospi.co', { muted: true }),
      htmlBotonesTienda(),
      htmlParagraph('¡Hoy Nospi! 🎉', { strong: true }),
    ].join('');
    // Nunca maps_link: el boton lleva a la app, que es donde vive el enlace.
    return { subject, text, html: wrapBrandedHtml(bodyHtml, URL_APP, 'Abrir mi evento') };
  }

  const locationFull = buildLocationFull(event.location_name, event.location_address);
  const text = [
    `Hola ${firstName},`, '', `Hoy es "${event.name || 'tu evento'}" 🎉`,
    event.time ? `🕖 ${formatTimeAmPm(event.time)}` : null,
    locationFull ? `📍 ${locationFull}` : null,
    event.maps_link ? `🗺️ ${event.maps_link}` : null, '',
    'Al llegar di que vienes de Nospi y te indican la mesa. Llega puntual: arrancamos con la dinámica para romper el hielo.', '',
    'Ya en la mesa abres la Dinámica y confirmas tu llegada: si no confirmas cuenta como falta, y con faltas se suspende la cuenta para reservar. Al final eliges con quién hiciste clic: nadie se entera, y si es mutuo se abre un chat privado 🔒', '',
    '📲 ¿Aún sin la app? Instálala antes de salir, que la dinámica va mejor desde ahí:',
    `🤖 ${TIENDA_ANDROID}`,
    `🍎 ${TIENDA_IPHONE}`, '',
    '¡Hoy Nospi! 🎉',
  ].filter((l) => l !== null).join('\n');

  const bodyHtml = [
    htmlParagraph(`Hola ${firstName},`),
    htmlParagraph(`Hoy es <strong>"${event.name || 'tu evento'}"</strong> 🎉`),
    htmlParagraph(`${event.time ? `🕖 <strong>${formatTimeAmPm(event.time)}</strong><br />` : ''}${locationFull ? `📍 <strong>${locationFull}</strong>` : ''}`),
    htmlParagraph('Al llegar di que vienes de Nospi y te indican la mesa. Llega puntual: arrancamos con la dinámica para romper el hielo.'),
    htmlParagraph('Ya en la mesa abres la <strong>Dinámica</strong> y confirmas tu llegada: <strong>si no confirmas cuenta como falta</strong>, y con faltas se suspende la cuenta para reservar. Al final eliges con quién hiciste clic: nadie se entera, y si es mutuo se abre un <strong>chat privado</strong> 🔒'),
    htmlParagraph('📲 ¿Aún sin la app? Instálala antes de salir, que la dinámica va mejor desde ahí.', { muted: true }),
    htmlBotonesTienda(),
    htmlParagraph('¡Hoy Nospi! 🎉', { strong: true }),
  ].join('');
  const html = wrapBrandedHtml(bodyHtml, event.maps_link || 'https://app.nospi.co/(tabs)/dinamica', event.maps_link ? 'Como llegar' : 'Abrir Dinámica');

  return { subject, text, html };
}

function buildEventStartText(firstName: string, event: any): { subject: string; text: string; html: string } {
  const virtual = esVirtual(event);
  const subject = '🎉 Rompan el hielo, abran la Dinámica';
  // Este es el UNICO correo que llega DESPUES de que arranco: para quien no
  // alcanzo a tocar el boton, es la ultima oportunidad antes de la falta.
  const rescate = virtual
    ? '¿Todavía no entraste? El botón para entrar a la videollamada está en el evento, dentro de la app.'
    : null;

  const text = [
    `Hola ${firstName},`, '',
    virtual
      ? `Tu videollamada "${event.name || 'Nospi'}" ya está en marcha.`
      : `Tu evento "${event.name || 'Nospi'}" ya está en marcha.`, '',
    ...(virtual
      ? ['Si todavía nadie arranca, arranca tú 😉', ...AL_ENTRAR_VIRTUAL, '', 'Dinámica: https://app.nospi.co/(tabs)/dinamica', '']
      : ['Abran la pestaña Dinámica en la app para romper el hielo con tu grupo: https://app.nospi.co/(tabs)/dinamica', '',
         'Elijan entre ustedes a alguien que se encargue de leer las preguntas en voz alta.', '']),
    rescate,
    rescate ? '' : null,
    '¡Que la pasen increíble! ¡Nospi! 🎉', 'Equipo Nospi',
  ].filter((l) => l !== null).join('\n');

  const bodyHtml = [
    htmlParagraph(`Hola ${firstName},`),
    htmlParagraph(virtual
      ? `Tu videollamada <strong>"${event.name || 'Nospi'}"</strong> ya está en marcha 🎉`
      : `Tu evento <strong>"${event.name || 'Nospi'}"</strong> ya está en marcha 🎉`),
    virtual
      ? htmlParagraph(`<strong>Si todavía nadie arranca, arranca tú 😉</strong><br />${AL_ENTRAR_VIRTUAL.join('<br />')}`)
      : htmlParagraph('Abran la pestaña <strong>Dinámica</strong> en la app para romper el hielo con tu grupo.'),
    virtual ? '' : htmlParagraph('Elijan entre ustedes a alguien que se encargue de leer las preguntas en voz alta.', { muted: true }),
    rescate ? htmlParagraph(`<strong>¿Todavía no entraste?</strong> El botón para entrar a la videollamada está en el evento, dentro de la app.`) : '',
    htmlParagraph('¡Que la pasen increíble! ¡Nospi! 🎉'),
  ].join('');

  const html = wrapBrandedHtml(bodyHtml, 'https://app.nospi.co/(tabs)/dinamica', 'Abrir Dinámica');
  return { subject, text, html };
}

function build48hText(firstName: string, event: any, now: Date): { subject: string; text: string; html: string } {
  const virtual = esVirtual(event);
  const formattedDate = formatEventDateBogota(event.date);
  const locationFull = buildLocationFull(event.location_name, event.location_address);
  const daysUntil = daysUntilEventBogota(now, event.date);
  const { bodyPhrase } = daysRemainingCopy(daysUntil);
  const esVispera = daysUntil === 1;
  const esHoy = daysUntil <= 0;

  if (virtual) {
    const horaBoton = restarMinutos(event.time);
    // El asunto nunca dice "ya tenemos el lugar": no hay lugar.
    const subject = esVispera
      ? `Mañana: ${event.name || 'tu evento'}${event.time ? `, ${formatTimeAmPm(event.time)}` : ''}`
      : esHoy
        ? `Hoy${event.time ? `, ${formatTimeAmPm(event.time)}` : ''} · ${event.name || 'tu evento'}`
        : `🎥 Tu videollamada de ${event.name || 'Nospi'} ya está lista`;
    const instalar = esHoy
      ? '📲 El enlace se abre desde la app de Nospi. Si no la tienes, instálala ya.'
      : esVispera
        ? '📲 El enlace se abre desde la app de Nospi. Si no la tienes, instálala hoy — mañana no vas a tener tiempo.'
        : '📲 El enlace se abre desde la app de Nospi. Si aún no la tienes, instálala ahora y ya queda resuelto.';
    const cuando = esVispera ? 'Mañana' : esHoy ? 'Hoy' : 'El día del evento';
    const botonLinea = `${cuando}${horaBoton ? ` desde las ${horaBoton}` : ''} te aparece el botón "Entrar a la videollamada" dentro del evento. Ese botón es el que registra tu asistencia.`;
    const cancelarTexto = esHoy
      ? null
      : esVispera
        ? '¿No puedes ir? Cancela hoy y conservas tu saldo. Mañana ya no alcanzamos a devolverlo y te queda una falta.'
        : '¿No puedes ir? Cancela hasta 24 h antes y conservas tu saldo. Después pierdes el saldo y te queda una falta.';

    const text = [
      `Hola ${firstName},`, '',
      esVispera ? `Mañana es "${event.name || 'tu evento'}".`
        : esHoy ? `Hoy es "${event.name || 'tu evento'}".`
        : `Te recordamos que ${bodyPhrase} "${event.name || 'tu evento'}".`,
      event.time ? `🕖 ${formatTimeAmPm(event.time)}` : `📅 ${formattedDate}`,
      '🎥 Por videollamada — no tienes que ir a ningún lado.', '',
      instalar,
      `🤖 ${TIENDA_ANDROID}`,
      `🍎 ${TIENDA_IPHONE}`, '',
      botonLinea, '',
      '📹 Conéctate con la cámara prendida: la idea es conocernos, y eso pasa viéndonos las caras. Ten a mano papel y lápiz 😉', '',
      cancelarTexto,
      cancelarTexto ? '' : null,
      'Equipo Nospi',
    ].filter((l) => l !== null).join('\n');

    const bodyHtml = [
      htmlParagraph(`Hola ${firstName},`),
      htmlParagraph(esVispera ? `Mañana es <strong>"${event.name || 'tu evento'}"</strong>.`
        : esHoy ? `Hoy es <strong>"${event.name || 'tu evento'}"</strong>.`
        : `Te recordamos que ${bodyPhrase} <strong>"${event.name || 'tu evento'}"</strong>.`),
      htmlParagraph(`${event.time ? `🕖 <strong>${formatTimeAmPm(event.time)}</strong><br />` : `📅 <strong>${formattedDate}</strong><br />`}🎥 Por videollamada.`),
      htmlParagraph(instalar),
      htmlBotonesTienda(),
      htmlParagraph(botonLinea.replace('Ese botón es el que registra tu asistencia.', '<strong>Ese botón es el que registra tu asistencia.</strong>')),
      htmlParagraph('📹 Conéctate con la cámara prendida: la idea es conocernos, y eso pasa viéndonos las caras. Ten a mano papel y lápiz 😉'),
      cancelarTexto ? htmlParagraph(cancelarTexto.replace('te queda una falta', '<strong>te queda una falta</strong>'), { muted: true }) : '',
    ].join('');
    // Nunca "Como llegar" ni maps_link: el enlace vive en la app.
    return { subject, text, html: wrapBrandedHtml(bodyHtml, URL_APP, 'Abrir mi evento') };
  }

  // El asunto dice cuando es, que es lo que la persona busca al abrirlo. El
  // anterior prometia "ya revelamos la ubicacion" y el cuerpo ni la mencionaba.
  const instalarTexto = esHoy
    ? '📲 Hoy en la mesa van a hacer la dinámica desde el celular. Si aún no tienes la app, instálala antes de salir.'
    : esVispera
      ? '📲 Mañana en la mesa van a hacer la dinámica desde el celular. Te recomiendo instalar la app hoy: abre de una, sin buscar el link, y te avisa cuando arranca.'
      : '📲 En la mesa van a hacer la dinámica desde el celular. Te recomiendo instalar la app desde ya: abre de una, sin buscar el link, y te avisa cuando arranca.';
  const cancelarTexto = esHoy
    ? null
    : esVispera
      ? '¿No puedes ir? Cancela hoy y conservas tu saldo. Mañana ya no alcanzamos a devolverlo y te queda una falta.'
      : '¿No puedes ir? Cancela hasta 24 h antes y conservas tu saldo. Después pierdes el saldo y te queda una falta.';
  const subject = esVispera
    ? `Mañana: ${event.name || 'tu evento'}${event.time ? `, ${formatTimeAmPm(event.time)}` : ''}`
    : esHoy
      ? `Hoy${event.time ? `, ${formatTimeAmPm(event.time)}` : ''} · ${event.name || 'tu evento'}`
      : `📍 Ya tenemos el lugar de ${event.name || 'tu evento'}`;
  const text = [
    `Hola ${firstName},`, '',
    esVispera
      ? `Mañana es "${event.name || 'tu evento'}".`
      : esHoy
        ? `Hoy es "${event.name || 'tu evento'}".`
        : `Te recordamos que ${bodyPhrase} "${event.name || 'tu evento'}".`,
    event.time ? `🕖 ${formatTimeAmPm(event.time)}` : `📅 ${formattedDate}`,
    locationFull ? `📍 ${locationFull}` : null,
    event.maps_link ? `🗺️ ${event.maps_link}` : null, '',
    instalarTexto,
    `🤖 ${TIENDA_ANDROID}`,
    `🍎 ${TIENDA_IPHONE}`, '',
    cancelarTexto,
    cancelarTexto ? '' : null,
    'Equipo Nospi',
  ].filter((l) => l !== null).join('\n');

  const bodyHtml = [
    htmlParagraph(`Hola ${firstName},`),
    htmlParagraph(esVispera
      ? `Mañana es <strong>"${event.name || 'tu evento'}"</strong>.`
      : esHoy
        ? `Hoy es <strong>"${event.name || 'tu evento'}"</strong>.`
        : `Te recordamos que ${bodyPhrase} <strong>"${event.name || 'tu evento'}"</strong>.`),
    htmlParagraph(`${event.time ? `🕖 <strong>${formatTimeAmPm(event.time)}</strong>` : `📅 <strong>${formattedDate}</strong>`}${locationFull ? `<br />📍 <strong>${locationFull}</strong>` : ''}`),
    htmlParagraph(instalarTexto),
    htmlBotonesTienda(),
    cancelarTexto ? htmlParagraph(`${cancelarTexto.replace('te queda una falta', '<strong>te queda una falta</strong>')}`, { muted: true }) : '',
  ].join('');
  const html = wrapBrandedHtml(bodyHtml, event.maps_link, event.maps_link ? 'Como llegar' : undefined);

  return { subject, text, html };
}

function build3dText(firstName: string, event: any): { subject: string; text: string; html: string } {
  const virtual = esVirtual(event);
  const formattedDate = formatEventDateBogota(event.date);
  const locationFull = buildLocationFull(event.location_name, event.location_address);
  const subject = `Faltan 3 días: ${event.name || 'tu evento'}`;

  if (virtual) {
    const text = [
      `Hola ${firstName},`, '', `En 3 días tienes "${event.name || 'tu evento'}".`,
      `📅 ${formattedDate}${event.time ? ` · ${formatTimeAmPm(event.time)}` : ''}`,
      '🎥 Por videollamada — no tienes que ir a ningún lado.', '',
      '📲 El enlace se abre desde la app de Nospi. Si aún no la tienes, instálala ahora y ya queda resuelto.',
      `🤖 ${TIENDA_ANDROID}`,
      `🍎 ${TIENDA_IPHONE}`, '',
      'Cancelas gratis hasta 24 h antes y conservas tu saldo. Después pierdes el saldo y te queda una falta en la cuenta.',
      '📋 https://app.nospi.co/politica-asistencia', '',
      '¡Nos pillamos! 😄', 'Equipo Nospi',
    ].filter((l) => l !== null).join('\n');

    const bodyHtml = [
      htmlParagraph(`Hola ${firstName},`),
      htmlParagraph(`En 3 días tienes <strong>"${event.name || 'tu evento'}"</strong>.`),
      htmlParagraph(`📅 <strong>${formattedDate}</strong>${event.time ? ` · <strong>${formatTimeAmPm(event.time)}</strong>` : ''}<br />🎥 Por videollamada — no tienes que ir a ningún lado.`),
      htmlParagraph('📲 El enlace se abre desde la app de Nospi. Si aún no la tienes, instálala ahora y ya queda resuelto.'),
      htmlBotonesTienda(),
      htmlParagraph('Cancelas gratis hasta <strong>24 h antes</strong> y conservas tu saldo. Después pierdes el saldo y <strong>te queda una falta</strong> en la cuenta. <a href="https://app.nospi.co/politica-asistencia" style="color:#880E4F;">Ver política</a>', { muted: true }),
      htmlParagraph('¡Nos pillamos! 😄', { strong: true }),
    ].join('');
    // Sin boton "Como llegar": no hay a donde llegar.
    return { subject, text, html: wrapBrandedHtml(bodyHtml, URL_APP, 'Abrir mi evento') };
  }

  const text = [
    `Hola ${firstName},`, '', `En 3 días tienes "${event.name || 'tu evento'}".`,
    `📅 ${formattedDate}${event.time ? ` · ${formatTimeAmPm(event.time)}` : ''}`,
    event.is_location_revealed && locationFull ? `📍 ${locationFull}` : '📍 El lugar te lo mandamos un día antes.',
    event.is_location_revealed && event.maps_link ? `🗺️ ${event.maps_link}` : null,
    '',
    'Cancelas gratis hasta 24 h antes y conservas tu saldo. Después pierdes el saldo y te queda una falta en la cuenta.',
    '📋 https://app.nospi.co/politica-asistencia', '',
    '¡Nos pillamos! 😄', 'Equipo Nospi',
  ].filter((l) => l !== null).join('\n');

  const bodyHtml = [
    htmlParagraph(`Hola ${firstName},`),
    htmlParagraph(`En 3 días tienes <strong>"${event.name || 'tu evento'}"</strong>.`),
    htmlParagraph(`📅 <strong>${formattedDate}</strong>${event.time ? ` · <strong>${formatTimeAmPm(event.time)}</strong>` : ''}<br />${event.is_location_revealed && locationFull ? `📍 <strong>${locationFull}</strong>` : '📍 El lugar te lo mandamos un día antes.'}`),
    htmlParagraph('Cancelas gratis hasta <strong>24 h antes</strong> y conservas tu saldo. Después pierdes el saldo y <strong>te queda una falta</strong> en la cuenta. <a href="https://app.nospi.co/politica-asistencia" style="color:#880E4F;">Ver política</a>', { muted: true }),
    htmlParagraph('¡Nos pillamos! 😄', { strong: true }),
  ].join('');
  const ctaUrl = event.is_location_revealed ? event.maps_link : undefined;
  const html = wrapBrandedHtml(bodyHtml, ctaUrl, ctaUrl ? 'Como llegar' : undefined);

  return { subject, text, html };
}

function buildCorrectionText(firstName: string, event: any): { subject: string; text: string; html: string } {
  const correctDate = formatEventDateBogota(event.date);
  const wrongDate = formatEventDateBuggyUTC(event.date);
  const locationFull = buildLocationFull(event.location_name, event.location_address);
  const subject = `Correccion: la fecha de "${event.name || 'tu evento'}" en el correo anterior estaba mal`;
  const text = [
    `Hola ${firstName},`, '',
    `Te escribimos porque el correo que te enviamos antes tenia un error: decia que "${event.name || 'tu evento'}" era el ${wrongDate}, pero en realidad es el ${correctDate}. Disculpa la confusion.`, '',
    `Fecha: ${correctDate}`,
    event.time ? `Hora: ${formatTimeAmPm(event.time)}` : null,
    locationFull ? `Lugar: ${locationFull}` : null,
    event.maps_link ? `Como llegar: ${event.maps_link}` : null, '',
    '¡Nos pillamos! 😄', 'Equipo Nospi',
  ].filter((l) => l !== null).join('\n');

  const bodyHtml = [
    htmlParagraph(`Hola ${firstName},`),
    htmlParagraph(`Te escribimos porque el correo que te enviamos antes tenía un error: decía que <strong>"${event.name || 'tu evento'}"</strong> era el ${wrongDate}, pero en realidad es el <strong>${correctDate}</strong>. Disculpa la confusión.`),
    htmlParagraph(`Fecha correcta: <strong>${correctDate}</strong>`),
    event.time ? htmlParagraph(`Hora: <strong>${formatTimeAmPm(event.time)}</strong>`) : '',
    locationFull ? htmlParagraph(`Lugar: <strong>${locationFull}</strong>`) : '',
    htmlParagraph('¡Nos pillamos! 😄', { strong: true }),
  ].join('');
  const html = wrapBrandedHtml(bodyHtml, event.maps_link, event.maps_link ? 'Como llegar' : undefined);

  return { subject, text, html };
}

serve(async (req) => {
  try {
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ skipped: true, reason: 'RESEND_API_KEY no configurada' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const results: any[] = [];

    let targetEventId: string | null = null;
    let previewEmail: string | null = null;
    let previewType: string = 'sameday';
    let previewTag: string = '';
    let sendCorrection = false;
    let onlyEmails: string[] | null = null;
    try {
      const body = await req.json();
      if (body && typeof body.event_id === 'string' && body.event_id.length > 0) targetEventId = body.event_id;
      if (body && typeof body.preview_email === 'string' && body.preview_email.length > 0) previewEmail = body.preview_email;
      if (body && typeof body.preview_type === 'string' && ['48h', 'sameday', '3d', 'event_start'].includes(body.preview_type)) previewType = body.preview_type;
      if (body && typeof body.preview_tag === 'string') previewTag = body.preview_tag;
      if (body && body.send_correction === true) sendCorrection = true;
      if (body && Array.isArray(body.only_emails) && body.only_emails.length > 0) {
        onlyEmails = body.only_emails.map((e: string) => e.toLowerCase());
      }
    } catch (_e) { /* invocacion normal del cron, seguir */ }

    const now = new Date();

    if (targetEventId && sendCorrection) {
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('name, date, time, location_name, location_address, maps_link, type')
        .eq('id', targetEventId)
        .single();

      if (eventError || !eventData) {
        results.push({ block: 'correction', error: eventError?.message || 'evento no encontrado' });
      } else {
        const { data: appts, error: apptsError } = await supabase
          .from('appointments')
          .select('id, users!inner ( name, email )')
          .eq('event_id', targetEventId)
          .eq('status', 'confirmada');

        if (apptsError) {
          results.push({ block: 'correction', error: apptsError.message });
        } else {
          for (const apt of appts || []) {
            const user = (apt as any).users;
            if (!user?.email) continue;
            if (onlyEmails && !onlyEmails.includes(user.email.toLowerCase())) continue;
            const firstName = (user.name || '').trim().split(' ')[0] || 'ahi';
            const built = buildCorrectionText(firstName, eventData);
            const { ok, errorText } = await sendEmail(user.email, built.subject, built.text, built.html);
            results.push({ block: 'correction', appointmentId: apt.id, to: user.email, ok, errorText });
          }
        }
      }

      return new Response(JSON.stringify({ processed: results.length, results }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (targetEventId && previewEmail) {
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('name, date, time, location_name, location_address, maps_link, is_location_revealed, type')
        .eq('id', targetEventId)
        .single();

      if (eventError || !eventData) {
        results.push({ block: 'preview', error: eventError?.message || 'evento no encontrado' });
      } else {
        let built: { subject: string; text: string; html?: string };
        if (previewType === '48h') built = build48hText('Johnatan', eventData, now);
        else if (previewType === '3d') built = build3dText('Johnatan', eventData);
        else if (previewType === 'event_start') built = buildEventStartText('Johnatan', eventData);
        else built = buildSameDayText('Johnatan', eventData);
        const tagSuffix = previewTag ? ` [${previewTag}]` : '';
        const { ok } = await sendEmail(previewEmail, `[PREVIEW]${tagSuffix} ${built.subject}`, built.text, built.html);
        results.push({ block: 'preview', type: previewType, to: previewEmail, ok });
      }

      return new Response(JSON.stringify({ processed: results.length, results }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (targetEventId) {
      const { data: appointments48h, error: error48h } = await supabase
        .from('appointments')
        .select(`id, user_id, event_id, users!inner ( name, email ), events!inner ( name, date, time, location_name, location_address, maps_link, is_location_revealed, type )`)
        .eq('status', 'confirmada')
        .is('reminder_48h_email_sent_at', null)
        .eq('event_id', targetEventId);

      if (error48h) {
        results.push({ block: '48h', error: error48h.message });
      } else {
        for (const apt of appointments48h || []) {
          const user = (apt as any).users;
          const event = (apt as any).events;
          if (!user?.email) continue;
          if (!event.is_location_revealed) {
            results.push({ block: '48h', appointmentId: apt.id, skipped: true, reason: 'ubicacion no revelada' });
            continue;
          }
          const firstName = (user.name || '').trim().split(' ')[0] || 'ahi';
          const { subject, text, html } = build48hText(firstName, event, now);
          const { ok } = await sendEmail(user.email, subject, text, html);
          if (ok) await supabase.from('appointments').update({ reminder_48h_email_sent_at: new Date().toISOString() }).eq('id', apt.id);
          results.push({ block: '48h', appointmentId: apt.id, ok });
        }
      }
    }

    if (!targetEventId) {
      const nowBogota = new Date(now.getTime() - BOGOTA_OFFSET_MS);
      const year = nowBogota.getUTCFullYear();
      const month = nowBogota.getUTCMonth();
      const day = nowBogota.getUTCDate();

      const startOfDayPlus3 = new Date(Date.UTC(year, month, day, 0, 0, 0) + BOGOTA_OFFSET_MS + 3 * 24 * 60 * 60 * 1000);
      const startOfDayPlus4 = new Date(startOfDayPlus3.getTime() + 24 * 60 * 60 * 1000);

      const { data: appointments3d, error: error3d } = await supabase
        .from('appointments')
        .select(`id, user_id, event_id, users!inner ( name, email ), events!inner ( name, date, time, location_name, location_address, maps_link, is_location_revealed, type )`)
        .eq('status', 'confirmada')
        .is('reminder_3d_email_sent_at', null)
        .gte('events.date', startOfDayPlus3.toISOString())
        .lt('events.date', startOfDayPlus4.toISOString());

      if (error3d) {
        results.push({ block: '3d', error: error3d.message });
      } else {
        for (const apt of appointments3d || []) {
          const user = (apt as any).users;
          const event = (apt as any).events;
          if (!user?.email) continue;
          const firstName = (user.name || '').trim().split(' ')[0] || 'ahi';
          const { subject, text, html } = build3dText(firstName, event);
          const { ok } = await sendEmail(user.email, subject, text, html);
          if (ok) await supabase.from('appointments').update({ reminder_3d_email_sent_at: new Date().toISOString() }).eq('id', apt.id);
          results.push({ block: '3d', appointmentId: apt.id, ok });
        }
      }

      const nowBogotaMinutes = nowBogota.getUTCHours() * 60 + nowBogota.getUTCMinutes();
      const startOfTodayBogotaUTC = new Date(Date.UTC(year, month, day, 0, 0, 0) + BOGOTA_OFFSET_MS);
      const endOfTodayBogotaUTC = new Date(startOfTodayBogotaUTC.getTime() + 24 * 60 * 60 * 1000);

      const { data: appointmentsSameDay, error: errorSameDay } = await supabase
        .from('appointments')
        .select(`id, user_id, event_id, users!inner ( name, email ), events!inner ( name, date, time, location_name, location_address, maps_link, is_location_revealed, type )`)
        .eq('status', 'confirmada')
        .is('sameday_reminder_email_sent_at', null)
        .gte('events.date', startOfTodayBogotaUTC.toISOString())
        .lt('events.date', endOfTodayBogotaUTC.toISOString());

      if (errorSameDay) {
        results.push({ block: 'sameday', error: errorSameDay.message });
      } else {
        for (const apt of appointmentsSameDay || []) {
          const user = (apt as any).users;
          const event = (apt as any).events;
          if (!user?.email) continue;
          const targetMinutes = sameDaySendMinutesBogota(event.date);
          if (nowBogotaMinutes < targetMinutes) {
            results.push({ block: 'sameday', appointmentId: apt.id, skipped: true, reason: `aun no es hora (objetivo ${String(Math.floor(targetMinutes / 60)).padStart(2, '0')}:${String(targetMinutes % 60).padStart(2, '0')} Bogota)` });
            continue;
          }
          if (!event.is_location_revealed) {
            results.push({ block: 'sameday', appointmentId: apt.id, skipped: true, reason: 'ubicacion no revelada' });
            continue;
          }
          const firstName = (user.name || '').trim().split(' ')[0] || 'ahi';
          const { subject, text, html } = buildSameDayText(firstName, event);
          const { ok } = await sendEmail(user.email, subject, text, html);
          if (ok) await supabase.from('appointments').update({ sameday_reminder_email_sent_at: new Date().toISOString() }).eq('id', apt.id);
          results.push({ block: 'sameday', appointmentId: apt.id, ok });
        }
      }

      // Inicio del evento + 5 min: dispara cuando events.date <= now -
      // EVENT_START_DELAY_MS, o sea justo cuando la app libera "Continuar".
      const startTarget = new Date(now.getTime() - EVENT_START_DELAY_MS);
      const startGraceStart = new Date(startTarget.getTime() - PRECISION_GRACE_MS);

      const { data: appointmentsStart, error: errorStart } = await supabase
        .from('appointments')
        .select(`id, user_id, event_id, users!inner ( name, email ), events!inner ( name, date, type )`)
        .eq('status', 'confirmada')
        .is('event_start_email_sent_at', null)
        .lte('events.date', startTarget.toISOString())
        .gt('events.date', startGraceStart.toISOString());

      if (errorStart) {
        results.push({ block: 'event_start', error: errorStart.message });
      } else {
        for (const apt of appointmentsStart || []) {
          const user = (apt as any).users;
          const event = (apt as any).events;
          if (!user?.email) continue;
          const firstName = (user.name || '').trim().split(' ')[0] || 'ahi';
          const { subject, text, html } = buildEventStartText(firstName, event);
          const { ok } = await sendEmail(user.email, subject, text, html);
          if (ok) await supabase.from('appointments').update({ event_start_email_sent_at: new Date().toISOString() }).eq('id', apt.id);
          results.push({ block: 'event_start', appointmentId: apt.id, ok });
        }
      }
    }

    return new Response(JSON.stringify({ processed: results.length, results }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
