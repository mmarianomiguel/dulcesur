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

// Check if current time is within DND window
function isDndActive(config: { dnd_enabled: boolean; dnd_hora_inicio: string; dnd_hora_fin: string }): boolean {
  if (!config.dnd_enabled) return false;
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const { dnd_hora_inicio: start, dnd_hora_fin: end } = config;
  // Handle overnight ranges (e.g., 22:00 - 08:00)
  if (start <= end) {
    return hhmm >= start && hhmm < end;
  }
  return hhmm >= start || hhmm < end;
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
      // Optional: specify which config key to check (default: push_pedidos_nuevos)
      config_key = "push_pedidos_nuevos",
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
      url: "/admin/ventas/listado",
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

    // Get admin notification configs to filter by preference and DND
    const userIds = subs.map((s) => s.user_id);
    const { data: usuarios } = await supabase
      .from("usuarios")
      .select("id, auth_id")
      .in("auth_id", userIds);

    const usuarioIds = (usuarios || []).map((u) => u.id);
    const { data: configs } = await supabase
      .from("admin_notif_config")
      .select("*")
      .in("usuario_id", usuarioIds);

    // Build auth_id → config map
    const authToConfig: Record<string, any> = {};
    for (const u of usuarios || []) {
      const cfg = (configs || []).find((c: any) => c.usuario_id === u.id);
      authToConfig[u.auth_id] = cfg || null;
    }

    let sent = 0;
    const expired: string[] = [];

    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          const cfg = authToConfig[sub.user_id];

          // Check if this notification type is enabled (default: enabled)
          if (cfg && cfg[config_key] === false) return;

          // Check DND
          if (cfg && isDndActive(cfg)) return;

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
