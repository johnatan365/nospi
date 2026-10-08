// DEBUG temporal: verifica si el entorno de edge functions puede enviar correo
// con la RESEND_API_KEY del proyecto (mismo camino que usa el cron de
// renovaciones). Envia UN correo de prueba al admin y devuelve la respuesta
// cruda de Resend. Protegido con secreto compartido. Borrar tras diagnosticar.
const SECRET = 'nospi_dbg_rnw_2c81f7';
const ADMIN_EMAIL = 'nospisocial@gmail.com';

Deno.serve(async (req: Request) => {
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.secret !== SECRET) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
    }
    const key = Deno.env.get('RESEND_API_KEY') || '';
    if (!key) {
      return new Response(JSON.stringify({ keyPresent: false, note: 'RESEND_API_KEY NO esta en el env de edge functions' }), { status: 200 });
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Nospi <noreply@nospi.co>',
        to: [ADMIN_EMAIL],
        subject: 'PRUEBA: correo de renovacion (diagnostico)',
        text: 'Este es un correo de PRUEBA enviado desde el mismo entorno y remitente que usa el cron de renovaciones de suscripcion. Si lo estas leyendo, el canal de envio funciona.',
      }),
    });
    const data = await res.text();
    return new Response(JSON.stringify({ keyPresent: true, resendStatus: res.status, resendBody: data.slice(0, 500) }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500 });
  }
});
