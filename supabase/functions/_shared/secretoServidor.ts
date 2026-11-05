// Valida el secreto que mandan los triggers y crons de Postgres al llamar una
// Edge Function (headers x-webhook-secret, x-match-secret, x-recon-secret...).
//
// El secreto NO va escrito en el codigo: este repositorio es publico (ver
// CLAUDE.md). Vive en una fila de public.secretos_servidor, que solo lee
// service_role, generada dentro de la base. Los dos extremos leen la misma
// fila: el SQL con public.secreto('<clave>') al llamar, y la funcion con esto
// al validar. Para rotarlo basta con cambiar ese valor; no hay que tocar
// codigo ni desplegar.
//
// Hasta noviembre de 2026 ocho funciones tenian su secreto escrito en el
// archivo, y por lo tanto publicado.
//
// Lee la tabla por REST con la service role que Supabase inyecta en cada
// funcion, para no depender de que version de supabase-js use cada una.

/** Compara sin filtrar el secreto por el tiempo que tarda la comparacion. */
function comparacionSegura(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

async function leerSecreto(clave: string): Promise<string | null> {
  const url = Deno.env.get('SUPABASE_URL');
  const llave = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !llave) return null;
  const res = await fetch(
    `${url}/rest/v1/secretos_servidor?key=eq.${encodeURIComponent(clave)}&select=value`,
    { headers: { apikey: llave, Authorization: `Bearer ${llave}` } },
  );
  if (!res.ok) return null;
  const filas = (await res.json()) as Array<{ value?: unknown }>;
  const valor = filas[0]?.value;
  return typeof valor === 'string' && valor ? valor : null;
}

/**
 * true si `recibido` coincide con la fila `clave` de secretos_servidor.
 * Si la fila no existe o esta vacia, rechaza todo: es preferible perder un
 * aviso que dejar la funcion abierta a cualquiera.
 */
export async function secretoValido(clave: string, recibido: string | null | undefined): Promise<boolean> {
  if (!recibido) return false;
  const esperado = await leerSecreto(clave).catch(() => null);
  if (!esperado) {
    console.error(`secretoValido: no hay secreto '${clave}' en secretos_servidor`);
    return false;
  }
  return comparacionSegura(recibido, esperado);
}
