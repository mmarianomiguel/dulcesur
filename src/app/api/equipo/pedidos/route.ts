import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { todayARG } from "@/lib/formatters";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const fecha = todayARG();

    // 1. Fetch today's ventas with delivery/pickup
    const { data: ventas, error } = await supabase
      .from("ventas")
      .select(`
        id, numero, total, forma_pago, metodo_entrega, origen, created_at,
        clientes ( id, nombre, telefono, domicilio, localidad ),
        venta_items ( descripcion, cantidad, precio_unitario, subtotal, presentacion, unidades_por_presentacion )
      `)
      .eq("fecha", fecha)
      .neq("estado", "anulada")
      .in("metodo_entrega", ["envio", "envio_a_domicilio", "retiro"])
      .not("tipo_comprobante", "ilike", "Nota de Crédito%")
      .order("created_at", { ascending: true });

    if (error) throw error;

    // Filter: POS orders only show if envío (not retiro)
    const filtered = (ventas || []).filter((v: any) => {
      if (v.origen === "pos") {
        return v.metodo_entrega === "envio" || v.metodo_entrega === "envio_a_domicilio";
      }
      return true; // tienda orders: show all (envío + retiro)
    });

    if (!filtered || filtered.length === 0) {
      return NextResponse.json({ pedidos: [] });
    }

    // 2. Fetch pedido_armado for these ventas
    const ventaIds = filtered.map((v: any) => v.id);
    const { data: armados } = await supabase
      .from("pedido_armado")
      .select("id, venta_id, estado, armador_id, notas, orden_entrega, inicio_armado_at, fin_armado_at, aprobado_at, aprobado_por, rechazos, motivo_rechazo, urgente")
      .in("venta_id", ventaIds);

    // 3. Fetch equipo names (armadores + aprobadores)
    const armadorIds = (armados || []).map((a: any) => a.armador_id).filter(Boolean);
    const aprobadorIds = (armados || []).map((a: any) => a.aprobado_por).filter(Boolean);
    const allEquipoIds = [...new Set([...armadorIds, ...aprobadorIds])];
    const equipoMap: Record<string, string> = {};
    if (allEquipoIds.length > 0) {
      const { data: equipo } = await supabase
        .from("equipo")
        .select("id, nombre")
        .in("id", allEquipoIds);
      for (const e of equipo || []) {
        equipoMap[e.id] = e.nombre;
      }
    }

    // 4. Merge data
    const armadoMap: Record<string, any> = {};
    for (const a of armados || []) {
      armadoMap[a.venta_id] = {
        ...a,
        armador_nombre: a.armador_id ? equipoMap[a.armador_id] || null : null,
        aprobador_nombre: a.aprobado_por ? equipoMap[a.aprobado_por] || null : null,
      };
    }

    const pedidos = filtered.map((v: any) => ({
      ...v,
      pedido_armado: armadoMap[v.id] || null,
    }));

    // 5. Sort: urgent first, then by orden_entrega (nulls last), then created_at
    pedidos.sort((a: any, b: any) => {
      const ua = a.pedido_armado?.urgente ? 0 : 1;
      const ub = b.pedido_armado?.urgente ? 0 : 1;
      if (ua !== ub) return ua - ub;
      const oa = a.pedido_armado?.orden_entrega ?? Infinity;
      const ob = b.pedido_armado?.orden_entrega ?? Infinity;
      if (oa !== ob) return oa - ob;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    return NextResponse.json({ pedidos });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error del servidor" }, { status: 500 });
  }
}
