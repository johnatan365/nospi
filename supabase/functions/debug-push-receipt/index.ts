import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// Deshabilitada: solo se uso para diagnostico puntual de entrega de push.
Deno.serve(() => new Response(JSON.stringify({ disabled: true }), { status: 410, headers: { 'Content-Type': 'application/json' } }));
