// Envio de notificaciones Web Push (navegadores) usando solo Web Crypto.
//
// Es el estandar que usan Chrome, Firefox, Edge y Safari. A diferencia de Expo
// (que recibe el texto en claro), aqui el aviso va CIFRADO de punta a punta
// para ese navegador en concreto, y firmado con nuestra llave VAPID para que
// el servicio de push sepa que viene de Nospi.
//
// Implementa:
//   - VAPID (RFC 8292): un JWT firmado con ES256.
//   - aes128gcm (RFC 8188 + RFC 8291): el cifrado del contenido.
//
// Se hace a mano, sin librerias, para no depender de un paquete externo dentro
// de la Edge Function.

export interface WebPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

// ── utilidades base64url ────────────────────────────────────────────────
function b64uToBytes(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const normalized = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bytesToB64u(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

const utf8 = (s: string) => new TextEncoder().encode(s);

// ── VAPID: JWT firmado con la llave privada (ES256) ─────────────────────
async function importVapidPrivateKey(
  privateKeyB64u: string,
  publicKeyB64u: string,
): Promise<CryptoKey> {
  const pub = b64uToBytes(publicKeyB64u); // punto sin comprimir: 0x04 || X(32) || Y(32)
  if (pub.length !== 65) throw new Error("La llave publica VAPID debe tener 65 bytes");
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    d: privateKeyB64u,
    x: bytesToB64u(pub.slice(1, 33)),
    y: bytesToB64u(pub.slice(33, 65)),
    ext: true,
  };
  return await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

async function buildVapidHeader(
  endpoint: string,
  publicKeyB64u: string,
  privateKeyB64u: string,
  subject: string,
): Promise<string> {
  const audience = new URL(endpoint).origin;
  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud: audience,
    // 12 horas: el maximo que aceptan los servicios de push es 24.
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject,
  };

  const signingInput = `${bytesToB64u(utf8(JSON.stringify(header)))}.${
    bytesToB64u(utf8(JSON.stringify(payload)))
  }`;

  const key = await importVapidPrivateKey(privateKeyB64u, publicKeyB64u);
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      utf8(signingInput),
    ),
  );

  return `vapid t=${signingInput}.${bytesToB64u(sig)}, k=${publicKeyB64u}`;
}

// ── Cifrado del contenido (aes128gcm) ───────────────────────────────────
async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

// HKDF acortado: aqui siempre se pide una sola ronda (length <= 32).
async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const prk = await hmac(salt, ikm);
  const okm = await hmac(prk, concat(info, new Uint8Array([1])));
  return okm.slice(0, length);
}

async function encryptPayload(
  payload: string,
  sub: WebPushSubscription,
): Promise<Uint8Array> {
  const uaPublic = b64uToBytes(sub.keys.p256dh); // 65 bytes
  const authSecret = b64uToBytes(sub.keys.auth); // 16 bytes

  // Par de llaves efimero: uno nuevo por cada envio.
  const asKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  ) as CryptoKeyPair;

  const asPublic = new Uint8Array(
    await crypto.subtle.exportKey("raw", asKeyPair.publicKey),
  );

  const uaPublicKey = await crypto.subtle.importKey(
    "raw",
    uaPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );

  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: uaPublicKey },
      asKeyPair.privateKey,
      256,
    ),
  );

  // RFC 8291: el secreto compartido se mezcla con el "auth" del navegador.
  const keyInfo = concat(utf8("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, sharedSecret, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, utf8("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, utf8("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey(
    "raw",
    cek,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );

  // 0x02 marca el final del contenido (delimitador de relleno).
  const plaintext = concat(utf8(payload), new Uint8Array([2]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      aesKey,
      plaintext,
    ),
  );

  // Cabecera del cuerpo: salt(16) | recordSize(4) | largoLlave(1) | llave(65)
  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096, false);

  return concat(
    salt,
    recordSize,
    new Uint8Array([asPublic.length]),
    asPublic,
    ciphertext,
  );
}

export interface WebPushResult {
  endpoint: string;
  status: number;
  /** true cuando el navegador ya no existe y hay que borrar la suscripcion. */
  gone: boolean;
  error?: string;
}

/**
 * Manda UNA notificacion a UN navegador.
 * Un 404 o 410 significa que esa suscripcion murio (borro los datos del sitio,
 * desinstalo la PWA...) y quien llama deberia eliminarla de la base.
 */
export async function sendWebPush(
  sub: WebPushSubscription,
  payload: { title: string; body: string; data?: unknown },
  vapid: { publicKey: string; privateKey: string; subject: string },
  ttlSeconds = 86400,
): Promise<WebPushResult> {
  try {
    const body = await encryptPayload(JSON.stringify(payload), sub);
    const authorization = await buildVapidHeader(
      sub.endpoint,
      vapid.publicKey,
      vapid.privateKey,
      vapid.subject,
    );

    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(ttlSeconds),
        Urgency: "normal",
      },
      body,
    });

    return {
      endpoint: sub.endpoint,
      status: res.status,
      gone: res.status === 404 || res.status === 410,
      error: res.ok ? undefined : await res.text().catch(() => ""),
    };
  } catch (e) {
    return {
      endpoint: sub.endpoint,
      status: 0,
      gone: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
