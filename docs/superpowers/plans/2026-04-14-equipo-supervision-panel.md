# Equipo Supervision Panel - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add time-tracking columns to `pedido_armado`, rejection flow with toast notifications, venta status sync on approval, and a full admin supervision panel with real-time monitoring and per-armador metrics — all within the existing `/admin/equipo` page using tabs.

**Architecture:** Migration adds 5 columns to `pedido_armado` (inicio_armado_at, fin_armado_at, aprobado_at, aprobado_por, rechazos). API route is updated to populate timestamps on each state transition and handle rejections. The admin page gets a tab system: "Miembros" (existing ABM) and "Supervisión" (new monitoring panel with progress overview, pedido table with times, and per-armador metrics). The tablero armado gets rejection-aware toast notifications.

**Tech Stack:** Next.js App Router, Supabase PostgreSQL, Tailwind CSS, Lucide icons, Supabase Realtime

**Design language:** Dulce Sur brand — dark header `#1e0a10`, accent `#c94070`, soft pink backgrounds `#fdf5f6`, `#f7dde7`, rounded-2xl cards, clean typography. Mobile-first responsive.

---

### Task 1: Database Migration — Add Tracking Columns

**Files:**
- Migration via Supabase MCP

- [ ] **Step 1: Apply migration to add columns to pedido_armado**

```sql
ALTER TABLE pedido_armado
  ADD COLUMN IF NOT EXISTS inicio_armado_at timestamptz,
  ADD COLUMN IF NOT EXISTS fin_armado_at timestamptz,
  ADD COLUMN IF NOT EXISTS aprobado_at timestamptz,
  ADD COLUMN IF NOT EXISTS aprobado_por uuid REFERENCES equipo(id),
  ADD COLUMN IF NOT EXISTS rechazos integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS motivo_rechazo text;
```

- [ ] **Step 2: Verify migration**

Run SQL to confirm columns exist:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'pedido_armado' ORDER BY ordinal_position;
```

Expected: all original columns plus the 6 new ones.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(equipo): add tracking columns to pedido_armado"
```

---

### Task 2: Update Types

**Files:**
- Modify: `src/types/equipo.ts`

- [ ] **Step 1: Update PedidoArmado interface**

Add new fields to the `PedidoArmado` interface:

```typescript
export interface PedidoArmado {
  id: string;
  venta_id: string;
  estado: "pendiente" | "armando" | "armado" | "listo";
  armador_id: string | null;
  notas: string | null;
  orden_entrega: number | null;
  inicio_armado_at: string | null;
  fin_armado_at: string | null;
  aprobado_at: string | null;
  aprobado_por: string | null;
  rechazos: number;
  motivo_rechazo: string | null;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Update PedidoConArmado.pedido_armado shape**

Add the new fields to the nested `pedido_armado` object inside `PedidoConArmado`:

```typescript
pedido_armado: {
  id: string;
  estado: "pendiente" | "armando" | "armado" | "listo";
  armador_id: string | null;
  notas: string | null;
  orden_entrega: number | null;
  armador_nombre?: string;
  inicio_armado_at?: string | null;
  fin_armado_at?: string | null;
  aprobado_at?: string | null;
  aprobado_por?: string | null;
  rechazos?: number;
  motivo_rechazo?: string | null;
} | null;
```

- [ ] **Step 3: Commit**

```bash
git add src/types/equipo.ts && git commit -m "feat(equipo): update types with tracking fields"
```

---

### Task 3: Update API — Timestamps, Rejection, Venta Sync

**Files:**
- Modify: `src/app/api/equipo/pedidos/route.ts`
- Modify: `src/app/api/equipo/pedidos/[ventaId]/route.ts`

- [ ] **Step 1: Update GET route to include new columns**

In `src/app/api/equipo/pedidos/route.ts`, update the `pedido_armado` select on line 37 to include the new columns:

```typescript
const { data: armados } = await supabase
  .from("pedido_armado")
  .select("id, venta_id, estado, armador_id, notas, orden_entrega, inicio_armado_at, fin_armado_at, aprobado_at, aprobado_por, rechazos, motivo_rechazo")
  .in("venta_id", ventaIds);
