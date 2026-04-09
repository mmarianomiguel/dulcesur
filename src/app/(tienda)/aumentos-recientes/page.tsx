import { createServerSupabase } from "@/lib/supabase-server";
import AumentosRecientesClient from "./client";

export const revalidate = 60;

export const metadata = {
  title: "Aumentos Recientes",
  description: "Productos que actualizaron su precio en los últimos 3 días.",
};

export default async function AumentosRecientesPage() {
  const supabase = createServerSupabase();
  const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

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

  return <AumentosRecientesClient productos={productos} />;
}
