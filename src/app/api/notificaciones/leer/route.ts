import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function PATCH(req: NextRequest) {
  try {
    const { id, todas, cliente_id } = await req.json();
    const now = new Date().toISOString();

    if (todas && cliente_id) {
      await supabase
        .from("notificacion_destinatarios")
        .update({ leida: true, leida_at: now })
        .eq("cliente_id", cliente_id)
        .eq("leida", false);
    } else if (id) {
      await supabase
        .from("notificacion_destinatarios")
        .update({ leida: true, leida_at: now })
        .eq("id", id);
    } else {
      return NextResponse.json({ error: "id or (todas + cliente_id) required" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
