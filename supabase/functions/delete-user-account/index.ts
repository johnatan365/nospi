import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Borra una cuenta por completo.
//
// Dos formas de llamarla:
//   1. Sin cuerpo  -> la persona borra SU PROPIA cuenta desde el perfil.
//   2. { user_id } -> un admin borra la cuenta de otra persona desde la
//                     pestana de Usuarios del panel. Solo funciona si quien
//                     llama es admin de verdad; eso lo valida la base, no aqui.
//
// El orden importa. Antes esto hacia `delete from users` sin mirar si habia
// fallado y luego borraba la cuenta de acceso igual. Como cuatro tablas
// bloqueaban ese borrado, quedaban perfiles fantasma: sin login, pero vivos en
// el panel y contando en las estadisticas. Ahora primero se borra el perfil
// (con la funcion borrar_usuario_completo, que suelta esos amarres) y SOLO si
// eso sale bien se borra la cuenta de acceso. Si algo falla, se devuelve el
// error en vez de seguir de largo.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

// Vacia una carpeta del almacenamiento. Se usa para las fotos de perfil y para
// las fotos, videos y GIFs que la persona subio al chat. Si no se borraran,
// quedarian archivos sueltos ocupando espacio y sin nadie a quien pertenecer.
async function vaciarCarpeta(admin: any, bucket: string, carpeta: string): Promise<number> {
  let borrados = 0
  const { data: entradas, error } = await admin.storage.from(bucket).list(carpeta, { limit: 1000 })
  if (error || !entradas?.length) return 0

  const archivos: string[] = []
  for (const e of entradas) {
    // Una entrada sin id es una subcarpeta: hay que entrar a mirarla.
    if (e.id === null) borrados += await vaciarCarpeta(admin, bucket, `${carpeta}/${e.name}`)
    else archivos.push(`${carpeta}/${e.name}`)
  }
  if (archivos.length > 0) {
    await admin.storage.from(bucket).remove(archivos)
    borrados += archivos.length
  }
  return borrados
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No authorization header' }, 401)

    const url = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Cliente con la sesion de quien llama: sirve para saber QUIEN es y, sobre
    // todo, para que la base pueda comprobar por su cuenta si es admin.
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) return json({ error: 'Invalid token' }, 401)

    // Si viene user_id, es un admin borrando a otra persona. Si no, se borra a
    // si mismo. El permiso lo decide borrar_usuario_completo, que corre dentro
    // de la base con la sesion de quien llama: aca no se confia en nada que
    // venga en el cuerpo de la peticion.
    let objetivo = user.id
    try {
      const body = await req.json()
      if (body?.user_id && typeof body.user_id === 'string') objetivo = body.user_id
    } catch {
      // sin cuerpo: borrado propio
    }

    // 1. Perfil y todo lo que cuelga de el. Si esto falla, NO se toca nada mas.
    const { data: resumen, error: rpcError } = await userClient.rpc('borrar_usuario_completo', {
      p_user_id: objetivo,
    })
    if (rpcError) return json({ error: rpcError.message }, 400)

    const admin = createClient(url, serviceKey)

    // 2. Archivos. Va despues del perfil porque un archivo huerfano es un
    //    problema mucho menor que un perfil huerfano, y porque si el borrado
    //    del perfil no se autorizo tampoco hay derecho a tocar sus archivos.
    const fotosPerfil = await vaciarCarpeta(admin, 'profile-photos', objetivo)
    // En el chat la ruta es <conversacion>/<persona>/<archivo>, asi que hay que
    // recorrer las conversaciones para encontrar lo que subio esta persona.
    let archivosChat = 0
    const { data: convs } = await admin.storage.from('chat-media').list('', { limit: 1000 })
    for (const c of convs ?? []) {
      if (c.id === null) archivosChat += await vaciarCarpeta(admin, 'chat-media', `${c.name}/${objetivo}`)
    }

    // 3. Y por ultimo la cuenta de acceso.
    const { error: deleteError } = await admin.auth.admin.deleteUser(objetivo)
    if (deleteError) {
      // El perfil ya se fue, asi que la persona no puede hacer nada aunque su
      // login siga existiendo. Se avisa para poder rematarlo a mano.
      return json({
        error: `Se borro el perfil pero quedo la cuenta de acceso: ${deleteError.message}`,
        ...resumen,
      }, 500)
    }

    return json({
      success: true,
      ...resumen,
      fotos_perfil_borradas: fotosPerfil,
      archivos_chat_borrados: archivosChat,
    })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Internal server error' }, 500)
  }
})
