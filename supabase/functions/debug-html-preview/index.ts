import { Image } from 'https://deno.land/x/imagescript@1.2.15/mod.ts';

Deno.serve(async () => {
  const urls = [
    'https://wjdiraurfbawotlcndmk.supabase.co/storage/v1/object/public/branding/logo_380.png',
    'https://wjdiraurfbawotlcndmk.supabase.co/storage/v1/object/public/branding/icon.png',
    'https://wjdiraurfbawotlcndmk.supabase.co/storage/v1/object/public/branding/icon-small.png',
  ];
  const results: any[] = [];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      const bytes = new Uint8Array(await res.arrayBuffer());
      let decodeOk = false;
      let decodeErr = '';
      let dims = '';
      try {
        const img = await Image.decode(bytes);
        decodeOk = true;
        dims = `${img.width}x${img.height}`;
      } catch (e) {
        decodeErr = String(e);
      }
      results.push({
        url,
        status: res.status,
        contentType: res.headers.get('content-type'),
        contentLength: res.headers.get('content-length'),
        cacheControl: res.headers.get('cache-control'),
        actualBytes: bytes.length,
        firstBytesHex: Array.from(bytes.slice(0, 8)).map((b) => b.toString(16).padStart(2, '0')).join(' '),
        decodeOk,
        decodeErr,
        dims,
      });
    } catch (e) {
      results.push({ url, fetchError: String(e) });
    }
  }
  return new Response(JSON.stringify(results, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
