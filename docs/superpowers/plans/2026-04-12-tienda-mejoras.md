# Tienda Online — Mejoras (Paquete Completo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 12 UX improvements for the tienda online: fuzzy search, cart recovery banner, order history page, offers page, home dynamic blocks, product detail enhancements, stock filter bug fix, cart savings display, and search history.

**Architecture:** New standalone pages (`/historial`, `/ofertas`) with server components. New utility lib (`fuzzy.ts`) consumed by `productos-client.tsx`. New component (`cart-recovery-banner.tsx`) mounted in layout. Home blocks (`MasVendidosBlock`, `UltimasUnidadesBlock`) added to existing render switch. All other changes are targeted edits to existing files.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Supabase (PostgreSQL), lucide-react, `@/lib/formatters` (`formatCurrency`, `daysSinceAR`, `formatDateARG`), `@/lib/utils` (`productSlug`, `slugify`), `showToast` from `@/components/tienda/toast`

---

## File Structure

**New files:**
- `src/lib/fuzzy.ts` — Levenshtein fuzzy match helper
- `src/components/tienda/cart-recovery-banner.tsx` — Abandoned cart recovery banner
- `src/app/(tienda)/historial/page.tsx` — Order history server component
- `src/app/(tienda)/ofertas/page.tsx` — Offers page server component
- `src/app/(tienda)/ofertas/ofertas-client.tsx` — Offers page client component

**Modified files:**
- `src/app/(tienda)/layout.tsx` — Mount CartRecoveryBanner
- `src/components/tienda/navbar.tsx` — Add "Mis pedidos" and "Ofertas" links (desktop top bar, desktop main nav, mobile drawer)
- `src/app/(tienda)/home-client.tsx` — Add `MasVendidosBlock`, `UltimasUnidadesBlock` components + register in `renderBlock()`
- `src/app/(tienda)/productos/[slug]/page.tsx` — Not-found with suggestions, copy link, related title, best price badge
- `src/app/(tienda)/productos/productos-client.tsx` — Fuzzy integration, stock filter bug fix, search history
- `src/app/(tienda)/carrito/page.tsx` — Savings display

---

### Task 1: Fuzzy search lib + cart recovery banner + layout

**Files:**
- Create: `src/lib/fuzzy.ts`
- Create: `src/components/tienda/cart-recovery-banner.tsx`
- Modify: `src/app/(tienda)/layout.tsx`

- [ ] **Step 1: Create `src/lib/fuzzy.ts`**

```typescript
/** Levenshtein distance between two strings (case-insensitive). */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

/**
 * Returns true if `query` fuzzy-matches `text`.
 * Strategy: substring match first (fast path), then word-level Levenshtein
 * with tolerance based on word length.
 */
export function fuzzyMatch(text: string, query: string): boolean {
  const t = text.toLowerCase();
  const q = query.toLowerCase().trim();
  if (!q) return true;
  // Fast path: direct substring
  if (t.includes(q)) return true;
  // Word-level fuzzy: each query word must match at least one text word
  const queryWords = q.split(/\s+/);
  const textWords = t.split(/\s+/);
  return queryWords.every((qw) =>
    textWords.some((tw) => {
      const maxDist = qw.length <= 3 ? 0 : qw.length <= 5 ? 1 : 2;
      return levenshtein(qw, tw) <= maxDist;
    })
  );
}
```

- [ ] **Step 2: Create `src/components/tienda/cart-recovery-banner.tsx`**

The banner shows when `localStorage.carrito` has items but the user hasn't interacted for > 30 minutes. It reads cart data client-side and renders a dismissible strip above the main content.

```typescript
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
```

- [ ] **Step 3: Mount `CartRecoveryBanner` in `src/app/(tienda)/layout.tsx`**

Current file:
```tsx
import type { Metadata } from "next";
import TiendaNavbar from "@/components/tienda/navbar";
import TiendaFooter from "@/components/tienda/footer";
import { CartProvider } from "@/components/tienda/cart-drawer";
import AdminBanner from "@/components/tienda/admin-banner";
import ToastContainer from "@/components/tienda/toast";
import WhatsAppFloat from "@/components/tienda/whatsapp-float";
import ScrollToTop from "@/components/tienda/scroll-to-top";
```

Replace with:
```tsx
import type { Metadata } from "next";
import TiendaNavbar from "@/components/tienda/navbar";
import TiendaFooter from "@/components/tienda/footer";
import { CartProvider } from "@/components/tienda/cart-drawer";
import AdminBanner from "@/components/tienda/admin-banner";
import ToastContainer from "@/components/tienda/toast";
import WhatsAppFloat from "@/components/tienda/whatsapp-float";
import ScrollToTop from "@/components/tienda/scroll-to-top";
import CartRecoveryBanner from "@/components/tienda/cart-recovery-banner";
```

