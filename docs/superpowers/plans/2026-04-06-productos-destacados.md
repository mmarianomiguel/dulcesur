# Productos Destacados — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a quick star toggle to the product list, a visual featured-products panel in config, and two new auto modes (`recien_repuestos`, `mas_vendidos`) for the home page products block.

**Architecture:** Three independent changes in three files. No DB schema changes. Reuses existing `destacado` boolean on `productos`, `stock_movimientos` (columns `cantidad_antes`/`cantidad_despues`), and `venta_items`. The home server component at `src/app/(tienda)/page.tsx` handles the new query modes; the admin product list and config page handle the UI changes.

**Tech Stack:** Next.js App Router, React, TypeScript, Supabase JS client, Tailwind CSS, lucide-react, shadcn/ui

---

## File Map

| File | Change |
|------|--------|
| `src/app/(admin)/admin/productos/page.tsx` | Add star column + `soloDestacado` filter |
| `src/app/(admin)/admin/configuracion/pagina-inicio/page.tsx` | Add 2 new `orden` options + featured products panel |
| `src/app/(tienda)/page.tsx` | Handle `recien_repuestos` and `mas_vendidos` orden values |

---

## Task 1 — Star toggle column in product list

**Files:**
- Modify: `src/app/(admin)/admin/productos/page.tsx`

### Context

The product list already fetches `destacado` (line 346) and stores it in each product object (line 575). The inline visibility toggle pattern (lines 2177–2187) shows the exact approach: call `supabase.from("productos").update({...}).eq("id", product.id)` on click, then call `setProducts` to update local state optimistically. `showAdminToast` is already imported (line 74).

The filter state pattern (lines 164–165) shows how to add a boolean filter:
```tsx
const [comboFilter, setComboFilter] = useState("all");
```
And the filter button (lines 1748–1755):
```tsx
<Button variant={comboFilter === "si" ? "default" : "outline"} onClick={() => { setComboFilter(comboFilter === "si" ? "all" : "si"); setPage(1); }}>
```

---

- [ ] **Step 1: Add `soloDestacado` state and import `Star` from lucide-react**

Find the imports section (line 1 area) — `Star` is likely not imported yet. Add it to the lucide-react import line. Then find where `comboFilter` state is declared (line 165) and add the new state right after:

```tsx
// After: const [comboFilter, setComboFilter] = useState("all");
const [soloDestacado, setSoloDestacado] = useState(false);
```

Add `Star` to the lucide-react import (find the line that imports `Layers` and add `Star` to the same import).

- [ ] **Step 2: Add `soloDestacado` to the `filtered` useMemo**

In the `filtered` useMemo (around line 1536), add a new condition before the `return`:

```tsx
// Before: return matchesSearch && matchesCategory && ...
const matchesDestacado = !soloDestacado || !!(p as any).destacado;
return matchesSearch && matchesCategory && matchesSubcategory && matchesMarca && matchesStock && matchesTienda && matchesCombo && matchesDestacado;
```

Also add `soloDestacado` to the dependency array at line 1563:
```tsx
}, [products, debouncedSearch, presCodigoMap, category, subcategoryFilter, marcaFilter, comboStockMap, stockFilter, tiendaFilter, comboFilter, soloDestacado, sortBy]);
```

- [ ] **Step 3: Add "Solo destacados" toggle button next to "Combos"**

Find the Combos button (around line 1748) and add a new button right before it:

```tsx
<Button
  variant={soloDestacado ? "default" : "outline"}
  className="gap-2"
  onClick={() => { setSoloDestacado(!soloDestacado); setPage(1); }}
>
  <Star className="w-4 h-4" />
  Destacados
</Button>
```

- [ ] **Step 4: Add star column header to the table**

In the `<thead>` row (around line 2141), add a new `<th>` after the Precio column and before Acciones:

```tsx
<th className="text-center py-3 px-2 font-medium w-8"></th>
```

- [ ] **Step 5: Add star cell to each table row**

In the `<tbody>` row (after the Precio `<td>`, before the Acciones `<td>`, around line 2230), add:

