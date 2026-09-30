import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://wjdiraurfbawotlcndmk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const META_WHATSAPP_TOKEN = Deno.env.get('META_WHATSAPP_TOKEN') || '';
const META_PHONE_NUMBER_ID = Deno.env.get('META_PHONE_NUMBER_ID') || '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const ADMIN_EMAIL = 'nospisocial@gmail.com';

const TEMPLATE_NAME = 'confirmacion_compra';
const TEMPLATE_LANG = 'es_CO';

const WEBHOOK_SECRET = 'nospi_purchase_wh_9d2f7a4c1e8b3f6a';

// Links cortos de instalar (detectan el celular y mandan a la tienda correcta).
// En un evento virtual el enlace del Meet no viaja por correo: se abre desde
// la app, y ese boton es el que registra la asistencia.
const LINK_APP = 'https://nospi.co/app';
const LINK_MEET = 'https://nospi.co/meet';

function formatEventDateBogota(eventDateISO: string): string {
  return new Date(eventDateISO).toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Bogota',
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

// Etiqueta legible de la forma de pago a partir del valor de payment_method.
function paymentMethodLabel(pm: string | null | undefined): string {
  switch ((pm || '').toLowerCase()) {
    case 'virtual_balance': return 'Saldo a favor (virtual)';
    case 'subscription': return 'Suscripción mensual';
    case 'free': return 'Gratis / cortesía';
    case 'pse': return 'PSE';
    case 'nequi': return 'Nequi';
    case 'card': return 'Tarjeta';
    case 'bancolombia':
    case 'banc': return 'Bancolombia';
    default: return pm ? pm : 'Desconocido';
  }
}

// ¿Esta forma de pago devuelve saldo al cancelar a tiempo? Los suscriptores y
// las cortesías/gratis no pagan con saldo, así que no aplica "devolución de saldo".
function paymentGivesBalanceBack(pm: string | null | undefined): boolean {
  const v = (pm || '').toLowerCase();
  return v !== 'subscription' && v !== 'free';
}

function formatCop(n: number | null | undefined): string | null {
  if (n === null || n === undefined) return null;
  try { return '$' + Number(n).toLocaleString('es-CO'); } catch { return `$${n}`; }
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

// Links cortos de nospi.co: cada uno detecta el celular y manda a la tienda
// correcta (App Store o Play Store). En videollamada va tambien Google Meet.
function htmlBotonesTienda(virtual = false): string {
  const boton = (url: string, label: string) =>
    `<a href="${url}" style="display:inline-block; margin:0 8px 8px 0; padding:10px 16px; border:1px solid #AD1457; border-radius:8px; color:#880E4F; text-decoration:none; font-size:14px; font-weight:bold; font-family: -apple-system, Helvetica, Arial, sans-serif;">${label}</a>`;
  return `<p style="margin:0 0 12px;">${boton(LINK_APP, '📲 Instalar Nospi')}${virtual ? boton(LINK_MEET, '🎥 Instalar Google Meet') : ''}</p>`;
}

// Todas las funciones de envio devuelven true SOLO si Resend acepto el correo.
// Antes devolvian void y el error se quedaba en console.error, asi que la fila
// se marcaba como "enviado" aunque el correo nunca hubiera salido.
async function sendConfirmationEmail(params: { email: string; firstName: string; eventName: string; formattedDate: string; time: string; paymentMethod?: string | null; eventType?: string | null }): Promise<boolean> {
  if (!RESEND_API_KEY || !params.email) return false;
  try {
    const subject = `Listo, quedaste dentro de ${params.eventName}`;
    const esVirtual = params.eventType === 'virtual';

    // La politica de cancelacion depende de la forma de pago:
    //  - Variante A (pagos con dinero/saldo): al cancelar a tiempo se devuelve el saldo.
    //  - Variante B (suscripcion / cortesia): no hay saldo que devolver.
    // Las dos nombran la falta: a quien no le importa perder el saldo si le
    // importa que le suspendan la cuenta, y la silla vacia nos duele igual.
    const givesBalanceBack = paymentGivesBalanceBack(params.paymentMethod);

    // "Si no llegas" no significa nada en una videollamada: ahi se entra.
    const noAparecer = esVirtual ? 'si no entras' : 'si no llegas';

    const cancelPolicyText = givesBalanceBack
      ? `Cancelas gratis hasta 24 h antes y conservas tu saldo. Con menos de 24 h o ${noAparecer}, pierdes el saldo y te queda una falta — y con faltas se suspende la cuenta para reservar.`
      : `Cancelas gratis hasta 24 h antes, sin problema. Con menos de 24 h o ${noAparecer}, te queda una falta — y con faltas se suspende la cuenta para reservar.`;

    // El enlace del Meet NO va en este correo, a proposito: solo se abre desde
    // el boton de la app, y ese boton es el que registra la asistencia. Si
    // viajara por correo se reenviaria y se entraria sin pasar por la app.
    const accesoText = esVirtual
      ? '🎥 Es por videollamada, desde donde estés.'
      : '📍 El lugar te lo mandamos un día antes.';

    // Se repite a proposito en todo el camino (compra, recordatorios, reglas):
    // quien entra con la camara apagada rompe la experiencia del grupo.
    const camaraText = esVirtual
      ? '📹 Ojo: es con la cámara prendida. De eso se trata, de conocernos las caras, no de hablar con cuadritos negros 😉'
      : null;

    // Mismos textos que el WhatsApp de compra: lo que se gana instalando Nospi.
    const appText = esVirtual
      ? '📲 Antes de la llamada instala Nospi y Google Meet. En Nospi está todo: el enlace de la llamada, la dinámica y el chat con tus matches. Y te avisa cuando arranca 🔔'
      : '📲 Para vivir la dinámica completa, instala Nospi. Ahí te avisamos cuando revelamos el lugar, cuando arranca la dinámica y cuando alguien con quien hiciste clic te escribe 💬';

    const text = [
      `Hola ${params.firstName || ''}${params.firstName ? ',' : ''}`,
      '',
      `Quedaste dentro de "${params.eventName}".`,
      params.time ? `📅 ${params.formattedDate} · ${params.time}` : `📅 ${params.formattedDate}`,
      accesoText,
      camaraText,
      '',
      appText,
      appText ? 'Nospi 👉 nospi.co/app' : null,
      esVirtual ? 'Google Meet 👉 nospi.co/meet' : null,
      appText ? '' : null,
      cancelPolicyText,
      '📋 https://app.nospi.co/politica-asistencia',
      '',
      '¡Nos pillamos! 😄',
      'Equipo Nospi',
    ].filter((l) => l !== null).join('\n');

    const cancelPolicyHtml = givesBalanceBack
      ? `Cancelas gratis hasta <strong>24 h antes</strong> y conservas tu saldo. Con menos de 24 h o ${noAparecer}, pierdes el saldo y <strong>te queda una falta</strong> — y con faltas se suspende la cuenta para reservar.`
      : `Cancelas gratis hasta <strong>24 h antes</strong>, sin problema. Con menos de 24 h o ${noAparecer}, <strong>te queda una falta</strong> — y con faltas se suspende la cuenta para reservar.`;

    const bodyHtml = [
      htmlParagraph(`Hola ${params.firstName || ''}${params.firstName ? ',' : ''}`),
      htmlParagraph(`Quedaste dentro de <strong>"${params.eventName}"</strong> 🎉`),
      htmlParagraph(`📅 ${params.formattedDate}${params.time ? ` · ${params.time}` : ''}<br />${accesoText}`),
      camaraText ? htmlParagraph(`<strong>${camaraText}</strong>`) : '',
      appText ? htmlParagraph(appText) : '',
      htmlBotonesTienda(esVirtual),
      htmlParagraph(`${cancelPolicyHtml} <a href="https://app.nospi.co/politica-asistencia" style="color:#880E4F;">Ver la política completa</a>`, { muted: true }),
      htmlParagraph('¡Nos pillamos! 😄'),
    ].join('');
    // "Ver mi cupo" no va a la raiz (esa es la pestaña Eventos, para comprar):
    // presencial va a Citas, donde esta la reserva; videollamada a la Dinamica,
    // que desde la compra explica como va a ser la llamada.
    const html = wrapBrandedHtml(bodyHtml, esVirtual ? 'https://app.nospi.co/dinamica' : 'https://app.nospi.co/appointments', 'Ver mi cupo');

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Nospi <noreply@nospi.co>', to: [params.email], subject, text, html }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error('notify-purchase-confirmation: error enviando correo:', res.status, errText);
      return false;
    }
    return true;
  } catch (e) {
    console.error('notify-purchase-confirmation: excepcion enviando correo:', e);
    return false;
  }
}

// Correo interno al admin cuando alguien confirma un cupo. Ahora incluye la
// forma de pago y, si usó código de promoción, cuál fue (con el % aplicado).
// El asunto cambia según el tipo para poder filtrarlo/verlo de un vistazo.
async function sendAdminPurchaseEmail(params: {
  userName: string;
  userEmail?: string;
  userPhone?: string;
  eventName: string;
  formattedDate: string;
  time: string;
  paymentMethod?: string | null;
  amountPaidCop?: number | null;
  remainingBalanceCop?: number | null;
  promo?: { code: string; discount?: number | null } | null;
}): Promise<boolean> {
  if (!RESEND_API_KEY) return false;
  try {
    const nombre = params.userName || 'Un usuario';
    const evento = params.eventName;
    const pm = (params.paymentMethod || '').toLowerCase();

    // Asunto según el tipo (prioridad: promo > saldo > suscripción > gratis > pago normal).
    let subject: string;
    if (params.promo) {
      subject = `🎟️ PROMO ${params.promo.code} — ${nombre} → ${evento}`;
    } else if (pm === 'virtual_balance') {
      subject = `💳 SALDO — ${nombre} → ${evento}`;
    } else if (pm === 'subscription') {
      subject = `🔁 SUSCRIPCIÓN — ${nombre} → ${evento}`;
    } else if (pm === 'free') {
      subject = `🎟️ Gratis — ${nombre} → ${evento}`;
    } else {
      subject = `💰 Compra confirmada — ${nombre} → ${evento}`;
    }

    const promoLine = params.promo
      ? `Código de promo: ${params.promo.code}${(params.promo.discount ?? null) !== null ? ` (−${params.promo.discount}%)` : ''}`
      : null;
    const amountStr = formatCop(params.amountPaidCop);
    const saldoStr = (params.remainingBalanceCop !== null && params.remainingBalanceCop !== undefined)
      ? formatCop(params.remainingBalanceCop) : null;

    const text = [
      `${nombre} confirmó su cupo para "${evento}".`,
      '',
      `Evento: ${evento}`,
      `Fecha: ${params.formattedDate}`,
      params.time ? `Hora: ${params.time}` : null,
      '',
      `Forma de pago: ${paymentMethodLabel(params.paymentMethod)}`,
      amountStr ? `Monto pagado: ${amountStr}` : null,
      promoLine,
      saldoStr ? `Saldo restante de la persona: ${saldoStr}` : null,
      '',
      `Usuario: ${nombre}`,
      params.userEmail ? `Correo: ${params.userEmail}` : null,
      params.userPhone ? `Telefono: ${params.userPhone}` : null,
    ].filter((l) => l !== null).join('\n');

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Nospi <noreply@nospi.co>', to: [ADMIN_EMAIL], subject, text }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error('notify-purchase-confirmation: error enviando correo admin:', res.status, errText);
      return false;
    }
    return true;
  } catch (e) {
    console.error('notify-purchase-confirmation: excepcion enviando correo admin:', e);
    return false;
  }
}

