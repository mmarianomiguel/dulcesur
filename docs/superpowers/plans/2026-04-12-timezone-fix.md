# Timezone Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all UTC-based date comparisons across the codebase with timezone-aware helpers that use `America/Argentina/Buenos_Aires`.

**Architecture:** Add `formatRelativeDate`, `daysSinceAR`, and `formatDateTimeAR` to the existing `src/lib/formatters.ts`. Then replace every local UTC implementation and raw `Date.now()` comparison with imports from that module.

**Tech Stack:** TypeScript, Next.js App Router, `Intl.DateTimeFormat` (no external deps)

---

## File Map

| File | Action |
|------|--------|
| `src/lib/formatters.ts` | Add 3 new exports: `formatRelativeDate`, `daysSinceAR`, `formatDateTimeAR` |
| `src/app/(admin)/admin/productos/page.tsx` | Remove local `formatRelativeDate`, import from `@/lib/formatters` |
| `src/app/(admin)/admin/productos/marcas/page.tsx` | Remove local `formatRelativeDate`, import from `@/lib/formatters` |
| `src/app/(tienda)/productos/productos-client.tsx` | Replace 3 UTC comparisons with `daysSinceAR()` |
| `src/app/(tienda)/productos/[slug]/page.tsx` | Replace 2 UTC comparisons with `daysSinceAR()` |
| `src/app/(tienda)/aumentos-recientes/client.tsx` | Replace `diasAtras` UTC computation with `daysSinceAR()` |
| `src/app/(tienda)/home-client.tsx` | Replace `isNew` UTC computation with `daysSinceAR()` |

---

### Task 1: Add timezone-aware helpers to formatters.ts

**Files:**
- Modify: `src/lib/formatters.ts`

- [ ] **Step 1: Read the current file to confirm exact end of file**

Read `src/lib/formatters.ts` and note the last line number (currently ~97 lines).

- [ ] **Step 2: Append the three new helpers after the existing `formatPercent` export**

Add exactly this block at the end of `src/lib/formatters.ts`:

```typescript
// ─── Timezone-aware relative dates ───

/**
 * Returns calendar days elapsed since dateStr in Argentina timezone.
 * Returns -1 if dateStr is empty/invalid.
 * Uses calendar-day diff (not milliseconds) to avoid DST issues.
 */
export function daysSinceAR(dateStr: string | null | undefined): number {
  if (!dateStr) return -1;
  const todayStr = todayARG(); // "YYYY-MM-DD"
  const inputStr = dateStr.includes("T")
    ? new Date(dateStr).toLocaleDateString("en-CA", { timeZone: TIMEZONE })
    : dateStr.slice(0, 10);
  const today = new Date(todayStr + "T12:00:00");
  const input = new Date(inputStr + "T12:00:00");
  const diff = Math.round((today.getTime() - input.getTime()) / (1000 * 60 * 60 * 24));
  return isNaN(diff) ? -1 : Math.max(0, diff);
}

/**
 * Formats a date string as a human-readable relative label in Spanish.
 * Examples: "Hoy", "Ayer", "hace 5 días", "hace 2 meses", "hace 1 año"
 * Returns "—" for empty or invalid input.
 */
export function formatRelativeDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const days = daysSinceAR(dateStr);
  if (days < 0) return "—";
  if (days === 0) return "Hoy";
  if (days === 1) return "Ayer";
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? "hace 1 mes" : `hace ${months} meses`;
  const years = Math.floor(days / 365);
  return years === 1 ? "hace 1 año" : `hace ${years} años`;
}

/**
 * Formats a full datetime string for display: "15/03/2026 14:30"
 * Uses Argentina timezone.
 */
export function formatDateTimeAR(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("es-AR", {
    timeZone: TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
```

- [ ] **Step 3: Verify the file compiles (TypeScript check)**

Run:
```bash
cd "j:/Proyectos Claude/enexpro" && npx tsc --noEmit --project tsconfig.json 2>&1 | head -30
```

