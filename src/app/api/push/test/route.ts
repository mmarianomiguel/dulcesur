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

// POST — send a test notification with custom title/body
function ascii(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export async function POST(req: NextRequest) {
  const { title, body, tag, url } = await req.json();
  const payload = JSON.stringify({ title: ascii(title), body: ascii(body), tag: tag || "test", url: url || "/admin" });

  const { data: subs } = await supabase.from("push_subscriptions").select("*");
  if (!subs || subs.length === 0) return NextResponse.json({ sent: 0 });

  let sent = 0;
  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth } },
          Buffer.from(payload, "utf-8")
        );
        sent++;
      } catch {}
    })
  );

  return NextResponse.json({ sent });
}
