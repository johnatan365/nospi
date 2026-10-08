// Deshabilitada tras la depuracion del bug de restablecer contrasena.
Deno.serve(async () => new Response(JSON.stringify({ disabled: true }), { status: 410, headers: { 'Content-Type': 'application/json' } }));
