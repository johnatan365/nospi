// Supabase Edge Function: notify-reconciliation
// Corre cada hora via pg_cron. Revisa los dos casos del reporte de
// Reconciliacion del panel admin (pagos aprobados sin cita, y citas
// confirmadas sin pago completado) y manda un correo a nospisocial@gmail.com
// SOLO si hay casos nuevos que no se hayan avisado antes (usa la tabla
// reconciliation_notifications para no repetir el mismo aviso cada hora).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://wjdiraurfbawotlcndmk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Secreto compartido para autorizar la invocacion desde el cron (pg_cron manda
// este valor en el header x-recon-secret). Valor fijo, NO generado en runtime.
const RECON_SECRET = 'nospi_recon_wh_a7k2m9x4b1qz';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-recon-secret',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Autorizacion: pasa si trae el secreto correcto en x-recon-secret O el
  // service_role key en el header Authorization: Bearer ...
  const reconSecret = req.headers.get('x-recon-secret');
  const authHeader = req.headers.get('authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const authorized =
    reconSecret === RECON_SECRET ||
    (SUPABASE_SERVICE_ROLE_KEY.length > 0 && bearer === SUPABASE_SERVICE_ROLE_KEY);
  if (!authorized) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Caso A: pagos aprobados en Wompi sin cita confirmada
    const { data: paymentAttempts } = await supabase
      .from('payment_attempts')
      .select('transaction_id, user_id, event_id, amount, payment_method')
      .eq('status', 'APPROVED')
      .not('user_id', 'is', null)
      .not('event_id', 'is', null);

    const { data: completedAppointments } = await supabase
      .from('appointments')
      .select('user_id, event_id, status, payment_status');

    const hasCompletedAppointment = (userId: string, eventId: string) =>
      (completedAppointments || []).some(
        (a: any) => a.user_id === userId && a.event_id === eventId && a.payment_status === 'completed'
      );

    const orphanPayments = (paymentAttempts || []).filter(
      (pa: any) => pa.transaction_id && !hasCompletedAppointment(pa.user_id, pa.event_id)
    );

    // Caso B: citas confirmadas sin pago completado
    const orphanAppointments = (completedAppointments || []).filter(
      (a: any) => a.status === 'confirmada' && a.payment_status !== 'completed'
    );

    // Filtrar solo los casos NUEVOS (no notificados antes)
    const { data: alreadyNotified } = await supabase
      .from('reconciliation_notifications')
      .select('kind, ref_key');

    const notifiedSet = new Set((alreadyNotified || []).map((n: any) => `${n.kind}:${n.ref_key}`));

    const newOrphanPayments = orphanPayments.filter(
      (pa: any) => !notifiedSet.has(`orphan_payment:${pa.transaction_id}`)
    );

    // Necesitamos el id de la cita para orphan_appointment como ref_key
    const { data: orphanAppointmentRows } = await supabase
      .from('appointments')
      .select('id, user_id, event_id, payment_status')
      .eq('status', 'confirmada')
      .neq('payment_status', 'completed');

    const newOrphanAppointments = (orphanAppointmentRows || []).filter(
      (a: any) => !notifiedSet.has(`orphan_appointment:${a.id}`)
    );

    if (newOrphanPayments.length === 0 && newOrphanAppointments.length === 0) {
      return new Response(JSON.stringify({ success: true, newCases: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Enriquecer con nombre de usuario / evento para el correo
    const userIds = Array.from(new Set([
      ...newOrphanPayments.map((p: any) => p.user_id),
      ...newOrphanAppointments.map((a: any) => a.user_id),
    ]));
    const eventIds = Array.from(new Set([
      ...newOrphanPayments.map((p: any) => p.event_id),
      ...newOrphanAppointments.map((a: any) => a.event_id),
    ]));

    const { data: usersData } = await supabase.from('users').select('id, name, email, phone').in('id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000']);
    const { data: eventsData } = await supabase.from('events').select('id, name, date').in('id', eventIds.length ? eventIds : ['00000000-0000-0000-0000-000000000000']);

    const userMap: Record<string, any> = {};
    (usersData || []).forEach((u: any) => { userMap[u.id] = u; });
    const eventMap: Record<string, any> = {};
    (eventsData || []).forEach((e: any) => { eventMap[e.id] = e; });

    const lines: string[] = [];
    lines.push('Reporte de Reconciliacion Nospi - casos nuevos detectados');
    lines.push('');

    if (newOrphanPayments.length > 0) {
      lines.push(`PAGOS APROBADOS SIN CITA (${newOrphanPayments.length}):`);
      newOrphanPayments.forEach((p: any) => {
        const u = userMap[p.user_id];
        const ev = eventMap[p.event_id];
        lines.push(`- ${u?.name || p.user_id} (${u?.phone || u?.email || '-'}) | Evento: ${ev?.name || p.event_id} | Metodo: ${p.payment_method} | Monto: $${p.amount || 0} | Transaccion: ${p.transaction_id}`);
      });
      lines.push('');
    }

    if (newOrphanAppointments.length > 0) {
      lines.push(`CITAS CONFIRMADAS SIN PAGO (${newOrphanAppointments.length}):`);
      newOrphanAppointments.forEach((a: any) => {
        const u = userMap[a.user_id];
        const ev = eventMap[a.event_id];
        lines.push(`- ${u?.name || a.user_id} (${u?.phone || u?.email || '-'}) | Evento: ${ev?.name || a.event_id} | payment_status: ${a.payment_status}`);
      });
      lines.push('');
    }

    lines.push('Entra al panel admin, seccion Reconciliacion, para resolverlos.');

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (RESEND_API_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Nospi <noreply@nospi.co>',
          to: ['nospisocial@gmail.com'],
          subject: `⚠️ Reconciliacion: ${newOrphanPayments.length + newOrphanAppointments.length} caso(s) nuevo(s)`,
          text: lines.join('\n'),
        }),
      });
    }

    // Registrar como notificados para no repetir
    const toInsert = [
      ...newOrphanPayments.map((p: any) => ({ kind: 'orphan_payment', ref_key: p.transaction_id })),
      ...newOrphanAppointments.map((a: any) => ({ kind: 'orphan_appointment', ref_key: a.id })),
    ];
    if (toInsert.length > 0) {
      await supabase.from('reconciliation_notifications').insert(toInsert);
    }

    return new Response(JSON.stringify({ success: true, newCases: toInsert.length }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('notify-reconciliation error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
