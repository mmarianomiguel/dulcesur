import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ ventaId: string }> }
) {
  try {
    const { ventaId } = await params;
    const body = await req.json();
    const { estado, armador_id, notas, orden_entrega } = body;

    if (!estado) {
      return NextResponse.json({ error: "Estado requerido" }, { status: 400 });
    }

    // Upsert pedido_armado
    const updateData: Record<string, unknown> = {
      venta_id: ventaId,
      estado,
      updated_at: new Date().toISOString(),
    };
    if (armador_id) updateData.armador_id = armador_id;
    if (notas !== undefined) updateData.notas = notas;
    if (orden_entrega !== undefined) updateData.orden_entrega = orden_entrega;

    // Timestamps per state transition
    const now = new Date().toISOString();

    if (estado === "armando") {
      const { data: existing } = await supabase
        .from("pedido_armado")
        .select("inicio_armado_at")
        .eq("venta_id", ventaId)
        .single();
      if (!existing?.inicio_armado_at) {
        updateData.inicio_armado_at = now;
      }
      updateData.fin_armado_at = null;
      updateData.motivo_rechazo = null;
    }

    if (estado === "armado") {
      updateData.fin_armado_at = now;
    }

    if (estado === "listo") {
      updateData.aprobado_at = now;
      if (body.aprobado_por) updateData.aprobado_por = body.aprobado_por;
    }

    // Rejection flow: reset to armando, increment rechazos
    if (estado === "rechazado") {
      const { data: current } = await supabase
        .from("pedido_armado")
        .select("rechazos")
        .eq("venta_id", ventaId)
        .single();

      updateData.estado = "armando";
      updateData.rechazos = (current?.rechazos || 0) + 1;
      updateData.fin_armado_at = null;
      if (body.motivo_rechazo) updateData.motivo_rechazo = body.motivo_rechazo;
    }

    const { data: armado, error } = await supabase
      .from("pedido_armado")
      .upsert(updateData, { onConflict: "venta_id" })
      .select()
      .single();

    if (error) throw error;

    // Send notifications based on state transitions
    if (estado === "armado") {
      // Notify admin that order is ready for review
      const { data: venta } = await supabase
        .from("ventas")
        .select("numero, metodo_entrega, clientes ( nombre )")
        .eq("id", ventaId)
        .single();

      const { data: armador } = armador_id
        ? await supabase.from("equipo").select("nombre").eq("id", armador_id).single()
        : { data: null };

      const clienteNombre = (venta as any)?.clientes?.nombre || "Cliente";
      const armadorNombre = armador?.nombre || "Equipo";
      const metodoEntrega = (venta as any)?.metodo_entrega;
      const despacho = metodoEntrega === "retiro" ? "Retiro" : "Envio";
      let mensaje = `${clienteNombre} (${despacho}) armado por ${armadorNombre}`;
      if (notas) mensaje += `\nNota: ${notas}`;

      await fetch(new URL("/api/notificaciones/enviar", req.url).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: "\u270f\ufe0f Pedido listo para controlar",
          mensaje,
          tipo: "sistema",
          url: "/admin/equipo",
          segmentacion: { tipo: "rol", valor: "vendedor" },
        }),
      }).catch(() => {}); // Don't fail the main request if notification fails
    }

    if (estado === "listo") {
      // For envio orders, assign next available orden_entrega
      const { data: ventaCheck } = await supabase
        .from("ventas")
        .select("metodo_entrega, clientes ( nombre, auth_id )")
        .eq("id", ventaId)
        .single();

      const metodo = (ventaCheck as any)?.metodo_entrega;

      if (metodo && ["envio", "envio_a_domicilio"].includes(metodo)) {
        const { data: maxOrden } = await supabase
          .from("pedido_armado")
          .select("orden_entrega")
          .not("orden_entrega", "is", null)
          .order("orden_entrega", { ascending: false })
          .limit(1)
          .single();

        const nextOrden = (maxOrden?.orden_entrega || 0) + 1;
        await supabase
          .from("pedido_armado")
          .update({ orden_entrega: nextOrden })
          .eq("venta_id", ventaId);
      }

      // Sync venta estado to "armado"
      await supabase
        .from("ventas")
        .update({ estado: "armado" })
        .eq("id", ventaId);

      // For pickup orders, notify the client
      const cliente = (ventaCheck as any)?.clientes;
      if (metodo === "retiro" && cliente?.auth_id) {
        const primerNombre = (cliente.nombre || "").split(" ")[0];
        await fetch(new URL("/api/notificaciones/enviar", req.url).toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            titulo: "Tu pedido está listo",
            mensaje: `¡Hola ${primerNombre}! Tu pedido ya está listo para retirar.`,
            tipo: "pedido",
            segmentacion: { tipo: "cliente", valor: cliente.auth_id },
          }),
        }).catch(() => {});
      }
    }

    return NextResponse.json(armado);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error del servidor" }, { status: 500 });
  }
}
