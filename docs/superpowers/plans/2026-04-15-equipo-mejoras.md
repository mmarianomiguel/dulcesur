# Equipo Module Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 7 improvements to the equipo module: fix Invalid Date, notification sound, tab counter, live timer, armador notes in supervision, Excel export for historial, and urgent pedidos.

**Architecture:** All tasks are independent and modify existing files. No new tables needed except adding an `urgente` boolean column to `pedido_armado`. Sound notification uses the Web Audio API. Tab counter uses document.title. Live timer uses a 1-minute interval. Excel export uses the existing XLSX library.

**Tech Stack:** Next.js, React, Supabase, Tailwind CSS, XLSX (already installed), Web Audio API

---

### Task 1: Fix Invalid Date in Tablero Header

**Files:**
- Modify: `src/app/equipo/components/tablero-armado.tsx`

The header shows "Invalid Date" because `formatDateARG` receives a full ISO datetime string but the function adds `T12:00:00` to it, causing a double-T issue.

- [ ] **Step 1: Fix the date formatting**

In `src/app/equipo/components/tablero-armado.tsx` line 131, change:

```typescript
const today = formatDateARG(new Date().toISOString());
```

To use `todayARG()` which returns a clean `YYYY-MM-DD` string, then format it:

```typescript
const today = formatDateARG(todayARG());
```

Make sure `todayARG` is imported from `@/lib/formatters` (it may already be imported, check first).

- [ ] **Step 2: Commit**

```bash
git add src/app/equipo/components/tablero-armado.tsx
git commit -m "fix(equipo): fix Invalid Date in tablero header"
```

---

### Task 2: Notification Sound in Tablero Armado

**Files:**
- Modify: `src/app/equipo/components/tablero-armado.tsx`

Add an audio notification when the Realtime subscription detects a new pedido or a rejection. Use a simple beep via Web Audio API (no audio file needed).

- [ ] **Step 1: Add beep function and update realtime handlers**

Add a `playBeep` helper function at the top of the `TableroArmado` component (inside the function, before the return):

```typescript
const playBeep = useCallback((frequency = 800, duration = 200) => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = frequency;
    gain.gain.value = 0.3;
    osc.start();
    osc.stop(ctx.currentTime + duration / 1000);
  } catch {}
}, []);
```

Then update the Realtime subscription handlers. In the `pedido_armado` handler, after the rejection check, add a beep for rejections:

```typescript
if (newData?.motivo_rechazo && newData?.armador_id === session.id) {
  showToast(`Pedido devuelto: ${newData.motivo_rechazo}`, "error");
  playBeep(400, 300); // lower tone for rejection
} else {
  showToast("Tablero actualizado", "success");
}
```

In the `ventas` INSERT handler, add a beep for new pedidos:

```typescript
() => {
  fetchPedidos();
  showToast("Nuevo pedido recibido", "success");
  playBeep(900, 150); // higher tone for new order
}
```

Import `useCallback` if not already imported.

- [ ] **Step 2: Commit**

```bash
git add src/app/equipo/components/tablero-armado.tsx
git commit -m "feat(equipo): add notification sound in tablero armado"
```

---

### Task 3: Pending Count in Browser Tab Title

**Files:**
- Modify: `src/app/equipo/components/tablero-armado.tsx`

Update `document.title` to show the count of pending pedidos, e.g., `(5) Tablero — Dulce Sur`.

- [ ] **Step 1: Add useEffect for title update**

Add a useEffect that updates `document.title` whenever `pedidos` changes:

```typescript
useEffect(() => {
  const pendingCount = pedidos.filter(
    (p) => !p.pedido_armado || p.pedido_armado.estado === "pendiente"
  ).length;
  document.title = pendingCount > 0
    ? `(${pendingCount}) Tablero — Dulce Sur`
    : "Tablero — Dulce Sur";
}, [pedidos]);
```

- [ ] **Step 2: Commit**

```bash
git add src/app/equipo/components/tablero-armado.tsx
git commit -m "feat(equipo): show pending count in browser tab title"
```

---

### Task 4: Live Timer for "Armando" Pedidos in Supervision

**Files:**
- Modify: `src/app/(admin)/admin/equipo/components/supervision-tab.tsx`

For pedidos in "armando" state, instead of showing "—" for T. Armado, show a live running timer like "hace 5m" that updates every minute.

- [ ] **Step 1: Add a tick state and interval**

Inside the `SupervisionTab` component, add a state that ticks every 30 seconds to force re-render of live timers:

```typescript
const [tick, setTick] = useState(0);

useEffect(() => {
  const interval = setInterval(() => setTick((t) => t + 1), 30000);
  return () => clearInterval(interval);
}, []);
```

- [ ] **Step 2: Add a live duration formatter**

