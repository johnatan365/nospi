// Supabase Edge Function: notify-no-show
//
// OJO: verify_jwt debe quedar en FALSE. Esta funcion la llaman el cron y un
// trigger de Postgres, que mandan apikey + x-noshow-secret pero NO mandan
// Authorization. Con verify_jwt en true responde 401 y las amonestaciones
// dejan de aplicarse en silencio.
//
// Procesa las citas marcadas como no_show (no confirmaron asistencia) de
// eventos ya cerrados y aplica la escala de amonestaciones de Nospi:
//   1a falta  -> Advertencia (correo + push, sin bloqueo)
//   2a falta  -> Suspension para reservar 15 dias
//   3a+ falta -> Suspension para reservar 60 dias
// Las amonestaciones caducan a los ~4 meses (no cuentan para la escala).
//
// El trabajo esta partido en DOS momentos, a proposito:
//
//   1) AL CERRAR EL EVENTO -> { registrar_solamente: true, event_id }
//      Lo llama flag_event_no_shows. Crea la amonestacion y aplica la
//      suspension, para que la falta aparezca de una en el panel de No-shows.
//      NO manda correo ni push, y NO marca no_show_notified_at.
//
//   2) A LAS 10 DE LA MANANA -> cron, sin body
//      Manda el correo y el push a quien tenga no_show_notified_at NULL. Si la
//      amonestacion ya existe (paso 1), la reutiliza en vez de crear otra: si
//      no, el correo diria "segunda vez" cuando es la primera, y la suspension
//      se aplicaria dos veces.
//
// Asi el admin ve la falta apenas cierra el evento, pero a la persona no se le
// escribe de madrugada.
//
// Es idempotente: solo toca citas con no_show=true y no_show_notified_at NULL.
// NUNCA usa la palabra "no-show" de cara al usuario.
//
// Modo preview: { preview_email, preview_strike } (1|2|3) -> manda un correo de
// muestra a ese email SIN tocar la base de datos ni a usuarios reales.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'https://wjdiraurfbawotlcndmk.supabase.co';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const NOSHOW_SECRET = Deno.env.get('NOSHOW_SECRET') || 'nospi_noshow_wh_7f3a9c2e';

const DEFAULT_SUPPORT_EMAIL = 'nospisocial@gmail.com';
const DEFAULT_SUPPORT_WA = '573017714655';
const POLICY_URL = 'https://nospi.co/#politica';
const BOGOTA_TZ = 'America/Bogota';

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: BOGOTA_TZ });
  } catch { return iso; }
}

function supportLinksHtml(supportEmail: string, supportWa: string, eventName: string): string {
  const subject = encodeURIComponent('Revisión de mi caso de no asistencia');
  const waText = encodeURIComponent(`Hola, quiero una revisión de mi caso de no asistencia (evento ${eventName}).`);
  const mailto = `mailto:${supportEmail}?subject=${subject}`;
  const wa = `https://wa.me/${supportWa}?text=${waText}`;
  return `<div style="background:#eef7ff;border:1px solid #cfe4fb;border-radius:10px;padding:12px 14px;margin:12px 0;font-size:14px;color:#22506e;line-height:1.6;font-family:-apple-system,Helvetica,Arial,sans-serif;">🛟 <strong>¿Crees que es un error?</strong> (fuiste pero no confirmaste tu asistencia, o algo falló). Escríbenos y revisamos tu caso:<br/>\n    <a href="${mailto}" style="display:inline-block;margin-top:8px;margin-right:8px;background:#AD1457;color:#fff;text-decoration:none;font-weight:700;font-size:13px;padding:9px 14px;border-radius:8px;">✉️ Escribir por correo</a>\n    <a href="${wa}" style="display:inline-block;margin-top:8px;background:#25D366;color:#fff;text-decoration:none;font-weight:700;font-size:13px;padding:9px 14px;border-radius:8px;">💬 Escribir por WhatsApp</a>\n  </div>`;
}