```

Also update the armador names fetch (step 3 in the route) to also resolve `aprobado_por` names. After building `armadorMap`, also build an `aprobadorMap` from equipo table for the `aprobado_por` IDs:

```typescript
// 3b. Fetch aprobador names
const aprobadorIds = (armados || [])
  .map((a: any) => a.aprobado_por)
  .filter(Boolean);
const allEquipoIds = [...new Set([...armadorIds, ...aprobadorIds])];
const equipoMap: Record<string, string> = {};
if (allEquipoIds.length > 0) {
  const { data: equipo } = await supabase
    .from("equipo")
    .select("id, nombre")
    .in("id", allEquipoIds);
  for (const e of equipo || []) {
    equipoMap[e.id] = e.nombre;
  }
}
```

Then use `equipoMap` for both armador_nombre and aprobador_nombre in the merge step:

```typescript
armadoMap[a.venta_id] = {
  ...a,
  armador_nombre: a.armador_id ? equipoMap[a.armador_id] || null : null,
  aprobador_nombre: a.aprobado_por ? equipoMap[a.aprobado_por] || null : null,
};
```

- [ ] **Step 2: Update PATCH route — populate timestamps per state**

In `src/app/api/equipo/pedidos/[ventaId]/route.ts`, after building `updateData` (around line 23-30), add timestamp logic based on the `estado` value:

```typescript
const now = new Date().toISOString();

if (estado === "armando") {
  // Check if this is a rejection re-assignment (already has inicio_armado_at)
  const { data: existing } = await supabase
    .from("pedido_armado")
    .select("inicio_armado_at")
    .eq("venta_id", ventaId)
    .single();
  if (!existing?.inicio_armado_at) {
    updateData.inicio_armado_at = now;
  }
  // Clear rejection fields when retaking
  updateData.fin_armado_at = null;
  updateData.motivo_rechazo = null;
}

if (estado === "armado") {
  updateData.fin_armado_at = now;
}

