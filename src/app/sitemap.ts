import { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";

const BASE_URL = "https://dulcesur.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const entries: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${BASE_URL}/productos`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/cuenta`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE_URL}/info`, changeFrequency: "monthly", priority: 0.5 },
  ];

  // Add category pages
  const { data: categorias } = await supabase.from("categorias").select("nombre, updated_at");
  if (categorias) {
    for (const cat of categorias) {
      const slug = cat.nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-");
      entries.push({
        url: `${BASE_URL}/productos?categoria=${slug}`,
        lastModified: cat.updated_at ? new Date(cat.updated_at) : new Date(),
        changeFrequency: "daily",
        priority: 0.7,
      });
    }
  }

  // Add individual product pages
  const { data: productos } = await supabase
    .from("productos")
    .select("id, nombre, updated_at")
    .eq("activo", true)
    .eq("visibilidad", "visible");

  if (productos) {
    for (const prod of productos) {
      const slug = `${prod.nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${prod.id}`;
      entries.push({
        url: `${BASE_URL}/productos/${slug}`,
        lastModified: prod.updated_at ? new Date(prod.updated_at) : new Date(),
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }
  }

  // Add info pages
  const { data: infos } = await supabase.from("paginas_info").select("slug, updated_at").eq("activo", true);
  if (infos) {
    for (const info of infos) {
      entries.push({
        url: `${BASE_URL}/info/${info.slug}`,
        lastModified: info.updated_at ? new Date(info.updated_at) : new Date(),
        changeFrequency: "monthly",
        priority: 0.4,
      });
    }
  }

  return entries;
}
