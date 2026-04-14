# Productos Module Visual Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visually redesign the Productos admin module (3 files) to add semantic color coding, catalog health alerts, quick-view rows, unified history, two-column discount form, and brand improvements.

**Architecture:** All changes are confined to three existing page files. Shared helper functions (initials, relative date, color palette) are added at the top of `productos/page.tsx` since that's the only file that uses them; `descuentos` and `marcas` get simpler additions. No new files needed.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Supabase client-side queries, Lucide icons.

---

## Scope note

The spec covers 3 independent files. Tasks 1–10 touch `productos/page.tsx` (4373 lines), Tasks 11–12 touch `descuentos/page.tsx` (702 lines), Tasks 13–14 touch `marcas/page.tsx` (728 lines). Each group can be committed independently.

---

## File Map

| File | Lines | What changes |
|---|---|---|
| `src/app/(admin)/admin/productos/page.tsx` | 4373 | Add helper fns, health bar, quick-view panel, price column dates, initials, proveedor combobox, price tab cards, unified historial, problems view |
| `src/app/(admin)/admin/productos/descuentos/page.tsx` | 702 | Replace table with card list; replace wizard layout with two-column form |
| `src/app/(admin)/admin/productos/marcas/page.tsx` | 728 | Add avatar initials, color-coded badge, sin-productos filter, last-updated column |

---

## Task 1 — Add helper functions to productos/page.tsx

**Files:**
- Modify: `src/app/(admin)/admin/productos/page.tsx`

These helpers are used throughout Tasks 2–10. Add them before the `ProductosPage` component function (after the interfaces, around line 133).

- [ ] **Step 1: Add helpers block**

Insert after the `ProductoWithRelations` type definition (after line ~132) and before `export default function ProductosPage()`:

```typescript
// ── Helpers ──────────────────────────────────────────────────────────────
function formatRelativeDate(dateStr: string): string {
  const days = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (days === 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days} días`;
  if (days < 60) return "hace 1 mes";
  return `hace ${Math.floor(days / 30)} meses`;
}

