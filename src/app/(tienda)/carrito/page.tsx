"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Trash2, Plus, Minus, ShoppingBag, ArrowLeft, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { showToast } from "@/components/tienda/toast";
import { formatCurrency } from "@/lib/formatters";

interface CartItem {
  id: string;
  nombre: string;
  imagen_url?: string;
  imagen?: string;
  presentacion?: string;
  precio: number;
  precio_original?: number;
  descuento?: number;
  cantidad: number;
  unidades_por_presentacion?: number;
}


export default function CarritoPage() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Map of product id -> available stock in units
  const [stockMap, setStockMap] = useState<Record<string, number>>({});

  useEffect(() => {
    const raw = localStorage.getItem("carrito");
    if (raw) {
      try {
        setItems(JSON.parse(raw));
      } catch {}
    }
    setLoaded(true);

    // Sync cart across tabs
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "carrito" && e.newValue) {
        try { setItems(JSON.parse(e.newValue)); } catch {}
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  // Check real stock for all cart items (including combo component stock)
  useEffect(() => {
    if (!loaded || items.length === 0) return;
    const productIds = [...new Set(items.map((i) => i.id.split("_")[0]))];
    (async () => {
      const { data } = await supabase
        .from("productos")
        .select("id, stock, es_combo")
        .in("id", productIds);
      const map: Record<string, number> = {};
      for (const p of data || []) map[p.id] = p.stock;

      // For combo products, compute stock from components
      const comboIds = (data || []).filter((p: any) => p.es_combo).map((p: any) => p.id);
      if (comboIds.length > 0) {
        const { data: comboItems } = await supabase
          .from("combo_items")
          .select("combo_id, cantidad, productos!combo_items_producto_id_fkey(stock)")
          .in("combo_id", comboIds);
        const comboStockMap: Record<string, number> = {};
        for (const ci of (comboItems || []) as any[]) {
          const compStock = ci.productos?.stock ?? 0;
          const maxFromComp = Math.floor(compStock / (ci.cantidad || 1));
          comboStockMap[ci.combo_id] = ci.combo_id in comboStockMap
            ? Math.min(comboStockMap[ci.combo_id], maxFromComp)
            : maxFromComp;
        }
        for (const id of comboIds) {
          if (id in comboStockMap) map[id] = comboStockMap[id];
        }
      }

      setStockMap(map);

      // Notify user about out-of-stock items
      const outOfStock = items.filter((item) => {
        const prodId = item.id.split("_")[0];
        const stock = map[prodId];
        return stock !== undefined && stock <= 0;
      });
      if (outOfStock.length > 0) {
        const names = outOfStock.map((i) => i.nombre);
        const msg = names.length === 1 ? `"${names[0]}" se quedó sin stock` : `${names.length} productos se quedaron sin stock`;
        showToast(msg, { type: "error", subtitle: "Eliminá los productos agotados para continuar" });
      }
    })();
  }, [loaded, items]);

  const getPresUnits = (item: CartItem) => {
    return item.unidades_por_presentacion || (() => {
      const match = item.id.match(/[Cc]aja\s*\(?x?(\d+)\)?/);
      const isMedio = item.id.includes("Medio Cartón") || (item.presentacion && item.presentacion.toLowerCase().includes("medio"));
      return isMedio ? 0.5 : match ? Number(match[1]) : 1;
    })();
  };

  const getStockDisponible = (item: CartItem) => {
    const prodId = item.id.split("_")[0];
    const stock = stockMap[prodId];
    if (stock === undefined) return null;
    const presUnits = getPresUnits(item);
    // Subtract units consumed by OTHER cart items of the same product
    const usedByOthers = items
      .filter((i) => i.id !== item.id && i.id.split("_")[0] === prodId)
      .reduce((sum, i) => sum + i.cantidad * getPresUnits(i), 0);
    const remaining = stock - usedByOthers;
    return Math.max(0, Math.floor(remaining / (presUnits || 1)));
  };

  const hayStockInsuficiente = items.some((item) => {
    const disponible = getStockDisponible(item);
    return disponible !== null && item.cantidad > disponible;
  });

  const persist = (updated: CartItem[]) => {
    setItems(updated);
    localStorage.setItem("carrito", JSON.stringify(updated));
    window.dispatchEvent(new Event("cart-updated"));
  };

  const updateQty = (id: string, delta: number) => {
    const updated = items
      .map((i) =>
        i.id === id ? { ...i, cantidad: i.cantidad + delta } : i
      )
      .filter((i) => i.cantidad > 0);
    persist(updated);
  };

  const remove = (id: string) => {
    const removed = items.find((i) => i.id === id);
    persist(items.filter((i) => i.id !== id));
    if (removed) showToast(removed.nombre, { type: "info", subtitle: "Eliminado del carrito" });
  };

  const subtotal = items.reduce((s, i) => s + i.precio * i.cantidad, 0);
  const totalSavings = items.reduce((sum, item) => {
    if (!item.precio_original || item.precio_original <= item.precio) return sum;
    return sum + (item.precio_original - item.precio) * item.cantidad;
  }, 0);

  if (!loaded) return null;

  if (items.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center">
        <ShoppingBag className="mx-auto h-16 w-16 text-gray-300 mb-4" />
        <h1 className="text-2xl font-bold mb-2">Tu carrito está vacío</h1>
        <p className="text-gray-500 mb-6">
          Agregá productos para comenzar tu pedido.
        </p>
        <Link
          href="/productos"
          className="inline-flex items-center gap-2 bg-primary text-white px-6 py-2.5 rounded-xl font-medium hover:bg-primary/90 transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Ver productos
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 pt-6 pb-32 sm:pb-8">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl sm:text-2xl font-bold">Mi Carrito</h1>
        <span className="text-sm text-gray-500">{items.reduce((s, i) => s + i.cantidad, 0)} productos</span>
      </div>

      <div className="space-y-3">
        {items.map((item) => {
          const disponible = getStockDisponible(item);
          const sinStock = disponible !== null && disponible <= 0;
          const stockBajo = disponible !== null && disponible > 0 && item.cantidad > disponible;
          return (
          <div
            key={item.id}
            className={`bg-white rounded-xl border p-3 sm:p-4 ${sinStock ? "opacity-60 border-red-300 bg-red-50/50" : stockBajo ? "border-amber-300 bg-amber-50/50" : "border-gray-100"}`}
          >
            <div className="flex gap-3">
              {/* Image */}
              <div className="relative h-16 w-16 sm:h-20 sm:w-20 flex-shrink-0 rounded-lg overflow-hidden bg-gray-50">
                {(item.imagen_url || item.imagen) ? (
                  <Image
                    src={(item.imagen_url || item.imagen)!}
                    alt={item.nombre}
                    fill
                    sizes="80px"
                    className="object-contain p-1"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-gray-300">
                    <ShoppingBag className="h-5 w-5" />
                  </div>
                )}
              </div>

              {/* Info + price */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 line-clamp-2">{item.nombre}</p>
                    {item.presentacion && <p className="text-xs text-gray-400 mt-0.5">{item.presentacion}</p>}
                  </div>
                  <button
                    onClick={() => remove(item.id)}
                    aria-label="Eliminar producto"
                    className="text-gray-300 hover:text-red-500 transition p-0.5 shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {sinStock && (
                  <p className="text-xs text-red-600 font-semibold flex items-center gap-1 mt-1">
                    <AlertTriangle className="h-3 w-3" />Producto agotado
                  </p>
                )}
                {stockBajo && (
                  <p className="text-xs text-amber-600 font-semibold flex items-center gap-1 mt-1">
                    <AlertTriangle className="h-3 w-3" />Solo {disponible} disponible{disponible !== 1 ? "s" : ""}
                  </p>
                )}

                {/* Qty + Price row */}
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center bg-gray-100 rounded-lg overflow-hidden">
                    <button
                      onClick={() => updateQty(item.id, -1)}
                      className="w-8 h-8 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className={`w-8 text-center text-sm font-semibold tabular-nums ${sinStock || stockBajo ? "text-red-600" : "text-gray-800"}`}>
                      {item.cantidad}
                    </span>
                    <button
                      onClick={() => updateQty(item.id, 1)}
                      disabled={sinStock}
                      className="w-8 h-8 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition disabled:opacity-30"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                  <p className="text-base font-bold text-gray-900">{formatCurrency(item.precio * item.cantidad)}</p>
                </div>
              </div>
            </div>
          </div>
          );
        })}
      </div>

      <div className="mt-4">
        <Link
          href="/productos"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/90 font-medium transition"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Seguir comprando
        </Link>
      </div>

      {/* Sticky bottom bar on mobile */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 flex items-center justify-between gap-4 sm:static sm:border-t-0 sm:mt-6 sm:p-0 sm:pt-6 sm:border-t sm:border-gray-200 z-40">
        <div>
          <p className="text-xs text-gray-500">Subtotal</p>
          <p className="text-lg font-bold">{formatCurrency(subtotal)}</p>
          {totalSavings > 0 && (
            <p className="text-xs text-green-600 font-semibold mt-0.5">
              Ahorrás {formatCurrency(totalSavings)}
            </p>
          )}
        </div>
        {hayStockInsuficiente ? (
          <span className="bg-gray-200 text-gray-500 px-6 py-3 rounded-xl text-sm font-medium cursor-not-allowed flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Revisá tu carrito
          </span>
        ) : (
          <Link
            href="/checkout"
            className="bg-primary text-white px-6 py-3 rounded-xl text-sm font-semibold hover:bg-primary/90 transition shadow-lg shadow-primary/20"
          >
            Ir al checkout
          </Link>
        )}
      </div>
    </div>
  );
}
