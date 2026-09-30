// Supabase Edge Function: send-email-reminders
//
// Modos de invocacion:
//
// 1) Bajo demanda con { event_id } en el body (boton 'Revelar ubicacion' del
//    admin, o trigger de Postgres cuando is_location_revealed pasa a true):
//    envia de inmediato el correo de ubicacion revelada a los confirmados
//    de ESE evento que aun no lo hayan recibido (reminder_48h_email_sent_at
//    IS NULL).
//
// 2) Invocacion normal por pg_cron (sin event_id, cada 5 min):
//    a) A cualquier hora: recordatorio de 'faltan 3 dias' para eventos que
//       caen exactamente 3 dias de calendario (hora Bogota) despues de hoy.
//       No depende de is_location_revealed -sale con o sin ubicacion.
//    b) Recordatorio del mismo dia: cada evento tiene su propia hora
//       objetivo (ver sameDaySendMinutesBogota).
//    c) Inicio del evento + 5 min: aviso de 'rompan el hielo, abran la
//       Dinamica', justo cuando la app libera "Continuar" (con ventana de
//       gracia por si el cron se atrasa). Espejo del bloque equivalente de push.
//
// 3) Preview con { event_id, preview_email, preview_type } ('48h' | 'sameday'
//    | '3d' | 'event_start'): arma el mismo texto que se enviaria y lo manda
//    SOLO a preview_email, sin tocar nada de asistentes reales. Acepta
//    tambien preview_tag opcional para que el asunto sea unico y Gmail no
//    agrupe los previews de prueba en el mismo hilo colapsado.
//
// 4) Correccion puntual con { event_id, send_correction: true, only_emails? }.
//
// IMPORTANTE - zona horaria: 'event.date' es el INSTANTE UTC exacto del
// evento (ej. viernes 7pm Bogota = sabado 00:00 UTC). El server corre en
// UTC, asi que cualquier formateo de fecha para el usuario tiene que pasar
// timeZone: 'America/Bogota' explicitamente.
//
// v25: guino de marca Nospi (nos pillamos) en las despedidas de todos los
// correos, tanto en texto plano como en el HTML visible.
//
// v26: se agrega la politica de asistencia (cancelacion 24h/saldo/amonestacion)
// a los correos de 3 dias y dia anterior, la valvula de soporte al del mismo
// dia, y el enlace "Ver la politica de asistencia" (nospi.co/#politica) en los
// tres. No se toca ningun otro texto.
//
// v30: se agrega en el correo del mismo dia una linea corta sobre el cierre de
// la dinamica: eleccion de afinidad privada (solo se revela si hay match) y
// calificacion de la experiencia.
//
// v32: el correo de inicio de evento (event_start) ya no sale a la hora exacta
// sino a la hora + EVENT_START_DELAY_MS (5 min), el mismo instante en que la
// app libera el boton "Continuar" (START_WINDOW_MINUTES en dinamica.tsx).
//
// v41: eventos de videollamada (type='virtual'). Los cuatro correos tienen
// version virtual. NINGUNA lleva el enlace del Meet: ese vive detras del boton
// de la app (events.meet_link) porque tocarlo es lo que registra la asistencia.
// Si viajara por correo se reenviaria y se entraria sin pasar por la app, que
// es justo lo que medimos. Por eso en virtual el boton del correo apunta a
// app.nospi.co y nunca a maps_link.
//
// v49: videollamada — nuevo flujo: 10 min antes se confirma en la Dinamica,
// se escoge moderador (obligatorio) y 'Ir a Meet' es la asistencia.
//
// v48: videollamada — el correo del dia anterior sale solo a las 9 a.m. del dia
// anterior (el acceso se activa al guardar el link, que puede ser dias antes).
//
// v45: videollamada — el correo del mismo dia y el de inicio dicen que hacer al
// entrar (camara, ronda de saludo, quien toca "Quiero ser el moderador",
// papel y lapiz): en un Meet sin nadie de Nospi, nadie arrancaba solo.
//
// v53: el moderador sale del mismo grupo. Los textos decian "el moderador lleva
// el juego" y "alguien se ofrece", que sonaba a que Nospi pone el moderador.
// Ahora dicen que es uno de ellos y nombran el boton exacto de la app.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://wjdiraurfbawotlcndmk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';

const BOGOTA_TZ = 'America/Bogota';
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;
const SAMEDAY_SEND_HOUR = 9;
const EARLY_EVENT_BUFFER_MINUTES = 120;
const PRECISION_GRACE_MS = 45 * 60 * 1000;

// Cuanto DESPUES de la hora del evento sale el correo de inicio. Debe
// coincidir con START_WINDOW_MINUTES de la app (app/(tabs)/dinamica.tsx) y con
// EVENT_START_DELAY_MS de send-push-reminders.
const EVENT_START_DELAY_MS = 5 * 60 * 1000;

// Cuanto ANTES de la hora se habilita el boton de entrar a la videollamada.
// Es el valor de {horaBoton} en las plantillas virtuales -- las mismas que se
// usan por WhatsApp desde el admin, asi que los dos canales dicen la misma hora.
// Debe coincidir con MINUTOS_ANTES_ENTRAR de app/event-details/[id].tsx,
// VIRTUAL_CONFIRM_MINUTES de app/(tabs)/dinamica.tsx y VIRTUAL_CONNECT_BEFORE_MS
// de send-push-reminders. Estuvo en 10 mientras el admin ya mandaba 15: la gente
// lo intentaba a la hora que decia el WhatsApp y encontraba la pantalla cerrada.
const MINUTOS_ANTES_ENTRAR = 15;

// En un evento virtual el boton del correo lleva a la app, nunca al Meet.
// Botones de los correos: nunca a la raiz (abre la pestaña Eventos, que es el
// catalogo para comprar). Videollamada y dia del evento van a la Dinamica, que
// es donde se confirma y se juega. Sin "(tabs)" en la URL: los parentesis se
// rompen en algunos clientes de correo y la ruta limpia funciona igual.
const URL_DINAMICA = 'https://app.nospi.co/dinamica';

async function sendEmail(to: string, subject: string, text: string, html?: string): Promise<{ ok: boolean; errorText?: string }> {
  if (!RESEND_API_KEY || !to) return { ok: false, errorText: 'sin API key o destinatario' };
  try {
    const payload: Record<string, unknown> = { from: 'Nospi <noreply@nospi.co>', to: [to], subject, text };
    if (html) payload.html = html;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error('send-email-reminders: Resend error', res.status, errText);
      return { ok: false, errorText: errText };
    }
    return { ok: true };
  } catch (e) {
    console.error('send-email-reminders: excepcion enviando correo', e);
    return { ok: false, errorText: String(e) };
  }
}

