import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/autocompra
 *
 * Auto-generates purchase orders (pedidos) for all products with stock below minimum.
 * Groups products by their principal supplier and creates draft orders.
 *
 * Auth: requires either a valid Supabase session or x-pull-secret header (for cron).
 *
 * Query params:
 * - dry_run=true: only returns what would be generated, without creating anything
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry_run") === "true";

  // Auth: accept pull secret (for cron) or check supabase session
  const secret = req.headers.get("x-pull-secret");
  const authHeader = req.headers.get("authorization");

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  if (secret !== process.env.PULL_SECRET) {
    // Try session-based auth
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Fetch all active products with their providers
  const { data: productos, error: fetchError } = await supabaseAdmin
    .from("productos")
    .select("id, codigo, nombre, stock, stock_minimo, stock_maximo, costo, producto_proveedores(proveedor_id, precio_proveedor, cantidad_minima_pedido, es_principal, proveedores(nombre))")
    .eq("activo", true);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  // Filter products below minimum and group by principal provider
  const groups: Record<string, {
    proveedor_nombre: string;
    items: {
      producto_id: string;
      codigo: string;
      nombre: string;
      stock: number;
      stock_minimo: number;
      stock_maximo: number;
      faltante: number;
      precio_unitario: number;
      subtotal: number;
    }[];
  }> = {};

  for (const p of (productos as any[]) || []) {
    const stock = p.stock ?? 0;
    const minimo = p.stock_minimo ?? 0;
    const maximo = p.stock_maximo ?? 0;

    // Include products below minimum OR with negative stock
    if (stock >= minimo && stock >= 0) continue;

    const ppList = p.producto_proveedores || [];
    if (ppList.length === 0) continue;

    // Pick principal provider or first
    const sorted = [...ppList].sort((a: any, b: any) => (b.es_principal ? 1 : 0) - (a.es_principal ? 1 : 0));
    const pp = sorted[0];

    const provId = pp.proveedor_id;
    const provName = pp.proveedores?.nombre || "Sin nombre";

    if (!groups[provId]) {
      groups[provId] = { proveedor_nombre: provName, items: [] };
    }

    // Skip duplicates
    if (groups[provId].items.some((i) => i.producto_id === p.id)) continue;

    let faltante: number;
    if (maximo > 0) {
      faltante = Math.max(pp.cantidad_minima_pedido || 1, maximo - stock);
    } else if (stock < 0) {
      faltante = Math.abs(stock);
    } else {
      faltante = Math.max(pp.cantidad_minima_pedido || 1, minimo > 0 ? minimo * 2 - stock : 1);
    }
    const precio = pp.precio_proveedor || p.costo || 0;

    groups[provId].items.push({
      producto_id: p.id,
      codigo: p.codigo || "",
      nombre: p.nombre,
      stock,
      stock_minimo: minimo,
      stock_maximo: maximo,
      faltante,
      precio_unitario: precio,
      subtotal: faltante * precio,
    });
  }

  const proveedorCount = Object.keys(groups).length;
  const totalProductos = Object.values(groups).reduce((a, g) => a + g.items.length, 0);
  const totalEstimado = Object.values(groups).reduce(
    (a, g) => a + g.items.reduce((b, i) => b + i.subtotal, 0),
    0
  );

  // Dry run: return preview
  if (dryRun) {
    return NextResponse.json({
      dry_run: true,
      proveedores: proveedorCount,
      productos: totalProductos,
      total_estimado: totalEstimado,
      detalle: Object.entries(groups).map(([provId, g]) => ({
        proveedor_id: provId,
        proveedor_nombre: g.proveedor_nombre,
        items_count: g.items.length,
        total: g.items.reduce((a, i) => a + i.subtotal, 0),
        items: g.items,
      })),
    });
  }

  // Create pedidos
  const pedidosCreados: string[] = [];
  const fecha = new Date().toISOString().split("T")[0];

  for (const [provId, group] of Object.entries(groups)) {
    const { data: numData } = await supabaseAdmin.rpc("next_numero", { p_tipo: "pedido" });
    const numero = numData || "PED-0000";

    const total = group.items.reduce((a, i) => a + i.subtotal, 0);

    const { data: pedido, error: pedError } = await supabaseAdmin
      .from("pedidos_proveedor")
      .insert({
        numero,
        proveedor_id: provId,
        fecha,
        estado: "Borrador",
        costo_total_estimado: total,
        observacion: "Generado automaticamente por API de autocompra",
      })
      .select("id")
      .single();

    if (pedError || !pedido) continue;

    const rows = group.items.map((item) => ({
      pedido_id: pedido.id,
      producto_id: item.producto_id,
      codigo: item.codigo,
      descripcion: item.nombre,
      cantidad: item.faltante,
      faltante: item.faltante,
      precio_unitario: item.precio_unitario,
      subtotal: item.subtotal,
    }));

    await supabaseAdmin.from("pedido_proveedor_items").insert(rows);
    pedidosCreados.push(numero);
  }

  return NextResponse.json({
    ok: true,
    pedidos_creados: pedidosCreados.length,
    numeros: pedidosCreados,
    proveedores: proveedorCount,
    productos: totalProductos,
    total_estimado: totalEstimado,
  });
}