Expected: no errors related to `formatters.ts`.

- [ ] **Step 4: Commit**

```bash
cd "j:/Proyectos Claude/enexpro" && git add src/lib/formatters.ts && git commit -m "feat: add daysSinceAR, formatRelativeDate, formatDateTimeAR helpers to formatters"
```

---

### Task 2: Replace local formatRelativeDate in productos/page.tsx

**Files:**
- Modify: `src/app/(admin)/admin/productos/page.tsx`

- [ ] **Step 1: Read the file and locate the local function**

Read `src/app/(admin)/admin/productos/page.tsx`. Find the local `formatRelativeDate` function (currently around lines 135–144). It looks like:

```typescript
function formatRelativeDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
  if (isNaN(days) || days < 0) return "—";
  if (days === 0) return "Hoy";
  if (days === 1) return "Ayer";
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? "hace 1 mes" : `hace ${months} meses`;
  const years = Math.floor(days / 365);
  return years === 1 ? "hace 1 año" : `hace ${years} años`;
}
```

- [ ] **Step 2: Delete the local function**

Remove the entire `function formatRelativeDate(...)` block from the file.

- [ ] **Step 3: Add formatRelativeDate to the @/lib/formatters import**

Find the existing import from `@/lib/formatters` in the file (it likely imports `formatCurrency`, `formatNumber`, etc.) and add `formatRelativeDate` to it. For example:

```typescript
// Before:
import { formatCurrency, formatNumber, formatPercent } from "@/lib/formatters";

// After:
import { formatCurrency, formatNumber, formatPercent, formatRelativeDate } from "@/lib/formatters";
```

If there is no existing import from `@/lib/formatters`, add one:
```typescript
import { formatRelativeDate } from "@/lib/formatters";
```

- [ ] **Step 4: Verify no TypeScript errors**

```bash
cd "j:/Proyectos Claude/enexpro" && npx tsc --noEmit 2>&1 | grep "productos/page"
```

Expected: no output (no errors).

- [ ] **Step 5: Commit**

```bash
cd "j:/Proyectos Claude/enexpro" && git add src/app/\(admin\)/admin/productos/page.tsx && git commit -m "fix: use timezone-aware formatRelativeDate in productos/page"
```

---

### Task 3: Replace local formatRelativeDate in marcas/page.tsx

**Files:**
- Modify: `src/app/(admin)/admin/productos/marcas/page.tsx`

- [ ] **Step 1: Read the file and locate the local function**

Read `src/app/(admin)/admin/productos/marcas/page.tsx`. Find the local `formatRelativeDate` function (currently around lines 73–83). It looks like:

```typescript
function formatRelativeDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
  if (isNaN(days) || days < 0) return "—";
  if (days === 0) return "Hoy";
  if (days === 1) return "Ayer";
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? "hace 1 mes" : `hace ${months} meses`;
  const years = Math.floor(days / 365);
  return years === 1 ? "hace 1 año" : `hace ${years} años`;
}
```

- [ ] **Step 2: Delete the local function**

Remove the entire `function formatRelativeDate(...)` block.

- [ ] **Step 3: Add import from @/lib/formatters**

Find the existing import from `@/lib/formatters` and add `formatRelativeDate`. If none exists:

```typescript
import { formatRelativeDate } from "@/lib/formatters";
```

- [ ] **Step 4: Verify no TypeScript errors**

```bash
cd "j:/Proyectos Claude/enexpro" && npx tsc --noEmit 2>&1 | grep "marcas/page"
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
cd "j:/Proyectos Claude/enexpro" && git add src/app/\(admin\)/admin/productos/marcas/page.tsx && git commit -m "fix: use timezone-aware formatRelativeDate in marcas/page"
```

---

### Task 4: Fix UTC comparisons in productos-client.tsx (tienda)

**Files:**
- Modify: `src/app/(tienda)/productos/productos-client.tsx`