And in the JSX, after `<TiendaNavbar />` add `<CartRecoveryBanner />`:
```tsx
      <CartProvider>
        <div className="flex min-h-screen flex-col bg-white">
          <AdminBanner />
          <TiendaNavbar />
          <CartRecoveryBanner />
          <main className="flex-1">{children}</main>
          <TiendaFooter />
          <ToastContainer />
          <WhatsAppFloat />
          <ScrollToTop />
        </div>
      </CartProvider>
```

- [ ] **Step 4: Build and verify no TypeScript errors**

Run: `cd "j:\Proyectos Claude\enexpro" && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors related to the new files.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fuzzy.ts src/components/tienda/cart-recovery-banner.tsx src/app/\(tienda\)/layout.tsx
git commit -m "feat: add fuzzy match lib and cart recovery banner"
```

---

### Task 2: Order history page + navbar links

**Files:**
- Create: `src/app/(tienda)/historial/page.tsx`
- Modify: `src/components/tienda/navbar.tsx`

- [ ] **Step 1: Create `src/app/(tienda)/historial/page.tsx`**

This is a client component (reads `localStorage.cliente_auth`, queries Supabase). It lists past orders with status badges.

```typescript
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Package, ChevronRight, ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatCurrency, formatDateARG } from "@/lib/formatters";

interface Pedido {
  id: string;
  created_at: string;
  estado: string;
  total: number;
  numero: number | null;
}

const ESTADO_LABEL: Record<string, { label: string; color: string }> = {
  pendiente: { label: "Pendiente", color: "bg-yellow-100 text-yellow-700" },
  confirmado: { label: "Confirmado", color: "bg-blue-100 text-blue-700" },
  en_preparacion: { label: "En preparación", color: "bg-indigo-100 text-indigo-700" },
  enviado: { label: "Enviado", color: "bg-purple-100 text-purple-700" },
  entregado: { label: "Entregado", color: "bg-green-100 text-green-700" },
  cancelado: { label: "Cancelado", color: "bg-red-100 text-red-700" },
};

export default function HistorialPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [clienteId, setClienteId] = useState<number | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("cliente_auth");
      if (stored) {
        const p = JSON.parse(stored);
        if (p?.id) setClienteId(p.id);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (clienteId === null) { setLoading(false); return; }
    supabase
      .from("ventas")
      .select("id, created_at, estado, total, numero")
      .eq("cliente_id", clienteId)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setPedidos((data as Pedido[]) || []);
        setLoading(false);
      });
  }, [clienteId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (clienteId === null) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <Package className="mx-auto h-16 w-16 text-gray-200 mb-4" />
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Iniciá sesión para ver tus pedidos</h2>
        <Link href="/cuenta" className="inline-flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition mt-4">
          Ir a mi cuenta
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/cuenta" className="text-gray-400 hover:text-primary transition">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold text-gray-900">Mis pedidos</h1>
      </div>

      {pedidos.length === 0 ? (
        <div className="text-center py-16">
          <Package className="mx-auto h-16 w-16 text-gray-200 mb-4" />
          <p className="text-gray-500">Todavía no realizaste ningún pedido.</p>
          <Link href="/productos" className="inline-flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition mt-4">
            Ver productos
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {pedidos.map((p) => {
            const est = ESTADO_LABEL[p.estado] ?? { label: p.estado, color: "bg-gray-100 text-gray-600" };
            return (
              <div key={p.id} className="flex items-center justify-between gap-4 rounded-2xl border border-gray-100 bg-white px-4 py-4 shadow-sm hover:shadow-md transition">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {p.numero && <span className="text-sm font-semibold text-gray-900">Pedido #{p.numero}</span>}
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${est.color}`}>{est.label}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{formatDateARG(p.created_at)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-gray-900">{formatCurrency(p.total)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add "Mis pedidos" link to navbar — top bar (desktop)**

In `src/components/tienda/navbar.tsx`, find the top bar desktop links block (lines ~157-167):
```tsx
          <div className="hidden md:flex items-center gap-4">
            <Link href="/cuenta" className="hover:text-primary transition">
              Mi cuenta
            </Link>
```

Replace with:
```tsx
          <div className="hidden md:flex items-center gap-4">
            <Link href="/cuenta" className="hover:text-primary transition">
              Mi cuenta
            </Link>
            <Link href="/historial" className="hover:text-primary transition">
              Mis pedidos
            </Link>
```

- [ ] **Step 3: Add "Mis pedidos" link to navbar — main nav (desktop)**

Find the main nav account link (lines ~258-264):
```tsx
            <Link
              href="/cuenta"
              className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 hover:text-primary lg:flex"
            >
              <User className="h-5 w-5" />
              Mi cuenta
            </Link>
```

After it, add:
```tsx
            <Link
              href="/historial"
              className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 hover:text-primary lg:flex"
            >
              <Package className="h-5 w-5" />
              Mis pedidos
            </Link>
```

Note: `Package` is already imported in navbar.tsx. If not, add it to the lucide-react import.

- [ ] **Step 4: Add "Mis pedidos" link to navbar — mobile drawer**

Find the mobile bottom links section (lines ~406-422):
```tsx
        <div className="border-t px-4 py-4">
          <Link
            href="/cuenta"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
          >
            <User className="h-5 w-5" />
            Mi cuenta
          </Link>
```

After the Mi cuenta link, add:
```tsx
          <Link
            href="/historial"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
          >
            <Package className="h-5 w-5" />
            Mis pedidos
          </Link>
```

Make sure `Package` is in the lucide-react import at the top of navbar.tsx. Current imports: `Search, User, ShoppingCart, Menu, X, Truck, Phone, ChevronRight`. Add `Package` to that list.

- [ ] **Step 5: Verify TypeScript**

Run: `cd "j:\Proyectos Claude\enexpro" && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(tienda\)/historial/page.tsx src/components/tienda/navbar.tsx
git commit -m "feat: add order history page and navbar Mis pedidos links"
```

---

### Task 3: Offers page + navbar Ofertas link

**Files:**
- Create: `src/app/(tienda)/ofertas/page.tsx`
- Create: `src/app/(tienda)/ofertas/ofertas-client.tsx`
- Modify: `src/components/tienda/navbar.tsx`

- [ ] **Step 1: Create `src/app/(tienda)/ofertas/ofertas-client.tsx`**

Shows products with `precio_anterior > precio` (price was reduced), sorted by discount percentage descending.

```typescript
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Package, TrendingDown } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/formatters";
import { productSlug } from "@/lib/utils";
import { useCategoriasPermitidas } from "@/hooks/use-categorias-visibles";

interface Producto {
  id: string;
  nombre: string;
  precio: number;
  precio_anterior: number;
  imagen_url: string | null;
  stock: number;
  es_combo?: boolean;
  categorias?: { id: string; nombre: string; restringida?: boolean } | null;
}

export default function OfertasClient() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const { filtrarCategorias } = useCategoriasPermitidas();

  useEffect(() => {
    supabase
      .from("productos")
      .select("id, nombre, precio, precio_anterior, imagen_url, stock, es_combo, categorias(id, nombre, restringida)")
      .eq("activo", true)
      .eq("visibilidad", "visible")
      .gt("precio_anterior", 0)
      .then(({ data }) => {
        // Keep only genuine reductions (current price < previous price)
        const rebajados = ((data as any[]) || []).filter(
          (p) => Number(p.precio) < Number(p.precio_anterior)
        );
        // Sort by discount % descending
        rebajados.sort((a, b) => {
          const pctA = (a.precio_anterior - a.precio) / a.precio_anterior;
          const pctB = (b.precio_anterior - b.precio) / b.precio_anterior;
          return pctB - pctA;
        });
        setProductos(rebajados as Producto[]);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-gray-100 bg-white overflow-hidden animate-pulse">
            <div className="aspect-square bg-gray-100" />
            <div className="p-3 space-y-2">
              <div className="h-3 w-3/4 bg-gray-100 rounded" />
              <div className="h-4 w-1/2 bg-gray-100 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const filtered = productos.filter((p) => {
    const cat = p.categorias;
    if (!cat) return true;
    return filtrarCategorias([cat]).length > 0;
  });

  if (filtered.length === 0) {
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
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {filtered.map((p) => {
        const pct = Math.round(((p.precio_anterior - p.precio) / p.precio_anterior) * 100);
        const ahorro = p.precio_anterior - p.precio;
        return (
          <Link
            key={p.id}
            href={`/productos/${productSlug(p.nombre, p.id)}`}
            className="group rounded-2xl border border-gray-100 bg-white hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden flex flex-col"
          >
            <div className="relative aspect-square bg-gray-50 overflow-hidden">
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
              <span className="absolute top-2 left-2 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                -{pct}%
              </span>
              {p.stock === 0 && !p.es_combo && (
                <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                  <span className="text-xs font-semibold text-gray-500 bg-white px-2 py-1 rounded-full shadow">Sin stock</span>
                </div>
              )}
            </div>
            <div className="p-3 flex flex-col gap-1 flex-1">
              {p.categorias?.nombre && (
                <span className="text-[10px] text-primary font-medium">{p.categorias.nombre}</span>
              )}
              <p className="text-xs font-medium text-gray-800 line-clamp-2 min-h-[2rem]">{p.nombre}</p>
              <div className="mt-auto pt-1">
                <p className="text-base font-bold text-gray-900">{formatCurrency(p.precio)}</p>
                <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                  <span className="text-[11px] text-gray-400 line-through">{formatCurrency(p.precio_anterior)}</span>
                  <span className="text-[11px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-semibold">
                    Ahorrás {formatCurrency(ahorro)}
                  </span>
                </div>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Create `src/app/(tienda)/ofertas/page.tsx`**

```typescript
import type { Metadata } from "next";
import { TrendingDown } from "lucide-react";
import OfertasClient from "./ofertas-client";

export const metadata: Metadata = {
  title: "Ofertas",
  description: "Productos con descuento y precios rebajados.",
};

export default function OfertasPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <TrendingDown className="h-6 w-6 text-green-600" />
          <h1 className="text-2xl font-bold text-gray-900">Ofertas</h1>
        </div>
        <p className="text-sm text-gray-500">Productos con precio rebajado, ordenados por mayor descuento.</p>
        <div className="w-12 h-0.5 bg-green-500 rounded-full mt-2" />
      </div>
      <OfertasClient />
    </div>
  );
}
```

- [ ] **Step 3: Add "Ofertas" link to navbar — top bar (desktop)**

In `src/components/tienda/navbar.tsx`, in the top bar desktop links (after "Mis pedidos" link from Task 2):

Find:
```tsx
            <Link href="/historial" className="hover:text-primary transition">
              Mis pedidos
            </Link>