function wrapEmail(bodyHtml: string): string {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>\n<body style="margin:0;padding:0;background:#f4f0f2;">\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f0f2;padding:24px 12px;"><tr><td align="center">\n<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;font-family:-apple-system,Helvetica,Arial,sans-serif;">\n<tr><td style="background:#880E4F;padding:24px 32px;text-align:center;"><img src="https://wjdiraurfbawotlcndmk.supabase.co/storage/v1/object/public/branding/icon-small.png" width="72" height="72" alt="Nospi" style="width:72px;height:72px;border-radius:16px;border:0;"/></td></tr>\n<tr><td style="padding:30px 32px 20px;">${bodyHtml}</td></tr>\n<tr><td style="background:#faf7f8;padding:18px 32px;text-align:center;border-top:1px solid #eee;"><p style="margin:0;font-size:12px;color:#9ca3af;">Equipo Nospi · app.nospi.co</p></td></tr>\n</table></td></tr></table></body></html>`;
}

function p(txt: string, muted = false): string {
  return `<p style="margin:0 0 12px;font-size:${muted ? '14px' : '16px'};color:${muted ? '#6b7280' : '#1f2937'};line-height:1.6;font-family:-apple-system,Helvetica,Arial,sans-serif;">${txt}</p>`;
}
function policyLine(): string {
  return `<div style="background:#faf3f6;border-radius:10px;padding:10px 12px;margin:0 0 12px;font-size:13px;color:#5b4a53;line-height:1.55;font-family:-apple-system,Helvetica,Arial,sans-serif;">📋 Si no vas a poder asistir, puedes cancelar desde la app con más de 24 horas de anticipación y te devolvemos tu saldo. Si lo haces con menos de 24 horas o no asistes, no se devuelve el saldo y tu cuenta podría quedar suspendida para reservar. <a href="${POLICY_URL}" style="color:#880E4F;">Ver la política de asistencia</a></div>`;
}

function buildStrikeEmail(opts: { firstName: string; eventName: string; eventDate: string; strike: number; suspendedUntilText?: string; supportEmail: string; supportWa: string; kind?: 'no_show' | 'late_cancel' }): { subject: string; html: string; text: string } {
  const { firstName, eventName, eventDate, strike, suspendedUntilText, supportEmail, supportWa } = opts;
  const late = (opts.kind || 'no_show') === 'late_cancel';
  const support = supportLinksHtml(supportEmail, supportWa, eventName);
  if (strike <= 1) {
    const subject = late ? `Cancelaste tarde tu cupo en ${eventName}` : `No confirmaste tu asistencia a ${eventName}`;
    const html = wrapEmail(
      p(`Hola ${firstName},`) +
      p(late ? `Cancelaste tu cupo en <strong>"${eventName}"</strong> (${eventDate}) con <strong>menos de 24 horas</strong> de anticipación, así que no alcanzamos a devolverte el saldo. Este es tu <strong>primer aviso</strong>: tu cuenta sigue activa sin bloqueos. Si vuelve a pasar (cancelar tarde o no asistir), tu cuenta podría quedar suspendida para reservar.` : `El evento <strong>"${eventName}"</strong> (${eventDate}) ya se cerró y <strong>no quedó confirmada tu asistencia</strong>. Este es tu <strong>primer aviso</strong>: tu cuenta sigue activa sin bloqueos. Si no confirmas tu asistencia en próximos eventos, tu cuenta podría ser suspendida para reservar.`) +
      policyLine() + support +
      p(`Equipo Nospi <span style="color:#880E4F">&#9829;</span>`)
    );
    const text = [
      `Hola ${firstName},`, '',
      (late ? `Cancelaste tu cupo en "${eventName}" (${eventDate}) con menos de 24 horas de anticipacion, asi que no alcanzamos a devolverte el saldo. Este es tu primer aviso: tu cuenta sigue activa sin bloqueos. Si vuelve a pasar (cancelar tarde o no asistir), tu cuenta podria quedar suspendida para reservar.` : `El evento "${eventName}" (${eventDate}) ya se cerro y no quedo confirmada tu asistencia. Este es tu primer aviso: tu cuenta sigue activa sin bloqueos. Si no confirmas tu asistencia en proximos eventos, tu cuenta podria ser suspendida para reservar.`), '',
      `Si no vas a poder asistir, puedes cancelar desde la app con mas de 24 horas de anticipacion y te devolvemos tu saldo. Si lo haces con menos de 24 horas o no asistes, no se devuelve el saldo y tu cuenta podria quedar suspendida para reservar. Ver la politica: ${POLICY_URL}`, '',
      `Si crees que es un error, escribenos: correo ${supportEmail} (asunto "Revision de mi caso de no asistencia") o WhatsApp https://wa.me/${supportWa}`, '',
      `Equipo Nospi`,
    ].join('\n');
    return { subject, html, text };
  }
  const dias = strike >= 3 ? 60 : 15;
  const subject = `Tu cuenta quedó suspendida para reservar hasta el ${suspendedUntilText}`;
  const ord = strike >= 3 ? 'tercera' : 'segunda';
  const html = wrapEmail(
    p(`Hola ${firstName},`) +
    p(late ? `Cancelaste tu cupo en <strong>"${eventName}"</strong> (${eventDate}) con <strong>menos de 24 horas</strong>. Es la <strong>${ord} vez</strong> que cancelas tarde o no asistes a un evento de Nospi, y por eso tu cuenta queda <strong>suspendida para reservar nuevos eventos por ${dias} días</strong> (hasta el ${suspendedUntilText}). Puedes seguir usando la app con normalidad (chat, perfil…).` : `No quedó confirmada tu asistencia a <strong>"${eventName}"</strong> (${eventDate}). Es la <strong>${ord} vez</strong> que no confirmas tu asistencia a un evento de Nospi, y por eso tu cuenta queda <strong>suspendida para reservar nuevos eventos por ${dias} días</strong> (hasta el ${suspendedUntilText}). Puedes seguir usando la app con normalidad (chat, perfil…).`) +
    (strike >= 3
      ? p(`Esta es la penalización máxima. Si vuelve a pasar, revisaremos tu caso manualmente.`, true)
      : p(`Si vuelve a pasar (tercera vez), la suspensión sube a 60 días.`, true)) +
    policyLine() + support +
    p(`Las faltas se borran a los ~4 meses de buen comportamiento.`, true) +
    p(`Equipo Nospi <span style="color:#880E4F">&#9829;</span>`)
  );
  const text = [
    `Hola ${firstName},`, '',
    (late ? `Cancelaste tu cupo en "${eventName}" (${eventDate}) con menos de 24 horas. Es la ${ord} vez que cancelas tarde o no asistes a un evento de Nospi, y por eso tu cuenta queda suspendida para reservar nuevos eventos por ${dias} dias (hasta el ${suspendedUntilText}). Puedes seguir usando la app con normalidad.` : `No quedo confirmada tu asistencia a "${eventName}" (${eventDate}). Es la ${ord} vez que no confirmas tu asistencia a un evento de Nospi, y por eso tu cuenta queda suspendida para reservar nuevos eventos por ${dias} dias (hasta el ${suspendedUntilText}). Puedes seguir usando la app con normalidad.`), '',
    strike >= 3 ? 'Esta es la penalizacion maxima. Si vuelve a pasar, revisaremos tu caso manualmente.' : 'Si vuelve a pasar (tercera vez), la suspension sube a 60 dias.', '',
    `Si no vas a poder asistir, puedes cancelar desde la app con mas de 24 horas de anticipacion y te devolvemos tu saldo. Si lo haces con menos de 24 horas o no asistes, no se devuelve el saldo y tu cuenta podria quedar suspendida para reservar. Ver la politica: ${POLICY_URL}`, '',
    `Si crees que es un error, escribenos: correo ${supportEmail} (asunto "Revision de mi caso de no asistencia") o WhatsApp https://wa.me/${supportWa}`, '',
    `Las faltas se borran a los ~4 meses de buen comportamiento.`, '',
    `Equipo Nospi`,
  ].join('\n');
  return { subject, html, text };
}

