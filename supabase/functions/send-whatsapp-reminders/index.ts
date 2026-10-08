import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://wjdiraurfbawotlcndmk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Estas 2 variables se configuran en Supabase -> Edge Functions -> Secrets
// una vez Meta apruebe el numero de WhatsApp Business y se agregue metodo de pago.
const META_WHATSAPP_TOKEN = Deno.env.get('META_WHATSAPP_TOKEN') || '';
const META_PHONE_NUMBER_ID = Deno.env.get('META_PHONE_NUMBER_ID') || '';

// Nombres exactos de las plantillas aprobadas por Meta.
const TEMPLATE_48H = 'recordatorio_48h';
const TEMPLATE_SAMEDAY = 'recordatorio_mismo_dia';
const TEMPLATE_LANG = 'es_CO';

const BOGOTA_TZ = 'America/Bogota';
// Bogota es UTC-5 todo el ano (sin horario de verano).
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;
// Hora local (Bogota) en la que se envia el recordatorio del mismo dia.
const SAMEDAY_SEND_HOUR = 9;
// Si el evento empieza antes de SAMEDAY_SEND_HOUR (9am), el recordatorio del
// mismo dia sale este numero de minutos antes del evento en vez de a las
// 9am fijas, para que no llegue despues de que ya arranco (ej. una caminata
// a las 8am). Si el evento es a las 9am o mas tarde, se sigue enviando a las
// 9am fijas, igual que antes.
const EARLY_EVENT_BUFFER_MINUTES = 120;

// event.date es el instante UTC exacto del evento (ej. viernes 7pm Bogota =
// sabado 00:00 UTC). Hay que pasar timeZone: 'America/Bogota' explicitamente
// al formatear, si no el dia de la semana sale mal (un dia adelantado).
function formatEventDateBogota(eventDateISO: string): string {
  return new Date(eventDateISO).toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: BOGOTA_TZ,
  });
}

// Convierte "19:00" (24h) a "7:00 p.m." para que se lea natural en la plantilla.
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

// Calcula, en minutos desde medianoche hora Bogota, a que hora debe salir
// el recordatorio del mismo dia para este evento en concreto.
function sameDaySendMinutesBogota(eventDateISO: string): number {
  const eventBogota = new Date(new Date(eventDateISO).getTime() - BOGOTA_OFFSET_MS);
  const eventMinutes = eventBogota.getUTCHours() * 60 + eventBogota.getUTCMinutes();
  const defaultSendMinutes = SAMEDAY_SEND_HOUR * 60;
  if (eventMinutes < defaultSendMinutes) {
    return Math.max(0, eventMinutes - EARLY_EVENT_BUFFER_MINUTES);
  }
  return defaultSendMinutes;
}

async function sendTemplate(to: string, templateName: string, params: string[]) {
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: TEMPLATE_LANG },
      components: [
        {
          type: 'body',
          parameters: params.map((text) => ({ type: 'text', text })),
        },
      ],
    },
  };

  const res = await fetch(`https://graph.facebook.com/v20.0/${META_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${META_WHATSAPP_TOKEN}` },
    body: JSON.stringify(payload),
  });
  const resData = await res.json();
  return { ok: res.ok, response: resData };
}