function getProductInitials(nombre: string): string {
  const words = nombre.trim().split(" ").filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function getInitialsColor(nombre: string): { background: string; color: string } {
  const colors = [
    { background: "#EEEDFE", color: "#3C3489" },
    { background: "#E6F1FB", color: "#0C447C" },
    { background: "#EAF3DE", color: "#27500A" },
    { background: "#FAEEDA", color: "#633806" },
    { background: "#E1F5EE", color: "#085041" },
  ];
  const idx = nombre.charCodeAt(0) % colors.length;
  return colors[idx];
}

function getPrecioEfectivo(product: ProductoWithRelations & { precio_oferta?: number | null; precio_oferta_hasta?: string | null }): { precio: number; enOferta: boolean; precioOriginal: number } {
  const hoy = new Date().toISOString().split("T")[0];
  const enOferta =
    !!product.precio_oferta &&
    product.precio_oferta > 0 &&
    (!product.precio_oferta_hasta || product.precio_oferta_hasta >= hoy);
  return {
    precio: enOferta ? product.precio_oferta! : product.precio,
    enOferta,
    precioOriginal: product.precio,
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "j:/Proyectos Claude/enexpro" && npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors related to the helpers.

- [ ] **Step 3: Commit**

```bash
cd "j:/Proyectos Claude/enexpro" && git add src/app/\(admin\)/admin/productos/page.tsx && git commit -m "feat(productos): add helper functions — initials, relative date, precio efectivo"
```

---

## Task 2 — Catalog health bar (spec §1.1)

**Files:**
- Modify: `src/app/(admin)/admin/productos/page.tsx`

- [ ] **Step 1: Add state and memoized catalog problems**

Find the block of `useState` declarations inside `ProductosPage` (around line 160–200) and add after the existing state declarations:

```typescript
const [showProblemsView, setShowProblemsView] = useState(false);
const [problemsTab, setProblemsTab] = useState<
  "sin_categoria" | "sin_imagen" | "precio_costo" | "sin_proveedor"
>("sin_categoria");
```

Then add the `useMemo` (place it after all `useCallback` / `useEffect` hooks, before the JSX return, around line 600+):

```typescript
const catalogProblems = useMemo(() => {
  const sinCategoria = products.filter((p) => !p.categoria_id).length;
  const sinImagen = products.filter((p) => !p.imagen_url).length;
  const precioBajoCosto = products.filter(
    (p) => p.costo > 0 && p.precio <= p.costo
  ).length;
  const sinProveedor = products.filter((p) => !prodProvMap[p.id]).length;
  const total = sinCategoria + sinImagen + precioBajoCosto + sinProveedor;
  return { sinCategoria, sinImagen, precioBajoCosto, sinProveedor, total };
}, [products, prodProvMap]);
```

- [ ] **Step 2: Add the health bar in JSX**

Find the JSX return's outermost container (the `<div className="p-6 ...">` or similar outer wrapper). Locate the line where the stat cards begin. Insert the health bar immediately **before** the stat cards row:

```tsx
{catalogProblems.total > 0 && (
  <button
    onClick={() => setShowProblemsView(true)}
    className="w-full flex items-center gap-3 px-4 py-2.5 bg-background border border-red-200 rounded-xl text-left hover:border-red-300 transition-colors mb-4"
  >
    <div className="w-2 h-2 rounded-full bg-red-500 shrink-0 animate-pulse" />
    <span className="text-sm text-red-700 flex-1">
      <strong>Catálogo con problemas:</strong>
      {catalogProblems.sinCategoria > 0 &&
        ` ${catalogProblems.sinCategoria} sin categoría ·`}
      {catalogProblems.sinImagen > 0 &&
        ` ${catalogProblems.sinImagen} sin imagen ·`}
      {catalogProblems.precioBajoCosto > 0 &&
        ` ${catalogProblems.precioBajoCosto} con precio < costo ·`}
      {catalogProblems.sinProveedor > 0 &&
        ` ${catalogProblems.sinProveedor} sin proveedor`}
    </span>
    <span className="text-xs text-primary underline shrink-0">Ver todos →</span>
  </button>
)}
```

- [ ] **Step 3: Verify build**

```bash
cd "j:/Proyectos Claude/enexpro" && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
cd "j:/Proyectos Claude/enexpro" && git add src/app/\(admin\)/admin/productos/page.tsx && git commit -m "feat(productos): add catalog health bar with problem counts"
```

---

## Task 3 — Sin stock card with red border (spec §1.2)

**Files:**
- Modify: `src/app/(admin)/admin/productos/page.tsx`

- [ ] **Step 1: Find the stat card for "Sin stock"**

Search for the Card that renders the `outOfStock` count. It will look similar to:

```tsx
<Card
  className="cursor-pointer transition-colors hover:bg-muted/40"
  onClick={() => { setStockFilter("no"); setPage(1); }}
>
```

- [ ] **Step 2: Add conditional red border**

Replace that Card's `className` with:

```tsx
className={`cursor-pointer transition-colors ${
  outOfStock > 0
    ? "border-red-200 hover:border-red-300"
    : "hover:bg-muted/40"
}`}
```

- [ ] **Step 3: Verify + commit**

```bash
cd "j:/Proyectos Claude/enexpro" && npx tsc --noEmit 2>&1 | head -20
git add src/app/\(admin\)/admin/productos/page.tsx && git commit -m "feat(productos): red border on sin-stock stat card"
```

---

## Task 4 — Quick-view panel state + row click (spec §1.3)

**Files:**
- Modify: `src/app/(admin)/admin/productos/page.tsx`

- [ ] **Step 1: Add quick-view state**

Add to the state block near the other dialog states (around line 190):

```typescript
const [quickViewProduct, setQuickViewProduct] =
  useState<ProductoWithRelations | null>(null);
```

- [ ] **Step 2: Make table rows clickable**

Find the `<tr key={product.id}` in the product list table. Replace its `className` and add `onClick`:

```tsx
<tr
  key={product.id}
  onClick={() =>
    setQuickViewProduct(
      quickViewProduct?.id === product.id ? null : product
    )
  }
  className={`border-b last:border-0 transition-colors cursor-pointer ${
    selected.has(product.id)
      ? "bg-accent"
      : quickViewProduct?.id === product.id
      ? "bg-primary/5"
      : "hover:bg-muted/50"
  }`}
>
```

Note: The existing row probably uses `isSelected` — replace with `selected.has(product.id)` if that matches the existing variable. Check the current row code carefully and only change the `className` and `onClick` attributes.

- [ ] **Step 3: Add quick-view panel `<tr>` after each product row**

Immediately after the closing `</tr>` of the product row, add:

```tsx
{quickViewProduct?.id === product.id && (
  <tr key={`qv-${product.id}`}>
    <td colSpan={10} className="p-0">
      <div className="mx-3 mb-3 mt-1 border border-primary/20 rounded-xl overflow-hidden bg-background">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
          <div>
            <p className="text-sm font-semibold">{quickViewProduct.nombre}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {(quickViewProduct as any).categorias?.nombre} ·{" "}
              {(quickViewProduct as any).marcas?.nombre || "Sin marca"} ·{" "}
              {quickViewProduct.fecha_actualizacion
                ? `Precio actualizado ${formatRelativeDate(quickViewProduct.fecha_actualizacion)}`
                : "Sin fecha de actualización"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                openEdit(quickViewProduct);
              }}
            >
              Editar completo
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                setStockPopover({
                  productId: quickViewProduct.id,
                  productName: quickViewProduct.nombre,
                  currentStock: quickViewProduct.stock,
                  anchorEl: e.currentTarget,
                });
              }}
            >
              Ajustar stock
            </Button>
          </div>
        </div>

        {/* Price cards */}
        <div className="grid grid-cols-3 gap-3 p-4 border-b">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
            <p className="text-[10px] font-semibold text-blue-700 uppercase tracking-wider mb-1">Costo</p>
            <p className="text-lg font-semibold text-blue-800">{formatCurrency(quickViewProduct.costo)}</p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider mb-1">Precio venta</p>
            <p className="text-lg font-semibold text-emerald-800">{formatCurrency(quickViewProduct.precio)}</p>
          </div>
          <div className="rounded-lg border border-violet-200 bg-violet-50 p-3">
            <p className="text-[10px] font-semibold text-violet-700 uppercase tracking-wider mb-1">Margen</p>
            <p className="text-lg font-semibold text-violet-800">
              {quickViewProduct.costo > 0
                ? `${Math.round(
                    ((quickViewProduct.precio - quickViewProduct.costo) /
                      quickViewProduct.costo) *
                      100
                  )}%`
                : "—"}
            </p>
          </div>
        </div>

        {/* Stock + supplier row */}
        <div className="grid grid-cols-4 gap-3 px-4 py-3 border-b">
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground">Stock actual</p>
            <p
              className={`text-base font-semibold mt-0.5 ${
                quickViewProduct.stock <= 0
                  ? "text-red-600"
                  : quickViewProduct.stock <=
                    (quickViewProduct.stock_minimo || 5)
                  ? "text-orange-500"
                  : "text-foreground"
              }`}
            >
              {quickViewProduct.stock}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground">Mínimo</p>
            <p className="text-base font-semibold mt-0.5">
              {quickViewProduct.stock_minimo || "—"}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground">Máximo</p>
            <p className="text-base font-semibold mt-0.5">
              {(quickViewProduct as any).stock_maximo || "—"}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground">Proveedor</p>
            <p className="text-xs font-medium mt-0.5 truncate">
              {prodProvMap[quickViewProduct.id] || "Sin asignar"}
            </p>
          </div>
        </div>

        {/* Tags + status badges */}
        <div className="px-4 py-2.5 flex flex-wrap gap-1.5">
          {quickViewProduct.stock <= 0 && (
            <Badge variant="destructive" className="text-[10px]">
              Sin stock
            </Badge>
          )}
          {(quickViewProduct as any).visibilidad === "oculto" && (
            <Badge className="text-[10px] bg-red-100 text-red-700 hover:bg-red-100">
              Oculto en tienda
            </Badge>
          )}
          {quickViewProduct.costo > 0 &&
            quickViewProduct.precio <= quickViewProduct.costo && (
              <Badge className="text-[10px] bg-red-100 text-red-700 hover:bg-red-100">
                ⚠ Precio &lt; costo
              </Badge>
            )}
          {((quickViewProduct as any).tags as string[] | undefined)?.map(
            (tag) => (
              <Badge key={tag} variant="secondary" className="text-[10px]">
                {tag}
              </Badge>
            )
          )}
          {quickViewProduct.fecha_actualizacion &&
            (() => {
              const days = Math.floor(
                (Date.now() -
                  new Date(
                    quickViewProduct.fecha_actualizacion!
                  ).getTime()) /
                  (1000 * 60 * 60 * 24)
              );
              if (days > 30)
                return (
                  <Badge className="text-[10px] bg-amber-100 text-amber-700 hover:bg-amber-100">
                    Precio: hace {days} días
                  </Badge>
                );
              return null;
            })()}
        </div>
      </div>
    </td>
  </tr>
)}
```

Note: `setStockPopover` — check the existing codebase for the actual stock popover state setter name. If the existing stock popover uses a different state shape, match it.

- [ ] **Step 4: Verify**

```bash
cd "j:/Proyectos Claude/enexpro" && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 5: Commit**

```bash
cd "j:/Proyectos Claude/enexpro" && git add src/app/\(admin\)/admin/productos/page.tsx && git commit -m "feat(productos): quick-view panel on table row click"
```

---

## Task 5 — Price column with relative date (spec §1.4)

**Files:**
- Modify: `src/app/(admin)/admin/productos/page.tsx`

- [ ] **Step 1: Find the price `<td>` in the table**

Search for the cell that renders `formatCurrency(product.precio)`. It's in the table row render block.

- [ ] **Step 2: Replace with date-aware version**

Replace the price cell content with:

```tsx
<td className="py-3 px-4 text-right">
  <div>
    {(() => {
      const { precio, enOferta, precioOriginal } = getPrecioEfectivo(
        product as any
      );
      return enOferta ? (
        <>
          <p className="font-semibold text-orange-600">
            {formatCurrency(precio)}
          </p>
          <p className="text-[10px] line-through text-muted-foreground">
            {formatCurrency(precioOriginal)}
          </p>
        </>
      ) : (
        <>
          <p
            className={`font-semibold ${
              product.costo > 0 && product.precio <= product.costo
                ? "text-red-600"
                : ""
            }`}
          >
            {formatCurrency(product.precio)}
            {product.costo > 0 && product.precio <= product.costo && (
              <AlertTriangle className="w-3 h-3 inline ml-1 text-red-500" />
            )}
          </p>
          {(product as any).fecha_actualizacion && (
            <p className="text-[10px] text-muted-foreground">
              {formatRelativeDate((product as any).fecha_actualizacion)}
            </p>
          )}
        </>
      );
    })()}
  </div>
</td>
```

- [ ] **Step 3: Verify + commit**

```bash
cd "j:/Proyectos Claude/enexpro" && npx tsc --noEmit 2>&1 | head -20
git add src/app/\(admin\)/admin/productos/page.tsx && git commit -m "feat(productos): price column shows relative date and oferta indicator"
```

---

## Task 6 — Initials placeholder for images (spec §1.5)

**Files:**
- Modify: `src/app/(admin)/admin/productos/page.tsx`

- [ ] **Step 1: Replace image `<td>` in table**

Find the image cell in the table (renders `<img src={product.imagen_url}` or `<ImageIcon>`). Replace with:

```tsx
<td className="py-3 px-2">
  {(product as any).imagen_url ? (
    <img
      src={(product as any).imagen_url}
      alt=""
      className="w-8 h-8 rounded object-cover"
    />
  ) : (
    <div
      className="w-8 h-8 rounded flex items-center justify-center text-[10px] font-semibold shrink-0"
      style={getInitialsColor(product.nombre)}
    >
      {getProductInitials(product.nombre)}
    </div>
  )}
</td>
```

- [ ] **Step 2: Replace image placeholder in the edit dialog**

In the dialog, find where `imagen_url` is empty and `ImageIcon` or a placeholder div is shown. Replace the empty-state image container with:

```tsx
<div
  className="w-[90px] h-[90px] rounded-xl flex flex-col items-center justify-center text-xl font-semibold"
  style={getInitialsColor(form.nombre || "?")}
>
  {getProductInitials(form.nombre || "?")}
  <span className="text-[9px] font-normal mt-1 opacity-60">Sin imagen</span>
</div>
```

- [ ] **Step 3: Verify + commit**

```bash
cd "j:/Proyectos Claude/enexpro" && npx tsc --noEmit 2>&1 | head -20
git add src/app/\(admin\)/admin/productos/page.tsx && git commit -m "feat(productos): initials placeholder when product has no image"
```

---

## Task 7 — Proveedor searchable combobox in dialog (spec §1.6)

**Files:**
- Modify: `src/app/(admin)/admin/productos/page.tsx`

- [ ] **Step 1: Add new state variables**

Add next to the existing proveedor-related state (around `selectedProveedores`):

```typescript
const [provSearch, setProvSearch] = useState("");
const [provOpen, setProvOpen] = useState(false);
```

The `toggleProveedor` function likely already exists. If not, it is:

```typescript
const toggleProveedor = (id: string) => {
  setSelectedProveedores((prev) =>
    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
  );
};
```

- [ ] **Step 2: Find and replace proveedor selector in dialog**

Search for the block in the edit dialog that shows proveedores (probably a grid of buttons or checkboxes). Replace the entire proveedor section with:

```tsx
{/* Proveedor — searchable */}
<div>
  <Label className="text-xs text-muted-foreground">Proveedores</Label>
  {selectedProveedores.length > 0 && (
    <div className="flex flex-wrap gap-1.5 mb-2">
      {selectedProveedores.map((id) => {
        const prov = proveedores.find((p) => p.id === id);
        return prov ? (
          <span
            key={id}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20"
          >
            {prov.nombre}
            <button
              type="button"
              onClick={() => toggleProveedor(id)}
              className="hover:text-destructive ml-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ) : null;
      })}
    </div>
  )}
  <div className="relative">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
    <Input
      placeholder="Buscar proveedor..."
      value={provSearch}
      onChange={(e) => {
        setProvSearch(e.target.value);
        setProvOpen(true);
      }}
      onFocus={() => setProvOpen(true)}
      className="pl-8 h-9 text-sm"
    />
    {provOpen && (
      <>
        <div
          className="fixed inset-0 z-[49]"
          onClick={() => setProvOpen(false)}
        />
        <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
          {proveedores
            .filter(
              (p) =>
                !selectedProveedores.includes(p.id) &&
                p.nombre
                  .toLowerCase()
                  .includes(provSearch.toLowerCase())
            )
            .map((p) => (
              <button
                key={p.id}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                onClick={() => {
                  toggleProveedor(p.id);
                  setProvSearch("");
                  setProvOpen(false);
                }}
              >
                {p.nombre}
              </button>
            ))}
          {proveedores.filter(
            (p) =>
              !selectedProveedores.includes(p.id) &&
              p.nombre
                .toLowerCase()
                .includes(provSearch.toLowerCase())
          ).length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              Sin resultados
            </p>
          )}
        </div>
      </>
    )}
  </div>
</div>
```

- [ ] **Step 3: Verify + commit**

```bash
cd "j:/Proyectos Claude/enexpro" && npx tsc --noEmit 2>&1 | head -20
git add src/app/\(admin\)/admin/productos/page.tsx && git commit -m "feat(productos): proveedor searchable combobox in edit dialog"
```

---

## Task 8 — Tab Precios: color cards + margin alert + fecha (spec §1.7)

**Files:**
- Modify: `src/app/(admin)/admin/productos/page.tsx`

- [ ] **Step 1: Find the Precios tab in the dialog**

Search for `editTab === "precios"` or `value="precios"` in the dialog tabs section.

- [ ] **Step 2: Add/replace price cards**

Find the area that renders Costo and Precio inputs. Replace with three color-coded cards:

```tsx
{/* Price cards */}
<div className="grid grid-cols-3 gap-3 mb-4">
  {/* Costo */}
  <div className="rounded-xl border-2 border-blue-100 bg-blue-50/80 p-3 space-y-1.5">
    <div className="flex items-center gap-1.5">
      <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center">
        <span className="text-[10px] font-bold text-blue-600">C</span>
      </div>
      <Label className="text-xs font-semibold text-blue-700">Costo</Label>
    </div>
    <MoneyInput
      value={form.costo}
      onValueChange={(v) => setForm({ ...form, costo: v })}
      className="h-10 text-lg font-semibold"
    />
  </div>

  {/* Precio */}
  <div className="rounded-xl border-2 border-emerald-100 bg-emerald-50/80 p-3 space-y-1.5">
    <div className="flex items-center gap-1.5">
      <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
        <span className="text-[10px] font-bold text-emerald-600">$</span>
      </div>
      <Label className="text-xs font-semibold text-emerald-700">Precio venta</Label>
    </div>
    <MoneyInput
      value={form.precio}
      onValueChange={(v) => setForm({ ...form, precio: v })}
      className="h-10 text-lg font-semibold"
    />
  </div>

  {/* Margen */}
  <div className="rounded-xl border-2 border-violet-100 bg-violet-50/80 p-3 space-y-1.5">
    <div className="flex items-center gap-1.5">
      <div className="w-5 h-5 rounded-full bg-violet-100 flex items-center justify-center">
        <span className="text-[10px] font-bold text-violet-600">%</span>
      </div>
      <Label className="text-xs font-semibold text-violet-700">Margen</Label>
    </div>
    {form.costo > 0 ? (
      <>
        <Input
          type="number"
          step="0.1"
          value={
            Math.round(
              ((form.precio - form.costo) / form.costo) * 1000
            ) / 10
          }
          onChange={(e) => {
            const m = Number(e.target.value);
            const newPrecio = Math.round(form.costo * (1 + m / 100));
            setForm({ ...form, precio: newPrecio });
          }}
          className="h-10 text-lg font-semibold text-center"
        />
        <p className="text-[11px] text-center text-emerald-700 font-medium">
          Ganancia: {formatCurrency(form.precio - form.costo)}
        </p>
      </>
    ) : (
      <div className="h-10 flex items-center justify-center text-sm text-muted-foreground">
        Ingresá costo
      </div>
    )}
  </div>
</div>

{/* Negative margin alert */}
{form.costo > 0 && form.precio <= form.costo && (
  <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
    <AlertTriangle className="w-4 h-4 shrink-0" />
    <span>
      El precio de venta es menor o igual al costo. Estás vendiendo a pérdida.
    </span>
  </div>
)}

{/* Last update date */}
{editingProduct?.fecha_actualizacion && (
  <p className="text-xs text-muted-foreground mb-4">
    Precio actualizado por última vez{" "}
    <span
      className={`font-medium ${
        Math.floor(
          (Date.now() -
            new Date(editingProduct.fecha_actualizacion).getTime()) /
            (1000 * 60 * 60 * 24)
        ) > 30
          ? "text-amber-600"
          : "text-foreground"
      }`}
    >
      {formatRelativeDate(editingProduct.fecha_actualizacion)}
    </span>
    {Math.floor(
      (Date.now() -
        new Date(editingProduct.fecha_actualizacion).getTime()) /
        (1000 * 60 * 60 * 24)
    ) > 30 && (
      <span className="text-amber-600"> — puede estar desactualizado</span>
    )}
  </p>
)}
```

- [ ] **Step 3: Verify + commit**

```bash
cd "j:/Proyectos Claude/enexpro" && npx tsc --noEmit 2>&1 | head -20
git add src/app/\(admin\)/admin/productos/page.tsx && git commit -m "feat(productos): precios tab — color cards, margin calc, stale price warning"
```

---

## Task 9 — Unified historial tab (spec §1.8)

**Files:**
- Modify: `src/app/(admin)/admin/productos/page.tsx`

- [ ] **Step 1: Add historial state**

Add near other dialog states:

```typescript
const [historialFilter, setHistorialFilter] = useState<
  "todos" | "precios" | "stock"
>("todos");
```

- [ ] **Step 2: Add unifiedHistory memo**

Place after the `catalogProblems` memo or near the other memos:

```typescript
const unifiedHistory = useMemo(() => {
  type HistItem = {
    id: string;
    tipo: string;
    descripcion: string;
    fecha: string;
    usuario: string;
    valor: string;
  };
  const items: HistItem[] = [];

  priceHistory.forEach((h) => {
    const up = h.precio_nuevo > h.precio_anterior;
    items.push({
      id: `precio-${h.id}`,
      tipo: up ? "precio_subida" : "precio_bajada",
      descripcion: `Precio ${up ? "subido" : "bajado"}: ${formatCurrency(
        h.precio_anterior
      )} → ${formatCurrency(h.precio_nuevo)}`,
      fecha: h.created_at,
      usuario: h.usuario || "Admin",
      valor: `${up ? "+" : ""}${Math.round(
        ((h.precio_nuevo - h.precio_anterior) / h.precio_anterior) * 100
      )}%`,
    });
  });

  historyItems.forEach((h) => {
    const isVenta = h.tipo.toLowerCase().includes("venta");
    const isCompra = h.tipo.toLowerCase().includes("compra");
    items.push({
      id: `stock-${h.id}`,
      tipo: isVenta ? "venta" : isCompra ? "compra" : "ajuste",
      descripcion:
        h.descripcion || h.referencia || h.tipo,
      fecha: h.created_at,
      usuario: h.usuario || "Sistema",
      valor: `${h.cantidad > 0 ? "+" : ""}${h.cantidad} un.`,
    });
  });

  return items
    .filter((i) => {
      if (historialFilter === "precios") return i.tipo.startsWith("precio");
      if (historialFilter === "stock") return !i.tipo.startsWith("precio");
      return true;
    })
    .sort(
      (a, b) =>
        new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
    );
}, [priceHistory, historyItems, historialFilter]);
```

- [ ] **Step 3: Update openEdit to load both price + stock history in parallel**

Find the `openEdit` function. After setting the form state, at the end of the function, ensure both histories are loaded in parallel. Replace the existing history-loading logic (which may separately call `setHistoryItems` or `setPriceHistory`) with:

```typescript
Promise.all([
  supabase
    .from("precio_historial")
    .select("*")
    .eq("producto_id", p.id)
    .order("created_at", { ascending: false })
    .limit(20),
  supabase
    .from("stock_movimientos")
    .select(
      "id, tipo, cantidad_antes, cantidad_despues, cantidad, referencia, descripcion, usuario, created_at"
    )
    .eq("producto_id", p.id)
    .order("created_at", { ascending: false })
    .limit(30),
]).then(([{ data: ph }, { data: sm }]) => {
  setPriceHistory((ph || []) as any);
  setHistoryItems((sm || []) as any);
});
```

- [ ] **Step 4: Replace historial tab content**

Find `editTab === "historial"` in the dialog JSX. Replace the entire tab content with:

```tsx
{editTab === "historial" && (
  <div className="space-y-4">
    {/* Filter pills */}
    <div className="flex gap-2">
      {(["todos", "precios", "stock"] as const).map((f) => (
        <button
          key={f}
          onClick={() => setHistorialFilter(f)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all capitalize ${
            historialFilter === f
              ? "bg-primary text-primary-foreground border-primary"
              : "border-border text-muted-foreground hover:border-primary/50"
          }`}
        >
          {f === "todos" ? "Todos" : f === "precios" ? "Precios" : "Stock"}
        </button>
      ))}
    </div>

    {/* Unified list */}
    <div className="space-y-0 divide-y">
      {unifiedHistory.map((item) => (
        <div key={item.id} className="flex items-center gap-3 py-3">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
              item.tipo === "precio_subida"
                ? "bg-amber-50 text-amber-700"
                : item.tipo === "precio_bajada"
                ? "bg-green-50 text-green-700"
                : item.tipo === "venta"
                ? "bg-red-50 text-red-700"
                : item.tipo === "compra"
                ? "bg-green-50 text-green-700"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {item.tipo === "precio_subida"
              ? "↑$"
              : item.tipo === "precio_bajada"
              ? "↓$"
              : item.tipo === "venta"
              ? "−"
              : item.tipo === "compra"
              ? "+"
              : "~"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{item.descripcion}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatRelativeDate(item.fecha)} · {item.usuario}
            </p>
          </div>
          <div
            className={`text-sm font-semibold shrink-0 ${
              item.tipo === "precio_subida"
                ? "text-amber-600"
                : item.tipo === "compra"
                ? "text-green-600"
                : item.tipo === "venta"
                ? "text-red-600"
                : "text-muted-foreground"
            }`}
          >
            {item.valor}
          </div>
        </div>
      ))}
      {unifiedHistory.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          Sin registros
        </p>
      )}
    </div>
  </div>
)}
```

- [ ] **Step 5: Remove standalone history dialogs**

Search for `phDialogOpen` and `historyOpen` state. Remove:
- The `phDialogOpen` state declaration
- The `phProduct` state declaration
- The `phData` state declaration
- The `phLoading` state declaration
- The separate `<Dialog>` blocks that render those dialogs (not the main edit dialog)
- The `historyOpen` state declaration
- The `historyProduct` state declaration

Keep `historyItems` and `historyLoading` since they are reused by the new unified tab.

- [ ] **Step 6: Verify + commit**

```bash
cd "j:/Proyectos Claude/enexpro" && npx tsc --noEmit 2>&1 | head -30
git add src/app/\(admin\)/admin/productos/page.tsx && git commit -m "feat(productos): unified historial tab — prices + stock in one view"
```

---

## Task 10 — Problematic products view (spec §1.9)

**Files:**
- Modify: `src/app/(admin)/admin/productos/page.tsx`

The `showProblemsView` and `problemsTab` state were already added in Task 2.

- [ ] **Step 1: Wrap the main listing with a conditional**

Find the main product listing section in the JSX (the part with the filters + table). Wrap it:

```tsx
{showProblemsView ? (
  /* PROBLEMS VIEW — see Step 2 */
  <ProblemsView />
) : (
  /* NORMAL LISTING — existing code unchanged */
  /* ... existing table code ... */
)}
```

Since we can't define a separate component easily, inline the problems view directly.

- [ ] **Step 2: Replace the placeholder with the full problems view JSX**

```tsx
{showProblemsView ? (
  <div>
    {/* Header */}
    <div className="flex items-center justify-between mb-4">
      <div>
        <h2 className="text-lg font-semibold">Productos problemáticos</h2>
        <p className="text-sm text-muted-foreground">
          {catalogProblems.total} productos requieren atención
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowProblemsView(false)}
      >
        ← Volver al listado
      </Button>
    </div>

    {/* Problem type tabs */}
    <div className="flex gap-2 mb-4 flex-wrap">
      {(
        [
          { key: "sin_categoria", label: "Sin categoría", count: catalogProblems.sinCategoria },
          { key: "sin_imagen", label: "Sin imagen", count: catalogProblems.sinImagen },
          { key: "precio_costo", label: "Precio < costo", count: catalogProblems.precioBajoCosto },
          { key: "sin_proveedor", label: "Sin proveedor", count: catalogProblems.sinProveedor },
        ] as const
      ).map(({ key, label, count }) => (
        <button
          key={key}
          onClick={() => setProblemsTab(key)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
            problemsTab === key
              ? "bg-primary text-primary-foreground border-primary"
              : count > 0
              ? "border-red-200 text-red-700 bg-red-50 hover:border-red-300"
              : "border-border text-muted-foreground"
          }`}
        >
          {label} ({count})
        </button>
      ))}
    </div>

    {/* Description + bulk action */}
    {(() => {
      const descriptions: Record<string, string> = {
        sin_categoria:
          "Estos productos no aparecen correctamente en la tienda ni en los filtros del sistema.",
        sin_imagen:
          "Los productos sin imagen tienen menor tasa de venta en la tienda online.",
        precio_costo:
          "Estás vendiendo estos productos a pérdida o sin ganancia.",
        sin_proveedor:
          "Sin proveedor asignado no podés generar pedidos automáticos desde Stock crítico.",
      };
      return (
        <div className="flex items-start justify-between gap-3 bg-muted/50 rounded-lg px-4 py-3 mb-4 text-sm">
          <p className="text-muted-foreground">{descriptions[problemsTab]}</p>
          {problemsTab === "precio_costo" && (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 text-xs"
              onClick={() => {
                /* Link to editar-precios page */
                window.location.href = "/admin/productos/editar-precios";
              }}
            >
              Editar precios
            </Button>
          )}
        </div>
      );
    })()}

    {/* Product list */}
    <div className="space-y-2">
      {products
        .filter((p) => {
          if (problemsTab === "sin_categoria") return !p.categoria_id;
          if (problemsTab === "sin_imagen") return !(p as any).imagen_url;
          if (problemsTab === "precio_costo")
            return p.costo > 0 && p.precio <= p.costo;
          if (problemsTab === "sin_proveedor") return !prodProvMap[p.id];
          return false;
        })
        .map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-3 px-4 py-3 border rounded-xl hover:border-primary/30 transition-colors bg-background"
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-semibold shrink-0"
              style={getInitialsColor(p.nombre)}
            >
              {getProductInitials(p.nombre)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{p.nombre}</p>
              <p className="text-xs text-muted-foreground font-mono">
                {(p as any).codigo} · Stock: {p.stock} · {formatCurrency(p.precio)}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 text-xs h-7 text-primary border-primary/30 bg-primary/5 hover:bg-primary/10"
              onClick={() => openEdit(p)}
            >
              {problemsTab === "sin_categoria"
                ? "Asignar categoría"
                : problemsTab === "sin_imagen"
                ? "Agregar imagen"
                : problemsTab === "precio_costo"
                ? "Corregir precio"
                : "Asignar proveedor"}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => openEdit(p)}
            >
              <Edit className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
    </div>
  </div>
) : (
  /* ... existing listing JSX ... */
)}
```

- [ ] **Step 3: Verify + commit**

```bash
cd "j:/Proyectos Claude/enexpro" && npx tsc --noEmit 2>&1 | head -30
git add src/app/\(admin\)/admin/productos/page.tsx && git commit -m "feat(productos): problematic products view with per-category tabs"
```

---

## Task 11 — Descuentos: card list instead of table (spec §2.1)

**Files:**
- Modify: `src/app/(admin)/admin/productos/descuentos/page.tsx`

- [ ] **Step 1: Add missing icon imports**

The current file imports include `Pencil`, `Trash2`, `ToggleLeft`, `ToggleRight`. Ensure `formatCurrency` is imported. It's already imported from `@/lib/formatters`.

- [ ] **Step 2: Find the existing descuentos list render**

Search for `descuentos.map((d)` in the JSX. Currently it renders a table or a list of `<Card>` elements.

- [ ] **Step 3: Replace with card list**

```tsx
<div className="space-y-2">
  {descuentos.map((d) => {
    const estado = getEstado(d);
    return (
      <div
        key={d.id}
        className={`flex items-start gap-3 px-4 py-3.5 border rounded-xl cursor-pointer hover:border-primary/30 transition-all bg-background ${
          estado === "vencido" || estado === "inactivo"
            ? "opacity-60"
            : ""
        }`}
        onClick={() => openEdit(d)}
      >
        {/* Value badge */}
        <div className="flex-shrink-0 min-w-[52px] text-center px-2 py-2 rounded-lg bg-primary/[0.08] border border-primary/15">
          <p className="text-base font-semibold text-primary">
            {d.tipo_descuento === "precio_fijo"
              ? formatCurrency(d.precio_fijo || 0)
              : `${Number(d.porcentaje)}%`}
          </p>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{d.nombre}</p>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            {estadoBadge(estado)}
            <span className="text-muted-foreground text-[10px]">·</span>
            <span className="text-xs text-muted-foreground">
              {aplicaALabel(d.aplica_a)}
            </span>
            {d.aplica_a === "productos" &&
              d.productos_ids?.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  ({d.productos_ids.length})
                </span>
              )}
            <span className="text-muted-foreground text-[10px]">·</span>
            <span className="text-xs text-muted-foreground">
              {presentacionLabel(d.presentacion)}
            </span>
            <span className="text-muted-foreground text-[10px]">·</span>
            <span className="text-xs text-muted-foreground">
              {d.fecha_fin
                ? `${formatDate(d.fecha_inicio)} → ${formatDate(d.fecha_fin)}`
                : "Permanente"}
            </span>
            {d.clientes_ids?.length > 0 && (
              <>
                <span className="text-muted-foreground text-[10px]">·</span>
                <span className="text-xs text-blue-600 font-medium">
                  {d.clientes_ids.length} cliente(s) exclusivo(s)
                </span>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div
          className="flex items-center gap-1 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => openEdit(d)}
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => toggleActivo(d)}
          >
            {d.activo ? (
              <ToggleRight className="w-4 h-4 text-green-600" />
            ) : (
              <ToggleLeft className="w-4 h-4 text-muted-foreground" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 hover:text-destructive"
            onClick={() => handleDelete(d.id)}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    );
  })}
</div>
```

- [ ] **Step 4: Verify + commit**

```bash
cd "j:/Proyectos Claude/enexpro" && npx tsc --noEmit 2>&1 | head -20
git add src/app/\(admin\)/admin/productos/descuentos/page.tsx && git commit -m "feat(descuentos): replace table with card list"
```

---

## Task 12 — Descuentos: two-column form dialog (spec §2.2)

**Files:**
- Modify: `src/app/(admin)/admin/productos/descuentos/page.tsx`

This is the most significant UI change in the descuentos file: replacing the wizard/stepped layout with a two-column form + live summary panel.

- [ ] **Step 1: Identify the current dialog structure**

Read lines 280–702 of the file to see the current `<Dialog>` JSX. The current dialog uses a single-column stepped form (wizard style). We keep all form state, all handlers, all data fetching. Only the Dialog layout changes.

- [ ] **Step 2: Replace the DialogContent with the two-column layout**

Replace the `<DialogContent` block (everything from `<DialogContent` to the end of the dialog `</Dialog>`) with:

```tsx
<Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) { setDialogOpen(false); resetWizard(); } }}>
  <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden max-h-[90vh] flex flex-col">
    {/* Header */}
    <div className="flex items-center justify-between px-5 py-3.5 border-b bg-muted/30">
      <DialogTitle>{editId ? "Editar descuento" : "Crear descuento"}</DialogTitle>
      <Button variant="ghost" size="icon" onClick={() => { setDialogOpen(false); resetWizard(); }}>
        <X className="w-4 h-4" />
      </Button>
    </div>

    <div className="flex flex-1 overflow-hidden min-h-0">
      {/* ── Left column (scrollable) ── */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5 border-r">

        {/* 1. Name */}
        <div className="space-y-2">
          <Label>Nombre del descuento *</Label>
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: Promo caja cerrada harinas"
          />
          <Textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Descripción (opcional)"
            rows={2}
            className="resize-none text-sm"
          />
        </div>

        {/* 2. Tipo + valor */}
        <div className="space-y-3">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide">
            Tipo de descuento
          </Label>
          <div className="grid grid-cols-2 gap-2">
            {([
              { value: "porcentaje", label: "Porcentaje", sub: "Ej: 20% off" },
              { value: "precio_fijo", label: "Precio fijo", sub: "Ej: $5.000 por unidad" },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTipoDescuento(opt.value)}
                className={`p-3 rounded-lg border-2 text-left transition-all ${
                  tipoDescuento === opt.value
                    ? "border-primary bg-primary/5"
                    : "border-muted hover:border-muted-foreground/30"
                }`}
              >
                <p className="text-sm font-medium">{opt.label}</p>
                <p className="text-xs text-muted-foreground">{opt.sub}</p>
              </button>
            ))}
          </div>

          {tipoDescuento === "porcentaje" ? (
            <div className="space-y-2">
              <Input
                type="number"
                min={0}
                max={100}
                value={porcentaje}
                onChange={(e) =>
                  setPorcentaje(
                    Math.min(100, Math.max(0, Number(e.target.value)))
                  )
                }
                className="w-32 text-center text-xl font-semibold h-12"
              />
              <div className="flex flex-wrap gap-1.5">
                {QUICK_PERCENTS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setPorcentaje(v)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                      porcentaje === v
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    {v}%
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">$</span>
              <Input
                type="number"
                min={0}
                value={precioFijo ?? ""}
                onChange={(e) =>
                  setPrecioFijo(e.target.value ? Number(e.target.value) : null)
                }
                placeholder="0"
                className="w-40"
              />
            </div>
          )}
        </div>

        {/* 3. Vigencia */}
        <div className="space-y-3">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide">
            Vigencia
          </Label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Desde *</Label>
              <Input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Hasta (vacío = permanente)</Label>
              <Input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: "7 días", days: 7 },
              { label: "15 días", days: 15 },
              { label: "30 días", days: 30 },
              { label: "90 días", days: 90 },
              { label: "Permanente", days: null },
            ].map(({ label, days }) => (
              <button
                key={label}
                type="button"
                onClick={() => addDuration(days)}
                className="px-2.5 py-1 rounded-lg text-xs font-medium border border-border hover:border-primary/50 transition-all"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 4. Aplica a */}
        <div className="space-y-3">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide">
            Aplica a
          </Label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: "todos", label: "Todos los productos" },
              { value: "categorias", label: "Categorías" },
              { value: "subcategorias", label: "Subcategorías" },
              { value: "productos", label: "Productos específicos" },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setAplicaA(opt.value)}
                className={`p-2.5 rounded-lg border text-sm font-medium text-left transition-all ${
                  aplicaA === opt.value
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border hover:border-primary/30"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Category picker */}
          {aplicaA === "categorias" && (
            <div className="space-y-2">
              <Input
                placeholder="Buscar categoría..."
                value={catSearch}
                onChange={(e) => setCatSearch(e.target.value)}
                className="h-8 text-sm"
              />
              <div className="border rounded-lg max-h-40 overflow-y-auto">
                {filteredCats.map((c) => (
                  <div key={c.id}>
                    <button
                      type="button"
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/50 ${
                        categoriasIds.includes(c.id) ? "bg-primary/5" : ""
                      }`}
                      onClick={() => toggleCatSelect(c.id)}
                    >
                      <span>{c.nombre}</span>
                      {categoriasIds.includes(c.id) && (
                        <Check className="w-3.5 h-3.5 text-primary" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Subcategory picker */}
          {aplicaA === "subcategorias" && (
            <div className="space-y-2">
              {categorias.map((cat) => {
                const subs = subsForCat(cat.id);
                if (subs.length === 0) return null;
                return (
                  <div key={cat.id}>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">{cat.nombre}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {subs.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() =>
                            setSubcategoriasIds((prev) =>
                              prev.includes(s.id)
                                ? prev.filter((x) => x !== s.id)
                                : [...prev, s.id]
                            )
                          }
                          className={`px-2.5 py-1 rounded-full text-xs border transition-all ${
                            subcategoriasIds.includes(s.id)
                              ? "bg-primary text-primary-foreground border-primary"
                              : "border-border hover:border-primary/50"
                          }`}
                        >
                          {s.nombre}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Product picker */}
          {aplicaA === "productos" && (
            <div className="space-y-2">
              <Input
                placeholder="Buscar producto..."
                value={prodSearch}
                onChange={(e) => setProdSearch(e.target.value)}
                className="h-8 text-sm"
              />
              <div className="border rounded-lg max-h-40 overflow-y-auto">
                {filteredProds.slice(0, 50).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/50 ${
                      productosIds.includes(p.id) ? "bg-primary/5" : ""
                    }`}
                    onClick={() =>
                      setProductosIds((prev) =>
                        prev.includes(p.id)
                          ? prev.filter((x) => x !== p.id)
                          : [...prev, p.id]
                      )
                    }
                  >
                    <span className="truncate">{p.nombre}</span>
                    <span className="text-xs text-muted-foreground font-mono ml-2">{p.codigo}</span>
                    {productosIds.includes(p.id) && (
                      <Check className="w-3.5 h-3.5 text-primary shrink-0 ml-1" />
                    )}
                  </button>
                ))}
              </div>
              {productosIds.length > 0 && (
                <p className="text-xs text-muted-foreground">{productosIds.length} seleccionado(s)</p>
              )}
            </div>
          )}
        </div>

        {/* 5. Additional options */}
        <div className="border rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-muted/30">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Opciones adicionales
            </p>
          </div>
          <div className="divide-y">
            {/* Presentación */}
            <div className="flex items-center justify-between px-4 py-3">
              <p className="text-sm font-medium">Presentación</p>
              <div className="flex gap-1.5">
                {[
                  { v: "todas", l: "Todas" },
                  { v: "unidad", l: "Unidad" },
                  { v: "caja", l: "Caja" },
                ].map(({ v, l }) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setPresentacion(v)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                      presentacion === v
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:border-primary/30"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Cantidad mínima */}
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium">Cantidad mínima</p>
                <p className="text-xs text-muted-foreground">Aplica si compra N+ unidades</p>
              </div>
              <Input
                type="number"
                min={0}
                value={cantidadMinima ?? ""}
                onChange={(e) =>
                  setCantidadMinima(
                    e.target.value ? Number(e.target.value) : null
                  )
                }
                placeholder="Sin límite"
                className="w-24 text-center h-8 text-sm"
              />
            </div>

            {/* Excluir combos */}
            <div className="flex items-center justify-between px-4 py-3">
              <p className="text-sm font-medium">Excluir combos</p>
              <button
                type="button"
                onClick={() => setExcluirCombos(!excluirCombos)}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  excluirCombos ? "bg-primary" : "bg-muted-foreground/30"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                    excluirCombos ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </div>

            {/* Clientes exclusivos */}
            <div className="px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Clientes exclusivos</p>
                  <p className="text-xs text-muted-foreground">
                    {clientesIds.length > 0
                      ? `${clientesIds.length} cliente(s) — oculto para el resto`
                      : "Visible para todos"}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => setShowClienteSearch(!showClienteSearch)}
                >
                  {showClienteSearch
                    ? "Cerrar"
                    : clientesIds.length > 0
                    ? "Editar"
                    : "Seleccionar"}
                </button>
              </div>
              {showClienteSearch && (
                <div className="space-y-2">
                  <Input
                    placeholder="Buscar cliente..."
                    value={clienteSearch}
                    onChange={(e) => setClienteSearch(e.target.value)}
                    className="h-8 text-sm"
                  />
                  {clienteSearch.length >= 2 && (
                    <div className="border rounded-lg max-h-32 overflow-y-auto">
                      {clientesAll
                        .filter(
                          (c) =>
                            norm(c.nombre).includes(norm(clienteSearch)) &&
                            !clientesIds.includes(c.id)
                        )
                        .map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="flex items-center w-full px-3 py-1.5 text-sm hover:bg-muted/50 text-left"
                            onClick={() => {
                              setClientesIds((prev) => [...prev, c.id]);
                              setClienteSearch("");
                            }}
                          >
                            {c.nombre}
                          </button>
                        ))}
                    </div>
                  )}
                  {clientesIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {clientesIds.map((id) => {
                        const c = clientesAll.find((cl) => cl.id === id);
                        return (
                          <Badge
                            key={id}
                            variant="secondary"
                            className="gap-1 pr-1 bg-blue-50 text-blue-700 border-blue-200"
                          >
                            {c?.nombre || id.slice(0, 8)}
                            <button
                              type="button"
                              onClick={() =>
                                setClientesIds((prev) =>
                                  prev.filter((x) => x !== id)
                                )
                              }
                              className="hover:text-red-600 ml-0.5"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Excluir productos */}
            {aplicaA !== "productos" && (
              <div className="px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Excluir productos</p>
                    <p className="text-xs text-muted-foreground">
                      {productosExcluidosIds.length > 0
                        ? `${productosExcluidosIds.length} excluido(s)`
                        : "Ninguno"}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => setShowExclSearch(!showExclSearch)}
                  >
                    Gestionar
                  </button>
                </div>
                {showExclSearch && (
                  <div className="space-y-2">
                    <Input
                      placeholder="Buscar producto a excluir..."
                      value={exclSearch}
                      onChange={(e) => setExclSearch(e.target.value)}
                      className="h-8 text-sm"
                    />
                    {exclSearch.length >= 2 && (
                      <div className="border rounded-lg max-h-32 overflow-y-auto">
                        {productosAll
                          .filter(
                            (p) =>
                              (norm(p.nombre).includes(norm(exclSearch)) ||
                                norm(p.codigo).includes(norm(exclSearch))) &&
                              !productosExcluidosIds.includes(p.id)
                          )
                          .slice(0, 20)
                          .map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              className="flex items-center w-full px-3 py-1.5 text-sm hover:bg-muted/50 text-left gap-2"
                              onClick={() => {
                                setProductosExcluidosIds((prev) => [
                                  ...prev,
                                  p.id,
                                ]);
                                setExclSearch("");
                              }}
                            >
                              <span className="truncate">{p.nombre}</span>
                              <span className="text-xs text-muted-foreground font-mono">{p.codigo}</span>
                            </button>
                          ))}
                      </div>
                    )}
                    {productosExcluidosIds.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {productosExcluidosIds.map((id) => {
                          const p = productosAll.find((x) => x.id === id);
                          return (
                            <Badge
                              key={id}
                              variant="secondary"
                              className="gap-1 pr-1"
                            >
                              {p?.nombre || id.slice(0, 8)}
                              <button
                                type="button"
                                onClick={() =>
                                  setProductosExcluidosIds((prev) =>
                                    prev.filter((x) => x !== id)
                                  )
                                }
                                className="hover:text-red-600 ml-0.5"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </Badge>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Right column (live summary) ── */}
      <div className="w-52 shrink-0 p-4 space-y-4 overflow-y-auto bg-muted/20">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          Resumen
        </p>

        <div className="bg-background border rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-primary">
            {tipoDescuento === "precio_fijo"
              ? formatCurrency(precioFijo || 0)
              : `${porcentaje}%`}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">de descuento</p>
        </div>

        <div className="space-y-2 text-xs">
          {[
            { k: "Aplica a", v: aplicaALabel(aplicaA) },
            { k: "Presentación", v: presentacionLabel(presentacion) },
            {
              k: "Vigencia",
              v: fechaFin ? `Hasta ${formatDate(fechaFin)}` : "Permanente",
            },
            {
              k: "Clientes",
              v:
                clientesIds.length > 0
                  ? `${clientesIds.length} exclusivos`
                  : "Todos",
            },
            ...(cantidadMinima
              ? [{ k: "Mín.", v: `${cantidadMinima} unidades` }]
              : []),
          ].map(({ k, v }) => (
            <div key={k} className="flex justify-between gap-2">
              <span className="text-muted-foreground">{k}</span>
              <span className="font-medium text-right truncate max-w-[100px]">
                {v}
              </span>
            </div>
          ))}
        </div>

        {/* Estado */}
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
            Estado al guardar
          </p>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setActivo(true)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                activo
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "border-border text-muted-foreground hover:border-emerald-300"
              }`}
            >
              Activo
            </button>
            <button
              type="button"
              onClick={() => setActivo(false)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                !activo ? "bg-muted border-border" : "border-border text-muted-foreground"
              }`}
            >
              Inactivo
            </button>
          </div>
        </div>
      </div>
    </div>

    {/* Footer */}
    <div className="flex justify-between items-center px-5 py-3 border-t bg-muted/20">
      {saveError && <p className="text-xs text-red-500">{saveError}</p>}
      <div className="flex gap-2 ml-auto">
        <Button
          variant="ghost"
          onClick={() => { setDialogOpen(false); resetWizard(); }}
        >
          Cancelar
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving || !nombre.trim() || !fechaInicio}
        >
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {editId ? "Guardar cambios" : "Crear descuento"}
        </Button>
      </div>
    </div>
  </DialogContent>
</Dialog>
```

- [ ] **Step 3: Verify + commit**

```bash
cd "j:/Proyectos Claude/enexpro" && npx tsc --noEmit 2>&1 | head -30
git add src/app/\(admin\)/admin/productos/descuentos/page.tsx && git commit -m "feat(descuentos): two-column dialog form with live summary panel"
```

---

## Task 13 — Marcas: avatar, color badge, sin-productos filter (spec §3.1 + §3.2)

**Files:**
- Modify: `src/app/(admin)/admin/productos/marcas/page.tsx`

- [ ] **Step 1: Add `showSinProductos` state**

Inside the `MarcasPage` function, add near the other search states:

```typescript
const [showSinProductos, setShowSinProductos] = useState(false);
```

- [ ] **Step 2: Add filtered variable**

Find the existing filtered list computation (or `marcas` used directly in the map). Add:

```typescript
const filteredMarcas = (marcas as MarcaConConteo[]).filter((m) => {
  const matchSearch = norm(m.nombre).includes(norm(search));
  if (showSinProductos) return matchSearch && m.producto_count === 0;
  return matchSearch;
});
```

- [ ] **Step 3: Add filter button next to search**

Find the search input for marcas and wrap it + add the button:

```tsx
<div className="flex gap-3 items-center mb-4">
  <SearchInput
    value={search}
    onChange={setSearch}
    placeholder="Buscar marcas..."
    className="max-w-sm"
  />
  <Button
    variant={showSinProductos ? "default" : "outline"}
    size="sm"
    className={
      showSinProductos
        ? ""
        : "text-amber-700 border-amber-300 bg-amber-50 hover:bg-amber-100"
    }
    onClick={() => setShowSinProductos(!showSinProductos)}
  >
    Sin productos (
    {(marcas as MarcaConConteo[]).filter((m) => m.producto_count === 0).length}
    )
  </Button>
</div>
```

- [ ] **Step 4: Update the marcas table rows to use avatar + color-coded badge**

Find `marcas.map(` (or however the list is rendered in the Marcas tab). Replace each row's name cell and count cell:

```tsx
{/* Name cell — with avatar */}
<td className="px-4 py-3">
  <div className="flex items-center gap-3">
    <div
      className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold shrink-0"
      style={
        m.producto_count === 0
          ? { background: "#FAEEDA", color: "#633806" }
          : m.producto_count >= 10
          ? { background: "#EAF3DE", color: "#27500A" }
          : { background: "#EEEDFE", color: "#3C3489" }
      }
    >
      {m.nombre.slice(0, 2).toUpperCase()}
    </div>
    <span className="font-medium text-sm">{m.nombre}</span>
  </div>
</td>

{/* Count cell */}
<td className="px-4 py-3">
  <Badge
    variant="secondary"
    className={
      m.producto_count === 0
        ? "bg-amber-50 text-amber-700"
        : m.producto_count >= 10
        ? "bg-emerald-50 text-emerald-700"
        : ""
    }
  >
    {m.producto_count}{" "}
    {m.producto_count === 1 ? "producto" : "productos"}
  </Badge>
</td>
```

Make sure you use `filteredMarcas` instead of `marcas` in the map call.

- [ ] **Step 5: Verify + commit**

```bash
cd "j:/Proyectos Claude/enexpro" && npx tsc --noEmit 2>&1 | head -20
git add src/app/\(admin\)/admin/productos/marcas/page.tsx && git commit -m "feat(marcas): avatar initials, color badges, sin-productos filter"
```

---

## Task 14 — Marcas: last-updated column (spec §3.3)

**Files:**
- Modify: `src/app/(admin)/admin/productos/marcas/page.tsx`

- [ ] **Step 1: Update `MarcaConConteo` interface**

Add `ultima_actualizacion` field:

```typescript
interface MarcaConConteo extends Marca {
  producto_count: number;
  ultima_actualizacion?: string | null;
}
```

- [ ] **Step 2: Update `fetchMarcas` to compute last update**

Replace the existing `fetchMarcas` function body with:

```typescript
const fetchMarcas = useCallback(async (): Promise<MarcaConConteo[]> => {
  const { data: marcasData } = await supabase
    .from("marcas")
    .select("*")
    .order("nombre");
  if (!marcasData) return [];

  const { data: productos } = await supabase
    .from("productos")
    .select("marca_id, fecha_actualizacion")
    .eq("activo", true);

  const countMap: Record<string, number> = {};
  const lastUpdateMap: Record<string, string> = {};

  (productos ?? []).forEach((p: any) => {
    if (p.marca_id) {
      countMap[p.marca_id] = (countMap[p.marca_id] || 0) + 1;
      if (p.fecha_actualizacion) {
        if (
          !lastUpdateMap[p.marca_id] ||
          p.fecha_actualizacion > lastUpdateMap[p.marca_id]
        ) {
          lastUpdateMap[p.marca_id] = p.fecha_actualizacion;
        }
      }
    }
  });

  return marcasData.map((m: Marca) => ({
    ...m,
    producto_count: countMap[m.id] || 0,
    ultima_actualizacion: lastUpdateMap[m.id] || null,
  }));
}, []);
```

- [ ] **Step 3: Add helper and column**

Add `formatRelativeDate` helper at the top of the file (before the component function — same implementation as in productos/page.tsx):

```typescript
function formatRelativeDate(dateStr: string): string {
  const days = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (days === 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days} días`;
  if (days < 60) return "hace 1 mes";
  return `hace ${Math.floor(days / 30)} meses`;
}
```

Add a new `<th>` in the table header for the marcas table:

```tsx
<th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
  Últ. actualización
</th>
```

Add the corresponding `<td>` in each row:

```tsx
<td className="px-4 py-3 text-xs text-muted-foreground">
  {m.ultima_actualizacion
    ? formatRelativeDate(m.ultima_actualizacion)
    : "—"}
</td>
```

- [ ] **Step 4: Verify + commit**

```bash
cd "j:/Proyectos Claude/enexpro" && npx tsc --noEmit 2>&1 | head -20
git add src/app/\(admin\)/admin/productos/marcas/page.tsx && git commit -m "feat(marcas): last-updated column from product fecha_actualizacion"
```

---

## Final verification

- [ ] **Run full TypeScript check**

```bash
cd "j:/Proyectos Claude/enexpro" && npx tsc --noEmit 2>&1
```

Expected: 0 errors.

- [ ] **Start dev server and smoke-test**

```bash
cd "j:/Proyectos Claude/enexpro" && npm run dev
```

Manually verify:
1. `/admin/productos` — health bar visible (if problems exist), quick-view opens on row click, price column shows relative date, initials show when no image
2. `/admin/productos/descuentos` — cards list, two-column dialog opens correctly
3. `/admin/productos/marcas` — avatar initials, color badges, filter button, last-update column

- [ ] **Final commit if any cleanup needed**

```bash
cd "j:/Proyectos Claude/enexpro" && git add -A && git commit -m "chore(productos): final cleanup after redesign"
```

---

## Self-review against spec

| Spec section | Covered by task |
|---|---|
| §1.1 Barra de salud del catálogo | Task 2 |
| §1.2 Sin stock card con borde urgente | Task 3 |
| §1.3 Vista rápida (quick panel) en fila | Task 4 |
| §1.4 Columna precio con fecha actualización | Task 5 |
| §1.5 Iniciales como placeholder | Task 6 |
| §1.6 Proveedor searchable input | Task 7 |
| §1.7 Tab Precios color cards + alerta | Task 8 |
| §1.8 Tab Historial unificado | Task 9 |
| §1.9 Vista productos problemáticos | Task 10 |
| §2.1 Descuentos card list | Task 11 |
| §2.2 Descuentos two-column form | Task 12 |
| §3.1 Marcas avatar + badge color | Task 13 |
| §3.2 Filtro sin productos | Task 13 |
| §3.3 Columna última actualización | Task 14 |

All 14 spec sections covered. No TBDs or placeholder steps.
