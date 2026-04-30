"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { formatCurrency, daysSinceAR } from "@/lib/formatters";
import { slugify, productSlug } from "@/lib/utils";
import { useCategoriasPermitidas } from "@/hooks/use-categorias-visibles";
import { addRecentlyViewed } from "@/hooks/use-recently-viewed";
import { VistosRecientementeBlock } from "@/components/tienda/vistos-recientemente";
import {
  Package,
  Minus,
  Plus,
  ChevronRight,
  ChevronLeft,
  Layers,
  Box,
  Tag,
  Share2,
  Link2,
  X,
} from "lucide-react";
import { showToast } from "@/components/tienda/toast";

interface Producto {
  id: string;
  nombre: string;
  descripcion_detallada?: string | null;
  precio: number;
  imagen_url: string | null;
  codigo: string;
  unidad_medida: string;
  stock: number;
  categoria_id: string;
  subcategoria_id: string | null;
  marca_id: string | null;
  es_combo?: boolean;
  categorias: { nombre: string } | null;
  marcas: { nombre: string } | null;
  updated_at?: string;
  fecha_actualizacion?: string;
  created_at?: string;
}

interface ComboComponente {
  producto_id: string;
  cantidad: number;
  nombre: string;
  stock: number;
  precio: number;
  imagen_url: string | null;
}

interface Presentacion {
  id: string;
  producto_id: string;
  nombre: string;
  cantidad: number;
  precio: number;
  sku: string;
}

interface ProductoClientProps {
  producto: any;
  presentaciones: any[];
  comboComponentes: any[];
  relacionados: any[];
  relPresentaciones: Record<string, any[]>;
  activeDiscounts: any[];
  reingresoIds?: string[];
}