```

After it add:
```tsx
            <Link href="/ofertas" className="hover:text-primary transition">
              Ofertas
            </Link>
```

- [ ] **Step 4: Add "Ofertas" link to navbar — main nav (desktop)**

After the Mis pedidos link added in Task 2, add:
```tsx
            <Link
              href="/ofertas"
              className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 hover:text-primary lg:flex"
            >
              <TrendingDown className="h-5 w-5" />
              Ofertas
            </Link>
```

Add `TrendingDown` to the lucide-react imports in navbar.tsx.

- [ ] **Step 5: Add "Ofertas" link to navbar — mobile drawer**

After the Mis pedidos link in the mobile bottom links section:
```tsx
          <Link
            href="/ofertas"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
          >
            <TrendingDown className="h-5 w-5" />
            Ofertas
          </Link>
```

- [ ] **Step 6: Verify TypeScript**

Run: `cd "j:\Proyectos Claude\enexpro" && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(tienda\)/ofertas/ src/components/tienda/navbar.tsx
git commit -m "feat: add ofertas page and navbar links for historial and ofertas"
```

---

### Task 4: Home dynamic blocks — MasVendidosBlock + UltimasUnidadesBlock

**Files:**
- Modify: `src/app/(tienda)/home-client.tsx`

Both blocks are self-contained React components defined in the file, each fetching their own data. They're registered in `renderBlock()`'s switch statement.

- [ ] **Step 1: Add `MasVendidosBlock` component**

In `src/app/(tienda)/home-client.tsx`, add the component after the existing `AumentosRecientesBlock` function (around line 640, before `BannerPromoBlock`):

```typescript
function MasVendidosBlock({ config }: { config: Record<string, any> }) {
  const { filtrarCategorias } = useCategoriasPermitidas();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loaded, setLoaded] = useState(false);
  const limit = config.max_items || 8;
  const titulo = config.titulo || "Los Más Vendidos";

  useEffect(() => {
    // Order by stock descending as a proxy for popularity (products with high turnover
    // tend to need frequent restocking; alternatively use venta_items count if available).
    // Using created_at desc + high stock as proxy for fast-moving items.
    supabase
      .from("productos")
      .select("id, nombre, precio, imagen_url, stock, es_combo, activo, categorias(id, nombre, restringida), precio_anterior, created_at")
      .eq("activo", true)
      .eq("visibilidad", "visible")
      .gt("stock", 0)
      .order("stock", { ascending: false })
      .limit(limit * 3) // Over-fetch to filter restricted categories
      .then(({ data }) => {
        setProductos((data as any[]) || []);
        setLoaded(true);
      });
  }, [limit]);

  if (!loaded) return null;

  const filtered = productos.filter((p) => {
    const cat = (p as any).categorias;
    if (!cat) return true;
    return filtrarCategorias([cat]).length > 0;
  }).slice(0, limit);

  if (filtered.length === 0) return null;

  return (
    <section className="py-8 md:py-10">
      <div className="max-w-7xl mx-auto px-4">
        <SectionTitle>{titulo}</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {filtered.map((prod) => (
            <Link
              key={prod.id}
              href={`/productos/${productSlug(prod.nombre, prod.id)}`}
              className="group rounded-2xl border border-gray-100 bg-white hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden flex flex-col"
            >
              <div className="relative aspect-square bg-gray-50 overflow-hidden">
                {prod.imagen_url ? (
                  <Image
                    src={prod.imagen_url}
                    alt={prod.nombre}
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
              </div>
              <div className="p-3 flex flex-col gap-1 flex-1">
                {(prod as any).categorias?.nombre && (
                  <span className="text-[10px] text-primary/70 font-medium">{(prod as any).categorias.nombre}</span>
                )}
                <p className="text-xs font-medium text-gray-800 line-clamp-2 min-h-[2rem]">{prod.nombre}</p>
                <p className="text-sm font-bold text-gray-900 mt-auto pt-1">{formatCurrency(prod.precio)}</p>
              </div>
            </Link>
          ))}
        </div>
        <div className="text-center mt-6">
          <Link
            href="/productos"
            className="inline-block border-2 border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white rounded-full px-8 py-2.5 text-sm font-semibold transition-all duration-200 active:scale-95"
          >
            Ver todos los productos
          </Link>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Add `UltimasUnidadesBlock` component**

Add after `MasVendidosBlock`, before `BannerPromoBlock`:

```typescript
function UltimasUnidadesBlock({ config }: { config: Record<string, any> }) {
  const { filtrarCategorias } = useCategoriasPermitidas();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loaded, setLoaded] = useState(false);
  const limit = config.max_items || 8;
  const umbral = config.umbral_stock || 5; // Show products with <= N units
  const titulo = config.titulo || "Últimas Unidades";

  useEffect(() => {
    supabase
      .from("productos")
      .select("id, nombre, precio, imagen_url, stock, activo, categorias(id, nombre, restringida)")
      .eq("activo", true)
      .eq("visibilidad", "visible")
      .eq("es_combo", false)
      .gt("stock", 0)
      .lte("stock", umbral)
      .order("stock", { ascending: true })
      .limit(limit * 3)
      .then(({ data }) => {
        setProductos((data as any[]) || []);
        setLoaded(true);
      });
  }, [limit, umbral]);

  if (!loaded) return null;

  const filtered = productos.filter((p) => {
    const cat = (p as any).categorias;
    if (!cat) return true;
    return filtrarCategorias([cat]).length > 0;
  }).slice(0, limit);

  if (filtered.length === 0) return null;

  return (
    <section className="py-8 md:py-10 bg-red-50/40 border-t border-red-100">
      <div className="max-w-7xl mx-auto px-4">
        <SectionTitle>{titulo}</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {filtered.map((prod) => (
            <Link
              key={prod.id}
              href={`/productos/${productSlug(prod.nombre, prod.id)}`}
              className="group rounded-2xl border border-red-100 bg-white hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden flex flex-col"
            >
              <div className="relative aspect-square bg-gray-50 overflow-hidden">
                {prod.imagen_url ? (
                  <Image
                    src={prod.imagen_url}
                    alt={prod.nombre}
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
                <span className="absolute bottom-2 right-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                  ¡Últimas {prod.stock}!
                </span>
              </div>
              <div className="p-3 flex flex-col gap-1 flex-1">
                {(prod as any).categorias?.nombre && (
                  <span className="text-[10px] text-red-500 font-medium">{(prod as any).categorias.nombre}</span>
                )}
                <p className="text-xs font-medium text-gray-800 line-clamp-2 min-h-[2rem]">{prod.nombre}</p>
                <p className="text-sm font-bold text-gray-900 mt-auto pt-1">{formatCurrency(prod.precio)}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Register new blocks in `renderBlock()`**

In `home-client.tsx`, find the `renderBlock()` switch statement. The last registered case before `default` is `imagen_banner`. Add before `default`:

```typescript
      case "mas_vendidos":
        return <MasVendidosBlock key={bloque.id} config={config} />;
      case "ultimas_unidades":
        return <UltimasUnidadesBlock key={bloque.id} config={config} />;
```

- [ ] **Step 4: Verify TypeScript**

Run: `cd "j:\Proyectos Claude\enexpro" && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(tienda\)/home-client.tsx
git commit -m "feat: add MasVendidosBlock and UltimasUnidadesBlock to home"
```

---

### Task 5: Product detail — not-found, copy link, related title, best price badge

**Files:**
- Modify: `src/app/(tienda)/productos/[slug]/page.tsx`

- [ ] **Step 1: Add `Link2` to lucide-react imports**

Current lucide imports (line ~7):
```typescript
import { Package, Minus, Plus, ChevronRight, ChevronLeft, Layers, Box, Tag, Share2, X } from "lucide-react";
```

Add `Link2`:
```typescript
import { Package, Minus, Plus, ChevronRight, ChevronLeft, Layers, Box, Tag, Share2, X, Link2 } from "lucide-react";
```

- [ ] **Step 2: Replace the not-found block with suggested products**

Current not-found block (lines ~532-543):
```tsx
  if (!producto || restricted) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Package className="h-20 w-20 text-gray-200" />
          <h2 className="mt-6 text-xl font-bold text-gray-800">Producto no encontrado</h2>
          <Link href="/productos" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white transition hover:bg-primary/90">
            Volver a productos
          </Link>
        </div>
      </div>
    );
  }
```

Replace with (this is a server component, so we need to add a Supabase fetch for suggestions — but `[slug]/page.tsx` is already a server component that imports `supabase` from `@/lib/supabase`. The page already has `createServerClient` patterns. Check how it fetches data: look at where `producto` is obtained. Since the page already fetches `producto` at the top level, we can add a parallel suggestions fetch):

Add a `supabase` suggestions query inside the `if (!producto || restricted)` branch. Note: this file already uses `supabase` (server-side client). Since the not-found is early-return, we can add the fetch before the check:

Find the not-found check location and replace:
```tsx
  if (!producto || restricted) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Package className="h-20 w-20 text-gray-200" />
          <h2 className="mt-6 text-xl font-bold text-gray-800">Producto no encontrado</h2>
          <Link href="/productos" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white transition hover:bg-primary/90">
            Volver a productos
          </Link>
        </div>
      </div>
    );
  }
