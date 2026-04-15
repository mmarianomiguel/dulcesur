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
        clientes ( id, nombre, telefono, domicilio, localidad, auth_id ),
        venta_items ( descripcion, cantidad, precio_unitario, subtotal, presentacion, unidades_por_presentacion )
      `)
      .eq("fecha", fecha)
      .neq("estado", "anulada")
      .in("metodo_entrega", ["envio", "envio_a_domicilio", "retiro"])
      .not("tipo_comprobante", "ilike", "Nota de Crédito%")
      .order("created_at", { ascending: true });

    if (error) throw error;
    if (!ventas || ventas.length === 0) {
      return NextResponse.json({ pedidos: [] });
    }

    // 2. Fetch pedido_armado for these ventas
    const ventaIds = ventas.map((v: any) => v.id);
    const { data: armados } = await supabase
      .from("pedido_armado")
      .select("id, venta_id, estado, armador_id, notas, orden_entrega")
      .in("venta_id", ventaIds);

    // 3. Fetch armador names
    const armadorIds = (armados || [])
      .map((a: any) => a.armador_id)
      .filter(Boolean);
    const armadorMap: Record<string, string> = {};
    if (armadorIds.length > 0) {
      const { data: armadores } = await supabase
        .from("equipo")
        .select("id, nombre")
        .in("id", armadorIds);
      for (const a of armadores || []) {
        armadorMap[a.id] = a.nombre;
      }
    }

    // 4. Merge data
    const armadoMap: Record<string, any> = {};
    for (const a of armados || []) {
      armadoMap[a.venta_id] = {
        ...a,
        armador_nombre: a.armador_id ? armadorMap[a.armador_id] || null : null,
      };
    }

    const pedidos = ventas.map((v: any) => ({
      ...v,
      pedido_armado: armadoMap[v.id] || null,
    }));

    // 5. Sort: by orden_entrega (nulls last), then created_at
    pedidos.sort((a: any, b: any) => {
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
