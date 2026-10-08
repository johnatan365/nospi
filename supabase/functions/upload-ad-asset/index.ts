import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://wjdiraurfbawotlcndmk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Endpoint interno para subir assets de anuncios (miniaturas, etc.) al bucket
// publico 'branding'. Protegido con el mismo patron de secreto compartido que
// notify-purchase-confirmation (verify_jwt:false + header x-webhook-secret).
const WEBHOOK_SECRET = 'nospi_asset_up_4f8c2d1a9b7e3f60';

// Tamano maximo permitido para un asset (imagen o video). ~50 MB.
const MAX_BYTES = 50 * 1024 * 1024;

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req) => {
  try {
    const secret = req.headers.get('x-webhook-secret');
    if (secret !== WEBHOOK_SECRET) {
      return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401 });
    }

    const body = await req.json();
    const destName = typeof body?.dest_name === 'string' && body.dest_name.length > 0 ? body.dest_name : 'asset.png';
    const contentType = typeof body?.content_type === 'string' && body.content_type.length > 0 ? body.content_type : 'image/png';
    const b64 = body?.base64;
    if (typeof b64 !== 'string' || b64.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: 'base64 requerido' }), { status: 400 });
    }

    // Validar tipo de archivo: solo imagenes y videos (los assets legitimos
    // incluyen mp4). Cualquier otro content_type se rechaza.
    if (!/^image\//i.test(contentType) && !/^video\//i.test(contentType)) {
      return new Response(JSON.stringify({ ok: false, error: 'tipo de archivo no permitido' }), { status: 400 });
    }

    // Evitar path traversal / rutas absolutas en el destino dentro del bucket.
    if (destName.includes('..') || destName.startsWith('/')) {
      return new Response(JSON.stringify({ ok: false, error: 'dest_name invalido' }), { status: 400 });
    }

    const bytes = base64ToBytes(b64);

    // Limite de tamano razonable para no permitir cargas arbitrarias enormes.
    if (bytes.length > MAX_BYTES) {
      return new Response(JSON.stringify({ ok: false, error: 'archivo demasiado grande (max 50 MB)' }), { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { error: uploadErr } = await supabase.storage
      .from('branding')
      .upload(destName, bytes, { contentType, upsert: true });

    if (uploadErr) {
      return new Response(JSON.stringify({ ok: false, step: 'upload', error: uploadErr.message }), { status: 500 });
    }

    const { data: publicUrlData } = supabase.storage.from('branding').getPublicUrl(destName);
    return new Response(JSON.stringify({ ok: true, publicUrl: publicUrlData.publicUrl, size: bytes.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500 });
  }
});
