# Productos — Click Zones & Context Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three distinct click zones per product row (select / quick-view / context menu), a right-click context menu with all product actions, and make all 5 stat cards interactive with active-state indicators.

**Architecture:** Single file change (`productos/page.tsx`). The quick-view panel and selection state already exist — this plan changes click routing between cells, adds `contextMenu` state + handler, adds the floating context menu JSX, and wires the stat cards. No new files needed.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Supabase client, Lucide React

---

## Existing state that already works (do NOT re-add)

| State | Line | Note |
|---|---|---|
| `quickViewProduct` | 220 | Already toggles quick-view row |
| `selected` / `toggleSelect` | 224 / 1627 | Already exists |
| `stockFilter`, `comboFilter`, etc. | 201–205 | Already exist |
| `stockPopover` | 1689 | Type: `{ productId, productName, currentStock } \| null` |

## Current behavior to change

The `<tr>` at line 2508 currently has `onClick` that toggles quick-view for the **whole row**. We need to:
- Remove that onClick from `<tr>`
- Route click zones to individual `<td>` cells

---

## File Map

| File | Changes |
|---|---|
| `src/app/(admin)/admin/productos/page.tsx` | All changes — ~4 areas |

---

### Task 1: Add contextMenu state, handler, useEffect, openHistory, missing imports

**Files:**
- Modify: `src/app/(admin)/admin/productos/page.tsx`

- [ ] **Step 1: Read the lucide-react import line to check if `Printer` and `DollarSign` are present**

Run:
```bash
cd "j:/Proyectos Claude/enexpro" && grep -n "Printer\|DollarSign" "src/app/(admin)/admin/productos/page.tsx" | head -5
```

Expected: no output (neither icon is currently imported).

- [ ] **Step 2: Add `Printer` and `DollarSign` to the lucide-react import**

Find the lucide-react import (first import line in the file). It currently ends with `MoreHorizontal`. Add the two missing icons:

```typescript
// Find the line that has MoreHorizontal and add after it:
// Change from ending with:
  MoreHorizontal
} from "lucide-react";
// To:
  MoreHorizontal,
  Printer,
  DollarSign,
} from "lucide-react";
```

- [ ] **Step 3: Read around line 224 to find where to insert contextMenu state**

Read lines 220–230 of the file. You will see:
```typescript
const [quickViewProduct, setQuickViewProduct] =
  useState<ProductoWithRelations | null>(null);

// Mass selection state
const [selected, setSelected] = useState<Set<string>>(new Set());
```

- [ ] **Step 4: Add `contextMenu` state right after `quickViewProduct`**

Insert after line 221 (after the `quickViewProduct` useState):

```typescript
const [contextMenu, setContextMenu] = useState<{
  x: number;
  y: number;
  product: ProductoWithRelations;
} | null>(null);
```

- [ ] **Step 5: Find where to add `handleContextMenu` and `openHistory` functions**

Run:
```bash
cd "j:/Proyectos Claude/enexpro" && grep -n "const toggleSelect" "src/app/(admin)/admin/productos/page.tsx"
```

Note the line number. Add `handleContextMenu` and `openHistory` right before `toggleSelect`.

- [ ] **Step 6: Add `handleContextMenu` and `openHistory` functions**

Insert before `const toggleSelect = ...`:

```typescript
const handleContextMenu = (e: React.MouseEvent, product: ProductoWithRelations) => {
  e.preventDefault();
  e.stopPropagation();
  const menuWidth = 200;
  const menuHeight = 340;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  let x = e.clientX;
  let y = e.clientY;
  if (x + menuWidth > viewportWidth - 8) x = viewportWidth - menuWidth - 8;
  if (y + menuHeight > viewportHeight - 8) y = viewportHeight - menuHeight - 8;
  setContextMenu({ x, y, product });
};

const openHistory = (product: ProductoWithRelations) => {
  setQuickViewProduct(product);
};

```

- [ ] **Step 7: Add useEffect to close contextMenu on click outside / Escape**

Find the last useEffect in the file (or add near the other useEffects). Add:

