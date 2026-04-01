import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// One-time fix: sync web order dates + mark paid orders as delivered
// Pass ?surcharge=1 to also apply transfer surcharge to existing entregado orders
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const fixSurcharge = searchParams.get("surcharge") === "1";
  const fixes: any[] = [];

  // ── 1. Fix ventas.fecha + mark delivered ──────────────────────────────────
  const { data: ventas } = await supabase
    .from("ventas")
    .select("id, numero, fecha, entregado")
    .eq("origen", "tienda")
    .neq("estado", "anulada");

  if (ventas && ventas.length > 0) {
    const numeros = ventas.map((v) => v.numero);
    const ventaIds = ventas.map((v) => v.id);

    const { data: pedidos } = await supabase.from("pedidos_tienda").select("numero, fecha_entrega").in("numero", numeros);

    const entregaMap: Record<number, string> = {};
    (pedidos || []).forEach((p: any) => {
      if (p.fecha_entrega) entregaMap[p.numero] = p.fecha_entrega;
    });

    // Only fix dates — NEVER auto-mark as delivered (payment ≠ delivery)
    for (const v of ventas) {
      const fechaEntrega = entregaMap[v.numero];
      if (fechaEntrega && fechaEntrega !== v.fecha) {
        await supabase.from("ventas").update({ fecha: fechaEntrega }).eq("id", v.id);
        fixes.push({ tipo: "fecha", numero: v.numero, fecha: fechaEntrega });
      }
    }
  }

  // ── 2. Fix transfer surcharge on existing delivered orders ────────────────
  // Only runs when ?surcharge=1 is passed
  if (fixSurcharge) {
    const { data: empresa } = await supabase.from("empresa").select("porcentaje_transferencia").single();
    const pct: number = (empresa as any)?.porcentaje_transferencia || 0;

    if (pct > 0) {
      // Fetch all entregado ventas with Transferencia payment (any origin)
      const { data: trVentas } = await supabase
        .from("ventas")
        .select("id, numero, total, subtotal, descuento_porcentaje, recargo_porcentaje, forma_pago")
        .eq("estado", "entregado")
        .neq("estado", "anulada")
        .in("forma_pago", ["Transferencia", "Mixto"]);

      for (const v of trVentas || []) {
        const sub = (v as any).subtotal;
        if (!sub) continue;
        const discAmt = Math.round(sub * ((v as any).descuento_porcentaje || 0) / 100);
        const recAmt = Math.round((sub - discAmt) * ((v as any).recargo_porcentaje || 0) / 100);
        const baseTotal = sub - discAmt + recAmt;

        // If venta.total matches baseTotal, surcharge was never applied
        if (Math.abs(v.total - baseTotal) < 2) {
          // Verify there's a Transferencia caja movement for this venta
          const { data: movs } = await supabase
            .from("caja_movimientos")
            .select("id, monto")
            .eq("referencia_id", v.id)
            .eq("referencia_tipo", "venta")
            .eq("tipo", "ingreso")
            .eq("metodo_pago", "Transferencia");

          if (!movs || movs.length === 0) continue;

          // Determine transfer base (for Mixto, only transfer portion gets surcharge)
          let trBase = 0;
          for (const m of movs) trBase += m.monto;

          const surcharge = Math.round(trBase * (pct / 100));
          if (surcharge <= 0) continue;

          const newTotal = v.total + surcharge;
          await supabase.from("ventas").update({ total: newTotal }).eq("id", v.id);
          // Update caja movements to include surcharge
          for (const m of movs) {
            const newMonto = m.monto + Math.round(m.monto * (pct / 100));
            await supabase.from("caja_movimientos").update({ monto: newMonto }).eq("id", m.id);
          }
          fixes.push({ tipo: "recargo_transferencia", numero: v.numero, old_total: v.total, new_total: newTotal, surcharge });
        }
      }
    }
  }

  return NextResponse.json({ message: `Fixed ${fixes.length} records`, fixes });
}
