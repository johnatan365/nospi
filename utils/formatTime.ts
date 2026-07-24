// Convierte una hora en formato 24h ("19:00") a formato 12h con am/pm en
// español ("7:00 p.m.") para que se lea natural en cualquier lugar donde se
// le muestre la hora de un evento a un usuario (app, admin, correos,
// mensajes de WhatsApp). Si el valor no tiene la forma "HH:MM" se devuelve
// tal cual, para no romper nada si llega vacío o con otro formato.
export function formatTimeAmPm(time24: string | null | undefined): string {
  if (!time24) return '';
  const match = /^(\d{1,2}):(\d{2})/.exec(time24.trim());
  if (!match) return time24;
  let h = parseInt(match[1], 10);
  const m = match[2];
  if (Number.isNaN(h)) return time24;
  const suffix = h >= 12 ? 'p.m.' : 'a.m.';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${suffix}`;
}
