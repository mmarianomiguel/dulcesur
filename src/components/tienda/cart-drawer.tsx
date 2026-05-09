"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { ShoppingBag, X, Minus, Plus, Trash2, Package } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { showToast } from "@/components/tienda/toast";
import { formatCurrency } from "@/lib/formatters";

interface CartItem {
  id: string;
  nombre: string;
  presentacion: string;
  precio: number;
  cantidad: number;
  imagen?: string;
  imagen_url?: string;
  precio_original?: number;
  descuento?: number;
  unidades_por_presentacion?: number;
  cantidad_minima?: number;
  categoria_id?: string; // opcional: para items viejos se backfillea on-demand
}

interface CheckoutDisplayConfig {
  categoriasExcluidasEnvio: string[];
  excluidasAplicanARetiro: boolean;
  mostrarProgreso: boolean;
  mostrarDesglose: boolean;
  mostrarBadge: boolean;
  textoBadge: string;
  mensajeMinimo: string;
}

interface CartContextType {
  items: CartItem[];
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  addItem: (item: CartItem) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, cantidad: number) => void;
  clearCart: () => void;
  itemCount: number;
  subtotal: number;
  subtotalElegibleEnvio: number;
  subtotalElegibleRetiro: number;
  totalExcluidoEnvio: number;
  hayExcluidosEnvio: boolean;
  minimoRetiro: number;
  minimoEnvio: number;
  checkoutConfig: CheckoutDisplayConfig;
  isCategoriaExcluidaEnvio: (categoriaId: string | null | undefined) => boolean;
  isItemExcluidoEnvio: (item: { id: string; categoria_id?: string }) => boolean;
  // Etiqueta amigable de las categorías excluidas (ej: "Cigarros" o "Cigarros y Bebidas")
  excluidasLabel: string;
}

const CartContext = createContext<CartContextType | null>(null);

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}


