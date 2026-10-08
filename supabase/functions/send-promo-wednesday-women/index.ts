// Supabase Edge Function: send-promo-wednesday-women
// Envio puntual (uso unico) del correo invitando con codigo de descuento BETA
// a mujeres que no estan inscritas en la cena del miercoles 29 de julio
// (event_id fijo abajo), para balancear el ratio de genero de ese evento.
// No es una funcion recurrente. verify_jwt:false, protegida con secreto
// compartido en el header.
//
// v3: se quita el filtro de 'ya asistio antes' (appointments!inner) para
// llegar tambien a mujeres que nunca han asistido (segunda tanda: 'las
// otras mujeres faltantes'). Se mantiene el log de dedup para no repetir
// envios de la primera tanda ni de esta.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://wjdiraurfbawotlcndmk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const SECRET = 'nospi_promo_wed_send_5f8a2c9e1b';
const EVENT_ID = '2bf79f2a-aeab-4944-80a7-bda362a28abc'; // Cena (29 Julio) - miercoles

Deno.serve(async (req: Request) => {
  const secretHeader = req.headers.get('x-send-secret');
  if (secretHeader !== SECRET) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const dryRun = !!body.dryRun;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: candidatas, error } = await supabase
    .from('users')
    .select('id, name, email')
    .eq('gender', 'mujer')
    .not('email', 'is', null);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const { data: yaInscritas } = await supabase
    .from('appointments')
    .select('user_id')
    .eq('event_id', EVENT_ID)
    .eq('status', 'confirmada');
  const yaInscritasIds = new Set((yaInscritas || []).map((a: any) => a.user_id));

  const { data: yaEnviados } = await supabase.from('promo_wednesday_email_log').select('user_id');
  const yaEnviadosIds = new Set((yaEnviados || []).map((r: any) => r.user_id));

  const targets = (candidatas || []).filter((u: any) => !yaInscritasIds.has(u.id) && !yaEnviadosIds.has(u.id));

  if (dryRun) {
    return new Response(JSON.stringify({ dryRun: true, pending: targets.length, already_sent: yaEnviadosIds.size, sample: targets.slice(0, 5).map((u: any) => ({ name: u.name, email: u.email })) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY no configurada' }), { status: 500 });
  }

  let sent = 0;
  const failures: any[] = [];

  for (const u of targets as any[]) {
    const firstName = (u.name || '').trim().split(' ')[0] || '';
    const greeting = firstName ? `Hola ${firstName},` : 'Hola,';
    const subject = '🍷 Miércoles: cena Nospi con 30% de descuento para ti';
    const text = [
      greeting,
      '',
      'Este miércoles tenemos una cena Nospi y queremos que estés ahí 🍽️',
      '',
      'Usa el código BETA al pagar tu cupo y obtén 30% de descuento.',
      '',
      'Cómo hacerlo:',
      '1. Abre la app de Nospi',
      '2. Elige la cena del miércoles 29 de julio',
      '3. En la pantalla de pago, toca "¿Tienes un código promocional?" e ingresa BETA',
      '',
      'Cupos limitados, ¡nos vemos ahí!',
      'Equipo Nospi',
    ].join('\n');

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'Nospi <noreply@nospi.co>', to: [u.email], subject, text }),
      });
      if (res.ok) {
        sent++;
        await supabase.from('promo_wednesday_email_log').insert({ user_id: u.id, email: u.email });
      } else {
        failures.push({ email: u.email, status: res.status, error: await res.text() });
      }
    } catch (e: any) {
      failures.push({ email: u.email, error: e.message });
    }
  }

  return new Response(JSON.stringify({ success: true, sent, total: targets.length, failures }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
