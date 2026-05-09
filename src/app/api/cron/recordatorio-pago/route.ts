import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Disparado manualmente desde admin/notificaciones/configuracion (botón "Enviar ahora").
// Recorre clientes con saldo > 0 y manda notif de recordatorio si no se les envió
// una en los últimos N días (configurable en tienda_config.dias_recordatorio_pago).
async function isAdminCaller(req: NextRequest): Promise<boolean> {
  const ssr = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return req.cookies.getAll(); }, setAll() {} } }
  );
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return false;
  const { data: u } = await supabase.from("usuarios").select("activo").eq("auth_id", user.id).maybeSingle();
  return !!u?.activo;
}

export async function POST(req: NextRequest) {
  if (!(await isAdminCaller(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1) Leer config de días
  const { data: cfg } = await supabase
    .from("tienda_config")
    .select("dias_recordatorio_pago")
    .limit(1)
    .single();
  const diasRecordatorio = cfg?.dias_recordatorio_pago ?? 7;

  // 2) Clientes con deuda
  const { data: deudores } = await supabase
    .from("clientes")
    .select("id, nombre, saldo, email")
    .eq("activo", true)
    .gt("saldo", 0)
    .range(0, 49999);

  if (!deudores || deudores.length === 0) {
    return NextResponse.json({ message: "Sin deudores", sent: 0 });
  }

  // 3) Para cada deudor, ver el último recordatorio enviado de tipo "pago_pendiente"
  const corte = new Date();
  corte.setDate(corte.getDate() - diasRecordatorio);

  const ids = deudores.map((d: any) => d.id);
  const { data: ultimos } = await supabase
    .from("notificacion_destinatarios")
    .select("cliente_id, created_at, notificaciones!inner(tipo)")
    .in("cliente_id", ids)
    .eq("notificaciones.tipo", "pago_pendiente")
    .gte("created_at", corte.toISOString());

  const yaNotificados = new Set((ultimos || []).map((u: any) => u.cliente_id));
  const aRecordar = deudores.filter((d: any) => !yaNotificados.has(d.id));

  if (aRecordar.length === 0) {
    return NextResponse.json({ message: "Todos los deudores ya fueron notificados recientemente", sent: 0 });
  }

  // 4) Disparar /api/notificaciones/enviar para cada cliente (segmentación individual
  //    porque el mensaje incluye el saldo del cliente).
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  let sent = 0;
  let failed = 0;
  await Promise.allSettled(
    aRecordar.map(async (d: any) => {
      const saldoFmt = "$" + Math.round(d.saldo).toLocaleString("es-AR");
      const primerNombre = (d.nombre || "").trim().split(" ")[0] || "Hola";
      try {
        const res = await fetch(`${baseUrl}/api/notificaciones/enviar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            titulo: `${primerNombre}, tenés saldo pendiente`,
            mensaje: `Tu saldo en cuenta corriente es ${saldoFmt}. Podés saldarlo en tu próximo pedido.`,
            tipo: "pago_pendiente",
            url: "/cuenta/pedidos",
            segmentacion: { tipo: "cliente", valor: d.id },
          }),
        });
        if (res.ok) sent++;
        else failed++;
      } catch {
        failed++;
      }
    })
  );

  return NextResponse.json({
    deudores_total: deudores.length,
    notificados_recientemente: yaNotificados.size,
    enviados: sent,
    fallidos: failed,
    dias_recordatorio: diasRecordatorio,
  });
}
