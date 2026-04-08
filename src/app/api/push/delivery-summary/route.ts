import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

webpush.setVapidDetails(
  "mailto:admin@dulcesur.com",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

function getArgentinaToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
}

// GET — Called by Vercel Cron at 08:00 ART
// Sends morning summary of pending deliveries
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = getArgentinaToday();

  // Count pending deliveries (not delivered, date <= today)
  const { data: pendientes, count } = await supabase
    .from("ventas")
    .select("id, total, metodo_entrega", { count: "exact" })
    .eq("entregado", false)
    .lte("fecha", today)
    .neq("estado", "anulada")
    .not("tipo_comprobante", "ilike", "Nota de Crédito%")
    .not("tipo_comprobante", "ilike", "NC%")
    .not("cliente_id", "is", null);

  const total = count || 0;
  if (total === 0) {
    return NextResponse.json({ message: "No pending deliveries", sent: 0 });
  }

  const envios = (pendientes || []).filter((v) => v.metodo_entrega === "envio" || v.metodo_entrega === "envio_a_domicilio").length;
  const retiros = total - envios;
  const montoTotal = (pendientes || []).reduce((sum, v) => sum + (v.total || 0), 0);

  const lines = [
    `${total} entrega${total > 1 ? "s" : ""} pendiente${total > 1 ? "s" : ""}`,
  ];
  if (envios > 0) lines.push(`\ud83d\ude9a ${envios} env\u00edo${envios > 1 ? "s" : ""}`);
  if (retiros > 0) lines.push(`\ud83c\udfea ${retiros} retiro${retiros > 1 ? "s" : ""}`);
  lines.push(`Total: $${Math.round(montoTotal).toLocaleString("es-AR")}`);

  const payload = JSON.stringify({
    title: `\ud83d\udce6 Entregas del d\u00eda`,
    body: lines.join("\n"),
    tag: "delivery-summary-" + today,
    url: "/admin/ventas/hoja-ruta",
  });

  const { data: subs } = await supabase.from("push_subscriptions").select("*");
  if (!subs || subs.length === 0) return NextResponse.json({ sent: 0 });

  let sent = 0;
  const expired: string[] = [];

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth } },
          payload
        );
        sent++;
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) expired.push(sub.endpoint);
      }
    })
  );

  if (expired.length > 0) {
    await supabase.from("push_subscriptions").delete().in("endpoint", expired);
  }

  return NextResponse.json({ sent, total, envios, retiros });
}
