"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { Package, TrendingDown, ChevronLeft, ChevronRight, Minus, Plus, SlidersHorizontal, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/formatters";
import { productSlug, slugify } from "@/lib/utils";
import { showToast } from "@/components/tienda/toast";
import { useCategoriasPermitidas } from "@/hooks/use-categorias-visibles";

const PER_PAGE = 24;

interface Descuento {
  id: string;
  nombre: string;
  porcentaje: number;
  aplica_a: string;
  presentacion: string;
  cantidad_minima: number | null;
  productos_ids: string[] | null;
  categorias_ids: string[] | null;
  subcategorias_ids: string[] | null;
  marcas_ids: string[] | null;
  clientes_ids: string[] | null;
  excluir_combos: boolean;
  productos_excluidos_ids: string[] | null;
  tipo_descuento: string | null;
  precio_fijo: number | null;
}

interface ProductoConDescuento {
  id: string;
  nombre: string;
  precio: number;
  precio_oferta?: number | null;
  precio_oferta_hasta?: string | null;
  imagen_url: string | null;
  stock: number;
  es_combo?: boolean;
  categoria_id: string;
  subcategoria_id?: string | null;
  marca_id?: string | null;
  categorias?: { id: string; nombre: string; restringida?: boolean } | null;
  // calculados
  precioFinal: number;
  descuentoPct: number;
  ahorro: number;
  descuentoId: string;
  descuentoNombre: string;
  esExclusivo: boolean;
  esPorCantidad: boolean;
  esComboProd: boolean;
  presentaciones?: { nombre: string; cantidad: number; precio: number }[];
}

