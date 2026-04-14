# Category Navigation Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sidebar category tree in the products page with a mobile tab strip + subcategory grid, and upgrade the desktop navbar category bar with a hover mega-menu.

**Architecture:** Two independent file changes. `productos-client.tsx` gets a sticky mobile-only category tab bar inserted before the breadcrumb, and the sidebar categories block is removed. `navbar.tsx` gets new state/data fetching for subcategories+brands, and the flat category bar is replaced with a hover-triggered mega-menu (4 columns: subcategories, most searched, brands). Both changes are self-contained.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, lucide-react, Supabase client, `slugify` from `@/lib/utils`

---

## File Structure

**Modified:**
- `src/app/(tienda)/productos/productos-client.tsx` — add mobile category tab bar, remove sidebar category tree
- `src/components/tienda/navbar.tsx` — replace flat category bar with hover mega-menu

---

### Task 1: Mobile category tab bar + remove sidebar tree (`productos-client.tsx`)

**Files:**
- Modify: `src/app/(tienda)/productos/productos-client.tsx`

Current state of key sections:
- Lucide imports: lines 13–26 (`Search, SlidersHorizontal, Grid, List, Package, ChevronLeft, ChevronRight, ChevronDown, ShoppingCart, X, Minus, Plus`)
- `const PER_PAGE = 12;` at line 28
- `categoriasCollapsed` state at line 133
- Breadcrumb wrapper `<div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">` at line 1116, with `{/* ─── Breadcrumb ─── */}` at line 1117
- Categories tree block: lines 800–933 (starts `{/* Categorias - Tree style */}`, ends just before `<div className="border-t border-gray-100" />` at line 935)

- [ ] **Step 1: Add missing lucide icons to imports**

Current imports (lines 13–26):
```typescript
import {
  Search,
  SlidersHorizontal,
  Grid,
  List,
  Package,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ShoppingCart,
  X,
  Minus,
  Plus,
} from "lucide-react";
```

Replace with:
```typescript
import {
  Search,
  SlidersHorizontal,
  Grid,
  List,
  Package,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ShoppingCart,
  X,
  Minus,
  Plus,
  Candy,
  Store,
  BookOpen,
  Cigarette,
  MoreHorizontal,
  Pill,
  Milk,
  Tag,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
```

- [ ] **Step 2: Add CATEGORY_ICONS, getCategoryIcon, SUBCAT_PREVIEW after PER_PAGE**

Find line 28: `const PER_PAGE = 12;`

Insert immediately after it:
```typescript
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  kiosco: Candy,
  almacen: Store,
  libreria: BookOpen,
  cigarros: Cigarette,
  varios: MoreHorizontal,
  analgesicos: Pill,
  lacteos: Milk,
  bolsas: Tag,
};

function getCategoryIcon(nombre: string): LucideIcon {
  const key = nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  return CATEGORY_ICONS[key] || Package;
}

const SUBCAT_PREVIEW = 6;
```

- [ ] **Step 3: Add `subcatExpanded` state**

Find line 133: `const [categoriasCollapsed, setCategoriasCollapsed] = useState(!searchParams.get("categoria"));`

Add immediately after it:
```typescript
  const [subcatExpanded, setSubcatExpanded] = useState(false);
```

- [ ] **Step 4: Insert mobile category bar before the breadcrumb**

Find the exact string at line 1116–1117:
```tsx
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* ─── Breadcrumb ─── */}
```

