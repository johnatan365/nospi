// Ya cumplio su proposito (encontrar por que redes-sociales daba 401) y queda
// anulada: no lee ni reporta nada. Se puede borrar desde el panel de Supabase.
Deno.serve(() => new Response("gone", { status: 410 }));
