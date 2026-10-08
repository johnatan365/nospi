import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://wjdiraurfbawotlcndmk.supabase.co';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const RESEND = Deno.env.get('RESEND_API_KEY') || '';
const SECRET = 'nospi_caminata_send_7b3e1d';
const EVENT_ID = 'd9705370-9a0b-44cf-89ee-8eeaf86dd22d';
const EXTRA_EMAIL = 'nospisocial@gmail.com';
const IMG_PUNTO = 'https://wjdiraurfbawotlcndmk.supabase.co/storage/v1/object/public/branding/caminata-3cruces/email_punto_encuentro.jpg';
const IMG_CHAT = 'https://wjdiraurfbawotlcndmk.supabase.co/storage/v1/object/public/branding/caminata-3cruces/email_chat.jpg';

const SUBJECT_BEFORE = '🥾 Mañana: caminata Nospi al Cerro de las 3 Cruces — todo lo que necesitas saber';
const SUBJECT_DAYOF = '☀️ ¡Hoy! Caminata Nospi al Cerro de las 3 Cruces — 8:00 a.m.';

function textBodyBefore(fn: string): string {
  return [
    `Hola ${fn},`, '',
    '¡Mañana domingo 9 de agosto nos vemos en la caminata de Nospi al Cerro de las 3 Cruces! Aquí van los detalles:', '',
    'PUNTO DE ENCUENTRO',
    'En la caseta que aparece señalada en la primera imagen adjunta, a la entrada de la ruta Los Bernal (Calle 8 #84f-201). La flecha verde marca el punto de encuentro y la naranja el caminito por donde subimos.', '',
    'HORA',
    'Nos encontramos a las 8:00 a.m. Esperamos a que llegue todo el grupo, pero máximo hasta las 8:15 a.m. A esa hora, quienes ya estén, comienzan a subir — por eso te pedimos llegar puntual.', '',
    'CÓMO RECONOCERSE',
    'Para ubicarse entre ustedes y coordinar, escríbanse por el chat de la app: entren a la pestaña Chat y abran la conversación de la Caminata Cerro de las 3 Cruces. El chat del grupo se habilita 30 minutos antes del evento. En la segunda imagen adjunta te señalamos dónde encontrarlo.', '',
    'IMPORTANTE',
    'Esta caminata es autogestionada: no asiste personal de Nospi. El recorrido lo hacen entre ustedes, acompañándose, conociéndose y cuidándose. Cada asistente participa bajo su propia responsabilidad, cuidando su seguridad y sus pertenencias. Si alguien quiere tomar el rol de líder del grupo (marcar el ritmo, ir adelante y coordinar la dinámica), ¡bienvenido! Al llegar a la cima podrán abrir la dinámica de Nospi en la app.', '',
    'QUÉ LLEVAR',
    '- Agua / hidratación suficiente',
    '- Ropa cómoda y tenis para caminar',
    '- Gorra y bloqueador solar',
    '- Un snack ligero',
    '- EPS activa y celular cargado',
    '- Algo de efectivo por si quieren algo en la caseta', '',
    'SEGURIDAD',
    'Recomendamos subir por la ruta Los Bernal. En caso de emergencia, la línea nacional es el 123.', '',
    '¡Nos vemos mañana! Cualquier duda, responde este correo o escríbenos por WhatsApp.', '',
    'Equipo Nospi',
    'nospi.co · @nospi.social',
  ].join('\n');
}

function textBodyDayof(fn: string): string {
  return [
    `Hola ${fn},`, '',
    '¡Hoy es el día! Te recordamos lo esencial para la caminata de Nospi al Cerro de las 3 Cruces:', '',
    'HORA Y PUNTO DE ENCUENTRO',
    '8:00 a.m. en la caseta señalada en la primera imagen adjunta, a la entrada de la ruta Los Bernal (Calle 8 #84f-201). La flecha verde marca dónde nos vemos y la naranja el caminito por donde subimos.', '',
    'Esperamos a los que falten máximo hasta las 8:15 a.m. A esa hora, quienes ya estén, comienzan a subir.', '',
    'CÓMO RECONOCERSE',
    'Para ubicarse y coordinar, escríbanse por el chat de la app: pestaña Chat, conversación de la Caminata Cerro de las 3 Cruces. El chat del grupo se habilita 30 minutos antes del evento. En la segunda imagen adjunta te señalamos dónde.', '',
    'RECUERDA',
    '- No asiste personal de Nospi: se acompañan y se cuidan entre todos. Si alguien quiere liderar el grupo y coordinar la dinámica, mejor.',
    '- Al llegar a la cima, abran la dinámica de Nospi en la app.',
    '- Lleva agua, gorra, bloqueador, ropa cómoda, tenis y tu EPS activa.', '',
    'SEGURIDAD',
    'Sube por la ruta Los Bernal. En caso de emergencia, la línea nacional es el 123.', '',
    'Sube a tu ritmo y disfruta la mañana. ¡Nos vemos arriba!', '',
    'Equipo Nospi',
    'nospi.co · @nospi.social',
  ].join('\n');
}

