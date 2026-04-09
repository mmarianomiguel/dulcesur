"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { TrendingUp, Package, ArrowLeft, Search, X } from "lucide-react";
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
  fecha_actualizacion: string | null;
  categorias: { id: string; nombre: string; restringida?: boolean } | null;
  marcas: { nombre: string } | null;
}

export default function AumentosRecientesClient({ productos }: { productos: Producto[] }) {
  const { filtrarCategorias } = useCategoriasPermitidas();
  const [search, setSearch] = useState("");

  const visibles = useMemo(() => {
    let filtered = productos.filter((p) => {
      if (!p.categorias) return true;
      return filtrarCategorias([p.categorias]).length > 0;
    });

    if (search.trim()) {
      const terms = search.toLowerCase().trim().split(/\s+/);
      filtered = filtered.filter((p) => {
        const text = `${p.nombre} ${p.categorias?.nombre || ""} ${p.marcas?.nombre || ""}`.toLowerCase();
        return terms.every((t) => text.includes(t));
      });
    }

    return filtered;
  }, [productos, search, filtrarCategorias]);

  const totalCount = productos.filter((p) => {
    if (!p.categorias) return true;
    return filtrarCategorias([p.categorias]).length > 0;
  }).length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-3"
          >
            <ArrowLeft className="w-4 h-4" /> Volver al inicio
          </Link>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Aumentos Recientes</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {totalCount === 0
                  ? "Sin actualizaciones en los últimos 3 días"
                  : `${totalCount} producto${totalCount !== 1 ? "s" : ""} con precio actualizado en los últimos 3 días`}
              </p>
            </div>
          </div>

          {/* Search */}
          {totalCount > 0 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar producto, categoría o marca..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-9 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-300 transition-all"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {visibles.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-30" />
            {search ? (
              <>
                <p className="text-lg font-medium">No se encontraron resultados</p>
                <p className="text-sm mt-1">Probá buscando con otro nombre o categoría.</p>
                <button
                  onClick={() => setSearch("")}
                  className="inline-block mt-6 bg-orange-500 text-white rounded-full px-6 py-2.5 text-sm font-semibold hover:opacity-90 transition"
                >
                  Limpiar búsqueda
                </button>
              </>
            ) : (
              <>
                <p className="text-lg font-medium">No hay aumentos recientes</p>
                <p className="text-sm mt-1">Los precios se mantienen estables en los últimos 3 días.</p>
                <Link
                  href="/productos"
                  className="inline-block mt-6 bg-primary text-white rounded-full px-6 py-2.5 text-sm font-semibold hover:opacity-90 transition"
                >
                  Ver catálogo completo
                </Link>
              </>
            )}
          </div>
        ) : (
          <>
            {search && (
              <p className="text-xs text-gray-500 mb-3">
                {visibles.length} resultado{visibles.length !== 1 ? "s" : ""} para &quot;{search}&quot;
              </p>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {visibles.map((prod) => {
                const pa = Number(prod.precio_anterior);
                const diff = prod.precio - pa;
                const pct = Math.round((diff / pa) * 100);
                const diasAtras = prod.fecha_actualizacion
                  ? Math.floor((Date.now() - new Date(prod.fecha_actualizacion).getTime()) / (1000 * 60 * 60 * 24))
                  : null;

                return (
                  <Link
                    key={prod.id}
                    href={`/productos/${productSlug(prod.nombre, prod.id)}`}
                    className="group rounded-2xl border border-gray-200 bg-white hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 overflow-hidden flex flex-col"
                  >
                    {/* Image */}
                    <div className="relative aspect-square bg-gray-50 overflow-hidden">
                      {prod.imagen_url ? (
                        <Image
                          src={prod.imagen_url}
                          alt={prod.nombre}
                          fill
                          loading="lazy"
                          className="object-contain p-3 group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="w-10 h-10 text-gray-200" />
                        </div>
                      )}
                      <span className="absolute top-2 left-2 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5">
                        <TrendingUp className="w-2.5 h-2.5" /> +{pct}%
                      </span>
                      {diasAtras !== null && (
                        <span className="absolute bottom-2 right-2 bg-black/50 text-white text-[9px] px-1.5 py-0.5 rounded-full">
                          {diasAtras === 0 ? "Hoy" : `Hace ${diasAtras}d`}
                        </span>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-3 flex flex-col gap-1 flex-1">
                      {prod.categorias?.nombre && (
                        <span className="text-[10px] text-orange-500 font-medium">{prod.categorias.nombre}</span>
                      )}
                      <p className="text-xs font-medium text-gray-800 line-clamp-2 min-h-[2rem]">{prod.nombre}</p>

                      {/* Prices */}
                      <div className="mt-auto pt-2 space-y-1">
                        <p className="text-base font-bold text-gray-900">{formatCurrency(prod.precio)}</p>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[11px] text-gray-400 line-through">{formatCurrency(pa)}</span>
                          <span className="text-[11px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-semibold whitespace-nowrap">
                            ↑ {formatCurrency(diff)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