if (estado === "listo") {
  updateData.aprobado_at = now;
  if (body.aprobado_por) updateData.aprobado_por = body.aprobado_por;
}
```

- [ ] **Step 3: Add rejection handling in PATCH route**

Add a new block after the existing `estado === "listo"` notifications block. When `estado === "rechazado"`, the API should:
1. Set estado back to "armando"
2. Increment rechazos counter
3. Save motivo_rechazo
4. Clear fin_armado_at so the armador re-does it

Replace the estado check before upsert — if estado is "rechazado", transform it:

```typescript
if (estado === "rechazado") {
  // Get current rechazos count
  const { data: current } = await supabase
    .from("pedido_armado")
    .select("rechazos")
    .eq("venta_id", ventaId)
    .single();

  updateData.estado = "armando";
  updateData.rechazos = (current?.rechazos || 0) + 1;
  updateData.fin_armado_at = null;
  if (body.motivo_rechazo) updateData.motivo_rechazo = body.motivo_rechazo;
}
```

- [ ] **Step 4: Add venta status sync on approval**

In the existing `estado === "listo"` block, after the orden_entrega assignment, add:

```typescript
// Update venta estado to "armado"
await supabase
  .from("ventas")
  .update({ estado: "armado" })
  .eq("id", ventaId);
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/equipo/pedidos/ && git commit -m "feat(equipo): add timestamps, rejection flow, venta sync to API"
```

---

### Task 4: Update Tablero — Rejection Toast & Motivo Display

**Files:**
- Modify: `src/app/equipo/components/tablero-armado.tsx`
- Modify: `src/app/equipo/components/pedido-card.tsx`

- [ ] **Step 1: Add rejection-aware realtime toast**

In `tablero-armado.tsx`, update the Supabase Realtime `postgres_changes` handler for `pedido_armado` (around line 67-73). Instead of a generic toast, check if any pedido was rejected for the current user:

```typescript
.on(
  "postgres_changes",
  { event: "*", schema: "public", table: "pedido_armado" },
  (payload: any) => {
    fetchPedidos();
    // Check if this is a rejection for the current user
    const newData = payload.new as any;
    if (newData?.motivo_rechazo && newData?.armador_id === session.id) {
      showToast(
        `Pedido devuelto: ${newData.motivo_rechazo}`,
        "error"
      );
    } else {
      showToast("Tablero actualizado", "success");
    }
  }
)
```

Update the `toastType` state to include "error":

```typescript
const [toastType, setToastType] = useState<"info" | "success" | "error">("info");
```

And in the toast JSX, add the error color:

```typescript
{toast && (
  <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 text-white text-sm px-4 py-2 rounded-full shadow-lg ${
    toastType === "error" ? "bg-red-500" : toastType === "success" ? "bg-[#c94070]" : "bg-[#1e0a10]"
  }`}>
    {toast}
  </div>
)}
```

- [ ] **Step 2: Show motivo_rechazo on pedido card**

In `pedido-card.tsx`, after the `armadorNombre` display (around line 158-162), add a rejection notice if `motivo_rechazo` exists and estado is "armando":

```typescript
{armado?.motivo_rechazo && estado === "armando" && (
  <div className="mt-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 flex gap-2">
    <span className="text-red-500 text-sm shrink-0">!</span>
    <div>
      <p className="text-[11px] font-bold text-red-800 mb-0.5">Devuelto por el admin</p>
      <p className="text-[11px] text-red-700">{armado.motivo_rechazo}</p>
    </div>
  </div>
)}
```

Also display `rechazos` count if > 0 as a small badge near the header:

```typescript
{(armado?.rechazos ?? 0) > 0 && (
  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">
    {armado!.rechazos} {armado!.rechazos === 1 ? "rechazo" : "rechazos"}
  </span>
)}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/equipo/components/ && git commit -m "feat(equipo): rejection toast and motivo display in tablero"
```

---

### Task 5: Admin Page — Tab System with Miembros & Supervisión

**Files:**
- Modify: `src/app/(admin)/admin/equipo/page.tsx` — becomes a tab container
- Create: `src/app/(admin)/admin/equipo/components/miembros-tab.tsx` — existing ABM extracted
- Create: `src/app/(admin)/admin/equipo/components/supervision-tab.tsx` — new supervision panel

- [ ] **Step 1: Extract existing ABM into MiembrosTab component**

Create `src/app/(admin)/admin/equipo/components/miembros-tab.tsx` — move all the current page.tsx logic (useState, fetchMiembros, table, modal) into a `MiembrosTab` component. The component is identical to the current page content but wrapped as:

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, Pencil, EyeOff, Eye, Trash2, Loader2 } from "lucide-react";
import type { Equipo } from "@/types/equipo";

export function MiembrosTab() {
  // ... all existing code from page.tsx, starting from the state declarations
  // through to the return JSX
  // Remove the outer h1/header — that stays in page.tsx
  // The component returns everything from the table onwards
}
```

The return JSX starts from the loading check through the table and modal. Remove the outer `<div className="p-6 max-w-4xl mx-auto">` wrapper and the h1 header — those will be in page.tsx.

Keep the "Agregar" button inside MiembrosTab at the top.

- [ ] **Step 2: Create SupervisionTab component**

Create `src/app/(admin)/admin/equipo/components/supervision-tab.tsx` with the full supervision panel. This is the largest component — it fetches pedidos from the API and displays:

**Section A — Progress Overview (4 stat cards)**
- Total pedidos del día
- Pendientes (amber)
- En proceso / Armando (violet)
- Listos (Dulce Sur pink)

Each card shows count and a mini progress ring or bar.

**Section B — Pedidos Table**
A responsive table/card list showing each pedido with columns:
- # Número
- Cliente
- Estado (color badge)
- Armador
- T. Espera (tiempo desde created_at hasta inicio_armado_at)
- T. Armado (tiempo desde inicio_armado_at hasta fin_armado_at)
- T. Control (tiempo desde fin_armado_at hasta aprobado_at)
- T. Total (tiempo desde created_at hasta aprobado_at)
- Rechazos (count badge, red if > 0)
- Acciones (approve/reject buttons for "armado" state pedidos)

On mobile, this becomes a card list instead of a table.

**Section C — Métricas por Armador**
Cards per armador showing:
- Nombre + avatar initial
- Pedidos armados hoy
- Tiempo promedio de armado
- Rechazos del día

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  Loader2, Package, Clock, CheckCircle2, AlertTriangle,
  XCircle, ChevronDown, ChevronUp, Timer
} from "lucide-react";
import type { PedidoConArmado } from "@/types/equipo";

// ─── Time helpers ───
function formatDuration(ms: number | null): string {
  if (ms === null || ms <= 0) return "—";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hrs}h ${remainMins}m`;
}