export default function ProductoClient({
  producto: initialProducto,
  presentaciones: initialPresentaciones,
  comboComponentes: initialComboComponentes,
  relacionados: initialRelacionados,
  relPresentaciones: initialRelPresentaciones,
  activeDiscounts: initialDiscounts,
  reingresoIds = [],
}: ProductoClientProps) {
  const reingresoSet = useMemo(() => new Set<string>(reingresoIds), [reingresoIds]);
  const [producto, setProducto] = useState<Producto | null>(initialProducto);
  const [presentaciones, setPresentaciones] = useState<Presentacion[]>(initialPresentaciones);
  const [selectedPresIdx, setSelectedPresIdx] = useState(() => {
    if (initialPresentaciones.length === 0) return 0;
    const hasMedio = initialPresentaciones.some((p: any) => p.cantidad <= 0.5 || (p.nombre && p.nombre.toLowerCase().includes("medio")));
    const unitIdx = hasMedio ? initialPresentaciones.findIndex((p: any) => p.cantidad === 1) : -1;
    return unitIdx >= 0 ? unitIdx : 0;
  });
  const [cantidad, setCantidad] = useState(1);
  // Visual feedback al agregar al carrito.
  const [justAdded, setJustAdded] = useState(false);
  const justAddedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [relJustAdded, setRelJustAdded] = useState<Record<string, boolean>>({});
  const relJustAddedTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [relacionados, setRelacionados] = useState<Producto[]>(initialRelacionados);
  const [relPresentaciones, setRelPresentaciones] = useState<Record<string, Presentacion[]>>(initialRelPresentaciones);
  const [relSelectedPres, setRelSelectedPres] = useState<Record<string, number>>({});
  const [relQty, setRelQty] = useState<Record<string, number>>({});
  const [relScroll, setRelScroll] = useState(0);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [comboComponentes, setComboComponentes] = useState<ComboComponente[]>(initialComboComponentes);
  const [comboOpen, setComboOpen] = useState(false);
  const [cartQtys, setCartQtys] = useState<Record<string, number>>({});
  const [activeDiscounts, setActiveDiscounts] = useState<any[]>(initialDiscounts);
  const [tiendaClienteId, setTiendaClienteId] = useState<string | null>(null);
  const [clienteLoading, setClienteLoading] = useState(true);
  const [restricted, setRestricted] = useState(false);
  const [sugeridos, setSugeridos] = useState<{ id: string; nombre: string; precio: number; imagen_url: string | null }[]>([]);
  const { permitidas, loaded: permisosLoaded } = useCategoriasPermitidas();

  // Resolve client auth from localStorage
  useEffect(() => {
    (async () => {
      try {
        const raw = localStorage.getItem("cliente_auth");
        if (raw) {
          const auth = JSON.parse(raw);
          if (auth?.id) {
            const { data: authData } = await supabase.from("clientes_auth").select("cliente_id").eq("id", auth.id).single();
            if (authData?.cliente_id) {
              setTiendaClienteId(authData.cliente_id);
            }
          }
        }
      } catch { /* no auth */ }
      finally { setClienteLoading(false); }
    })();
  }, []);

  // Track recently viewed + set title
  useEffect(() => {
    if (producto) {
      addRecentlyViewed({ id: producto.id, nombre: producto.nombre, precio: producto.precio, imagen_url: producto.imagen_url });
      document.title = `${producto.nombre} | Dulcesur`;
    }
  }, [producto]);

  // Fetch suggestions when product not found
  useEffect(() => {
    if (producto && !restricted) return;
    supabase
      .from("productos")
      .select("id, nombre, precio, imagen_url")
      .eq("activo", true)
      .eq("visibilidad", "visible")
      .gt("stock", 0)
      .order("created_at", { ascending: false })
      .limit(4)
      .then(({ data }) => { if (data) setSugeridos(data); });
  }, [producto, restricted]);

  // Sync cart quantities — track total UNITS per product (across all presentations)
  const [cartUnitsByProduct, setCartUnitsByProduct] = useState<Record<string, number>>({});
  useEffect(() => {
    function syncCart() {
      const stored = localStorage.getItem("carrito");
      let carrito: any[];
      try { const _p = stored ? JSON.parse(stored) : []; carrito = Array.isArray(_p) ? _p : []; } catch { carrito = []; }
      const map: Record<string, number> = {};
      const unitsMap: Record<string, number> = {};
      carrito.forEach((item: any) => {
        map[item.id] = (map[item.id] || 0) + (item.cantidad || 0);
        // Extract product ID from cart key (format: "productId_presLabel" or just "productId")
        const productId = (item.id || "").includes("_") ? item.id.split("_")[0] : item.id;
        const totalUnits = (item.cantidad || 0) * (item.unidades_por_presentacion || 1);
        unitsMap[productId] = (unitsMap[productId] || 0) + totalUnits;
      });
      setCartQtys(map);
      setCartUnitsByProduct(unitsMap);
    }
    syncCart();
    window.addEventListener("cart-updated", syncCart);
    return () => window.removeEventListener("cart-updated", syncCart);
  }, []);

  function getProductDiscount(prod: Producto, presLabel?: string | null, qty?: number): number {
    let best = 0;
    const effectivePres = presLabel ?? "Unidad";
    const isBox = effectivePres !== "Unidad" && !effectivePres.startsWith("Unidad");
    const isUnit = !isBox;
    for (const d of activeDiscounts) {
      if (d.productos_excluidos_ids?.length > 0 && d.productos_excluidos_ids.includes(prod.id)) continue;
      if (d.clientes_ids?.length > 0 && (!tiendaClienteId || !d.clientes_ids.includes(tiendaClienteId))) continue;
      if (d.excluir_combos && (prod as any).es_combo) continue;
      if (d.cantidad_minima && d.cantidad_minima > 0) {
        if (qty == null || qty < d.cantidad_minima) continue;
      }
      if (d.presentacion === "unidad" && isBox) continue;
      if (d.presentacion === "caja" && isUnit) continue;
      let effectivePercent = Number(d.porcentaje);
      if (d.tipo_descuento === "precio_fijo" && d.precio_fijo != null && prod.precio > 0) {
        effectivePercent = Math.max(0, Math.min(100, ((prod.precio - d.precio_fijo) / prod.precio) * 100));
      }
      if (d.aplica_a === "todos") {
        best = Math.max(best, effectivePercent);
      } else if (d.aplica_a === "categorias") {
        const ids: string[] = d.categorias_ids || [];
        if (ids.includes(prod.categoria_id) || (prod.subcategoria_id && ids.includes(prod.subcategoria_id))) {
          best = Math.max(best, effectivePercent);
        }
      } else if (d.aplica_a === "subcategorias") {
        const subIds: string[] = d.subcategorias_ids || [];
        if (prod.subcategoria_id && subIds.includes(prod.subcategoria_id)) {
          best = Math.max(best, effectivePercent);
        }
      } else if (d.aplica_a === "productos") {
        const ids: string[] = d.productos_ids || [];
        if (ids.includes(prod.id)) {
          best = Math.max(best, effectivePercent);
        }
      } else if (d.aplica_a === "marcas") {
        const mIds: string[] = d.marcas_ids || [];
        if ((prod as any).marca_id && mIds.includes((prod as any).marca_id)) {
          best = Math.max(best, effectivePercent);
        }
      }
    }
    return best;
  }

  const currentPres = presentaciones[selectedPresIdx];
  const currentPrice = (() => {
    if (!currentPres) return producto?.precio ?? 0;
    // Presentation has its own price set
    if (currentPres.precio > 0) {
      // If presentation price equals base product price and qty > 1, it's price-per-unit → multiply
      if (currentPres.cantidad > 1 && producto && currentPres.precio === producto.precio) {
        return currentPres.precio * currentPres.cantidad;
      }
      return currentPres.precio;
    }
    // No presentation price → derive from base product price
    return (producto?.precio ?? 0) * Math.max(1, currentPres.cantidad);
  })();
  const presQty = currentPres ? Number(currentPres.cantidad) : 1;

  function presLabelFn(p: { cantidad: number; nombre?: string }): string {
    return p.nombre || (p.cantidad === 1 ? "Unidad" : `Caja x${p.cantidad}`);
  }
  function presLabelLong(p: { cantidad: number; nombre?: string }): string {
    if (p.nombre) return p.cantidad !== 1 ? `${p.nombre} (${p.cantidad} unidades)` : p.nombre;
    return p.cantidad === 1 ? "Unidad" : `Caja (${p.cantidad} unidades)`;
  }

  const currentLabel = currentPres ? presLabelLong(currentPres) : "Unidad";

  const currentPresLabel = currentPres ? presLabelFn(currentPres) : "Unidad";
  const currentDiscount = producto ? getProductDiscount(producto, currentPresLabel, cantidad) : 0;
  const discountedPrice = currentDiscount > 0 ? Math.round(currentPrice * (1 - currentDiscount / 100)) : currentPrice;
  const savings = currentPrice - discountedPrice;

  // Check if there's a volume discount available that requires more qty
  const volumeDiscountHint = producto ? (() => {
    for (const d of activeDiscounts) {
      if (!d.cantidad_minima || d.cantidad_minima <= 0) continue;
      if (d.clientes_ids?.length > 0 && (!tiendaClienteId || !d.clientes_ids.includes(tiendaClienteId))) continue;
      if (cantidad >= d.cantidad_minima) continue; // Already getting it
      // Check if this discount applies to this product
      const applies = d.aplica_a === "todos" ||
        (d.aplica_a === "productos" && (d.productos_ids || []).includes(producto.id)) ||
        (d.aplica_a === "categorias" && ((d.categorias_ids || []).includes(producto.categoria_id) || (d.categorias_ids || []).includes(producto.subcategoria_id))) ||
        (d.aplica_a === "subcategorias" && producto.subcategoria_id && (d.subcategorias_ids || []).includes(producto.subcategoria_id));
      if (!applies) continue;
      // Check presentation
      if (d.presentacion === "unidad" && currentPresLabel !== "Unidad") continue;
      if (d.presentacion === "caja" && currentPresLabel === "Unidad") continue;
      const presType = d.presentacion === "caja" ? "cajas" : d.presentacion === "unidad" ? "unidades" : (currentPresLabel !== "Unidad" ? "cajas" : "unidades");
      return { minQty: d.cantidad_minima, porcentaje: d.porcentaje, nombre: d.nombre, presType };
    }
    return null;
  })() : null;

  // Check if there's a box-only or volume discount hint (programmed OR implicit from price)
  const boxOnlyDiscount = producto ? (() => {
    const unitDisc = getProductDiscount(producto, "Unidad", cantidad);
    const boxPres = presentaciones.find((p) => p.cantidad > 1);
    if (!boxPres) return 0;
    const boxLabel = presLabelFn(boxPres);
    const boxDisc = getProductDiscount(producto, boxLabel, cantidad);
    if (boxDisc > 0 && unitDisc === 0) return boxDisc;
    // Implicit discount: box price < unit price × quantity
    const unitPres = presentaciones.find((p) => p.cantidad === 1);
    if (unitPres && unitPres.precio && boxPres.precio) {
      const expectedPrice = unitPres.precio * boxPres.cantidad;
      if (boxPres.precio < expectedPrice) {
        return Math.round((1 - boxPres.precio / expectedPrice) * 100);
      }
    }
    return 0;
  })() : 0;
  const boxDiscountLabel = producto ? (() => {
    const boxPres = presentaciones.find((p) => p.cantidad > 1);
    if (!boxPres) return "caja";
    return boxPres.nombre || `Caja x${boxPres.cantidad}`;
  })() : "caja";

  // Max qty based on stock and presentation, minus what's already in cart
  const cartKey = producto ? `${producto.id}_${currentPresLabel}` : "";
  const inCart = cartQtys[cartKey] || 0;
  // Total units in cart for this product (all presentations) — from reactive state
  const totalUnitsInCart = producto ? (cartUnitsByProduct[producto.id] || 0) : 0;
  const comboStock = producto?.es_combo && comboComponentes.length > 0
    ? Math.min(...comboComponentes.map((c) => Math.floor(c.stock / c.cantidad)))
    : null;
  const effectiveStock = producto?.es_combo
    ? (comboStock ?? 0)
    : (producto?.stock ?? 0);
  const availableStock = producto ? Math.max(0, effectiveStock - totalUnitsInCart) : 0;
  const maxQty = availableStock > 0 ? Math.floor(availableStock / presQty) : 0;
  const canBuy = maxQty > 0;

  const stockLabel = !producto ? "" :
    !canBuy && availableStock > 0 ? `Quedan ${availableStock}` :
    !canBuy ? "Sin stock" :
    maxQty <= 5 ? `Últimas ${presQty > 1 ? maxQty + " cajas" : maxQty + " unidades"}` :
    "Disponible";

  const stockColor = !producto ? "" :
    !canBuy ? "text-red-600" :
    maxQty <= 5 ? "text-orange-500" :
    "text-green-600";

  function addToCart(prod: Producto, price: number, presLabel: string, qty: number, precioOriginal?: number, descuento?: number, unidadesPres?: number, overrideStock?: number, cantidadMinima?: number) {
    const stored = localStorage.getItem("carrito");
    let carrito: any[];
    try { const _p = stored ? JSON.parse(stored) : []; carrito = Array.isArray(_p) ? _p : []; } catch { carrito = []; }
    const cartKey = `${prod.id}_${presLabel}`;
    // Also check for legacy cart items without suffix
    const existing = carrito.find((item: any) => item.id === cartKey || (presLabel === "Unidad" && item.id === prod.id));
    if (existing && existing.id !== cartKey) existing.id = cartKey;
    const units = unidadesPres || 1;
    // Use effective stock (for combos, stock comes from components, not productos.stock)
    const realStock = overrideStock ?? prod.stock;
    // Calculate TOTAL units of this product already in cart (ALL presentations)
    let totalUnitsAlreadyInCart = 0;
    carrito.forEach((item: any) => {
      if (item.id === prod.id || item.id?.startsWith(`${prod.id}_`)) {
        totalUnitsAlreadyInCart += (item.cantidad || 0) * (item.unidades_por_presentacion || 1);
      }
    });
    const availableUnits = Math.max(0, realStock - totalUnitsAlreadyInCart);
    const maxCanAdd = Math.floor(availableUnits / units);
    if (maxCanAdd <= 0) {
      showToast("Ya tenés el máximo disponible en el carrito", "error");
      return;
    }
    const canAdd = Math.min(qty, maxCanAdd);
    if (existing) {
      existing.cantidad += canAdd;
    } else {
      carrito.push({
        id: cartKey,
        nombre: presLabel !== "Unidad" ? `${prod.nombre} - ${presLabel}` : prod.nombre,
        precio: price,
        precio_original: precioOriginal,
        descuento: descuento,
        imagen_url: prod.imagen_url,
        cantidad: canAdd,
        presentacion: presLabel,
        unidades_por_presentacion: units,
        cantidad_minima: cantidadMinima,
      });
    }
    localStorage.setItem("carrito", JSON.stringify(carrito));
    window.dispatchEvent(new Event("cart-updated"));
    if (canAdd < qty) {
      showToast(`Se agregaron ${canAdd} (máximo disponible)`, { type: "info", subtitle: prod.nombre });
    } else {
      const presInfo = presLabel && presLabel !== "Unidad" ? ` · ${presLabel}` : "";
      showToast(prod.nombre, { subtitle: `${qty} ${qty > 1 ? "agregados" : "agregado"} al carrito${presInfo}` });
    }
  }

  function handleAddToCart() {
    if (!producto) return;
    let presLabel = currentPresLabel;
    // For combo products, override presentacion to "Combo x{N}"
    if (producto.es_combo) {
      const totalUnits = comboComponentes.reduce((acc, c) => acc + c.cantidad, 0);
      presLabel = totalUnits > 0 ? `Combo x${totalUnits}` : "Combo";
    }
    const disc = getProductDiscount(producto, presLabel, cantidad);
    const price = disc > 0 ? Math.round(currentPrice * (1 - disc / 100)) : currentPrice;

    // Encontrar la cantidad_minima del descuento que se aplicó
    const discountUsed = disc > 0
      ? activeDiscounts.find((d: any) => {
          if (d.cantidad_minima && d.cantidad_minima > 0 && cantidad >= d.cantidad_minima) return true;
          return false;
        })
      : null;
    const cantidadMinima = discountUsed?.cantidad_minima ?? undefined;

    addToCart(producto, price, presLabel, cantidad, disc > 0 ? currentPrice : undefined, disc > 0 ? disc : undefined, presQty, effectiveStock, cantidadMinima);
    setCantidad(1);
    // Flash botón "Agregado" por 1.2s
    setJustAdded(true);
    if (justAddedTimer.current) clearTimeout(justAddedTimer.current);
    justAddedTimer.current = setTimeout(() => setJustAdded(false), 900);
  }

  function getRelPrice(prod: Producto) {
    const pres = relPresentaciones[prod.id];
    if (pres && pres.length > 1) {
      const idx = relSelectedPres[prod.id] ?? 0;
      const p = pres[idx];
      if (p) {
        if (p.precio > 0 && p.cantidad > 1 && p.precio === prod.precio) return p.precio * p.cantidad;
        return p.precio > 0 ? p.precio : prod.precio * Math.max(1, p.cantidad);
      }
      return prod.precio;
    }
    return prod.precio;
  }

  function getRelLabel(prod: Producto) {
    const pres = relPresentaciones[prod.id];
    if (pres && pres.length > 1) {
      const idx = relSelectedPres[prod.id] ?? 0;
      const p = pres[idx];
      return presLabelFn(p);
    }
    return "Unidad";
  }

  if (!producto || restricted) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Package className="h-16 w-16 text-gray-200" />
          <h2 className="mt-4 text-xl font-bold text-gray-800">Producto no encontrado</h2>
          <p className="text-sm text-gray-500 mt-2 max-w-sm">
            Este producto ya no está disponible o el enlace es incorrecto.
          </p>
          <Link href="/productos" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white transition hover:bg-primary/90">
            Ver todos los productos
          </Link>
        </div>
        {sugeridos.length > 0 && (
          <div className="mt-4 border-t border-gray-100 pt-8">
            <h3 className="text-base font-semibold text-gray-700 mb-4 text-center">Quizás te interese</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {sugeridos.map((s) => (
                <Link
                  key={s.id}
                  href={`/productos/${productSlug(s.nombre, s.id)}`}
                  className="group rounded-2xl border border-gray-100 bg-white hover:shadow-md transition overflow-hidden flex flex-col"
                >
                  <div className="relative aspect-square bg-gray-50 overflow-hidden">
                    {s.imagen_url ? (
                      <Image
                        src={s.imagen_url}
                        alt={s.nombre}
                        fill
                        sizes="(max-width: 768px) 50vw, 25vw"
                        className="object-contain p-3 group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="w-8 h-8 text-gray-200" />
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-xs font-medium text-gray-800 line-clamp-2">{s.nombre}</p>
                    <p className="text-sm font-bold text-gray-900 mt-1">{formatCurrency(s.precio)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-1.5 text-sm text-gray-400">
        <Link href="/" className="hover:text-primary transition">Inicio</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href="/productos" className="hover:text-primary transition">Productos</Link>
        {producto.categorias?.nombre && <>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link href={`/productos?categoria=${slugify(producto.categorias.nombre)}`} className="hover:text-primary transition">{producto.categorias.nombre}</Link>
        </>}
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-gray-700 font-medium truncate max-w-[200px]">{producto.nombre}</span>
      </nav>

      {/* Main */}
      <div className="grid gap-10 md:grid-cols-2">
        {/* Left - Image with zoom */}
        <div className="md:sticky md:top-24 md:self-start md:max-h-[calc(100vh-8rem)]">
          <div
            className="relative aspect-square overflow-hidden rounded-2xl border border-gray-100 bg-white cursor-zoom-in group"
            onClick={() => producto.imagen_url && setZoomOpen(true)}
          >
            {producto.imagen_url ? (
              <Image
                src={producto.imagen_url}
                alt={producto.nombre}
                fill
                priority
                sizes="(max-width: 768px) 100vw, 400px"
                className="object-contain p-4 group-hover:scale-105 transition-transform duration-300"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-gray-50 to-gray-100">
                <div className="w-28 h-28 rounded-3xl bg-white/80 flex items-center justify-center shadow-sm">
                  <Package className="h-14 w-14 text-gray-300" />
                </div>
                <span className="text-sm text-gray-300 font-medium">Sin imagen</span>
              </div>
            )}
            {producto.stock > 0 && producto.stock <= 10 && (
              <span className="absolute top-4 left-4 bg-primary text-white text-[11px] font-bold uppercase px-3 py-1 rounded-md">
                {producto.stock <= 5 ? "Últimas unidades" : "Últimas cajas"}
              </span>
            )}
          </div>
        </div>

        {/* Right - Info */}
        <div className="flex flex-col">
          {/* Category & Brand tags */}
          <div className="flex items-center gap-2 flex-wrap">
            {producto.categorias?.nombre && (
              <span className="text-xs text-gray-500 bg-gray-100 rounded-full px-2.5 py-1 font-medium">
                {producto.categorias.nombre}
              </span>
            )}
            {producto.marcas?.nombre && (
              <span className="text-xs text-gray-500 bg-gray-100 rounded-full px-2.5 py-1 font-medium">
                {producto.marcas.nombre}
              </span>
            )}
          </div>

          <h1 className="text-2xl font-bold text-gray-900 md:text-3xl mt-2">
            {producto.nombre}
          </h1>

          {producto.es_combo && (
            <div className="mt-2">
              <span className="inline-flex items-center gap-1.5 bg-primary/5 text-primary/90 text-xs font-semibold px-3 py-1.5 rounded-lg border border-primary/20">
                <Layers className="w-3.5 h-3.5" />
                Producto combo
              </span>
            </div>
          )}

          {producto.descripcion_detallada && (
            <p className="mt-2 text-sm text-gray-500 leading-relaxed">{producto.descripcion_detallada}</p>
          )}

          {/* Price */}
          <div className="mt-4">
            <div className="flex items-center gap-3">
              <p className="text-3xl font-bold text-gray-900">
                {!clienteLoading && currentDiscount > 0 ? formatCurrency(discountedPrice) : formatCurrency(currentPrice)}
              </p>
              {!clienteLoading && currentDiscount > 0 && (
                <span className="bg-primary/10 text-primary/90 text-xs font-bold px-2.5 py-1 rounded-full">
                  {Math.round(currentDiscount)}% OFF
                </span>
              )}
              {(() => {
                const pa = (producto as any).precio_anterior;
                if (currentDiscount > 0 || !pa || pa <= 0 || pa === producto.precio) return null;
                const dateStr = producto.fecha_actualizacion || producto.updated_at;
                if (!dateStr || daysSinceAR(dateStr) > 3) return null;
                return producto.precio > pa
                  ? <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2.5 py-1 rounded-full">Precio actualizado</span>
                  : <span className="bg-green-100 text-green-700 text-xs font-bold px-2.5 py-1 rounded-full">Precio rebajado</span>;
              })()}
              {/* Badge NUEVO o RE INGRESO en el detalle del producto principal */}
              {producto.created_at && daysSinceAR(producto.created_at) <= 7 && (
                <span className="bg-blue-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">NUEVO</span>
              )}
              {producto.created_at && daysSinceAR(producto.created_at) > 7 && reingresoSet.has(producto.id) && (
                <span className="bg-cyan-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">RE INGRESO</span>
              )}
            </div>
            {!clienteLoading && currentDiscount > 0 && (
              <div className="flex items-center gap-3 mt-1">
                <span className="text-sm text-gray-400 line-through">{formatCurrency(currentPrice)}</span>
                <span className="text-sm text-green-600 font-semibold">Ahorrás {formatCurrency(savings)}</span>
              </div>
            )}
            {!clienteLoading && volumeDiscountHint && currentDiscount === 0 && (() => {
              const presLabel = currentPres && currentPres.cantidad > 1
                ? (currentPres.cantidad >= 6 ? "cajas" : "packs")
                : "unidades";
              const faltan = volumeDiscountHint.minQty - cantidad;
              return (
                <div className="mt-2 bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-lg px-3 py-2.5 flex items-center gap-2.5">
                  <span className="text-xl">🏷️</span>
                  <div>
                    <p className="text-sm text-orange-900 font-bold">
                      {volumeDiscountHint.porcentaje}% OFF llevando {volumeDiscountHint.minQty} {volumeDiscountHint.presType}
                    </p>
                    <p className="text-xs text-orange-700 mt-0.5">
                      {faltan > 0 ? `Agregá ${faltan} ${volumeDiscountHint.presType} más para obtener el descuento` : "¡Ya alcanzaste el mínimo!"}
                    </p>
                  </div>
                </div>
              );
            })()}
            <p className="text-sm text-gray-500 mt-1">
              {currentPres && currentPres.cantidad > 1
                ? currentLabel
                : "Precio unitario"}
            </p>
            {currentPres && currentPres.cantidad > 1 && (() => {
              const unitPrice = Math.round(discountedPrice / currentPres.cantidad);
              return (
                <p className="text-sm text-emerald-600 font-medium mt-1">
                  {formatCurrency(unitPrice)} c/u
                </p>
              );
            })()}
            {boxOnlyDiscount > 0 && currentPresLabel === "Unidad" && (
              <p className="text-sm text-emerald-600 font-medium mt-1.5">
                📦 {Math.round(boxOnlyDiscount)}% OFF comprando por {boxDiscountLabel}
              </p>
            )}
            {producto.es_combo && comboComponentes.length > 0 && (() => {
              const totalUnidades = comboComponentes.reduce((acc, c) => acc + c.cantidad, 0);
              const precioPorUnidad = totalUnidades > 0 ? currentPrice / totalUnidades : 0;
              return (
                <div className="mt-2 inline-flex items-center gap-2 bg-primary/5 border border-primary/10 rounded-lg px-3 py-1.5">
                  <Box className="w-3.5 h-3.5 text-primary/80 flex-shrink-0" />
                  <span className="text-sm text-primary/90">
                    <span className="font-semibold">{formatCurrency(precioPorUnidad)}</span>
                    <span className="text-primary/80"> por unidad · {totalUnidades} un. totales</span>
                  </span>
                </div>
              );
            })()}
          </div>

          {/* Presentaciones */}
          {presentaciones.length > 0 && (
            <div className="mt-5 pt-5 border-t border-gray-100">
              <div className="grid grid-cols-2 gap-3">
                {(() => {
                  const bestIdx = presentaciones.length > 1
                    ? presentaciones.reduce((best, p, i) => {
                        if (p.nombre === "Unidad" || p.cantidad <= 1) return best;
                        const unitPrice = p.precio > 0 && p.cantidad > 0 ? p.precio / p.cantidad : Infinity;
                        if (best === -1) return unitPrice < Infinity ? i : best;
                        const bestP = presentaciones[best];
                        const bestUnitPrice = bestP.precio > 0 && bestP.cantidad > 0 ? bestP.precio / bestP.cantidad : Infinity;
                        return unitPrice < bestUnitPrice ? i : best;
                      }, -1)
                    : -1;

                  return presentaciones
                    .map((p, idx) => ({ p, idx }))
                    .sort((a, b) => {
                      if (a.p.cantidad === 1 && b.p.cantidad !== 1) return -1;
                      if (a.p.cantidad !== 1 && b.p.cantidad === 1) return 1;
                      return a.p.cantidad - b.p.cantidad;
                    })
                    .map(({ p, idx }) => {
                    const isUnit = Number(p.cantidad) === 1;
                    const isBestPrice = bestIdx >= 0 && idx === bestIdx && !isUnit;
                    const selected = selectedPresIdx === idx;
                    const presMax = availableStock > 0 ? Math.max(1, Math.floor(availableStock / Number(p.cantidad))) : 0;
                    const disabled = presMax <= 0;
                    return (
                      <button
                        key={p.id}
                        disabled={disabled}
                        onClick={() => { setSelectedPresIdx(idx); setCantidad((c) => Math.min(c, Math.max(1, presMax))); }}
                        className={`relative flex items-center justify-center gap-2 rounded-full border py-2.5 px-5 text-sm font-semibold transition-all ${
                          disabled
                            ? "border-gray-100 text-gray-300 bg-gray-50 cursor-not-allowed"
                            : selected
                            ? "border-primary bg-primary/5 text-primary/90"
                            : "border-gray-200 text-gray-600 hover:border-gray-300 bg-white"
                        }`}
                      >
                        {isUnit ? <Layers className="w-4 h-4" /> : <Box className="w-4 h-4" />}
                        {presLabelFn(p)}
                        {disabled && <span className="text-[10px] font-normal ml-1">(sin stock)</span>}
                        {isBestPrice && !disabled && (
                          <span className="absolute -top-2 -right-1 bg-green-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none whitespace-nowrap">
                            Mejor precio/u
                          </span>
                        )}
                      </button>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {/* Quantity + Add to Cart */}
          <div className="mt-5 pt-5 border-t border-gray-100">
            <div className="flex items-center gap-4">
              <div className="inline-flex items-center rounded-xl border border-gray-200">
                <button
                  onClick={() => setCantidad((c) => Math.max(1, c - 1))}
                  disabled={cantidad <= 1}
                  className="flex h-12 w-12 items-center justify-center rounded-l-xl text-gray-500 transition hover:bg-gray-50 disabled:opacity-30"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="flex h-12 w-14 items-center justify-center border-x border-gray-200 text-center font-semibold text-gray-800">
                  {cantidad}
                </span>
                <button
                  onClick={() => setCantidad((c) => Math.min(maxQty, c + 1))}
                  disabled={cantidad >= maxQty}
                  className="flex h-12 w-12 items-center justify-center rounded-r-xl text-gray-500 transition hover:bg-gray-50 disabled:opacity-30"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <button
                onClick={handleAddToCart}
                disabled={!canBuy}
                className={`flex-1 rounded-xl py-3.5 text-sm font-bold uppercase tracking-wide text-white transition-all duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${justAdded ? "bg-emerald-500 shadow-emerald-500/30 shadow-md" : "bg-primary hover:bg-primary/90"}`}
              >
                {!canBuy ? (presQty > 1 ? "Stock insuficiente" : "Sin stock") : justAdded ? "✓ Agregado" : `Agregar · ${formatCurrency((currentDiscount > 0 ? discountedPrice : currentPrice) * cantidad)}`}
              </button>
            </div>
            <p className={"text-xs mt-2 " + stockColor}>
              {stockLabel} {availableStock > 0 && availableStock <= 10 ? `· ${availableStock} disponibles` : ""}
            </p>
          </div>

          {/* More details - collapsible */}
          <details className="mt-5 border-t border-gray-100 pt-5">
            <summary className="text-sm font-medium text-gray-500 cursor-pointer hover:text-gray-700 transition">
              Más detalles
            </summary>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">SKU:</span>
                <span className="font-medium text-gray-700">{(currentPres?.sku || producto.codigo) || "—"}</span>
              </div>
              {(producto.updated_at || producto.fecha_actualizacion) && (() => {
                const dateStr = producto.fecha_actualizacion || producto.updated_at || "";
                const date = new Date(dateStr);
                if (isNaN(date.getTime())) return null;
                return (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Últ. actualización:</span>
                    <span className="font-medium text-gray-700 text-xs">
                      {date.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  </div>
                );
              })()}
              {(() => {
                const pa = (producto as any).precio_anterior;
                if (!pa || pa <= 0 || pa === producto.precio) return null;
                return (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Precio anterior:</span>
                    <span className="font-medium text-gray-400 line-through">{formatCurrency(pa)}</span>
                  </div>
                );
              })()}
            </div>
          </details>

          {/* Share */}
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <button
              onClick={() => {
                const text = `Mirá este producto en Dulcesur: *${producto.nombre}* - ${formatCurrency(currentDiscount > 0 ? discountedPrice : currentPrice)}`;
                const url = window.location.href;
                window.open(`https://wa.me/?text=${encodeURIComponent(text + "\n" + url)}`, "_blank");
              }}
              className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-green-600 transition"
            >
              <Share2 className="w-4 h-4" />
              Compartir por WhatsApp
            </button>
            <button
              onClick={() => {
                navigator.clipboard.writeText(window.location.href).then(() => {
                  showToast("Enlace copiado al portapapeles");
                });
              }}
              className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-primary transition"
            >
              <Link2 className="w-4 h-4" />
              Copiar enlace
            </button>
          </div>

          {/* Combo contents */}
          {producto.es_combo && comboComponentes.length > 0 && (() => {
            const totalUnidades = comboComponentes.reduce((a, c) => a + c.cantidad, 0);
            const valorIndividual = comboComponentes.reduce((a, c) => a + c.precio * c.cantidad, 0);
            return (
              <div className="mt-6 border border-primary/10 rounded-2xl overflow-hidden bg-primary/5">
                {/* Header toggle */}
                <button
                  onClick={() => setComboOpen((o) => !o)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-primary/5/60 transition"
                >
                  <span className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10">
                      <Layers className="w-4 h-4 text-primary" />
                    </span>
                    <span className="text-left">
                      <p className="text-sm font-semibold text-gray-900">¿Qué incluye este combo?</p>
                      <p className="text-xs text-gray-500">{totalUnidades} productos incluidos</p>
                    </span>
                  </span>
                  <ChevronRight className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${comboOpen ? "-rotate-90" : "rotate-90"}`} />
                </button>

                {comboOpen && (
                  <div className="border-t border-primary/10 bg-white">
                    <p className="px-5 pt-4 pb-3 text-sm font-semibold text-gray-800">Productos incluidos en este combo</p>
                    <div className="px-4 space-y-3 pb-4">
                      {comboComponentes.map((c) => (
                        <div key={c.producto_id} className="flex items-center gap-4 bg-gray-50 rounded-xl p-3 border border-gray-100">
                          <div className="w-14 h-14 rounded-lg bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center border border-gray-200">
                            {c.imagen_url ? (
                              <Image src={c.imagen_url} alt={c.nombre} width={56} height={56} className="object-contain" />
                            ) : (
                              <Package className="w-6 h-6 text-gray-300" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{c.nombre}</p>
                            <p className="text-xs text-gray-500 mt-0.5">Presentación: Unidad</p>
                            <p className="text-xs text-gray-500">Precio unitario: {formatCurrency(c.precio)}</p>
                          </div>
                          <span className="shrink-0 bg-primary/10 text-primary/90 text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap">
                            {c.cantidad} {c.cantidad === 1 ? "unidad" : "unidades"}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="border-t border-gray-100 px-5 py-3 space-y-1 bg-gray-50/60">
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>Total de productos en el combo:</span>
                        <span className="font-semibold text-gray-700">{totalUnidades} unidades</span>
                      </div>
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>Valor individual de los productos:</span>
                        <span className="font-semibold text-gray-700">{formatCurrency(valorIndividual)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Related Products */}
      {relacionados.length > 0 && (
        <section className="mt-16 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">
              {producto.categorias?.nombre
                ? `Más de ${producto.categorias.nombre}`
                : "Productos Relacionados"}
            </h2>
            <span className="text-xs text-gray-400 hidden md:block">Deslizá para ver más →</span>
          </div>
          <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 pb-2" style={{ scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch", scrollbarWidth: "none", msOverflowStyle: "none" }}>
            <div className="flex gap-4 w-max md:w-auto">
              {relacionados.map((rel) => {
                const pres = relPresentaciones[rel.id];
                const presIdx = relSelectedPres[rel.id] ?? 0;
                const presLabel = pres && pres[presIdx] ? pres[presIdx].nombre : "Unidad";
                const rawPrice = pres && pres.length > 1 ? (pres[presIdx]?.precio ?? rel.precio) : rel.precio;
                const price = (pres && pres[presIdx] && pres[presIdx].precio > 0 && pres[presIdx].cantidad > 1 && pres[presIdx].precio === rel.precio) ? pres[presIdx].precio * pres[presIdx].cantidad : rawPrice;
                const qty = relQty[rel.id] ?? 1;
                const relDiscount = getProductDiscount(rel, presLabel);
                const relDiscountedPrice = relDiscount > 0 ? Math.round(price * (1 - relDiscount / 100)) : price;
                // Check for volume discount hint
                const relVolHint = (() => {
                  const isBox = presLabel !== "Unidad";
                  for (const d of activeDiscounts) {
                    if (!d.cantidad_minima || d.cantidad_minima <= 0) continue;
                    if (d.clientes_ids?.length > 0 && (!tiendaClienteId || !d.clientes_ids.includes(tiendaClienteId))) continue;
                    if (d.presentacion === "caja" && !isBox) continue;
                    if (d.presentacion === "unidad" && isBox) continue;
                    const applies = d.aplica_a === "todos" || (d.aplica_a === "productos" && (d.productos_ids || []).includes(rel.id)) || (d.aplica_a === "categorias" && ((d.categorias_ids || []).includes(rel.categoria_id)));
                    if (!applies) continue;
                    const label = d.presentacion === "caja" ? "cajas" : d.presentacion === "unidad" ? "un." : (isBox ? "cajas" : "un.");
                    return { minQty: d.cantidad_minima, pct: d.porcentaje, label };
                  }
                  return null;
                })();
                // Check if product is "new" (created < 7 days ago)
                const isNew = rel.created_at && daysSinceAR(rel.created_at) <= 7;

                return (
                  <div
                    key={rel.id}
                    className="flex-shrink-0 w-[160px] sm:w-[180px] md:w-[200px] lg:w-[calc(20%-12.8px)] snap-start rounded-2xl border border-gray-100 bg-white overflow-hidden flex flex-col shadow-sm hover:shadow-md transition-shadow"
                  >
                    <Link href={`/productos/${productSlug(rel.nombre, rel.id)}`}>
                      <div className="aspect-square bg-gray-100 overflow-hidden relative group">
                        {relDiscount > 0 && (
                          <span className="absolute top-2 left-2 z-10 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow">
                            -{relDiscount}%
                          </span>
                        )}
                        {!relDiscount && relVolHint && (
                          <span className="absolute top-2 left-2 z-10 bg-orange-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow">
                            -{relVolHint.pct}% x{relVolHint.minQty}+ {relVolHint.label}
                          </span>
                        )}
                        {isNew && !relDiscount && !relVolHint && (
                          <span className="absolute top-2 left-2 z-10 bg-blue-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow">
                            NUEVO
                          </span>
                        )}
                        {!isNew && reingresoSet.has(rel.id) && !relDiscount && !relVolHint && (
                          <span className="absolute top-2 left-2 z-10 bg-cyan-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow">
                            RE INGRESO
                          </span>
                        )}
                        {rel.imagen_url ? (
                          <Image
                            src={rel.imagen_url}
                            alt={rel.nombre}
                            fill
                            sizes="200px"
                            className="object-contain p-4 group-hover:scale-110 transition-transform duration-300"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-gray-300 text-xs">
                            Sin imagen
                          </div>
                        )}
                      </div>
                    </Link>
                    <div className="p-3 flex-1 flex flex-col">
                      <p className="text-[11px] text-gray-400 uppercase font-medium tracking-wide">
                        {rel.categorias?.nombre ?? ""}
                      </p>
                      <Link href={`/productos/${productSlug(rel.nombre, rel.id)}`}>
                        <p className="text-sm font-medium text-gray-800 line-clamp-2 min-h-[2.5rem] mt-0.5">
                          {rel.nombre}
                        </p>
                      </Link>
                      {relDiscount > 0 ? (
                        <div className="mt-1">
                          <span className="text-xs text-gray-400 line-through mr-1.5">{formatCurrency(price)}</span>
                          <span className="text-base font-bold text-red-600">{formatCurrency(relDiscountedPrice)}</span>
                        </div>
                      ) : (
                        <p className="text-base font-bold text-gray-900 mt-1">
                          {formatCurrency(price)}
                        </p>
                      )}

                      {/* Presentacion pills */}
                      {pres && pres.length > 1 && (
                        <div className="flex gap-1.5 mt-2">
                          {pres.map((pr, idx) => ({ pr, idx })).sort((a, b) => {
                            if (a.pr.cantidad === 1 && b.pr.cantidad !== 1) return -1;
                            if (a.pr.cantidad !== 1 && b.pr.cantidad === 1) return 1;
                            return a.pr.cantidad - b.pr.cantidad;
                          }).map(({ pr, idx }) => {
                            const isActive = presIdx === idx;
                            const label = presLabelFn(pr);
                            return (
                              <button
                                key={idx}
                                onClick={() => setRelSelectedPres((prev) => ({ ...prev, [rel.id]: idx }))}
                                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all border ${
                                  isActive
                                    ? "bg-primary text-white border-primary"
                                    : "bg-white text-gray-600 border-gray-200 hover:border-primary/30"
                                }`}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Qty + Add */}
                      {(() => {
                        const selPres = pres && pres[presIdx];
                        const unitsPerPres = selPres ? Number(selPres.cantidad) || 1 : 1;
                        // Use reactive state for total units in cart (updates on cart-updated event)
                        const totalUnitsInCart = cartUnitsByProduct[rel.id] || 0;
                        const availableUnits = Math.max(0, rel.stock - totalUnitsInCart);
                        const maxQty = Math.floor(availableUnits / unitsPerPres);
                        const outOfStock = rel.stock <= 0 || maxQty <= 0;
                        return (
                          <div className="mt-auto pt-3 flex items-center gap-1.5">
                            <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                              <button
                                onClick={() => setRelQty((prev) => ({ ...prev, [rel.id]: Math.max(1, (prev[rel.id] ?? 1) - 1) }))}
                                disabled={outOfStock}
                                className="w-8 h-8 flex items-center justify-center text-gray-500 hover:bg-gray-50 disabled:opacity-30"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="w-7 text-center text-xs font-medium">{outOfStock ? 0 : Math.min(qty, maxQty || 1)}</span>
                              <button
                                onClick={() => setRelQty((prev) => ({ ...prev, [rel.id]: Math.min(maxQty, (prev[rel.id] ?? 1) + 1) }))}
                                disabled={outOfStock || qty >= maxQty}
                                className="w-8 h-8 flex items-center justify-center text-gray-500 hover:bg-gray-50 disabled:opacity-30"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                            <button
                              onClick={() => {
                                if (outOfStock) return;
                                const finalPrice = relDiscount > 0 ? relDiscountedPrice : price;
                                const relUnitsPerPres = selPres ? Number(selPres.cantidad) || 1 : 1;
                                addToCart(rel, finalPrice, getRelLabel(rel), Math.min(qty, maxQty), relDiscount > 0 ? price : undefined, relDiscount > 0 ? relDiscount : undefined, relUnitsPerPres, rel.stock);
                                setRelQty((prev) => ({ ...prev, [rel.id]: 1 }));
                                setRelJustAdded((p) => ({ ...p, [rel.id]: true }));
                                if (relJustAddedTimers.current[rel.id]) clearTimeout(relJustAddedTimers.current[rel.id]);
                                relJustAddedTimers.current[rel.id] = setTimeout(() => setRelJustAdded((p) => { const n = { ...p }; delete n[rel.id]; return n; }), 900);
                              }}
                              disabled={outOfStock}
                              className={`flex-1 text-xs py-2 rounded-lg font-semibold transition-all duration-200 active:scale-95 ${outOfStock ? "bg-gray-200 text-gray-500 cursor-not-allowed" : relJustAdded[rel.id] ? "bg-emerald-500 text-white" : "bg-primary hover:bg-primary/90 text-white"}`}
                            >
                              {outOfStock ? "Sin stock" : relJustAdded[rel.id] ? "✓ Agregado" : `Agregar ${formatCurrency((relDiscount > 0 ? relDiscountedPrice : price) * qty)}`}
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Zoom modal */}
      {zoomOpen && producto.imagen_url && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center cursor-zoom-out"
          onClick={() => setZoomOpen(false)}
        >
          <button
            onClick={() => setZoomOpen(false)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/40 transition z-10"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="relative w-[90vw] h-[90vh] max-w-3xl">
            <Image
              src={producto.imagen_url}
              alt={producto.nombre}
              fill
              className="object-contain"
              sizes="(max-width: 768px) 90vw, 768px"
            />
          </div>
        </div>
      )}
      <VistosRecientementeBlock excludeId={producto.id} />
    </div>
  );
}