function p(t: string): string { return `<p style="margin:0 0 12px;font-size:16px;color:#1f2937;line-height:1.6;font-family:-apple-system,Helvetica,Arial,sans-serif;">${t}</p>`; }
function hh(t: string): string { return `<p style="margin:20px 0 6px;font-size:13px;font-weight:700;letter-spacing:.5px;color:#AD1457;font-family:-apple-system,Helvetica,Arial,sans-serif;">${t}</p>`; }
function img(src: string, alt: string): string { return `<img src="${src}" alt="${alt}" width="536" style="width:100%;max-width:536px;border-radius:12px;display:block;margin:6px 0 14px;border:0;" />`; }

function wrap(inner: string): string {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head><body style="margin:0;padding:0;background:#f4f0f2;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f0f2;padding:24px 12px;"><tr><td align="center"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;font-family:-apple-system,Helvetica,Arial,sans-serif;"><tr><td style="background:#880E4F;padding:22px 32px;text-align:center;"><img src="https://wjdiraurfbawotlcndmk.supabase.co/storage/v1/object/public/branding/icon-small.png" width="64" height="64" alt="Nospi" style="width:64px;height:64px;border-radius:14px;border:0;"/></td></tr><tr><td style="padding:28px 32px 8px;">${inner}</td></tr><tr><td style="background:#faf7f8;padding:16px 32px;text-align:center;border-top:1px solid #eee;"><p style="margin:0;font-size:12px;color:#9ca3af;font-family:-apple-system,Helvetica,Arial,sans-serif;">Equipo Nospi · nospi.co · @nospi.social</p></td></tr></table></td></tr></table></body></html>`;
}

function htmlBodyBefore(fn: string): string {
  const inner = [
    p(`Hola <strong>${fn}</strong>,`),
    p('¡Mañana <strong>domingo 9 de agosto</strong> nos vemos en la caminata de Nospi al <strong>Cerro de las 3 Cruces</strong>! 🌄🥾'),
    hh('📍 PUNTO DE ENCUENTRO'),
    p('En la caseta señalada en la imagen de abajo, a la entrada de la <strong>ruta Los Bernal (Calle 8 #84f-201)</strong>. La flecha verde marca dónde nos vemos y la naranja el caminito por donde subimos.'),
    img(IMG_PUNTO, 'Punto de encuentro'),
    hh('🕗 HORA'),
    p('Nos encontramos a las <strong>8:00 a.m.</strong> Esperamos a que llegue todo el grupo, pero <strong>máximo hasta las 8:15 a.m.</strong> — a esa hora, quienes ya estén, comienzan a subir. Llega puntual 🙏'),
    hh('💬 CÓMO RECONOCERSE'),
    p('Para ubicarse entre ustedes y coordinar, escríbanse por el <strong>chat de la app</strong>: entren a la pestaña <strong>Chat</strong> y abran la conversación de la Caminata Cerro de las 3 Cruces. El chat del grupo se habilita <strong>30 minutos antes</strong> del evento. Aquí te señalamos dónde:'),
    img(IMG_CHAT, 'Chat del grupo'),
    hh('🤝 IMPORTANTE'),
    p('Esta caminata es <strong>autogestionada</strong>: no asiste personal de Nospi. El recorrido lo hacen entre ustedes, acompañándose, conociéndose y cuidándose; cada quien participa bajo su propia responsabilidad, cuidando su seguridad y sus pertenencias. Si alguien quiere ser el <strong>líder</strong> del grupo (marcar el ritmo, ir adelante y coordinar la dinámica), ¡bienvenido! Al llegar a la cima podrán abrir la dinámica de Nospi en la app.'),
    hh('🎒 QUÉ LLEVAR'),
    p('💧 Agua · 👟 Ropa cómoda y tenis · 🧢 Gorra y bloqueador · 🍎 Un snack · 🪪 EPS activa y celular cargado · 💵 Algo de efectivo por si quieren algo en la caseta.'),
    hh('🚨 SEGURIDAD'),
    p('Recomendamos subir por la ruta Los Bernal. En caso de emergencia, la línea nacional es el <strong>123</strong>.'),
    p('¡Nos vemos mañana! 🙌 Cualquier duda, responde este correo o escríbenos por WhatsApp.'),
  ].join('');
  return wrap(inner);
}

