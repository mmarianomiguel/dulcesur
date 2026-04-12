"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShoppingCart, X } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

const DISMISS_KEY = "cart_recovery_dismissed_at";
const IDLE_MS = 30 * 60 * 1000; // 30 minutes

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

        // Check idle time: last dismiss
        const dismissedAt = localStorage.getItem(DISMISS_KEY);
        if (dismissedAt && Date.now() - Number(dismissedAt) < IDLE_MS) return;

        const total = items.reduce((s, i) => s + i.precio * i.cantidad, 0);
        const qty = items.reduce((s, i) => s + i.cantidad, 0);
        setSubtotal(total);
        setCount(qty);
        setVisible(true);
      } catch {}
    }

    // Delay to avoid flash on page load
    const t = setTimeout(check, 2000);
    window.addEventListener("cart-updated", check);
    return () => {
      clearTimeout(t);
      window.removeEventListener("cart-updated", check);
    };
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between gap-4 text-sm">
      <div className="flex items-center gap-2 text-amber-800 min-w-0">
        <ShoppingCart className="h-4 w-4 shrink-0 text-amber-600" />
        <span className="truncate">
          Tenés {count} producto{count !== 1 ? "s" : ""} en tu carrito por{" "}
          <strong>{formatCurrency(subtotal)}</strong>
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link
          href="/carrito"
          className="bg-amber-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-amber-700 transition"
        >
          Ver carrito
        </Link>
        <button
          onClick={dismiss}
          aria-label="Cerrar"
          className="text-amber-500 hover:text-amber-700 transition p-0.5"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
