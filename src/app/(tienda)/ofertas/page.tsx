import type { Metadata } from "next";
import { TrendingDown } from "lucide-react";
import OfertasClient from "./ofertas-client";

export const metadata: Metadata = {
  title: "Ofertas",
  description: "Productos con descuento y precios rebajados.",
};

export default function OfertasPage() {
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
      <OfertasClient />
    </div>
  );
}
