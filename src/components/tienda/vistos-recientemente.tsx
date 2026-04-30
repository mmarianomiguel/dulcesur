"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Eye, Package } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/formatters";
import { productSlug } from "@/lib/utils";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { useCategoriasPermitidas } from "@/hooks/use-categorias-visibles";

interface ProductoFresh {
  id: string;
  nombre: string;
  precio: number;
  imagen_url: string | null;
  stock: number;
  precio_oferta?: number | null;
  categorias?: { id: string; nombre: string; restringida?: boolean } | null;
}

/**
 * Banda de "Vistos recientemente". Lee IDs del hook (localStorage) y trae
 * datos frescos del backend para mostrar precio/stock actualizado.
 * Filtra categorías restringidas que el cliente no pueda ver.
 */
export function VistosRecientementeBlock({ excludeId }: { excludeId?: string } = {}) {
  const stored = useRecentlyViewed(excludeId);
  const { filtrarCategorias } = useCategoriasPermitidas();
  const [productos, setProductos] = useState<ProductoFresh[]>([]);

  useEffect(() => {
    if (stored.length === 0) {
      setProductos([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const ids = stored.map((p) => p.id);
      const { data } = await supabase
        .from("productos")
        .select("id, nombre, precio, imagen_url, stock, activo, visibilidad, precio_oferta, categorias(id, nombre, restringida)")
        .in("id", ids)
        .eq("activo", true)
        .eq("visibilidad", "visible");
      if (cancelled) return;
      const byId = new Map<string, ProductoFresh>();
      for (const p of (data || []) as any[]) {
        const cat = Array.isArray(p.categorias) ? p.categorias[0] : p.categorias;
        byId.set(p.id, { ...p, categorias: cat });
      }
      // Mantener orden del storage (más recientes primero) y filtrar categorías
      const ordered = ids
        .map((id) => byId.get(id))
        .filter((p): p is ProductoFresh => !!p)
        .filter((p) => {
          if (!p.categorias) return true;
          return filtrarCategorias([p.categorias as any]).length > 0;
        });
      setProductos(ordered);
    })();
    return () => { cancelled = true; };
  }, [stored, filtrarCategorias]);

  if (productos.length === 0) return null;

  return (
    <section className="py-8 md:py-10">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Eye className="w-6 h-6 text-primary" />
            Vistos recientemente
          </h2>
          <div className="w-16 h-1 bg-primary rounded-full mt-2 hidden sm:block" />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
          {productos.slice(0, 6).map((prod) => {
            const precio = prod.precio_oferta && prod.precio_oferta > 0 ? prod.precio_oferta : prod.precio;
            const sinStock = prod.stock <= 0;
            return (
              <Link
                key={prod.id}
                href={`/productos/${productSlug(prod.nombre, prod.id)}`}
                className={`group rounded-2xl border border-gray-200 bg-white hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden flex flex-col ${sinStock ? "opacity-60" : ""}`}
              >
                <div className="relative aspect-square bg-gray-50 overflow-hidden">
                  {prod.imagen_url ? (
                    <Image
                      src={prod.imagen_url}
                      alt={prod.nombre}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 200px"
                      loading="lazy"
                      className="object-contain p-3 group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-10 h-10 text-gray-200" />
                    </div>
                  )}
                  {sinStock && (
                    <span className="absolute top-2 left-2 bg-gray-700 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                      Sin stock
                    </span>
                  )}
                </div>
                <div className="p-2.5 flex flex-col gap-1 flex-1">
                  {prod.categorias?.nombre && (
                    <span className="text-[10px] text-primary font-medium truncate">{prod.categorias.nombre}</span>
                  )}
                  <p className="text-xs font-medium text-gray-800 line-clamp-2 min-h-[2rem]">{prod.nombre}</p>
                  <p className="text-base font-bold text-gray-900 mt-auto">{formatCurrency(precio)}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