```typescript
useEffect(() => {
  if (!contextMenu) return;
  const close = () => setContextMenu(null);
  const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
  document.addEventListener("click", close);
  document.addEventListener("keydown", handleKey);
  return () => {
    document.removeEventListener("click", close);
    document.removeEventListener("keydown", handleKey);
  };
}, [contextMenu]);
```

- [ ] **Step 8: TypeScript check**

```bash
cd "j:/Proyectos Claude/enexpro" && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
cd "j:/Proyectos Claude/enexpro" && git add "src/app/(admin)/admin/productos/page.tsx" && git commit -m "feat(productos): add contextMenu state, handler, openHistory, Printer/DollarSign imports"
```

---

### Task 2: Restructure table row click zones

**Files:**
- Modify: `src/app/(admin)/admin/productos/page.tsx` lines 2508–2574 (approximately; may shift after Task 1 edits)

**Context:** The current `<tr>` has `onClick` that toggles `quickViewProduct` for any click anywhere on the row. We need to:
1. Remove `onClick` from `<tr>`, add `onContextMenu`, remove `cursor-pointer` from `<tr>`
2. Checkbox `<td>`: remove the nested `<button>`, make the `<td>` directly clickable for selection
3. Image `<td>`: add `onClick` for selection
4. Código `<td>`: add `onClick` for selection
5. Nombre `<td>`: add `onClick` for quick-view toggle, `onDoubleClick` for edit, hover indicator

- [ ] **Step 1: Read the current `<tr>` and first 4 cells**

Read lines around 2508–2580 (adjust for line shifts from Task 1). Confirm you see:
- `<tr onClick={() => setQuickViewProduct(...)} className={...cursor-pointer...}>`
- Checkbox `<td>` with nested `<button onClick={(e) => { e.stopPropagation(); toggleSelect(product.id); }}>`
- Image `<td>` with no onClick
- Código `<td>` with no onClick
- Nombre `<td>` with no onClick

- [ ] **Step 2: Replace the `<tr>` opening tag**

Find:
```tsx
<tr
  onClick={() =>
    setQuickViewProduct(
      quickViewProduct?.id === product.id ? null : product
    )
  }
  className={`border-b last:border-0 transition-colors cursor-pointer ${
    isSelected
      ? "bg-accent"
      : quickViewProduct?.id === product.id
      ? "bg-primary/5"
      : "hover:bg-muted/50"
  }`}
>
```

Replace with:
```tsx
<tr
  onContextMenu={(e) => handleContextMenu(e, product)}
  className={`border-b last:border-0 transition-colors ${
    isSelected
      ? "bg-accent"
      : quickViewProduct?.id === product.id
      ? "bg-primary/5"
      : ""
  }`}
>
```

- [ ] **Step 3: Replace the checkbox `<td>` — remove nested button, make td clickable**

Find:
```tsx
<td className="py-3 px-2">
  <button onClick={(e) => { e.stopPropagation(); toggleSelect(product.id); }}>
    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${isSelected ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
      {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
    </div>
  </button>
</td>
```

Replace with:
```tsx
<td
  className="py-3 px-2 cursor-pointer hover:bg-muted/50 transition-colors"
  onClick={() => toggleSelect(product.id)}
  title="Seleccionar"
>
  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${isSelected ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
    {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
  </div>
</td>
```

- [ ] **Step 4: Replace the image `<td>` — add onClick for selection**

Find:
```tsx
<td className="py-3 px-2">
  {product.imagen_url ? (
    <img src={product.imagen_url} alt="" className="w-8 h-8 rounded object-cover" />
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

Replace with:
```tsx
<td
  className="py-3 px-2 cursor-pointer hover:bg-muted/50 transition-colors"
  onClick={() => toggleSelect(product.id)}
  title="Seleccionar"
