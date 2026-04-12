"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShoppingCart, X } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

const DISMISS_KEY = "cart_recovery_dismissed_at";
const IDLE_MS = 30 * 60 * 1000;

interface CartItem {
  precio: number;
  cantidad: number;
}

export default function CartRecoveryBanner() {
  const [visible, setVisible] = useState(false);
  const [subtotal, setSubtotal] = useState(0);
  const [count, setCount] = useState(0);

  useEffect(() => {
    function check() {
      try {
        const raw = localStorage.getItem("carrito");
        if (!raw) return;
        const items: CartItem[] = JSON.parse(raw);
        if (!Array.isArray(items) || items.length === 0) return;
        const dismissedAt = localStorage.getItem(DISMISS_KEY);
        if (dismissedAt && Date.now() - Number(dismissedAt) < IDLE_MS) return;
        const total = items.reduce((s, i) => s + i.precio * i.cantidad, 0);
        const qty = items.reduce((s, i) => s + i.cantidad, 0);
        setSubtotal(total);
        setCount(qty);
        setVisible(true);
      } catch {}
    }
    const t = setTimeout(check, 2000);
    window.addEventListener("cart-updated", check);
    return () => { clearTimeout(t); window.removeEventListener("cart-updated", check); };
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="bg-gray-50 border-b border-gray-100 px-4 py-1.5 flex items-center justify-between gap-3 text-xs text-gray-500">
      <div className="flex items-center gap-1.5 min-w-0">
        <ShoppingCart className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        <span className="truncate">
          {count} producto{count !== 1 ? "s" : ""} guardado{count !== 1 ? "s" : ""} ·{" "}
          <span className="font-medium text-gray-700">{formatCurrency(subtotal)}</span>
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link
          href="/carrito"
          className="text-primary font-semibold hover:underline transition text-xs"
        >
          Ver carrito →
        </Link>
        <button onClick={dismiss} aria-label="Cerrar" className="text-gray-300 hover:text-gray-500 transition">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