function daysUntilEventBogota(nowUTC: Date, eventDateISO: string): number {
  const nowBogota = new Date(nowUTC.getTime() - BOGOTA_OFFSET_MS);
  const eventBogota = new Date(new Date(eventDateISO).getTime() - BOGOTA_OFFSET_MS);
  const startOfToday = Date.UTC(nowBogota.getUTCFullYear(), nowBogota.getUTCMonth(), nowBogota.getUTCDate());
  const startOfEventDay = Date.UTC(eventBogota.getUTCFullYear(), eventBogota.getUTCMonth(), eventBogota.getUTCDate());
  return Math.round((startOfEventDay - startOfToday) / (24 * 60 * 60 * 1000));
}

function daysRemainingCopy(daysUntil: number): { subjectPhrase: string; bodyPhrase: string } {
  if (daysUntil <= 0) return { subjectPhrase: 'Es hoy', bodyPhrase: 'hoy es' };
  if (daysUntil === 1) return { subjectPhrase: 'Falta 1 día', bodyPhrase: 'en 1 día tienes' };
  return { subjectPhrase: `Faltan ${daysUntil} días`, bodyPhrase: `en ${daysUntil} días tienes` };
}

function buildLocationFull(locationName?: string | null, locationAddress?: string | null): string {
  if (!locationName) return '';
  return locationAddress ? `${locationName} (${locationAddress})` : locationName;
}

function formatEventDateBogota(eventDateISO: string): string {
  return new Date(eventDateISO).toLocaleDateString('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: BOGOTA_TZ,
  });
}

