import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://wjdiraurfbawotlcndmk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // --- fin verificacion de administrador ---

    // tipo indica como entro la persona:
    //   'app'      -> el pago ya existe en payment_attempts (Reconciliacion). No se crea otra fila.
    //   'directo'  -> pago por fuera de la app. Se registra la venta.
    //   'cortesia' -> entra gratis. amount_paid_cop = 0 para que al cancelar no reciba saldo.
    // Por defecto 'app' para no cambiar el comportamiento de quien no mande el campo.
    const { userId, eventId, tipo } = await req.json();
    const tipoFinal = tipo || 'app';

    if (!userId || !eventId) {
      return new Response(JSON.stringify({ error: 'userId y eventId son requeridos' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!['app', 'directo', 'cortesia'].includes(tipoFinal)) {
      return new Response(JSON.stringify({ error: `tipo invalido: ${tipoFinal}. Use app, directo o cortesia.` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verificar que el usuario exista
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, name, email')
      .eq('id', userId)
      .maybeSingle();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'No se encontró el usuario' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Evitar duplicados: si ya tiene cita (cualquier estado) en este evento, avisar
    const { data: existing } = await supabase
      .from('appointments')
      .select('id, status')
      .eq('user_id', userId)
      .eq('event_id', eventId)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({
        error: `${user.name} ya tiene una cita en este evento (estado: ${existing.status}). No se agregó de nuevo.`,
        duplicate: true,
      }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Usamos la RPC admin_add_user_to_event en vez de un insert directo:
    // corre dentro de una transaccion que activa
    // app.admin_override_gender_closed=true antes del insert, para que el
    // trigger de cierre por genero (pensado para el flujo normal de la app)
    // no bloquee esta adicion manual del admin — es una excepcion deliberada
    // (ej. alguien que ya pago antes de que se cerrara ese genero para el
    // evento, como Hernan Quintero).
    // La RPC tambien se encarga de amount_paid_cop, payment_method y, si el
    // pago fue directo, de registrar la venta en payment_attempts.
    const { data: appointment, error: insertError } = await supabase
      .rpc('admin_add_user_to_event', { p_user_id: userId, p_event_id: eventId, p_tipo: tipoFinal })
      .single();

    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, appointment, userName: user.name, tipo: tipoFinal }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
