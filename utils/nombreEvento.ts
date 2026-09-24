// El nombre de un evento puede venir partido en dos renglones: `name` y
// `subtitulo`. La tarjeta de la app los muestra uno debajo del otro, pero en
// todo lo demas (el WhatsApp, el detalle del evento, los correos) hace falta
// el nombre completo en una sola linea. De ahi este helper: una sola forma de
// unirlos, en vez de repetir la misma concatenacion en cada sitio.

export function nombreLargoEvento(
  evento: { name?: string | null; subtitulo?: string | null } | null | undefined,
): string {
  const nombre = (evento?.name || '').trim();
  const segundo = (evento?.subtitulo || '').trim();
  if (!segundo) return nombre;
  if (!nombre) return segundo;
  return nombre + ' ' + segundo;
}
