"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { ShoppingBag, X, Minus, Plus, Trash2, Package } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { showToast } from "@/components/tienda/toast";

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
}

const CartContext = createContext<CartContextType | null>(null);

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
  }).format(value);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    function syncFromStorage() {
      try {
        const stored = localStorage.getItem("carrito");
        if (stored) {
          const parsed = JSON.parse(stored);
          setItems(Array.isArray(parsed) ? parsed : []);
        } else setItems([]);
      } catch {}
    }
    syncFromStorage();
    window.addEventListener("cart-updated", syncFromStorage);
    window.addEventListener("storage", syncFromStorage);
    return () => {
      window.removeEventListener("cart-updated", syncFromStorage);
      window.removeEventListener("storage", syncFromStorage);
    };
  }, []);

  const persist = useCallback((next: CartItem[]) => {
    setItems(next);
    localStorage.setItem("carrito", JSON.stringify(next));
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
        const next = prev.map((i) => (i.id === id ? { ...i, cantidad } : i));
        localStorage.setItem("carrito", JSON.stringify(next));
        return next;
      });
    },
    []
  );

  const clearCart = useCallback(() => persist([]), [persist]);

  const itemCount = (items || []).reduce((sum, i) => sum + i.cantidad, 0);
  const subtotal = (items || []).reduce((sum, i) => sum + i.precio * i.cantidad, 0);

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
      }}
    >
      {children}
      <CartDrawer />
    </CartContext.Provider>
  );
}

function CartDrawer() {
  const { items, isOpen, closeCart, clearCart, updateQuantity, removeItem, subtotal, itemCount } =
    useCart();

  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Fetch stock for products in cart (refreshes every 15s while open)
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
    // Refresh stock every 15 seconds while drawer is open
    const interval = setInterval(fetchStock, 15000);
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
              <span className="rounded-full bg-pink-100 px-2.5 py-0.5 text-xs font-semibold text-pink-600">
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
              className="mt-3 text-sm text-pink-600 underline hover:text-pink-700 transition-colors"
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
                          <span className="rounded bg-pink-100 px-1.5 py-0.5 text-[10px] font-semibold text-pink-600">
                            -{item.descuento}%
                          </span>
                        </>
                      )}
                    </div>
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
                          className="flex h-8 w-8 items-center justify-center text-gray-400 hover:bg-pink-50 hover:text-pink-600 transition-colors rounded-l-lg"
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
                          className="flex h-8 w-8 items-center justify-center text-gray-400 hover:bg-pink-50 hover:text-pink-600 transition-colors rounded-r-lg disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400"
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
              {/* Progress bar */}
              {(() => {
                const MINIMO_RETIRO = 15000;
                const MINIMO_ENVIO = 50000;
                if (subtotal >= MINIMO_ENVIO) {
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
                if (subtotal >= MINIMO_RETIRO) {
                  const progress = Math.min(((subtotal - MINIMO_RETIRO) / (MINIMO_ENVIO - MINIMO_RETIRO)) * 100, 100);
                  const falta = MINIMO_ENVIO - subtotal;
                  return (
                    <div className="bg-blue-50 rounded-lg px-3 py-2">
                      <p className="text-xs text-blue-700 text-center">
                        Agregá <strong>{formatCurrency(falta)}</strong> más para envío a domicilio
                      </p>
                      <div className="w-full h-1.5 bg-blue-200 rounded-full mt-1.5">
                        <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                      </div>
                      <p className="text-[10px] text-blue-400 text-center mt-1">Retiro en local habilitado</p>
                    </div>
                  );
                }
                const progress = Math.min((subtotal / MINIMO_RETIRO) * 100, 100);
                const falta = MINIMO_RETIRO - subtotal;
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

              <div className="flex items-center justify-between">
                <span className="text-gray-500">Subtotal</span>
                <span className="text-lg font-bold text-gray-900">
                  {formatCurrency(subtotal)}
                </span>
              </div>
              <Link
                href="/checkout"
                onClick={closeCart}
                className="block w-full rounded-xl bg-pink-600 py-3.5 text-center text-base font-semibold text-white transition-all hover:bg-pink-700 hover:shadow-lg"
              >
                Iniciar compra
              </Link>
              <button
                onClick={closeCart}
                className="block w-full text-center text-sm text-gray-500 underline-offset-4 hover:text-pink-600 hover:underline transition-colors"
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
              <button onClick={() => { setShowClearConfirm(false); clearCart(); }} className="px-4 py-2 text-sm font-medium text-white bg-pink-600 rounded-xl hover:bg-pink-700 transition-colors">Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
