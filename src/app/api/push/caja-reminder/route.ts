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

// GET — Called by Vercel Cron at 22:00 ART
// Checks if caja is still open and sends reminder
export async function GET(req: NextRequest) {
  // Verify cron secret (Vercel sends this header)
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if there's an open turno
  const { data: turno } = await supabase
    .from("turnos_caja")
    .select("id, numero, operador, hora_apertura")
    .eq("estado", "abierto")
    .limit(1)
    .maybeSingle();

  if (!turno) {
    return NextResponse.json({ message: "Caja already closed", sent: 0 });
  }

  const payload = JSON.stringify({
    title: "\u26a0\ufe0f Caja abierta",
    body: `El turno #${turno.numero} sigue abierto (apertura: ${turno.hora_apertura?.substring(0, 5)} hs). Acordate de cerrar la caja.`,
    tag: "caja-reminder",
    url: "/admin/caja",
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

  return NextResponse.json({ sent, expired: expired.length });
}