Replace with:
```tsx
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

      {/* ─── Barra de categorías mobile ─── */}
      <div className="md:hidden -mx-4 mb-4 sticky top-[64px] z-30 bg-white border-b border-gray-100 shadow-sm">

        {/* Fila 1: tabs de categorías */}
        <div className="flex overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {/* Tab "Todas" */}
          <button
            onClick={() => {
              updateParams({ categoria: null, subcategoria: null });
              setSubcatExpanded(false);
            }}
            className={`flex flex-col items-center gap-1 px-3 py-2.5 shrink-0 border-b-2 transition-colors ${
              !categoriaId ? "border-gray-900 text-gray-900" : "border-transparent text-gray-400"
            }`}
          >
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
              !categoriaId ? "bg-gray-900" : "bg-gray-100"
            }`}>
              <Grid className={`w-3.5 h-3.5 ${!categoriaId ? "text-white" : "text-gray-500"}`} />
            </div>
            <span className="text-[10px] font-medium whitespace-nowrap">Todas</span>
          </button>

          {/* Tabs de categorías */}
          {filtrarCategorias(categorias)
            .filter((c) => (c.count || 0) > 0)
            .sort((a, b) => (b.count || 0) - (a.count || 0))
            .map((cat) => {
              const isActive = categoriaId === cat.id;
              const Icon = getCategoryIcon(cat.nombre);
              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    if (isActive) {
                      setSubcatExpanded((prev) => !prev);
                    } else {
                      updateParams({ categoria: slugify(cat.nombre), subcategoria: null });
                      setSubcatExpanded(false);
                    }
                  }}
                  className={`flex flex-col items-center gap-1 px-3 py-2.5 shrink-0 border-b-2 transition-colors ${
                    isActive ? "border-gray-900 text-gray-900" : "border-transparent text-gray-400"
                  }`}
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                    isActive ? "bg-gray-900" : "bg-gray-100"
                  }`}>
                    <Icon className={`w-3.5 h-3.5 ${isActive ? "text-white" : "text-gray-500"}`} />
                  </div>
                  <span className="text-[10px] font-medium whitespace-nowrap">{cat.nombre}</span>
                </button>
              );
            })}
        </div>

        {/* Fila 2: subcategorías (solo cuando hay categoría activa) */}
        {categoriaId && (() => {
          const catSubs = allSubcategorias
            .filter((s) => s.categoria_id === categoriaId && (s.count || 0) > 0)
            .sort((a, b) => (b.count || 0) - (a.count || 0));

          if (catSubs.length === 0) return null;

          const visibleSubs = subcatExpanded ? catSubs : catSubs.slice(0, SUBCAT_PREVIEW);
          const hasMore = catSubs.length > SUBCAT_PREVIEW;

          return (
            <div className="border-t border-gray-100 bg-gray-50/50 px-3 py-2">
              <div className="grid grid-cols-3 gap-1.5">
                {/* "Todas" de la categoría */}
                <button
                  onClick={() => updateParams({ subcategoria: null })}
                  className={`flex flex-col items-center gap-0.5 py-2 px-1 rounded-xl border-[1.5px] transition-all ${
                    !subcategoriaId
                      ? "border-primary bg-primary/5"
                      : "border-transparent bg-white"
                  }`}
                >
                  <span className={`text-[11px] font-semibold ${!subcategoriaId ? "text-primary" : "text-gray-600"}`}>
                    Todas
                  </span>
                  <span className={`text-[9px] ${!subcategoriaId ? "text-primary/70" : "text-gray-400"}`}>
                    {categorias.find((c) => c.id === categoriaId)?.count || 0}
                  </span>
                </button>

                {/* Subcategorías */}
                {visibleSubs.map((sub) => {
                  const isSubActive = subcategoriaId === sub.id;
                  return (
                    <button
                      key={sub.id}
                      onClick={() =>
                        updateParams({
                          categoria: slugify(
                            categorias.find((c) => c.id === categoriaId)?.nombre || ""
                          ),
                          subcategoria: slugify(sub.nombre),
                        })
                      }
                      className={`flex flex-col items-center gap-0.5 py-2 px-1 rounded-xl border-[1.5px] transition-all ${
                        isSubActive
                          ? "border-primary bg-primary/5"
                          : "border-transparent bg-white"
                      }`}
                    >
                      <span className={`text-[11px] font-semibold text-center leading-tight ${
                        isSubActive ? "text-primary" : "text-gray-600"
                      }`}>
                        {sub.nombre}
                      </span>
                      <span className={`text-[9px] ${isSubActive ? "text-primary/70" : "text-gray-400"}`}>
                        {sub.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Ver todas / Mostrar menos */}
              {hasMore && !subcatExpanded && (
                <button
                  onClick={() => setSubcatExpanded(true)}
                  className="w-full mt-2 text-center text-[11px] font-semibold text-primary bg-primary/5 rounded-xl py-2 hover:bg-primary/10 transition-colors"
                >
                  Ver todas las subcategorías ({catSubs.length}) ↓
                </button>
              )}
              {hasMore && subcatExpanded && (
                <button
                  onClick={() => setSubcatExpanded(false)}
                  className="w-full mt-2 text-center text-[11px] font-semibold text-gray-500 bg-gray-100 rounded-xl py-2 hover:bg-gray-200 transition-colors"
                >
                  Mostrar menos ↑
                </button>
              )}
            </div>
          );
        })()}
      </div>

      {/* ─── Breadcrumb ─── */}
```

- [ ] **Step 5: Remove the sidebar categories block**