>
  {product.imagen_url ? (
    <img src={product.imagen_url} alt="" className="w-8 h-8 rounded object-cover" />
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

- [ ] **Step 5: Replace the código `<td>` — add onClick for selection**

Find:
```tsx
<td className="py-3 px-4 font-mono text-xs text-muted-foreground">
  {product.codigo}
</td>
```

Replace with:
```tsx
<td
  className="py-3 px-4 cursor-pointer hover:bg-muted/50 transition-colors"
  onClick={() => toggleSelect(product.id)}
  title="Seleccionar"
>
  <span className="font-mono text-xs text-muted-foreground select-none">
    {product.codigo}
  </span>
</td>
```

- [ ] **Step 6: Replace the nombre `<td>` — add quick-view toggle, double-click, hover indicator**

Find:
```tsx
<td className="py-3 px-4 font-medium max-w-xs">
  <div className="flex items-center gap-2 flex-wrap">
    <span className="truncate max-w-[250px]" title={product.nombre}>{product.nombre}</span>
```

Replace the opening of that `<td>` (the `<td>` tag and the `<div>` container and `<span>` for nombre). Keep everything inside the div AFTER the name span (the badges: oculto button, es_combo badge, presDisplayMap badges) unchanged. The full replacement for the nombre `<td>`:

```tsx
<td
  className="py-3 px-4 font-medium max-w-xs cursor-pointer"
  onClick={() => setQuickViewProduct(quickViewProduct?.id === product.id ? null : product)}
  onDoubleClick={() => openEdit(product)}
>
  <div className="flex items-center gap-2 flex-wrap group">
    <span
      className="truncate max-w-[250px] hover:text-primary transition-colors"
      title={product.nombre}
    >
      {product.nombre}
    </span>
    <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-primary/60">
      ▾ vista rápida
    </span>
    {product.visibilidad === "oculto" && (
```

Then close the original content as-is (the oculto button, combo badge, presDisplayMap badges, the closing `</div></td>`).

**Important:** The oculto `<button>` inside the nombre cell has `e.stopPropagation()` — keep that as-is so clicking "Oculto" badge doesn't toggle quick view.

- [ ] **Step 7: TypeScript check**

```bash
cd "j:/Proyectos Claude/enexpro" && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
cd "j:/Proyectos Claude/enexpro" && git add "src/app/(admin)/admin/productos/page.tsx" && git commit -m "feat(productos): restructure row click zones — select/quick-view/context-menu separation"
```

---

### Task 3: Add context menu JSX (floating div)

**Files:**
- Modify: `src/app/(admin)/admin/productos/page.tsx`

**Context:** The context menu is a `position: fixed` div rendered outside the table, at the end of the component's main JSX. It shows a header with the product name, then action buttons grouped by separator.

- [ ] **Step 1: Find the closing of the component's JSX**

Run:
```bash
cd "j:/Proyectos Claude/enexpro" && grep -n "^}" "src/app/(admin)/admin/productos/page.tsx" | tail -5
```

Also find the last `</div>` before the final `return`'s closing. The context menu JSX goes just before the last closing `</>` or `</div>` of the return.

- [ ] **Step 2: Add the context menu div before the closing of the main return JSX**

Find the final closing tag of the component's return (likely a `</>` or `</div>` that wraps everything). Insert the following BEFORE that closing tag:

```tsx
{/* Context menu — click derecho en la fila */}
{contextMenu && (
  <div
    className="fixed z-50 bg-background border border-border rounded-xl shadow-lg py-1 min-w-[200px]"
    style={{ left: contextMenu.x, top: contextMenu.y }}
    onClick={(e) => e.stopPropagation()}
  >
    {/* Header: nombre del producto */}
    <div className="px-3 py-2 border-b">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide truncate">
        {contextMenu.product.nombre.length > 30
          ? contextMenu.product.nombre.slice(0, 28) + "..."
          : contextMenu.product.nombre}
      </p>
    </div>

    {/* Grupo 1: Acciones principales */}
    <div className="py-1">
      <button
        className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-muted/60 transition-colors text-left"
        onClick={() => { openEdit(contextMenu.product); setContextMenu(null); }}
      >
        <Edit className="w-3.5 h-3.5 text-muted-foreground" />
        Editar producto
      </button>
      <button
        className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-muted/60 transition-colors text-left"
        onClick={() => { setQuickViewProduct(contextMenu.product); setContextMenu(null); }}
      >
        <Eye className="w-3.5 h-3.5 text-muted-foreground" />
        Vista rápida
      </button>
      <button
        className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-muted/60 transition-colors text-left"
        onClick={() => {
          setStockPopover({ productId: contextMenu.product.id, productName: contextMenu.product.nombre, currentStock: contextMenu.product.stock });
          setContextMenu(null);
        }}
      >
        <Package className="w-3.5 h-3.5 text-muted-foreground" />
        Ajustar stock
      </button>
      <button
        className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-muted/60 transition-colors text-left"
        onClick={() => {
          window.location.href = `/admin/productos/editar-precios?ids=${contextMenu.product.id}`;
          setContextMenu(null);
        }}
      >
        <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
        Editar precio
      </button>
    </div>

    <div className="border-t my-1" />

    {/* Grupo 2: Visibilidad, destacado, otras acciones */}
    <div className="py-1">
      <button
        className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-muted/60 transition-colors text-left"
        onClick={() => {
          const newVisibilidad = contextMenu.product.visibilidad === "oculto" ? "visible" : "oculto";
          supabase.from("productos").update({ visibilidad: newVisibilidad }).eq("id", contextMenu.product.id).then(() => {
            setProducts((prev) => prev.map((p) =>
              p.id === contextMenu.product.id ? { ...p, visibilidad: newVisibilidad } : p
            ));
            showAdminToast(
              newVisibilidad === "visible"
                ? `${contextMenu.product.nombre} visible en la tienda`
                : `${contextMenu.product.nombre} oculto de la tienda`,
              "success"
            );
          });
          setContextMenu(null);
        }}
      >
        {contextMenu.product.visibilidad === "oculto" ? (
          <><Eye className="w-3.5 h-3.5 text-muted-foreground" /> Mostrar en tienda</>
        ) : (
          <><EyeOff className="w-3.5 h-3.5 text-muted-foreground" /> Ocultar de tienda</>
        )}
      </button>
      <button
        className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-muted/60 transition-colors text-left"
        onClick={() => {
          const newVal = !(contextMenu.product as any).destacado;
          supabase.from("productos").update({ destacado: newVal }).eq("id", contextMenu.product.id).then(() => {
            setProducts((prev) => prev.map((p) =>
              p.id === contextMenu.product.id ? { ...p, destacado: newVal } as any : p
            ));
            showAdminToast(newVal ? "Marcado como destacado" : "Quitado de destacados", "success");
          });
          setContextMenu(null);
        }}
      >
        <Star className="w-3.5 h-3.5 text-muted-foreground" />
        {(contextMenu.product as any).destacado ? "Quitar de destacados" : "Marcar como destacado"}
      </button>
      <button
        className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-muted/60 transition-colors text-left"
        onClick={() => { handleDuplicate(contextMenu.product); setContextMenu(null); }}
      >
        <Copy className="w-3.5 h-3.5 text-muted-foreground" />
        Duplicar
      </button>
      <button
        className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-muted/60 transition-colors text-left"
        onClick={() => { openHistory(contextMenu.product); setContextMenu(null); }}
      >
        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
        Ver historial
      </button>
      <button
        className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-muted/60 transition-colors text-left"
        onClick={() => {
          window.location.href = `/admin/productos/lista-precios?ids=${contextMenu.product.id}`;
          setContextMenu(null);
        }}
      >
        <Printer className="w-3.5 h-3.5 text-muted-foreground" />
        Imprimir cartel
      </button>
    </div>

    <div className="border-t my-1" />

    {/* Grupo 3: Eliminar */}
    <div className="py-1">
      <button
        className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-red-50 text-red-600 transition-colors text-left"
        onClick={() => { handleDelete(contextMenu.product.id); setContextMenu(null); }}
      >
        <Trash2 className="w-3.5 h-3.5" />
        Eliminar producto
      </button>
    </div>
  </div>
)}
```

**Note about `setStockPopover` call:** The current `stockPopover` state type is `{ productId: string; productName: string; currentStock: number } | null` (defined at line ~1689). Call `setStockPopover` with exactly those three fields — do NOT add `anchorEl` since it's not in the type.

- [ ] **Step 3: TypeScript check**

```bash
cd "j:/Proyectos Claude/enexpro" && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors. If you see errors about `handleDuplicate` or `handleDelete` not being found, they exist in the file — just verify their exact names by running:
```bash
cd "j:/Proyectos Claude/enexpro" && grep -n "const handleDuplicate\|const handleDelete\|function handleDuplicate\|function handleDelete" "src/app/(admin)/admin/productos/page.tsx"
```

- [ ] **Step 4: Commit**

```bash
cd "j:/Proyectos Claude/enexpro" && git add "src/app/(admin)/admin/productos/page.tsx" && git commit -m "feat(productos): add right-click context menu with all product actions"
```

---

### Task 4: Interactive stat cards with active-state ring

**Files:**
- Modify: `src/app/(admin)/admin/productos/page.tsx` (stat cards section, around lines 1840–1909, may shift after earlier tasks)

**Context:** Currently:
- "Total artículos" card: no onClick, no active state
- "Con stock" card: no onClick, no active state
- "Sin stock" card: onClick exists, no active ring
- "Stock bajo" card: onClick exists, no active ring (it opens a dialog, never "active")
- "Combos" card: onClick exists, no active ring

Desired after this task:
- All 5 cards: `cursor-pointer hover:bg-muted/40`
- "Total artículos": onClick clears all filters; active when no filter is set
- "Con stock": onClick sets `stockFilter = "si"`; active when `stockFilter === "si"`
- "Sin stock": keeps existing onClick; active when `stockFilter === "no"`
- "Stock bajo": keeps existing onClick; never shows active ring (opens dialog)
- "Combos": keeps existing onClick (toggle); active when `comboFilter === "si"`

- [ ] **Step 1: Read the stat cards section**

Read lines 1840–1910 (adjust for line shifts). Confirm you see the 5 `<Card>` components.

- [ ] **Step 2: Replace the entire stat cards section (all 5 cards)**

Find the opening `<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">` that contains the stat cards, and replace the whole block through its closing `</div>` with:

```tsx
<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
  {/* Total artículos */}
  <Card
    className={`cursor-pointer hover:bg-muted/40 transition-colors ${
      stockFilter === "all" && comboFilter === "all" && tiendaFilter === "all" && !soloDestacado
        ? "ring-1 ring-primary/40"
        : ""
    }`}
    onClick={() => {
      setStockFilter("all");
      setComboFilter("all");
      setTiendaFilter("all");
      setSoloDestacado(false);
      setPage(1);
    }}
  >
    <CardContent className="pt-6 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
        stockFilter === "all" && comboFilter === "all" && tiendaFilter === "all" && !soloDestacado
          ? "bg-primary/20"
          : "bg-primary/10"
      }`}>
        <Package className={`w-5 h-5 ${
          stockFilter === "all" && comboFilter === "all" && tiendaFilter === "all" && !soloDestacado
            ? "text-primary"
            : "text-primary/70"
        }`} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Total artículos</p>
        <p className="text-xl font-bold">{products.length}</p>
      </div>
    </CardContent>
  </Card>

  {/* Con stock */}
  <Card
    className={`cursor-pointer hover:bg-muted/40 transition-colors ${
      stockFilter === "si" ? "ring-1 ring-emerald-400/60" : ""
    }`}
    onClick={() => { setStockFilter("si"); setPage(1); }}
  >
    <CardContent className="pt-6 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
        stockFilter === "si" ? "bg-emerald-500/20" : "bg-emerald-500/10"
      }`}>
        <Package className={`w-5 h-5 ${stockFilter === "si" ? "text-emerald-600" : "text-emerald-500"}`} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Con stock</p>
        <p className="text-xl font-bold">{products.length - outOfStock}</p>
      </div>
    </CardContent>
  </Card>

  {/* Sin stock */}
  <Card
    className={`cursor-pointer hover:bg-muted/40 transition-colors ${
      stockFilter === "no"
        ? "ring-1 ring-red-400/60"
        : outOfStock > 0
        ? "border-red-200 hover:border-red-300"
        : ""
    }`}
    onClick={() => { setStockFilter("no"); setPage(1); }}
  >
    <CardContent className="pt-6 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
        stockFilter === "no" ? "bg-red-500/20" : "bg-red-500/10"
      }`}>
        <AlertTriangle className={`w-5 h-5 ${stockFilter === "no" ? "text-red-600" : "text-red-500"}`} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Sin stock</p>
        <p className="text-xl font-bold">{outOfStock}</p>
      </div>
    </CardContent>
  </Card>

  {/* Stock bajo — opens dialog, never active */}
  <Card
    className="cursor-pointer hover:bg-muted/40 transition-colors"
    onClick={() => lowStock > 0 && setLowStockOpen(true)}
  >
    <CardContent className="pt-6 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${lowStock > 0 ? "bg-orange-500/20" : "bg-orange-500/10"}`}>
        <AlertTriangle className={`w-5 h-5 ${lowStock > 0 ? "text-orange-600" : "text-orange-500"}`} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Stock bajo</p>
        <p className="text-xl font-bold">{lowStock}</p>
      </div>
    </CardContent>
  </Card>

  {/* Combos */}
  <Card
    className={`cursor-pointer hover:bg-muted/40 transition-colors ${
      comboFilter === "si" ? "ring-1 ring-pink-400/60" : ""
    }`}
    onClick={() => { setComboFilter(comboFilter === "si" ? "all" : "si"); setPage(1); }}
  >
    <CardContent className="pt-6 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${comboFilter === "si" ? "bg-pink-500/20" : "bg-pink-500/10"}`}>
        <Layers className={`w-5 h-5 ${comboFilter === "si" ? "text-pink-600" : "text-pink-500"}`} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Combos</p>
        <p className="text-xl font-bold">{comboCount}</p>
      </div>
    </CardContent>
  </Card>
