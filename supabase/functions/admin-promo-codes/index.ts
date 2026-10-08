import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://wjdiraurfbawotlcndmk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

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

// Admin panel CRUD para codigos promocionales. Mismo patron que admin-update-user:
// service role key, sin politicas publicas en la tabla, todo pasa por aca.
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

    // Leer el body UNA sola vez (Request.clone() despues de consumir el body
    // revienta con "Body is unusable" -- error real que salio en produccion).
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    if (action === 'list') {
      const { data: codes, error } = await supabase
        .from('promo_codes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) return jsonResponse({ error: error.message }, 400);

      // Traer conteo de redenciones por codigo para mostrar analytics basicos.
      const { data: redemptions } = await supabase
        .from('promo_code_redemptions')
        .select('promo_code_id');

      const counts: Record<string, number> = {};
      for (const r of redemptions || []) {
        counts[r.promo_code_id] = (counts[r.promo_code_id] || 0) + 1;
      }

      const enriched = (codes || []).map((c: any) => ({ ...c, redemption_count: counts[c.id] || 0 }));
      return jsonResponse({ success: true, codes: enriched });
    }

    if (action === 'create') {
      const { code, discountPercent, maxUses, expiresAt, label } = body;

      if (!code || typeof code !== 'string' || !code.trim()) {
        return jsonResponse({ error: 'El codigo es requerido' }, 400);
      }
      const discount = parseInt(discountPercent, 10);
      if (!discount || discount < 1 || discount > 100) {
        return jsonResponse({ error: 'El porcentaje de descuento debe estar entre 1 y 100' }, 400);
      }

      const insertData: Record<string, any> = {
        code: code.trim().toUpperCase(),
        discount_percent: discount,
        label: label || null,
        max_uses: maxUses ? parseInt(maxUses, 10) : null,
        expires_at: expiresAt || null,
      };

      const { data, error } = await supabase
        .from('promo_codes')
        .insert(insertData)
        .select()
        .maybeSingle();

      if (error) {
        const msg = error.code === '23505' ? 'Ya existe un codigo con ese nombre' : error.message;
        return jsonResponse({ error: msg }, 400);
      }

      return jsonResponse({ success: true, code: data });
    }

    if (action === 'update') {
      const { id, updates } = body;
      if (!id || !updates || typeof updates !== 'object') {
        return jsonResponse({ error: 'id y updates son requeridos' }, 400);
      }

      const ALLOWED = ['discount_percent', 'max_uses', 'expires_at', 'active', 'label'];
      const cleanUpdates: Record<string, any> = {};
      for (const key of ALLOWED) {
        if (key in updates) cleanUpdates[key] = updates[key];
      }
      cleanUpdates.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('promo_codes')
        .update(cleanUpdates)
        .eq('id', id)
        .select()
        .maybeSingle();

      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ success: true, code: data });
    }

    // Borra un codigo por completo. Las redenciones asociadas se borran solas
    // via ON DELETE CASCADE en promo_code_redemptions.promo_code_id.
    if (action === 'delete') {
      const { id } = body;
      if (!id) return jsonResponse({ error: 'id es requerido' }, 400);

      const { error } = await supabase.from('promo_codes').delete().eq('id', id);
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ success: true });
    }

    // Lista quien redimio un codigo especifico, con la misma info de perfil
    // que se muestra en la pestana Participantes (edad, intereses, genero, etc).
    if (action === 'redemptions') {
      const { id } = body;
      if (!id) return jsonResponse({ error: 'id es requerido' }, 400);

      const { data, error } = await supabase
        .from('promo_code_redemptions')
        .select(`
          id,
          created_at,
          discount_percent_applied,
          users:user_id ( id, name, email, phone, city, country, gender, interested_in, age, age_range_min, age_range_max ),
          events:event_id ( id, name, date )
        `)
        .eq('promo_code_id', id)
        .order('created_at', { ascending: false });

      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ success: true, redemptions: data || [] });
    }

    return jsonResponse({ error: `Accion no reconocida: ${action}` }, 400);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
