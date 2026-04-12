"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Package, TrendingDown } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/formatters";
import { productSlug } from "@/lib/utils";
import { useCategoriasPermitidas } from "@/hooks/use-categorias-visibles";

interface Producto {
  id: string;
  nombre: string;
  precio: number;
  precio_anterior: number;
  imagen_url: string | null;
  stock: number;
  es_combo?: boolean;
  categorias?: { id: string; nombre: string; restringida?: boolean } | null;
}

export default function OfertasClient() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const { filtrarCategorias } = useCategoriasPermitidas();

  useEffect(() => {
    supabase
      .from("productos")
      .select("id, nombre, precio, precio_anterior, imagen_url, stock, es_combo, categorias(id, nombre, restringida)")
      .eq("activo", true)
      .eq("visibilidad", "visible")
      .gt("precio_anterior", 0)
      .then(({ data }) => {
        // Keep only genuine reductions (current price < previous price)
        const rebajados = ((data as any[]) || []).filter(
          (p) => Number(p.precio) < Number(p.precio_anterior)
        );
        // Sort by discount % descending
        rebajados.sort((a, b) => {
          const pctA = (a.precio_anterior - a.precio) / a.precio_anterior;
          const pctB = (b.precio_anterior - b.precio) / b.precio_anterior;
          return pctB - pctA;
        });
        setProductos(rebajados as Producto[]);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-gray-100 bg-white overflow-hidden animate-pulse">
            <div className="aspect-square bg-gray-100" />
            <div className="p-3 space-y-2">
              <div className="h-3 w-3/4 bg-gray-100 rounded" />
              <div className="h-4 w-1/2 bg-gray-100 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const filtered = productos.filter((p) => {
    const cat = p.categorias;
    if (!cat) return true;
    return filtrarCategorias([cat]).length > 0;
  });

  if (filtered.length === 0) {
    return (
      <div className="text-center py-16">
        <TrendingDown className="mx-auto h-16 w-16 text-gray-200 mb-4" />
        <p className="text-gray-500">No hay ofertas disponibles por el momento.</p>
        <Link href="/productos" className="inline-flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition mt-4">
          Ver todos los productos
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {filtered.map((p) => {
        const pct = Math.round(((p.precio_anterior - p.precio) / p.precio_anterior) * 100);
        const ahorro = p.precio_anterior - p.precio;
        return (
          <Link
            key={p.id}
            href={`/productos/${productSlug(p.nombre, p.id)}`}
            className="group rounded-2xl border border-gray-100 bg-white hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden flex flex-col"
          >
            <div className="relative aspect-square bg-gray-50 overflow-hidden">
              {p.imagen_url ? (
                <Image
                  src={p.imagen_url}
                  alt={p.nombre}
                  fill
                  sizes="(max-width: 768px) 50vw, 25vw"
                  loading="lazy"
                  className="object-contain p-3 group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Package className="w-10 h-10 text-gray-200" />
                </div>
              )}
              <span className="absolute top-2 left-2 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                -{pct}%
              </span>
              {p.stock === 0 && !p.es_combo && (
                <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                  <span className="text-xs font-semibold text-gray-500 bg-white px-2 py-1 rounded-full shadow">Sin stock</span>
                </div>
              )}
            </div>
            <div className="p-3 flex flex-col gap-1 flex-1">
              {p.categorias?.nombre && (
                <span className="text-[10px] text-primary font-medium">{p.categorias.nombre}</span>
              )}
              <p className="text-xs font-medium text-gray-800 line-clamp-2 min-h-[2rem]">{p.nombre}</p>
              <div className="mt-auto pt-1">
                <p className="text-base font-bold text-gray-900">{formatCurrency(p.precio)}</p>
                <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                  <span className="text-[11px] text-gray-400 line-through">{formatCurrency(p.precio_anterior)}</span>
                  <span className="text-[11px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-semibold">
                    Ahorrás {formatCurrency(ahorro)}
                  </span>
                </div>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
