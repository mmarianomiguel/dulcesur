import { createServerSupabase } from "@/lib/supabase-server";
import { unstable_cache } from "next/cache";
import AumentosRecientesClient from "./client";

export const metadata = {
  title: "Aumentos Recientes",
  description: "Productos que actualizaron su precio en los últimos 3 días.",
};

const fetchAumentosData = unstable_cache(
  async () => {
    const supabase = createServerSupabase();
    const now = new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" })
    );
    now.setDate(now.getDate() - 3);
    now.setHours(0, 0, 0, 0);
    const cutoff = now.toISOString();

    const { data } = await supabase
      .from("productos")
      .select("id, nombre, precio, imagen_url, stock, activo, precio_anterior, fecha_actualizacion, created_at, categorias(id, nombre, restringida), marcas(nombre)")
      .eq("activo", true)
      .eq("visibilidad", "visible")
      .gt("precio_anterior", 0)
      .gt("fecha_actualizacion", cutoff)
      .order("fecha_actualizacion", { ascending: false });

    const productos = (data || [])
      .filter((p: any) => Number(p.precio) > Number(p.precio_anterior))
      .map((p: any) => ({
        ...p,
        categorias: Array.isArray(p.categorias) ? (p.categorias[0] ?? null) : p.categorias,
        marcas: Array.isArray(p.marcas) ? (p.marcas[0] ?? null) : p.marcas,
      }));

    let presentacionesMap: Record<string, any[]> = {};
    if (productos.length > 0) {
      const ids = productos.map((p: any) => p.id);
      const { data: presData } = await supabase
        .from("presentaciones")
        .select("id, producto_id, nombre, cantidad, precio, precio_oferta")
        .in("producto_id", ids)
        .order("cantidad", { ascending: true });
      (presData || []).forEach((p: any) => {
        if (!presentacionesMap[p.producto_id]) presentacionesMap[p.producto_id] = [];
        presentacionesMap[p.producto_id].push(p);
      });
    }

    return { productos, presentacionesMap };
  },
  ["tienda-aumentos-recientes"],
  { tags: ["productos"], revalidate: 300 }
);

export default async function AumentosRecientesPage({
  searchParams,
}: {
  searchParams?: Promise<{ marcas?: string }>;
}) {
  const params = (await searchParams) || {};
  const marcasFiltro = (params.marcas || "")
    .split(",")
    .map((m) => m.trim().toLowerCase())
    .filter(Boolean);

  const { productos: allProductos, presentacionesMap } = await fetchAumentosData();

  const productos = marcasFiltro.length > 0
    ? allProductos.filter((p: any) => {
        const m = (p.marcas?.nombre || "").toLowerCase();
        return marcasFiltro.some((f) => m.includes(f));
      })
    : allProductos;

  return <AumentosRecientesClient productos={productos} presentacionesMap={presentacionesMap} />;
}