async function sendEmail(to: string, subject: string, html: string, text: string): Promise<boolean> {
  if (!RESEND_API_KEY || !to) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Nospi <noreply@nospi.co>', to: [to], subject, html, text }),
    });
    if (!res.ok) { console.error('notify-no-show email error', res.status, await res.text()); return false; }
    return true;
  } catch (e) { console.error('notify-no-show email exception', e); return false; }
}

async function sendPush(userId: string, title: string, body: string): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_ROLE}` },
      body: JSON.stringify({ user_ids: [userId], title, body, data: { screen: 'politica-asistencia', kind: 'no_show' } }),
    });
  } catch (e) { console.error('notify-no-show push exception', e); }
}

serve(async (req) => {
  try {
    const secret = req.headers.get('x-noshow-secret') || '';
    let body: any = {};
    try { body = await req.json(); } catch { /* cron sin body */ }

    // Requiere el secreto en TODOS los modos (incluye preview).
    if (secret !== NOSHOW_SECRET) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // config de soporte
    let supportEmail = DEFAULT_SUPPORT_EMAIL, supportWa = DEFAULT_SUPPORT_WA;
    try {
      const { data: cfg } = await supabase.from('app_config').select('key, value').in('key', ['support_email', 'support_whatsapp']);
      for (const row of cfg || []) {
        if ((row as any).key === 'support_email' && (row as any).value) supportEmail = (row as any).value;
        if ((row as any).key === 'support_whatsapp' && (row as any).value) supportWa = (row as any).value;
      }
    } catch { /* usa defaults */ }

    // --- MODO PREVIEW (no toca nada real) ---
    if (body && body.preview_email) {
      const strike = Math.min(3, Math.max(1, Number(body.preview_strike) || 1));
      const previewKind = body.preview_kind === 'late_cancel' ? 'late_cancel' : 'no_show';
      const susUntil = fmtDate(new Date(Date.now() + (strike >= 3 ? 60 : 15) * 86400000).toISOString());
      const mail = buildStrikeEmail({ firstName: 'Johnatan', eventName: 'Cena Nospi (PRUEBA)', eventDate: fmtDate(new Date().toISOString()), strike, suspendedUntilText: susUntil, supportEmail, supportWa, kind: previewKind });
      const ok = await sendEmail(body.preview_email, `[PREVIEW] ${mail.subject}`, mail.html, mail.text);
      return new Response(JSON.stringify({ preview: true, strike, sent: ok }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // --- MODO CANCELACION TARDIA (una cita puntual, disparado por el trigger
    // notify_appointment_cancelled cuando alguien cancela con < 24h). Reutiliza
    // la MISMA escalera de amonestaciones/suspension que los no-shows. ---
    if (body && body.late_cancel_appointment_id) {
      const aptId = String(body.late_cancel_appointment_id);
      const { data: apt, error: aptErr } = await supabase
        .from('appointments')
        .select('id, user_id, event_id, status, users!inner ( name, email, reservas_suspendidas_hasta ), events!inner ( name, date )')
        .eq('id', aptId)
        .maybeSingle();
      if (aptErr || !apt) {
        return new Response(JSON.stringify({ error: aptErr?.message || 'appointment_not_found', stage: 'late_cancel_load' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
      }
      // Solo si realmente esta cancelada (defensivo).
      if ((apt as any).status !== 'cancelada') {
        return new Response(JSON.stringify({ skipped: 'not_cancelled', status: (apt as any).status }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      // Idempotencia: si ya tiene amonestacion por esta cita, no duplicar
      // (user_strikes no tiene unique por appointment, hay que chequear).
      const { count: already } = await supabase
        .from('user_strikes').select('id', { count: 'exact', head: true }).eq('appointment_id', aptId);
      if ((already ?? 0) > 0) {
        return new Response(JSON.stringify({ skipped: 'already_striked' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      const lcUser = (apt as any).users;
      const lcEvent = (apt as any).events;
      const lcFirst = (lcUser?.name || '').trim().split(' ')[0] || 'ahi';
      const lcFourMonthsAgo = new Date(Date.now() - 122 * 86400000).toISOString();
      const { count: lcActive } = await supabase
        .from('user_strikes').select('id', { count: 'exact', head: true })
        .eq('user_id', (apt as any).user_id).eq('waived', false).gte('created_at', lcFourMonthsAgo);
      const lcStrike = (lcActive ?? 0) + 1;
      const { error: lcInsErr } = await supabase.from('user_strikes').insert({
        user_id: (apt as any).user_id,
        appointment_id: aptId,
        event_id: (apt as any).event_id,
        strike_number: lcStrike,
        reason: 'late_cancel',
        created_by: 'system',
      });
      if (lcInsErr) {
        return new Response(JSON.stringify({ error: lcInsErr.message, stage: 'insert_strike' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
      let lcSuspText: string | undefined;
      if (lcStrike >= 2) {
        const dias = lcStrike >= 3 ? 60 : 15;
        const base = lcUser?.reservas_suspendidas_hasta && new Date(lcUser.reservas_suspendidas_hasta) > new Date()
          ? new Date(lcUser.reservas_suspendidas_hasta) : new Date();
        const until = new Date(base.getTime() + dias * 86400000);
        lcSuspText = fmtDate(until.toISOString());
        await supabase.from('users').update({ reservas_suspendidas_hasta: until.toISOString() }).eq('id', (apt as any).user_id);
      }
      const lcMail = buildStrikeEmail({
        firstName: lcFirst, eventName: lcEvent?.name || 'tu evento', eventDate: fmtDate(lcEvent?.date), strike: lcStrike,
        suspendedUntilText: lcSuspText, supportEmail, supportWa, kind: 'late_cancel',
      });
      if (lcUser?.email) await sendEmail(lcUser.email, lcMail.subject, lcMail.html, lcMail.text);
      await sendPush(
        (apt as any).user_id,
        'Cancelaste tarde tu cupo',
        `Cancelaste "${lcEvent?.name || 'tu evento'}" con menos de 24 horas. Toca para ver la política de asistencia.`,
      );
      return new Response(JSON.stringify({ late_cancel: true, appointment: aptId, strike: lcStrike, suspendedUntil: lcSuspText || null }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // --- MODO NORMAL ---
    // registrar_solamente: lo usa flag_event_no_shows al cerrar el evento. Deja
    // la amonestacion registrada (para que salga ya en el panel) pero sin
    // escribirle a nadie: eso lo hace la corrida de las 10 de la manana.
    const soloRegistrar = body?.registrar_solamente === true;
    // Al cerrar un evento solo interesan SUS citas, no las de todo el historial.
    const soloEvento = body?.event_id ? String(body.event_id) : null;

    let consulta = supabase
      .from('appointments')
      .select('id, user_id, event_id, users!inner ( name, email, reservas_suspendidas_hasta ), events!inner ( name, date )')
      .eq('no_show', true)
      .is('no_show_notified_at', null);
    if (soloEvento) consulta = consulta.eq('event_id', soloEvento);

    const { data: candidates, error: candErr } = await consulta.limit(200);

    if (candErr) {
      return new Response(JSON.stringify({ error: candErr.message, stage: 'candidates' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const results: any[] = [];
    const fourMonthsAgo = new Date(Date.now() - 122 * 86400000).toISOString();

    for (const c of candidates || []) {
      const apt = c as any;
      const user = apt.users;
      const event = apt.events;
      const firstName = (user?.name || '').trim().split(' ')[0] || 'ahi';

      try {
        // Si la amonestacion ya existe (la registro el cierre del evento), se
        // REUTILIZA su numero. Calcular uno nuevo diria "segunda vez" cuando es
        // la primera, y volveria a aplicar la suspension.
        const { data: yaTiene } = await supabase
          .from('user_strikes')
          .select('strike_number')
          .eq('appointment_id', apt.id)
          .maybeSingle();

        let strikeNumber: number;
        let suspendedUntilText: string | undefined;

        if (yaTiene) {
          strikeNumber = Number((yaTiene as any).strike_number) || 1;
          if (strikeNumber >= 2 && user?.reservas_suspendidas_hasta) {
            suspendedUntilText = fmtDate(user.reservas_suspendidas_hasta);
          }
        } else {
          // strikes activos (no perdonados, ultimos ~4 meses)
          const { count: activeCount } = await supabase
            .from('user_strikes')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', apt.user_id)
            .eq('waived', false)
            .gte('created_at', fourMonthsAgo);
          strikeNumber = (activeCount ?? 0) + 1;

          const { error: insErr } = await supabase.from('user_strikes').insert({
            user_id: apt.user_id,
            appointment_id: apt.id,
            event_id: apt.event_id,
            strike_number: strikeNumber,
            reason: 'no_show',
            created_by: 'system',
          });
          if (insErr && !String(insErr.message || '').toLowerCase().includes('duplicate')) {
            results.push({ appointment: apt.id, error: insErr.message, stage: 'insert_strike' });
            continue;
          }

          // aplicar suspension si 2a o 3a+
          if (strikeNumber >= 2) {
            const dias = strikeNumber >= 3 ? 60 : 15;
            const base = user?.reservas_suspendidas_hasta && new Date(user.reservas_suspendidas_hasta) > new Date()
              ? new Date(user.reservas_suspendidas_hasta) : new Date();
            const until = new Date(base.getTime() + dias * 86400000);
            suspendedUntilText = fmtDate(until.toISOString());
            await supabase.from('users').update({ reservas_suspendidas_hasta: until.toISOString() }).eq('id', apt.user_id);
          }
        }

        // Registrado y listo: el correo y el push salen a las 10 de la manana.
        if (soloRegistrar) {
          results.push({ appointment: apt.id, user_id: apt.user_id, strike: strikeNumber, registrado: true, notificado: false });
          continue;
        }

        const mail = buildStrikeEmail({
          firstName, eventName: event?.name || 'tu evento', eventDate: fmtDate(event?.date), strike: strikeNumber,
          suspendedUntilText, supportEmail, supportWa,
        });
        if (user?.email) await sendEmail(user.email, mail.subject, mail.html, mail.text);

        await sendPush(
          apt.user_id,
          'No confirmaste tu asistencia',
          `No quedó confirmada tu asistencia a "${event?.name || 'tu evento'}". Si crees que es un error, toca para ver la política y avisarnos.`,
        );

        await supabase.from('appointments').update({ no_show_notified_at: new Date().toISOString() }).eq('id', apt.id);
        results.push({ appointment: apt.id, user_id: apt.user_id, strike: strikeNumber, suspendedUntil: suspendedUntilText || null, ok: true });
      } catch (e) {
        results.push({ appointment: apt.id, error: String(e) });
      }
    }

    return new Response(JSON.stringify({ modo: soloRegistrar ? 'registrar_solamente' : 'notificar', processed: results.length, results }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as any)?.message || String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