Find and delete the entire block from line ~800 to ~933. The block starts with:
```tsx
      {/* Categorias - Tree style */}
      <div>
        <button
          onClick={() => setCategoriasCollapsed(!categoriasCollapsed)}
```

And ends just before (do NOT delete this line):
```tsx
      <div className="border-t border-gray-100" />

      {/* Marcas */}
```

The deleted block includes all category-related JSX: the collapsible button, the "Todas" radio, the categories list with expand/collapse chevrons, and the nested subcategories. The separator (`<div className="border-t border-gray-100" />`) before "Marcas" stays.

After deletion, the sidebar flows: búsqueda → `<div className="border-t border-gray-100" />` → `{/* Marcas */}` (no gap, no extra separator needed).

- [ ] **Step 6: Remove unused `categoriasCollapsed` state**

Find and delete line 133:
```typescript
  const [categoriasCollapsed, setCategoriasCollapsed] = useState(!searchParams.get("categoria"));
```

- [ ] **Step 7: TypeScript check**

Run: `cd "j:\Proyectos Claude\enexpro" && npx tsc --noEmit 2>&1 | head -30`

Expected: No errors. If errors mention `categoriasCollapsed` still being referenced somewhere, search for and remove all remaining uses.

- [ ] **Step 8: Commit**

```bash
cd "j:\Proyectos Claude\enexpro" && git add "src/app/(tienda)/productos/productos-client.tsx" && git commit -m "feat: mobile category tab bar + remove sidebar categories tree"
```

---

### Task 2: Desktop mega-menu (`navbar.tsx`)

**Files:**
- Modify: `src/components/tienda/navbar.tsx`

Current state:
- Lucide imports: lines 6–17 (`Search, User, ShoppingCart, Menu, X, Truck, Phone, ChevronRight, Package, TrendingDown`) — missing `ChevronDown`
- React imports line 3: `useEffect, useState, useRef, FormEvent` — already complete ✅
- `categoryBarRef` ref at line 39 — becomes unused, must be removed
- Category bar: lines 315–339 (full `<nav>` block)

- [ ] **Step 1: Add `ChevronDown` to lucide imports**

Current (lines 6–17):
```typescript
import {
  Search,
  User,
  ShoppingCart,
  Menu,
  X,
  Truck,
  Phone,
  ChevronRight,
  Package,
  TrendingDown,
} from "lucide-react";
```

Replace with:
```typescript
import {
  Search,
  User,
  ShoppingCart,
  Menu,
  X,
  Truck,
  Phone,
  ChevronRight,
  ChevronDown,
  Package,
  TrendingDown,
} from "lucide-react";
```

- [ ] **Step 2: Remove `categoryBarRef` and add mega-menu state**

Find line 39: `const categoryBarRef = useRef<HTMLDivElement>(null);`

Replace with:
```typescript
  const [hoveredCat, setHoveredCat] = useState<string | null>(null);
  const [subcatsMap, setSubcatsMap] = useState<Record<string, { id: string; nombre: string }[]>>({});
  const [marcasMap, setMarcasMap] = useState<Record<string, { id: string; nombre: string }[]>>({});
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
```

- [ ] **Step 3: Add useEffect for subcategories and brands data**

Find the closing `}, []);` of the existing first `useEffect` (the one with `Promise.all` for categories/empresa/tienda_config). Add a new `useEffect` immediately after that closing `}, []);`:

```typescript
  // Cargar subcategorías y marcas para el mega-menú
  useEffect(() => {
    (async () => {
      const { data: subs } = await supabase
        .from("subcategorias")
        .select("id, nombre, categoria_id");

      const subsMap: Record<string, { id: string; nombre: string }[]> = {};
      (subs || []).forEach((s: any) => {
        if (!subsMap[s.categoria_id]) subsMap[s.categoria_id] = [];
        subsMap[s.categoria_id].push({ id: s.id, nombre: s.nombre });
      });
      setSubcatsMap(subsMap);

      const { data: prodMarcas } = await supabase
        .from("productos")
        .select("categoria_id, marca_id, marcas(id, nombre)")
        .eq("activo", true)
        .eq("visibilidad", "visible")
        .not("marca_id", "is", null);

      const mMap: Record<string, Map<string, string>> = {};
      (prodMarcas || []).forEach((p: any) => {
        if (!p.categoria_id || !p.marcas) return;
        if (!mMap[p.categoria_id]) mMap[p.categoria_id] = new Map();
        mMap[p.categoria_id].set(p.marcas.id, p.marcas.nombre);
      });
      const mResult: Record<string, { id: string; nombre: string }[]> = {};
      for (const [catId, map] of Object.entries(mMap)) {
        mResult[catId] = Array.from(map.entries())
          .slice(0, 8)
          .map(([id, nombre]) => ({ id, nombre }));
      }
      setMarcasMap(mResult);
    })();
  }, []);
```

