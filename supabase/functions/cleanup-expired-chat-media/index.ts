import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Borra las fotos y videos del chat que ya cumplieron su tiempo de vida
// (30 dias por defecto). La invoca un cron una vez al dia.
//
// Por que existe: el plan de Supabase da 1 GB de almacenamiento, y las fotos y
// videos de los eventos se acumulan sin parar. La gente los usa en los dias
// siguientes al evento para compartirlos, asi que despues de un mes ya no
// hacen falta.
//
// El MENSAJE no se borra: se marca como caducado y la app muestra
// "Foto no disponible". Asi la conversacion no queda con huecos raros.
//
// Las NOTAS DE VOZ no caducan: pesan muy poco y son parte de la conversacion.
//
// Se borra a traves del cliente de Storage (no con un DELETE en la tabla)
// porque solo asi se elimina de verdad el archivo y se libera el espacio.

// La llama el cron de Postgres, que solo tiene a mano la llave publica; por eso
// se autentica con un secreto propio, igual que notify-chat-message.
const WEBHOOK_SECRET = "nospi_cleanup_wh_d3d948c830fbe7f6";

const DEFAULT_DAYS = 30;
const BUCKET = "chat-media";
// Storage acepta borrados por lotes; se parte para no armar peticiones enormes.
const DELETE_CHUNK = 100;

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const anyErr = err as any;
    return anyErr.message || anyErr.details || JSON.stringify(err);
  }
  return String(err);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

Deno.serve(async (req: Request) => {
  try {
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "").trim();
    const secret = req.headers.get("x-webhook-secret") ?? "";

    // Vale el secreto del cron o la service role key (para pruebas manuales).
    const autorizado = secret === WEBHOOK_SECRET || (!!serviceRoleKey && jwt === serviceRoleKey);
    if (!autorizado) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Permite probar con otro plazo sin tocar el codigo, p. ej. {"days": 60}.
    let days = DEFAULT_DAYS;
    let dryRun = false;
    try {
      const body = await req.json();
      if (typeof body?.days === "number" && body.days > 0) days = body.days;
      dryRun = body?.dry_run === true;
    } catch {
      // Sin cuerpo: se usan los valores por defecto.
    }

    const { data: expired, error: listError } = await supabase.rpc("get_expired_chat_media", {
      p_days: days,
      p_limit: 500,
    });

    if (listError) {
      return new Response(JSON.stringify({ error: errorMessage(listError), stage: "listar" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const rows: { message_id: string; media_path: string }[] = expired ?? [];
    if (rows.length === 0) {
      return new Response(JSON.stringify({ ok: true, days, borrados: 0, motivo: "nada por borrar" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (dryRun) {
      return new Response(
        JSON.stringify({ ok: true, dry_run: true, days, encontrados: rows.length }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // Se borran de Storage primero. Solo se marcan como caducados los mensajes
    // cuyo archivo se borro de verdad: si algo falla, se reintenta manana.
    const borrados: string[] = [];
    const fallidos: { path: string; error: string }[] = [];

    for (const group of chunk(rows, DELETE_CHUNK)) {
      const paths = group.map((r) => r.media_path);
      const { error: removeError } = await supabase.storage.from(BUCKET).remove(paths);

      if (removeError) {
        // Un archivo que ya no existe no es un fallo real: el mensaje igual
        // debe quedar marcado para no volver a intentarlo cada dia.
        const msg = errorMessage(removeError);
        if (msg.toLowerCase().includes("not found")) {
          borrados.push(...group.map((r) => r.message_id));
        } else {
          fallidos.push(...paths.map((p) => ({ path: p, error: msg })));
        }
        continue;
      }
      borrados.push(...group.map((r) => r.message_id));
    }

    let marcados = 0;
    if (borrados.length > 0) {
      const { data: updated, error: markError } = await supabase.rpc("mark_chat_media_expired", {
        p_message_ids: borrados,
      });
      if (markError) {
        return new Response(
          JSON.stringify({ error: errorMessage(markError), stage: "marcar", borrados: borrados.length }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }
      marcados = (updated as number) ?? 0;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        days,
        encontrados: rows.length,
        borrados: borrados.length,
        marcados,
        fallidos: fallidos.length,
        ...(fallidos.length > 0 ? { detalleFallidos: fallidos.slice(0, 5) } : {}),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: errorMessage(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