const DEFAULT_CHECKOUT_CONFIG: CheckoutDisplayConfig = {
  categoriasExcluidasEnvio: [],
  excluidasAplicanARetiro: false,
  mostrarProgreso: true,
  mostrarDesglose: true,
  mostrarBadge: true,
  textoBadge: "No suma al mínimo de envío",
  mensajeMinimo: "Sumá {faltante} más en productos para llegar al mínimo de {minimo} y activar el envío a domicilio.",
};

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [minimoRetiro, setMinimoRetiro] = useState(15000);
  const [minimoEnvio, setMinimoEnvio] = useState(50000);
  const [checkoutConfig, setCheckoutConfig] = useState<CheckoutDisplayConfig>(DEFAULT_CHECKOUT_CONFIG);
  // Map productId -> categoriaId, para items viejos del localStorage que no la tienen guardada
  const [categoriaPorProducto, setCategoriaPorProducto] = useState<Record<string, string>>({});
  // Nombres de las categorías excluidas (para mostrar amigable en UI)
  const [excluidasNombres, setExcluidasNombres] = useState<string[]>([]);
  // Flag del cliente logueado: si true, las categorías excluidas SÍ cuentan al mínimo para él
  const [clienteIgnoraExcluidas, setClienteIgnoraExcluidas] = useState(false);

  useEffect(() => {
    const CART_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
    function refreshTimestamp() {
      localStorage.setItem("carrito_ts", String(Date.now()));
    }
    function syncFromStorage() {
      try {
        const stored = localStorage.getItem("carrito");
        const ts = Number(localStorage.getItem("carrito_ts") || 0);
        const expired = stored && (!ts || Date.now() - ts > CART_TTL_MS);
        if (expired) {
          localStorage.removeItem("carrito");
          localStorage.removeItem("carrito_ts");
          setItems([]);
          return;
        }
        if (stored) {
          const parsed = JSON.parse(stored);
          const arr = Array.isArray(parsed) ? parsed : [];
          setItems(arr);
          if (arr.length > 0 && !ts) refreshTimestamp(); // first-time stamp for pre-existing carts
        } else setItems([]);
      } catch {}
    }
    function onCartUpdated() {
      refreshTimestamp();
      syncFromStorage();
    }
    syncFromStorage();
    window.addEventListener("cart-updated", onCartUpdated);
    window.addEventListener("storage", syncFromStorage);
    return () => {
      window.removeEventListener("cart-updated", onCartUpdated);
      window.removeEventListener("storage", syncFromStorage);
    };
  }, []);

  // Fetch minimum amounts + checkout display config from tienda_config.
  // Defensivo: si las columnas nuevas no existen aún en BD, mantenemos los defaults.
  useEffect(() => {
    supabase
      .from("tienda_config")
      .select(
        "monto_minimo_pedido, monto_minimo_envio, umbral_envio_gratis, categorias_excluidas_minimo, excluidas_aplican_a_retiro, mostrar_progreso_minimo, mostrar_desglose_excluidos, mostrar_badge_excluidos, texto_badge_excluidos, mensaje_minimo_no_alcanzado"
      )
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          // Fallback: si la query falla porque las columnas nuevas no existen,
          // pedimos solo las viejas para no romper nada.
          supabase
            .from("tienda_config")
            .select("monto_minimo_pedido, monto_minimo_envio, umbral_envio_gratis")
            .single()
            .then(({ data: legacy }) => {
              if (legacy) {
                const d = legacy as { monto_minimo_pedido?: number; monto_minimo_envio?: number; umbral_envio_gratis?: number };
                setMinimoRetiro(d.monto_minimo_pedido ?? 15000);
                setMinimoEnvio(d.monto_minimo_envio ?? d.umbral_envio_gratis ?? 50000);
              }
            });
          return;
        }
        const d = data as Record<string, unknown>;
        setMinimoRetiro((d.monto_minimo_pedido as number | null) ?? 15000);
        setMinimoEnvio(((d.monto_minimo_envio as number | null) ?? (d.umbral_envio_gratis as number | null)) ?? 50000);
        setCheckoutConfig({
          categoriasExcluidasEnvio: (d.categorias_excluidas_minimo as string[] | null) ?? [],
          excluidasAplicanARetiro: (d.excluidas_aplican_a_retiro as boolean | null) ?? false,
          mostrarProgreso: (d.mostrar_progreso_minimo as boolean | null) ?? true,
          mostrarDesglose: (d.mostrar_desglose_excluidos as boolean | null) ?? true,
          mostrarBadge: (d.mostrar_badge_excluidos as boolean | null) ?? true,
          textoBadge: (d.texto_badge_excluidos as string | null) ?? DEFAULT_CHECKOUT_CONFIG.textoBadge,
          mensajeMinimo: (d.mensaje_minimo_no_alcanzado as string | null) ?? DEFAULT_CHECKOUT_CONFIG.mensajeMinimo,
        });
      });
  }, []);

  // Cargar flag del cliente logueado (si lo hay) para saber si está exento de la regla de exclusión.
  useEffect(() => {
    const cargar = () => {
      const auth = typeof window !== "undefined" ? localStorage.getItem("cliente_auth") : null;
      if (!auth) { setClienteIgnoraExcluidas(false); return; }
      let parsed: { id?: string } | null = null;
      try { parsed = JSON.parse(auth); } catch { parsed = null; }
      if (!parsed?.id) { setClienteIgnoraExcluidas(false); return; }
      supabase
        .from("clientes_auth")
        .select("cliente_id")
        .eq("id", parsed.id)
        .maybeSingle()
        .then(({ data: authRec }) => {
          if (!authRec?.cliente_id) { setClienteIgnoraExcluidas(false); return; }
          supabase
            .from("clientes")
            .select("ignora_categorias_excluidas")
            .eq("id", authRec.cliente_id)
            .maybeSingle()
            .then(({ data: cli }) => {
              setClienteIgnoraExcluidas(!!(cli as { ignora_categorias_excluidas?: boolean } | null)?.ignora_categorias_excluidas);
            });
        });
    };
    cargar();
    // Recargar si el localStorage de auth cambia (login/logout en otra pestaña o evento manual)
    const onStorage = (e: StorageEvent) => { if (!e.key || e.key === "cliente_auth") cargar(); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Cuando cambian las categorías excluidas, traemos sus nombres para usar en UI.
  useEffect(() => {
    const ids = checkoutConfig.categoriasExcluidasEnvio;
    if (ids.length === 0) {
      setExcluidasNombres([]);
      return;
    }
    supabase
      .from("categorias")
      .select("id, nombre")
      .in("id", ids)
      .then(({ data }) => {
        if (!data) return;
        setExcluidasNombres((data as { nombre: string }[]).map((c) => c.nombre));
      });
  }, [checkoutConfig.categoriasExcluidasEnvio]);

  // Backfill categoria_id para items viejos del carrito que no la tengan persistida.
  useEffect(() => {
    const idsFaltantes = items
      .filter((it) => !it.categoria_id)
      .map((it) => it.id.split("_")[0])
      .filter((pid) => !categoriaPorProducto[pid]);
    const unicos = [...new Set(idsFaltantes)];
    if (unicos.length === 0) return;
    supabase
      .from("productos")
      .select("id, categoria_id")
      .in("id", unicos)
      .then(({ data }) => {
        if (!data) return;
        setCategoriaPorProducto((prev) => {
          const next = { ...prev };
          (data as { id: string; categoria_id: string | null }[]).forEach((p) => {
            if (p.categoria_id) next[p.id] = p.categoria_id;
          });
          return next;
        });
      });
  }, [items, categoriaPorProducto]);

  const persist = useCallback((next: CartItem[]) => {
    setItems(next);
    localStorage.setItem("carrito", JSON.stringify(next));
    window.dispatchEvent(new Event("cart-updated"));
  }, []);

  const addItem = useCallback(
    (item: CartItem) => {
      setItems((prev) => {
        const existing = prev.find((i) => i.id === item.id);
        const next = existing
          ? prev.map((i) =>
              i.id === item.id ? { ...i, cantidad: i.cantidad + item.cantidad } : i
            )
          : [...prev, item];
        localStorage.setItem("carrito", JSON.stringify(next));
        window.dispatchEvent(new Event("cart-updated"));
        return next;
      });
      setIsOpen(true);
    },
    []
  );

  const removeItem = useCallback(
    (id: string) => {
      let removedName = "";
      setItems((prev) => {
        const removed = prev.find((i) => i.id === id);
        if (removed) removedName = removed.nombre;
        const next = prev.filter((i) => i.id !== id);
        localStorage.setItem("carrito", JSON.stringify(next));
        window.dispatchEvent(new Event("cart-updated"));
        return next;
      });
      if (removedName) {
        setTimeout(() => showToast(removedName, { type: "info", subtitle: "Eliminado del carrito" }), 0);
      }
    },
    []
  );

  const updateQuantity = useCallback(
    (id: string, cantidad: number) => {
      if (cantidad < 1) return;
      setItems((prev) => {
        const next = prev.map((i) => {
          if (i.id !== id) return i;

          // Si el item tiene un descuento por cantidad mínima,
          // verificar si la nueva cantidad sigue cumpliendo el mínimo
          if (
            i.descuento &&
            i.descuento > 0 &&
            i.precio_original &&
            i.cantidad_minima &&
            i.cantidad_minima > 0 &&
            cantidad < i.cantidad_minima
          ) {
            return {
              ...i,
              cantidad,
              precio: i.precio_original,
              precio_original: undefined,
              descuento: undefined,
            };
          }

          return { ...i, cantidad };
        });
        localStorage.setItem("carrito", JSON.stringify(next));
        window.dispatchEvent(new Event("cart-updated"));
        return next;
      });
    },
    []
  );

  const clearCart = useCallback(() => persist([]), [persist]);

  const itemCount = (items || []).reduce((sum, i) => sum + i.cantidad, 0);
  const subtotal = (items || []).reduce((sum, i) => sum + i.precio * i.cantidad, 0);

  const excluidasSet = new Set(checkoutConfig.categoriasExcluidasEnvio);
  const getCategoriaIdItem = (it: CartItem): string | undefined =>
    it.categoria_id || categoriaPorProducto[it.id.split("_")[0]];

  const isCategoriaExcluidaEnvio = (categoriaId: string | null | undefined) =>
    !!categoriaId && excluidasSet.has(categoriaId);

  const isItemExcluidoEnvio = (item: { id: string; categoria_id?: string }) => {
    if (clienteIgnoraExcluidas) return false;
    const cat = item.categoria_id || categoriaPorProducto[item.id.split("_")[0]];
    return isCategoriaExcluidaEnvio(cat);
  };

  const excluidasLabel = (() => {
    if (excluidasNombres.length === 0) return "";
    if (excluidasNombres.length === 1) return excluidasNombres[0];
    if (excluidasNombres.length === 2) return `${excluidasNombres[0]} y ${excluidasNombres[1]}`;
    return excluidasNombres.slice(0, -1).join(", ") + " y " + excluidasNombres[excluidasNombres.length - 1];
  })();

  // Si el cliente está marcado para ignorar la regla, las categorías excluidas no se descuentan.
  const totalExcluidoEnvio = clienteIgnoraExcluidas
    ? 0
    : (items || []).reduce((sum, i) => {
        const cat = getCategoriaIdItem(i);
        return isCategoriaExcluidaEnvio(cat) ? sum + i.precio * i.cantidad : sum;
      }, 0);

  const subtotalElegibleEnvio = subtotal - totalExcluidoEnvio;
  const subtotalElegibleRetiro = !clienteIgnoraExcluidas && checkoutConfig.excluidasAplicanARetiro
    ? subtotalElegibleEnvio
    : subtotal;
  const hayExcluidosEnvio = totalExcluidoEnvio > 0;

  return (
    <CartContext.Provider
      value={{
        items,
        isOpen,
        openCart: () => setIsOpen(true),
        closeCart: () => setIsOpen(false),
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        itemCount,
        subtotal,
        subtotalElegibleEnvio,
        subtotalElegibleRetiro,
        totalExcluidoEnvio,
        hayExcluidosEnvio,
        minimoRetiro,
        minimoEnvio,
        checkoutConfig,
        isCategoriaExcluidaEnvio,
        isItemExcluidoEnvio,
        excluidasLabel,
      }}
    >
      {children}
      <CartDrawer />
    </CartContext.Provider>
  );
}

function CartDrawer() {
  const {
    items,
    isOpen,
    closeCart,
    clearCart,
    updateQuantity,
    removeItem,
    subtotal,
    subtotalElegibleEnvio,
    subtotalElegibleRetiro,
    totalExcluidoEnvio,
    hayExcluidosEnvio,
    itemCount,
    minimoRetiro,
    minimoEnvio,
    checkoutConfig,
    isCategoriaExcluidaEnvio,
    excluidasLabel,
  } = useCart();

  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Fetch stock for products in cart (refreshes every 60s while open)
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!isOpen || items.length === 0) return;
    const fetchStock = () => {
      const productIds = [...new Set(items.map((i) => i.id.split("_")[0]))];
      supabase
        .from("productos")
        .select("id, stock")
        .in("id", productIds)
        .then(({ data }) => {
          if (data) {
            const map: Record<string, number> = {};
            data.forEach((p: { id: string; stock: number }) => { map[p.id] = p.stock; });
            setStockMap(map);
          }
        });
    };
    fetchStock();
    const interval = setInterval(fetchStock, 60000);
    return () => clearInterval(interval);
  }, [isOpen, items]);

  function getMaxQty(item: CartItem) {
    const prodId = item.id.split("_")[0];
    const totalStock = stockMap[prodId];
    if (totalStock === undefined) return item.cantidad; // Stock loading — keep current, can't increase
    const presUnits = item.unidades_por_presentacion || 1;
    // Total units used by ALL items of same product (including this one excluded below)
    let otherUnitsTotal = 0;
    items.forEach((i) => {
      if (i.id === item.id) return; // skip self
      const iProdId = i.id.split("_")[0];
      if (iProdId === prodId) {
        otherUnitsTotal += (i.cantidad || 0) * (i.unidades_por_presentacion || 1);
      }
    });
    const available = totalStock - otherUnitsTotal;
    return Math.max(0, Math.floor(available / presUnits));
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={closeCart}
      />

      {/* Drawer */}
      <div
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-[420px] flex-col bg-white shadow-2xl transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-800">
              <ShoppingBag className="h-5 w-5" />
              Mi carrito
            </h2>
            {itemCount > 0 && (
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                {itemCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {items.length > 0 && (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors px-2 py-1 rounded hover:bg-red-50"
              >
                Vaciar
              </button>
            )}
            <button
              onClick={closeCart}
              className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
            >
              <X className="h-4 w-4 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Items */}
        {items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 text-center">
            <ShoppingBag className="mx-auto h-16 w-16 text-gray-200" />
            <p className="mt-4 text-gray-500">Tu carrito está vacío</p>
            <button
              onClick={closeCart}
              className="mt-3 text-sm text-primary underline hover:text-primary/90 transition-colors"
            >
              Descubrí nuestros productos
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex gap-4 border-b border-gray-50 py-4 last:border-0"
                >
                  {/* Image */}
                  <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
                    {(item.imagen || item.imagen_url) ? (
                      <Image
                        src={(item.imagen || item.imagen_url)!}
                        alt={item.nombre}
                        fill
                        sizes="96px"
                        className="object-contain p-1"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Package className="h-8 w-8 text-gray-300" />
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex flex-1 flex-col">
                    <span className="line-clamp-2 text-sm font-medium text-gray-800">
                      {item.nombre}
                    </span>
                    {item.presentacion && !item.nombre?.includes(item.presentacion) && item.presentacion !== "Unidad" && (
                      <span className="mt-0.5 text-xs text-gray-400">
                        {item.presentacion}
                      </span>
                    )}
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="text-sm font-bold text-gray-900">
                        {formatCurrency(item.precio)}
                      </span>
                      {item.descuento && item.descuento > 0 && item.precio_original && (
                        <>
                          <span className="text-xs text-gray-400 line-through">
                            {formatCurrency(item.precio_original)}
                          </span>
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                            -{Number.isInteger(item.descuento) ? item.descuento : Number(item.descuento?.toFixed(1))}%
                          </span>
                        </>
                      )}
                    </div>
                    {/* Aviso de descuento perdido por cantidad */}
                    {item.cantidad_minima && item.cantidad_minima > 0 && !item.descuento && item.cantidad < item.cantidad_minima && (
                      <p className="text-[10px] text-amber-600 mt-1">
                        Agregá {item.cantidad_minima - item.cantidad} más para recuperar el descuento
                      </p>
                    )}
                    <div className="mt-2 flex items-center">
                      {/* Quantity controls */}
                      {(() => {
                        const maxQty = getMaxQty(item);
                        const atMax = item.cantidad >= maxQty;
                        const isMedio = item.presentacion?.toLowerCase().includes("medio") || item.id.includes("Medio");
                        const step = isMedio ? 0.5 : 1;
                        const displayQty = isMedio ? item.cantidad * 0.5 : item.cantidad;
                        return (
                      <div className="inline-flex items-center rounded-lg border border-gray-200">
                        <button
                          onClick={() => updateQuantity(item.id, item.cantidad - 1)}
                          aria-label="Disminuir cantidad"
                          className="flex h-8 w-8 items-center justify-center text-gray-400 hover:bg-primary/5 hover:text-primary transition-colors rounded-l-lg"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="flex h-8 w-10 items-center justify-center text-center text-sm font-semibold text-gray-800">
                          {isMedio ? displayQty : item.cantidad}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.id, Math.min(item.cantidad + 1, maxQty))}
                          disabled={atMax}
                          aria-label="Aumentar cantidad"
                          className="flex h-8 w-8 items-center justify-center text-gray-400 hover:bg-primary/5 hover:text-primary transition-colors rounded-r-lg disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                        );
                      })()}
                      {/* Remove */}
                      <button
                        onClick={() => removeItem(item.id)}
                        className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Line total */}
                  <div className="flex-shrink-0 self-center">
                    <span className="text-sm font-semibold text-gray-900">
                      {formatCurrency(item.precio * item.cantidad)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-100 p-6 space-y-4">
              {/* Progress bar — usa subtotal elegible para evaluar el mínimo de envío */}
              {checkoutConfig.mostrarProgreso && (() => {
                const MINIMO_RETIRO = minimoRetiro;
                const MINIMO_ENVIO = minimoEnvio;
                const subtotalEnvio = subtotalElegibleEnvio;
                const subtotalRetiro = subtotalElegibleRetiro;
                if (subtotalEnvio >= MINIMO_ENVIO) {
                  return (
                    <div className="bg-green-50 rounded-lg px-3 py-2">
                      <p className="text-xs font-semibold text-green-700 text-center">
                        ¡Pedido habilitado para envío a domicilio!
                      </p>
                      <div className="w-full h-1.5 bg-green-200 rounded-full mt-1.5">
                        <div className="h-full bg-green-500 rounded-full" style={{ width: "100%" }} />
                      </div>
                    </div>
                  );
                }
                if (subtotalRetiro >= MINIMO_RETIRO) {
                  const progress = Math.min(((subtotalEnvio - MINIMO_RETIRO) / Math.max(1, MINIMO_ENVIO - MINIMO_RETIRO)) * 100, 100);
                  const falta = MINIMO_ENVIO - subtotalEnvio;
                  return (
                    <div className="bg-blue-50 rounded-lg px-3 py-2">
                      <p className="text-xs text-blue-700 text-center">
                        Agregá <strong>{formatCurrency(falta)}</strong> más para envío a domicilio
                      </p>
                      <div className="w-full h-1.5 bg-blue-200 rounded-full mt-1.5">
                        <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${Math.max(0, progress)}%` }} />
                      </div>
                      <p className="text-[10px] text-blue-400 text-center mt-1">
                        Retiro en local habilitado
                        {hayExcluidosEnvio && excluidasLabel && ` · ${excluidasLabel} no suma al envío`}
                      </p>
                    </div>
                  );
                }
                const progress = Math.min((subtotalRetiro / MINIMO_RETIRO) * 100, 100);
                const falta = MINIMO_RETIRO - subtotalRetiro;
                return (
                  <div className="bg-amber-50 rounded-lg px-3 py-2">
                    <p className="text-xs text-amber-700 text-center">
                      Agregá <strong>{formatCurrency(falta)}</strong> más para poder comprar
                    </p>
                    <div className="w-full h-1.5 bg-amber-200 rounded-full mt-1.5">
                      <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                    </div>
                    <p className="text-[10px] text-amber-400 text-center mt-1">Mínimo ${new Intl.NumberFormat("es-AR").format(MINIMO_RETIRO)} para retiro</p>
                  </div>
                );
              })()}

              {/* Desglose: si hay excluidos del envío, mostramos ambos subtotales */}
              {hayExcluidosEnvio && checkoutConfig.mostrarDesglose ? (
                <div className="space-y-1 text-sm">
                  <div className="flex items-center justify-between text-gray-700">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Cuenta para envío
                    </span>
                    <span className="font-medium tabular-nums">{formatCurrency(subtotalElegibleEnvio)}</span>
                  </div>
                  <div className="flex items-center justify-between text-gray-400 pl-3.5">
                    <span className="italic">{excluidasLabel || "Productos excluidos"} no suma al envío</span>
                    <span className="tabular-nums">{formatCurrency(totalExcluidoEnvio)}</span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                    <span className="text-gray-500">Total</span>
                    <span className="text-lg font-bold text-gray-900 tabular-nums">{formatCurrency(subtotal)}</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="text-lg font-bold text-gray-900">
                    {formatCurrency(subtotal)}
                  </span>
                </div>
              )}
              <Link
                href="/checkout"
                onClick={() => { closeCart(); window.scrollTo(0, 0); }}
                className="block w-full rounded-xl bg-primary py-3.5 text-center text-base font-semibold text-white transition-all hover:bg-primary/90 hover:shadow-lg"
              >
                Iniciar compra
              </Link>
              <button
                onClick={closeCart}
                className="block w-full text-center text-sm text-gray-500 underline-offset-4 hover:text-primary hover:underline transition-colors"
              >
                Seguir comprando
              </button>
            </div>
          </>
        )}
      </div>

      {/* Clear cart confirmation */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowClearConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 mx-4 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900">Confirmar acción</h3>
            <p className="text-sm text-gray-500 mt-2">¿Vaciar todo el carrito?</p>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowClearConfirm(false)} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">Cancelar</button>
              <button onClick={() => { setShowClearConfirm(false); clearCart(); }} className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-xl hover:bg-primary/90 transition-colors">Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
