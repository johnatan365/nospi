// Supabase Edge Function: notify-gender-threshold
// Disparada por el trigger check_gender_threshold_notify en appointments.
// Avisa cuando un genero le saca 4 o mas al otro en un evento.
// (Antes avisaba al llegar a 8 de un mismo genero, sin mirar al otro:
//  eso disparaba en eventos sanos de 8 y 8, y no disparaba en eventos
//  rotos de 3 y 0.)
// El dedupe se hace en la base, en gender_threshold_notifications.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://wjdiraurfbawotlcndmk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const WEBHOOK_SECRET = 'nospi_gender_wh_7f3ac9e2b0d84c1a';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const secret = req.headers.get('x-webhook-secret');
  if (secret !== WEBHOOK_SECRET) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { event_id, gender, count, otros, diferencia } = await req.json();

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: event } = await supabase
      .from('events')
      .select('name, date, time, location_name, city')
      .eq('id', event_id)
      .maybeSingle();

    const esHombre = gender === 'hombre';
    const sobran = esHombre ? 'hombres' : 'mujeres';
    const faltan = esHombre ? 'mujeres' : 'hombres';
    const eventName = event?.name || event_id;
    const eventWhen = [event?.date, event?.time].filter(Boolean).join(' ');
    const eventWhere = event?.location_name || event?.city || '';

    const hombres = esHombre ? count : otros;
    const mujeres = esHombre ? otros : count;

    const lines: string[] = [];
    lines.push(`El evento "${eventName}" se desbalanceo: van ${hombres} hombres y ${mujeres} mujeres.`);
    lines.push('');
    lines.push(`Sobran ${diferencia} ${sobran}.`);
    lines.push('');
    if (eventWhen) lines.push(`Fecha/hora: ${eventWhen}`);
    if (eventWhere) lines.push(`Lugar: ${eventWhere}`);
    lines.push('');
    lines.push('Dos opciones en el panel admin, en Gestion de eventos:');
    lines.push(`  1. Cerrar el registro para ${sobran} y dejar que solo entren ${faltan}.`);
    lines.push(`  2. Dejarlo abierto e invitar ${faltan} por cortesia.`);
    lines.push('');
    lines.push('Cerrar el lado que sobra sale gratis; invitar por cortesia cuesta el precio del tiquete por persona.');
    lines.push('');
    lines.push('Este aviso se manda una sola vez por evento y genero. Si el evento se vuelve a emparejar y despues se desbalancea otra vez, te vuelve a llegar.');

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (RESEND_API_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Nospi <noreply@nospi.co>',
          to: ['nospisocial@gmail.com'],
          subject: `Desbalance en ${eventName}: ${hombres}H / ${mujeres}M (sobran ${diferencia} ${sobran})`,
          text: lines.join('\n'),
        }),
      });
    }

    return new Response(JSON.stringify({ success: true, hombres, mujeres, diferencia }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('notify-gender-threshold error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
