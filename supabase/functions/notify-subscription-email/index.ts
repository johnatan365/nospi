// Supabase Edge Function: notify-subscription-email
// Envia un correo AL SUSCRIPTOR cuando activa, cancela o reactiva su
// suscripcion. verify_jwt:true (se llama desde la app autenticada).
//
// v13: soporte de planes de varios meses. Antes la funcion asumia que TODA
// suscripcion era mensual: escribia "/mes" en el valor y "tu suscripcion
// mensual" en el cuerpo. Como ademas la app le mandaba el precio mensual fijo
// (subscription_price) en vez del precio del plan elegido, a quien compraba
// 3 meses por $59.000 le llegaba un correo diciendo "$29.900 COP/mes" y con el
// proximo cobro a 30 dias. Ahora recibe planType y arma el texto correcto.
// v10: ademas del correo al suscriptor, se avisa al ADMIN en los TRES casos.
// v9: guino de marca Nospi (nos pillamos) en la despedida de los 3 correos.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ADMIN_EMAIL = 'nospisocial@gmail.com';

const PLAN_LABEL: Record<string, string> = {
  '1_month': 'Mensual',
  '3_months': '3 meses',
  '6_months': '6 meses',
};
const PLAN_MONTHS: Record<string, number> = { '1_month': 1, '3_months': 3, '6_months': 6 };

// Texto del valor segun el plan. Para 1 mes se mantiene "/mes"; para planes
// largos se dice el total y, entre parentesis, cuanto sale por mes, que es lo
// que deja ver el descuento.
function textoValor(price?: number, planType?: string): string {
  if (!price) return '';
  const monto = `$${Number(price).toLocaleString('es-CO')} COP`;
  const meses = PLAN_MONTHS[planType || '1_month'] || 1;
  if (meses === 1) return `${monto}/mes`;
  const porMes = Math.round(Number(price) / meses);
  return `${monto} por ${meses} meses ($${porMes.toLocaleString('es-CO')}/mes)`;
}

// "tu suscripcion mensual" solo es cierto para el plan de 1 mes.
function textoSuscripcion(planType?: string): string {
  const meses = PLAN_MONTHS[planType || '1_month'] || 1;
  return meses === 1 ? 'tu suscripción mensual' : `tu suscripción de ${meses} meses`;
}

function formatDateBogota(dateISO: string): string {
  return new Date(dateISO).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Bogota',
  });
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

