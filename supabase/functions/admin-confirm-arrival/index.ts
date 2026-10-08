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

    const { eventId, userId } = await req.json();

    if (!eventId || !userId) {
      return new Response(JSON.stringify({ error: 'eventId y userId son requeridos' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const nowIso = new Date().toISOString();

    // 1) Marcar la cita como confirmada / con check-in.
    //    IMPORTANTE: arrival_status = 'on_time' es lo que usa el sistema de
    //    faltas (flag_event_no_shows marca no_show cuando arrival_status <>
    //    'on_time', y el trigger clear_no_show_on_arrival_confirmed limpia la
    //    falta y perdona el strike cuando pasa a 'on_time'). Antes esta funcion
    //    solo escribia location_confirmed/checked_in_at, asi que la gente
    //    confirmada a mano desde el admin quedaba marcada como no-show.
    const { error: apptError } = await supabase
      .from('appointments')
      .update({ location_confirmed: true, checked_in_at: nowIso, arrival_status: 'on_time' })
      .eq('event_id', eventId)
      .eq('user_id', userId);

    if (apptError) {
      return new Response(JSON.stringify({ error: apptError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2) Upsert en event_participants (marcar presentado / confirmado)
    const { error: partError } = await supabase
      .from('event_participants')
      .upsert(
        {
          event_id: eventId,
          user_id: userId,
          confirmed: true,
          check_in_time: nowIso,
          is_presented: true,
        },
        { onConflict: 'event_id,user_id' }
      );

    if (partError) {
      return new Response(JSON.stringify({ error: partError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
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