function formatEventDateBuggyUTC(eventDateISO: string): string {
  return new Date(eventDateISO).toLocaleDateString('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  });
}

function formatTimeAmPm(time24: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec((time24 || '').trim());
  if (!match) return time24 || '';
  let h = parseInt(match[1], 10);
  const m = match[2];
  const suffix = h >= 12 ? 'p.m.' : 'a.m.';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${suffix}`;
}

// La hora en que se habilita el boton de entrar: la del evento menos 15 min.
function restarMinutos(time24?: string | null, minutos: number = MINUTOS_ANTES_ENTRAR): string {
  const m = /^(\d{1,2}):(\d{2})/.exec((time24 || '').trim());
  if (!m) return '';
  let total = parseInt(m[1], 10) * 60 + parseInt(m[2], 10) - minutos;
  if (total < 0) total += 24 * 60;
  const h24 = Math.floor(total / 60);
  const mm = total % 60;
  const suf = h24 >= 12 ? 'p.m.' : 'a.m.';
  let h = h24 % 12;
  if (h === 0) h = 12;
  return `${h}:${String(mm).padStart(2, '0')} ${suf}`;
}

function esVirtual(event: any): boolean {
  return event?.type === 'virtual';
}

// Cuando un evento se divide en mesas, el nombre lleva "Mesa N" y al llegar al
// establecimiento hay que pedir esa mesa concreta, no solo "Nospi": si los dos
// grupos dicen lo mismo, el mesero no sabe a cual sentar a quien. Si el evento
// no esta dividido no hay match y el texto queda igual que siempre.
// Espejo de marcaDeLlegada() en app/admin/index.web.tsx.
function numeroDeMesa(eventName?: string | null): string | null {
  const m = /\bmesa\s*(\d+)\b/i.exec(eventName || '');
  return m ? m[1] : null;
}

function marcaDeLlegada(eventName?: string | null): string {
  const m = /\bmesa\s*(\d+)\b/i.exec(eventName || '');
  return m ? `Nospi Mesa ${m[1]}` : 'Nospi';
}

function sameDaySendMinutesBogota(eventDateISO: string): number {
  const eventBogota = new Date(new Date(eventDateISO).getTime() - BOGOTA_OFFSET_MS);
  const eventMinutes = eventBogota.getUTCHours() * 60 + eventBogota.getUTCMinutes();
  const defaultSendMinutes = SAMEDAY_SEND_HOUR * 60;
  if (eventMinutes < defaultSendMinutes) {
    return Math.max(0, eventMinutes - EARLY_EVENT_BUFFER_MINUTES);
  }
  return defaultSendMinutes;
}

function wrapBrandedHtml(bodyHtml: string, ctaUrl?: string, ctaLabel?: string): string {
  const ctaBlock = ctaUrl && ctaLabel ? `
    <tr>
      <td style="padding: 4px 32px 8px;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
          <tr>
            <td style="background-color:#AD1457; border-radius:10px;">
              <a href="${ctaUrl}" style="display:inline-block; padding:14px 28px; color:#ffffff; text-decoration:none; font-weight:bold; font-size:15px; font-family: -apple-system, Helvetica, Arial, sans-serif;">${ctaLabel}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>` : '';
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0; padding:0; background-color:#f4f0f2;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f0f2; padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:16px; overflow:hidden; font-family: -apple-system, Helvetica, Arial, sans-serif;">
          <tr>
            <td style="background-color:#880E4F; padding:24px 32px; text-align:center;">
              <img src="https://wjdiraurfbawotlcndmk.supabase.co/storage/v1/object/public/branding/icon-small.png" width="72" height="72" alt="Nospi" style="display:inline-block; width:72px; height:72px; border-radius:16px; border:0;" />
            </td>
          </tr>
          <tr>
            <td style="padding: 30px 32px 8px;">
              ${bodyHtml}
            </td>
          </tr>
          ${ctaBlock}
          <tr>
            <td style="padding: 8px 32px 30px;"></td>
          </tr>
          <tr>
            <td style="background-color:#faf7f8; padding:18px 32px; text-align:center; border-top:1px solid #eee;">
              <p style="margin:0; font-size:12px; color:#9ca3af; font-family: -apple-system, Helvetica, Arial, sans-serif;">Equipo Nospi · app.nospi.co</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function htmlParagraph(txt: string, opts?: { strong?: boolean; muted?: boolean }): string {
  const color = opts?.muted ? '#6b7280' : '#1f2937';
  const size = opts?.muted ? '14px' : '16px';
  const inner = opts?.strong ? `<strong>${txt}</strong>` : txt;
  return `<p style="margin:0 0 12px; font-size:${size}; color:${color}; line-height:1.6; font-family: -apple-system, Helvetica, Arial, sans-serif;">${inner}</p>`;
}

// ── Plantillas de mensajes, editables desde el admin ────────────────────────
// El texto de los mensajes de videollamada vive en app_config, no aqui: asi se
// cambia una palabra desde Configuracion sin desplegar la funcion. Una sola
// plantilla alimenta TRES salidas (el WhatsApp del admin, el correo en texto
// plano y el correo en HTML), asi que WhatsApp y correo no se pueden
// desincronizar.
//
// Formato: el de WhatsApp, que es el que ya se sabe escribir.
//   *negrita*   _cursiva_   y una linea en blanco separa parrafos.
// Comodines: {nombre} {evento} {fecha} {hora} {horaBoton}
//
// Los textos de abajo son el RESPALDO: si la clave se borra o queda vacia, el
// correo sale igual con esto. Nunca se manda un correo en blanco.
// Espejo de las mismas funciones en app/admin/index.web.tsx.

const PLANTILLA_VIRTUAL_HOY_DEFECTO = [
  '\u00a1Hola {nombre}! \ud83d\udc4b', '',
  '\ud83c\udfa5 *Hoy a las {hora}* es tu videollamada.', '',
  '*Entras desde la app, en 3 toques:*',
  '1\ufe0f\u20e3 Abre Nospi \u2192 pesta\u00f1a *Din\u00e1mica* (desde las {horaBoton})',
  '2\ufe0f\u20e3 *Confirmar asistencia*',
  '3\ufe0f\u20e3 Ah\u00ed mismo sale el bot\u00f3n *Ir a Meet*: lo tocas y te abre la llamada', '',
  '\ud83c\udfa4 Uno de ustedes modera: si te animas, toca *"Quiero ser el moderador"*',
  '\ud83d\udcf9 Te recomendamos entrar con la c\u00e1mara prendida: nos conocemos mejor vi\u00e9ndonos las caras',
  '\u270f\ufe0f Ten a mano papel y l\u00e1piz', '',
  'Al final eliges con qui\u00e9n hiciste clic \u2014 si es mutuo, se abre un *chat privado* \ud83d\udd12', '',
  '\ud83d\udcf2 \u00bfA\u00fan sin las apps?',
  'Nospi \ud83d\udc49 nospi.co/app',
  'Google Meet \ud83d\udc49 nospi.co/meet', '',
  '\u00a1Hoy Nospi! \ud83c\udf89',
].join('\n');

const PLANTILLA_VIRTUAL_VISPERA_DEFECTO = [
  '\u00a1Hola {nombre}! \ud83d\udc4b', '',
  '\ud83c\udfa5 *Ma\u00f1ana a las {hora}* es tu videollamada \u2014 desde donde est\u00e9s.', '',
  '\ud83d\udcf2 *Inst\u00e1lalas hoy:*',
  'Nospi \ud83d\udc49 nospi.co/app',
  'Google Meet \ud83d\udc49 nospi.co/meet',
  'En Nospi est\u00e1 el enlace, la din\u00e1mica y el chat con tus matches. Y te avisa cuando arranca \ud83d\udd14', '',
  'Ma\u00f1ana desde las {horaBoton} confirmas en la pesta\u00f1a *Din\u00e1mica*, uno del grupo se anima a moderar y entran a la llamada.', '',
  '\ud83d\udcf9 Te recomendamos entrar con la c\u00e1mara prendida: nos conocemos mejor vi\u00e9ndonos las caras. Ten a mano papel y l\u00e1piz \ud83d\ude09', '',
  '\u00bfNo puedes ir? Cancela hoy y conservas tu saldo. Ma\u00f1ana ya no alcanzamos a devolverlo y te queda una falta.', '',
  '\u00a1Nos pillamos! \ud83d\ude04',
  '_Equipo Nospi_',
].join('\n');

// Un comodin que no exista se deja tal cual: es preferible que se vea "{hroa}"
// y se note el error de dedo, a que salga un hueco silencioso en el mensaje.
function aplicarComodines(plantilla: string, datos: Record<string, string>): string {
  return (plantilla || '').replace(/\{(\w+)\}/g, (m, k) => (k in datos ? datos[k] : m));
}

// Version para leer como texto: se quitan las marcas de formato.
function plantillaATexto(txt: string): string {
  return (txt || '')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/_([^_\n]+)_/g, '$1');
}

// Version HTML. Se escapan los signos de HTML ANTES de aplicar el formato:
// lo que se escribe en el admin es texto, no codigo, y asi un "<" pegado por
// accidente no puede romper el correo.
function plantillaAHtml(txt: string): string {
  const escapar = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return (txt || '')
    .split(/\n\s*\n/)
    .map((bloque) => bloque.trim())
    .filter((bloque) => bloque.length > 0)
    .map((bloque) => {
      const cuerpo = escapar(bloque)
        .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
        .replace(/_([^_\n]+)_/g, '<em>$1</em>')
        // Los links van escritos a pelo (nospi.co/app). En el correo tienen que
        // ser clicables o no sirven de nada.
        .replace(/\b((?:https?:\/\/|www\.)[^\s<]+|nospi\.co\/[a-z0-9-]+)/gi,
          (u) => `<a href="${u.startsWith('http') ? u : 'https://' + u}" style="color:#880E4F;">${u}</a>`)
        .replace(/\n/g, '<br />');
      return htmlParagraph(cuerpo);
    })
    .join('');
}

type Plantillas = { hoy: string; vispera: string };

async function cargarPlantillas(supabase: any): Promise<Plantillas> {
  const out: Plantillas = { hoy: PLANTILLA_VIRTUAL_HOY_DEFECTO, vispera: PLANTILLA_VIRTUAL_VISPERA_DEFECTO };
  try {
    const { data } = await supabase
      .from('app_config')
      .select('key, value')
      .in('key', ['msg_virtual_hoy', 'msg_virtual_vispera']);
    for (const row of data || []) {
      const v = String(row.value || '').trim();
      if (!v) continue;
      if (row.key === 'msg_virtual_hoy') out.hoy = v;
      if (row.key === 'msg_virtual_vispera') out.vispera = v;
    }
  } catch (e) {
    console.error('send-email-reminders: no se pudieron leer las plantillas, se usan las de respaldo', e);
  }
  return out;
}

// Links cortos de instalar. Los textos no dicen solo "instala la app": dicen
// lo que se gana (avisos del lugar, de la dinamica y de los matches). Son los
// mismos que los WhatsApp del admin. No se dice que la app es obligatoria
// porque la dinamica tambien funciona en la web.
const LINK_APP = 'https://nospi.co/app';
const LINK_MEET = 'https://nospi.co/meet';
const INSTALAR_PRESENCIAL = '📲 Para vivir la dinámica completa, instala Nospi. Ahí te avisamos cuando revelamos el lugar, cuando arranca la dinámica y cuando alguien con quien hiciste clic te escribe 💬';
const INSTALAR_PRESENCIAL_VISPERA = '📲 Mañana la dinámica se juega desde el celular. Instala Nospi hoy para que te avise cuando arranca y no te pierdas ningún match.';
const INSTALAR_PRESENCIAL_HOY = '📲 ¿Aún sin la app? Instálala antes de salir: sin ella te pierdes los avisos de la dinámica y de tus matches.';
const INSTALAR_VIRTUAL = '📲 Instálalas hoy:';
const INSTALAR_VIRTUAL_HOY = '📲 ¿Aún sin las apps?';
const NOSPI_TIENE = 'En Nospi está el enlace, la dinámica y el chat con tus matches. Y te avisa cuando arranca 🔔';

// Links cortos de nospi.co: cada uno detecta el celular y manda a la tienda
// correcta (App Store o Play Store). En videollamada va tambien Google Meet.
function htmlBotonesTienda(virtual = false): string {
  const boton = (url: string, label: string) =>
    `<a href="${url}" style="display:inline-block; margin:0 8px 8px 0; padding:10px 16px; border:1px solid #AD1457; border-radius:8px; color:#880E4F; text-decoration:none; font-size:14px; font-weight:bold; font-family: -apple-system, Helvetica, Arial, sans-serif;">${label}</a>`;
  return `<p style="margin:0 0 12px;">${boton(LINK_APP, '📲 Instalar Nospi')}${virtual ? boton(LINK_MEET, '🎥 Instalar Google Meet') : ''}</p>`;
}

// Videollamada: en un Meet entre desconocidos nadie arranca solo. Estos pasos
// le dicen a cada uno que hacer al entrar, sin que nadie de Nospi este en la
// llamada. Mismo texto que BLOQUE_AL_ENTRAR_VIRTUAL del WhatsApp del admin.
const AL_ENTRAR_VIRTUAL = [
  '📹 Prende la cámara y saluda: venimos a conocernos, y eso pasa viéndonos las caras. Busca un lugar tranquilo con buena señal',
  '🎤 El moderador sale del mismo grupo — puede ser cualquiera de ustedes. Se postula en la app y desde ahí va leyendo las preguntas y dando la palabra',
  '✋ Para hablar, levanta la mano en Meet o espera a que te pasen la palabra',
  '✏️ Ten a mano papel y lápiz',
];

function buildSameDayText(firstName: string, event: any, plantillas?: Plantillas): { subject: string; text: string; html: string } {
  const virtual = esVirtual(event);
  const subject = event.time
    ? `Hoy, ${formatTimeAmPm(event.time)} · ${event.name || 'Nospi'}`
    : `Hoy · ${event.name || 'Nospi'}`;

  if (virtual) {
    // Texto unico desde la plantilla: el mismo que sale por WhatsApp.
    const armado = aplicarComodines(plantillas?.hoy || PLANTILLA_VIRTUAL_HOY_DEFECTO, {
      nombre: firstName,
      evento: event.name || 'tu evento',
      fecha: formatEventDateBogota(event.date),
      hora: event.time ? formatTimeAmPm(event.time) : '',
      horaBoton: restarMinutos(event.time) || '15 minutos antes',
    });
    return {
      subject,
      text: plantillaATexto(armado),
      html: wrapBrandedHtml(plantillaAHtml(armado), URL_DINAMICA, 'Abrir la Dinámica'),
    };
  }

  const locationFull = buildLocationFull(event.location_name, event.location_address);
  const text = [
    `Hola ${firstName},`, '', `Hoy es "${event.name || 'tu evento'}" 🎉`,
    event.time ? `🕖 ${formatTimeAmPm(event.time)}` : null,
    locationFull ? `📍 ${locationFull}` : null,
    event.maps_link ? `🗺️ ${event.maps_link}` : null, '',
    `Al llegar di que vienes de ${marcaDeLlegada(event.name)} y te indican tu mesa. Llega puntual: arrancamos con la dinámica para romper el hielo.`, '',
    'Ya en la mesa abres la Dinámica y confirmas tu llegada: si no confirmas cuenta como falta, y con faltas se suspende la cuenta para reservar. Al final eliges con quién hiciste clic: nadie se entera, y si es mutuo se abre un chat privado 🔒', '',
    INSTALAR_PRESENCIAL_HOY,
    '👉 nospi.co/app', '',
    '¡Hoy Nospi! 🎉',
  ].filter((l) => l !== null).join('\n');

  const bodyHtml = [
    htmlParagraph(`Hola ${firstName},`),
    htmlParagraph(`Hoy es <strong>"${event.name || 'tu evento'}"</strong> 🎉`),
    htmlParagraph(`${event.time ? `🕖 <strong>${formatTimeAmPm(event.time)}</strong><br />` : ''}${locationFull ? `📍 <strong>${locationFull}</strong>` : ''}`),
    htmlParagraph(`Al llegar di que vienes de <strong>${marcaDeLlegada(event.name)}</strong> y te indican tu mesa. Llega puntual: arrancamos con la dinámica para romper el hielo.`),
    htmlParagraph('Ya en la mesa abres la <strong>Dinámica</strong> y confirmas tu llegada: <strong>si no confirmas cuenta como falta</strong>, y con faltas se suspende la cuenta para reservar. Al final eliges con quién hiciste clic: nadie se entera, y si es mutuo se abre un <strong>chat privado</strong> 🔒'),
    htmlParagraph(INSTALAR_PRESENCIAL_HOY, { muted: true }),
    htmlBotonesTienda(),
    htmlParagraph('¡Hoy Nospi! 🎉', { strong: true }),
  ].join('');
  const html = wrapBrandedHtml(bodyHtml, event.maps_link || URL_DINAMICA, event.maps_link ? 'Como llegar' : 'Abrir la Dinámica');

  return { subject, text, html };
}

function buildEventStartText(firstName: string, event: any): { subject: string; text: string; html: string } {
  const virtual = esVirtual(event);
  const subject = '🎉 Rompan el hielo, abran la Dinámica';
  // Este es el UNICO correo que llega DESPUES de que arranco: para quien no
  // alcanzo a tocar el boton, es la ultima oportunidad antes de la falta.
  const rescate = virtual
    ? '¿Todavía no entraste? Abre Nospi, pestaña Dinámica: confirmas tu asistencia y tocas Ir a Meet.'
    : null;

  const text = [
    `Hola ${firstName},`, '',
    virtual
      ? `Tu videollamada "${event.name || 'Nospi'}" ya está en marcha.`
      : `Tu evento "${event.name || 'Nospi'}" ya está en marcha.`, '',
    ...(virtual
      ? ['Adentro:', ...AL_ENTRAR_VIRTUAL, '', 'Dinámica: https://app.nospi.co/dinamica', '']
      : ['Abran la pestaña Dinámica en la app para romper el hielo con tu grupo: https://app.nospi.co/dinamica', '',
         'Elijan entre ustedes a alguien que se encargue de leer las preguntas en voz alta.', '']),
    rescate,
    rescate ? '' : null,
    '¡Que la pasen increíble! ¡Nospi! 🎉', 'Equipo Nospi',
  ].filter((l) => l !== null).join('\n');

  const bodyHtml = [
    htmlParagraph(`Hola ${firstName},`),
    htmlParagraph(virtual
      ? `Tu videollamada <strong>"${event.name || 'Nospi'}"</strong> ya está en marcha 🎉`
      : `Tu evento <strong>"${event.name || 'Nospi'}"</strong> ya está en marcha 🎉`),
    virtual
      ? htmlParagraph(`<strong>Adentro:</strong><br />${AL_ENTRAR_VIRTUAL.join('<br />')}`)
      : htmlParagraph('Abran la pestaña <strong>Dinámica</strong> en la app para romper el hielo con tu grupo.'),
    virtual ? '' : htmlParagraph('Elijan entre ustedes a alguien que se encargue de leer las preguntas en voz alta.', { muted: true }),
    rescate ? htmlParagraph(`<strong>¿Todavía no entraste?</strong> El botón para entrar a la videollamada está en el evento, dentro de la app.`) : '',
    htmlParagraph('¡Que la pasen increíble! ¡Nospi! 🎉'),
  ].join('');

  const html = wrapBrandedHtml(bodyHtml, URL_DINAMICA, 'Abrir la Dinámica');
  return { subject, text, html };
}

function build48hText(firstName: string, event: any, now: Date, plantillas?: Plantillas): { subject: string; text: string; html: string } {
  const virtual = esVirtual(event);
  const formattedDate = formatEventDateBogota(event.date);
  const locationFull = buildLocationFull(event.location_name, event.location_address);
  const daysUntil = daysUntilEventBogota(now, event.date);
  const { bodyPhrase } = daysRemainingCopy(daysUntil);
  const esVispera = daysUntil === 1;
  const esHoy = daysUntil <= 0;

  if (virtual) {
    // El asunto nunca dice "ya tenemos el lugar": no hay lugar.
    const subject = esVispera
      ? `Mañana: ${event.name || 'tu evento'}${event.time ? `, ${formatTimeAmPm(event.time)}` : ''}`
      : `Hoy${event.time ? `, ${formatTimeAmPm(event.time)}` : ''} · ${event.name || 'tu evento'}`;
    // Si el link del Meet se guarda el mismo dia del evento, este correo ya no
    // es de vispera: se manda el texto de "hoy", que es el que trae los pasos.
    const base = esVispera
      ? (plantillas?.vispera || PLANTILLA_VIRTUAL_VISPERA_DEFECTO)
      : (plantillas?.hoy || PLANTILLA_VIRTUAL_HOY_DEFECTO);
    const armado = aplicarComodines(base, {
      nombre: firstName,
      evento: event.name || 'tu evento',
      fecha: formattedDate,
      hora: event.time ? formatTimeAmPm(event.time) : '',
      horaBoton: restarMinutos(event.time) || '15 minutos antes',
    });
    return {
      subject,
      text: plantillaATexto(armado),
      html: wrapBrandedHtml(plantillaAHtml(armado), URL_DINAMICA, 'Abrir la Dinámica'),
    };
  }

  // El asunto dice cuando es, que es lo que la persona busca al abrirlo. El
  // anterior prometia "ya revelamos la ubicacion" y el cuerpo ni la mencionaba.
  const instalarTexto = esHoy ? INSTALAR_PRESENCIAL_HOY : esVispera ? INSTALAR_PRESENCIAL_VISPERA : INSTALAR_PRESENCIAL;
  const cancelarTexto = esHoy
    ? null
    : esVispera
      ? '¿No puedes ir? Cancela hoy y conservas tu saldo. Mañana ya no alcanzamos a devolverlo y te queda una falta.'
      : '¿No puedes ir? Cancela hasta 24 h antes y conservas tu saldo. Después pierdes el saldo y te queda una falta.';
  const subject = esVispera
    ? `Mañana: ${event.name || 'tu evento'}${event.time ? `, ${formatTimeAmPm(event.time)}` : ''}`
    : esHoy
      ? `Hoy${event.time ? `, ${formatTimeAmPm(event.time)}` : ''} · ${event.name || 'tu evento'}`
      : `📍 Ya tenemos el lugar de ${event.name || 'tu evento'}`;
  const text = [
    `Hola ${firstName},`, '',
    esVispera
      ? `Mañana es "${event.name || 'tu evento'}".`
      : esHoy
        ? `Hoy es "${event.name || 'tu evento'}".`
        : `Te recordamos que ${bodyPhrase} "${event.name || 'tu evento'}".`,
    event.time ? `🕖 ${formatTimeAmPm(event.time)}` : `📅 ${formattedDate}`,
    locationFull ? `📍 ${locationFull}` : null,
    event.maps_link ? `🗺️ ${event.maps_link}` : null, '',
    instalarTexto,
    '👉 nospi.co/app', '',
    cancelarTexto,
    cancelarTexto ? '' : null,
    'Equipo Nospi',
  ].filter((l) => l !== null).join('\n');

  const bodyHtml = [
    htmlParagraph(`Hola ${firstName},`),
    htmlParagraph(esVispera
      ? `Mañana es <strong>"${event.name || 'tu evento'}"</strong>.`
      : esHoy
        ? `Hoy es <strong>"${event.name || 'tu evento'}"</strong>.`
        : `Te recordamos que ${bodyPhrase} <strong>"${event.name || 'tu evento'}"</strong>.`),
    htmlParagraph(`${event.time ? `🕖 <strong>${formatTimeAmPm(event.time)}</strong>` : `📅 <strong>${formattedDate}</strong>`}${locationFull ? `<br />📍 <strong>${locationFull}</strong>` : ''}`),
    htmlParagraph(instalarTexto),
    htmlBotonesTienda(),
    cancelarTexto ? htmlParagraph(`${cancelarTexto.replace('te queda una falta', '<strong>te queda una falta</strong>')}`, { muted: true }) : '',
  ].join('');
  const html = wrapBrandedHtml(bodyHtml, event.maps_link, event.maps_link ? 'Como llegar' : undefined);

  return { subject, text, html };
}

function build3dText(firstName: string, event: any): { subject: string; text: string; html: string } {
  const virtual = esVirtual(event);
  const formattedDate = formatEventDateBogota(event.date);
  const locationFull = buildLocationFull(event.location_name, event.location_address);
  const subject = `Faltan 3 días: ${event.name || 'tu evento'}`;

  if (virtual) {
    const text = [
      `Hola ${firstName},`, '', `En 3 días tienes "${event.name || 'tu evento'}".`,
      `📅 ${formattedDate}${event.time ? ` · ${formatTimeAmPm(event.time)}` : ''}`,
      '🎥 Por videollamada — no tienes que ir a ningún lado.', '',
      INSTALAR_VIRTUAL,
      'Nospi 👉 nospi.co/app',
      'Google Meet 👉 nospi.co/meet',
      NOSPI_TIENE, '',
      'Cancelas gratis hasta 24 h antes y conservas tu saldo. Después pierdes el saldo y te queda una falta en la cuenta.',
      '📋 https://app.nospi.co/politica-asistencia', '',
      '¡Nos pillamos! 😄', 'Equipo Nospi',
    ].filter((l) => l !== null).join('\n');

    const bodyHtml = [
      htmlParagraph(`Hola ${firstName},`),
      htmlParagraph(`En 3 días tienes <strong>"${event.name || 'tu evento'}"</strong>.`),
      htmlParagraph(`📅 <strong>${formattedDate}</strong>${event.time ? ` · <strong>${formatTimeAmPm(event.time)}</strong>` : ''}<br />🎥 Por videollamada — no tienes que ir a ningún lado.`),
      htmlParagraph(INSTALAR_VIRTUAL),
      htmlBotonesTienda(true),
      htmlParagraph(NOSPI_TIENE, { muted: true }),
      htmlParagraph('Cancelas gratis hasta <strong>24 h antes</strong> y conservas tu saldo. Después pierdes el saldo y <strong>te queda una falta</strong> en la cuenta. <a href="https://app.nospi.co/politica-asistencia" style="color:#880E4F;">Ver política</a>', { muted: true }),
      htmlParagraph('¡Nos pillamos! 😄', { strong: true }),
    ].join('');
    // Sin boton "Como llegar": no hay a donde llegar.
    return { subject, text, html: wrapBrandedHtml(bodyHtml, URL_DINAMICA, 'Abrir la Dinámica') };
  }

  const text = [
    `Hola ${firstName},`, '', `En 3 días tienes "${event.name || 'tu evento'}".`,
    `📅 ${formattedDate}${event.time ? ` · ${formatTimeAmPm(event.time)}` : ''}`,
    event.is_location_revealed && locationFull ? `📍 ${locationFull}` : '📍 El lugar te lo mandamos un día antes.',
    event.is_location_revealed && event.maps_link ? `🗺️ ${event.maps_link}` : null,
    '',
    INSTALAR_PRESENCIAL,
    '👉 nospi.co/app', '',
    'Cancelas gratis hasta 24 h antes y conservas tu saldo. Después pierdes el saldo y te queda una falta en la cuenta.',
    '📋 https://app.nospi.co/politica-asistencia', '',
    '¡Nos pillamos! 😄', 'Equipo Nospi',
  ].filter((l) => l !== null).join('\n');

  const bodyHtml = [
    htmlParagraph(`Hola ${firstName},`),
    htmlParagraph(`En 3 días tienes <strong>"${event.name || 'tu evento'}"</strong>.`),
    htmlParagraph(`📅 <strong>${formattedDate}</strong>${event.time ? ` · <strong>${formatTimeAmPm(event.time)}</strong>` : ''}<br />${event.is_location_revealed && locationFull ? `📍 <strong>${locationFull}</strong>` : '📍 El lugar te lo mandamos un día antes.'}`),
    htmlParagraph(INSTALAR_PRESENCIAL),
    htmlBotonesTienda(),
    htmlParagraph('Cancelas gratis hasta <strong>24 h antes</strong> y conservas tu saldo. Después pierdes el saldo y <strong>te queda una falta</strong> en la cuenta. <a href="https://app.nospi.co/politica-asistencia" style="color:#880E4F;">Ver política</a>', { muted: true }),
    htmlParagraph('¡Nos pillamos! 😄', { strong: true }),
  ].join('');
  const ctaUrl = event.is_location_revealed ? event.maps_link : undefined;
  const html = wrapBrandedHtml(bodyHtml, ctaUrl, ctaUrl ? 'Como llegar' : undefined);

  return { subject, text, html };
}


// Correo corto y exclusivo para avisar la mesa asignada. Se usa cuando un
// evento se divide en mesas y alguien no tiene WhatsApp: el recordatorio del
// mismo dia ya salio, y reenviarlo entero solo por el numero de mesa es ruido.
function buildMesaNoticeText(firstName: string, event: any): { subject: string; text: string; html: string } {
  const mesa = numeroDeMesa(event.name);
  const marca = marcaDeLlegada(event.name);
  const locationFull = buildLocationFull(event.location_name, event.location_address);
  const subject = mesa ? `Hoy vas en la Mesa ${mesa}` : 'Tu mesa de hoy';

  const text = [
    `Hola ${firstName},`, '',
    mesa ? `Para hoy quedaste en la *Mesa ${mesa}*.` : 'Ya tienes mesa asignada para hoy.',
    event.time ? `\u{1F556} ${formatTimeAmPm(event.time)}` : null,
    locationFull ? `\u{1F4CD} ${locationFull}` : null,
    event.maps_link ? `\u{1F5FA}\u{FE0F} ${event.maps_link}` : null, '',
    `Al llegar di que vienes de ${marca} y te indican donde sentarte.`, '',
    'Ya en la mesa abres la Dinamica en la app y confirmas tu llegada.', '',
    '\u{00A1}Nos pillamos! \u{1F604}', 'Equipo Nospi',
  ].filter((l) => l !== null).join('\n');

  const bodyHtml = [
    htmlParagraph(`Hola ${firstName},`),
    htmlParagraph(mesa ? `Para hoy quedaste en la <strong>Mesa ${mesa}</strong>.` : 'Ya tienes mesa asignada para hoy.'),
    htmlParagraph(`${event.time ? `\u{1F556} <strong>${formatTimeAmPm(event.time)}</strong>` : ''}${locationFull ? `<br />\u{1F4CD} <strong>${locationFull}</strong>` : ''}`),
    htmlParagraph(`Al llegar di que vienes de <strong>${marca}</strong> y te indican d\u00F3nde sentarte.`),
    htmlParagraph('Ya en la mesa abres la <strong>Din\u00E1mica</strong> en la app y confirmas tu llegada.', { muted: true }),
    htmlParagraph('\u{00A1}Nos pillamos! \u{1F604}', { strong: true }),
  ].join('');

  return { subject, text, html: wrapBrandedHtml(bodyHtml, event.maps_link || URL_DINAMICA, event.maps_link ? 'Como llegar' : 'Abrir la Din\u00E1mica') };
}

function buildCorrectionText(firstName: string, event: any): { subject: string; text: string; html: string } {
  const correctDate = formatEventDateBogota(event.date);
  const wrongDate = formatEventDateBuggyUTC(event.date);
  const locationFull = buildLocationFull(event.location_name, event.location_address);
  const subject = `Correccion: la fecha de "${event.name || 'tu evento'}" en el correo anterior estaba mal`;
  const text = [
    `Hola ${firstName},`, '',
    `Te escribimos porque el correo que te enviamos antes tenia un error: decia que "${event.name || 'tu evento'}" era el ${wrongDate}, pero en realidad es el ${correctDate}. Disculpa la confusion.`, '',
    `Fecha: ${correctDate}`,
    event.time ? `Hora: ${formatTimeAmPm(event.time)}` : null,
    locationFull ? `Lugar: ${locationFull}` : null,
    event.maps_link ? `Como llegar: ${event.maps_link}` : null, '',
    '¡Nos pillamos! 😄', 'Equipo Nospi',
  ].filter((l) => l !== null).join('\n');

  const bodyHtml = [
    htmlParagraph(`Hola ${firstName},`),
    htmlParagraph(`Te escribimos porque el correo que te enviamos antes tenía un error: decía que <strong>"${event.name || 'tu evento'}"</strong> era el ${wrongDate}, pero en realidad es el <strong>${correctDate}</strong>. Disculpa la confusión.`),
    htmlParagraph(`Fecha correcta: <strong>${correctDate}</strong>`),
    event.time ? htmlParagraph(`Hora: <strong>${formatTimeAmPm(event.time)}</strong>`) : '',
    locationFull ? htmlParagraph(`Lugar: <strong>${locationFull}</strong>`) : '',
    htmlParagraph('¡Nos pillamos! 😄', { strong: true }),
  ].join('');
  const html = wrapBrandedHtml(bodyHtml, event.maps_link, event.maps_link ? 'Como llegar' : undefined);

  return { subject, text, html };
}

serve(async (req) => {
  try {
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ skipped: true, reason: 'RESEND_API_KEY no configurada' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const results: any[] = [];

    // Textos de los mensajes de videollamada: se leen una sola vez por
    // invocacion, no una por destinatario.
    const plantillas = await cargarPlantillas(supabase);

    let targetEventId: string | null = null;
    let previewEmail: string | null = null;
    let previewType: string = 'sameday';
    let previewTag: string = '';
    let sendCorrection = false;
    let sendMesaNotice = false;
    let onlyEmails: string[] | null = null;
    try {
      const body = await req.json();
      if (body && typeof body.event_id === 'string' && body.event_id.length > 0) targetEventId = body.event_id;
      if (body && typeof body.preview_email === 'string' && body.preview_email.length > 0) previewEmail = body.preview_email;
      if (body && typeof body.preview_type === 'string' && ['48h', 'sameday', '3d', 'event_start'].includes(body.preview_type)) previewType = body.preview_type;
      if (body && typeof body.preview_tag === 'string') previewTag = body.preview_tag;
      if (body && body.send_correction === true) sendCorrection = true;
      if (body && body.mesa_notice === true) sendMesaNotice = true;
      if (body && Array.isArray(body.only_emails) && body.only_emails.length > 0) {
        onlyEmails = body.only_emails.map((e: string) => e.toLowerCase());
      }
    } catch (_e) { /* invocacion normal del cron, seguir */ }

    const now = new Date();

    if (targetEventId && sendMesaNotice) {
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('name, date, time, location_name, location_address, maps_link, type')
        .eq('id', targetEventId)
        .single();

      if (eventError || !eventData) {
        results.push({ block: 'mesa_notice', error: eventError?.message || 'evento no encontrado' });
      } else {
        const { data: appts, error: apptsError } = await supabase
          .from('appointments')
          .select('id, users!inner ( name, email )')
          .eq('event_id', targetEventId)
          .eq('status', 'confirmada');

        if (apptsError) {
          results.push({ block: 'mesa_notice', error: apptsError.message });
        } else {
          for (const apt of appts || []) {
            const user = (apt as any).users;
            if (!user?.email) continue;
            if (onlyEmails && !onlyEmails.includes(user.email.toLowerCase())) continue;
            const firstName = (user.name || '').trim().split(' ')[0] || 'ahi';
            const built = buildMesaNoticeText(firstName, eventData);
            const { ok, errorText } = await sendEmail(user.email, built.subject, built.text, built.html);
            results.push({ block: 'mesa_notice', appointmentId: apt.id, to: user.email, ok, errorText });
          }
        }
      }

      return new Response(JSON.stringify({ processed: results.length, results }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (targetEventId && sendCorrection) {
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('name, date, time, location_name, location_address, maps_link, type')
        .eq('id', targetEventId)
        .single();

      if (eventError || !eventData) {
        results.push({ block: 'correction', error: eventError?.message || 'evento no encontrado' });
      } else {
        const { data: appts, error: apptsError } = await supabase
          .from('appointments')
          .select('id, users!inner ( name, email )')
          .eq('event_id', targetEventId)
          .eq('status', 'confirmada');

        if (apptsError) {
          results.push({ block: 'correction', error: apptsError.message });
        } else {
          for (const apt of appts || []) {
            const user = (apt as any).users;
            if (!user?.email) continue;
            if (onlyEmails && !onlyEmails.includes(user.email.toLowerCase())) continue;
            const firstName = (user.name || '').trim().split(' ')[0] || 'ahi';
            const built = buildCorrectionText(firstName, eventData);
            const { ok, errorText } = await sendEmail(user.email, built.subject, built.text, built.html);
            results.push({ block: 'correction', appointmentId: apt.id, to: user.email, ok, errorText });
          }
        }
      }

      return new Response(JSON.stringify({ processed: results.length, results }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (targetEventId && previewEmail) {
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('name, date, time, location_name, location_address, maps_link, is_location_revealed, type')
        .eq('id', targetEventId)
        .single();

      if (eventError || !eventData) {
        results.push({ block: 'preview', error: eventError?.message || 'evento no encontrado' });
      } else {
        let built: { subject: string; text: string; html?: string };
        if (previewType === '48h') built = build48hText('Johnatan', eventData, now, plantillas);
        else if (previewType === '3d') built = build3dText('Johnatan', eventData);
        else if (previewType === 'event_start') built = buildEventStartText('Johnatan', eventData);
        else built = buildSameDayText('Johnatan', eventData, plantillas);
        const tagSuffix = previewTag ? ` [${previewTag}]` : '';
        const { ok } = await sendEmail(previewEmail, `[PREVIEW]${tagSuffix} ${built.subject}`, built.text, built.html);
        results.push({ block: 'preview', type: previewType, to: previewEmail, ok });
      }

      return new Response(JSON.stringify({ processed: results.length, results }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (targetEventId) {
      const { data: appointments48h, error: error48h } = await supabase
        .from('appointments')
        .select(`id, user_id, event_id, users!inner ( name, email ), events!inner ( name, date, time, location_name, location_address, maps_link, is_location_revealed, type )`)
        .eq('status', 'confirmada')
        .is('reminder_48h_email_sent_at', null)
        .eq('event_id', targetEventId);

      if (error48h) {
        results.push({ block: '48h', error: error48h.message });
      } else {
        for (const apt of appointments48h || []) {
          const user = (apt as any).users;
          const event = (apt as any).events;
          if (!user?.email) continue;
          if (!event.is_location_revealed) {
            results.push({ block: '48h', appointmentId: apt.id, skipped: true, reason: 'ubicacion no revelada' });
            continue;
          }
          // Videollamada: el acceso se activa solo al guardar el link (puede ser
          // dias antes). Este correo no sale aqui sino en el cron, a las 9 a.m.
          // del dia anterior (bloque 'vispera_virtual'), como en presencial
          // cuando se revela la ubicacion el dia antes.
          if (esVirtual(event)) {
            results.push({ block: '48h', appointmentId: apt.id, skipped: true, reason: 'virtual: sale el dia anterior a las 9 a.m.' });
            continue;
          }
          const firstName = (user.name || '').trim().split(' ')[0] || 'ahi';
          const { subject, text, html } = build48hText(firstName, event, now, plantillas);
          const { ok } = await sendEmail(user.email, subject, text, html);
          if (ok) await supabase.from('appointments').update({ reminder_48h_email_sent_at: new Date().toISOString() }).eq('id', apt.id);
          results.push({ block: '48h', appointmentId: apt.id, ok });
        }
      }
    }

    if (!targetEventId) {
      const nowBogota = new Date(now.getTime() - BOGOTA_OFFSET_MS);
      const year = nowBogota.getUTCFullYear();
      const month = nowBogota.getUTCMonth();
      const day = nowBogota.getUTCDate();

      const startOfDayPlus3 = new Date(Date.UTC(year, month, day, 0, 0, 0) + BOGOTA_OFFSET_MS + 3 * 24 * 60 * 60 * 1000);
      const startOfDayPlus4 = new Date(startOfDayPlus3.getTime() + 24 * 60 * 60 * 1000);

      const { data: appointments3d, error: error3d } = await supabase
        .from('appointments')
        .select(`id, user_id, event_id, users!inner ( name, email ), events!inner ( name, date, time, location_name, location_address, maps_link, is_location_revealed, type )`)
        .eq('status', 'confirmada')
        .is('reminder_3d_email_sent_at', null)
        .gte('events.date', startOfDayPlus3.toISOString())
        .lt('events.date', startOfDayPlus4.toISOString());

      if (error3d) {
        results.push({ block: '3d', error: error3d.message });
      } else {
        for (const apt of appointments3d || []) {
          const user = (apt as any).users;
          const event = (apt as any).events;
          if (!user?.email) continue;
          const firstName = (user.name || '').trim().split(' ')[0] || 'ahi';
          const { subject, text, html } = build3dText(firstName, event);
          const { ok } = await sendEmail(user.email, subject, text, html);
          if (ok) await supabase.from('appointments').update({ reminder_3d_email_sent_at: new Date().toISOString() }).eq('id', apt.id);
          results.push({ block: '3d', appointmentId: apt.id, ok });
        }
      }

      // Videollamada, dia anterior a las 9 a.m. (hora Bogota): el correo de
      // "manana es tu videollamada". Usa la misma marca que el correo al revelar
      // (reminder_48h_email_sent_at), asi nunca sale dos veces. Si el link se
      // pone despues de las 9, sale en la siguiente corrida de ese mismo dia.
      {
        const minutosAhora = nowBogota.getUTCHours() * 60 + nowBogota.getUTCMinutes();
        const startOfTomorrow = new Date(Date.UTC(year, month, day, 0, 0, 0) + BOGOTA_OFFSET_MS + 24 * 60 * 60 * 1000);
        const startOfDayAfter = new Date(startOfTomorrow.getTime() + 24 * 60 * 60 * 1000);
        if (minutosAhora >= SAMEDAY_SEND_HOUR * 60) {
          const { data: aptsVispera, error: errVispera } = await supabase
            .from('appointments')
            .select(`id, user_id, event_id, users!inner ( name, email ), events!inner ( name, date, time, location_name, location_address, maps_link, is_location_revealed, type )`)
            .eq('status', 'confirmada')
            .is('reminder_48h_email_sent_at', null)
            .eq('events.type', 'virtual')
            .gte('events.date', startOfTomorrow.toISOString())
            .lt('events.date', startOfDayAfter.toISOString());
          if (errVispera) {
            results.push({ block: 'vispera_virtual', error: errVispera.message });
          } else {
            for (const apt of aptsVispera || []) {
              const user = (apt as any).users;
              const event = (apt as any).events;
              if (!user?.email) continue;
              if (!event.is_location_revealed) {
                results.push({ block: 'vispera_virtual', appointmentId: apt.id, skipped: true, reason: 'sin link de Meet todavia' });
                continue;
              }
              const firstName = (user.name || '').trim().split(' ')[0] || 'ahi';
              const { subject, text, html } = build48hText(firstName, event, now, plantillas);
              const { ok } = await sendEmail(user.email, subject, text, html);
              if (ok) await supabase.from('appointments').update({ reminder_48h_email_sent_at: new Date().toISOString() }).eq('id', apt.id);
              results.push({ block: 'vispera_virtual', appointmentId: apt.id, ok });
            }
          }
        }
      }

      const nowBogotaMinutes = nowBogota.getUTCHours() * 60 + nowBogota.getUTCMinutes();
      const startOfTodayBogotaUTC = new Date(Date.UTC(year, month, day, 0, 0, 0) + BOGOTA_OFFSET_MS);
      const endOfTodayBogotaUTC = new Date(startOfTodayBogotaUTC.getTime() + 24 * 60 * 60 * 1000);

      const { data: appointmentsSameDay, error: errorSameDay } = await supabase
        .from('appointments')
        .select(`id, user_id, event_id, users!inner ( name, email ), events!inner ( name, date, time, location_name, location_address, maps_link, is_location_revealed, type )`)
        .eq('status', 'confirmada')
        .is('sameday_reminder_email_sent_at', null)
        .gte('events.date', startOfTodayBogotaUTC.toISOString())
        .lt('events.date', endOfTodayBogotaUTC.toISOString());

      if (errorSameDay) {
        results.push({ block: 'sameday', error: errorSameDay.message });
      } else {
        for (const apt of appointmentsSameDay || []) {
          const user = (apt as any).users;
          const event = (apt as any).events;
          if (!user?.email) continue;
          const targetMinutes = sameDaySendMinutesBogota(event.date);
          if (nowBogotaMinutes < targetMinutes) {
            results.push({ block: 'sameday', appointmentId: apt.id, skipped: true, reason: `aun no es hora (objetivo ${String(Math.floor(targetMinutes / 60)).padStart(2, '0')}:${String(targetMinutes % 60).padStart(2, '0')} Bogota)` });
            continue;
          }
          if (!event.is_location_revealed) {
            results.push({ block: 'sameday', appointmentId: apt.id, skipped: true, reason: 'ubicacion no revelada' });
            continue;
          }
          const firstName = (user.name || '').trim().split(' ')[0] || 'ahi';
          const { subject, text, html } = buildSameDayText(firstName, event, plantillas);
          const { ok } = await sendEmail(user.email, subject, text, html);
          if (ok) await supabase.from('appointments').update({ sameday_reminder_email_sent_at: new Date().toISOString() }).eq('id', apt.id);
          results.push({ block: 'sameday', appointmentId: apt.id, ok });
        }
      }

      // Inicio del evento + 5 min: dispara cuando events.date <= now -
      // EVENT_START_DELAY_MS, o sea justo cuando la app libera "Continuar".
      const startTarget = new Date(now.getTime() - EVENT_START_DELAY_MS);
      const startGraceStart = new Date(startTarget.getTime() - PRECISION_GRACE_MS);

      const { data: appointmentsStart, error: errorStart } = await supabase
        .from('appointments')
        .select(`id, user_id, event_id, users!inner ( name, email ), events!inner ( name, date, type )`)
        .eq('status', 'confirmada')
        .is('event_start_email_sent_at', null)
        .lte('events.date', startTarget.toISOString())
        .gt('events.date', startGraceStart.toISOString());

      if (errorStart) {
        results.push({ block: 'event_start', error: errorStart.message });
      } else {
        for (const apt of appointmentsStart || []) {
          const user = (apt as any).users;
          const event = (apt as any).events;
          if (!user?.email) continue;
          const firstName = (user.name || '').trim().split(' ')[0] || 'ahi';
          const { subject, text, html } = buildEventStartText(firstName, event);
          const { ok } = await sendEmail(user.email, subject, text, html);
          if (ok) await supabase.from('appointments').update({ event_start_email_sent_at: new Date().toISOString() }).eq('id', apt.id);
          results.push({ block: 'event_start', appointmentId: apt.id, ok });
        }
      }
    }

    return new Response(JSON.stringify({ processed: results.length, results }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
