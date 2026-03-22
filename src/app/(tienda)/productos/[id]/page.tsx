"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { useCategoriasPermitidas } from "@/hooks/use-categorias-visibles";
import {
  Package,
  Minus,
  Plus,
  ChevronRight,
  ChevronLeft,
  Layers,
  Box,
  Tag,
} from "lucide-react";
import { showToast } from "@/components/tienda/toast";

interface Producto {
  id: string;
  nombre: string;
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

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
  }).format(value);

export default function ProductoDetallePage() {
  const { id } = useParams<{ id: string }>();

  const [producto, setProducto] = useState<Producto | null>(null);
  const [presentaciones, setPresentaciones] = useState<Presentacion[]>([]);
  const [selectedPresIdx, setSelectedPresIdx] = useState(0);
  const [cantidad, setCantidad] = useState(1);
  const [relacionados, setRelacionados] = useState<Producto[]>([]);
  const [relPresentaciones, setRelPresentaciones] = useState<Record<string, Presentacion[]>>({});
  const [relSelectedPres, setRelSelectedPres] = useState<Record<string, number>>({});
  const [relQty, setRelQty] = useState<Record<string, number>>({});
  const [relScroll, setRelScroll] = useState(0);
  const [comboComponentes, setComboComponentes] = useState<ComboComponente[]>([]);
  const [comboOpen, setComboOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cartQtys, setCartQtys] = useState<Record<string, number>>({});
  const [activeDiscounts, setActiveDiscounts] = useState<any[]>([]);
  const [restricted, setRestricted] = useState(false);
  const { permitidas, loaded: permisosLoaded } = useCategoriasPermitidas();

  // Sync cart quantities
  useEffect(() => {
    function syncCart() {
      const stored = localStorage.getItem("carrito");
      let carrito: { id: string; cantidad: number }[];
      try { carrito = stored ? JSON.parse(stored) : []; } catch { carrito = []; }
      const map: Record<string, number> = {};
      carrito.forEach((item) => map[item.id] = (map[item.id] || 0) + item.cantidad);
      setCartQtys(map);
    }
    syncCart();
    window.addEventListener("cart-updated", syncCart);
    return () => window.removeEventListener("cart-updated", syncCart);
  }, []);

  // Load active discounts
  useEffect(() => {
    async function loadDiscounts() {
      const today = new Date().toISOString().split("T")[0];
      const { data } = await supabase
        .from("descuentos")
        .select("*")
        .eq("activo", true)
        .lte("fecha_inicio", today);
      setActiveDiscounts((data || []).filter((d: any) => !d.fecha_fin || d.fecha_fin >= today));
    }
    loadDiscounts();
  }, []);

  function getProductDiscount(prod: Producto, presLabel?: string | null): number {
    let best = 0;
    const effectivePres = presLabel ?? "Unidad";
    const isBox = effectivePres !== "Unidad" && !effectivePres.startsWith("Unidad");
    const isUnit = !isBox;
    for (const d of activeDiscounts) {
      if (d.presentacion === "unidad" && isBox) continue;
      if (d.presentacion === "caja" && isUnit) continue;
      if (d.aplica_a === "todos") {
        best = Math.max(best, Number(d.porcentaje));
      } else if (d.aplica_a === "categorias") {
        const ids: string[] = d.categorias_ids || [];
        if (ids.includes(prod.categoria_id) || (prod.subcategoria_id && ids.includes(prod.subcategoria_id))) {
          best = Math.max(best, Number(d.porcentaje));
        }
      } else if (d.aplica_a === "subcategorias") {
        const subIds: string[] = d.subcategorias_ids || [];
        if (prod.subcategoria_id && subIds.includes(prod.subcategoria_id)) {
          best = Math.max(best, Number(d.porcentaje));
        }
      } else if (d.aplica_a === "productos") {
        const ids: string[] = d.productos_ids || [];
        if (ids.includes(prod.id)) {
          best = Math.max(best, Number(d.porcentaje));
        }
      }
    }
    return best;
  }

  useEffect(() => {
    if (!id) return;
    async function fetchData() {
      setLoading(true);
      const { data: prod } = await supabase
        .from("productos")
        .select("*, categorias(nombre), marcas(nombre)")
        .eq("id", id)
        .single();

      if (prod) {
        // Check if product belongs to a restricted category
        const { data: cat } = await supabase
          .from("categorias")
          .select("restringida")
          .eq("id", prod.categoria_id)
          .single();
        if (cat?.restringida) {
          // Check if user has permission
          const raw = localStorage.getItem("cliente_auth");
          let hasAccess = false;
          if (raw) {
            try {
              const auth = JSON.parse(raw);
              if (auth?.id) {
                const { data: authData } = await supabase
                  .from("clientes_auth")
                  .select("cliente_id")
                  .eq("id", auth.id)
                  .single();
                if (authData?.cliente_id) {
                  const { data: cliente } = await supabase
                    .from("clientes")
                    .select("categorias_permitidas")
                    .eq("id", authData.cliente_id)
                    .single();
                  hasAccess = (cliente?.categorias_permitidas || []).includes(prod.categoria_id);
                }
              }
            } catch {}
          }
          if (!hasAccess) {
            setRestricted(true);
            setLoading(false);
            return;
          }
        }

        setProducto(prod as Producto);

        // Load combo items if es_combo
        if (prod.es_combo) {
          const { data: ci } = await supabase
            .from("combo_items")
            .select("cantidad, productos!combo_items_producto_id_fkey(id, nombre, stock, precio, imagen_url)")
            .eq("combo_id", id);
          setComboComponentes((ci || []).map((d: any) => ({
            producto_id: d.productos?.id || "",
            cantidad: d.cantidad,
            nombre: d.productos?.nombre || "",
            stock: d.productos?.stock ?? 0,
            precio: d.productos?.precio ?? 0,
            imagen_url: d.productos?.imagen_url ?? null,
          })));
        }

        const { data: pres } = await supabase
          .from("presentaciones")
          .select("*")
          .eq("producto_id", id)
          .order("cantidad");
        if (pres && pres.length > 0) {
          setPresentaciones(pres as Presentacion[]);
          // Default to "Unidad" for Mt/Medio Cartón products
          const hasMedio = pres.some((p: any) => p.cantidad <= 0.5 || (p.nombre && p.nombre.toLowerCase().includes("medio")));
          const unitIdx = hasMedio ? pres.findIndex((p: any) => p.cantidad === 1) : -1;
          setSelectedPresIdx(unitIdx >= 0 ? unitIdx : 0);
        } else {
          setPresentaciones([]);
          setSelectedPresIdx(0);
        }

        // Fetch related products: prioritize same brand+category, then same subcategory, then same category
        const related: Producto[] = [];
        const usedIds = new Set<string>([id as string]);
        const MAX_RELATED = 8;

        // 1. Same brand + same category (most relevant)
        if (prod.marca_id) {
          const { data: sameBrandCat } = await supabase
            .from("productos")
            .select("*, categorias(nombre), marcas(nombre)")
            .eq("categoria_id", prod.categoria_id)
            .eq("marca_id", prod.marca_id)
            .eq("activo", true)
            .neq("id", id)
            .limit(MAX_RELATED);
          for (const p of sameBrandCat || []) {
            if (!usedIds.has(p.id)) { related.push(p as Producto); usedIds.add(p.id); }
          }
        }

        // 2. Same subcategory (if not enough yet)
        if (related.length < MAX_RELATED && prod.subcategoria_id) {
          const { data: sameSub } = await supabase
            .from("productos")
            .select("*, categorias(nombre), marcas(nombre)")
            .eq("subcategoria_id", prod.subcategoria_id)
            .eq("activo", true)
            .neq("id", id)
            .limit(MAX_RELATED - related.length);
          for (const p of sameSub || []) {
            if (!usedIds.has(p.id)) { related.push(p as Producto); usedIds.add(p.id); }
          }
        }

        // 3. Same category (fill remaining slots)
        if (related.length < MAX_RELATED) {
          const { data: sameCat } = await supabase
            .from("productos")
            .select("*, categorias(nombre), marcas(nombre)")
            .eq("categoria_id", prod.categoria_id)
            .eq("activo", true)
            .neq("id", id)
            .limit(MAX_RELATED - related.length);
          for (const p of sameCat || []) {
            if (!usedIds.has(p.id)) { related.push(p as Producto); usedIds.add(p.id); }
          }
        }

        if (related.length > 0) {
          setRelacionados(related);
          const ids = related.map((r: Producto) => r.id);
          const { data: relPres } = await supabase
            .from("presentaciones")
            .select("*")
            .in("producto_id", ids)
            .order("cantidad");
          const map: Record<string, Presentacion[]> = {};
          (relPres || []).forEach((p: Presentacion) => {
            if (!map[p.producto_id]) map[p.producto_id] = [];
            map[p.producto_id].push(p);
          });
          setRelPresentaciones(map);
        }
      }
      setLoading(false);
    }
    fetchData();
  }, [id]);

  const currentPres = presentaciones[selectedPresIdx];
  const currentPrice = currentPres ? currentPres.precio : (producto?.precio ?? 0);
  const presQty = currentPres ? Number(currentPres.cantidad) : 1;

  function presLabelFn(p: { cantidad: number; nombre?: string }): string {
    if (p.cantidad === 1) return "Unidad";
    if (p.cantidad <= 0.5 || (p.nombre && p.nombre.toLowerCase().includes("medio"))) return "Medio Cartón";
    return `Caja (x${p.cantidad})`;
  }
  function presLabelLong(p: { cantidad: number; nombre?: string }): string {
    if (p.cantidad === 1) return "Unidad";
    if (p.cantidad <= 0.5 || (p.nombre && p.nombre.toLowerCase().includes("medio"))) return "Medio Cartón";
    return `Caja (${p.cantidad} unidades)`;
  }

  const currentLabel = currentPres ? presLabelLong(currentPres) : "Unidad";

  const currentPresLabel = currentPres ? presLabelFn(currentPres) : "Unidad";
  const currentDiscount = producto ? getProductDiscount(producto, currentPresLabel) : 0;
  const discountedPrice = currentDiscount > 0 ? Math.round(currentPrice * (1 - currentDiscount / 100)) : currentPrice;
  const savings = currentPrice - discountedPrice;

  // Check if there's a box-only discount (discount on box but not unit)
  const boxOnlyDiscount = producto ? (() => {
    const unitDisc = getProductDiscount(producto, "Unidad");
    const boxPres = presentaciones.find((p) => p.cantidad > 1);
    if (!boxPres) return 0;
    const boxLabel = presLabelFn(boxPres);
    const boxDisc = getProductDiscount(producto, boxLabel);
    return boxDisc > 0 && unitDisc === 0 ? boxDisc : 0;
  })() : 0;

  // Max qty based on stock and presentation, minus what's already in cart
  const cartKey = producto ? `${producto.id}_${currentPresLabel}` : "";
  const inCart = cartQtys[cartKey] || 0;
  // Total units in cart for this product (all presentations)
  const totalUnitsInCart = producto ? Object.entries(cartQtys).reduce((sum, [key, qty]) => {
    if (key.startsWith(producto.id + "_")) {
      // Figure out units per item from the key
      if (key.includes("Medio Cartón")) return sum + qty * 0.5;
      const match = key.match(/Caja \(x(\d+)\)/);
      const units = match ? Number(match[1]) : 1;
      return sum + qty * units;
    }
    return sum;
  }, 0) : 0;
  const comboStock = producto?.es_combo && comboComponentes.length > 0
    ? Math.min(...comboComponentes.map((c) => Math.floor(c.stock / c.cantidad)))
    : null;
  const effectiveStock = producto?.es_combo
    ? (comboStock ?? 0)
    : (producto?.stock ?? 0);
  const availableStock = producto ? Math.max(0, effectiveStock - totalUnitsInCart) : 0;
  const maxQty = Math.floor(availableStock / presQty);
  const canBuy = maxQty > 0;

  const stockLabel = !producto ? "" :
    !canBuy ? "Sin stock" :
    maxQty <= 5 ? `Últimas ${presQty > 1 ? maxQty + " cajas" : maxQty + " unidades"}` :
    "Disponible";

  const stockColor = !producto ? "" :
    !canBuy ? "text-red-600" :
    maxQty <= 5 ? "text-orange-500" :
    "text-green-600";

  function addToCart(prod: Producto, price: number, presLabel: string, qty: number, precioOriginal?: number, descuento?: number, unidadesPres?: number) {
    const stored = localStorage.getItem("carrito");
    let carrito: any[];
    try { carrito = stored ? JSON.parse(stored) : []; } catch { carrito = []; }
    const cartKey = `${prod.id}_${presLabel}`;
    // Also check for legacy cart items without suffix
    const existing = carrito.find((item: any) => item.id === cartKey || (presLabel === "Unidad" && item.id === prod.id));
    if (existing && existing.id !== cartKey) existing.id = cartKey;
    const currentInCart = existing ? existing.cantidad : 0;
    const units = unidadesPres || 1;
    const maxForPres = Math.floor(prod.stock / units);
    if (currentInCart >= maxForPres) {
      showToast("Ya tenés el máximo disponible en el carrito", "error");
      return;
    }
    const canAdd = Math.min(qty, maxForPres - currentInCart);
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
      });
    }
    localStorage.setItem("carrito", JSON.stringify(carrito));
    window.dispatchEvent(new Event("cart-updated"));
    if (canAdd < qty) {
      showToast(`Se agregaron ${canAdd} (máximo disponible)`, { type: "info", subtitle: prod.nombre });
    } else {
      showToast(prod.nombre, { subtitle: "Agregado al carrito" });
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
    const disc = getProductDiscount(producto, presLabel);
    const price = disc > 0 ? Math.round(currentPrice * (1 - disc / 100)) : currentPrice;
    addToCart(producto, price, presLabel, cantidad, disc > 0 ? currentPrice : undefined, disc > 0 ? disc : undefined, presQty);
    setCantidad(1);
  }

  function getRelPrice(prod: Producto) {
    const pres = relPresentaciones[prod.id];
    if (pres && pres.length > 1) {
      const idx = relSelectedPres[prod.id] ?? 0;
      return pres[idx]?.precio ?? prod.precio;
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

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-10">
          <div className="flex-1 aspect-square bg-gray-100 rounded-2xl animate-pulse" />
          <div className="flex-1 space-y-4">
            <div className="h-8 bg-gray-100 rounded w-3/4 animate-pulse" />
            <div className="h-6 bg-gray-100 rounded w-1/4 animate-pulse" />
            <div className="h-10 bg-gray-100 rounded w-1/2 animate-pulse" />
            <div className="h-12 bg-gray-100 rounded w-full animate-pulse mt-6" />
          </div>
        </div>
      </div>
    );
  }

  if (!producto || restricted) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Package className="h-20 w-20 text-gray-200" />
          <h2 className="mt-6 text-xl font-bold text-gray-800">Producto no encontrado</h2>
          <Link href="/productos" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-pink-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-pink-700">
            Volver a productos
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-1.5 text-sm text-gray-400">
        <Link href="/" className="hover:text-pink-600 transition">Inicio</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href="/productos" className="hover:text-pink-600 transition">Productos</Link>
        {producto.categorias?.nombre && <>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link href={`/productos?categoria=${producto.categoria_id}`} className="hover:text-pink-600 transition">{producto.categorias.nombre}</Link>
        </>}
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-gray-700 font-medium truncate max-w-[200px]">{producto.nombre}</span>
      </nav>

      {/* Main */}
      <div className="grid gap-10 md:grid-cols-2">
        {/* Left - Image */}
        <div className="md:sticky md:top-24 md:self-start md:max-h-[calc(100vh-8rem)]">
          <div className="relative aspect-square overflow-hidden rounded-2xl border border-gray-100 bg-white">
            {producto.imagen_url ? (
              <Image
                src={producto.imagen_url}
                alt={producto.nombre}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-contain p-4"
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
              <span className="absolute top-4 left-4 bg-pink-600 text-white text-[11px] font-bold uppercase px-3 py-1 rounded-md">
                {producto.stock <= 5 ? "Últimas unidades" : "Últimas cajas"}
              </span>
            )}
          </div>
        </div>

        {/* Right - Info */}
        <div className="flex flex-col">
          <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">
            {producto.nombre}
          </h1>

          {/* Price */}
          <div className="mt-4 border-b border-gray-100 pb-5">
            {currentDiscount > 0 ? (
              <>
                <div className="flex items-center gap-3">
                  <p className="text-3xl font-bold text-gray-900">
                    {formatCurrency(discountedPrice)}
                  </p>
                  <span className="bg-pink-600 text-white text-xs font-bold px-2.5 py-1 rounded-md">
                    -{currentDiscount}%
                  </span>
                </div>
                <p className="text-sm text-gray-400 line-through mt-1">
                  {formatCurrency(currentPrice)}
                </p>
                <p className="text-sm text-green-600 font-semibold mt-0.5">
                  Ahorrás {formatCurrency(savings)}
                </p>
              </>
            ) : (
              <p className="text-3xl font-bold text-gray-900">
                {formatCurrency(currentPrice)}
              </p>
            )}
            {currentPres && currentPres.cantidad > 1 ? (
              <p className="text-sm text-gray-500 mt-1">
                por caja ({currentPres.cantidad} unidades)
              </p>
            ) : (
              <p className="text-sm text-gray-500 mt-1">Precio Unitario</p>
            )}
            {boxOnlyDiscount > 0 && currentPresLabel === "Unidad" && (
              <div className="mt-2 inline-flex items-center gap-2 bg-green-50 rounded-lg px-3 py-1.5">
                <span className="bg-green-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-md">
                  -{boxOnlyDiscount}% caja
                </span>
                <span className="text-sm text-green-700">
                  comprando por caja
                </span>
              </div>
            )}
            {producto.es_combo && comboComponentes.length > 0 && (() => {
              const totalUnidades = comboComponentes.reduce((acc, c) => acc + c.cantidad, 0);
              const precioPorUnidad = totalUnidades > 0 ? currentPrice / totalUnidades : 0;
              return (
                <div className="mt-2 inline-flex items-center gap-2 bg-pink-50 border border-pink-100 rounded-lg px-3 py-1.5">
                  <Box className="w-3.5 h-3.5 text-pink-500 flex-shrink-0" />
                  <span className="text-sm text-pink-700">
                    <span className="font-semibold">{formatCurrency(precioPorUnidad)}</span>
                    <span className="text-pink-500"> por unidad · {totalUnidades} unidades totales</span>
                  </span>
                </div>
              );
            })()}
          </div>

          {/* Presentaciones */}
          {presentaciones.length > 0 && (
            <div className="mt-5">
              <p className="text-sm font-semibold text-gray-900 mb-3">Presentación</p>
              <div className="grid grid-cols-2 gap-3">
                {presentaciones
                  .map((p, idx) => ({ p, idx }))
                  .sort((a, b) => {
                    // Unit (1) first, then Medio Cartón (<1), then boxes
                    if (a.p.cantidad === 1 && b.p.cantidad !== 1) return -1;
                    if (a.p.cantidad !== 1 && b.p.cantidad === 1) return 1;
                    return a.p.cantidad - b.p.cantidad;
                  })
                  .map(({ p, idx }) => {
                  const isUnit = Number(p.cantidad) === 1;
                  const selected = selectedPresIdx === idx;
                  const presMax = Math.floor(availableStock / Number(p.cantidad));
                  const disabled = presMax <= 0;
                  return (
                    <button
                      key={p.id}
                      disabled={disabled}
                      onClick={() => { setSelectedPresIdx(idx); setCantidad((c) => Math.min(c, Math.max(1, presMax))); }}
                      className={`flex items-center justify-center gap-2 rounded-xl border-2 py-3.5 px-4 text-sm font-semibold transition-all ${
                        disabled
                          ? "border-gray-100 text-gray-300 bg-gray-50 cursor-not-allowed"
                          : selected
                          ? "border-pink-600 bg-pink-600 text-white shadow-lg shadow-pink-600/20"
                          : "border-gray-200 text-gray-700 hover:border-pink-300 bg-white"
                      }`}
                    >
                      {isUnit ? <Layers className="w-4 h-4" /> : <Box className="w-4 h-4" />}
                      {isUnit ? "Unidad" : `Caja x${p.cantidad}`}
                      {disabled && <span className="text-[10px] font-normal ml-1">(sin stock)</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Product Info Table */}
          <div className="mt-6">
            <p className="text-sm font-semibold text-gray-900 mb-3">Información del producto</p>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Categoría:</span>
                <span className="font-medium text-gray-900">{producto.categorias?.nombre ?? "—"}</span>
              </div>
              {producto.marcas?.nombre && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Marca:</span>
                  <span className="font-medium text-gray-900">{producto.marcas.nombre}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">SKU:</span>
                <span className="font-medium text-gray-900">{(currentPres?.sku || producto.codigo) || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Estado:</span>
                <span className={`font-medium ${stockColor}`}>{stockLabel}</span>
              </div>
              {(producto.updated_at || producto.fecha_actualizacion) && (() => {
                const dateStr = producto.fecha_actualizacion || producto.updated_at || "";
                const date = new Date(dateStr);
                if (isNaN(date.getTime())) return null;
                const precioAnterior = (producto as any).precio_anterior;
                const precioActual = producto.precio;
                const hasPriceChange = precioAnterior != null && precioAnterior > 0 && precioAnterior !== precioActual;
                const isUp = hasPriceChange && precioActual > precioAnterior;
                const isDown = hasPriceChange && precioActual < precioAnterior;
                return (<>
                  <div className="flex justify-between items-center pt-1 border-t border-gray-100 mt-1">
                    <span className="text-gray-500">Últ. actualización:</span>
                    <span className="font-medium text-gray-700 text-xs">
                      {date.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  </div>
                  {hasPriceChange && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">Precio anterior:</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-400 line-through">{formatCurrency(precioAnterior)}</span>
                        <span className={`text-[10px] font-bold text-white px-2 py-0.5 rounded-md ${isUp ? "bg-amber-500" : "bg-emerald-500"}`}>
                          {isUp ? "↑ Aumentó" : "↓ Bajó"}
                        </span>
                      </div>
                    </div>
                  )}
                </>);
              })()}
            </div>
          </div>

          {/* Quantity */}
          <div className="mt-6">
            <p className="text-sm font-semibold text-gray-900 mb-3">Cantidad</p>
            <div className="inline-flex items-center rounded-xl border border-gray-200">
              <button
                onClick={() => setCantidad((c) => Math.max(1, c - 1))}
                disabled={cantidad <= 1}
                className="flex h-11 w-11 items-center justify-center rounded-l-xl text-gray-500 transition hover:bg-gray-50 disabled:opacity-30"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="flex h-11 w-14 items-center justify-center border-x border-gray-200 text-center font-semibold text-gray-800">
                {cantidad}
              </span>
              <button
                onClick={() => setCantidad((c) => Math.min(maxQty, c + 1))}
                disabled={cantidad >= maxQty}
                className="flex h-11 w-11 items-center justify-center rounded-r-xl text-gray-500 transition hover:bg-gray-50 disabled:opacity-30"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Add to Cart */}
          <button
            onClick={handleAddToCart}
            disabled={!canBuy}
            className="mt-6 w-full rounded-2xl bg-pink-600 py-4 text-base font-bold uppercase tracking-wide text-white transition-all hover:bg-pink-700 hover:shadow-xl hover:shadow-pink-600/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {canBuy ? "Añadir al carrito" : presQty > 1 ? "Stock insuficiente para esta presentación" : "Sin stock"}
          </button>

          {/* Combo contents */}
          {producto.es_combo && comboComponentes.length > 0 && (() => {
            const totalUnidades = comboComponentes.reduce((a, c) => a + c.cantidad, 0);
            const valorIndividual = comboComponentes.reduce((a, c) => a + c.precio * c.cantidad, 0);
            return (
              <div className="mt-6 border border-pink-100 rounded-2xl overflow-hidden bg-pink-50/40">
                {/* Header toggle */}
                <button
                  onClick={() => setComboOpen((o) => !o)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-pink-50/60 transition"
                >
                  <span className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-pink-100">
                      <Layers className="w-4 h-4 text-pink-600" />
                    </span>
                    <span className="text-left">
                      <p className="text-sm font-semibold text-gray-900">¿Qué incluye este combo?</p>
                      <p className="text-xs text-gray-500">{totalUnidades} productos incluidos</p>
                    </span>
                  </span>
                  <ChevronRight className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${comboOpen ? "-rotate-90" : "rotate-90"}`} />
                </button>

                {comboOpen && (
                  <div className="border-t border-pink-100 bg-white">
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
                          <span className="shrink-0 bg-pink-100 text-pink-700 text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap">
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
            <h2 className="text-xl font-bold text-gray-900">Productos Relacionados</h2>
            {relacionados.length > 5 && (
              <div className="flex gap-2">
                <button
                  onClick={() => setRelScroll((s) => Math.max(0, s - 1))}
                  disabled={relScroll === 0}
                  className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 disabled:opacity-30"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setRelScroll((s) => Math.min(relacionados.length - 5, s + 1))}
                  disabled={relScroll >= relacionados.length - 5}
                  className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 disabled:opacity-30"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
          <div className="overflow-hidden">
            <div
              className="flex gap-4 transition-transform duration-300"
              style={{ transform: `translateX(-${relScroll * (100 / Math.min(5, relacionados.length))}%)` }}
            >
              {relacionados.map((rel) => {
                const pres = relPresentaciones[rel.id];
                const presIdx = relSelectedPres[rel.id] ?? 0;
                const price = pres && pres.length > 1 ? (pres[presIdx]?.precio ?? rel.precio) : rel.precio;
                const qty = relQty[rel.id] ?? 1;

                return (
                  <div
                    key={rel.id}
                    className="flex-shrink-0 w-[calc(20%-12.8px)] min-w-[180px] rounded-2xl border border-gray-100 bg-white overflow-hidden flex flex-col"
                  >
                    <Link href={`/productos/${rel.id}`}>
                      <div className="aspect-square bg-gray-100 overflow-hidden relative">
                        {rel.imagen_url ? (
                          <Image
                            src={rel.imagen_url}
                            alt={rel.nombre}
                            fill
                            className="object-contain p-4"
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
                      <Link href={`/productos/${rel.id}`}>
                        <p className="text-sm font-medium text-gray-800 line-clamp-2 min-h-[2.5rem] mt-0.5">
                          {rel.nombre}
                        </p>
                      </Link>
                      <p className="text-base font-bold text-gray-900 mt-1">
                        {formatCurrency(price)}
                      </p>

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
                                    ? "bg-pink-600 text-white border-pink-600"
                                    : "bg-white text-gray-600 border-gray-200 hover:border-pink-300"
                                }`}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Qty + Add */}
                      <div className="mt-auto pt-3 flex items-center gap-1.5">
                        <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                          <button
                            onClick={() => setRelQty((prev) => ({ ...prev, [rel.id]: Math.max(1, (prev[rel.id] ?? 1) - 1) }))}
                            className="w-8 h-8 flex items-center justify-center text-gray-500 hover:bg-gray-50"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-7 text-center text-xs font-medium">{qty}</span>
                          <button
                            onClick={() => setRelQty((prev) => ({ ...prev, [rel.id]: (prev[rel.id] ?? 1) + 1 }))}
                            className="w-8 h-8 flex items-center justify-center text-gray-500 hover:bg-gray-50"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <button
                          onClick={() => {
                            addToCart(rel, price, getRelLabel(rel), qty);
                            setRelQty((prev) => ({ ...prev, [rel.id]: 1 }));
                          }}
                          className="flex-1 bg-pink-600 hover:bg-pink-700 text-white text-xs py-2 rounded-lg font-semibold transition-colors"
                        >
                          Agregar {formatCurrency(price * qty)}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
