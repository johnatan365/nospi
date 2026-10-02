// Supabase Edge Function: aviso-cambio-lugar
//
// Correo puntual de "cambiamos el lugar de tu evento", para avisar la vispera.
//
// Existe aparte de send-email-reminders a proposito. Esa funcion manda TODOS
// los recordatorios de TODOS los eventos (3 dias, dia anterior, mismo dia,
// inicio) y la dispara un cron cada 5 minutos: redesplegarla una hora antes de
// tres eventos, para un aviso de una sola vez, pone en riesgo algo que hoy
// funciona. Esta funcion no toca nada de eso y se puede borrar cuando sobre.
//
// Invocacion:
//   POST { event_id, only_emails? }  con header x-aviso-secret
//   only_emails limita el envio a esos correos -- sirve para probar primero
//   contra uno mismo antes de mandarselo a las personas de verdad.
//
// El correo NO dice por que cambio el lugar: el motivo lo pone quien manda el
// WhatsApp, que es quien conoce el caso.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://wjdiraurfbawotlcndmk.supabase.co';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const SECRET = 'nospi_aviso_lugar_8f2c';

function fechaBogota(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Bogota',
  }).format(new Date(iso));
}

function horaAmPm(hhmm?: string | null): string {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const suf = h >= 12 ? 'p.m.' : 'a.m.';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m ?? 0).padStart(2, '0')} ${suf}`;
}

// "Cafe (3 de octubre) - Mesa 2" -> "Nospi Mesa 2". Sin numero -> "Nospi".
function marcaDeLlegada(nombre?: string | null): string {
  const m = /\bmesa\s*(\d+)\b/i.exec(nombre || '');
  return m ? `Nospi Mesa ${m[1]}` : 'Nospi';
}

async function enviar(to: string, subject: string, text: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Nospi <noreply@nospi.co>', to: [to], subject, text, html }),
  });
  if (!res.ok) return { ok: false, errorText: await res.text() };
  return { ok: true };
}

function armar(nombre: string, ev: any) {
  const fecha = fechaBogota(ev.date);
  const hora = horaAmPm(ev.time);
  const lugar = [ev.location_name, ev.location_address].filter(Boolean).join(' — ');
  const marca = marcaDeLlegada(ev.name);
  const subject = 'Cambiamos el lugar de tu evento';

  const text = [
    `Hola ${nombre},`, '',
    'Te escribimos para avisarte de un cambio: tuvimos un inconveniente con el lugar donde ibamos a estar, asi que movimos tu grupo a otro sitio. Todo lo demas sigue igual.', '',
    `Fecha: ${fecha}`,
    hora ? `Hora: ${hora}` : '',
    lugar ? `Lugar: ${lugar}` : '',
    ev.maps_link ? `Como llegar: ${ev.maps_link}` : '', '',
    `Al llegar di que vienes de ${marca} y te indican donde sentarte.`, '',
    'Disculpa el cambio a ultima hora.', '',
    '¡Nos pillamos! 😄', 'Equipo Nospi',
  ].filter((l) => l !== '').join('\n');

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f4f0f2;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f0f2;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;padding:28px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
<tr><td>
<p style="margin:0 0 16px;font-size:16px;">Hola ${nombre},</p>
<p style="margin:0 0 16px;font-size:16px;">Te escribimos para avisarte de un cambio: tuvimos un inconveniente con el lugar donde íbamos a estar, así que <strong>movimos tu grupo a otro sitio</strong>. Todo lo demás sigue igual.</p>
<p style="margin:0 0 16px;font-size:16px;">📅 <strong>${fecha}</strong>${hora ? `<br />🕒 <strong>${hora}</strong>` : ''}${lugar ? `<br />📍 <strong>${lugar}</strong>` : ''}</p>
<p style="margin:0 0 16px;font-size:16px;">Al llegar di que vienes de <strong>${marca}</strong> y te indican dónde sentarte.</p>
${ev.maps_link ? `<p style="margin:0 0 20px;"><a href="${ev.maps_link}" style="display:inline-block;background:#AD1457;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:700;font-size:15px;">Cómo llegar</a></p>` : ''}
<p style="margin:0 0 16px;font-size:14px;color:#6b7280;">Disculpa el cambio a última hora.</p>
<p style="margin:0;font-size:16px;font-weight:700;">¡Nos pillamos! 😄</p>
</td></tr></table></td></tr></table></body></html>`;

  return { subject, text, html };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');
  if ((req.headers.get('x-aviso-secret') || '') !== SECRET) {
    return new Response(JSON.stringify({ error: 'no autorizado' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'sin RESEND_API_KEY' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const body = await req.json().catch(() => ({}));
  const eventId: string | undefined = body?.event_id;
  const onlyEmails: string[] | null = Array.isArray(body?.only_emails) && body.only_emails.length
    ? body.only_emails.map((e: string) => e.toLowerCase()) : null;

  if (!eventId) return new Response(JSON.stringify({ error: 'event_id requerido' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  const { data: ev, error: evErr } = await supabase
    .from('events').select('name, date, time, location_name, location_address, maps_link')
    .eq('id', eventId).single();
  if (evErr || !ev) return new Response(JSON.stringify({ error: evErr?.message || 'evento no encontrado' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

  const { data: appts, error: aErr } = await supabase
    .from('appointments').select('id, users!inner ( name, email )')
    .eq('event_id', eventId).eq('status', 'confirmada');
  if (aErr) return new Response(JSON.stringify({ error: aErr.message }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  const results: any[] = [];
  for (const apt of appts || []) {
    const u = (apt as any).users;
    if (!u?.email) continue;
    if (onlyEmails && !onlyEmails.includes(String(u.email).toLowerCase())) continue;
    const nombre = (u.name || '').trim().split(' ')[0] || 'ahí';
    const built = armar(nombre, ev);
    const r = await enviar(u.email, built.subject, built.text, built.html);
    results.push({ to: u.email, ...r });
  }

  return new Response(JSON.stringify({ evento: ev.name, lugar: ev.location_name, enviados: results.length, results }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
