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

// Strip accents for push compatibility (iOS Safari doesn't decode UTF-8 well in push payloads)
function ascii(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      numero,
      cliente,
      total,
      forma_pago,
      metodo_entrega,
    } = body;

    const isEnvio = metodo_entrega === "envio";
    const despacho = isEnvio ? "Envio a domicilio" : "Retiro en local";

    const title = isEnvio ? `Nuevo pedido #${numero} - ENVIO` : `Nuevo pedido #${numero} - RETIRO`;
    const lines = [
      `Cliente: ${ascii(cliente)}`,
      `Total: $${Math.round(total).toLocaleString("es-AR")}`,
      `Pago: ${ascii(forma_pago)}`,
      `Despacho: ${despacho}`,
    ];

    const payload = JSON.stringify({
      title: ascii(title),
      body: ascii(lines.join("\n")),
      tag: `pedido-${numero}`,
      metodo_entrega,
      url: "/admin/ventas/pedidos-online",
    });

    // Get only admin/staff subscriptions (user_id linked, not tienda clients)
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("*")
      .not("user_id", "is", null)
      .neq("user_id", "unknown");

    if (!subs || subs.length === 0) {
      return NextResponse.json({ sent: 0 });
    }

    let sent = 0;
    const expired: string[] = [];

    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
            },
            Buffer.from(payload, "utf-8")
          );
          sent++;
        } catch (err: any) {
          // 410 Gone or 404 = subscription expired, clean up
          if (err.statusCode === 410 || err.statusCode === 404) {
            expired.push(sub.endpoint);
          } else {
            console.error("Push send failed for", sub.endpoint, err.statusCode || err.message);
          }
        }
      })
    );

    // Clean up expired subscriptions
    if (expired.length > 0) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .in("endpoint", expired);
    }

    return NextResponse.json({ sent, expired: expired.length });
  } catch (err: any) {
    console.error("Push send error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