- [ ] **Step 4: Add hover handlers before the return**

Find `return (` (the start of the component's JSX return). Add these handlers immediately before it:

```typescript
  const handleCatEnter = (catId: string) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setHoveredCat(catId);
  };

  const handleCatLeave = () => {
    closeTimer.current = setTimeout(() => setHoveredCat(null), 150);
  };

  const handleMenuEnter = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };

  const handleMenuLeave = () => {
    closeTimer.current = setTimeout(() => setHoveredCat(null), 150);
  };
```

- [ ] **Step 5: Replace the category bar with the mega-menu**

Find and replace the entire nav block (lines 315–339):

```tsx
        {/* ── Category bar (desktop) ── */}
        <nav aria-label="Categorías" className="hidden border-b border-gray-100 lg:block">
          <div
            ref={categoryBarRef}
            className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 scrollbar-none"
          >
            {filtrarCategorias(categorias).map((cat) => (
              <Link
                key={cat.id}
                href={`/productos?categoria=${slugify(cat.nombre)}`}
                className="group relative flex-shrink-0 px-3 py-2.5 text-sm font-medium text-gray-600 transition hover:text-primary"
              >
                {cat.nombre}
                <span className="absolute bottom-0 left-0 h-0.5 w-full origin-left scale-x-0 bg-primary transition-transform group-hover:scale-x-100" />
              </Link>
            ))}
            <Link
              href="/productos"
              className="flex flex-shrink-0 items-center gap-0.5 px-3 py-2.5 text-sm font-medium text-primary transition hover:text-primary/90"
            >
              Ver todo
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </nav>
```

Replace with:

```tsx
        {/* ── Category bar con mega-menú (desktop) ── */}
        <nav aria-label="Categorías" className="hidden border-b border-gray-100 lg:block relative z-40">
          <div className="mx-auto flex max-w-7xl items-center px-4">
            {filtrarCategorias(categorias).map((cat) => {
              const isHovered = hoveredCat === cat.id;
              return (
                <div
                  key={cat.id}
                  onMouseEnter={() => handleCatEnter(cat.id)}
                  onMouseLeave={handleCatLeave}
                  className="relative"
                >
                  <Link
                    href={`/productos?categoria=${slugify(cat.nombre)}`}
                    className={`flex items-center gap-1 px-4 py-3 text-sm border-b-2 transition-colors whitespace-nowrap ${
                      isHovered
                        ? "border-gray-900 text-gray-900 font-semibold"
                        : "border-transparent text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    {cat.nombre}
                    <ChevronDown
                      className={`w-3 h-3 transition-transform duration-200 ${
                        isHovered ? "rotate-180" : ""
                      }`}
                    />
                  </Link>
                </div>
              );
            })}
            <Link
              href="/productos"
              className="flex flex-shrink-0 items-center gap-0.5 px-4 py-3 text-sm font-semibold text-primary transition hover:text-primary/80 ml-auto"
            >
              Ver todo
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* Mega-menú desplegable */}
          {hoveredCat && (() => {
            const cat = filtrarCategorias(categorias).find((c) => c.id === hoveredCat);
            const subs = subcatsMap[hoveredCat] || [];
            const marcas = marcasMap[hoveredCat] || [];
            if (!cat) return null;

            return (
              <div
                onMouseEnter={handleMenuEnter}
                onMouseLeave={handleMenuLeave}
                className="absolute left-0 right-0 bg-white border-b border-gray-200 shadow-xl z-50"
              >
                <div className="max-w-7xl mx-auto px-4 py-5 grid grid-cols-4 gap-6">

                  {/* Col 1 — Subcategorías */}
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
                      {cat.nombre}
                    </p>
                    <Link
                      href={`/productos?categoria=${slugify(cat.nombre)}`}
                      onClick={() => setHoveredCat(null)}
                      className="block text-sm text-gray-800 font-semibold py-1.5 hover:text-primary transition-colors"
                    >
                      Todas las subcategorías
                    </Link>
                    {subs.map((sub) => (
                      <Link
                        key={sub.id}
                        href={`/productos?categoria=${slugify(cat.nombre)}&subcategoria=${slugify(sub.nombre)}`}
                        onClick={() => setHoveredCat(null)}
                        className="flex items-center justify-between py-1.5 text-sm text-gray-600 hover:text-primary transition-colors group"
                      >
                        <span>{sub.nombre}</span>
                        <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
                      </Link>
                    ))}
                    {subs.length === 0 && (
                      <p className="text-xs text-gray-400 mt-1">Sin subcategorías</p>
                    )}
                  </div>

                  {/* Col 2 — Más buscado */}
                  <div className="border-l border-gray-100 pl-6">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
                      Más buscado
                    </p>
                    {subs.slice(0, 5).map((sub) => (
                      <Link
                        key={sub.id}
                        href={`/productos?categoria=${slugify(cat.nombre)}&subcategoria=${slugify(sub.nombre)}`}
                        onClick={() => setHoveredCat(null)}
                        className="flex items-center gap-2 py-1.5 text-sm text-gray-600 hover:text-primary transition-colors"
                      >
                        <span className="text-gray-300 text-xs">↗</span>
                        {sub.nombre}
                      </Link>
                    ))}
                    {subs.length === 0 && (
                      <p className="text-xs text-gray-400 mt-1">—</p>
                    )}
                  </div>

                  {/* Col 3-4 — Marcas destacadas */}
                  <div className="col-span-2 border-l border-gray-100 pl-6">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
                      Marcas en {cat.nombre}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {marcas.map((marca) => (
                        <Link
                          key={marca.id}
                          href={`/productos?categoria=${slugify(cat.nombre)}&marca=${slugify(marca.nombre)}`}
                          onClick={() => setHoveredCat(null)}
                          className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 hover:bg-primary/10 hover:text-primary transition-colors"
                        >
                          {marca.nombre}
                        </Link>
                      ))}
                      {marcas.length === 0 && (
                        <p className="text-xs text-gray-400">Sin marcas registradas</p>
                      )}
                    </div>
                  </div>

                </div>
              </div>
            );
          })()}
        </nav>
