import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET — Vercel cron cada 3 días a las 3:00 UTC.
// Limpia destinatarios + notificaciones viejas para que la tabla no crezca sin freno.
// Reglas:
//   - destinatarios LEÍDOS más viejos que 90 días → borrar
//   - destinatarios NO LEÍDOS más viejos que 180 días → borrar
//   - notificaciones que ya no tengan ningún destinatario asociado → borrar
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoffLeidas = new Date();
  cutoffLeidas.setDate(cutoffLeidas.getDate() - 90);

  const cutoffNoLeidas = new Date();
  cutoffNoLeidas.setDate(cutoffNoLeidas.getDate() - 180);

  // 1) Borrar destinatarios leídos > 90 días
  const { count: borradosLeidos } = await supabase
    .from("notificacion_destinatarios")
    .delete({ count: "exact" })
    .eq("leida", true)
    .lt("created_at", cutoffLeidas.toISOString());

  // 2) Borrar destinatarios no leídos > 180 días
  const { count: borradosNoLeidos } = await supabase
    .from("notificacion_destinatarios")
    .delete({ count: "exact" })
    .eq("leida", false)
    .lt("created_at", cutoffNoLeidas.toISOString());

  // 3) Borrar notificaciones huérfanas (sin destinatarios). Las que tienen segmentación
  //    "todos" pueden quedar huérfanas tras borrar todos sus destinatarios.
  //    Estrategia: traer ids referenciados y borrar las que no aparecen.
  //    Hacemos una query más simple: borrar notificaciones cuyo created_at sea < cutoffNoLeidas
  //    Y que no tengan destinatarios. Eso evita borrar notifs recientes que aún no se procesaron.
  const { data: orfanas } = await supabase
    .from("notificaciones")
    .select("id")
    .lt("created_at", cutoffNoLeidas.toISOString());

  let borradasOrfanas = 0;
  if (orfanas && orfanas.length > 0) {
    const ids = orfanas.map((o: any) => o.id);
    // Filtrar solo las que NO tienen destinatarios (chunks de 200 para .in)
    const sinDest: string[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { data: conDest } = await supabase
        .from("notificacion_destinatarios")
        .select("notificacion_id")
        .in("notificacion_id", chunk);
      const conDestSet = new Set((conDest || []).map((d: any) => d.notificacion_id));
      for (const id of chunk) if (!conDestSet.has(id)) sinDest.push(id);
    }
    if (sinDest.length > 0) {
      for (let i = 0; i < sinDest.length; i += 200) {
        const chunk = sinDest.slice(i, i + 200);
        const { count } = await supabase
          .from("notificaciones")
          .delete({ count: "exact" })
          .in("id", chunk);
        borradasOrfanas += count || 0;
      }
    }
  }

  return NextResponse.json({
    destinatarios_leidos_borrados: borradosLeidos ?? 0,
    destinatarios_no_leidos_borrados: borradosNoLeidos ?? 0,
    notificaciones_huerfanas_borradas: borradasOrfanas,
  });
}