</div>
```

- [ ] **Step 3: TypeScript check**

```bash
cd "j:/Proyectos Claude/enexpro" && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd "j:/Proyectos Claude/enexpro" && git add "src/app/(admin)/admin/productos/page.tsx" && git commit -m "feat(productos): interactive stat cards with active-state ring indicators"
```

---

## Self-Review

**Spec coverage:**
- ✅ `contextMenu` state — Task 1
- ✅ `handleContextMenu` — Task 1
- ✅ `openHistory` — Task 1
- ✅ `Printer`, `DollarSign` imports — Task 1
- ✅ useEffect close on Escape/click — Task 1
- ✅ Checkbox `<td>` onClick for selection — Task 2
- ✅ Image `<td>` onClick for selection — Task 2
- ✅ Código `<td>` onClick for selection — Task 2
- ✅ Nombre `<td>` onClick for quick-view toggle — Task 2
- ✅ Nombre `<td>` onDoubleClick for edit — Task 2
- ✅ `▾ vista rápida` hover indicator on nombre — Task 2
- ✅ `<tr>` onContextMenu — Task 2
- ✅ `<tr>` background for context menu active (handled via `quickViewProduct?.id === product.id` class — the context menu doesn't change row bg, which is acceptable since the spec says `bg-primary/5` only while quick view is open)
- ✅ Context menu fixed-position div — Task 3
- ✅ Context menu viewport-aware positioning — Task 1 (in handler)
- ✅ Context menu closes on Escape/click — Task 1 (useEffect)
- ✅ Visibilidad toggle is dynamic (Mostrar/Ocultar) — Task 3
- ✅ Destacado toggle is dynamic — Task 3
- ✅ All 9 context menu actions — Task 3
- ✅ "Total artículos" card clears all filters — Task 4
- ✅ "Con stock" card sets stockFilter="si" — Task 4
- ✅ All cards have cursor-pointer + hover — Task 4
- ✅ Active cards show ring indicator — Task 4

**Placeholder scan:** No TBDs. All code blocks are complete.

**Type consistency:**
- `contextMenu` typed as `{ x: number; y: number; product: ProductoWithRelations } | null` — used as such throughout
- `handleContextMenu` takes `(e: React.MouseEvent, product: ProductoWithRelations)` — called as `(e, product)` in `<tr onContextMenu>`
- `openHistory` takes `(product: ProductoWithRelations)` — called with `contextMenu.product`
- `setStockPopover` called with `{ productId, productName, currentStock }` (no anchorEl) matching the existing type
