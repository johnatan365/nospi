// Ya ejecutada (16 jul 2026): backfill de las 3 conversiones Purchase que
// faltaban en Meta. Se deja con verify_jwt=true (protegida) porque ya cumplio
// su proposito de una sola vez.
Deno.serve(async (_req: Request) => {
  return new Response(JSON.stringify({ note: 'Backfill ya ejecutado el 16 jul 2026. Ver logs/tarea para detalle.' }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
