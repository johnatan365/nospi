import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://wjdiraurfbawotlcndmk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Campos que el panel de admin tiene permitido modificar. Cualquier otro campo
// enviado en el body se ignora (evita que alguien intente sobreescribir
// columnas sensibles como id, virtual_balance manejado por otros flujos, etc.)
const ALLOWED_FIELDS = [
  'name', 'email', 'phone', 'city', 'country', 'gender', 'interested_in',
  'age', 'age_range_min', 'age_range_max', 'birthdate',
];

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

    const { userId, updates } = await req.json();

    if (!userId || !updates || typeof updates !== 'object') {
      return new Response(JSON.stringify({ error: 'userId y updates son requeridos' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cleanUpdates: Record<string, any> = {};
    for (const key of ALLOWED_FIELDS) {
      if (!(key in updates)) continue;
      const value = updates[key];
      // Ignorar vacíos/NaN: evita que columnas NOT NULL (ej. birthdate) reciban
      // '' cuando el formulario no tenía ese dato cargado, lo que tumbaría
      // todo el update aunque los demás campos sí fueran válidos.
      if (value === '' || value === null || value === undefined) continue;
      if (typeof value === 'number' && Number.isNaN(value)) continue;
      cleanUpdates[key] = value;
    }

    if (Object.keys(cleanUpdates).length === 0) {
      return new Response(JSON.stringify({ error: 'No hay campos válidos para actualizar' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    cleanUpdates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('users')
      .update(cleanUpdates)
      .eq('id', userId)
      .select()
      .maybeSingle();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, user: data }), {
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