```tsx
<td className="py-3 px-2 text-center">
  <button
    title={!!(product as any).destacado ? "Quitar de destacados" : "Marcar como destacado"}
    onClick={(e) => {
      e.stopPropagation();
      const newVal = !(product as any).destacado;
      setProducts((prev) =>
        prev.map((p) => p.id === product.id ? { ...p, destacado: newVal } as any : p)
      );
      supabase
        .from("productos")
        .update({ destacado: newVal })
        .eq("id", product.id)
        .then(({ error }) => {
          if (error) {
            // revert
            setProducts((prev) =>
              prev.map((p) => p.id === product.id ? { ...p, destacado: !newVal } as any : p)
            );
            showAdminToast("Error al actualizar destacado", "error");
          }
        });
    }}
    className="p-1 rounded hover:bg-muted transition-colors"
  >
    <Star
      className={`w-4 h-4 transition-colors ${!!(product as any).destacado ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40"}`}
    />
  </button>
</td>
```

- [ ] **Step 6: Verify the page compiles and star toggle works**

Run: `npx tsc --noEmit`
Expected: no errors related to the new code.

Manually test: open the product list, click a star, verify the star fills yellow and the DB is updated.

- [ ] **Step 7: Commit**

```bash
git add src/app/(admin)/admin/productos/page.tsx
git commit -m "feat: add star toggle and solo-destacados filter to product list"
```

---

## Task 2 — Featured products panel + new orden options in config

**Files:**
- Modify: `src/app/(admin)/admin/configuracion/pagina-inicio/page.tsx`

### Context

The `productos_destacados` block editor is rendered in the `renderBlockConfig` switch-case starting at line 1360. It currently has a `titulo_seccion` field, a `max_items` selector, and an `orden` selector (with values: manual, recientes, precio_asc, precio_desc, nombre).

We need to:
1. Add two new `<SelectItem>` values to the `orden` select
2. Add a visual panel below the `orden` select showing current `destacado=true` products with ✕ to remove them

---

- [ ] **Step 1: Add two new SelectItem values to the `orden` select**

Find lines 1390–1394 (the `<SelectContent>` with existing items) and add after the last existing item:

```tsx
<SelectItem value="recien_repuestos">Recién repuestos (sin stock → con stock)</SelectItem>
<SelectItem value="mas_vendidos">Más vendidos (últimos 30 días)</SelectItem>
```

Result should be:
```tsx
<SelectContent>
  <SelectItem value="manual">Manual (marcados como destacados)</SelectItem>
  <SelectItem value="recientes">Más recientes</SelectItem>
  <SelectItem value="precio_asc">Precio: menor a mayor</SelectItem>
  <SelectItem value="precio_desc">Precio: mayor a menor</SelectItem>
  <SelectItem value="nombre">Nombre A-Z</SelectItem>
  <SelectItem value="recien_repuestos">Recién repuestos (sin stock → con stock)</SelectItem>
  <SelectItem value="mas_vendidos">Más vendidos (últimos 30 días)</SelectItem>
</SelectContent>
```

- [ ] **Step 2: Add a `FeaturedProductsPanel` component inside the file**

Add this component near the top of the file (after imports, before the main component, or as an inner function). It fetches products with `destacado=true` and renders them as dismissible cards.

```tsx
function FeaturedProductsPanel() {
  const supabase = createBrowserSupabase();
  const [products, setProducts] = useState<{ id: string; nombre: string; imagen_url: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("productos")
      .select("id, nombre, imagen_url")
      .eq("destacado", true)
      .order("nombre")
      .then(({ data }) => {
        setProducts(data || []);
        setLoading(false);
      });
  }, []);

  const removeDestacado = async (id: string) => {
    setProducts((prev) => prev.filter((p) => p.id !== id));
    await supabase.from("productos").update({ destacado: false }).eq("id", id);
  };

  if (loading) return <p className="text-xs text-muted-foreground">Cargando destacados...</p>;
  if (products.length === 0)
    return <p className="text-xs text-muted-foreground italic">Ningún producto marcado como destacado.</p>;

  return (
    <div className="grid grid-cols-3 gap-2 mt-1">
      {products.map((p) => (
        <div key={p.id} className="relative group rounded-lg border border-border bg-muted/40 p-2 flex flex-col items-center gap-1">
          {p.imagen_url ? (
            <img src={p.imagen_url} alt="" className="w-12 h-12 object-contain rounded" />
          ) : (
            <div className="w-12 h-12 rounded bg-muted flex items-center justify-center">
              <Package className="w-5 h-5 text-muted-foreground" />
            </div>
          )}
          <p className="text-[10px] text-center text-foreground leading-tight line-clamp-2">{p.nombre}</p>
          <button
            onClick={() => removeDestacado(p.id)}
            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold"
            title="Quitar de destacados"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
```

Note: `Package` from lucide-react must be imported. Check if it's already imported; if not, add it.

- [ ] **Step 3: Add `FeaturedProductsPanel` below the `orden` select in the block config**

In the `case "productos_destacados":` block (around line 1398, right before `</div>`), add:

```tsx
<div className="space-y-1.5">
  <Label>Productos destacados actuales</Label>
  <FeaturedProductsPanel />
</div>
```

The full case should now end as:
```tsx
      <div className="space-y-1.5">
        <Label>Productos destacados actuales</Label>
        <FeaturedProductsPanel />
      </div>
    </div>
  );
```

- [ ] **Step 4: Verify compile**

Run: `npx tsc --noEmit`
Expected: no errors.

Open config → Página de Inicio, click on the Productos Destacados block — verify the new orden options appear and the featured panel renders.

- [ ] **Step 5: Commit**

```bash
git add src/app/(admin)/admin/configuracion/pagina-inicio/page.tsx
git commit -m "feat: add recien_repuestos/mas_vendidos orden options and featured panel in config"
```

---

## Task 3 — Handle new orden values in home server component

**Files:**
- Modify: `src/app/(tienda)/page.tsx`

### Context

The product fetch logic lives at lines 55–88. Currently it handles:
- `"manual"` or `"recientes"` → query `destacado=true` products, fallback to nombre order
- `"precio_asc"` / `"precio_desc"` → order by price
- default → order by nombre

`stock_movimientos` columns: `producto_id`, `cantidad_antes`, `cantidad_despues`, `created_at`, `tipo`.
`venta_items` columns: `producto_id`, `cantidad`, and joins to `ventas` (which has `created_at`).

---

- [ ] **Step 1: Add `recien_repuestos` case**

In the `prodPromise` IIFE (lines 64–87), add a new `else if` branch for `recien_repuestos`. Insert it between the existing `if` block (manual/recientes) and the fallback `if (!prods)` block:

```tsx
if (orden === "manual" || orden === "recientes") {
  // ... existing code unchanged ...
}

if (!prods && orden === "recien_repuestos") {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  // Find product_ids that went from 0 stock to >0 stock in the last 7 days
  const { data: movs } = await supabase
    .from("stock_movimientos")
    .select("producto_id")
    .eq("cantidad_antes", 0)
    .gt("cantidad_despues", 0)
    .gt("created_at", cutoff);
  const ids = [...new Set((movs || []).map((m: any) => m.producto_id))];
  if (ids.length > 0) {
    const { data: repuestos } = await supabase
      .from("productos")
      .select(baseSelect)
      .eq("activo", true)
      .eq("visibilidad", "visible")
      .gt("stock", 0)
      .in("id", ids)
      .limit(maxItems);
    if (repuestos && repuestos.length > 0) prods = repuestos;
  }
}
```

- [ ] **Step 2: Add `mas_vendidos` case**

Right after the `recien_repuestos` block (still before the final `if (!prods)` fallback), add:

```tsx
if (!prods && orden === "mas_vendidos") {
  const cutoff30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  // Get top product_ids by quantity sold in last 30 days
  const { data: ventaMovs } = await supabase
    .from("venta_items")
    .select("producto_id, cantidad, ventas!inner(created_at)")
    .gt("ventas.created_at", cutoff30)
    .limit(5000);
  if (ventaMovs && ventaMovs.length > 0) {
    // Aggregate by product_id
    const totals: Record<string, number> = {};
    for (const item of ventaMovs) {
      totals[item.producto_id] = (totals[item.producto_id] || 0) + Number(item.cantidad);
    }
    const topIds = Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxItems)
      .map(([id]) => id);
    if (topIds.length > 0) {
      const { data: topProds } = await supabase
        .from("productos")
        .select(baseSelect)
        .eq("activo", true)
        .eq("visibilidad", "visible")
        .in("id", topIds);
      if (topProds && topProds.length > 0) {
        // Sort by sales rank
        prods = topIds
          .map((id) => topProds.find((p: any) => p.id === id))
          .filter(Boolean) as any[];
      }
    }
  }
}
```

- [ ] **Step 3: Verify the final fallback still works**

The existing fallback `if (!prods) { ... }` at line 75 will still fire for any unrecognized `orden` value or when both new modes return no results. Confirm this block is unchanged after your edits:

```tsx
if (!prods) {
  let query = supabase
    .from("productos")
    .select(baseSelect)
    .eq("activo", true)
    .eq("visibilidad", "visible");
  if (orden === "precio_asc") query = query.order("precio", { ascending: true });
  else if (orden === "precio_desc") query = query.order("precio", { ascending: false });
  else query = query.order("nombre", { ascending: true });
  const { data } = await query.limit(maxItems);
  prods = data;
}
```

- [ ] **Step 4: Compile check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Smoke test**

In the admin config, set a Productos Destacados block to `orden = "recien_repuestos"` and save. Reload the home page. Verify it shows products (if any have stock_movimientos with cantidad_antes=0 and cantidad_despues>0 in the last 7 days), or falls back to nombre order.

Set to `orden = "mas_vendidos"`, reload. Verify products with recent sales appear.

- [ ] **Step 6: Commit and push**

```bash
git add src/app/(tienda)/page.tsx
git commit -m "feat: add recien_repuestos and mas_vendidos auto modes to home product block"
git push
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Task 1 — quick star toggle in product list (with optimistic update and revert on error)
- [x] Task 1 — "Solo destacados" filter toggle
- [x] Task 2 — visual featured products panel with ✕ to remove (`destacado = false`)
- [x] Task 2 — new `recien_repuestos` and `mas_vendidos` in `orden` selector
- [x] Task 3 — home server handles `recien_repuestos` (stock_movimientos cantidad_antes=0 → cantidad_despues>0)
- [x] Task 3 — home server handles `mas_vendidos` (venta_items SUM last 30 days)
- [x] Fallback behavior if new queries return 0 results

**Column names:** `stock_movimientos` uses `cantidad_antes` / `cantidad_despues` (confirmed from codebase). NOT `stock_anterior` / `stock_posterior`.

**Type consistency:** All references to `destacado` use `(product as any).destacado` or `(p as any).destacado` consistent with existing code style.

**No placeholders:** All steps contain actual code.
