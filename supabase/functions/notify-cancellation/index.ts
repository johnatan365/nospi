// Supabase Edge Function: notify-cancellation
// Llamada por un trigger de la base de datos (pg_net) cada vez que una cita
// pasa a status='cancelada'. Envia correo interno a soporte y correo de
// confirmacion (con marca Nospi) a la persona que cancelo.
// verify_jwt=false: quien llama es un trigger de Postgres (pg_net); se valida
// con el header x-webhook-secret.

const WEBHOOK_SECRET = 'nospi_cancel_wh_7f3d9a1c2b4e6f80';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

function formatEventDateBogota(eventDateISO: string): string {
  return new Date(eventDateISO).toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const secretHeader = req.headers.get('x-webhook-secret');
  if (secretHeader !== WEBHOOK_SECRET) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const {
      userName, userEmail, userPhone,
      eventName, eventDate, eventTime,
      refunded,
    } = body;

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY no configurada' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const formattedDate = eventDate ? formatEventDateBogota(eventDate) : 'fecha desconocida';
    const formattedTime = eventTime ? formatTimeAmPm(eventTime) : null;

    const adminSubject = `❌ Cancelación: ${userName || 'Un usuario'} canceló "${eventName || 'un evento'}"`;
    const adminBody = [
      `${userName || 'Un usuario'} canceló su cita.`,
      '',
      `Evento: ${eventName || '-'}`,
      `Fecha: ${formattedDate}`,
      formattedTime ? `Hora: ${formattedTime}` : null,
      '',
      `Usuario: ${userName || '-'}`,
      userEmail ? `Correo: ${userEmail}` : null,
      userPhone ? `Teléfono: ${userPhone}` : null,
      '',
      refunded
        ? '⚠️ Canceló con más de 24h de anticipación: se le acreditó saldo a favor para otra cita.'
        : 'Canceló con menos de 24h de anticipación: no se le acreditó saldo a favor.',
    ].filter((line) => line !== null).join('\n');

    const adminRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Nospi <noreply@nospi.co>', to: ['nospisocial@gmail.com'], subject: adminSubject, text: adminBody }),
    });

    if (!adminRes.ok) {
      console.error('Resend API error (admin):', adminRes.status, await adminRes.text());
    }

    let userEmailSent = false;
    if (userEmail) {
      const firstName = (userName || '').trim().split(' ')[0] || 'Hola';
      const userSubject = `Cancelaste tu cupo para ${eventName || 'el evento'}`;
      const userBody = [
        `Hola ${firstName},`,
        '',
        `Te confirmamos que cancelaste tu cupo para "${eventName || 'el evento'}".`,
        '',
        `Fecha: ${formattedDate}`,
        formattedTime ? `Hora: ${formattedTime}` : null,
        '',
        refunded
          ? 'Como cancelaste con más de 24 horas de anticipación, el saldo quedó disponible en tu cuenta para que lo uses en la asistencia a otro evento.'
          : 'Como la cancelación se hizo con menos de 24 horas de anticipación, no aplicó saldo a favor para otro evento.',
        '',
        'Si fue un error o quieres inscribirte a otro evento, puedes hacerlo desde la app cuando quieras.',
        '',
        '¡Nos pillamos en la próxima! 😊',
        'Equipo Nospi',
      ].filter((line) => line !== null).join('\n');

      const userBodyHtml = [
        htmlParagraph(`Hola ${firstName},`),
        htmlParagraph(`Te confirmamos que cancelaste tu cupo para <strong>"${eventName || 'el evento'}"</strong>.`),
        htmlParagraph(`Fecha: <strong>${formattedDate}</strong>${formattedTime ? ` · Hora: <strong>${formattedTime}</strong>` : ''}`),
        refunded
          ? htmlParagraph('Como cancelaste con más de 24 horas de anticipación, el saldo quedó disponible en tu cuenta para que lo uses en la asistencia a otro evento.', { muted: true })
          : htmlParagraph('Como la cancelación se hizo con menos de 24 horas de anticipación, no aplicó saldo a favor para otro evento.', { muted: true }),
        htmlParagraph('¡Nos pillamos en la próxima! 😊'),
      ].join('');
      const userHtml = wrapBrandedHtml(userBodyHtml, 'https://app.nospi.co', 'Ver eventos disponibles');

      const userRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'Nospi <noreply@nospi.co>', to: [userEmail], subject: userSubject, text: userBody, html: userHtml }),
      });

      if (!userRes.ok) {
        console.error('Resend API error (user):', userRes.status, await userRes.text());
      } else {
        userEmailSent = true;
      }
    }

    return new Response(JSON.stringify({ success: true, userEmailSent }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('notify-cancellation error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
