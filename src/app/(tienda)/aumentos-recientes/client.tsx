"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { TrendingUp, Package, ArrowLeft, Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import { formatCurrency, daysSinceAR } from "@/lib/formatters";
import { productSlug } from "@/lib/utils";
import { useCategoriasPermitidas } from "@/hooks/use-categorias-visibles";

const PAGE_SIZE = 20;

interface Presentacion {
  id: string;
  producto_id: string;
  nombre: string;
  cantidad: number;
  precio: number;
  precio_oferta: number | null;
}

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

type SortKey = "pct_desc" | "monto_desc" | "reciente" | "nombre_asc";

export default function AumentosRecientesClient({
  productos,
  presentacionesMap = {},
}: {
  productos: Producto[];
  presentacionesMap?: Record<string, Presentacion[]>;
}) {
  const { filtrarCategorias } = useCategoriasPermitidas();
  const [search, setSearch] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>("todos");
  const [sort, setSort] = useState<SortKey>("reciente");
  const [page, setPage] = useState(1);
  const [selectedPres, setSelectedPres] = useState<Record<string, number>>({});

  // Categorías únicas para los filtros
  const categorias = useMemo(() => {
    const cats = new Map<string, string>();
    productos.forEach((p) => {
      if (p.categorias?.id && p.categorias?.nombre) {
        cats.set(p.categorias.id, p.categorias.nombre);
      }
    });
    return Array.from(cats.entries()).map(([id, nombre]) => ({ id, nombre }));
  }, [productos]);

  // Filtrado y ordenado
  const visibles = useMemo(() => {
    let filtered = productos.filter((p) => {
      if (!p.categorias) return true;
      return filtrarCategorias([p.categorias]).length > 0;
    });

    if (categoriaFiltro !== "todos") {
      filtered = filtered.filter((p) => p.categorias?.id === categoriaFiltro);
    }

    if (search.trim()) {
      const terms = search.toLowerCase().trim().split(/\s+/);
      filtered = filtered.filter((p) => {
        const text = `${p.nombre} ${p.categorias?.nombre || ""} ${p.marcas?.nombre || ""}`.toLowerCase();
        return terms.every((t) => text.includes(t));
      });
    }

    // Ordenar
    filtered = [...filtered].sort((a, b) => {
      if (sort === "pct_desc") {
        const pctA = (a.precio - a.precio_anterior) / a.precio_anterior;
        const pctB = (b.precio - b.precio_anterior) / b.precio_anterior;
        return pctB - pctA;
      }
      if (sort === "monto_desc") {
        return (b.precio - b.precio_anterior) - (a.precio - a.precio_anterior);
      }
      if (sort === "nombre_asc") {
        return a.nombre.localeCompare(b.nombre);
      }
      // reciente
      return new Date(b.fecha_actualizacion || 0).getTime() - new Date(a.fecha_actualizacion || 0).getTime();
    });

    return filtered;
  }, [productos, search, categoriaFiltro, sort, filtrarCategorias]);

  // Paginado
  const totalPages = Math.ceil(visibles.length / PAGE_SIZE);
  const paginated = visibles.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleFiltro = (id: string) => {
    setCategoriaFiltro(id);
    setPage(1);
  };

  const handleSearch = (val: string) => {
    setSearch(val);
    setPage(1);
  };

  const handleSort = (val: SortKey) => {
    setSort(val);
    setPage(1);
  };

  // Precio activo según presentación seleccionada
  const getPrecioActivo = (prod: Producto) => {
    const pres = presentacionesMap[prod.id];
    if (!pres || pres.length === 0) return { precio: prod.precio, precioAnterior: prod.precio_anterior, label: null };
    const idx = selectedPres[prod.id] ?? 0;
    const p = pres[idx];
    if (!p) return { precio: prod.precio, precioAnterior: prod.precio_anterior, label: null };
    // El precio anterior de la presentación se calcula proporcionalmente
    const ratio = prod.precio_anterior > 0 ? prod.precio / prod.precio_anterior : 1;
    const precioBase = p.precio_oferta && p.precio_oferta > 0 ? p.precio_oferta : p.precio;
    const precioAnteriorPres = Math.round(precioBase / ratio);
    return {
      precio: precioBase,
      precioAnterior: precioAnteriorPres,
      label: p.nombre || (p.cantidad === 1 ? "Unidad" : `Caja x${p.cantidad}`),
    };
  };

  const totalCount = visibles.length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header sticky */}
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
                {productos.length === 0
                  ? "Sin actualizaciones en los últimos 3 días"
                  : `${productos.length} producto${productos.length !== 1 ? "s" : ""} con precio actualizado en los últimos 3 días`}
              </p>
            </div>
          </div>

          {/* Búsqueda */}
          {productos.length > 0 && (
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar producto, categoría o marca..."
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full pl-9 pr-9 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-300 transition-all"
              />
              {search && (
                <button
                  onClick={() => handleSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {/* Filtros por categoría */}
          {categorias.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              <button
                onClick={() => handleFiltro("todos")}
                className={`px-3 py-1.5 rounded-full border text-xs font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                  categoriaFiltro === "todos"
                    ? "bg-orange-500 border-orange-500 text-white"
                    : "bg-white border-gray-200 text-gray-600 hover:border-orange-200"
                }`}
              >
                Todos
              </button>
              {categorias.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => handleFiltro(cat.id)}
                  className={`px-3 py-1.5 rounded-full border text-xs font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                    categoriaFiltro === cat.id
                      ? "bg-orange-500 border-orange-500 text-white"
                      : "bg-white border-gray-200 text-gray-600 hover:border-orange-200"
                  }`}
                >
                  {cat.nombre}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sort row */}
      {productos.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {totalCount} producto{totalCount !== 1 ? "s" : ""}
            {search && ` para "${search}"`}
          </span>
          <select
            value={sort}
            onChange={(e) => handleSort(e.target.value as SortKey)}
            className="text-xs text-gray-700 border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-orange-300"
          >
            <option value="reciente">Más reciente</option>
            <option value="pct_desc">Mayor aumento %</option>
            <option value="monto_desc">Mayor aumento $</option>
            <option value="nombre_asc">Nombre A-Z</option>
          </select>
        </div>
      )}

      {/* Grid */}
      <div className="max-w-7xl mx-auto px-4 pb-6">
        {paginated.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-30" />
            {search || categoriaFiltro !== "todos" ? (
              <>
                <p className="text-lg font-medium">No se encontraron resultados</p>
                <p className="text-sm mt-1">Probá con otros filtros.</p>
                <button
                  onClick={() => { handleSearch(""); handleFiltro("todos"); }}
                  className="inline-block mt-6 bg-orange-500 text-white rounded-full px-6 py-2.5 text-sm font-semibold hover:opacity-90 transition"
                >
                  Limpiar filtros
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {paginated.map((prod) => {
              const pres = presentacionesMap[prod.id] || [];
              const presIdx = selectedPres[prod.id] ?? 0;
              const { precio, precioAnterior } = getPrecioActivo(prod);
              const diff = precio - precioAnterior;
              const pct = precioAnterior > 0 ? Math.round((diff / precioAnterior) * 100) : 0;
              const diasAtras = prod.fecha_actualizacion ? daysSinceAR(prod.fecha_actualizacion) : null;

              return (
                <div key={prod.id} className="group rounded-2xl border border-gray-200 bg-white hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 overflow-hidden flex flex-col">
                  <Link href={`/productos/${productSlug(prod.nombre, prod.id)}`}>
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
                  </Link>

                  <div className="p-3 flex flex-col gap-1 flex-1">
                    {prod.categorias?.nombre && (
                      <span className="text-[10px] text-orange-500 font-medium">{prod.categorias.nombre}</span>
                    )}
                    <Link href={`/productos/${productSlug(prod.nombre, prod.id)}`}>
                      <p className="text-xs font-medium text-gray-800 line-clamp-2 min-h-[2rem] hover:text-primary transition-colors">
                        {prod.nombre}
                      </p>
                    </Link>
                    {prod.marcas?.nombre && (
                      <p className="text-[10px] text-gray-400">{prod.marcas.nombre}</p>
                    )}

                    {/* Presentaciones */}
                    {pres.length > 1 && (
                      <div className="flex gap-1 flex-wrap mt-1">
                        {pres.map((p, idx) => (
                          <button
                            key={p.id}
                            onClick={() => setSelectedPres((prev) => ({ ...prev, [prod.id]: idx }))}
                            className={`text-[9px] px-1.5 py-0.5 rounded-full border transition-all ${
                              presIdx === idx
                                ? "bg-orange-50 border-orange-200 text-orange-700 font-semibold"
                                : "bg-gray-50 border-gray-200 text-gray-500"
                            }`}
                          >
                            {p.nombre || (p.cantidad === 1 ? "Unidad" : `Caja x${p.cantidad}`)}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Precios */}
                    <div className="mt-auto pt-2 space-y-1">
                      <p className="text-base font-bold text-gray-900">{formatCurrency(precio)}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] text-gray-400 line-through">{formatCurrency(precioAnterior)}</span>
                        <span className="text-[11px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-semibold whitespace-nowrap">
                          ↑ {formatCurrency(diff)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Paginado */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-8">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="w-8 h-8 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .reduce<(number | "...")[]>((acc, p, i, arr) => {
                if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("...");
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === "..." ? (
                  <span key={`ellipsis-${i}`} className="text-xs text-gray-400 px-1">...</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p as number)}
                    className={`w-8 h-8 rounded-lg border text-xs font-medium transition-all ${
                      page === p
                        ? "bg-orange-500 border-orange-500 text-white"
                        : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {p}
                  </button>
                )
              )}

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="w-8 h-8 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