async function sendAdminRecurrentEmail(params: {
  userName: string;
  userEmail?: string;
  userPhone?: string;
  eventName: string;
  formattedDate: string;
  time: string;
  previousCount: number;
  paymentMethod?: string | null;
  remainingBalanceCop?: number | null;
  promo?: { code: string; discount?: number | null } | null;
}): Promise<boolean> {
  if (!RESEND_API_KEY) return false;
  try {
    const totalCitas = params.previousCount + 1;
    const subject = `🔁 Usuario recurrente: ${params.userName || 'Un usuario'} vuelve (cita #${totalCitas}) - ${params.eventName}`;
    const promoLine = params.promo
      ? `Código de promo: ${params.promo.code}${(params.promo.discount ?? null) !== null ? ` (−${params.promo.discount}%)` : ''}`
      : null;
    const saldoStr = (params.remainingBalanceCop !== null && params.remainingBalanceCop !== undefined)
      ? formatCop(params.remainingBalanceCop) : null;
    const text = [
      `${params.userName || 'Un usuario'} volvio a reservar: ya tenia ${params.previousCount} ${params.previousCount === 1 ? 'cita' : 'citas'} en otros eventos y acaba de confirmar una nueva.`,
      '',
      `Nuevo evento: ${params.eventName}`,
      `Fecha: ${params.formattedDate}`,
      params.time ? `Hora: ${params.time}` : null,
      '',
      `Forma de pago: ${paymentMethodLabel(params.paymentMethod)}`,
      promoLine,
      saldoStr ? `Saldo restante de la persona: ${saldoStr}` : null,
      '',
      `Usuario: ${params.userName || '-'}`,
      params.userEmail ? `Correo: ${params.userEmail}` : null,
      params.userPhone ? `Telefono: ${params.userPhone}` : null,
      `Total de citas historicas (incluyendo esta): ${totalCitas}`,
    ].filter((l) => l !== null).join('\n');

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Nospi <noreply@nospi.co>', to: [ADMIN_EMAIL], subject, text }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error('notify-purchase-confirmation: error enviando correo recurrente:', res.status, errText);
      return false;
    }
    return true;
  } catch (e) {
    console.error('notify-purchase-confirmation: excepcion enviando correo recurrente:', e);
    return false;
  }
}

