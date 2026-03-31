import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// One-time fix: sync ventas.fecha with pedidos_tienda.fecha_entrega for web orders
export async function POST() {
  // Get all pending web orders (ventas with origen=tienda, not delivered)
  const { data: ventas, error: vErr } = await supabase
    .from("ventas")
    .select("id, numero, fecha")
    .eq("origen", "tienda")
    .eq("entregado", false)
    .neq("estado", "anulada");

  if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });
  if (!ventas || ventas.length === 0) return NextResponse.json({ message: "No pending web orders", fixed: 0 });

  const numeros = ventas.map((v) => v.numero);
  const { data: pedidos } = await supabase
    .from("pedidos_tienda")
    .select("numero, fecha_entrega")
    .in("numero", numeros);

  const entregaMap: Record<number, string> = {};
  (pedidos || []).forEach((p: any) => {
    if (p.fecha_entrega) entregaMap[p.numero] = p.fecha_entrega;
  });

  const fixes: { numero: number; old_fecha: string; new_fecha: string }[] = [];

  for (const v of ventas) {
    const fechaEntrega = entregaMap[v.numero];
    if (fechaEntrega && fechaEntrega !== v.fecha) {
      await supabase.from("ventas").update({ fecha: fechaEntrega }).eq("id", v.id);
      fixes.push({ numero: v.numero, old_fecha: v.fecha, new_fecha: fechaEntrega });
    }
  }

  return NextResponse.json({ message: `Fixed ${fixes.length} orders`, fixes });
}
