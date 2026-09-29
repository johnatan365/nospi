import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://wjdiraurfbawotlcndmk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// Envia una notificacion push masiva desde el admin: a todos los usuarios o a
// los asistentes confirmados de un evento. Delega el envio real a send-push.
//
// La CATEGORIA la elige el admin al redactar, porque el sistema no puede
// adivinarla: el texto lo escribe una persona. "Hay cena el sabado, quedan
// cupos" y "20% de descuento" son mensajes distintos para quien los recibe, y
// cada uno mira su propio interruptor en el perfil.
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // --- Verificacion de administrador. Permite: (a) el admin logueado,
    //     (b) llamadas internas con la service_role key. Rechaza el resto. ---
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
    // --- fin verificacion ---

    const body = await req.json().catch(() => ({}));
    const audience: string = body?.audience;
    const eventId: string | undefined = body?.event_id;
    const title: string = body?.title;
    const message: string = body?.body;
    const categoria: string = body?.categoria;

    if (!title || !message) return jsonResponse({ error: 'title y body son requeridos' }, 400);
    if (audience !== 'all' && audience !== 'event') return jsonResponse({ error: "audience debe ser 'all' o 'event'" }, 400);
    if (audience === 'event' && !eventId) return jsonResponse({ error: 'event_id es requerido cuando audience es event' }, 400);
    // Se exige a proposito: sin categoria, send-push lo tratatia como aviso de
    // reserva y se lo mandaria a TODOS, incluida la gente que apago la
    // publicidad. Mejor fallar aqui que mandar una promo a quien la rechazo.
    if (categoria !== 'novedades' && categoria !== 'promociones') {
      return jsonResponse({ error: "categoria debe ser 'novedades' o 'promociones'" }, 400);
    }

    let userIds: string[] = [];

    if (audience === 'all') {
      const { data, error } = await supabase.from('users').select('id');
      if (error) return jsonResponse({ error: error.message }, 400);
      userIds = (data || []).map((u: any) => u.id);
    } else {
      const { data, error } = await supabase
        .from('appointments')
        .select('user_id')
        .eq('event_id', eventId)
        .eq('status', 'confirmada');
      if (error) return jsonResponse({ error: error.message }, 400);
      userIds = Array.from(new Set((data || []).map((a: any) => a.user_id)));
    }

    if (userIds.length === 0) {
      return jsonResponse({ success: true, sent: 0, reason: 'no hay usuarios en esa audiencia' });
    }

    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        user_ids: userIds, title, body: message,
        data: { type: 'broadcast', categoria },
        categoria,
      }),
    });
    const json = await res.json();

    if (!res.ok) return jsonResponse({ error: json?.error || 'send-push fallo', detail: json }, 500);

    return jsonResponse({ success: true, audience: userIds.length, sent: json?.sent ?? 0, categoria, detail: json });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
