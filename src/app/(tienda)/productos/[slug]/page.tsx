import { createServerSupabase } from "@/lib/supabase-server";
import { notFound } from "next/navigation";
import ProductoClient from "./producto-client";

export const revalidate = 60;

async function resolveProductId(slug: string): Promise<string | null> {
  const supabase = createServerSupabase();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(slug)) return slug;

  const parts = slug.split("-");
  const shortId = parts[parts.length - 1];
  if (/^[0-9a-f]{8}$/i.test(shortId)) {
    const lower = `${shortId}-0000-0000-0000-000000000000`;
    const upper = `${shortId}-ffff-ffff-ffff-ffffffffffff`;
    const { data } = await supabase.from("productos").select("id").gte("id", lower).lte("id", upper).limit(1).single();
    return data?.id || null;
  }
  return null;
}

export default async function ProductoPage({ params }: { params: Promise<{ slug: string }> }) {
  const supabase = createServerSupabase();
  const { slug } = await params;

  const productId = await resolveProductId(slug);
  if (!productId) notFound();

  const today = new Date().toISOString().split("T")[0];

  // Todas las queries en paralelo desde el servidor
  const [
    { data: prod },
    { data: pres },
    { data: discountsRaw },
  ] = await Promise.all([
    supabase
      .from("productos")
      .select("id, nombre, descripcion_detallada, precio, precio_oferta, precio_oferta_hasta, imagen_url, codigo, unidad_medida, stock, categoria_id, subcategoria_id, marca_id, es_combo, updated_at, fecha_actualizacion, created_at, precio_anterior, categorias(nombre, restringida), marcas(nombre)")
      .eq("id", productId)
      .single(),
    supabase
      .from("presentaciones")
      .select("id, producto_id, nombre, cantidad, precio, precio_oferta, sku")
      .eq("producto_id", productId)
      .order("cantidad"),
    supabase
      .from("descuentos")
      .select("*")
      .eq("activo", true)
      .lte("fecha_inicio", today),
  ]);

  if (!prod) notFound();

  const activeDiscounts = (discountsRaw || []).filter((d: any) => !d.fecha_fin || d.fecha_fin >= today);

  // Combo items si es combo
  let comboComponentes: any[] = [];
  if (prod.es_combo) {
    const { data: comboData } = await supabase
      .from("combo_items")
      .select("cantidad, productos!combo_items_producto_id_fkey(id, nombre, stock, precio, imagen_url)")
      .eq("combo_id", productId);
    comboComponentes = (comboData || []).map((d: any) => ({
      producto_id: d.productos?.id || "",
      cantidad: d.cantidad,
      nombre: d.productos?.nombre || "",
      stock: d.productos?.stock ?? 0,
      precio: d.productos?.precio ?? 0,
      imagen_url: d.productos?.imagen_url ?? null,
    }));
  }

  // Productos relacionados en paralelo
  const MAX_RELATED = 8;
  const relSelect = "id, nombre, precio, imagen_url, categoria_id, subcategoria_id, marca_id, stock, created_at, es_combo, precio_anterior, fecha_actualizacion, categorias(nombre), marcas(nombre)";
  const [relByBrand, relBySub, relByCat] = await Promise.all([
    prod.marca_id
      ? supabase.from("productos").select(relSelect).eq("categoria_id", prod.categoria_id).eq("marca_id", prod.marca_id).eq("activo", true).eq("visibilidad", "visible").gt("stock", 0).neq("id", productId).limit(MAX_RELATED)
      : Promise.resolve({ data: [] }),
    prod.subcategoria_id
      ? supabase.from("productos").select(relSelect).eq("subcategoria_id", prod.subcategoria_id).eq("activo", true).eq("visibilidad", "visible").gt("stock", 0).neq("id", productId).limit(MAX_RELATED)
      : Promise.resolve({ data: [] }),
    supabase.from("productos").select(relSelect).eq("categoria_id", prod.categoria_id).eq("activo", true).eq("visibilidad", "visible").gt("stock", 0).neq("id", productId).limit(MAX_RELATED),
  ]);

  // Deduplicar relacionados
  const related: any[] = [];
  const usedIds = new Set<string>([productId]);
  for (const batch of [relByBrand.data, relBySub.data, relByCat.data]) {
    for (const p of batch || []) {
      if (related.length >= MAX_RELATED) break;
      if (!usedIds.has(p.id)) { related.push(p); usedIds.add(p.id); }
    }
  }

  // Presentaciones de relacionados
  const relPresMap: Record<string, any[]> = {};
  if (related.length > 0) {
    const { data: relPres } = await supabase
      .from("presentaciones")
      .select("producto_id, nombre, cantidad, precio, precio_oferta, sku")
      .in("producto_id", related.map((r) => r.id))
      .order("cantidad");
    (relPres || []).forEach((p: any) => {
      if (!relPresMap[p.producto_id]) relPresMap[p.producto_id] = [];
      relPresMap[p.producto_id].push(p);
    });
  }

  return (
    <ProductoClient
      producto={prod as any}
      presentaciones={pres || []}
      comboComponentes={comboComponentes}
      relacionados={related}
      relPresentaciones={relPresMap}
      activeDiscounts={activeDiscounts}
    />
  );
}