**Context:** This file has three locations with raw UTC comparisons:
- Line ~1330 — "Precio actualizado" badge (3-day window), uses `Date.now() - new Date(dateStr).getTime()`
- Line ~1349 — "NUEVO" badge (7-day window), uses `Date.now() - new Date(producto.created_at).getTime()`
- Line ~1392 — list-view "Precio actualizado" badge (3-day window), same pattern as ~1330

- [ ] **Step 1: Read the file around those lines**

Read `src/app/(tienda)/productos/productos-client.tsx` lines 1320–1400 to see exact current code.

- [ ] **Step 2: Add daysSinceAR to the @/lib/formatters import**

Find the import from `@/lib/formatters` and add `daysSinceAR`. Example:

```typescript
// Before (whatever it currently imports):
import { formatCurrency } from "@/lib/formatters";

// After:
import { formatCurrency, daysSinceAR } from "@/lib/formatters";
```

- [ ] **Step 3: Replace the ~1330 UTC comparison**

Find code matching this pattern (exact content may vary by a few chars):
```typescript
(Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24) <= 3
```

Replace with:
```typescript
daysSinceAR(dateStr) <= 3
```

- [ ] **Step 4: Replace the ~1349 UTC comparison**

Find code matching:
```typescript
(Date.now() - new Date(producto.created_at).getTime()) < 7 * 24 * 60 * 60 * 1000
```

Replace with:
```typescript
daysSinceAR(producto.created_at) <= 7
```

- [ ] **Step 5: Replace the ~1392 UTC comparison**

Find code matching (note the `> 3` for the negative condition):
```typescript
(Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24) > 3
```

Replace with:
```typescript
daysSinceAR(dateStr) > 3
```

- [ ] **Step 6: Verify no TypeScript errors**

```bash
cd "j:/Proyectos Claude/enexpro" && npx tsc --noEmit 2>&1 | grep "productos-client"
```

Expected: no output.

- [ ] **Step 7: Commit**

```bash
cd "j:/Proyectos Claude/enexpro" && git add "src/app/(tienda)/productos/productos-client.tsx" && git commit -m "fix: use timezone-aware daysSinceAR for price/new badges in productos-client"
```

---

### Task 5: Fix UTC comparisons in [slug]/page.tsx (tienda)

**Files:**
- Modify: `src/app/(tienda)/productos/[slug]/page.tsx`

**Context:** Two UTC comparisons:
- Line ~642 — "Precio actualizado" badge: `if (!dateStr || (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24) > 3) return null;`
- Line ~927 — "NUEVO" badge: `const isNew = rel.created_at && (Date.now() - new Date(rel.created_at).getTime()) < 7 * 24 * 60 * 60 * 1000;`

- [ ] **Step 1: Read those sections**

Read `src/app/(tienda)/productos/[slug]/page.tsx` lines 635–650 and lines 920–935.

- [ ] **Step 2: Add daysSinceAR to the @/lib/formatters import**

Find the import from `@/lib/formatters` and add `daysSinceAR`.

- [ ] **Step 3: Replace line ~642 UTC comparison**

Find:
```typescript
if (!dateStr || (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24) > 3) return null;
```

Replace with:
```typescript
if (!dateStr || daysSinceAR(dateStr) > 3) return null;
```

- [ ] **Step 4: Replace line ~927 UTC comparison**

Find:
```typescript
const isNew = rel.created_at && (Date.now() - new Date(rel.created_at).getTime()) < 7 * 24 * 60 * 60 * 1000;
```

Replace with:
```typescript
const isNew = rel.created_at && daysSinceAR(rel.created_at) <= 7;
```

- [ ] **Step 5: Verify no TypeScript errors**

```bash
cd "j:/Proyectos Claude/enexpro" && npx tsc --noEmit 2>&1 | grep "slug"
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
cd "j:/Proyectos Claude/enexpro" && git add "src/app/(tienda)/productos/[slug]/page.tsx" && git commit -m "fix: use timezone-aware daysSinceAR for price/new badges in slug page"
```