```

- [ ] **Step 6: TypeScript check**

Run: `cd "j:\Proyectos Claude\enexpro" && npx tsc --noEmit 2>&1 | head -30`

Expected: No errors. Common issues to fix:
- If `categoryBarRef` is still referenced elsewhere after removal (e.g., `ref={categoryBarRef}` in old code), remove remaining uses.
- If `marcasMap` brands query returns a TypeScript error on the nested `marcas(id, nombre)` select, cast with `as any`.

- [ ] **Step 7: Commit**

```bash
cd "j:\Proyectos Claude\enexpro" && git add src/components/tienda/navbar.tsx && git commit -m "feat: desktop category mega-menu with subcategories and brands"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| Import Candy, Store, BookOpen, Cigarette, MoreHorizontal, Pill, Milk, Tag + LucideIcon | Task 1 Step 1 |
| CATEGORY_ICONS, getCategoryIcon, SUBCAT_PREVIEW constants | Task 1 Step 2 |
| subcatExpanded state | Task 1 Step 3 |
| Mobile tab bar before breadcrumb, md:hidden | Task 1 Step 4 |
| Tab "Todas" clears categoria + subcategoria | Task 1 Step 4 ✅ |
| Tapping active category toggles subcatExpanded | Task 1 Step 4 ✅ |
| Tapping different category resets subcategoria + closes expanded | Task 1 Step 4 ✅ |
| Subcategory grid shows max 6, then "Ver todas (N)" button | Task 1 Step 4 ✅ |
| Active subcategory has border-primary + bg-primary/5 | Task 1 Step 4 ✅ |
| Sidebar categories tree removed | Task 1 Step 5 |
| categoriasCollapsed state removed | Task 1 Step 6 |
| ChevronDown added to navbar lucide imports | Task 2 Step 1 |
| hoveredCat, subcatsMap, marcasMap, closeTimer states | Task 2 Step 2 |
| categoryBarRef removed | Task 2 Step 2 |
| useEffect for subcategories + brands | Task 2 Step 3 |
| handleCatEnter/Leave/MenuEnter/Leave handlers | Task 2 Step 4 |
| Category bar replaced with hover + ChevronDown indicator | Task 2 Step 5 |
| Mega-menu 4 columns (subcats, most searched, brands) | Task 2 Step 5 ✅ |
| 150ms delay prevents flicker between tab and panel | Task 2 Step 5 ✅ (closeTimer) |
| Click any mega-menu link closes it (setHoveredCat(null)) | Task 2 Step 5 ✅ |
| Mega-menu only in desktop (inside hidden lg:block) | Task 2 Step 5 ✅ |

All requirements covered. No placeholders. Type names consistent across both tasks.