serve(async (req) => {
  try {
    if (!META_WHATSAPP_TOKEN || !META_PHONE_NUMBER_ID) {
      return new Response(JSON.stringify({ skipped: true, reason: 'META_WHATSAPP_TOKEN o META_PHONE_NUMBER_ID no configurados aun' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const results: any[] = [];

    // ---------------------------------------------------------------
    // 1) Recordatorio de un dia antes (antes: 48 horas antes).
    //    Solo se envia automaticamente si la ubicacion del evento ya
    //    fue revelada. Si no, se deja para el boton manual del admin.
    // ---------------------------------------------------------------
    const now = new Date();
    const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    const { data: appointments48h, error: error48h } = await supabase
      .from('appointments')
      .select(`
        id, user_id, event_id,
        users!inner ( name, phone ),
        events!inner ( name, date, time, location_name, is_location_revealed )
      `)
      .eq('status', 'confirmada')
      .is('reminder_48h_sent_at', null)
      .gte('events.date', windowStart.toISOString())
      .lte('events.date', windowEnd.toISOString());

    if (error48h) {
      results.push({ block: '48h', error: error48h.message });
    } else {
      for (const apt of appointments48h || []) {
        const user = (apt as any).users;
        const event = (apt as any).events;
        if (!user?.phone) continue;

        // Si la ubicacion todavia no se ha revelado, no se envia automatico.
        // Queda pendiente para el boton manual de confirmacion en el admin.
        if (!event.is_location_revealed) {
          results.push({ block: '48h', appointmentId: apt.id, skipped: true, reason: 'ubicacion no revelada, requiere envio manual' });
          continue;
        }

        const digits = user.phone.replace(/\D/g, '');
        const firstName = (user.name || '').trim().split(' ')[0] || 'ahi';
        const formattedDate = formatEventDateBogota(event.date);
        const location = event.location_name || '';

        const { ok, response } = await sendTemplate(digits, TEMPLATE_48H, [
          firstName,
          event.name || 'tu evento',
          formattedDate,
          formatTimeAmPm(event.time || ''),
          location,
        ]);

        if (ok) {
          await supabase.from('appointments').update({ reminder_48h_sent_at: new Date().toISOString() }).eq('id', apt.id);
        }

        results.push({ block: '48h', appointmentId: apt.id, ok, response });
      }
    }

    // ---------------------------------------------------------------
    // 2) Recordatorio del mismo dia. Se evalua en CADA corrida horaria del
    //    cron (no solo cerca de las 9am): cada evento tiene su propia hora
    //    objetivo de envio (sameDaySendMinutesBogota), que es 9am fija salvo
    //    que el evento empiece antes de las 9am, en cuyo caso el objetivo es
    //    2 horas antes del evento. El flag sameday_reminder_sent_at evita
    //    reenvios.
    // ---------------------------------------------------------------
    const nowBogota = new Date(now.getTime() - BOGOTA_OFFSET_MS);
    const nowBogotaMinutes = nowBogota.getUTCHours() * 60 + nowBogota.getUTCMinutes();
    {
      const year = nowBogota.getUTCFullYear();
      const month = nowBogota.getUTCMonth();
      const day = nowBogota.getUTCDate();
      const startOfTodayBogotaUTC = new Date(Date.UTC(year, month, day, 0, 0, 0) + BOGOTA_OFFSET_MS);
      const endOfTodayBogotaUTC = new Date(startOfTodayBogotaUTC.getTime() + 24 * 60 * 60 * 1000);

      const { data: appointmentsSameDay, error: errorSameDay } = await supabase
        .from('appointments')
        .select(`
          id, user_id, event_id,
          users!inner ( name, phone ),
          events!inner ( name, date, time, location_name, location_address, maps_link, is_location_revealed )
        `)
        .eq('status', 'confirmada')
        .is('sameday_reminder_sent_at', null)
        .gte('events.date', startOfTodayBogotaUTC.toISOString())
        .lt('events.date', endOfTodayBogotaUTC.toISOString());

      if (errorSameDay) {
        results.push({ block: 'sameday', error: errorSameDay.message });
      } else {
        for (const apt of appointmentsSameDay || []) {
          const user = (apt as any).users;
          const event = (apt as any).events;
          if (!user?.phone) continue;

          const targetMinutes = sameDaySendMinutesBogota(event.date);
          if (nowBogotaMinutes < targetMinutes) {
            results.push({ block: 'sameday', appointmentId: apt.id, skipped: true, reason: `aun no es hora (objetivo ${String(Math.floor(targetMinutes / 60)).padStart(2, '0')}:${String(targetMinutes % 60).padStart(2, '0')} Bogota)` });
            continue;
          }

          // Igual que el recordatorio de un dia antes: si por algun motivo la
          // ubicacion no esta revelada el mismo dia, se deja manual.
          if (!event.is_location_revealed) {
            results.push({ block: 'sameday', appointmentId: apt.id, skipped: true, reason: 'ubicacion no revelada, requiere envio manual' });
            continue;
          }

          const digits = user.phone.replace(/\D/g, '');
          const firstName = (user.name || '').trim().split(' ')[0] || 'ahi';
          const locationFull = event.location_address ? `${event.location_name} (${event.location_address})` : (event.location_name || '');

          const { ok, response } = await sendTemplate(digits, TEMPLATE_SAMEDAY, [
            firstName,
            event.name || 'tu evento',
            formatTimeAmPm(event.time || ''),
            locationFull,
            event.maps_link || '',
          ]);

          if (ok) {
            await supabase.from('appointments').update({ sameday_reminder_sent_at: new Date().toISOString() }).eq('id', apt.id);
          }

          results.push({ block: 'sameday', appointmentId: apt.id, ok, response });
        }
      }
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