---

### Task 6: Fix UTC comparisons in aumentos-recientes/client.tsx and home-client.tsx

**Files:**
- Modify: `src/app/(tienda)/aumentos-recientes/client.tsx`
- Modify: `src/app/(tienda)/home-client.tsx`

**Context:**
- `aumentos-recientes/client.tsx` line ~140: `const diasAtras = prod.fecha_actualizacion ? Math.floor((Date.now() - new Date(prod.fecha_actualizacion).getTime()) / (1000 * 60 * 60 * 24)) : null;`
- `home-client.tsx` line ~347: `const daysAgo = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24); return daysAgo <= diasNuevo;`

- [ ] **Step 1: Read both files around those lines**

Read `src/app/(tienda)/aumentos-recientes/client.tsx` lines 130–150.
Read `src/app/(tienda)/home-client.tsx` lines 340–360.

- [ ] **Step 2: Fix aumentos-recientes/client.tsx**

Add `daysSinceAR` to its import from `@/lib/formatters`.

Find:
```typescript
const diasAtras = prod.fecha_actualizacion
  ? Math.floor((Date.now() - new Date(prod.fecha_actualizacion).getTime()) / (1000 * 60 * 60 * 24))
  : null;
```

Replace with:
```typescript
const diasAtras = prod.fecha_actualizacion
  ? daysSinceAR(prod.fecha_actualizacion)
  : null;
```

Note: `daysSinceAR` returns `-1` for invalid input, so if downstream code checks `diasAtras !== null`, that logic is still safe — `-1` is a number, not null. If the code checks `diasAtras > 0`, verify the replacement still makes logical sense. If `diasAtras` is only used for display (e.g., `hace ${diasAtras} días`), returning `-1` would be wrong — in that case, keep the null:
```typescript
const diasAtras = prod.fecha_actualizacion
  ? daysSinceAR(prod.fecha_actualizacion)
  : null;
// Then where displayed, guard with: diasAtras !== null && diasAtras >= 0
```

- [ ] **Step 3: Fix home-client.tsx**

Add `daysSinceAR` to its import from `@/lib/formatters`.

Find the `isNew` / `daysAgo` logic. It likely looks like:
```typescript
const created = new Date(product.created_at);
const daysAgo = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
return daysAgo <= diasNuevo;
```

Replace with:
```typescript
return daysSinceAR(product.created_at) <= diasNuevo;
```

If the variable `created` is not used elsewhere, remove it.

- [ ] **Step 4: Verify no TypeScript errors**

```bash
cd "j:/Proyectos Claude/enexpro" && npx tsc --noEmit 2>&1 | grep -E "aumentos|home-client"
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
cd "j:/Proyectos Claude/enexpro" && git add "src/app/(tienda)/aumentos-recientes/client.tsx" "src/app/(tienda)/home-client.tsx" && git commit -m "fix: use timezone-aware daysSinceAR in aumentos-recientes and home-client"
```

---

## Self-Review

**Spec coverage:**
- ✅ `formatRelativeDate`, `daysSinceAR`, `formatDateTimeAR` added to `formatters.ts` (Task 1)
- ✅ Local UTC `formatRelativeDate` removed from `productos/page.tsx` (Task 2)
- ✅ Local UTC `formatRelativeDate` removed from `marcas/page.tsx` (Task 3)
- ✅ 3 UTC comparisons fixed in `productos-client.tsx` (Task 4)
- ✅ 2 UTC comparisons fixed in `[slug]/page.tsx` (Task 5)
- ✅ `diasAtras` and `isNew` UTC computations fixed in `aumentos-recientes/client.tsx` and `home-client.tsx` (Task 6)

**Placeholder scan:** No TBDs, no "fill in later", every code block is complete.

**Type consistency:** `daysSinceAR` accepts `string | null | undefined` and returns `number`. Used consistently as a drop-in for `Math.floor((Date.now() - new Date(x).getTime()) / ms)` comparisons throughout.