serve(async (req) => {
  try {
    const secret = req.headers.get('x-webhook-secret');
    if (secret !== WEBHOOK_SECRET) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const { appointment_id } = await req.json();
    if (!appointment_id) {
      return new Response(JSON.stringify({ error: 'appointment_id requerido' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: apt, error } = await supabase
      .from('appointments')
      .select(`
        id, status, user_id, event_id, payment_method, amount_paid_cop, purchase_whatsapp_sent_at, purchase_email_sent_at,
        users!inner ( name, phone, email, virtual_balance ),
        events!inner ( name, date, time, type )
      `)
      .eq('id', appointment_id)
      .single();

    if (error || !apt) {
      return new Response(JSON.stringify({ error: error?.message || 'cita no encontrada' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    if (apt.status !== 'confirmada') {
      return new Response(JSON.stringify({ skipped: true, reason: 'la cita ya no esta confirmada' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const user = (apt as any).users;
    const event = (apt as any).events;
    const firstName = (user?.name || '').trim().split(' ')[0] || 'ahi';
    const formattedDate = event.date ? formatEventDateBogota(event.date) : 'Fecha sin definir';
    const formattedTime = event.date && event.time ? formatTimeAmPm(event.time) : 'Por definir';
    const paymentMethod = (apt as any).payment_method ?? null;
    const amountPaidCop = (apt as any).amount_paid_cop ?? null;
    // Saldo virtual que le queda a la persona DESPUÉS de esta inscripción
    // (si pagó con saldo, ya viene descontado).
    const remainingBalanceCop = user?.virtual_balance ?? null;

    // ¿Usó código de promoción en ESTA inscripción? Se busca por appointment_id
    // en promo_code_redemptions y se resuelve el código en promo_codes.
    let promo: { code: string; discount?: number | null } | null = null;
    try {
      const { data: redemption } = await supabase
        .from('promo_code_redemptions')
        .select('discount_percent_applied, promo_code_id')
        .eq('appointment_id', appointment_id)
        .maybeSingle();
      if (redemption && (redemption as any).promo_code_id) {
        const { data: pc } = await supabase
          .from('promo_codes')
          .select('code')
          .eq('id', (redemption as any).promo_code_id)
          .maybeSingle();
        if (pc && (pc as any).code) {
          promo = { code: (pc as any).code, discount: (redemption as any).discount_percent_applied ?? null };
        }
      }
    } catch (e) {
      console.error('notify-purchase-confirmation: error resolviendo promo:', e);
    }

    let emailResult: any = { skipped: true, reason: 'ya enviado previamente' };
    if (!apt.purchase_email_sent_at) {
      // Si el usuario no tiene correo no hay nada que enviarle: eso no es un
      // fallo del sistema, asi que no debe impedir marcar la fila.
      let userEmailOk = true;
      if (user?.email) {
        userEmailOk = await sendConfirmationEmail({
          email: user.email,
          firstName,
          eventName: event.name || 'tu evento',
          formattedDate,
          time: formattedTime,
          paymentMethod,
          eventType: event.type ?? null,
        });
      }

      const adminEmailOk = await sendAdminPurchaseEmail({
        userName: user?.name || '',
        userEmail: user?.email,
        userPhone: user?.phone,
        eventName: event.name || 'un evento',
        formattedDate,
        time: formattedTime,
        paymentMethod,
        amountPaidCop,
        remainingBalanceCop,
        promo,
      });

      let recurrentOk = true;
      let previousCount = 0;
      try {
        const { count, error: countError } = await supabase
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', (apt as any).user_id)
          .neq('event_id', (apt as any).event_id)
          .neq('id', appointment_id)
          .in('status', ['confirmada', 'anterior']);

        previousCount = count ?? 0;
        if (!countError && previousCount >= 1) {
          recurrentOk = await sendAdminRecurrentEmail({
            userName: user?.name || '',
            userEmail: user?.email,
            userPhone: user?.phone,
            eventName: event.name || 'un evento',
            formattedDate,
            time: formattedTime,
            previousCount,
            paymentMethod,
            remainingBalanceCop,
            promo,
          });
        }
      } catch (e) {
        console.error('notify-purchase-confirmation: error evaluando recurrencia:', e);
      }

      // Solo se marca como enviado si Resend acepto TODOS los correos que
      // tocaba mandar. Si alguno fallo, la fila queda sin marcar para que un
      // reintento lo vuelva a intentar y para que el dato no mienta.
      const allOk = userEmailOk && adminEmailOk && recurrentOk;
      if (allOk) {
        await supabase.from('appointments').update({ purchase_email_sent_at: new Date().toISOString() }).eq('id', appointment_id);
      } else {
        console.error('notify-purchase-confirmation: no se marca purchase_email_sent_at porque fallo algun envio', {
          appointment_id, userEmailOk, adminEmailOk, recurrentOk,
        });
      }
      emailResult = { userEmailOk, adminEmailOk, recurrentOk, marked: allOk };
    }

    let whatsappResult: any = { skipped: true, reason: 'ya enviado previamente' };
    if (!apt.purchase_whatsapp_sent_at) {
      if (!META_WHATSAPP_TOKEN || !META_PHONE_NUMBER_ID) {
        whatsappResult = { skipped: true, reason: 'META_WHATSAPP_TOKEN o META_PHONE_NUMBER_ID no configurados aun' };
      } else if (!user?.phone) {
        whatsappResult = { skipped: true, reason: 'usuario sin telefono' };
      } else {
        const digits = user.phone.replace(/\D/g, '');
        const payload = {
          messaging_product: 'whatsapp',
          to: digits,
          type: 'template',
          template: {
            name: TEMPLATE_NAME,
            language: { code: TEMPLATE_LANG },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: firstName },
                  { type: 'text', text: event.name || 'tu evento' },
                  { type: 'text', text: formattedDate },
                  { type: 'text', text: formattedTime },
                ],
              },
            ],
          },
        };

        const res = await fetch(`https://graph.facebook.com/v20.0/${META_PHONE_NUMBER_ID}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${META_WHATSAPP_TOKEN}` },
          body: JSON.stringify(payload),
        });
        const resData = await res.json();
        whatsappResult = { ok: res.ok, response: resData };

        if (res.ok) {
          await supabase.from('appointments').update({ purchase_whatsapp_sent_at: new Date().toISOString() }).eq('id', appointment_id);
        }
      }
    }

    return new Response(JSON.stringify({ emails: emailResult, whatsapp: whatsappResult }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
