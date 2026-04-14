import { createServerSupabase } from "@/lib/supabase-server";
import HomeClient from "./home-client";

// Revalidate every 60 seconds — keeps content fresh while serving cached HTML
export const revalidate = 60;

export default async function TiendaHomePage() {
  const supabase = createServerSupabase();

  // 1. Fetch blocks + config in parallel
  const [bloquesRes, configRes] = await Promise.all([
    supabase
      .from("pagina_inicio_bloques")
      .select("*")
      .eq("activo", true)
      .order("orden", { ascending: true }),
    supabase
      .from("tienda_config")
      .select("dias_badge_nuevo")
      .limit(1)
      .single(),
  ]);

  const blocks = (bloquesRes.data || []) as any[];
  const diasNuevo: number = configRes.data?.dias_badge_nuevo ?? 7;
  const tipos = blocks.map((b) => b.tipo);

  // 2. Fetch categories and products in parallel based on block types
  const catPromise: Promise<any[]> = tipos.includes("categorias_destacadas")
    ? (async () => {
        const catBlock = blocks.find((b) => b.tipo === "categorias_destacadas");
        const maxCats = catBlock?.config?.max_items || 6;
        const { data: destacadas } = await supabase
          .from("categorias_destacadas")
          .select("id, categorias(id, nombre, imagen_url)");
        if (destacadas && destacadas.length > 0) {
          const seen = new Set<string>();
          return (destacadas as any[])
            .map((d) => d.categorias)
            .filter((cat) => {
              if (!cat || seen.has(cat.id)) return false;
              seen.add(cat.id);
              return true;
            })
            .slice(0, maxCats);
        }
        const { data: cats } = await supabase
          .from("categorias")
          .select("id, nombre, imagen_url")
          .limit(maxCats);
        return cats || [];
      })()
    : Promise.resolve([]);

  const prodPromise: Promise<any[]> = tipos.includes("productos_destacados")
    ? (async () => {
        const prodBlock = blocks.find((b) => b.tipo === "productos_destacados");
        const maxItems = prodBlock?.config?.max_items || 8;
        const orden = prodBlock?.config?.orden || "recientes";
        const baseSelect =
          "id, nombre, precio, imagen_url, activo, stock, es_combo, precio_anterior, fecha_actualizacion, created_at, updated_at, categorias(id, nombre)";

        let prods: any[] | null = null;
        if (orden === "manual" || orden === "recientes") {
          const { data: featured } = await supabase
            .from("productos")
            .select(baseSelect)
            .eq("activo", true)
            .eq("visibilidad", "visible")
            .eq("destacado", true)
            .order("nombre", { ascending: true })
            .limit(maxItems);
          if (featured && featured.length > 0) prods = featured;
        }
        if (!prods && orden === "recien_repuestos") {
          const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          const { data: movs } = await supabase
            .from("stock_movimientos")
            .select("producto_id")
            .in("tipo", ["compra", "ajuste_ingreso"])
            .gt("cantidad_despues", 0)
            .gt("created_at", cutoff);
          const ids = [...new Set((movs || []).map((m: any) => m.producto_id))];
          if (ids.length > 0) {
            const { data: repuestos } = await supabase
              .from("productos")
              .select(baseSelect)
              .eq("activo", true)
              .eq("visibilidad", "visible")
              .gt("stock", 0)
              .in("id", ids)
              .limit(maxItems);
            if (repuestos && repuestos.length > 0) prods = repuestos;
          }
        }
        if (!prods && orden === "mas_vendidos") {
          const cutoff30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
          const { data: ventaMovs } = await supabase
            .from("venta_items")
            .select("producto_id, cantidad, ventas!inner(created_at)")
            .gt("ventas.created_at", cutoff30)
            .limit(5000);
          if (ventaMovs && ventaMovs.length > 0) {
            const totals: Record<string, number> = {};
            for (const item of ventaMovs) {
              totals[item.producto_id] = (totals[item.producto_id] || 0) + Number(item.cantidad);
            }
            const topIds = Object.entries(totals)
              .sort((a, b) => b[1] - a[1])
              .slice(0, maxItems)
              .map(([id]) => id);
            if (topIds.length > 0) {
              const { data: topProds } = await supabase
                .from("productos")
                .select(baseSelect)
                .eq("activo", true)
                .eq("visibilidad", "visible")
                .in("id", topIds);
              if (topProds && topProds.length > 0) {
                prods = topIds
                  .map((id) => topProds.find((p: any) => p.id === id))
                  .filter(Boolean) as any[];
              }
            }
          }
        }
        if (!prods) {
          let query = supabase
            .from("productos")
            .select(baseSelect)
            .eq("activo", true)
            .eq("visibilidad", "visible");
          if (orden === "precio_asc") query = query.order("precio", { ascending: true });
          else if (orden === "precio_desc") query = query.order("precio", { ascending: false });
          else query = query.order("nombre", { ascending: true });
          const { data } = await query.limit(maxItems);
          prods = data;
        }
        return prods || [];
      })()
    : Promise.resolve([]);

  // Leer configuración de los bloques
  const bloqueMasVendidos = blocks.find((b: any) => b.tipo === "mas_vendidos");
  const bloqueNuevos = blocks.find((b: any) => b.tipo === "nuevos_ingresos");
  const bloqueAumentos = blocks.find((b: any) => b.tipo === "aumentos_recientes");
  const bloqueUltimas = blocks.find((b: any) => b.tipo === "ultimas_unidades");

  const diasMasVendidos = bloqueMasVendidos?.config?.dias_atras ?? 30;
  const diasNuevos = bloqueNuevos?.config?.dias_atras ?? 7;
  const diasAumentos = bloqueAumentos?.config?.dias_atras ?? 3;
  const maxNuevos = bloqueNuevos?.config?.max_items ?? 16;
  const maxMasVendidos = bloqueMasVendidos?.config?.max_items ?? 8;
  const maxUltimas = bloqueUltimas?.config?.umbral_stock ?? 5;
  const maxUltimasItems = bloqueUltimas?.config?.max_items ?? 8;
  const maxAumentosHome = bloqueAumentos?.config?.max_items_home ?? 8;

  // Cutoff for aumentos recientes
  const ahoraAR = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));

  const cutoffAumentos = new Date(ahoraAR);
  cutoffAumentos.setDate(cutoffAumentos.getDate() - diasAumentos);
  cutoffAumentos.setHours(0, 0, 0, 0);
  const cutoffStr = cutoffAumentos.toISOString();

  const aumentosPromise = supabase
    .from("productos")
    .select("id, nombre, precio, imagen_url, stock, precio_anterior, fecha_actualizacion, categorias(id, nombre, restringida)")
    .eq("activo", true)
    .eq("visibilidad", "visible")
    .gt("precio_anterior", 0)
    .gt("fecha_actualizacion", cutoffStr)
    .order("fecha_actualizacion", { ascending: false })
    .limit(maxAumentosHome);

  const masVendidosPromise = supabase
    .from("productos")
    .select("id, nombre, precio, imagen_url, stock, es_combo, categorias(id, nombre, restringida), precio_anterior, created_at")
    .eq("activo", true)
    .eq("visibilidad", "visible")
    .gt("stock", 0)
    .order("stock", { ascending: false })
    .limit(maxMasVendidos * 3);

  const ultimasUnidadesPromise = supabase
    .from("productos")
    .select("id, nombre, precio, imagen_url, stock, categorias(id, nombre, restringida)")
    .eq("activo", true)
    .eq("visibilidad", "visible")
    .eq("es_combo", false)
    .gt("stock", 0)
    .lte("stock", maxUltimas)
    .order("stock", { ascending: true })
    .limit(maxUltimasItems);

  // Más vendidos (tabs): top productos por ventas
  const hace30 = new Date(ahoraAR);
  hace30.setDate(hace30.getDate() - diasMasVendidos);

  const hace4dias = new Date(ahoraAR);
  hace4dias.setDate(hace4dias.getDate() - 4);
  hace4dias.setHours(0, 0, 0, 0);

  const haceNuevosDias = new Date(ahoraAR);
  haceNuevosDias.setDate(haceNuevosDias.getDate() - diasNuevos);
  haceNuevosDias.setHours(0, 0, 0, 0);

  const nuevosPromise = supabase
    .from("productos")
    .select("id, nombre, precio, imagen_url, stock, activo, es_combo, created_at, updated_at, categorias(id, nombre)")
    .eq("activo", true)
    .eq("visibilidad", "visible")
    .gt("stock", 0)
    .or(`created_at.gte.${hace4dias.toISOString()},updated_at.gte.${haceNuevosDias.toISOString()}`)
    .order("created_at", { ascending: false })
    .limit(maxNuevos * 2);

  // Grupo 1: queries críticas en paralelo (categorías, productos, aumentos)
  const [categorias, productos, { data: aumentosRaw }, { data: masVendidosData }, { data: ultimasUnidadesData }, { data: nuevosRaw }] = await Promise.all([
    catPromise,
    prodPromise,
    aumentosPromise,
    masVendidosPromise,
    ultimasUnidadesPromise,
    nuevosPromise,
  ]);

  const aumentos = (aumentosRaw || []).filter((p: any) => Number(p.precio) > Number(p.precio_anterior));

  // Nuevos ingresos
  const nuevosIngresos = (nuevosRaw || []).filter((p: any) => {
    const creadoReciente = new Date(p.created_at) >= hace4dias;
    const stockRecuperado = new Date(p.updated_at) >= haceNuevosDias && p.stock > 0;
    return creadoReciente || stockRecuperado;
  }).slice(0, maxNuevos);

  // Grupo 2: presentaciones + top vendidos en paralelo (no bloquean las categorías)
  const presPromise = productos.length > 0
    ? supabase
        .from("presentaciones")
        .select("id, producto_id, nombre, cantidad, precio, precio_oferta, sku")
        .in("producto_id", productos.map((p) => p.id))
        .order("cantidad")
    : Promise.resolve({ data: [] });

  const topVentasResult = supabase
    .from("venta_items")
    .select("producto_id, cantidad")
    .gte("created_at", hace30.toISOString())
    .limit(1000);

  const [{ data: presData }, { data: topVentaItems }] = await Promise.all([
    presPromise,
    topVentasResult,
  ]);

  // Presentaciones productos destacados
  const presMap: Record<string, any[]> = {};
  (presData || []).forEach((p: any) => {
    if (!presMap[p.producto_id]) presMap[p.producto_id] = [];
    presMap[p.producto_id].push(p);
  });

  // Procesar más vendidos (tabs)
  const ventaMap: Record<string, number> = {};
  for (const vi of topVentaItems || []) {
    if (!vi.producto_id) continue;
    ventaMap[vi.producto_id] = (ventaMap[vi.producto_id] || 0) + Number(vi.cantidad);
  }
  const topIds = Object.entries(ventaMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 16)
    .map(([id]) => id);

  let topVendidosProds: any[] = [];
  const topPresMap: Record<string, any[]> = {};
  if (topIds.length > 0) {
    const [{ data: mvData }, { data: topPresData }] = await Promise.all([
      supabase
        .from("productos")
        .select("id, nombre, precio, imagen_url, stock, activo, es_combo, precio_anterior, categorias(id, nombre)")
        .eq("activo", true)
        .eq("visibilidad", "visible")
        .gt("stock", 0)
        .in("id", topIds),
      supabase
        .from("presentaciones")
        .select("id, producto_id, nombre, cantidad, precio, precio_oferta, sku")
        .in("producto_id", topIds)
        .order("cantidad"),
    ]);
    topVendidosProds = topIds
      .map(id => (mvData || []).find((p: any) => p.id === id))
      .filter(Boolean);
    (topPresData || []).forEach((p: any) => {
      if (!topPresMap[p.producto_id]) topPresMap[p.producto_id] = [];
      topPresMap[p.producto_id].push(p);
    });
  }

  return (
    <HomeClient
      initialBloques={blocks}
      initialCategorias={categorias}
      initialProductos={productos}
      initialPresMap={presMap}
      initialDiasNuevo={diasNuevo}
      initialAumentos={aumentos}
      initialMasVendidos={masVendidosData || []}
      initialUltimasUnidades={ultimasUnidadesData || []}
      initialTopVendidos={topVendidosProds}
      initialTopPresMap={topPresMap}
      initialNuevosIngresos={nuevosIngresos}
    />
  );
}
