import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DEFAULTS = {
  push_pedidos_nuevos: true,
  push_pedidos_armados: true,
  push_clientes_nuevos: true,
  push_stock_bajo: true,
  sonido_enabled: true,
  dnd_enabled: false,
  dnd_hora_inicio: "22:00",
  dnd_hora_fin: "08:00",
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const usuario_id = searchParams.get("usuario_id");

    if (!usuario_id) {
      return NextResponse.json(
        { error: "usuario_id es requerido" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("admin_notif_config")
      .select("*")
      .eq("usuario_id", usuario_id)
      .single();

    if (error && error.code === "PGRST116") {
      // No row found — return defaults
      return NextResponse.json({ ...DEFAULTS, usuario_id });
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { usuario_id, ...config } = body;

    if (!usuario_id) {
      return NextResponse.json(
        { error: "usuario_id es requerido" },
        { status: 400 }
      );
    }

    const payload = {
      usuario_id,
      push_pedidos_nuevos: config.push_pedidos_nuevos ?? DEFAULTS.push_pedidos_nuevos,
      push_pedidos_armados: config.push_pedidos_armados ?? DEFAULTS.push_pedidos_armados,
      push_clientes_nuevos: config.push_clientes_nuevos ?? DEFAULTS.push_clientes_nuevos,
      push_stock_bajo: config.push_stock_bajo ?? DEFAULTS.push_stock_bajo,
      sonido_enabled: config.sonido_enabled ?? DEFAULTS.sonido_enabled,
      dnd_enabled: config.dnd_enabled ?? DEFAULTS.dnd_enabled,
      dnd_hora_inicio: config.dnd_hora_inicio ?? DEFAULTS.dnd_hora_inicio,
      dnd_hora_fin: config.dnd_hora_fin ?? DEFAULTS.dnd_hora_fin,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("admin_notif_config")
      .upsert(payload, { onConflict: "usuario_id" })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
