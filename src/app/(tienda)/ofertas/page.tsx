import type { Metadata } from "next";
import { TrendingDown } from "lucide-react";
import OfertasClient from "./ofertas-client";
import { createServerSupabase } from "@/lib/supabase-server";

export const metadata: Metadata = {
  title: "Ofertas",
  description: "Productos con descuento y precios rebajados.",
};

// Sin unstable_cache: los descuentos cambian seguido y la caché stuck era
// causa de mostrar solo 1 oferta cuando había varios descuentos creados.
// El costo de fetch no justifica la complejidad de invalidación.
async function fetchOfertasData() {
  const supabase = createServerSupabase();
  // Usar fecha local Argentina, no UTC, para que los descuentos que vencen "hoy"
  // no se descarten antes de tiempo cuando el server está en otro timezone.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

  const [{ data: prods }, { data: d1 }, { data: d2 }] = await Promise.all([
    supabase
      .from("productos")
      .select("id, nombre, precio, precio_oferta, precio_oferta_hasta, imagen_url, stock, es_combo, categoria_id, subcategoria_id, marca_id, categorias(id, nombre, restringida)")
      .eq("activo", true)
      .eq("visibilidad", "visible")
      .gt("stock", 0)
      .range(0, 4999),
    supabase.from("descuentos").select("*").eq("activo", true).lte("fecha_inicio", today).is("fecha_fin", null),
    supabase.from("descuentos").select("*").eq("activo", true).lte("fecha_inicio", today).gte("fecha_fin", today),
  ]);

  const allDesc = [...(d1 || []), ...(d2 || [])];
  const allProds = (prods || []) as any[];

  // Cargar presentaciones de TODOS los productos — antes era slice(0, 500),
  // lo que impedía detectar descuentos por caja en productos fuera de los primeros 500.
  const todosLosIds = allProds.map((p: any) => p.id);
  let presData: any[] = [];
  if (todosLosIds.length > 0) {
    // Batchear en chunks de 200 para no exceder límites de URL en .in()
    for (let i = 0; i < todosLosIds.length; i += 200) {
      const chunk = todosLosIds.slice(i, i + 200);
      const { data } = await supabase
        .from("presentaciones")
        .select("producto_id, nombre, cantidad, precio")
        .in("producto_id", chunk)
        .order("cantidad");
      if (data) presData.push(...data);
    }
  }

  return { allProds, allDesc, presData };
}

export default async function OfertasPage() {
  const { allProds, allDesc, presData } = await fetchOfertasData();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <TrendingDown className="h-6 w-6 text-green-600" />
          <h1 className="text-2xl font-bold text-gray-900">Ofertas</h1>
        </div>
        <p className="text-sm text-gray-500">Productos con descuentos activos, ordenados por mayor ahorro.</p>
        <div className="w-12 h-0.5 bg-green-500 rounded-full mt-2" />
      </div>
      <OfertasClient
        initialProductos={allProds}
        initialDescuentos={allDesc}
        initialPresentaciones={presData}
      />
    </div>
  );
}
