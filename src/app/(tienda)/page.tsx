import { createServerSupabase } from "@/lib/supabase-server";
import { unstable_cache } from "next/cache";
import HomeClient from "./home-client";

const fetchHomeData = unstable_cache(async () => {
  const supabase = createServerSupabase();

  // 1. Fetch blocks + config + programaciones de hero activas en paralelo.
  // Si hay 1: override del hero. Si hay 2+: carrusel.
  const nowIso = new Date().toISOString();
  const [bloquesRes, heroProgRes] = await Promise.all([
    supabase
      .from("pagina_inicio_bloques")
      .select("*")
      .eq("activo", true)
      .order("orden", { ascending: true }),
    supabase
      .from("hero_programaciones")
      .select("titulo, subtitulo, boton_texto, boton_link, boton_secundario_texto, boton_secundario_link, color_inicio, color_fin, marcas, auto_porcentaje, tipo, producto_id, descuento_id, imagen_url, marca_id, categoria_id, mostrar_countdown, fecha_hasta")
      .eq("activo", true)
      .lte("fecha_desde", nowIso)
      .gte("fecha_hasta", nowIso)
      .order("prioridad", { ascending: false })
      .order("fecha_desde", { ascending: true })
      .limit(10),
  ]);

  const blocks = (bloquesRes.data || []) as any[];
  let heroSlides = (heroProgRes.data || []) as any[];

  // ── Enriquecer slides con datos dinámicos por tipo ─────────────────────
  if (heroSlides.length > 0) {
    const sub = (txt: string, vals: Record<string, string>) =>
      (txt || "").replace(/\{([a-z_][a-z0-9_]*)\}/gi, (_, k) => vals[k] ?? `{${k}}`);
    const fillSlide = (s: any, vals: Record<string, string>, extras: Record<string, any> = {}) => ({
      ...s,
      titulo: sub(s.titulo, vals),
      subtitulo: sub(s.subtitulo, vals),
      boton_texto: sub(s.boton_texto, vals),
      boton_link: sub(s.boton_link, vals),
      boton_secundario_texto: sub(s.boton_secundario_texto, vals),
      boton_secundario_link: sub(s.boton_secundario_link, vals),
      ...extras,
    });

    // ─ aumento_marca: % promedio por marca, últimos 3 días
    const slidesAutoPct = heroSlides.filter((s) => s.auto_porcentaje && s.marcas?.length);
    if (slidesAutoPct.length > 0) {
      const hace3 = new Date(); hace3.setDate(hace3.getDate() - 3);
      const { data: prods } = await supabase
        .from("productos")
        .select("precio, precio_anterior, marcas(nombre)")
        .eq("activo", true)
        .gt("precio_anterior", 0)
        .gt("fecha_actualizacion", hace3.toISOString());
      const filtered = (prods || []).filter((p: any) => Number(p.precio) > Number(p.precio_anterior));
      const pctPorMarca = (marcas: string[]): number | null => {
        const lcs = marcas.map((m) => m.toLowerCase());
        const pcts: number[] = [];
        for (const p of filtered) {
          const m = (Array.isArray(p.marcas) ? p.marcas[0]?.nombre : (p.marcas as any)?.nombre) || "";
          if (!lcs.some((f) => m.toLowerCase().includes(f))) continue;
          pcts.push(((Number(p.precio) - Number(p.precio_anterior)) / Number(p.precio_anterior)) * 100);
        }
        if (pcts.length === 0) return null;
        return Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
      };
      heroSlides = heroSlides.map((s) => {
        if (!s.auto_porcentaje || !s.marcas?.length) return s;
        const pct = pctPorMarca(s.marcas);
        return fillSlide(s, { porcentaje: pct === null ? "0" : String(pct) });
      });
    }

    // ─ oferta_descuento: traer descuento (manual) o el top activo (auto)
    const slidesOferta = heroSlides.filter((s) => s.tipo === "oferta_descuento");
    if (slidesOferta.length > 0) {
      const today = new Date().toISOString().split("T")[0];
      const ids = slidesOferta.map((s) => s.descuento_id).filter(Boolean);
      const [manualRes, autoRes] = await Promise.all([
        ids.length > 0
          ? supabase.from("descuentos").select("id, nombre, porcentaje").in("id", ids)
          : Promise.resolve({ data: [] as any[] }),
        // Top descuento activo para los slides en modo auto (descuento_id null)
        slidesOferta.some((s) => !s.descuento_id)
          ? supabase
              .from("descuentos")
              .select("id, nombre, porcentaje")
              .eq("activo", true)
              .lte("fecha_inicio", today)
              .or(`fecha_fin.is.null,fecha_fin.gte.${today}`)
              .order("porcentaje", { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null as any }),
      ]);
      const manualMap: Record<string, any> = {};
      (manualRes.data || []).forEach((d: any) => { manualMap[d.id] = d; });
      const topAuto = autoRes.data;
      heroSlides = heroSlides.map((s) => {
        if (s.tipo !== "oferta_descuento") return s;
        const d = s.descuento_id ? manualMap[s.descuento_id] : topAuto;
        if (!d) return null; // sin descuento → ocultar slide
        return fillSlide(s, {
          nombre_descuento: d.nombre || "Oferta",
          porcentaje: d.porcentaje ? String(d.porcentaje) : "",
        });
      }).filter(Boolean);
    }

    // ─ marca_destacada: resolver nombre de marca para placeholder
    const slidesMarca = heroSlides.filter((s) => s.tipo === "marca_destacada" && s.marca_id);
    if (slidesMarca.length > 0) {
      const ids = slidesMarca.map((s) => s.marca_id);
      const { data: marcas } = await supabase.from("marcas").select("id, nombre").in("id", ids);
      const marcaMap: Record<string, any> = {};
      (marcas || []).forEach((m: any) => { marcaMap[m.id] = m; });
      heroSlides = heroSlides.map((s) => {
        if (s.tipo !== "marca_destacada" || !s.marca_id) return s;
        const m = marcaMap[s.marca_id];
        if (!m) return s;
        return fillSlide(s, { marca: m.nombre });
      });
    }

    // ─ categoria_destacada: resolver nombre y contar productos
    const slidesCat = heroSlides.filter((s) => s.tipo === "categoria_destacada" && s.categoria_id);
    if (slidesCat.length > 0) {
      const ids = slidesCat.map((s) => s.categoria_id);
      const { data: cats } = await supabase.from("categorias").select("id, nombre").in("id", ids);
      const catMap: Record<string, any> = {};
      (cats || []).forEach((c: any) => { catMap[c.id] = c; });
      // Contar productos por categoría
      const counts: Record<string, number> = {};
      for (const id of ids) {
        const { count } = await supabase
          .from("productos")
          .select("id", { count: "exact", head: true })
          .eq("categoria_id", id)
          .eq("activo", true)
          .eq("visibilidad", "visible");
        counts[id] = count || 0;
      }
      heroSlides = heroSlides.map((s) => {
        if (s.tipo !== "categoria_destacada" || !s.categoria_id) return s;
        const c = catMap[s.categoria_id];
        if (!c) return s;
        return fillSlide(s, { categoria: c.nombre, cant_productos: String(counts[s.categoria_id] || 0) });
      });
    }

    // ─ producto_destacado: traer producto y enriquecer con imagen + precios
    const slidesProd = heroSlides.filter((s) => s.tipo === "producto_destacado" && s.producto_id);
    if (slidesProd.length > 0) {
      const ids = slidesProd.map((s) => s.producto_id);
      const { data: prods } = await supabase
        .from("productos")
        .select("id, nombre, precio, precio_anterior, imagen_url, descripcion")
        .in("id", ids);
      const prodMap: Record<string, any> = {};
      (prods || []).forEach((p: any) => { prodMap[p.id] = p; });
      // slugify reusable
      const slug = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      heroSlides = heroSlides.map((s) => {
        if (s.tipo !== "producto_destacado" || !s.producto_id) return s;
        const p = prodMap[s.producto_id];
        if (!p) return null;
        const precioAnterior = Number(p.precio_anterior || 0);
        const precioActual = Number(p.precio);
        const tieneOferta = precioAnterior > 0 && precioAnterior > precioActual;
        const descuentoPct = tieneOferta ? Math.round(((precioAnterior - precioActual) / precioAnterior) * 100) : 0;
        return fillSlide(s, {
          nombre: p.nombre,
          slug: `${slug(p.nombre)}-${p.id}`,
          descripcion: p.descripcion || "",
          precio_actual: String(precioActual),
          precio_anterior: precioAnterior ? String(precioAnterior) : "",
          descuento_pct: descuentoPct ? String(descuentoPct) : "",
        }, {
          producto: {
            id: p.id, nombre: p.nombre, imagen_url: p.imagen_url,
            precio: precioActual, precio_anterior: precioAnterior, descuento_pct: descuentoPct,
            tiene_oferta: tieneOferta,
          },
        });
      }).filter(Boolean);
    }
  }
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
  const bloqueProductosDestacados = blocks.find((b: any) => b.tipo === "productos_destacados");

  // Tabs config (productos_destacados block) — fallback a legacy si existe.
  const diasNuevosTab = bloqueProductosDestacados?.config?.dias_nuevos ?? bloqueNuevos?.config?.dias_atras ?? 5;
  const diasReingresoTab = bloqueProductosDestacados?.config?.dias_reingresos ?? 4;
  const masVendidosPeriodoDefault = bloqueProductosDestacados?.config?.mas_vendidos_periodo_default ?? 30;
  const masVendidosMostrarSelector = bloqueProductosDestacados?.config?.mas_vendidos_mostrar_selector ?? true;

  const diasMasVendidos = bloqueMasVendidos?.config?.dias_atras ?? 30;
  const diasNuevos = diasNuevosTab;
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

  // Más vendidos (tabs): top productos por ventas.
  // Período: usa el default config del bloque productos_destacados (admin), con fallback al legacy mas_vendidos.
  const diasTopVendidos = masVendidosPeriodoDefault ?? diasMasVendidos;
  const hace30 = new Date(ahoraAR);
  hace30.setDate(hace30.getDate() - diasTopVendidos);

  const haceNuevosDias = new Date(ahoraAR);
  haceNuevosDias.setDate(haceNuevosDias.getDate() - diasNuevos);
  haceNuevosDias.setHours(0, 0, 0, 0);
  // Reingresos: configurable desde el bloque productos_destacados (default 4).
  const haceReingresoDias = new Date(ahoraAR);
  haceReingresoDias.setDate(haceReingresoDias.getDate() - diasReingresoTab);
  haceReingresoDias.setHours(0, 0, 0, 0);
  const cutoffReingresoMs = haceReingresoDias.getTime();

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

    // SEPARAR estrictamente:
    // - "Nuevos": producto creado dentro del período (totalmente nuevo del catálogo). Dura `diasNuevos` (5).
    // - "De vuelta": producto creado ANTES del período pero con cantidad_antes <= 0 en movimiento reciente. Dura `diasReingresoHome` (4).
    const nuevosOnly: any[] = [];
    const reingresosOnly: any[] = [];
    for (const p of allProds) {
      const createdMs = p.created_at ? new Date(p.created_at).getTime() : 0;
      if (createdMs >= cutoffMs) {
        nuevosOnly.push(p);
      } else if (reingresoCandidate.has(p.id)) {
        // Solo cuenta como reingreso si el último movimiento es DENTRO del período de reingresos (más corto que nuevos).
        const ultMs = ultMovPorProd[p.id] ? new Date(ultMovPorProd[p.id]).getTime() : 0;
        if (ultMs >= cutoffReingresoMs) reingresosOnly.push(p);
      }
    }
    // Ordenar ambos por fecha del movimiento más reciente DESC.
    const sortByMov = (a: any, b: any) => (ultMovPorProd[b.id] || "").localeCompare(ultMovPorProd[a.id] || "");
    nuevosOnly.sort(sortByMov);
    reingresosOnly.sort(sortByMov);
    return {
      data: nuevosOnly.slice(0, maxNuevos),
      reingresos: reingresosOnly.slice(0, maxNuevos),
    };
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
  const reingresosRaw = nuevosResult.reingresos || [];

  const aumentos = (aumentosRaw || [])
    .filter((p: any) => Number(p.precio) > Number(p.precio_anterior))
    .slice(0, maxAumentosHome);
  // Listas separadas para cada tab.
  const nuevosIngresos = nuevosRaw.slice(0, maxNuevos);
  const reingresos = reingresosRaw.slice(0, maxNuevos);

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

  // Descuentos activos para que las cards muestren precio rebajado + badge + tab Ofertas.
  const todayStr = new Date().toISOString().split("T")[0];
  const { data: descRows } = await supabase
    .from("descuentos")
    .select("*")
    .eq("activo", true)
    .lte("fecha_inicio", todayStr)
    .or(`fecha_fin.is.null,fecha_fin.gte.${todayStr}`)
    .range(0, 4999);

  // Cargar productos del tab "Ofertas": cualquier producto con descuento activo aplicable.
  // Se calcula a partir de los IDs explícitos en descuentos.productos_ids o "todos"/categorias/marcas.
  const productosOferta: any[] = [];
  {
    const idsExplicitos = new Set<string>();
    const aplicaTodos = (descRows || []).some((d: any) => d.aplica_a === "todos" && (!d.clientes_ids || d.clientes_ids.length === 0));
    const catsOferta = new Set<string>();
    const subsOferta = new Set<string>();
    const marcasOferta = new Set<string>();
    for (const d of descRows || []) {
      if (d.clientes_ids && d.clientes_ids.length > 0) continue;
      if (d.aplica_a === "productos") (d.productos_ids || []).forEach((id: string) => idsExplicitos.add(id));
      else if (d.aplica_a === "categorias") (d.categorias_ids || []).forEach((id: string) => catsOferta.add(id));
      else if (d.aplica_a === "subcategorias") (d.subcategorias_ids || []).forEach((id: string) => subsOferta.add(id));
      else if (d.aplica_a === "marcas") (d.marcas_ids || []).forEach((id: string) => marcasOferta.add(id));
    }
    // Si hay descuento "todos", traemos un sample amplio y filtramos en cliente. Si no, solo IDs específicos.
    if (aplicaTodos || catsOferta.size > 0 || subsOferta.size > 0 || marcasOferta.size > 0) {
      // Trae todos los activos visibles con stock — el cliente filtra por descuento aplicable.
      const { data } = await supabase
        .from("productos")
        .select("id, nombre, precio, imagen_url, stock, activo, es_combo, precio_anterior, destacado, categoria_id, subcategoria_id, marca_id, categorias(id, nombre)")
        .eq("activo", true).eq("visibilidad", "visible").gt("stock", 0)
        .range(0, 999);
      productosOferta.push(...(data || []));
    } else if (idsExplicitos.size > 0) {
      const { data } = await supabase
        .from("productos")
        .select("id, nombre, precio, imagen_url, stock, activo, es_combo, precio_anterior, destacado, categoria_id, subcategoria_id, marca_id, categorias(id, nombre)")
        .eq("activo", true).eq("visibilidad", "visible").gt("stock", 0)
        .in("id", [...idsExplicitos])
        .range(0, 999);
      productosOferta.push(...(data || []));
    }
  }

  // Presentaciones para "Nuevos ingresos", "Reingresos", "Aumentos Recientes" y "Ofertas".
  const extraIds = [
    ...new Set([
      ...nuevosIngresos.map((p: any) => p.id),
      ...reingresos.map((p: any) => p.id),
      ...aumentos.map((p: any) => p.id),
      ...productosOferta.map((p: any) => p.id),
    ]),
  ].filter((id) => !presMap[id] && !topPresMap[id]);

  if (extraIds.length > 0) {
    // Chunkear para evitar URL too long con muchos IDs.
    const CHUNK = 100;
    for (let i = 0; i < extraIds.length; i += CHUNK) {
      const chunk = extraIds.slice(i, i + CHUNK);
      const { data: extraPresData } = await supabase
        .from("presentaciones")
        .select("id, producto_id, nombre, cantidad, precio, precio_oferta, sku")
        .in("producto_id", chunk)
        .order("cantidad");
      (extraPresData || []).forEach((p: any) => {
        if (!topPresMap[p.producto_id]) topPresMap[p.producto_id] = [];
        topPresMap[p.producto_id].push(p);
      });
    }
  }

  return {
    blocks,
    categorias,
    productos,
    presMap,
    aumentos,
    masVendidosData: masVendidosData || [],
    ultimasUnidadesData: ultimasUnidadesData || [],
    topVendidosProds,
    topPresMap,
    nuevosIngresos,
    reingresos,
    productosOferta,
    descRows: descRows || [],
    heroSlides,
  };
}, ["tienda-home"], { tags: ["productos"], revalidate: 300 });

export default async function TiendaHomePage() {
  const data = await fetchHomeData();
  return (
    <HomeClient
      initialBloques={data.blocks}
      initialCategorias={data.categorias}
      initialProductos={data.productos}
      initialPresMap={data.presMap}
      initialAumentos={data.aumentos}
      initialMasVendidos={data.masVendidosData}
      initialUltimasUnidades={data.ultimasUnidadesData}
      initialTopVendidos={data.topVendidosProds}
      initialTopPresMap={data.topPresMap}
      initialNuevosIngresos={data.nuevosIngresos}
      initialReingresos={data.reingresos}
      initialOfertas={data.productosOferta}
      initialActiveDiscounts={data.descRows}
      initialHeroSlides={data.heroSlides}
    />
  );
}
