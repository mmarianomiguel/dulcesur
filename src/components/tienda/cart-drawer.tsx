"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { ShoppingBag, X, Minus, Plus, Trash2, Package } from "lucide-react";
import { supabase } from "@/lib/supabase";

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
        if (stored) setItems(JSON.parse(stored));
        else setItems([]);
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
      setItems((prev) => {
        const next = prev.filter((i) => i.id !== id);
        localStorage.setItem("carrito", JSON.stringify(next));
        return next;
      });
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

  const itemCount = items.reduce((sum, i) => sum + i.cantidad, 0);
  const subtotal = items.reduce((sum, i) => sum + i.precio * i.cantidad, 0);

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
  const { items, isOpen, closeCart, updateQuantity, removeItem, subtotal, itemCount } =
    useCart();

  // Fetch stock for products in cart
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!isOpen || items.length === 0) return;
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
  }, [isOpen, items]);

  function getMaxQty(item: CartItem) {
    const prodId = item.id.split("_")[0];
    const totalStock = stockMap[prodId];
    if (totalStock === undefined) return 999;
    // Get units per presentation from cart key
    const match = item.id.match(/Caja \(x(\d+)\)/);
    const presUnits = match ? Number(match[1]) : 1;
    // Total units used by OTHER items of same product
    const otherUnits = items
      .filter((i) => i.id !== item.id && i.id.startsWith(prodId + "_"))
      .reduce((sum, i) => {
        if (i.id.includes("Medio Cartón")) return sum + i.cantidad * 0.5;
        const m = i.id.match(/Caja \(x(\d+)\)/);
        return sum + i.cantidad * (m ? Number(m[1]) : 1);
      }, 0);
    // Also count items with just prodId (no underscore)
    const sameIdNoSuffix = items
      .filter((i) => i.id === prodId && item.id !== prodId)
      .reduce((sum, i) => sum + i.cantidad, 0);
    const available = totalStock - otherUnits - sameIdNoSuffix;
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
          <button
            onClick={closeCart}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
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
                  <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
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
                    {item.presentacion && (
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
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Subtotal</span>
                <span className="text-lg font-bold text-gray-900">
                  {formatCurrency(subtotal)}
                </span>
              </div>
              <p className="text-xs text-gray-400">
                El costo de envío se calcula en el checkout
              </p>
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
    </>
  );
}
