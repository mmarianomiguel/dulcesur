# Productos Destacados — Mejora de gestión

**Date:** 2026-04-06
**Status:** Approved

## Summary

Improve the "Productos Destacados" system to make curation faster and more powerful. Three independent changes: a quick star toggle in the product list, a visual management panel in configuration, and two new automatic selection modes.

---

## Architecture

Three independent changes. No schema changes required — uses existing `destacado` boolean on `productos`, `stock_movimientos` for restock detection, and `venta_items` for bestseller ranking.

### Change 1 — Quick star toggle in product list

**Location:** `src/app/(admin)/admin/productos/page.tsx` (or its client component)

- Add a star column to the products table (last column, fixed width ~40px)
- Clicking the star calls `supabase.from("productos").update({ destacado: !current }).eq("id", id)` inline — no dialog
- Star icon: filled yellow (`★`) when `destacado = true`, outline gray when false
- Optimistic UI: flip state immediately, revert on error
- Add a "Solo destacados" toggle filter above the table (boolean filter, not a tab)

### Change 2 — Visual panel in Configuración → Página de Inicio

**Location:** `src/app/(admin)/admin/configuracion/page.tsx` (or the store config tab)

- Under the "Productos Destacados" block settings, show a grid of currently featured products
- Each product card: thumbnail + name + ✕ button
- Clicking ✕ calls `supabase.from("productos").update({ destacado: false }).eq("id", id)` and removes from grid
- Read: `supabase.from("productos").select("id, nombre, imagen_url").eq("destacado", true).order("nombre")`
- Panel is read-only except for the ✕ action; full editing still done via product list

### Change 3 — New auto modes for `orden` selector

The `bloques` table has an `orden` field that controls how products are selected for a featured block on the home page.

Add two new values to the `orden` selector in the block editor:

**`recien_repuestos`**
- Query: products whose stock went from 0 to >0 in the last N days (configurable, default 7)
- Source: `stock_movimientos` — find `producto_id` where there exists a movement with `cantidad > 0` and `created_at > cutoff` AND the product currently has `stock > 0`
- Simplification: query `stock_movimientos` for recent entries with `tipo = 'ajuste'` or `tipo = 'compra'` and `stock_posterior > 0` where `stock_anterior = 0`, grouped by `producto_id`, limit to N days
- Home server component handles the query; client receives a flat product list regardless of mode

**`mas_vendidos`**
- Query: top products by total quantity sold in the last 30 days
- Source: `venta_items` joined to `ventas` — `SUM(cantidad)` grouped by `producto_id`, filtered by `ventas.created_at > 30-day cutoff`
- Return top N product IDs, then fetch full product data from `productos`

### Home server component changes

`src/app/(tienda)/home-client.tsx` already handles blocks. The server component that fetches block data needs to handle the two new `orden` values and resolve them to a list of product IDs before passing to the client.

---

## Data Flow

```
Admin: product list → star click → supabase update destacado
Admin: config page → featured panel → shows destacado=true products → ✕ to remove
Admin: block editor → orden selector → pick recien_repuestos / mas_vendidos

Home server component:
  for each bloque:
    if orden = "destacado" → select where destacado = true
    if orden = "recien_repuestos" → query stock_movimientos for 0→>0 in last N days
    if orden = "mas_vendidos" → query venta_items SUM(cantidad) last 30 days
    → resolve to product list → pass to client
```

---

## Error Handling

- Star toggle: optimistic update with revert on error, toast on failure
- Featured panel: loading state while fetching, empty state if no featured products
- Auto modes: if query returns 0 results, block renders empty (same as current behavior)
- `stock_movimientos` / `venta_items` queries: if table is missing columns, fallback to `destacado` mode

---

## Scope Boundaries

- No new database tables or columns
- No changes to the block schema (just new valid values for `orden`)
- The `recien_repuestos` N-days config can be hardcoded to 7 initially (no UI needed)
- Bestseller window is hardcoded to 30 days
- No drag-and-drop reordering of featured products (out of scope)
