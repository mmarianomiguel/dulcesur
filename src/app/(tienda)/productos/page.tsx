import { createServerSupabase } from "@/lib/supabase-server";
import { unstable_cache } from "next/cache";
import ProductosPage from "./productos-client";
import type { InitialProductosData, Categoria, Subcategoria, Marca, Producto } from "./productos-client";

const PER_PAGE = 12;

const fetchProductosData = unstable_cache(async (): Promise<InitialProductosData> => {
  const supabase = createServerSupabase();
  const today = new Date().toISOString().split("T")[0];

  // Helper: fetch all rows with pagination to bypass Supabase max rows limit
  const fetchAllRows = async (query: any) => {
    const PAGE = 1000;
    const allRows: any[] = [];
    let from = 0;
    while (true) {
      const { data } = await query.range(from, from + PAGE - 1);
      if (!data || data.length === 0) break;
      allRows.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return allRows;
  };

  // Fetch all initial data in parallel — same queries as the client, but server-side
  const [catsRes, subsRes, marcasRes, discRes, configRes, prodsCountAll, prodsRes, presRes] = await Promise.all([
    supabase.from("categorias").select("id, nombre, restringida"),
    supabase.from("subcategorias").select("id, nombre, categoria_id"),
    supabase.from("marcas").select("id, nombre"),
    supabase.from("descuentos").select("*").eq("activo", true).lte("fecha_inicio", today),
    supabase.from("tienda_config").select("dias_ocultar_sin_stock").limit(1).single(),
    fetchAllRows(supabase.from("productos").select("categoria_id, subcategoria_id, marca_id, stock, fecha_sin_stock").eq("activo", true).eq("visibilidad", "visible")),
    // First page of products sorted A-Z (default sort)
    supabase.from("productos").select("id, nombre, precio, imagen_url, categoria_id, subcategoria_id, marca_id, stock, created_at, updated_at, es_combo, precio_anterior, fecha_actualizacion, categorias(nombre), marcas(nombre)", { count: "exact" }).eq("activo", true).eq("visibilidad", "visible").order("nombre", { ascending: true }).range(0, PER_PAGE - 1),
    // Presentaciones for first page will be fetched after we have product IDs
    Promise.resolve(null),
  ]);
  const prodsCountRes = { data: prodsCountAll };

  const dias = configRes.data?.dias_ocultar_sin_stock ?? 7;

  // Build category/marca counts
  const allProds = prodsCountRes.data || [];
  const cutoff = dias > 0 ? new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString() : null;
  const visibleProds = cutoff ? allProds.filter((p: any) => p.stock > 0 || (p.fecha_sin_stock && p.fecha_sin_stock > cutoff)) : allProds;

  const catCount: Record<string, number> = {};
  const subCount: Record<string, number> = {};
  const marcaCount: Record<string, number> = {};
  for (const p of visibleProds) {
    if (p.categoria_id) catCount[p.categoria_id] = (catCount[p.categoria_id] || 0) + 1;
    if (p.subcategoria_id) subCount[p.subcategoria_id] = (subCount[p.subcategoria_id] || 0) + 1;
    if (p.marca_id) marcaCount[p.marca_id] = (marcaCount[p.marca_id] || 0) + 1;
  }

  const categorias: Categoria[] = (catsRes.data || []).map((c: any) => ({ ...c, count: catCount[c.id] || 0 }));
  const subcategorias: Subcategoria[] = (subsRes.data || []).map((s: any) => ({ ...s, count: subCount[s.id] || 0 }));
  const marcas: Marca[] = (marcasRes.data || []).map((m: any) => ({ ...m, count: marcaCount[m.id] || 0 }));
  const activeDiscounts = (discRes.data || []).filter((d: any) => !d.fecha_fin || d.fecha_fin >= today);

  // Filter first page products by stock cutoff
  let productos = ((prodsRes.data || []) as unknown as Producto[]);
  if (cutoff) {
    productos = productos.filter((p) => p.stock > 0 || (p.updated_at && p.updated_at > cutoff) || p.es_combo);
  }

  // Exclude restricted categories (no auth context on server, so exclude all restricted)
  const restrictedIds = categorias.filter((c) => c.restringida).map((c) => c.id);
  if (restrictedIds.length > 0) {
    productos = productos.filter((p) => !restrictedIds.includes(p.categoria_id));
  }

  // Fetch presentaciones for first page products
  const prodIds = productos.map((p) => p.id);
  let presentacionesMap: Record<string, { nombre: string; cantidad: number; precio: number }[]> = {};
  if (prodIds.length > 0) {
    const { data: presData } = await supabase.from("presentaciones").select("producto_id, nombre, cantidad, precio").in("producto_id", prodIds).order("cantidad");
    (presData || []).forEach((pr: any) => {
      if (!presentacionesMap[pr.producto_id]) presentacionesMap[pr.producto_id] = [];
      presentacionesMap[pr.producto_id].push({ nombre: pr.nombre, cantidad: pr.cantidad, precio: pr.precio });
    });
  }

  // Re-ingresos: productos viejos del catálogo que volvieron del stock 0 en los últimos 5 días.
  // Mismo período que el badge "Nuevos" del home.
  const diasReingreso = 4;
  const cutoffReingreso = new Date(Date.now() - diasReingreso * 24 * 60 * 60 * 1000).toISOString();
  const cutoffNuevoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const reingresoIds: string[] = [];
  {
    const PAGE_SM = 1000;
    let from = 0;
    const movs: { producto_id: string }[] = [];
    while (true) {
      const { data: chunk } = await supabase
        .from("stock_movimientos")
        .select("producto_id")
        .in("tipo", ["compra", "ajuste_ingreso"])
        .gt("cantidad_despues", 0)
        .lte("cantidad_antes", 0)
        .gt("created_at", cutoffReingreso)
        .range(from, from + PAGE_SM - 1);
      const rows = (chunk || []) as { producto_id: string }[];
      movs.push(...rows);
      if (rows.length < PAGE_SM) break;
      from += PAGE_SM;
    }
    const candidateIds = Array.from(new Set(movs.map((m) => m.producto_id)));
    if (candidateIds.length > 0) {
      // Excluir productos que YA son "nuevos del catálogo" (created_at reciente) — ahí va el badge NUEVO.
      const { data: prodMeta } = await supabase
        .from("productos")
        .select("id, created_at")
        .in("id", candidateIds);
      for (const p of prodMeta || []) {
        const createdMs = (p as any).created_at ? new Date((p as any).created_at).getTime() : 0;
        if (createdMs < cutoffNuevoMs) reingresoIds.push((p as any).id);
      }
    }
  }

  const initialData: InitialProductosData = {
    productos,
    categorias,
    subcategorias,
    marcas,
    total: prodsRes.count || productos.length,
    presentacionesMap,
    activeDiscounts,
    diasOcultarSinStock: dias,
    reingresoIds,
  };

  return initialData;
}, ["tienda-productos"], { tags: ["productos"], revalidate: 300 });

export default async function ProductosServerPage() {
  const initialData = await fetchProductosData();
  return <ProductosPage initialData={initialData} />;
}