export default function OfertasClient() {
  const [allProductos, setAllProductos] = useState<ProductoConDescuento[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filtroDescuento, setFiltroDescuento] = useState<string>("todos");
  const [descuentosDisponibles, setDescuentosDisponibles] = useState<{ id: string; nombre: string; count: number }[]>([]);
  const [selectedPres, setSelectedPres] = useState<Record<string, number>>({});
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [cartUnits, setCartUnits] = useState<Record<string, number>>({});
  const { filtrarCategorias } = useCategoriasPermitidas();

  // Sync cart
  useEffect(() => {
    function syncCart() {
      try {
        const stored = localStorage.getItem("carrito");
        const carrito = stored ? JSON.parse(stored) : [];
        const map: Record<string, number> = {};
        (Array.isArray(carrito) ? carrito : []).forEach((item: any) => {
          const prodId = item.id.split("_")[0];
          map[prodId] = (map[prodId] || 0) + (item.cantidad || 0) * (item.unidades_por_presentacion || 1);
        });
        setCartUnits(map);
      } catch {}
    }
    syncCart();
    window.addEventListener("cart-updated", syncCart);
    return () => window.removeEventListener("cart-updated", syncCart);
  }, []);

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().split("T")[0];

      let clienteId: string | null = null;
      try {
        const raw = localStorage.getItem("cliente_auth");
        if (raw) { const p = JSON.parse(raw); if (p?.id) clienteId = p.id; }
      } catch {}

      const [{ data: prods }, { data: descuentos }, { data: pres }] = await Promise.all([
        supabase
          .from("productos")
          .select("id, nombre, precio, precio_oferta, precio_oferta_hasta, imagen_url, stock, es_combo, categoria_id, subcategoria_id, marca_id, categorias(id, nombre, restringida)")
          .eq("activo", true)
          .eq("visibilidad", "visible"),
        supabase
          .from("descuentos")
          .select("*")
          .eq("activo", true)
          .lte("fecha_inicio", today)
          .or(`fecha_fin.is.null,fecha_fin.gte.${today}`),
        supabase
          .from("presentaciones")
          .select("producto_id, nombre, cantidad, precio")
          .order("cantidad"),
      ]);

      const allProds = (prods || []) as any[];
      const allDesc = (descuentos || []) as Descuento[];
      const allPres = (pres || []) as any[];

      // Mapa de presentaciones por producto
      const presMap: Record<string, { nombre: string; cantidad: number; precio: number }[]> = {};
      for (const pr of allPres) {
        if (!presMap[pr.producto_id]) presMap[pr.producto_id] = [];
        presMap[pr.producto_id].push({ nombre: pr.nombre, cantidad: pr.cantidad, precio: pr.precio });
      }

      const resultado: ProductoConDescuento[] = [];

      for (const prod of allProds) {
        let mejorPct = 0;
        let precioFinal = prod.precio;
        let descId = "";
        let descNombre = "";
        let esExclusivo = false;
        let esPorCantidad = false;

        // A) precio_oferta vigente
        if (
          prod.precio_oferta && prod.precio_oferta > 0 &&
          prod.precio_oferta < prod.precio &&
          (!prod.precio_oferta_hasta || prod.precio_oferta_hasta >= today)
        ) {
          const pct = Math.round(((prod.precio - prod.precio_oferta) / prod.precio) * 100);
          if (pct > mejorPct) {
            mejorPct = pct;
            precioFinal = prod.precio_oferta;
            descId = "precio_oferta";
            descNombre = "Precio especial";
          }
        }

        // B) Descuentos tabla
        for (const d of allDesc) {
          if (d.clientes_ids && d.clientes_ids.length > 0) {
            if (!clienteId || !d.clientes_ids.includes(clienteId)) continue;
          }
          if (d.cantidad_minima && d.cantidad_minima > 0) continue; // por cantidad no aplica acá
          if (d.excluir_combos && prod.es_combo) continue;
          if (d.productos_excluidos_ids?.includes(prod.id)) continue;

          let aplica = false;
          if (d.aplica_a === "todos") aplica = true;
          else if (d.aplica_a === "productos") aplica = (d.productos_ids || []).includes(prod.id);
          else if (d.aplica_a === "categorias") aplica = (d.categorias_ids || []).includes(prod.categoria_id) || (!!prod.subcategoria_id && (d.categorias_ids || []).includes(prod.subcategoria_id));
          else if (d.aplica_a === "subcategorias") aplica = !!prod.subcategoria_id && (d.subcategorias_ids || []).includes(prod.subcategoria_id);
          else if (d.aplica_a === "marcas") aplica = !!prod.marca_id && (d.marcas_ids || []).includes(prod.marca_id);

          if (!aplica) continue;

          let pct = Number(d.porcentaje);
          if (d.tipo_descuento === "precio_fijo" && d.precio_fijo != null && prod.precio > 0) {
            pct = Math.round(Math.max(0, Math.min(100, ((prod.precio - d.precio_fijo) / prod.precio) * 100)) * 100) / 100;
          }

          if (pct > mejorPct) {
            mejorPct = pct;
            precioFinal = Math.round(prod.precio * (1 - pct / 100));
            descId = d.id;
            descNombre = d.nombre;
            esExclusivo = !!(d.clientes_ids && d.clientes_ids.length > 0);
          }
        }

        // C) Descuentos de presentación (por caja) — para mostrar en el filtro
        // Solo si no tiene ya un descuento general
        let esPorCaja = false;
        if (mejorPct === 0) {
          const prodPres = presMap[prod.id] || [];
          const unitPres = prodPres.find((p) => p.cantidad === 1);
          const boxPres = prodPres.find((p) => p.cantidad > 1);
          if (unitPres && boxPres && unitPres.precio > 0 && boxPres.precio > 0) {
            const expectedPrice = unitPres.precio * boxPres.cantidad;
            if (boxPres.precio < expectedPrice) {
              const savePct = Math.round((1 - boxPres.precio / expectedPrice) * 100);
              if (savePct >= 1) {
                mejorPct = savePct;
                precioFinal = boxPres.precio;
                descId = "por_caja";
                descNombre = `${boxPres.nombre || `Caja x${boxPres.cantidad}`}`;
                esPorCaja = true;
              }
            }
          }
          // Descuentos de tabla por caja (cantidad_minima = 0 pero presentacion = caja)
          for (const d of allDesc) {
            if (d.presentacion !== "caja") continue;
            if (d.cantidad_minima && d.cantidad_minima > 0) continue;
            if (d.clientes_ids && d.clientes_ids.length > 0 && (!clienteId || !d.clientes_ids.includes(clienteId))) continue;
            if (d.excluir_combos && prod.es_combo) continue;
            if (d.productos_excluidos_ids?.includes(prod.id)) continue;

            let aplica = false;
            if (d.aplica_a === "todos") aplica = true;
            else if (d.aplica_a === "productos") aplica = (d.productos_ids || []).includes(prod.id);
            else if (d.aplica_a === "categorias") aplica = (d.categorias_ids || []).includes(prod.categoria_id);
            else if (d.aplica_a === "subcategorias") aplica = !!prod.subcategoria_id && (d.subcategorias_ids || []).includes(prod.subcategoria_id);
            else if (d.aplica_a === "marcas") aplica = !!prod.marca_id && (d.marcas_ids || []).includes(prod.marca_id);
            if (!aplica) continue;

            const pct = Number(d.porcentaje);
            if (pct > mejorPct) {
              mejorPct = pct;
              precioFinal = Math.round(prod.precio * (1 - pct / 100));
              descId = d.id;
              descNombre = d.nombre;
              esPorCaja = true;
            }
          }
        }

        if (mejorPct > 0) {
          resultado.push({
            ...prod,
            precioFinal,
            descuentoPct: Math.round(mejorPct),
            ahorro: prod.precio - precioFinal,
            descuentoId: descId,
            descuentoNombre: descNombre,
            esExclusivo,
            esPorCantidad: false,
            esComboProd: !!prod.es_combo,
            presentaciones: presMap[prod.id] || [],
          });
        }
      }

      resultado.sort((a, b) => b.descuentoPct - a.descuentoPct);

      // Armar lista de descuentos disponibles para filtro
      const descMap: Record<string, { nombre: string; count: number }> = {};
      for (const p of resultado) {
        const key = p.descuentoId;
        const nombre = p.esComboProd ? "Combos" : p.esExclusivo ? "Exclusivos para vos" : p.descuentoNombre;
        if (!descMap[key]) descMap[key] = { nombre, count: 0 };
        descMap[key].count++;
      }
      setDescuentosDisponibles(
        Object.entries(descMap)
          .map(([id, { nombre, count }]) => ({ id, nombre, count }))
          .sort((a, b) => b.count - a.count)
      );

      setAllProductos(resultado);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    let list = allProductos.filter((p) => {
      const cat = p.categorias;
      if (cat && filtrarCategorias([cat]).length === 0) return false;
      if (filtroDescuento !== "todos") {
        if (filtroDescuento === "combos" && !p.esComboProd) return false;
        if (filtroDescuento !== "combos" && p.descuentoId !== filtroDescuento) return false;
      }
      return true;
    });
    return list;
  }, [allProductos, filtroDescuento, filtrarCategorias]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paginated = useMemo(
    () => filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE),
    [filtered, page]
  );

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [filtroDescuento]);

  function getQty(id: string) { return quantities[id] ?? 1; }
  function setQty(id: string, val: number) {
    setQuantities((prev) => ({ ...prev, [id]: Math.max(1, val) }));
  }

  function presLabel(p: { cantidad: number; nombre?: string }): string {
    return p.nombre || (p.cantidad === 1 ? "Unidad" : `Caja x${p.cantidad}`);
  }

  function addToCart(prod: ProductoConDescuento, qty: number) {
    const pres = prod.presentaciones || [];
    const activeIdx = selectedPres[prod.id] ?? 0;
    const activePres = pres.length > 1 ? pres[activeIdx] : null;
    const presUnits = activePres ? Number(activePres.cantidad) : 1;
    const label = activePres ? presLabel(activePres) : (prod.esComboProd ? "Combo" : "Unidad");
    const basePrice = activePres?.precio || prod.precioFinal;
    const cartKey = `${prod.id}_${label}`;
    const availableStock = Math.max(0, prod.stock - (cartUnits[prod.id] || 0));
    const maxForPres = Math.floor(availableStock / presUnits);

    if (maxForPres <= 0) {
      showToast("Ya tenés el máximo disponible", "error");
      return;
    }
    const canAdd = Math.min(qty, maxForPres);

    const stored = localStorage.getItem("carrito");
    let carrito: any[];
    try { carrito = stored ? JSON.parse(stored) : []; if (!Array.isArray(carrito)) carrito = []; } catch { carrito = []; }

    const existing = carrito.find((i: any) => i.id === cartKey);
    if (existing) {
      existing.cantidad += canAdd;
    } else {
      carrito.push({
        id: cartKey,
        nombre: label !== "Unidad" ? `${prod.nombre} - ${label}` : prod.nombre,
        precio: basePrice,
        precio_original: basePrice < prod.precio ? prod.precio : undefined,
        descuento: basePrice < prod.precio ? Math.round((1 - basePrice / prod.precio) * 100) : undefined,
        imagen_url: prod.imagen_url,
        cantidad: canAdd,
        presentacion: label,
        unidades_por_presentacion: presUnits,
      });
    }
    localStorage.setItem("carrito", JSON.stringify(carrito));
    window.dispatchEvent(new Event("cart-updated"));
    showToast(prod.nombre, { subtitle: `${canAdd} agregado al carrito` });
    setQuantities((prev) => ({ ...prev, [prod.id]: 1 }));
  }

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-gray-100 bg-white overflow-hidden animate-pulse">
            <div className="aspect-square bg-gray-100" />
            <div className="p-3 space-y-2">
              <div className="h-3 w-3/4 bg-gray-100 rounded" />
              <div className="h-4 w-1/2 bg-gray-100 rounded" />
              <div className="h-8 bg-gray-100 rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (allProductos.length === 0) {
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
    <div className="space-y-5">

      {/* ─── Filtros de descuento ─── */}
      {descuentosDisponibles.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-gray-500 shrink-0">Filtrar:</span>
          <button
            onClick={() => setFiltroDescuento("todos")}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-full transition-all border ${
              filtroDescuento === "todos"
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
            }`}
          >
            Todas ({allProductos.filter(p => {
              const cat = p.categorias;
              if (cat && filtrarCategorias([cat]).length === 0) return false;
              return true;
            }).length})
          </button>
          {descuentosDisponibles.map((d) => (
            <button
              key={d.id}
              onClick={() => setFiltroDescuento(filtroDescuento === d.id ? "todos" : d.id)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-full transition-all border ${
                filtroDescuento === d.id
                  ? "bg-primary text-white border-primary"
                  : "bg-white text-gray-600 border-gray-200 hover:border-primary/40 hover:text-primary"
              }`}
            >
              {d.nombre}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                filtroDescuento === d.id ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
              }`}>
                {d.count}
              </span>
            </button>
          ))}
          {filtroDescuento !== "todos" && (
            <button
              onClick={() => setFiltroDescuento("todos")}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors ml-1"
            >
              <X className="w-3.5 h-3.5" />
              Limpiar
            </button>
          )}
        </div>
      )}

      {/* Contador */}
      <p className="text-sm text-gray-500">
        {filtered.length} {filtered.length === 1 ? "producto" : "productos"} en oferta
        {filtroDescuento !== "todos" && (
          <span className="text-primary font-medium"> · {descuentosDisponibles.find(d => d.id === filtroDescuento)?.nombre}</span>
        )}
      </p>

      {/* ─── Grid ─── */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400">No hay productos con ese descuento.</p>
          <button onClick={() => setFiltroDescuento("todos")} className="text-primary text-sm font-medium mt-2 hover:underline">
            Ver todas las ofertas
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {paginated.map((p) => {
            const qty = getQty(p.id);
            const pres = p.presentaciones || [];
            const hasPres = pres.length > 1;
            const activeIdx = selectedPres[p.id] ?? 0;
            const activePres = hasPres ? pres[activeIdx] : null;
            const presUnits = activePres ? Number(activePres.cantidad) : 1;
            const availableStock = Math.max(0, p.stock - (cartUnits[p.id] || 0));
            const maxForPres = Math.floor(availableStock / presUnits);
            const canBuy = maxForPres > 0;

            // Precio a mostrar según presentación activa
            const displayPrice = activePres?.precio || p.precioFinal;
            const displayOriginal = p.precio * (activePres ? Number(activePres.cantidad) : 1);
            const displayAhorro = displayOriginal - displayPrice;
            const displayPct = displayAhorro > 0
              ? Math.round((displayAhorro / displayOriginal) * 100)
              : p.descuentoPct;

            return (
              <div
                key={p.id}
                className="group relative bg-white rounded-2xl overflow-hidden border border-gray-100/80 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col"
              >
                {/* Imagen */}
                <Link href={`/productos/${productSlug(p.nombre, p.id)}`} className="relative block">
                  <div className="aspect-square bg-gray-50 overflow-hidden relative">
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
                    {/* Badge descuento */}
                    <span className="absolute top-2 left-2 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                      -{displayPct}%
                    </span>
                    {/* Badge exclusivo */}
                    {p.esExclusivo && (
                      <span className="absolute top-2 right-2 bg-primary text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                        EXCLUSIVO
                      </span>
                    )}
                    {/* Sin stock overlay */}
                    {!canBuy && !p.esComboProd && (
                      <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                        <span className="text-xs font-semibold text-gray-500 bg-white px-2 py-1 rounded-full shadow">Sin stock</span>
                      </div>
                    )}
                    {/* Últimas unidades */}
                    {canBuy && availableStock <= 5 && !p.esComboProd && (
                      <span className="absolute bottom-2 right-2 bg-orange-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md">
                        {availableStock === 1 ? "¡Última!" : `¡Quedan ${availableStock}!`}
                      </span>
                    )}
                  </div>
                </Link>

                {/* Info */}
                <div className="p-3 flex flex-col gap-1.5 flex-1">
                  {p.categorias?.nombre && (
                    <span className="text-[10px] text-primary font-medium">{p.categorias.nombre}</span>
                  )}
                  <Link href={`/productos/${productSlug(p.nombre, p.id)}`}>
                    <p className="text-[13px] font-medium text-gray-800 line-clamp-2 leading-snug hover:text-primary/90 transition-colors">
                      {p.nombre}
                    </p>
                  </Link>

                  {/* Selector de presentaciones */}
                  {hasPres && (
                    <div className="flex flex-wrap gap-1">
                      {[...pres].sort((a, b) => a.cantidad - b.cantidad).map((pr, idx) => {
                        const label = presLabel(pr);
                        const presStock = Math.floor(availableStock / Number(pr.cantidad));
                        const disabled = presStock <= 0;
                        const isActive = activeIdx === idx;
                        return (
                          <button
                            key={idx}
                            disabled={disabled}
                            onClick={() => {
                              setSelectedPres((prev) => ({ ...prev, [p.id]: idx }));
                              const newMax = Math.floor(availableStock / Number(pr.cantidad));
                              if (qty > newMax) setQty(p.id, Math.max(1, newMax));
                            }}
                            className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold transition-all border ${
                              disabled
                                ? "bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed"
                                : isActive
                                ? "bg-gray-900 text-white border-gray-900"
                                : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Precio */}
                  <div className="mt-auto pt-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-base font-bold text-gray-900">{formatCurrency(displayPrice)}</span>
                      {displayAhorro > 0 && (
                        <span className="text-xs text-gray-400 line-through">{formatCurrency(displayOriginal)}</span>
                      )}
                    </div>
                    {displayAhorro > 0 && (
                      <span className="text-[11px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-semibold">
                        Ahorrás {formatCurrency(displayAhorro)}
                      </span>
                    )}
                    {/* Nombre del descuento */}
                    {p.descuentoNombre && p.descuentoNombre !== "Precio especial" && (
                      <p className="text-[10px] text-gray-400 mt-0.5 truncate">{p.descuentoNombre}</p>
                    )}
                  </div>

                  {/* Agregar al carrito */}
                  {canBuy ? (
                    <div className="flex flex-col gap-1.5 mt-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center bg-gray-100 rounded-lg overflow-hidden">
                          <button
                            onClick={() => setQty(p.id, qty - 1)}
                            className="w-7 h-7 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-6 text-center text-xs font-semibold text-gray-800">{qty}</span>
                          <button
                            onClick={() => setQty(p.id, Math.min(qty + 1, maxForPres))}
                            disabled={qty >= maxForPres}
                            className="w-7 h-7 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors disabled:opacity-30"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <span className="text-sm font-bold text-gray-900">{formatCurrency(displayPrice * qty)}</span>
                      </div>
                      <button
                        onClick={() => addToCart(p, qty)}
                        className="w-full bg-primary hover:bg-primary/90 active:scale-[0.98] text-white text-sm py-2 rounded-xl font-semibold transition-all"
                      >
                        Agregar
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center w-full bg-gray-50 text-gray-400 text-xs py-2 rounded-lg font-medium mt-1">
                      Agotado
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Paginado ─── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => { setPage((p) => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            disabled={page === 1}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
            Anterior
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((n) => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
              .reduce<(number | "...")[]>((acc, n, idx, arr) => {
                if (idx > 0 && n - (arr[idx - 1] as number) > 1) acc.push("...");
                acc.push(n);
                return acc;
              }, [])
              .map((n, i) =>
                n === "..." ? (
                  <span key={`e${i}`} className="px-2 text-gray-400 text-sm">…</span>
                ) : (
                  <button
                    key={n}
                    onClick={() => { setPage(n as number); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    className={`w-9 h-9 rounded-xl text-sm font-semibold transition-all ${
                      page === n
                        ? "bg-primary text-white"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {n}
                  </button>
                )
              )}
          </div>
          <button
            onClick={() => { setPage((p) => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            disabled={page === totalPages}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            Siguiente
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
