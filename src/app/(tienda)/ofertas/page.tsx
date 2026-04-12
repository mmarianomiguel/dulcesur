import type { Metadata } from "next";
import { TrendingDown } from "lucide-react";
import OfertasClient from "./ofertas-client";
import { createServerSupabase } from "@/lib/supabase-server";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Ofertas",
  description: "Productos con descuento y precios rebajados.",
};

export default async function OfertasPage() {
  const supabase = createServerSupabase();
  const today = new Date().toISOString().split("T")[0];

  const [{ data: prods }, { data: d1 }, { data: d2 }] = await Promise.all([
    supabase
      .from("productos")
      .select("id, nombre, precio, precio_oferta, precio_oferta_hasta, imagen_url, stock, es_combo, categoria_id, subcategoria_id, marca_id, categorias(id, nombre, restringida)")
      .eq("activo", true)
      .eq("visibilidad", "visible")
      .gt("stock", 0)
      .limit(2000),
    supabase.from("descuentos").select("*").eq("activo", true).lte("fecha_inicio", today).is("fecha_fin", null),
    supabase.from("descuentos").select("*").eq("activo", true).lte("fecha_inicio", today).gte("fecha_fin", today),
  ]);

  const allDesc = [...(d1 || []), ...(d2 || [])];
  const allProds = (prods || []) as any[];

  // Recolectar IDs que necesitan presentaciones
  const todosLosIds = allProds.map((p: any) => p.id).slice(0, 500);
  const { data: presData } = await supabase
    .from("presentaciones")
    .select("producto_id, nombre, cantidad, precio")
    .in("producto_id", todosLosIds)
    .order("cantidad");

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
        initialPresentaciones={presData || []}
      />
    </div>
  );
}