function htmlBodyDayof(fn: string): string {
  const inner = [
    p(`Hola <strong>${fn}</strong>,`),
    p('¡<strong>Hoy es el día!</strong> ☀️ Te recordamos lo esencial para la caminata al <strong>Cerro de las 3 Cruces</strong> 🥾🌄'),
    hh('🕗 HORA Y PUNTO DE ENCUENTRO'),
    p('<strong>8:00 a.m.</strong> en la caseta señalada en la imagen de abajo, a la entrada de la <strong>ruta Los Bernal (Calle 8 #84f-201)</strong>. La flecha verde marca dónde nos vemos y la naranja el caminito por donde subimos.'),
    img(IMG_PUNTO, 'Punto de encuentro'),
    p('⏰ Esperamos a los que falten <strong>máximo hasta las 8:15 a.m.</strong> — a esa hora, quienes ya estén, ¡arrancan a subir!'),
    hh('💬 CÓMO RECONOCERSE'),
    p('Para ubicarse y coordinar, escríbanse por el <strong>chat de la app</strong>: pestaña <strong>Chat</strong>, conversación de la Caminata Cerro de las 3 Cruces. Se habilita <strong>30 minutos antes</strong>. Aquí te señalamos dónde:'),
    img(IMG_CHAT, 'Chat del grupo'),
    hh('🤝 RECUERDA'),
    p('No asiste personal de Nospi: se acompañan y se cuidan entre todos. Si alguien quiere <strong>liderar</strong> el grupo y coordinar la dinámica, mejor. Al llegar a la cima, abran la dinámica de Nospi en la app.'),
    hh('🎒 LLEVA'),
    p('💧 Agua · 👟 Ropa cómoda y tenis · 🧢 Gorra y bloqueador · 🪪 EPS activa · 🔋 Celular cargado.'),
    hh('🚨 SEGURIDAD'),
    p('Sube por la ruta Los Bernal. En caso de emergencia, la línea nacional es el <strong>123</strong>.'),
    p('Sube a tu ritmo y disfruta la mañana. ¡Nos vemos arriba! 💪'),
  ].join('');
  return wrap(inner);
}

async function send(to: string, fn: string, mode: string): Promise<{ ok: boolean; err?: string }> {
  const isDayof = mode === 'day_of';
  const payload = {
    from: 'Nospi <noreply@nospi.co>',
    to: [to],
    subject: isDayof ? SUBJECT_DAYOF : SUBJECT_BEFORE,
    text: isDayof ? textBodyDayof(fn) : textBodyBefore(fn),
    html: isDayof ? htmlBodyDayof(fn) : htmlBodyBefore(fn),
    attachments: [
      { filename: 'punto-de-encuentro.jpg', path: IMG_PUNTO },
      { filename: 'chat-del-grupo.jpg', path: IMG_CHAT },
    ],
  };
  const res = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'Authorization': `Bearer ${RESEND}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) { const t = await res.text(); return { ok: false, err: t }; }
  return { ok: true };
}

Deno.serve(async (req) => {
  try {
    if (req.headers.get('x-webhook-secret') !== SECRET) return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401 });
    if (!RESEND) return new Response(JSON.stringify({ ok: false, error: 'RESEND_API_KEY no configurada' }), { status: 200 });
    let testOnly = false; let mode = 'day_before';
    try { const b = await req.json(); if (b && b.test_only === true) testOnly = true; if (b && b.mode === 'day_of') mode = 'day_of'; } catch (_e) { /* */ }
    if (testOnly) { const r = await send(EXTRA_EMAIL, 'Johnatan', mode); return new Response(JSON.stringify({ test: true, mode, ...r }), { status: 200, headers: { 'Content-Type': 'application/json' } }); }
    const supabase = createClient(SUPABASE_URL, SERVICE);
    const { data: appts, error } = await supabase.from('appointments').select('id, users!inner ( name, email )').eq('event_id', EVENT_ID).eq('status', 'confirmada').eq('payment_status', 'completed');
    if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
    const seen = new Set<string>(); const results: any[] = [];
    for (const a of appts || []) {
      const u = (a as any).users; if (!u?.email) continue;
      const em = String(u.email).toLowerCase(); if (seen.has(em)) continue; seen.add(em);
      const fn = (u.name || '').trim().split(' ')[0] || 'ahí';
      const r = await send(u.email, fn, mode); results.push({ to: u.email, ok: r.ok, err: r.err });
    }
    if (!seen.has(EXTRA_EMAIL.toLowerCase())) { const r = await send(EXTRA_EMAIL, 'Johnatan', mode); results.push({ to: EXTRA_EMAIL, ok: r.ok, err: r.err }); }
    return new Response(JSON.stringify({ mode, sent: results.filter((r) => r.ok).length, total: results.length, results }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500 });
  }
});