```

Replace with:
```tsx
  if (!producto || restricted) {
    // Fetch a few suggested products to show instead of empty state
    const { data: sugeridos } = await supabase
      .from("productos")
      .select("id, nombre, precio, imagen_url")
      .eq("activo", true)
      .eq("visibilidad", "visible")
      .gt("stock", 0)
      .order("created_at", { ascending: false })
      .limit(4);

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
        {sugeridos && sugeridos.length > 0 && (
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
```

Note: `productSlug`, `Image`, `formatCurrency` are already imported in this file.

- [ ] **Step 3: Add copy link button next to WhatsApp share**

Find the WhatsApp share button (lines ~820-827):
```tsx
          <button
            onClick={() => {
              const text = `¡Mirá este producto en DulceSur: ${producto.nombre}!`;
              const url = window.location.href;
              window.open(`https://wa.me/?text=${encodeURIComponent(text + "\n" + url)}`, "_blank");
            }}
            className="mt-3 inline-flex items-center gap-2 text-sm text-gray-500 hover:text-green-600 transition"
          >
            <Share2 className="w-4 h-4" />
            Compartir por WhatsApp
          </button>
```

Replace with (wrap both buttons in a `flex` container):
```tsx
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <button
              onClick={() => {
                const text = `¡Mirá este producto en DulceSur: ${producto.nombre}!`;
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
```

Note: `showToast` — check if it's imported in this file. If not, add: `import { showToast } from "@/components/tienda/toast";`

- [ ] **Step 4: Make related products title contextual**

Find (line ~898):
```tsx
          <h2 className="text-xl font-bold text-gray-900">Productos Relacionados</h2>
```

Replace with:
```tsx
          <h2 className="text-xl font-bold text-gray-900">
            {producto.categorias?.nombre
              ? `Más de ${producto.categorias.nombre}`
              : "Productos Relacionados"}
          </h2>
```

- [ ] **Step 5: Add best price badge to presentation pills**

Find the presentations rendering loop (lines ~720-741). The `<button>` inside the loop currently shows `{presLabelFn(p)}`. We need to identify the pill with the lowest per-unit price and add a "Mejor precio/u" badge.

Before the presentation pills `<div>` (where `presentaciones` is mapped), add a pre-computed variable to find the best price presentation index. In the render function (this is a client component, so we can compute inline):

Find the presentations block that starts with:
```tsx
              </div>
            </div>
          )}

          {/* Quantity + Add to Cart */}
```

Look for where `presentaciones.map((p, idx) => {` is. The pills are in the block that shows `{presLabelFn(p)}`. We need to find the presentation with minimum price-per-unit.

Find the presentations map block. It will be something like:
```tsx
              {presentaciones.map((p, idx) => {
                const isUnit = p.nombre === "Unidad";
                ...
                return (
                  <button
                    key={idx}
                    ...
                  >
                    {isUnit ? <Layers className="w-4 h-4" /> : <Box className="w-4 h-4" />}
                    {presLabelFn(p)}
                    {disabled && <span className="text-[10px] font-normal ml-1">(sin stock)</span>}
                  </button>
                );
              })}
```

Add a best-price calculation before the map, and a badge inside the button. The implementer should:

1. Before `{presentaciones.map(...)`:
```tsx
              {(() => {
                // Find index of presentation with lowest price-per-unit
                const bestIdx = presentaciones.reduce((best, p, i) => {
                  const unitPrice = p.precio > 0 && p.cantidad > 0 ? p.precio / p.cantidad : Infinity;
                  const bestPrice = presentaciones[best].precio > 0 && presentaciones[best].cantidad > 0
                    ? presentaciones[best].precio / presentaciones[best].cantidad
                    : Infinity;
                  return unitPrice < bestPrice ? i : best;
                }, 0);
                return presentaciones.map((p, idx) => {
                  const isUnit = p.nombre === "Unidad";
                  const presQtyLocal = p.cantidad || 1;
                  const presStockLocal = Math.floor(producto.stock / presQtyLocal);
                  const disabled = presStockLocal <= 0;
                  const selected = selectedPresIdx === idx;
                  const isBestPrice = presentaciones.length > 1 && idx === bestIdx && !isUnit;
                  return (
                    <button
                      key={idx}
                      onClick={() => { setSelectedPresIdx(idx); setCantidad((c) => Math.min(c, Math.max(1, presStockLocal))); }}
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
```

**Important note for implementer:** The presentations block in [slug]/page.tsx is complex. Read lines 700-742 carefully before editing. The existing map uses variables like `presQty`, `presMax`, `disabled`, `selected`. You must replicate those exact variable names or use equivalent logic. The key change is: (1) compute `bestIdx` before the map, (2) add `isBestPrice` flag, (3) add the badge span, (4) add `relative` class to the button for absolute positioning of the badge.

- [ ] **Step 6: Check if `showToast` is imported in [slug]/page.tsx**

Run: `grep -n "showToast" "src/app/(tienda)/productos/[slug]/page.tsx"`

If not found, add the import after the existing imports:
```typescript
import { showToast } from "@/components/tienda/toast";
```

- [ ] **Step 7: Verify TypeScript**

Run: `cd "j:\Proyectos Claude\enexpro" && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(tienda)/productos/[slug]/page.tsx"
git commit -m "feat: product detail — not-found suggestions, copy link, contextual related title, best price badge"
```

---

### Task 6: productos-client — fuzzy search, stock filter fix, search history

**Files:**
- Modify: `src/app/(tienda)/productos/productos-client.tsx`

Three independent improvements in one file.

- [ ] **Step 1: Import fuzzyMatch and todayARG (for stock filter)**

At the top of `productos-client.tsx`, find the existing imports and add:
```typescript
import { fuzzyMatch } from "@/lib/fuzzy";
import { todayARG } from "@/lib/formatters";
```

Wait — `todayARG` is a private helper inside `formatters.ts`. Check its export status first.

Run: `grep -n "export function todayARG\|export const todayARG\|function todayARG" src/lib/formatters.ts`

If `todayARG` is not exported, the stock filter fix should instead compute the Argentina cutoff directly. The fix should change the UTC `Date.now()` approach to use Argentina timezone. The correct approach:

```typescript
// Argentina-timezone cutoff (replaces UTC Date.now())
const cutoffDate = new Date();
cutoffDate.setDate(cutoffDate.getDate() - diasOcultarSinStock);
const cutoff = cutoffDate.toLocaleString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).split(",")[0] + "T00:00:00-03:00";
```

Actually, simpler: just use the existing `daysSinceAR` logic indirectly — we only need an ISO string. The Argentina midnight cutoff:

```typescript
const nowAR = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
nowAR.setHours(0, 0, 0, 0);
nowAR.setDate(nowAR.getDate() - diasOcultarSinStock);
const cutoff = nowAR.toISOString();
```

So the import for fuzzy is sufficient: `import { fuzzyMatch } from "@/lib/fuzzy";`

- [ ] **Step 2: Fix stock filter — change condition and use Argentina timezone cutoff**

Current stock filter (lines ~390-393):
```typescript
      if (disponibilidad !== "sin_stock" && diasOcultarSinStock > 0) {
        const cutoff = new Date(Date.now() - diasOcultarSinStock * 24 * 60 * 60 * 1000).toISOString();
        query = query.or(`stock.gt.0,updated_at.gt.${cutoff},es_combo.eq.true`);
      }
```

Replace with:
```typescript
      if (disponibilidad === "" && diasOcultarSinStock > 0) {
        const nowAR = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
        nowAR.setHours(0, 0, 0, 0);
        nowAR.setDate(nowAR.getDate() - diasOcultarSinStock);
        const cutoff = nowAR.toISOString();
        query = query.or(`stock.gt.0,updated_at.gt.${cutoff},es_combo.eq.true`);
      }
```

- [ ] **Step 3: Add fuzzy client-side filtering after Supabase fetch**

The current flow: Supabase fetch with `.ilike("nombre", ...)` for search. Fuzzy runs on top of the results client-side (not as a Supabase filter, since Levenshtein isn't natively supported).

Find the section where `searchQuery` is applied (line ~384-385):
```typescript
      if (searchQuery)
        query = query.ilike("nombre", `%${searchQuery}%`);
```

Keep this as the primary filter (fast, index-optimized). After the Supabase fetch returns results, apply fuzzy as a secondary pass to catch typos that `.ilike` missed.

Find where `const prods = (data as unknown as Producto[]) || [];` is set (line ~420). After that line, add fuzzy filtering:

```typescript
      const prods = (data as unknown as Producto[]) || [];

      // Secondary fuzzy pass: if search query has no results via ilike, retry with fuzzy
      // (Only needed when count is 0 — avoids performance hit on normal searches)
      let finalProds = prods;
      let finalCount = count || 0;
      if (searchQuery && finalCount === 0) {
        // Fuzzy fallback: fetch more products and filter client-side
        const { data: allData } = await supabase
          .from("productos")
          .select("id, nombre, precio, imagen_url, stock, activo, visibilidad, es_combo, precio_anterior, fecha_actualizacion, categorias(id, nombre, restringida), marcas(id, nombre), updated_at, created_at")
          .eq("activo", true)
          .eq("visibilidad", "visible")
          .limit(500);
        const fuzzyFiltered = (allData || []).filter((p: any) => fuzzyMatch(p.nombre, searchQuery));
        finalProds = fuzzyFiltered as unknown as Producto[];
        finalCount = fuzzyFiltered.length;
      }
```

Then replace `setProductos(prods)` with `setProductos(finalProds)` and `setTotal(count || 0)` with `setTotal(finalCount)`. Find where these state setters are called after the fetch and adjust accordingly.

**Important:** The implementer must read the actual state setter calls in the fetch function to do this correctly. Search for `setProductos(` and `setTotal(` in the file to find exact locations.

- [ ] **Step 4: Add search history to sidebar**

The sidebar search section is at lines ~727-743:
```tsx
      {/* Search */}
      <div>
        <h4 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-3">Buscar</h4>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar productos..."
            defaultValue={searchQuery}
            onKeyDown={(e) => {
              if (e.key === "Enter")
                updateParams({ q: (e.target as HTMLInputElement).value || null });
            }}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-gray-50 border-0 text-sm focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-gray-400"
          />
        </div>
      </div>
```

First, add a `searchHistory` state at the top of the component (near other `useState` declarations):
```typescript
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
```

Add a `useEffect` to load history from localStorage:
```typescript
  useEffect(() => {
    try {
      const raw = localStorage.getItem("search_history");
      if (raw) setSearchHistory(JSON.parse(raw));
    } catch {}
  }, []);
```

Add a helper to save a search to history:
```typescript
  function saveToHistory(q: string) {
    if (!q.trim()) return;
    setSearchHistory((prev) => {
      const next = [q, ...prev.filter((h) => h !== q)].slice(0, 5);
      localStorage.setItem("search_history", JSON.stringify(next));
      return next;
    });
  }
```

Then modify the sidebar search section to call `saveToHistory` on submit and show history chips below the input:
```tsx
      {/* Search */}
      <div>
        <h4 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-3">Buscar</h4>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar productos..."
            defaultValue={searchQuery}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const val = (e.target as HTMLInputElement).value || null;
                if (val) saveToHistory(val);
                updateParams({ q: val });
              }
            }}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-gray-50 border-0 text-sm focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-gray-400"
          />
        </div>
        {searchHistory.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {searchHistory.map((h) => (
              <button
                key={h}
                onClick={() => {
                  saveToHistory(h);
                  updateParams({ q: h });
                }}
                className="text-[11px] bg-gray-100 hover:bg-primary/10 hover:text-primary text-gray-600 rounded-full px-2.5 py-1 transition"
              >
                {h}
              </button>
            ))}
          </div>
        )}
      </div>
```

- [ ] **Step 5: Verify TypeScript**

Run: `cd "j:\Proyectos Claude\enexpro" && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(tienda\)/productos/productos-client.tsx
git commit -m "feat: fuzzy search fallback, stock filter AR timezone fix, search history sidebar"
```

---

### Task 7: Cart savings display

**Files:**
- Modify: `src/app/(tienda)/carrito/page.tsx`

Shows total savings (items with `precio_original > precio`) in the checkout bottom bar.

- [ ] **Step 1: Read the CartItem interface and bottom bar in carrito/page.tsx**

The `CartItem` interface (lines 11-22) already has `precio_original?: number` and `descuento?: number`. The sticky bottom bar is at lines ~270-288.

- [ ] **Step 2: Compute savings from cart items**

In the component body, after the `subtotal` is derived (find where `subtotal` is computed — it should be something like `items.reduce(...)`), add:

```typescript
  const totalSavings = items.reduce((sum, item) => {
    if (!item.precio_original || item.precio_original <= item.precio) return sum;
    return sum + (item.precio_original - item.precio) * item.cantidad;
  }, 0);
```

- [ ] **Step 3: Display savings in the bottom bar**

Current bottom bar (lines ~270-288):
```tsx
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 flex items-center justify-between gap-4 sm:static sm:border-t-0 sm:mt-6 sm:p-0 sm:pt-6 sm:border-t sm:border-gray-200 z-40">
        <div>
          <p className="text-xs text-gray-500">Subtotal</p>
          <p className="text-lg font-bold">{formatCurrency(subtotal)}</p>
        </div>
        {hayStockInsuficiente ? (
          ...
        ) : (
          <Link href="/checkout" ...>Ir al checkout</Link>
        )}
      </div>
```

Replace the `<div>` with the subtotal info to also show savings:
```tsx
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
```

- [ ] **Step 4: Verify TypeScript**

Run: `cd "j:\Proyectos Claude\enexpro" && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(tienda\)/carrito/page.tsx
git commit -m "feat: show cart savings in checkout bar"
```

---

## Self-Review Checklist

**Spec coverage:**
1. ✅ Cart recovery banner — Task 1
2. ✅ Fuzzy search — Task 6
3. ✅ Order history page + navbar link — Task 2
4. ✅ Home dynamic blocks (MasVendidos + UltimasUnidades) — Task 4
5. ✅ Offers page + navbar link — Task 3
6. ✅ Product not-found with suggested products — Task 5
7. ✅ Copy link button — Task 5
8. ✅ Related products contextual title — Task 5
9. ✅ Best price badge on presentation pills — Task 5
10. ✅ Stock filter bug fix (timezone + condition) — Task 6
11. ✅ Cart savings display — Task 7
12. ✅ Search history in sidebar — Task 6

**Type consistency:**
- `formatDateARG` (not `formatDateAR`) — used in Task 2 ✅
- `productSlug(nombre, id)` — used in Tasks 4, 5 ✅
- `fuzzyMatch(text, query)` — defined in Task 1, used in Task 6 ✅
- `showToast` — used in Task 5 (copy link) and Task 1 (banner) ✅
- `CartItem.precio_original` — already in interface, used in Task 7 ✅

**Placeholder scan:** All code blocks are complete. No TBD or TODO.
