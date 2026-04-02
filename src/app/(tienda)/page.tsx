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

  const [categorias, productos] = await Promise.all([catPromise, prodPromise]);

  // 3. Fetch presentaciones for products (needs product IDs from step 2)
  const presMap: Record<string, any[]> = {};
  if (productos.length > 0) {
    const ids = productos.map((p) => p.id);
    const { data: presData } = await supabase
      .from("presentaciones")
      .select("id, producto_id, nombre, cantidad, precio, precio_oferta, sku")
      .in("producto_id", ids)
      .order("cantidad");
    (presData || []).forEach((p: any) => {
      if (!presMap[p.producto_id]) presMap[p.producto_id] = [];
      presMap[p.producto_id].push(p);
    });
  }

  return (
    <HomeClient
      initialBloques={blocks}
      initialCategorias={categorias}
      initialProductos={productos}
      initialPresMap={presMap}
      initialDiasNuevo={diasNuevo}
    />
  );
}
