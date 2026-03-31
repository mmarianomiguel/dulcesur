import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// One-time fix: sync web order dates + mark paid orders as delivered
export async function POST() {
  const fixes: any[] = [];

  // 1. Fix ventas.fecha to match pedidos_tienda.fecha_entrega
  const { data: ventas } = await supabase
    .from("ventas")
    .select("id, numero, fecha, entregado")
    .eq("origen", "tienda")
    .neq("estado", "anulada");

  if (!ventas || ventas.length === 0) return NextResponse.json({ message: "No web orders found", fixes });

  const numeros = ventas.map((v) => v.numero);
  const ventaIds = ventas.map((v) => v.id);

  const [{ data: pedidos }, { data: movimientos }] = await Promise.all([
    supabase.from("pedidos_tienda").select("numero, fecha_entrega").in("numero", numeros),
    supabase.from("caja_movimientos").select("referencia_id").eq("referencia_tipo", "venta").eq("tipo", "ingreso").in("referencia_id", ventaIds),
  ]);

  const entregaMap: Record<number, string> = {};
  (pedidos || []).forEach((p: any) => {
    if (p.fecha_entrega) entregaMap[p.numero] = p.fecha_entrega;
  });

  // Set of venta IDs that have payments registered
  const paidVentaIds = new Set((movimientos || []).map((m: any) => m.referencia_id));

  for (const v of ventas) {
    const updates: Record<string, any> = {};

    // Fix fecha
    const fechaEntrega = entregaMap[v.numero];
    if (fechaEntrega && fechaEntrega !== v.fecha) {
      updates.fecha = fechaEntrega;
    }

    // Fix entregado: if payment exists but not marked as delivered
    if (!v.entregado && paidVentaIds.has(v.id)) {
      updates.entregado = true;
      updates.estado = "entregado";
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from("ventas").update(updates).eq("id", v.id);
      if (updates.estado === "entregado") {
        await supabase.from("pedidos_tienda").update({ estado: "entregado" }).eq("numero", v.numero);
      }
      fixes.push({ numero: v.numero, ...updates });
    }
  }

  return NextResponse.json({ message: `Fixed ${fixes.length} orders`, fixes });
}
