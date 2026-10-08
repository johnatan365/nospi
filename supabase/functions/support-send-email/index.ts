import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  let body: { userEmail?: string; senderEmail?: string; senderName?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Support both `senderEmail` (new) and `userEmail` (legacy) field names
  const senderEmail = (body.senderEmail || body.userEmail || '').trim();
  const senderName = (body.senderName || '').trim();
  const message = (body.message || '').trim();

  if (!senderEmail) {
    return new Response(JSON.stringify({ success: false, error: 'senderEmail is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  if (!message) {
    return new Response(JSON.stringify({ success: false, error: 'message is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ success: false, error: 'Server configuration error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const displayName = senderName || senderEmail;
  const subject = `Soporte - Mensaje de ${displayName}`;
  const emailBody = [
    senderName ? `Nombre: ${senderName}` : null,
    `Correo: ${senderEmail}`,
    '',
    'Mensaje:',
    message,
  ].filter((line) => line !== null).join('\n');

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Nospi <noreply@nospi.co>',
        to: ['nospisocial@gmail.com'],
        reply_to: senderEmail,
        subject,
        text: emailBody,
      }),
    });

    if (!res.ok) {
      const errorData = await res.text();
      console.error('Resend API error:', res.status, errorData);
      return new Response(JSON.stringify({ success: false, error: 'Failed to send email' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    console.error('Unexpected error:', err);
    return new Response(JSON.stringify({ success: false, error: 'Unexpected server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});
