// Supabase Edge Function: notify-strike-resolution
//
// Avisa al usuario (correo + push) cuando el admin RESUELVE su caso:
//   kind='waived'  -> se le perdonó una amonestación
//   kind='lifted'  -> se le levantó la suspensión de reservas
// La llaman las funciones SQL admin_waive_strike / admin_lift_suspension via
// net.http_post con el header x-noshow-secret. No usa la palabra "no-show".

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'https://wjdiraurfbawotlcndmk.supabase.co';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const NOSHOW_SECRET = Deno.env.get('NOSHOW_SECRET') || 'nospi_noshow_wh_7f3a9c2e';

function p(txt: string): string {
  return `<p style="margin:0 0 12px;font-size:16px;color:#1f2937;line-height:1.6;font-family:-apple-system,Helvetica,Arial,sans-serif;">${txt}</p>`;
}
function wrapEmail(bodyHtml: string): string {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f4f0f2;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f0f2;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;font-family:-apple-system,Helvetica,Arial,sans-serif;">
<tr><td style="background:#880E4F;padding:24px 32px;text-align:center;"><img src="https://wjdiraurfbawotlcndmk.supabase.co/storage/v1/object/public/branding/icon-small.png" width="72" height="72" alt="Nospi" style="width:72px;height:72px;border-radius:16px;border:0;"/></td></tr>
<tr><td style="padding:30px 32px 20px;">${bodyHtml}</td></tr>
<tr><td style="background:#faf7f8;padding:18px 32px;text-align:center;border-top:1px solid #eee;"><p style="margin:0;font-size:12px;color:#9ca3af;">Equipo Nospi · app.nospi.co</p></td></tr>
</table></td></tr></table></body></html>`;
}

async function sendEmail(to: string, subject: string, html: string, text: string): Promise<boolean> {
  if (!RESEND_API_KEY || !to) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Nospi <noreply@nospi.co>', to: [to], subject, html, text }),
    });
    if (!res.ok) { console.error('notify-strike-resolution email error', res.status, await res.text()); return false; }
    return true;
  } catch (e) { console.error('notify-strike-resolution email exception', e); return false; }
}

async function sendPush(userId: string, title: string, body: string, screen: string): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_ROLE}` },
      body: JSON.stringify({ user_ids: [userId], title, body, data: { screen, kind: 'strike_resolution' } }),
    });
  } catch (e) { console.error('notify-strike-resolution push exception', e); }
}

serve(async (req) => {
  try {
    const secret = req.headers.get('x-noshow-secret') || '';
    if (secret !== NOSHOW_SECRET) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    const body = await req.json().catch(() => ({}));
    const userId = body?.user_id;
    const kind = body?.kind;
    const eventName = body?.event_name || '';
    if (!userId || (kind !== 'waived' && kind !== 'lifted')) {
      return new Response(JSON.stringify({ error: 'user_id y kind (waived|lifted) requeridos' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: user } = await supabase.from('users').select('name, email').eq('id', userId).maybeSingle();
    const firstName = ((user as any)?.name || '').trim().split(' ')[0] || 'ahi';
    const evPart = eventName ? ` de "${eventName}"` : '';

    let subject: string, html: string, text: string, pushTitle: string, pushBody: string, screen: string;
    if (kind === 'waived') {
      subject = 'Revisamos tu caso';
      html = wrapEmail(
        p(`Hola ${firstName},`) +
        p(`Revisamos tu caso y <strong>quitamos la falta${evPart}</strong>. Todo quedó en orden, gracias por avisarnos.`) +
        p(`¡Nos pillamos pronto! <span style="color:#880E4F">&#9829;</span>`)
      );
      text = `Hola ${firstName},\n\nRevisamos tu caso y quitamos la falta${eventName ? ` de "${eventName}"` : ''}. Todo quedo en orden, gracias por avisarnos.\n\n¡Nos pillamos pronto!\nEquipo Nospi`;
      pushTitle = 'Revisamos tu caso';
      pushBody = `Quitamos la falta${evPart}. Todo quedó en orden.`;
      screen = 'politica-asistencia';
    } else {
      subject = 'Reactivamos tus reservas ✅';
      html = wrapEmail(
        p(`Hola ${firstName},`) +
        p(`¡Listo! <strong>Reactivamos tus reservas</strong>. Ya puedes volver a reservar eventos en Nospi.`) +
        p(`¡Nos pillamos pronto! <span style="color:#880E4F">&#9829;</span>`)
      );
      text = `Hola ${firstName},\n\n¡Listo! Reactivamos tus reservas. Ya puedes volver a reservar eventos en Nospi.\n\n¡Nos pillamos pronto!\nEquipo Nospi`;
      pushTitle = '¡Reservas reactivadas! ✅';
      pushBody = 'Ya puedes volver a reservar eventos en Nospi.';
      screen = '(tabs)/events';
    }

    const emailOk = (user as any)?.email ? await sendEmail((user as any).email, subject, html, text) : false;
    await sendPush(userId, pushTitle, pushBody, screen);

    return new Response(JSON.stringify({ ok: true, kind, emailSent: emailOk }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as any)?.message || String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
