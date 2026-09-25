// Supabase Edge Function: send-push-reminders
//
// Version push de send-email-reminders, reusando la misma logica de horarios
// (zona Bogota) pero enviando notificaciones push via la funcion send-push
// en vez de correo. Usa columnas de tracking propias (reminder_48h_push_sent_at,
// reminder_3d_push_sent_at, sameday_reminder_push_sent_at, reminder_2h_push_sent_at,
// chat_open_push_sent_at, event_start_push_sent_at) para no interferir con el
// tracking de email/whatsapp que ya existe.
//
// v4: el aviso de inicio (bloque e) ya no dispara a la hora exacta sino a la
// hora del evento + EVENT_START_DELAY_MS (5 min), el mismo instante en que la
// app libera el boton "Continuar" (START_WINDOW_MINUTES en dinamica.tsx).
// Asi el push llega cuando la mesa YA puede arrancar, no antes.
//
// v5 (sep 2026): version videollamada (events.type = 'virtual') del push del
// mismo dia (no hay "como llegar") y del de inicio (que hacer al entrar: camara,
// saludo y quien toca "Quiero ser el moderador"). Antes esta funcion solo vivia
// desplegada en Supabase; desde esta version tambien queda en el repo.
//
// Modos:
// 1) { event_id } en el body: push de 'ubicacion revelada' a los confirmados
//    de ESE evento que aun no lo hayan recibido (boton admin / trigger DB).
// 2) Sin body (cron cada 5 min): recordatorio de 'faltan 3 dias', recordatorio
//    del mismo dia, recordatorio de '2 horas antes', aviso de 'ya pueden
//    chatear' (30 min antes) y aviso de 'el evento esta empezando, abre
//    Dinamica' (a la hora de inicio + 5 min).
//
// IMPORTANTE: 'events.date' ya es el instante UTC exacto del evento (ej.
// viernes 7pm Bogota = sabado 00:00 UTC), no hace falta combinarlo con
// 'events.time' (ese campo es solo para mostrarlo formateado al usuario).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://wjdiraurfbawotlcndmk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;
const SAMEDAY_SEND_HOUR = 9;
const EARLY_EVENT_BUFFER_MINUTES = 120;

// Cuanto DESPUES de la hora del evento sale el aviso de inicio. Debe coincidir
// con START_WINDOW_MINUTES de la app (app/(tabs)/dinamica.tsx): es el momento
// en que se libera "Continuar" para elegir moderador.
const EVENT_START_DELAY_MS = 5 * 60 * 1000;

// Ventanas de gracia para los recordatorios de precision (2h / 30min / inicio):
// si el cron se atrasa, igual dispara mientras no se haya pasado de esta
// ventana desde el momento objetivo. No deberian usarse en la practica ya
// que el cron corre cada 5 min, pero evitan un recordatorio "fantasma" muy
// tarde si el cron estuvo caido un rato.
const PRECISION_GRACE_MS = 45 * 60 * 1000;

async function sendPush(userId: string, title: string, body: string, data: Record<string, unknown>): Promise<{ ok: boolean; info?: any }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ user_ids: [userId], title, body, data }),
    });
    const info = await res.json();
    return { ok: res.ok, info };
  } catch (e) {
    console.error('send-push-reminders: excepcion llamando send-push', e);
    return { ok: false, info: String(e) };
  }
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

serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const results: any[] = [];

    let targetEventId: string | null = null;
    try {
      const body = await req.json();
      if (body && typeof body.event_id === 'string' && body.event_id.length > 0) targetEventId = body.event_id;
    } catch (_e) { /* invocacion normal del cron, sin body */ }

    const now = new Date();

    // -------------------------------------------------------------
    // Modo 1: ubicacion revelada para un evento puntual
    // -------------------------------------------------------------
    if (targetEventId) {
      const { data: appointments48h, error: error48h } = await supabase
        .from('appointments')
        .select(`id, user_id, event_id, events!inner ( name, location_name, location_address, maps_link, is_location_revealed, type )`)
        .eq('status', 'confirmada')
        .is('reminder_48h_push_sent_at', null)
        .eq('event_id', targetEventId);

      if (error48h) {
        results.push({ block: '48h', error: error48h.message });
      } else {
        for (const apt of appointments48h || []) {
          const event = (apt as any).events;
          if (!event.is_location_revealed) {
            results.push({ block: '48h', appointmentId: apt.id, skipped: true, reason: 'ubicacion no revelada' });
            continue;
          }
          // En videollamada no hay lugar: "revelar" es activar el acceso. El
          // push dice cuando aparece el boton de entrar, sin el enlace.
          const virtual = event.type === 'virtual';
          const title = virtual
            ? `🎥 Tu videollamada ya está lista`
            : `📍 Ya revelamos la ubicación de ${event.name || 'tu evento'}`;
          const body = virtual
            ? 'El día del evento, 15 minutos antes, te aparece en la app el botón "Entrar a la videollamada".'
            : (event.location_name ? `Lugar: ${event.location_name}. Abre la app para ver como llegar.` : 'Abre la app para ver como llegar.');
          const { ok } = await sendPush(apt.user_id, title, body, { type: 'event_location_revealed', event_id: apt.event_id });
          if (ok) await supabase.from('appointments').update({ reminder_48h_push_sent_at: new Date().toISOString() }).eq('id', apt.id);
          results.push({ block: '48h', appointmentId: apt.id, ok });
        }
      }

      return new Response(JSON.stringify({ processed: results.length, results }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // -------------------------------------------------------------
    // Modo 2: cron -- faltan 3 dias + recordatorio del mismo dia +
    // recordatorio de 2h + aviso de chat habilitado (30min) + inicio de evento
    // -------------------------------------------------------------
    const nowBogota = new Date(now.getTime() - BOGOTA_OFFSET_MS);
    const year = nowBogota.getUTCFullYear();
    const month = nowBogota.getUTCMonth();
    const day = nowBogota.getUTCDate();

    // a) Faltan 3 dias
    const startOfDayPlus3 = new Date(Date.UTC(year, month, day, 0, 0, 0) + BOGOTA_OFFSET_MS + 3 * 24 * 60 * 60 * 1000);
    const startOfDayPlus4 = new Date(startOfDayPlus3.getTime() + 24 * 60 * 60 * 1000);

    const { data: appointments3d, error: error3d } = await supabase
      .from('appointments')
      .select(`id, user_id, event_id, events!inner ( name, date, time )`)
      .eq('status', 'confirmada')
      .is('reminder_3d_push_sent_at', null)
      .gte('events.date', startOfDayPlus3.toISOString())
      .lt('events.date', startOfDayPlus4.toISOString());

    if (error3d) {
      results.push({ block: '3d', error: error3d.message });
    } else {
      for (const apt of appointments3d || []) {
        const event = (apt as any).events;
        const title = `Faltan 3 días para ${event.name || 'tu evento'}`;
        const body = event.time ? `Tu evento es a las ${formatTimeAmPm(event.time)}. Abre la app para más detalles.` : 'Abre la app para más detalles.';
        const { ok } = await sendPush(apt.user_id, title, body, { type: 'event_reminder_3d', event_id: apt.event_id });
        if (ok) await supabase.from('appointments').update({ reminder_3d_push_sent_at: new Date().toISOString() }).eq('id', apt.id);
        results.push({ block: '3d', appointmentId: apt.id, ok });
      }
    }

    // b) Recordatorio del mismo dia
    const nowBogotaMinutes = nowBogota.getUTCHours() * 60 + nowBogota.getUTCMinutes();
    const startOfTodayBogotaUTC = new Date(Date.UTC(year, month, day, 0, 0, 0) + BOGOTA_OFFSET_MS);
    const endOfTodayBogotaUTC = new Date(startOfTodayBogotaUTC.getTime() + 24 * 60 * 60 * 1000);

    const { data: appointmentsSameDay, error: errorSameDay } = await supabase
      .from('appointments')
      .select(`id, user_id, event_id, events!inner ( name, date, time, location_name, is_location_revealed, type )`)
      .eq('status', 'confirmada')
      .is('sameday_reminder_push_sent_at', null)
      .gte('events.date', startOfTodayBogotaUTC.toISOString())
      .lt('events.date', endOfTodayBogotaUTC.toISOString());

    if (errorSameDay) {
      results.push({ block: 'sameday', error: errorSameDay.message });
    } else {
      for (const apt of appointmentsSameDay || []) {
        const event = (apt as any).events;
        const targetMinutes = sameDaySendMinutesBogota(event.date);
        if (nowBogotaMinutes < targetMinutes) {
          results.push({ block: 'sameday', appointmentId: apt.id, skipped: true, reason: 'aun no es hora' });
          continue;
        }
        if (!event.is_location_revealed) {
          results.push({ block: 'sameday', appointmentId: apt.id, skipped: true, reason: 'ubicacion no revelada' });
          continue;
        }
        const virtual = event.type === 'virtual';
        const title = virtual ? `🎥 ¡Hoy es tu videollamada!` : `¡Hoy es tu evento!`;
        const body = virtual
          ? `${event.name || 'Tu videollamada'} — hoy${event.time ? ` a las ${formatTimeAmPm(event.time)}` : ''}. Entra desde la app con la cámara prendida y ten a mano papel y lápiz.`
          : `${event.name || 'Tu evento'} — hoy${event.time ? ` a las ${formatTimeAmPm(event.time)}` : ''}. Abre la app para ver como llegar.`;
        const { ok } = await sendPush(apt.user_id, title, body, { type: 'event_reminder_sameday', event_id: apt.event_id });
        if (ok) await supabase.from('appointments').update({ sameday_reminder_push_sent_at: new Date().toISOString() }).eq('id', apt.id);
        results.push({ block: 'sameday', appointmentId: apt.id, ok });
      }
    }

    // c) Recordatorio de 2 horas antes (para TODOS los eventos, sin importar
    //    la hora del dia -- distinto del bloque "sameday" que solo dispara
    //    una vez, a las 9am o 2h antes si el evento es muy temprano).
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const twoHoursGraceStart = new Date(now.getTime() - PRECISION_GRACE_MS);

    const { data: appointments2h, error: error2h } = await supabase
      .from('appointments')
      .select(`id, user_id, event_id, events!inner ( name, date, time, type )`)
      .eq('status', 'confirmada')
      .is('reminder_2h_push_sent_at', null)
      .lte('events.date', twoHoursFromNow.toISOString())
      .gt('events.date', twoHoursGraceStart.toISOString());

    if (error2h) {
      results.push({ block: '2h', error: error2h.message });
    } else {
      for (const apt of appointments2h || []) {
        const event = (apt as any).events;
        const title = `⏰ Faltan 2 horas para ${event.name || 'tu evento'}`;
        const cierre = event.type === 'virtual' ? 'Conéctate puntual desde la app.' : 'Prepárate y no llegues tarde.';
        const body = event.time ? `Empieza a las ${formatTimeAmPm(event.time)}. ${cierre}` : cierre;
        const { ok } = await sendPush(apt.user_id, title, body, { type: 'event_reminder_2h', event_id: apt.event_id });
        if (ok) await supabase.from('appointments').update({ reminder_2h_push_sent_at: new Date().toISOString() }).eq('id', apt.id);
        results.push({ block: '2h', appointmentId: apt.id, ok });
      }
    }

    // d) Aviso de "ya pueden chatear" (30 min antes del evento). Incluye el
    //    conversation_id del chat grupal en el payload para poder abrir el
    //    hilo directamente al tocar la notificacion.
    const thirtyMinFromNow = new Date(now.getTime() + 30 * 60 * 1000);
    const thirtyMinGraceStart = new Date(now.getTime() - PRECISION_GRACE_MS);

    const { data: appointmentsChatOpen, error: errorChatOpen } = await supabase
      .from('appointments')
      .select(`id, user_id, event_id, events!inner ( name, date, type )`)
      .eq('status', 'confirmada')
      .is('chat_open_push_sent_at', null)
      .lte('events.date', thirtyMinFromNow.toISOString())
      .gt('events.date', thirtyMinGraceStart.toISOString());

    if (errorChatOpen) {
      results.push({ block: 'chat_open', error: errorChatOpen.message });
    } else if ((appointmentsChatOpen || []).length > 0) {
      const eventIds = Array.from(new Set((appointmentsChatOpen || []).map((a: any) => a.event_id)));
      const { data: groupConvs } = await supabase
        .from('chat_conversations')
        .select('id, event_id')
        .eq('type', 'event_group')
        .in('event_id', eventIds);
      const convByEvent = new Map<string, string>();
      for (const c of groupConvs || []) convByEvent.set((c as any).event_id, (c as any).id);

      for (const apt of appointmentsChatOpen || []) {
        const event = (apt as any).events;
        const conversationId = convByEvent.get(apt.event_id) || null;
        const title = `💬 ¡Ya pueden chatear con tu grupo!`;
        const body = event.type === 'virtual'
          ? `El chat de "${event.name || 'tu videollamada'}" ya está abierto. Salúdense antes de conectarse.`
          : `El chat de "${event.name || 'tu evento'}" ya está abierto. Coordinen la llegada.`;
        const { ok } = await sendPush(apt.user_id, title, body, {
          type: 'event_chat_open',
          event_id: apt.event_id,
          conversation_id: conversationId,
        });
        if (ok) await supabase.from('appointments').update({ chat_open_push_sent_at: new Date().toISOString() }).eq('id', apt.id);
        results.push({ block: 'chat_open', appointmentId: apt.id, ok });
      }
    }

    // e) Inicio del evento + 5 min: recordar abrir Dinamica para romper el
    //    hielo. Dispara cuando events.date <= now - EVENT_START_DELAY_MS, o sea
    //    justo cuando la app libera "Continuar" (fin de la tarjeta de espera).
    const startTarget = new Date(now.getTime() - EVENT_START_DELAY_MS);
    const startGraceStart = new Date(startTarget.getTime() - PRECISION_GRACE_MS);

    const { data: appointmentsStart, error: errorStart } = await supabase
      .from('appointments')
      .select(`id, user_id, event_id, events!inner ( name, date, type )`)
      .eq('status', 'confirmada')
      .is('event_start_push_sent_at', null)
      .lte('events.date', startTarget.toISOString())
      .gt('events.date', startGraceStart.toISOString());

    if (errorStart) {
      results.push({ block: 'event_start', error: errorStart.message });
    } else {
      for (const apt of appointmentsStart || []) {
        const event = (apt as any).events;
        const virtual = event.type === 'virtual';
        const title = virtual ? `🎥 ¡Tu videollamada está empezando!` : `🎉 ¡${event.name || 'Tu evento'} está empezando!`;
        const body = virtual
          ? 'Prende la cámara y saluda 👋 Abran la Dinámica: el primero que toque "Quiero ser el moderador" lleva el juego.'
          : 'Abre la pestaña Dinámica para romper el hielo con tu grupo.';
        const { ok } = await sendPush(apt.user_id, title, body, { type: 'event_start_dinamica', event_id: apt.event_id });
        if (ok) await supabase.from('appointments').update({ event_start_push_sent_at: new Date().toISOString() }).eq('id', apt.id);
        results.push({ block: 'event_start', appointmentId: apt.id, ok });
      }
    }

    return new Response(JSON.stringify({ processed: results.length, results }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
