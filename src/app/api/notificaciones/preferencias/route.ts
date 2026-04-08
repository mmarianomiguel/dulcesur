import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TIPOS = ["pedido", "promocion", "recordatorio", "catalogo", "cuenta_corriente"];

export async function GET(req: NextRequest) {
  try {
    const clienteId = req.nextUrl.searchParams.get("cliente_id");
    if (!clienteId) return NextResponse.json({ error: "cliente_id required" }, { status: 400 });

    const { data } = await supabase
      .from("notificacion_preferencias")
      .select("*")
      .eq("cliente_id", Number(clienteId));

    // Return all tipos, defaulting to enabled
    const prefsMap: Record<string, boolean> = {};
    TIPOS.forEach((t) => { prefsMap[t] = true; });
    (data || []).forEach((p: any) => { prefsMap[p.tipo] = p.push_enabled; });

    return NextResponse.json(prefsMap);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { cliente_id, tipo, push_enabled } = await req.json();
    if (!cliente_id || !tipo) return NextResponse.json({ error: "cliente_id and tipo required" }, { status: 400 });

    const { error } = await supabase
      .from("notificacion_preferencias")
      .upsert(
        { cliente_id, tipo, push_enabled, updated_at: new Date().toISOString() },
        { onConflict: "cliente_id,tipo" }
      );
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
