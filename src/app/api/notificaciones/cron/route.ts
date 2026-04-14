import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  // Verificar que sea una llamada autorizada
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Buscar programadas pendientes cuya hora ya pasó
  const ahora = new Date().toISOString();
  const { data: pendientes } = await supabase
    .from("notificacion_programadas")
    .select("*")
    .eq("enviada", false)
    .lte("programada_para", ahora);

  if (!pendientes || pendientes.length === 0) {
    return NextResponse.json({ procesadas: 0 });
  }

  let procesadas = 0;
  for (const p of pendientes) {
    try {
      // Llamar a la API de envío
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/notificaciones/enviar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: p.titulo,
          mensaje: p.mensaje,
          tipo: p.tipo,
          url: p.url,
          plantilla_id: p.plantilla_id,
          segmentacion: p.segmentacion,
        }),
      });

      // Marcar como enviada
      await supabase
        .from("notificacion_programadas")
        .update({ enviada: true, enviada_at: ahora })
        .eq("id", p.id);

      procesadas++;
    } catch (err) {
      console.error(`Error procesando programada ${p.id}:`, err);
    }
  }

  return NextResponse.json({ procesadas });
}