// Correo interno al ADMIN para los tres tipos de evento de suscripcion.
async function sendAdminSubscriptionEmail(
  kind: 'subscribed' | 'cancelled' | 'reactivated',
  params: { userEmail: string; userName?: string; price?: number; planType?: string; nextChargeDate?: string; cancellationReason?: string },
  resendApiKey: string,
): Promise<void> {
  try {
    const nombre = params.userName || params.userEmail;
    const priceText = textoValor(params.price, params.planType);
    const planText = PLAN_LABEL[params.planType || '1_month'] || params.planType || 'Mensual';
    const nextChargeText = params.nextChargeDate ? formatDateBogota(params.nextChargeDate) : '';

    let subject: string;
    let lines: (string | null)[];
    if (kind === 'cancelled') {
      subject = `🚫 Suscripcion CANCELADA: ${nombre}`;
      lines = [
        `${params.userName || 'Un usuario'} cancelo su suscripcion de Nospi.`,
        '',
        `Usuario: ${params.userName || '-'}`,
        `Correo: ${params.userEmail}`,
        `Plan: ${planText}`,
        params.cancellationReason ? `Motivo: ${params.cancellationReason}` : null,
      ];
    } else if (kind === 'reactivated') {
      subject = `🔄 Suscripcion reactivada (${planText}): ${nombre}`;
      lines = [
        `${params.userName || 'Un usuario'} reactivo la renovacion de su suscripcion de Nospi.`,
        '',
        `Usuario: ${params.userName || '-'}`,
        `Correo: ${params.userEmail}`,
        `Plan: ${planText}`,
        priceText ? `Valor: ${priceText}` : null,
        nextChargeText ? `Proximo cobro: ${nextChargeText}` : null,
      ];
    } else {
      subject = `💰 Nueva suscripcion (${planText}): ${nombre}`;
      lines = [
        `${params.userName || 'Un usuario'} se suscribio a Nospi.`,
        '',
        `Usuario: ${params.userName || '-'}`,
        `Correo: ${params.userEmail}`,
        `Plan: ${planText}`,
        priceText ? `Valor: ${priceText}` : null,
        nextChargeText ? `Proximo cobro: ${nextChargeText}` : null,
      ];
    }

    const text = lines.filter((line) => line !== null).join('\n');

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Nospi <noreply@nospi.co>', to: [ADMIN_EMAIL], subject, text }),
    });
    if (!res.ok) {
      console.error('notify-subscription-email: Resend API error (admin):', res.status, await res.text());
    }
  } catch (e) {
    console.error('notify-subscription-email: excepcion enviando correo admin:', e);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const { type, userEmail, userName, price, planType, nextChargeDate, cancellationReason } = body as {
      type: 'subscribed' | 'cancelled' | 'reactivated';
      userEmail: string;
      userName?: string;
      price?: number;
      planType?: string;
      nextChargeDate?: string;
      cancellationReason?: string;
    };

    if (!userEmail || !type) {
      return new Response(JSON.stringify({ error: 'userEmail y type son requeridos' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY no configurada' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const firstName = (userName || '').trim().split(' ')[0] || '';
    const greeting = firstName ? `Hola ${firstName},` : 'Hola,';
    const meses = PLAN_MONTHS[planType || '1_month'] || 1;
    const suscripcionTxt = textoSuscripcion(planType);
    const periodoTxt = meses === 1 ? 'este mes' : `los próximos ${meses} meses`;

    let subject = '';
    let textBody = '';
    let bodyHtml = '';

    if (type === 'subscribed') {
      const priceText = textoValor(price, planType);
      const nextChargeText = nextChargeDate ? formatDateBogota(nextChargeDate) : '';

      subject = meses === 1
        ? 'Tu suscripción mensual de Nospi está activa'
        : `Tu suscripción de ${meses} meses de Nospi está activa`;
      textBody = [
        greeting,
        '',
        `${suscripcionTxt.charAt(0).toUpperCase()}${suscripcionTxt.slice(1)} de Nospi ya está activa. Desde ahora puedes ir a todos los eventos que hagamos en ${periodoTxt} sin pagar cada uno por separado.`,
        '',
        priceText ? `Valor: ${priceText}` : null,
        nextChargeText ? `Próximo cobro: ${nextChargeText}` : null,
        '',
        'Puedes cancelar cuando quieras desde la app, sin compromisos.',
        '',
        '¡Nos pillamos pronto! 😄',
        'Equipo Nospi',
      ].filter((line) => line !== null).join('\n');
      bodyHtml = [
        htmlParagraph(greeting),
        htmlParagraph(`${suscripcionTxt.charAt(0).toUpperCase()}${suscripcionTxt.slice(1)} de Nospi ya está activa 🎉 Desde ahora puedes ir a todos los eventos que hagamos en ${periodoTxt} sin pagar cada uno por separado.`),
        (priceText || nextChargeText) ? htmlParagraph(`${priceText ? `Valor: <strong>${priceText}</strong>` : ''}${priceText && nextChargeText ? ' · ' : ''}${nextChargeText ? `Próximo cobro: <strong>${nextChargeText}</strong>` : ''}`) : '',
        htmlParagraph('Puedes cancelar cuando quieras desde la app, sin compromisos.', { muted: true }),
        htmlParagraph('¡Nos pillamos pronto! 😄'),
      ].join('');
    } else if (type === 'reactivated') {
      const priceText = textoValor(price, planType);
      const nextChargeText = nextChargeDate ? formatDateBogota(nextChargeDate) : '';

      subject = 'Reactivamos la renovación de tu suscripción Nospi';
      textBody = [
        greeting,
        '',
        `Reactivamos la renovación automática de ${suscripcionTxt} de Nospi. Seguirás teniendo acceso ilimitado a todos los eventos, sin necesidad de volver a ingresar tu tarjeta.`,
        '',
        priceText ? `Valor: ${priceText}` : null,
        nextChargeText ? `Próximo cobro: ${nextChargeText}` : null,
        '',
        'Puedes cancelar cuando quieras desde la app.',
        '',
        '¡Nos pillamos pronto! 😄',
        'Equipo Nospi',
      ].filter((line) => line !== null).join('\n');
      bodyHtml = [
        htmlParagraph(greeting),
        htmlParagraph(`Reactivamos la renovación automática de ${suscripcionTxt} de Nospi. Seguirás teniendo acceso ilimitado a todos los eventos, sin necesidad de volver a ingresar tu tarjeta.`),
        (priceText || nextChargeText) ? htmlParagraph(`${priceText ? `Valor: <strong>${priceText}</strong>` : ''}${priceText && nextChargeText ? ' · ' : ''}${nextChargeText ? `Próximo cobro: <strong>${nextChargeText}</strong>` : ''}`) : '',
        htmlParagraph('Puedes cancelar cuando quieras desde la app.', { muted: true }),
        htmlParagraph('¡Nos pillamos pronto! 😄'),
      ].join('');
    } else {
      subject = 'Tu suscripción de Nospi fue cancelada';
      textBody = [
        greeting,
        '',
        `Confirmamos que cancelaste ${suscripcionTxt} de Nospi. No se te hará ningún cobro adicional.`,
        'Si ya tenías un período pagado, conservas el acceso hasta que termine.',
        cancellationReason ? '' : null,
        cancellationReason ? `Motivo que nos compartiste: ${cancellationReason}` : null,
        '',
        'Gracias por haber sido parte de Nospi. Cuando quieras, puedes volver a suscribirte desde la app.',
        '',
        '¡Nos pillamos en la próxima! 😊',
        'Equipo Nospi',
      ].filter((line) => line !== null).join('\n');
      bodyHtml = [
        htmlParagraph(greeting),
        htmlParagraph(`Confirmamos que cancelaste ${suscripcionTxt} de Nospi. No se te hará ningún cobro adicional. Si ya tenías un período pagado, conservas el acceso hasta que termine.`),
        cancellationReason ? htmlParagraph(`Motivo que nos compartiste: ${cancellationReason}`, { muted: true }) : '',
        htmlParagraph('Gracias por haber sido parte de Nospi. Cuando quieras, puedes volver a suscribirte desde la app.', { muted: true }),
        htmlParagraph('¡Nos pillamos en la próxima! 😊'),
      ].join('');
    }

    const html = wrapBrandedHtml(bodyHtml, 'https://app.nospi.co', type === 'cancelled' ? 'Volver a Nospi' : 'Abrir la app');

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Nospi <noreply@nospi.co>',
        to: [userEmail],
        subject,
        text: textBody,
        html,
      }),
    });

    if (!res.ok) {
      const errorData = await res.text();
      console.error('notify-subscription-email: Resend API error:', res.status, errorData);
      return new Response(JSON.stringify({ error: 'No se pudo enviar el correo' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Aviso interno al admin en los TRES casos (nueva, cancelada, reactivada).
    await sendAdminSubscriptionEmail(type, { userEmail, userName, price, planType, nextChargeDate, cancellationReason }, RESEND_API_KEY);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('notify-subscription-email error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
