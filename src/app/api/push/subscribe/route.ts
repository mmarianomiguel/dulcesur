import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST — subscribe or unsubscribe from push notifications
export async function POST(req: NextRequest) {
  try {
    const { subscription, user_id, cliente_id, action } = await req.json();

    if (action === "unsubscribe") {
      if (!subscription?.endpoint) {
        return NextResponse.json({ error: "endpoint required" }, { status: 400 });
      }
      await supabase
        .from("push_subscriptions")
        .delete()
        .eq("endpoint", subscription.endpoint);
      return NextResponse.json({ ok: true });
    }

    // Subscribe
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
    }

    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: user_id || "unknown",
        endpoint: subscription.endpoint,
        keys_p256dh: subscription.keys.p256dh,
        keys_auth: subscription.keys.auth,
        cliente_id: cliente_id ? String(cliente_id) : null,
      },
      { onConflict: "endpoint" }
    );

    if (error) {
      console.error("Push subscribe error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Push subscribe error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET — check if current endpoint is subscribed
export async function GET(req: NextRequest) {
  const endpoint = req.nextUrl.searchParams.get("endpoint");
  if (!endpoint) return NextResponse.json({ subscribed: false });

  const { data } = await supabase
    .from("push_subscriptions")
    .select("id")
    .eq("endpoint", endpoint)
    .limit(1);

  return NextResponse.json({ subscribed: (data?.length || 0) > 0 });
}
