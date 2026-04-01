import { createServerSupabase } from "@/lib/supabase-server";
import ProductosPage from "./productos-client";
import type { InitialProductosData, Categoria, Subcategoria, Marca, Producto } from "./productos-client";

// Revalidate every 60 seconds — keeps data fresh while allowing SSR cache
export const revalidate = 60;

const PER_PAGE = 12;

export default async function ProductosServerPage() {
  const supabase = createServerSupabase();
  const today = new Date().toISOString().split("T")[0];

  // Fetch all initial data in parallel — same queries as the client, but server-side
  const [catsRes, subsRes, marcasRes, discRes, configRes, prodsCountRes, prodsRes, presRes] = await Promise.all([
    supabase.from("categorias").select("id, nombre, restringida"),
    supabase.from("subcategorias").select("id, nombre, categoria_id"),
    supabase.from("marcas").select("id, nombre"),
    supabase.from("descuentos").select("id, aplica_a, porcentaje, categorias_ids, subcategorias_ids, productos_ids, productos_excluidos_ids, cantidad_minima, presentacion, fecha_fin, fecha_inicio, activo").eq("activo", true).lte("fecha_inicio", today),
    supabase.from("tienda_config").select("dias_ocultar_sin_stock").limit(1).single(),
    supabase.from("productos").select("categoria_id, subcategoria_id, marca_id, stock, updated_at").eq("activo", true).eq("visibilidad", "visible"),
    // First page of products sorted A-Z (default sort)
    supabase.from("productos").select("id, nombre, precio, imagen_url, categoria_id, subcategoria_id, marca_id, stock, created_at, updated_at, es_combo, precio_anterior, fecha_actualizacion, categorias(nombre), marcas(nombre)", { count: "exact" }).eq("activo", true).eq("visibilidad", "visible").order("nombre", { ascending: true }).range(0, PER_PAGE - 1),
    // Presentaciones for first page will be fetched after we have product IDs
    Promise.resolve(null),
  ]);

  const dias = configRes.data?.dias_ocultar_sin_stock ?? 7;

  // Build category/marca counts
  const allProds = prodsCountRes.data || [];
  const cutoff = dias > 0 ? new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString() : null;
  const visibleProds = cutoff ? allProds.filter((p: any) => p.stock > 0 || (p.updated_at && p.updated_at > cutoff)) : allProds;

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

  const initialData: InitialProductosData = {
    productos,
    categorias,
    subcategorias,
    marcas,
    total: prodsRes.count || productos.length,
    presentacionesMap,
    activeDiscounts,
    diasOcultarSinStock: dias,
  };

  return <ProductosPage initialData={initialData} />;
}
