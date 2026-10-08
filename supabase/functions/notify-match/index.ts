// Supabase Edge Function: notify-match
// Recibe { user_ids: [uuid,...], event_id, conversation_id } y manda push de
// "¡Hiciste match!" a AMBAS personas usando send-push. Se dispara desde el
// trigger trg_event_affinity_match (con header x-match-secret).
//
// Por que existe (y no basta el push del chat): notify-chat-message excluye al
// autor del mensaje, y el mensaje de match va firmado por quien COMPLETA el
// match -> esa persona se quedaba sin aviso. Aqui se avisa a los dos.
//
// El payload de data usa type:'chat_message' + conversation_id a proposito: es
// el unico 'type' que la app ya sabe rutear (ver hooks/useNotificationRouting),
// asi el push abre directo el chat SIN necesidad de una version nueva de la app.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'https://wjdiraurfbawotlcndmk.supabase.co';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const MATCH_SECRET = Deno.env.get('MATCH_SECRET') || 'nospi_match_wh_9d2f7a1c3e6b';

serve(async (req) => {
  try {
    const secret = req.headers.get('x-match-secret') || '';
    if (secret !== MATCH_SECRET) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    let body: any = {};
    try { body = await req.json(); } catch { /* vacio */ }
    const ids = Array.isArray(body?.user_ids) ? body.user_ids.map((x: any) => String(x)) : [];
    if (ids.length === 0) {
      return new Response(JSON.stringify({ skipped: 'no user_ids' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const conversationId = body?.conversation_id ?? null;
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_ROLE}` },
      body: JSON.stringify({
        user_ids: ids,
        title: '¡Hiciste match! 💘',
        body: 'Alguien del encuentro también quiere volver a coincidir contigo. Toca para escribirle.',
        data: {
          type: 'chat_message',
          conversation_id: conversationId,
          kind: 'match',
          event_id: body?.event_id ?? null,
        },
      }),
    });
    const ok = res.ok;
    if (!ok) console.error('notify-match send-push error', res.status, await res.text());
    return new Response(JSON.stringify({ sent: ok, count: ids.length }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as any)?.message || e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