function calcDuration(start: string | null | undefined, end: string | null | undefined): number | null {
  if (!start || !end) return null;
  return new Date(end).getTime() - new Date(start).getTime();
}

// ─── Stat Card ───
function StatCard({ label, value, color, icon: Icon }: {
  label: string;
  value: number;
  color: string;
  icon: any;
}) {
  const colorMap: Record<string, { bg: string; text: string; iconBg: string }> = {
    amber: { bg: "bg-amber-50", text: "text-amber-700", iconBg: "bg-amber-100" },
    violet: { bg: "bg-violet-50", text: "text-violet-700", iconBg: "bg-violet-100" },
    blue: { bg: "bg-blue-50", text: "text-blue-700", iconBg: "bg-blue-100" },
    pink: { bg: "bg-[#fdf5f6]", text: "text-[#c94070]", iconBg: "bg-[#f7dde7]" },
    gray: { bg: "bg-gray-50", text: "text-gray-700", iconBg: "bg-gray-100" },
  };
  const c = colorMap[color] || colorMap.gray;

  return (
    <div className={`${c.bg} rounded-2xl p-4 border border-${color === "pink" ? "[#f0dde5]" : color + "-100"}`}>
      <div className="flex items-center gap-3">
        <div className={`${c.iconBg} w-10 h-10 rounded-xl flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${c.text}`} />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-xs text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Estado Badge ───
function EstadoBadge({ estado }: { estado: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    pendiente: { bg: "bg-amber-100", text: "text-amber-700", label: "Pendiente" },
    armando: { bg: "bg-violet-100", text: "text-violet-700", label: "Armando" },
    armado: { bg: "bg-blue-100", text: "text-blue-700", label: "Armado" },
    listo: { bg: "bg-[#f7dde7]", text: "text-[#c94070]", label: "Listo" },
  };
  const c = config[estado] || config.pendiente;
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

// ─── Armador Metrics Card ───
function ArmadorCard({ nombre, pedidos, tiempoPromedio, rechazos }: {
  nombre: string;
  pedidos: number;
  tiempoPromedio: number | null;
  rechazos: number;
}) {
  const initial = nombre.charAt(0).toUpperCase();
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-[#f7dde7] flex items-center justify-center">
          <span className="font-bold text-[#c94070] text-sm">{initial}</span>
        </div>
        <div>
          <p className="font-semibold text-gray-900 text-sm">{nombre}</p>
          <p className="text-xs text-gray-400">Armador</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="text-center">
          <p className="text-lg font-bold text-gray-900">{pedidos}</p>
          <p className="text-[10px] text-gray-400 uppercase">Pedidos</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-gray-900">{formatDuration(tiempoPromedio)}</p>
          <p className="text-[10px] text-gray-400 uppercase">Promedio</p>
        </div>
        <div className="text-center">
          <p className={`text-lg font-bold ${rechazos > 0 ? "text-red-500" : "text-gray-900"}`}>{rechazos}</p>
          <p className="text-[10px] text-gray-400 uppercase">Rechazos</p>
        </div>
      </div>
    </div>
  );
}

export function SupervisionTab() {
  const [pedidos, setPedidos] = useState<PedidoConArmado[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectMotivo, setRejectMotivo] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchPedidos = useCallback(async () => {
    try {
      const res = await fetch("/api/equipo/pedidos");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPedidos(data.pedidos || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchPedidos(); }, [fetchPedidos]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("admin_supervision")
      .on("postgres_changes", { event: "*", schema: "public", table: "pedido_armado" }, () => fetchPedidos())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ventas" }, () => fetchPedidos())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchPedidos]);

  const handleApprove = async (ventaId: string) => {
    setSaving(true);
    await fetch(`/api/equipo/pedidos/${ventaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: "listo" }),
    });
    await fetchPedidos();
    setSaving(false);
  };

  const handleReject = async (ventaId: string) => {
    if (!rejectMotivo.trim()) return;
    setSaving(true);
    await fetch(`/api/equipo/pedidos/${ventaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: "rechazado", motivo_rechazo: rejectMotivo.trim() }),
    });
    setRejectingId(null);
    setRejectMotivo("");
    await fetchPedidos();
    setSaving(false);
  };

  // ─── Computed stats ───
  const total = pedidos.length;
  const pendienteCount = pedidos.filter(p => !p.pedido_armado || p.pedido_armado.estado === "pendiente").length;
  const armandoCount = pedidos.filter(p => p.pedido_armado?.estado === "armando").length;
  const armadoCount = pedidos.filter(p => p.pedido_armado?.estado === "armado").length;
  const listoCount = pedidos.filter(p => p.pedido_armado?.estado === "listo").length;

  // ─── Per-armador metrics ───
  const armadorStats: Record<string, { nombre: string; pedidos: number; totalTiempo: number; count: number; rechazos: number }> = {};
  for (const p of pedidos) {
    const a = p.pedido_armado;
    if (!a?.armador_id) continue;
    const nombre = a.armador_nombre || "Sin nombre";
    if (!armadorStats[a.armador_id]) {
      armadorStats[a.armador_id] = { nombre, pedidos: 0, totalTiempo: 0, count: 0, rechazos: 0 };
    }
    const stat = armadorStats[a.armador_id];
    if (a.estado !== "pendiente") stat.pedidos++;
    stat.rechazos += a.rechazos || 0;
    const dur = calcDuration(a.inicio_armado_at, a.fin_armado_at);
    if (dur && dur > 0) {
      stat.totalTiempo += dur;
      stat.count++;
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section A: Progress Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total del día" value={total} color="gray" icon={Package} />
        <StatCard label="Pendientes" value={pendienteCount} color="amber" icon={Clock} />
        <StatCard label="En proceso" value={armandoCount + armadoCount} color="violet" icon={Timer} />
        <StatCard label="Listos" value={listoCount} color="pink" icon={CheckCircle2} />
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex">
            {listoCount > 0 && (
              <div className="bg-[#c94070] h-full transition-all" style={{ width: `${(listoCount / total) * 100}%` }} />
            )}
            {(armandoCount + armadoCount) > 0 && (
              <div className="bg-violet-400 h-full transition-all" style={{ width: `${((armandoCount + armadoCount) / total) * 100}%` }} />
            )}
            {pendienteCount > 0 && (
              <div className="bg-amber-300 h-full transition-all" style={{ width: `${(pendienteCount / total) * 100}%` }} />
            )}
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-xs text-gray-400">{Math.round((listoCount / total) * 100)}% completado</span>
            <span className="text-xs text-gray-400">{listoCount}/{total}</span>
          </div>
        </div>
      )}

      {/* Section C: Per-Armador Metrics */}
      {Object.keys(armadorStats).length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Rendimiento por armador</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.values(armadorStats).map((stat) => (
              <ArmadorCard
                key={stat.nombre}
                nombre={stat.nombre}
                pedidos={stat.pedidos}
                tiempoPromedio={stat.count > 0 ? stat.totalTiempo / stat.count : null}
                rechazos={stat.rechazos}
              />
            ))}
          </div>
        </div>
      )}

      {/* Section B: Pedidos Table — Desktop */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Detalle de pedidos</h3>

        {/* Desktop table */}
        <div className="hidden md:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50/80">
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">#</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Cliente</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Estado</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Armador</th>
                <th className="text-center px-3 py-3 font-medium text-gray-500 text-xs">Espera</th>
                <th className="text-center px-3 py-3 font-medium text-gray-500 text-xs">Armado</th>
                <th className="text-center px-3 py-3 font-medium text-gray-500 text-xs">Control</th>
                <th className="text-center px-3 py-3 font-medium text-gray-500 text-xs">Total</th>
                <th className="text-center px-3 py-3 font-medium text-gray-500 text-xs">Rechazos</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => {
                const a = p.pedido_armado;
                const estado = a?.estado || "pendiente";
                const tEspera = calcDuration(p.created_at, a?.inicio_armado_at);
                const tArmado = calcDuration(a?.inicio_armado_at, a?.fin_armado_at);
                const tControl = calcDuration(a?.fin_armado_at, a?.aprobado_at);
                const tTotal = calcDuration(p.created_at, a?.aprobado_at);
                const rechazos = a?.rechazos || 0;

                return (
                  <tr key={p.id} className="border-b last:border-b-0 hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-400">{p.numero?.slice(-4)}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 text-sm">{p.clientes?.nombre || "—"}</td>
                    <td className="px-4 py-3"><EstadoBadge estado={estado} /></td>
                    <td className="px-4 py-3 text-gray-600 text-sm">{a?.armador_nombre || "—"}</td>
                    <td className="px-3 py-3 text-center text-xs text-gray-500 font-mono">{formatDuration(tEspera)}</td>
                    <td className="px-3 py-3 text-center text-xs text-gray-500 font-mono">{formatDuration(tArmado)}</td>
                    <td className="px-3 py-3 text-center text-xs text-gray-500 font-mono">{formatDuration(tControl)}</td>
                    <td className="px-3 py-3 text-center text-xs font-semibold font-mono text-gray-700">{formatDuration(tTotal)}</td>
                    <td className="px-3 py-3 text-center">
                      {rechazos > 0 ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-semibold">{rechazos}</span>
                      ) : (
                        <span className="text-xs text-gray-300">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {estado === "armado" && (
                        <div className="flex gap-1.5 justify-end">
                          <button
                            onClick={() => handleApprove(p.id)}
                            disabled={saving}
                            className="text-xs px-3 py-1.5 rounded-lg bg-[#c94070] text-white font-medium hover:bg-[#a83360] disabled:opacity-50"
                          >
                            Aprobar
                          </button>
                          <button
                            onClick={() => setRejectingId(p.id)}
                            className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 font-medium hover:bg-red-100"
                          >
                            Rechazar
                          </button>
                        </div>
                      )}
                      {estado === "listo" && (
                        <span className="text-xs text-[#c94070] font-medium">Completado</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {pedidos.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-gray-400">
                    No hay pedidos del día
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-3">
          {pedidos.map((p) => {
            const a = p.pedido_armado;
            const estado = a?.estado || "pendiente";
            const tEspera = calcDuration(p.created_at, a?.inicio_armado_at);
            const tArmado = calcDuration(a?.inicio_armado_at, a?.fin_armado_at);
            const tTotal = calcDuration(p.created_at, a?.aprobado_at);
            const rechazos = a?.rechazos || 0;

            return (
              <div key={p.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{p.clientes?.nombre || "—"}</p>
                    <p className="text-xs text-gray-400 font-mono">#{p.numero?.slice(-4)}</p>
                  </div>
                  <EstadoBadge estado={estado} />
                </div>
                {a?.armador_nombre && (
                  <p className="text-xs text-gray-500 mb-2">Armador: {a.armador_nombre}</p>
                )}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="bg-gray-50 rounded-xl px-2 py-1.5 text-center">
                    <p className="text-xs font-bold text-gray-700">{formatDuration(tEspera)}</p>
                    <p className="text-[9px] text-gray-400 uppercase">Espera</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl px-2 py-1.5 text-center">
                    <p className="text-xs font-bold text-gray-700">{formatDuration(tArmado)}</p>
                    <p className="text-[9px] text-gray-400 uppercase">Armado</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl px-2 py-1.5 text-center">
                    <p className="text-xs font-bold text-gray-700">{formatDuration(tTotal)}</p>
                    <p className="text-[9px] text-gray-400 uppercase">Total</p>
                  </div>
                </div>
                {rechazos > 0 && (
                  <div className="flex items-center gap-1.5 mb-3">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                    <span className="text-xs text-red-600 font-medium">{rechazos} {rechazos === 1 ? "rechazo" : "rechazos"}</span>
                  </div>
                )}
                {estado === "armado" && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(p.id)}
                      disabled={saving}
                      className="flex-1 py-2.5 rounded-xl bg-[#c94070] text-white font-semibold text-xs disabled:opacity-50"
                    >
                      Aprobar
                    </button>
                    <button
                      onClick={() => setRejectingId(p.id)}
                      className="flex-1 py-2.5 rounded-xl bg-red-50 text-red-600 font-semibold text-xs"
                    >
                      Rechazar
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {pedidos.length === 0 && (
            <div className="text-center py-12">
              <Package className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-400">No hay pedidos del día</p>
            </div>
          )}
        </div>
      </div>

      {/* Reject Modal */}
      {rejectingId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
            <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-500" /> Rechazar pedido
            </h3>
            <div>
              <label className="text-sm font-medium text-gray-600 block mb-1">Motivo del rechazo</label>
              <textarea
                value={rejectMotivo}
                onChange={(e) => setRejectMotivo(e.target.value)}
                placeholder="Ej: Falta un producto, cantidad incorrecta..."
                className="w-full h-24 border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setRejectingId(null); setRejectMotivo(""); }}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-600 font-medium text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleReject(rejectingId)}
                disabled={saving || !rejectMotivo.trim()}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-medium text-sm disabled:opacity-50"
              >
                Rechazar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Rewrite page.tsx as tab container**

Replace `src/app/(admin)/admin/equipo/page.tsx` with a simple tab container:

```typescript
"use client";

import { useState } from "react";
import { Users, BarChart3 } from "lucide-react";
import { MiembrosTab } from "./components/miembros-tab";
import { SupervisionTab } from "./components/supervision-tab";

type Tab = "miembros" | "supervision";

export default function EquipoAdminPage() {
  const [tab, setTab] = useState<Tab>("supervision");

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Users className="w-6 h-6" /> Equipo
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Gestión y supervisión del equipo de armado
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
        <button
          onClick={() => setTab("supervision")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === "supervision"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <BarChart3 className="w-4 h-4" /> Supervisión
        </button>
        <button
          onClick={() => setTab("miembros")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === "miembros"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Users className="w-4 h-4" /> Miembros
        </button>
      </div>

      {/* Tab content */}
      {tab === "supervision" ? <SupervisionTab /> : <MiembrosTab />}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/(admin)/admin/equipo/ && git commit -m "feat(equipo): admin supervision panel with tabs, metrics, and rejection flow"
```

---

### Task 6: Integration Testing & Polish

- [ ] **Step 1: Test the full flow manually**

1. Go to `/admin/equipo` — verify tabs work, Supervisión shows as default
2. Create a test pedido (via POS or tienda)
3. Go to `/equipo`, log in as armador, take the pedido → verify `inicio_armado_at` is set
4. Mark as armado → verify `fin_armado_at` is set
5. Go to Supervisión tab → verify pedido appears with correct times
6. Click Rechazar → enter motivo → verify pedido goes back to armador with toast
7. Re-arm and mark armado again → verify rechazos counter incremented
8. Click Aprobar → verify `aprobado_at` set, venta estado updated to "armado"
9. For retiro pedidos, verify client notification is sent
10. Check mobile layout for both Supervisión and Miembros tabs

- [ ] **Step 2: Commit final adjustments**

```bash
git add -A && git commit -m "feat(equipo): polish supervision panel"
```