Add this helper function alongside the existing `formatDuration` and `calcDuration`:

```typescript
function formatLiveDuration(startStr: string | null | undefined, _tick: number): string {
  if (!startStr) return "—";
  const ms = Date.now() - new Date(startStr).getTime();
  if (ms <= 0) return "0m";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hrs}h ${remainMins}m`;
}
```

- [ ] **Step 3: Use live timer in card time display**

In the pedido card rendering, where `tArmado` is calculated and displayed, add a conditional: if estado is "armando" and `inicio_armado_at` exists, show the live timer instead:

Find the time metrics grid section in the card. For the "T. Armado" cell, change the display to:

```typescript
{estado === "armando" && pa?.inicio_armado_at ? (
  <span className="text-violet-600 font-semibold animate-pulse">
    {formatLiveDuration(pa.inicio_armado_at, tick)}
  </span>
) : (
  formatDuration(tArmado)
)}
```

Similarly, for "T. Espera" when estado is "pendiente", show live elapsed since created_at:

```typescript
{estado === "pendiente" ? (
  <span className="text-amber-600">
    {formatLiveDuration(p.created_at, tick)}
  </span>
) : (
  formatDuration(tEspera)
)}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/(admin)/admin/equipo/components/supervision-tab.tsx
git commit -m "feat(equipo): live running timer for armando pedidos in supervision"
```

---

### Task 5: Show Armador Notes in Supervision Cards

**Files:**
- Modify: `src/app/(admin)/admin/equipo/components/supervision-tab.tsx`

When an armador leaves a note (campo `notas` in `pedido_armado`), it should be visible in the supervision card, especially for "armado" pedidos waiting for admin review.

- [ ] **Step 1: Add notes display to the card**

In the supervision card, after the armador row (Row 2) and before the time metrics grid, add a notes section that shows when `pa?.notas` exists:

```typescript
{/* Row 3: Armador notes */}
{pa?.notas && (
  <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex gap-2">
    <span className="text-amber-500 text-sm shrink-0">⚠</span>
    <div>
      <p className="text-[11px] font-bold text-amber-800 mb-0.5">Nota del armador</p>
      <p className="text-[11px] text-amber-700">{pa.notas}</p>
    </div>
  </div>
)}
```

This should be placed inside the card's `<div className="p-4 space-y-3">` section, after the armador/rechazos row.

- [ ] **Step 2: Commit**

```bash
git add src/app/(admin)/admin/equipo/components/supervision-tab.tsx
git commit -m "feat(equipo): show armador notes in supervision cards"
```

---

### Task 6: Excel Export for Historial

**Files:**
- Modify: `src/app/(admin)/admin/equipo/components/historial-tab.tsx`

Add a "Exportar Excel" button that downloads the day's pedidos with all time tracking data.

- [ ] **Step 1: Add export function and button**

Import XLSX at the top:

```typescript
import * as XLSX from "xlsx";
```

Add the export function inside the `HistorialTab` component:

```typescript
const exportExcel = () => {
  const rows = pedidos.map((p) => {
    const pa = p.pedido_armado;
    const tEspera = calcDuration(p.created_at, pa?.inicio_armado_at);
    const tArmado = calcDuration(pa?.inicio_armado_at, pa?.fin_armado_at);
    const tControl = calcDuration(pa?.fin_armado_at, pa?.aprobado_at);
    const tTotal = calcDuration(p.created_at, pa?.aprobado_at);
    return {
      "Número": p.numero,
      "Cliente": p.clientes?.nombre ?? "—",
      "Estado": pa?.estado ?? "pendiente",
      "Armador": pa?.armador_nombre ?? "—",
      "Despacho": p.metodo_entrega === "retiro" ? "Retiro" : "Envío",
      "T. Espera": formatDuration(tEspera),
      "T. Armado": formatDuration(tArmado),
      "T. Control": formatDuration(tControl),
      "T. Total": formatDuration(tTotal),
      "Rechazos": pa?.rechazos ?? 0,
    };
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Historial");
  XLSX.writeFile(wb, `equipo-historial-${fecha}.xlsx`);
};
```

Add a button next to the date picker in the header section. After the `<p>` with `fechaDisplay`, add:

```typescript
{pedidos.length > 0 && (
  <button
    onClick={exportExcel}
    className="text-xs px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 font-medium hover:bg-emerald-100 flex items-center gap-1.5 shrink-0"
  >
    <Download className="w-3.5 h-3.5" />
    Exportar
  </button>
)}
```

Import `Download` from lucide-react.

- [ ] **Step 2: Commit**

```bash
git add src/app/(admin)/admin/equipo/components/historial-tab.tsx
git commit -m "feat(equipo): add Excel export to historial tab"
```

---

### Task 7: Urgent Pedidos

**Files:**
- Migration: add `urgente` boolean column to `pedido_armado`
- Modify: `src/types/equipo.ts` — add `urgente` to types
- Modify: `src/app/api/equipo/pedidos/route.ts` — include `urgente` in select, sort urgent first
- Modify: `src/app/api/equipo/pedidos/[ventaId]/route.ts` — handle `urgente` field in PATCH
- Modify: `src/app/(admin)/admin/equipo/components/supervision-tab.tsx` — add "Marcar urgente" button and visual indicator
- Modify: `src/app/equipo/components/pedido-card.tsx` — show urgent badge
- Modify: `src/app/equipo/components/tablero-armado.tsx` — sort urgent pedidos first

- [ ] **Step 1: Apply migration**

```sql
ALTER TABLE pedido_armado ADD COLUMN IF NOT EXISTS urgente boolean DEFAULT false;
```

- [ ] **Step 2: Update types**

In `src/types/equipo.ts`, add `urgente?: boolean;` to both `PedidoArmado` interface and the `pedido_armado` nested shape in `PedidoConArmado`.

In `PedidoArmado` interface, add after `motivo_rechazo`:
```typescript
urgente: boolean;
```

In `PedidoConArmado.pedido_armado`, add:
```typescript
urgente?: boolean;
```

- [ ] **Step 3: Update GET API route**

In `src/app/api/equipo/pedidos/route.ts`, add `urgente` to the pedido_armado select:

```typescript
.select("id, venta_id, estado, armador_id, notas, orden_entrega, inicio_armado_at, fin_armado_at, aprobado_at, aprobado_por, rechazos, motivo_rechazo, urgente")
```

Update the sort function to put urgent pedidos first:

```typescript
pedidos.sort((a: any, b: any) => {
  // Urgent first
  const ua = a.pedido_armado?.urgente ? 0 : 1;
  const ub = b.pedido_armado?.urgente ? 0 : 1;
  if (ua !== ub) return ua - ub;
  // Then by orden_entrega
  const oa = a.pedido_armado?.orden_entrega ?? Infinity;
  const ob = b.pedido_armado?.orden_entrega ?? Infinity;
  if (oa !== ob) return oa - ob;
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
});
```

Also do the same for `src/app/api/equipo/historial/route.ts` — add `urgente` to the select and same sort.

- [ ] **Step 4: Update PATCH route**

In `src/app/api/equipo/pedidos/[ventaId]/route.ts`, after the line `if (orden_entrega !== undefined) updateData.orden_entrega = orden_entrega;`, add:

```typescript
if (body.urgente !== undefined) updateData.urgente = body.urgente;
```

- [ ] **Step 5: Add urgent toggle to supervision cards**

In `src/app/(admin)/admin/equipo/components/supervision-tab.tsx`:

Add a handler:

```typescript
const handleToggleUrgente = async (ventaId: string, currentUrgente: boolean) => {
  setActionLoading(ventaId);
  try {
    const pa = pedidos.find(p => p.id === ventaId)?.pedido_armado;
    await fetch(`/api/equipo/pedidos/${ventaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        estado: pa?.estado || "pendiente",
        urgente: !currentUrgente,
      }),
    });
    await fetchPedidos();
  } finally {
    setActionLoading(null);
  }
};
```

In each pedido card, next to the estado badge, add an urgent indicator/toggle. If `pa?.urgente` is true, show a red flame badge. Add a small button to toggle urgency:

```typescript
{/* Urgent badge */}
{pa?.urgente && (
  <span className="text-xs px-2 py-1 rounded-full font-medium bg-red-100 text-red-600 flex items-center gap-0.5">
    🔥 Urgente
  </span>
)}
```

Add a context action — in the card's action area (where approve/reject buttons are for "armado" state), for ALL states except "listo", add an urgente toggle button:

```typescript
{estado !== "listo" && (
  <button
    onClick={() => handleToggleUrgente(p.id, pa?.urgente ?? false)}
    disabled={actionLoading === p.id}
    className={`text-xs px-2.5 py-1.5 rounded-lg font-medium disabled:opacity-50 ${
      pa?.urgente
        ? "bg-red-50 text-red-600 hover:bg-red-100"
        : "bg-gray-50 text-gray-500 hover:bg-gray-100"
    }`}
  >
    {pa?.urgente ? "Quitar urgente" : "🔥 Urgente"}
  </button>
)}
```

- [ ] **Step 6: Show urgent badge in armador tablero**

In `src/app/equipo/components/pedido-card.tsx`, add an urgent badge in the header area. After the `entregaLabel` badge (around line 150-154), add:

```typescript
{armado?.urgente && (
  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-600 animate-pulse">
    🔥 URGENTE
  </span>
)}
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(equipo): add urgent pedido marking with visual indicators"
```
