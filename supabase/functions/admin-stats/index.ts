import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://wjdiraurfbawotlcndmk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const WOMPI_PRIVATE_KEY = 'prv_prod_r8NTduTEKXxzoLZv302Gw4i9jC0lerlK';
const WOMPI_API_URL = 'https://production.wompi.co/v1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Reporte para el admin panel: inscripciones a eventos (appointments) y
// suscripciones mensuales (subscriptions), crudos, para que el frontend los
// agrupe por dia. subscriptions tiene RLS restringido al dueno de la fila,
// por eso esto necesita service role, igual que admin-promo-codes.
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // --- Verificacion de administrador (seguridad). Permite: (a) el admin logueado,
    //     (b) llamadas internas del backend/cron con la service_role key. Rechaza todo lo demas. ---
    const __authHeader = req.headers.get('Authorization') || '';
    const __token = __authHeader.replace(/^Bearer\s+/i, '').trim();
    let __isAdmin = false;
    if (__token && __token === SUPABASE_SERVICE_ROLE_KEY) {
      __isAdmin = true;
    } else if (__token) {
      const { data: __u } = await supabase.auth.getUser(__token);
      const __callerId = __u?.user?.id;
      if (__callerId) {
        const { data: __a1 } = await supabase.from('admins').select('user_id').eq('user_id', __callerId).maybeSingle();
        let __ok = !!__a1;
        if (!__ok) {
          const { data: __a2 } = await supabase.from('admin_users').select('user_id').eq('user_id', __callerId).maybeSingle();
          __ok = !!__a2;
        }
        __isAdmin = __ok;
      }
    }
    if (!__isAdmin) {
      return jsonResponse({ error: 'No autorizado' }, 403);
    }
    // --- fin verificacion de administrador ---

    const body = await req.json().catch(() => ({}));
    const { action } = body;

    if (action === 'report') {
      const { data: appointments, error: apptError } = await supabase
        .from('appointments')
        .select(`
          id,
          created_at,
          status,
          payment_status,
          amount_paid_cop,
          payment_method,
          event:event_id ( id, name, type, city, date )
        `)
        .order('created_at', { ascending: true });

      if (apptError) return jsonResponse({ error: apptError.message }, 400);

      const { data: subscriptions, error: subError } = await supabase
        .from('subscriptions')
        .select('id, created_at, plan_type, price, status, payment_method')
        .order('created_at', { ascending: true });

      if (subError) return jsonResponse({ error: subError.message }, 400);

      return jsonResponse({
        success: true,
        appointments: appointments || [],
        subscriptions: subscriptions || [],
      });
    }

    // Trae el monto REAL de cada inscripcion pagada que no tiene amount_paid_cop
    // guardado pero si tiene un transaction_id real de Wompi (no 'suscripcion_activa'
    // ni vacio, que son entradas gratuitas via suscripcion/saldo virtual).
    // Consulta directo a la API de Wompi (misma llave que admin-reconcile-payments)
    // y actualiza appointments.amount_paid_cop con el valor real.
    if (action === 'backfill_wompi') {
      const { data: pending, error: pendingError } = await supabase
        .from('appointments')
        .select('id, transaction_id')
        .eq('payment_status', 'completed')
        .is('amount_paid_cop', null)
        .not('transaction_id', 'is', null)
        .not('transaction_id', 'in', '("","suscripcion_activa")');

      if (pendingError) return jsonResponse({ error: pendingError.message }, 400);

      const results: any[] = [];
      for (const appt of pending || []) {
        try {
          const resp = await fetch(`${WOMPI_API_URL}/transactions/${appt.transaction_id}`, {
            headers: { Authorization: `Bearer ${WOMPI_PRIVATE_KEY}` },
          });
          const json = await resp.json();
          const amountInCents = json?.data?.amount_in_cents;
          const wompiStatus = json?.data?.status;

          if (amountInCents == null) {
            results.push({ id: appt.id, transaction_id: appt.transaction_id, found: false, wompiStatus: wompiStatus ?? null });
            continue;
          }

          const amountCop = Math.round(amountInCents / 100);
          await supabase.from('appointments').update({ amount_paid_cop: amountCop }).eq('id', appt.id);
          results.push({ id: appt.id, transaction_id: appt.transaction_id, found: true, amountCop, wompiStatus });
        } catch (e: any) {
          results.push({ id: appt.id, transaction_id: appt.transaction_id, error: e.message });
        }
      }

      return jsonResponse({ success: true, checked: (pending || []).length, results });
    }

    return jsonResponse({ error: `Accion no reconocida: ${action}` }, 400);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
