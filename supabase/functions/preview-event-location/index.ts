import "jsr:@supabase/functions-js/edge-runtime.d.ts";

function extractCoordsFromUrl(finalUrl: string): { lat: number; lng: number } | null {
  const placeMatch = finalUrl.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (placeMatch) {
    return { lat: parseFloat(placeMatch[1]), lng: parseFloat(placeMatch[2]) };
  }
  const atMatch = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atMatch) {
    return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };
  }
  const qMatch = finalUrl.match(/[?&](?:q|ll)=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (qMatch) {
    return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };
  }
  return null;
}

async function geocodeAddressFromUrl(finalUrl: string): Promise<{ lat: number; lng: number } | null> {
  const addressMatch = finalUrl.match(/[?&](?:q|daddr)=([^&]+)/);
  if (!addressMatch) return null;

  const rawAddress = decodeURIComponent(addressMatch[1].replace(/\+/g, " "));
  const searchUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(rawAddress)}`;

  const resp = await fetch(searchUrl, {
    headers: { "User-Agent": "Nospi-EventLocationResolver/1.0 (nospisocial@gmail.com)" },
  });
  if (!resp.ok) return null;
  const results = await resp.json();
  if (!Array.isArray(results) || results.length === 0) return null;

  const lat = parseFloat(results[0].lat);
  const lng = parseFloat(results[0].lon);
  if (isNaN(lat) || isNaN(lng)) return null;
  return { lat, lng };
}

async function extractLatLng(finalUrl: string): Promise<{ lat: number; lng: number } | null> {
  const fromUrl = extractCoordsFromUrl(finalUrl);
  if (fromUrl) return fromUrl;
  return await geocodeAddressFromUrl(finalUrl);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { maps_link } = await req.json();
    if (!maps_link) {
      return new Response(JSON.stringify({ success: false, error: "missing maps_link" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resp = await fetch(maps_link, { redirect: "follow" });
    await resp.arrayBuffer().catch(() => {});
    const finalUrl = resp.url;

    const coords = await extractLatLng(finalUrl);
    if (!coords) {
      return new Response(
        JSON.stringify({ success: false, error: "no se pudieron detectar coordenadas en ese link" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ success: true, ...coords }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
