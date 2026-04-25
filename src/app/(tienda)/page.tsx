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
  const diasNuevo: number = configRes.data?.dias_badge_nuevo ?? 5;
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
          // Orden: primero por orden_destacado (manual desde admin), después por nombre.
          // nullsFirst: false para que los productos sin orden manual queden al final.
          const { data: featured } = await supabase
            .from("productos")
            .select(baseSelect)
            .eq("activo", true)
            .eq("visibilidad", "visible")
            .eq("destacado", true)
            .order("orden_destacado", { ascending: true, nullsFirst: false })
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
  const diasNuevos = bloqueNuevos?.config?.dias_atras ?? 5;
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

  // Traemos hasta 50 cambios recientes y filtramos en JS solo los aumentos reales (precio > precio_anterior).
  // PostgREST no permite comparar dos columnas directamente, así que el filtro fino se hace después.
  const aumentosPromise = supabase
    .from("productos")
    .select("id, nombre, precio, imagen_url, stock, precio_anterior, fecha_actualizacion, categorias(id, nombre, restringida)")
    .eq("activo", true)
    .eq("visibilidad", "visible")
    .gt("precio_anterior", 0)
    .gt("fecha_actualizacion", cutoffStr)
    .order("fecha_actualizacion", { ascending: false })
    .limit(50);

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

  const haceNuevosDias = new Date(ahoraAR);
  haceNuevosDias.setDate(haceNuevosDias.getDate() - diasNuevos);
  haceNuevosDias.setHours(0, 0, 0, 0);

  const nuevosPromise = (async () => {
    // Paginación EXPLÍCITA del cap default de 1000 (mismo bug que otros lugares).
    // Tomamos también cantidad_antes para distinguir REINGRESOS (de 0 → algo) de cargas continuas.
    const PAGE = 1000;
    const movsAll: { producto_id: string; cantidad_antes: number; cantidad_despues: number; created_at: string }[] = [];
    let from = 0;
    while (true) {
      const { data: chunk } = await supabase
        .from("stock_movimientos")
        .select("producto_id, cantidad_antes, cantidad_despues, created_at")
        .in("tipo", ["compra", "ajuste_ingreso"])
        .gt("cantidad_despues", 0)
        .gt("created_at", haceNuevosDias.toISOString())
        .range(from, from + PAGE - 1);
      const rows = chunk || [];
      movsAll.push(...rows as any[]);
      if (rows.length < PAGE) break;
      from += PAGE;
    }

    // Candidato a reingreso: tuvo al menos un movimiento con cantidad_antes <= 0.
    // Track también la fecha del movimiento más reciente por producto para ordenar después.
    const reingresoCandidate = new Set<string>();
    const allIds = new Set<string>();
    const ultMovPorProd: Record<string, string> = {};
    for (const m of movsAll) {
      allIds.add(m.producto_id);
      if (Number(m.cantidad_antes) <= 0) reingresoCandidate.add(m.producto_id);
      if (!ultMovPorProd[m.producto_id] || m.created_at > ultMovPorProd[m.producto_id]) {
        ultMovPorProd[m.producto_id] = m.created_at;
      }
    }
    const ids = [...allIds];
    if (ids.length === 0) return { data: [], reingresoSet: new Set<string>() };

    // Pre-filtro: solo IDs que sean candidatos válidos (nuevo del catálogo O reingreso) — evita traer
    // los 130+ re-stocks normales y luego cortar arbitrariamente por límite.
    const cutoffMs = haceNuevosDias.getTime();
    // Necesitamos saber el created_at de los productos para distinguir nuevos del catálogo, así que primero
    // traemos solo eso (liviano) y luego filtramos.
    const PAGE_PROD = 1000;
    const allProds: any[] = [];
    let pf = 0;
    while (true) {
      const { data: chunk } = await supabase
        .from("productos")
        .select("id, nombre, precio, imagen_url, stock, activo, es_combo, created_at, updated_at, categorias(id, nombre)")
        .eq("activo", true)
        .eq("visibilidad", "visible")
        .gt("stock", 0)
        .in("id", ids)
        .range(pf, pf + PAGE_PROD - 1);
      const rows = chunk || [];
      allProds.push(...rows);
      if (rows.length < PAGE_PROD) break;
      pf += PAGE_PROD;
    }

    const reingresoSet = new Set<string>();
    const filtered = allProds.filter((p: any) => {
      const createdMs = p.created_at ? new Date(p.created_at).getTime() : 0;
      const esNuevoCatalogo = createdMs >= cutoffMs;
      const esReingresoReal = !esNuevoCatalogo && reingresoCandidate.has(p.id);
      if (esReingresoReal) reingresoSet.add(p.id);
      return esNuevoCatalogo || esReingresoReal;
    });
    // Ordenar por la fecha del movimiento más reciente DESC (los recién comprados primero), no por created_at del producto.
    filtered.sort((a: any, b: any) => (ultMovPorProd[b.id] || "").localeCompare(ultMovPorProd[a.id] || ""));
    return { data: filtered.slice(0, maxNuevos), reingresoSet };
  })();

  // topVentasResult no depende de nada → se arranca junto al grupo crítico
  const topVentasResult = supabase
    .from("venta_items")
    .select("producto_id, cantidad")
    .gte("created_at", hace30.toISOString())
    .limit(1000);

  // presentaciones depende de `productos` → se encadena con prodPromise para
  // arrancar apenas estén los IDs, sin esperar al resto del grupo crítico.
  const presPromise: Promise<{ data: any[] | null }> = prodPromise.then((prods) =>
    prods.length > 0
      ? (supabase
          .from("presentaciones")
          .select("id, producto_id, nombre, cantidad, precio, precio_oferta, sku")
          .in("producto_id", prods.map((p: any) => p.id))
          .order("cantidad") as unknown as Promise<{ data: any[] | null }>)
      : Promise.resolve({ data: [] as any[] })
  );

  // Un único Promise.all: todas las queries arrancan en paralelo.
  const [
    categorias,
    productos,
    { data: aumentosRaw },
    { data: masVendidosData },
    { data: ultimasUnidadesData },
    nuevosResult,
    { data: presData },
    { data: topVentaItems },
  ] = await Promise.all([
    catPromise,
    prodPromise,
    aumentosPromise,
    masVendidosPromise,
    ultimasUnidadesPromise,
    nuevosPromise,
    presPromise,
    topVentasResult,
  ]);
  const nuevosRaw = nuevosResult.data || [];
  const reingresoSet = nuevosResult.reingresoSet || new Set<string>();

  const aumentos = (aumentosRaw || [])
    .filter((p: any) => Number(p.precio) > Number(p.precio_anterior))
    .slice(0, maxAumentosHome);
  // Marcar cada producto con _esReingreso para distinguir badge en el cliente.
  const nuevosIngresos = (nuevosRaw || []).slice(0, maxNuevos).map((p: any) => ({
    ...p,
    _esReingreso: reingresoSet.has(p.id),
  }));

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

  // Presentaciones para "Nuevos ingresos" y "Aumentos Recientes"
  const extraIds = [
    ...new Set([
      ...nuevosIngresos.map((p: any) => p.id),
      ...aumentos.map((p: any) => p.id),
    ]),
  ].filter((id) => !presMap[id] && !topPresMap[id]);

  if (extraIds.length > 0) {
    const { data: extraPresData } = await supabase
      .from("presentaciones")
      .select("id, producto_id, nombre, cantidad, precio, precio_oferta, sku")
      .in("producto_id", extraIds)
      .order("cantidad");
    (extraPresData || []).forEach((p: any) => {
      if (!topPresMap[p.producto_id]) topPresMap[p.producto_id] = [];
      topPresMap[p.producto_id].push(p);
    });
  }

  // Descuentos activos para que las cards muestren precio rebajado + badge.
  const todayStr = new Date().toISOString().split("T")[0];
  const { data: descRows } = await supabase
    .from("descuentos")
    .select("*")
    .eq("activo", true)
    .lte("fecha_inicio", todayStr)
    .or(`fecha_fin.is.null,fecha_fin.gte.${todayStr}`)
    .range(0, 4999);

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
      initialActiveDiscounts={descRows || []}
    />
  );
}
