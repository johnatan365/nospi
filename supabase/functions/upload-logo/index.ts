import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Image } from 'https://deno.land/x/imagescript@1.2.15/mod.ts';

const SUPABASE_URL = 'https://wjdiraurfbawotlcndmk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

Deno.serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let sourcePath = 'assets/icon.png';
    let destName = 'icon-small.png';
    let size = 160;
    try {
      const body = await req.json();
      if (body && typeof body.source_path === 'string' && body.source_path.length > 0) sourcePath = body.source_path;
      if (body && typeof body.dest_name === 'string' && body.dest_name.length > 0) destName = body.dest_name;
      if (body && typeof body.size === 'number' && body.size > 0) size = body.size;
    } catch (_e) { /* usa defaults */ }

    const { data: buckets } = await supabase.storage.listBuckets();
    const exists = (buckets || []).some((b) => b.name === 'branding');
    if (!exists) {
      const { error: createErr } = await supabase.storage.createBucket('branding', { public: true });
      if (createErr) {
        return new Response(JSON.stringify({ ok: false, step: 'createBucket', error: createErr.message }), { status: 500 });
      }
    }

    const res = await fetch(`https://raw.githubusercontent.com/johnatan365/nospi/main/${sourcePath}`);
    if (!res.ok) {
      return new Response(JSON.stringify({ ok: false, step: 'fetch', status: res.status, sourcePath }), { status: 500 });
    }
    const sourceBytes = new Uint8Array(await res.arrayBuffer());

    const img = await Image.decode(sourceBytes);
    img.resize(size, size);
    const resizedBytes = await img.encode(1); // PNG, nivel de compresion 1 (rapido, buena compresion)

    const { error: uploadErr } = await supabase.storage
      .from('branding')
      .upload(destName, resizedBytes, { contentType: 'image/png', upsert: true });

    if (uploadErr) {
      return new Response(JSON.stringify({ ok: false, step: 'upload', error: uploadErr.message }), { status: 500 });
    }

    const { data: publicUrlData } = supabase.storage.from('branding').getPublicUrl(destName);

    return new Response(JSON.stringify({
      ok: true,
      publicUrl: publicUrlData.publicUrl,
      originalSize: sourceBytes.length,
      resizedSize: resizedBytes.length,
      dimensions: `${size}x${size}`,
      sourcePath,
      destName,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500 });
  }
});
