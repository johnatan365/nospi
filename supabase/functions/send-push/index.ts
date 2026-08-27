import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { sendWebPush, type WebPushSubscription } from "./webpush.ts";

// Envia push a uno o varios usuarios de Nospi.
// Reutilizada por: recordatorios de eventos, promos/broadcast del admin, y notificaciones de chat.
// Solo puede ser invocada con la service role key (cron jobs / backend / admin), nunca directamente por el cliente.
//
// Dos caminos segun el dispositivo:
//   - App (iOS/Android): token de Expo -> se manda a Expo, que lo entrega.
//   - Navegador: suscripcion guardada en web_push_subscriptions -> se cifra y
//     se manda directo al servicio del navegador (Chrome, Firefox, Safari...).
// Ambos salen del mismo lugar para que quien llama no tenga que preocuparse.

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// Postgrest arma un query string con un id por parametro cuando se usa
// .in(), asi que con cientos de ids (broadcast a 'todos los usuarios') la URL
// puede pasarse del limite del gateway. Partimos en lotes chicos para evitar eso.
const QUERY_CHUNK_SIZE = 50;

// Cuantos navegadores se atienden a la vez. Cada uno es un POST aparte (no hay
// envio por lotes en Web Push), asi que se limita para no abrir 1.800 a la vez.
const WEB_PUSH_CONCURRENCY = 25;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const anyErr = err as any;
    return anyErr.message || anyErr.error_description || anyErr.details || JSON.stringify(err);
  }
  return String(err);
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "").trim();

    if (!serviceRoleKey || jwt !== serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Unauthorized: this function only accepts service-role calls" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const userIds: string[] = Array.isArray(body?.user_ids) ? body.user_ids : [];
    const title: string = body?.title;
    const message: string = body?.body;
    const data = body?.data ?? {};

    if (userIds.length === 0 || !title || !message) {
      return new Response(
        JSON.stringify({ error: "user_ids (array no vacio), title y body son requeridos" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Solo notificar a usuarios que tienen push activado en sus preferencias.
    // Se consulta en lotes chicos para no pasarnos del limite de largo de URL
    // de PostgREST cuando la lista de user_ids es grande (broadcast a todos).
    const allowedUserIds: string[] = [];
    for (const idsChunk of chunk(userIds, QUERY_CHUNK_SIZE)) {
      const { data: users, error: usersError } = await supabase
        .from("users")
        .select("id, notification_preferences")
        .in("id", idsChunk);

      if (usersError) {
        return new Response(JSON.stringify({ error: errorMessage(usersError), stage: "users" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      for (const u of users ?? []) {
        if ((u as any).notification_preferences?.push !== false) allowedUserIds.push((u as any).id);
      }
    }

    if (allowedUserIds.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, skipped: userIds.length, reason: "ningun usuario tiene push activado" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const tokenSet = new Set<string>();
    for (const idsChunk of chunk(allowedUserIds, QUERY_CHUNK_SIZE)) {
      const { data: tokenRows, error: tokensError } = await supabase
        .from("push_tokens")
        .select("token")
        .in("user_id", idsChunk);

      if (tokensError) {
        return new Response(JSON.stringify({ error: errorMessage(tokensError), stage: "push_tokens" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      for (const t of tokenRows ?? []) tokenSet.add((t as any).token);
    }

    const uniqueTokens = Array.from(tokenSet);

    const expoTokens = uniqueTokens;

    // Los navegadores viven en su propia tabla, aparte de los tokens de Expo.
    const webSubs: { id: string; sub: WebPushSubscription }[] = [];
    for (const idsChunk of chunk(allowedUserIds, QUERY_CHUNK_SIZE)) {
      const { data: subs, error: subsError } = await supabase
        .from("web_push_subscriptions")
        .select("id, endpoint, p256dh, auth")
        .in("user_id", idsChunk);

      if (subsError) {
        // Que falle el navegador no debe dejar sin aviso a los del telefono.
        console.error("web_push_subscriptions:", errorMessage(subsError));
        break;
      }
      for (const r of subs ?? []) {
        webSubs.push({
          id: (r as any).id,
          sub: {
            endpoint: (r as any).endpoint,
            keys: { p256dh: (r as any).p256dh, auth: (r as any).auth },
          },
        });
      }
    }

    // ── App: Expo, en lotes de hasta 100 ──────────────────────────────────
    const expoResults: any[] = [];
    if (expoTokens.length > 0) {
      const messages = expoTokens.map((token) => ({
        to: token,
        title,
        body: message,
        data,
        sound: "default",
      }));

      for (const batch of chunk(messages, 100)) {
        try {
          const res = await fetch(EXPO_PUSH_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              "Accept-Encoding": "gzip, deflate",
            },
            body: JSON.stringify(batch),
          });
          expoResults.push(await res.json());
        } catch (e) {
          expoResults.push({ error: errorMessage(e) });
        }
      }
    }

    // ── Navegador: Web Push, un POST por suscripcion ──────────────────────
    let webOk = 0;
    let webFailed = 0;
    const expiredIds: string[] = [];

    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:nospisocial@gmail.com";
    const vapidReady = !!vapidPublic && !!vapidPrivate;

    if (webSubs.length > 0 && vapidReady) {
      for (const group of chunk(webSubs, WEB_PUSH_CONCURRENCY)) {
        const results = await Promise.all(
          group.map(({ sub }) =>
            sendWebPush(sub, { title, body: message, data }, {
              publicKey: vapidPublic,
              privateKey: vapidPrivate,
              subject: vapidSubject,
            })
          )
        );
        results.forEach((r, i) => {
          if (r.status >= 200 && r.status < 300) webOk++;
          else {
            webFailed++;
            // El navegador ya no existe: se limpia para no reintentar siempre.
            if (r.gone) expiredIds.push(group[i].id);
          }
        });
      }

      if (expiredIds.length > 0) {
        for (const group of chunk(expiredIds, QUERY_CHUNK_SIZE)) {
          await supabase.from("web_push_subscriptions").delete().in("id", group);
        }
      }
    }

    return new Response(
      JSON.stringify({
        sent: expoTokens.length + webOk,
        expo: { devices: expoTokens.length, results: expoResults },
        web: {
          devices: webSubs.length,
          ok: webOk,
          failed: webFailed,
          expiredRemoved: expiredIds.length,
          ...(webSubs.length > 0 && !vapidReady
            ? { skipped: "faltan las variables VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY" }
            : {}),
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: errorMessage(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
