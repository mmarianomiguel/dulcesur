"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Trash2, Plus, Minus, ShoppingBag, ArrowLeft, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";

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
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
  }).format(value);

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
  }, []);

  // Check real stock for all cart items
  useEffect(() => {
    if (!loaded || items.length === 0) return;
    const productIds = [...new Set(items.map((i) => i.id.split("_")[0]))];
    supabase
      .from("productos")
      .select("id, stock")
      .in("id", productIds)
      .then(({ data }) => {
        const map: Record<string, number> = {};
        for (const p of data || []) map[p.id] = p.stock;
        setStockMap(map);
      });
  }, [loaded, items]);

  const getStockDisponible = (item: CartItem) => {
    const prodId = item.id.split("_")[0];
    const stock = stockMap[prodId];
    if (stock === undefined) return null; // still loading
    const match = item.id.match(/Caja \(x(\d+)\)/);
    const isMedio = item.id.includes("Medio Cartón") || (item.presentacion && item.presentacion.toLowerCase().includes("medio"));
    const presUnits = isMedio ? 0.5 : match ? Number(match[1]) : 1;
    return Math.floor(stock / presUnits);
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
    persist(items.filter((i) => i.id !== id));
  };

  const subtotal = items.reduce((s, i) => s + i.precio * i.cantidad, 0);

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
          className="inline-flex items-center gap-2 bg-pink-500 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-pink-600 transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Ver productos
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Mi Carrito</h1>

      <div className="space-y-4">
        {items.map((item) => {
          const disponible = getStockDisponible(item);
          const sinStock = disponible !== null && disponible <= 0;
          const stockBajo = disponible !== null && disponible > 0 && item.cantidad > disponible;
          return (
          <div
            key={item.id}
            className={`flex items-center gap-4 bg-white rounded-xl border p-4 ${sinStock ? "opacity-60 border-red-300 bg-red-50/50" : stockBajo ? "border-amber-300 bg-amber-50/50" : ""}`}
          >
            <div className="relative h-16 w-16 flex-shrink-0 rounded-lg overflow-hidden bg-gray-50 border border-gray-100">
              {(item.imagen_url || item.imagen) ? (
                <Image
                  src={(item.imagen_url || item.imagen)!}
                  alt={item.nombre}
                  fill
                  className="object-contain p-1"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-gray-400">
                  <ShoppingBag className="h-6 w-6" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{item.nombre}</p>
              <p className="text-sm text-gray-500">{item.presentacion}</p>
              {sinStock && (
                <p className="text-xs text-red-600 font-semibold flex items-center gap-1 mt-1">
                  <AlertTriangle className="h-3 w-3" />
                  Producto agotado
                </p>
              )}
              {stockBajo && (
                <p className="text-xs text-amber-600 font-semibold flex items-center gap-1 mt-1">
                  <AlertTriangle className="h-3 w-3" />
                  Solo {disponible} disponible{disponible !== 1 ? "s" : ""}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => updateQty(item.id, -1)}
                className="h-8 w-8 flex items-center justify-center rounded-lg border hover:bg-gray-50 transition"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className={`w-8 text-center font-medium ${sinStock || stockBajo ? "text-red-600" : ""}`}>
                {item.cantidad}
              </span>
              <button
                onClick={() => updateQty(item.id, 1)}
                className="h-8 w-8 flex items-center justify-center rounded-lg border hover:bg-gray-50 transition"
                disabled={sinStock}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <div className="text-right w-24 flex-shrink-0">
              <p className="text-sm text-gray-500">
                {formatCurrency(item.precio)}
              </p>
              <p className="font-semibold">
                {formatCurrency(item.precio * item.cantidad)}
              </p>
            </div>

            <button
              onClick={() => remove(item.id)}
              className="text-gray-400 hover:text-red-500 transition p-1"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </div>
          );
        })}
      </div>

      <div className="mt-8 border-t pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <Link
          href="/productos"
          className="inline-flex items-center gap-2 text-pink-600 hover:text-pink-700 font-medium transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Continuar comprando
        </Link>

        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-sm text-gray-500">Subtotal</p>
            <p className="text-xl font-bold">{formatCurrency(subtotal)}</p>
          </div>
          {hayStockInsuficiente ? (
            <span className="bg-gray-300 text-gray-500 px-8 py-2.5 rounded-lg font-medium cursor-not-allowed flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Revisá tu carrito
            </span>
          ) : (
            <Link
              href="/checkout"
              className="bg-pink-500 text-white px-8 py-2.5 rounded-lg font-medium hover:bg-pink-600 transition"
            >
              Ir al checkout
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
