// Supabase Edge Function: admin-reconcile-payments
// Llamada desde el panel admin (boton "Verificar pagos pendientes").
// Vuelve a consultar en Wompi el estado real de cada payment_attempt que
// quedo en un estado no final (ej. PENDING, por metodos async como PSE/Nequi/
// Bancolombia), actualiza payment_attempts y, si Wompi ya lo aprobo, confirma
// la cita automaticamente (misma logica que el webhook / el flujo del cliente).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const WOMPI_PRIVATE_KEY = 'prv_prod_r8NTduTEKXxzoLZv302Gw4i9jC0lerlK';
const WOMPI_API_URL = 'https://production.wompi.co/v1';
const SUPABASE_URL = 'https://wjdiraurfbawotlcndmk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const FINAL_STATUSES = ['APPROVED', 'DECLINED', 'VOIDED', 'ERROR'];

async function confirmAppointment(supabase: any, userId: string, eventId: string, transactionId: string, paymentMethod: string) {
  await supabase.from('appointments').upsert(
    {
      user_id: userId,
      event_id: eventId,
      status: 'confirmada',
      payment_status: 'completed',
      transaction_id: transactionId,
      payment_method: paymentMethod,
      confirmed_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,event_id', ignoreDuplicates: false },
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // --- fin verificacion de administrador ---

    const { data: pending, error: pendingError } = await supabase
      .from('payment_attempts')
      .select('id, user_id, event_id, transaction_id, payment_method, status')
      .not('status', 'in', `(${FINAL_STATUSES.join(',')})`)
      .not('transaction_id', 'is', null);

    if (pendingError) {
      return new Response(JSON.stringify({ error: pendingError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: any[] = [];

    for (const attempt of pending || []) {
      try {
        const resp = await fetch(`${WOMPI_API_URL}/transactions/${attempt.transaction_id}`, {
          headers: { Authorization: `Bearer ${WOMPI_PRIVATE_KEY}` },
        });
        const json = await resp.json();
        const liveStatus = json?.data?.status;
        if (!liveStatus || liveStatus === attempt.status) {
          results.push({ transaction_id: attempt.transaction_id, unchanged: true, status: attempt.status });
          continue;
        }

        await supabase
          .from('payment_attempts')
          .update({ status: liveStatus, updated_at: new Date().toISOString() })
          .eq('id', attempt.id);

        if (liveStatus === 'APPROVED' && attempt.user_id && attempt.event_id) {
          await confirmAppointment(supabase, attempt.user_id, attempt.event_id, attempt.transaction_id, attempt.payment_method);
        }

        results.push({
          transaction_id: attempt.transaction_id,
          previousStatus: attempt.status,
          newStatus: liveStatus,
          appointmentConfirmed: liveStatus === 'APPROVED',
        });
      } catch (e: any) {
        results.push({ transaction_id: attempt.transaction_id, error: e.message });
      }
    }

    return new Response(JSON.stringify({ success: true, checked: (pending || []).length, results }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
