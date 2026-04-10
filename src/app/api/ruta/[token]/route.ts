import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function argNow() {
  const now = new Date();
  const ar = new Date(now.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const fecha = ar.toISOString().split("T")[0];
  const hora = ar.toTimeString().slice(0, 5);
  return { fecha, hora };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // Find hoja by token (fijo or temp)
  const { data: hoja, error } = await supabaseAdmin
    .from("hoja_ruta")
    .select("*")
    .or(`token_fijo.eq.${token},token_temp.eq.${token}`)
    .single();

  if (error || !hoja) {
    return NextResponse.json({ error: "Link no válido" }, { status: 404 });
  }

  // Check temp token expiry
  if (hoja.token_temp === token && hoja.token_temp_expira) {
    if (new Date(hoja.token_temp_expira) < new Date()) {
      return NextResponse.json({ error: "Este link ha expirado" }, { status: 410 });
    }
  }

  // Fetch items with venta + cliente + saldo data
  const { data: items } = await supabaseAdmin
    .from("hoja_ruta_items")
    .select(`
      id, orden, completado, completado_at,
      ventas (
        id, numero, tipo_comprobante, total, forma_pago, monto_pagado, fecha,
        clientes ( id, nombre, domicilio, localidad, telefono, saldo ),
        venta_items ( descripcion, cantidad, precio_unitario, subtotal )
      )
    `)
    .eq("hoja_ruta_id", hoja.id)
    .order("orden");

  // Fetch caja_movimientos for each venta to know what's already paid
  const ventaIds = (items || []).map((i: any) => i.ventas?.id).filter(Boolean);
  const pagadoPorVenta: Record<string, number> = {};
  if (ventaIds.length > 0) {
    const { data: movs } = await supabaseAdmin
      .from("caja_movimientos")
      .select("referencia_id, monto")
      .in("referencia_id", ventaIds)
      .eq("referencia_tipo", "venta")
      .eq("tipo", "ingreso");
    for (const m of movs || []) {
      pagadoPorVenta[m.referencia_id] = (pagadoPorVenta[m.referencia_id] || 0) + m.monto;
    }
  }

  // Fetch bank accounts for transfer payments
  const { data: cuentasBancarias } = await supabaseAdmin
    .from("cuentas_bancarias")
    .select("id, nombre, alias")
    .order("nombre");

  // Fetch transfer surcharge from tienda_config
  const { data: config } = await supabaseAdmin
    .from("tienda_config")
    .select("recargo_transferencia")
    .limit(1)
    .single();

  return NextResponse.json({
    hoja: {
      id: hoja.id,
      nombre: hoja.nombre,
      fecha: hoja.fecha,
      estado: hoja.estado,
      modo_link: hoja.modo_link,
    },
    items: items || [],
    pagadoPorVenta,
    cuentasBancarias: cuentasBancarias || [],
    recargoTransferencia: config?.recargo_transferencia ?? 0,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = await req.json();

  // Validate token
  const { data: hoja } = await supabaseAdmin
    .from("hoja_ruta")
    .select("id, modo_link, token_fijo, token_temp, token_temp_expira")
    .or(`token_fijo.eq.${token},token_temp.eq.${token}`)
    .single();

  if (!hoja) return NextResponse.json({ error: "Link no válido" }, { status: 404 });
  if (hoja.token_temp === token && hoja.token_temp_expira && new Date(hoja.token_temp_expira) < new Date()) {
    return NextResponse.json({ error: "Link expirado" }, { status: 410 });
  }

  // Mode guards
  if (body.action === "confirmar" && hoja.modo_link === "solo_ver") {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  if (body.action === "cobrar" && hoja.modo_link !== "confirmar_cobrar") {
    return NextResponse.json({ error: "Sin permiso para cobrar" }, { status: 403 });
  }

  const { fecha, hora } = argNow();

  if (body.action === "confirmar") {
    await supabaseAdmin
      .from("hoja_ruta_items")
      .update({ completado: true, completado_at: new Date().toISOString() })
      .eq("id", body.item_id);

    await supabaseAdmin
      .from("ventas")
      .update({ entregado: true, estado: "entregado" })
      .in("id", body.venta_ids);

    // Sync pedidos_tienda
    for (const ventaId of body.venta_ids) {
      const { data: v } = await supabaseAdmin.from("ventas").select("numero").eq("id", ventaId).single();
      if (v?.numero) {
        await supabaseAdmin.from("pedidos_tienda").update({ estado: "entregado" }).eq("numero", v.numero);
      }
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "cobrar") {
    const { venta_ids, cobro, item_id } = body;

    for (const ventaId of venta_ids) {
      const { data: venta } = await supabaseAdmin
        .from("ventas")
        .select("id, numero, total, monto_pagado, cliente_id, forma_pago, estado")
        .eq("id", ventaId)
        .single();
      if (!venta) continue;
      if ((venta as any).estado === "anulada") continue;

      const { data: movs } = await supabaseAdmin
        .from("caja_movimientos")
        .select("monto")
        .eq("referencia_id", ventaId)
        .eq("referencia_tipo", "venta")
        .eq("tipo", "ingreso");
      const yaPagado = (movs || []).reduce((s: number, m: any) => s + m.monto, 0);
      const pendiente = Math.max(0, venta.total - yaPagado);

      if (pendiente <= 0) continue;

      // Build caja entries
      const entries: any[] = [];
      if (cobro.metodo === "Mixto") {
        if ((cobro.efectivo || 0) > 0) {
          entries.push({ fecha, hora, tipo: "ingreso", descripcion: `Cobro entrega #${venta.numero} (Efectivo)`, metodo_pago: "Efectivo", monto: cobro.efectivo, referencia_id: ventaId, referencia_tipo: "venta" });
        }
        if ((cobro.transferencia || 0) > 0) {
          entries.push({ fecha, hora, tipo: "ingreso", descripcion: `Cobro entrega #${venta.numero} (Transferencia)`, metodo_pago: "Transferencia", monto: (cobro.transferencia || 0) + (cobro.surcharge || 0), referencia_id: ventaId, referencia_tipo: "venta", ...(cobro.cuentaBancaria ? { cuenta_bancaria: cobro.cuentaBancaria } : {}) });
        }
      } else if (cobro.metodo === "Cuenta Corriente") {
        // No caja entry — goes to cuenta_corriente
      } else {
        entries.push({ fecha, hora, tipo: "ingreso", descripcion: `Cobro entrega #${venta.numero}${(cobro.surcharge || 0) > 0 ? " (Transf)" : ""}`, metodo_pago: cobro.metodo, monto: pendiente + (cobro.surcharge || 0), referencia_id: ventaId, referencia_tipo: "venta", ...(cobro.cuentaBancaria ? { cuenta_bancaria: cobro.cuentaBancaria } : {}) });
      }
      if (entries.length > 0) await supabaseAdmin.from("caja_movimientos").insert(entries);

      // CC portion
      const ccAmount = cobro.metodo === "Cuenta Corriente" ? pendiente : (cobro.cuentaCorriente || 0);
      if (ccAmount > 0 && venta.cliente_id) {
        const { data: newSaldo } = await supabaseAdmin.rpc("atomic_update_client_saldo", { p_client_id: venta.cliente_id, p_change: ccAmount });
        await supabaseAdmin.from("cuenta_corriente").insert({ cliente_id: venta.cliente_id, fecha, comprobante: `Cobro entrega #${venta.numero}`, descripcion: "Saldo a cuenta corriente", debe: ccAmount, haber: 0, saldo: newSaldo ?? 0, forma_pago: cobro.metodo, venta_id: ventaId });
      }

      // Update venta
      const totalCobradoAhora = cobro.metodo === "Cuenta Corriente" ? 0 : pendiente;
      await supabaseAdmin.from("ventas").update({
        forma_pago: cobro.metodo,
        monto_pagado: yaPagado + totalCobradoAhora,
        entregado: true,
        estado: "entregado",
        ...(cobro.cuentaBancaria ? { cuenta_transferencia_alias: cobro.cuentaBancaria } : {}),
      }).eq("id", ventaId);

      // Sync pedidos_tienda
      if (venta.numero) {
        await supabaseAdmin.from("pedidos_tienda").update({ estado: "entregado" }).eq("numero", venta.numero);
      }
    }

    // Mark item as completed
    await supabaseAdmin
      .from("hoja_ruta_items")
      .update({ completado: true, completado_at: new Date().toISOString() })
      .eq("id", item_id);

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Acción desconocida" }, { status: 400 });
}
