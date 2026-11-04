// Confirma el cupo de un evento pagado por Wompi (tarjeta, PSE, Nequi,
// Bancolombia) desde el servidor. Antes lo hacia el celular escribiendo directo
// en appointments, y eso obligaba a dejar que cualquiera con sesion se marcara
// una cita como "pagada". Aqui no se le cree al celular: se le pregunta a
// Wompi por la transaccion, y solo si esta APPROVED y su referencia es de esta
// persona y este evento, se confirma la cita.
//
// wompi-webhook sigue confirmando por su lado; los dos escriben lo mismo y el
// que llegue segundo no cambia nada. Esta funcion existe para que la persona
// vea su cupo apenas vuelve del banco, sin esperar el webhook, y para guardar
// lo que solo conoce la app (idiomas de la mesa, zonas, exoneracion).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { validarMontoCupo } from '../_shared/montoCupo.ts';

const SUPABASE_URL = 'https://wjdiraurfbawotlcndmk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const WOMPI_API_URL = 'https://production.wompi.co/v1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// Mismo formato que wompi-webhook: nospi_{method}_{userId}_{eventId}_{timestamp}
function parseReference(reference: string): { method: string; userId: string; eventId: string } | null {
  if (!reference || !reference.startsWith('nospi_')) return null;
  const parts = reference.slice('nospi_'.length).split('_');
  if (parts.length !== 4) return null;
  const [method, userId, eventId] = parts;
  if (!userId || !eventId) return null;
  return { method, userId, eventId };
}

const textos = (v: unknown, max: number): string[] | null => {
  if (!Array.isArray(v)) return null;
  const limpios = v.filter((x) => typeof x === 'string' && x.trim()).map((x) => String(x).trim().slice(0, 40)).slice(0, max);
  return limpios.length ? limpios : null;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
    const { data: u } = token ? await supabase.auth.getUser(token) : { data: null };
    const userId = u?.user?.id;
    if (!userId) return json({ ok: false, error: 'sin_sesion' }, 401);

    const body = await req.json().catch(() => ({}));
    const transactionId = typeof body?.transactionId === 'string' ? body.transactionId.trim() : '';
    if (!transactionId || transactionId.length > 80) return json({ ok: false, error: 'sin_transaccion' }, 400);

    const resp = await fetch(`${WOMPI_API_URL}/transactions/${encodeURIComponent(transactionId)}`);
    if (!resp.ok) return json({ ok: false, error: 'wompi_no_responde' }, 502);
    const tx = (await resp.json())?.data;
    if (!tx) return json({ ok: false, error: 'transaccion_no_existe' }, 404);
    if (tx.status !== 'APPROVED') return json({ ok: false, status: tx.status });

    const ref = parseReference(tx.reference);
    if (!ref || ref.userId !== userId) return json({ ok: false, error: 'transaccion_ajena' }, 403);

    // Lo pagado tiene que alcanzar para el cupo (ver _shared/montoCupo.ts).
    const pagadoCOP = Math.round(Number(tx.amount_in_cents || 0) / 100);
    const validacionMonto = await validarMontoCupo(supabase, userId, ref.eventId, pagadoCOP);
    if (!validacionMonto.ok) {
      console.warn('confirmar-pago-evento: monto rechazado', JSON.stringify({ tx: tx.id, userId, eventId: ref.eventId, pagadoCOP, minimo: validacionMonto.minimo }));
      return json({ ok: false, error: 'monto_insuficiente' }, 409);
    }

    const fila: Record<string, unknown> = {
      user_id: userId,
      event_id: ref.eventId,
      status: 'confirmada',
      payment_status: 'completed',
      transaction_id: tx.id,
      payment_method: ref.method,
      amount_paid_cop: pagadoCOP,
      confirmed_at: new Date().toISOString(),
    };
    // Lo que solo sabe la app. Si no viene, no se pisa lo que ya hubiera.
    if (body?.waiver === true) fila.waiver_accepted_at = new Date().toISOString();
    const idiomas = textos(body?.idiomas, 10);
    if (idiomas) fila.idiomas_mesa = idiomas;
    const zonas = textos(body?.zonas, 10);
    if (zonas) {
      fila.zonas_preferidas = zonas;
      if (typeof body?.zonaOtra === 'string' && body.zonaOtra.trim()) fila.zona_otra = body.zonaOtra.trim().slice(0, 60);
    }

    // Una cita ya pagada con OTRA transaccion no se reescribe (no se pierde el
    // monto original si la persona pago dos veces por error).
    const { data: actual } = await supabase
      .from('appointments')
      .select('id, status, payment_status, transaction_id')
      .eq('user_id', userId)
      .eq('event_id', ref.eventId)
      .maybeSingle();
    if (actual?.status === 'confirmada' && actual?.payment_status === 'completed' && actual?.transaction_id && actual.transaction_id !== tx.id) {
      return json({ ok: true, eventId: ref.eventId, ya_tenia_cupo: true });
    }
    // Una cita que ya se cancelo con esta misma transaccion no revive: al
    // cancelarla se le devolvio la plata como saldo, y revivirla permitiria
    // cancelar otra vez y cobrar el reembolso dos veces.
    if (actual?.status === 'cancelada' && actual?.transaction_id === tx.id) {
      return json({ ok: false, error: 'cita_cancelada' }, 409);
    }

    const { error } = await supabase.from('appointments').upsert(fila, { onConflict: 'user_id,event_id', ignoreDuplicates: false });
    if (error) {
      // P0001 = inscripcion cerrada para su genero (trigger). El pago quedo
      // aprobado: el webhook y la conciliacion del admin lo ven.
      console.error('confirmar-pago-evento: upsert', error.message);
      return json({ ok: false, error: 'no_se_pudo_confirmar' }, 409);
    }

    return json({ ok: true, eventId: ref.eventId });
  } catch (e) {
    console.error('confirmar-pago-evento:', e);
    return json({ ok: false, error: 'error_interno' }, 500);
  }
});
