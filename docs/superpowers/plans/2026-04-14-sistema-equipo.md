# Sistema de Equipo — Tablero de Armado + Hoja de Ruta Rediseñada

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first team system (`/equipo`) with PIN login, assembly board for order preparers (armadores), and redesign the public delivery route page (`/ruta/[token]`).

**Architecture:** Public page `/equipo` with PIN-based auth (sessionStorage). Three API routes handle auth, fetching today's orders, and updating assembly status. Supabase Realtime for live updates. The `/ruta/[token]` page gets a visual redesign keeping the existing API unchanged.

**Tech Stack:** Next.js App Router, Supabase (PostgreSQL + Realtime), Tailwind CSS, shadcn/ui, Lucide icons

---

## File Structure

### New files:
| File | Responsibility |
|------|---------------|
| `src/types/equipo.ts` | TypeScript interfaces for equipo and pedido_armado |
| `src/app/api/equipo/auth/route.ts` | POST — validate PIN, return employee data |
| `src/app/api/equipo/pedidos/route.ts` | GET — fetch today's orders with assembly status |
| `src/app/api/equipo/pedidos/[ventaId]/route.ts` | PATCH — update assembly state + send notifications |
| `src/app/equipo/layout.tsx` | Minimal layout (no admin sidebar) |
| `src/app/equipo/page.tsx` | Main page: PIN screen → armador/admin view |
| `src/app/equipo/components/pin-screen.tsx` | PIN input with numpad |
| `src/app/equipo/components/tablero-armado.tsx` | Assembly board with columns/tabs |
| `src/app/equipo/components/pedido-card.tsx` | Individual order card with actions |
| `src/app/equipo/components/notas-modal.tsx` | Modal for adding notes when marking as assembled |
| `src/app/(admin)/admin/equipo/page.tsx` | Admin CRUD for team members |

### Modified files:
| File | Change |
|------|--------|
| `src/types/database.ts` | Add Equipo and PedidoArmado to Database interface |
| `src/app/ruta/[token]/page.tsx` | Complete visual redesign (keep API) |
| `src/app/(admin)/admin/ventas/hoja-ruta/page.tsx` | Add "Tablero de armado" button |
| `src/components/sidebar.tsx` | Add "Equipo" nav item under Ventas |

### Database (run manually in Supabase SQL Editor):
- Create table `equipo`
- Create table `pedido_armado`

---

## Task 1: Database Setup

**Files:** None (SQL in Supabase)

- [ ] **Step 1: Create `equipo` table**

Run in Supabase SQL Editor:

```sql
CREATE TABLE IF NOT EXISTS equipo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  pin TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('armador', 'repartidor', 'admin')),
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Test data
INSERT INTO equipo (nombre, pin, rol) VALUES
  ('Juan', '1234', 'armador'),
  ('María', '5678', 'armador'),
  ('Carlos', '9999', 'repartidor');
```

- [ ] **Step 2: Create `pedido_armado` table**

```sql
CREATE TABLE IF NOT EXISTS pedido_armado (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venta_id UUID NOT NULL REFERENCES ventas(id),
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'armando', 'armado', 'listo')),
  armador_id UUID REFERENCES equipo(id),
  notas TEXT,
  orden_entrega INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(venta_id)
);

CREATE INDEX IF NOT EXISTS idx_pedido_armado_estado ON pedido_armado(estado);
CREATE INDEX IF NOT EXISTS idx_pedido_armado_venta ON pedido_armado(venta_id);
```

- [ ] **Step 3: Verify tables exist**

Run in SQL Editor:
```sql
SELECT COUNT(*) FROM equipo;
SELECT COUNT(*) FROM pedido_armado;
```
Expected: both return 0 rows (or 3 for equipo with test data).

---

## Task 2: TypeScript Types

**Files:**
- Create: `src/types/equipo.ts`
- Modify: `src/types/database.ts`

- [ ] **Step 1: Create `src/types/equipo.ts`**

```typescript
export interface Equipo {
  id: string;
  nombre: string;
  pin: string;
  rol: "armador" | "repartidor" | "admin";
  activo: boolean;
  created_at: string;
}

export interface PedidoArmado {
  id: string;
  venta_id: string;
  estado: "pendiente" | "armando" | "armado" | "listo";
  armador_id: string | null;
  notas: string | null;
  orden_entrega: number | null;
  created_at: string;
  updated_at: string;
}

/** Shape returned by GET /api/equipo/pedidos */
export interface PedidoConArmado {
  id: string;
  numero: string;
  total: number;
  forma_pago: string;
  metodo_entrega: string | null;
  origen: string | null;
  created_at: string;
  clientes: {
    id: string;
    nombre: string;
    telefono: string | null;
    domicilio: string | null;
    localidad: string | null;
    auth_id?: string | null;
  } | null;
  venta_items: {
    descripcion: string;
    cantidad: number;
    precio_unitario: number;
    subtotal: number;
  }[];
  pedido_armado: {
    id: string;
    estado: "pendiente" | "armando" | "armado" | "listo";
    armador_id: string | null;
    notas: string | null;
    orden_entrega: number | null;
    armador_nombre?: string;
  } | null;
}

/** Session stored in sessionStorage after PIN auth */
export interface EquipoSession {
  id: string;
  nombre: string;
  rol: "armador" | "repartidor" | "admin";
}
```

- [ ] **Step 2: Add to `src/types/database.ts`**

Add to the Database interface Tables section (after existing tables) and add the exported interfaces at the end of the file:

```typescript
// In Database.public.Tables, add:
      equipo: {
        Row: Equipo;
        Insert: Partial<Equipo>;
        Update: Partial<Equipo>;
      };
      pedido_armado: {
        Row: PedidoArmado;
        Insert: Partial<PedidoArmado>;
        Update: Partial<PedidoArmado>;
      };
```

Import `Equipo` and `PedidoArmado` from `./equipo` or duplicate the interfaces inline — whichever matches the existing pattern in `database.ts` (existing types are defined inline, so define them inline).

- [ ] **Step 3: Commit**

```bash
git add src/types/equipo.ts src/types/database.ts
git commit -m "feat(equipo): add TypeScript types for equipo and pedido_armado"
```

---

## Task 3: API — PIN Authentication

**Files:**
- Create: `src/app/api/equipo/auth/route.ts`

- [ ] **Step 1: Create the auth route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { pin } = await req.json();
    if (!pin || typeof pin !== "string") {
      return NextResponse.json({ error: "PIN requerido" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("equipo")
      .select("id, nombre, rol")
      .eq("pin", pin)
      .eq("activo", true)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "PIN incorrecto" }, { status: 401 });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify with curl or browser**

```bash
# Test valid PIN
curl -X POST http://localhost:3000/api/equipo/auth \
  -H "Content-Type: application/json" \
  -d '{"pin":"1234"}'
# Expected: {"id":"...","nombre":"Juan","rol":"armador"}

# Test invalid PIN
curl -X POST http://localhost:3000/api/equipo/auth \
  -H "Content-Type: application/json" \
  -d '{"pin":"0000"}'
# Expected: {"error":"PIN incorrecto"} with status 401
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/equipo/auth/route.ts
git commit -m "feat(equipo): add PIN authentication API route"
```

---

## Task 4: API — Fetch Today's Orders

**Files:**
- Create: `src/app/api/equipo/pedidos/route.ts`

- [ ] **Step 1: Create the pedidos route**

This route fetches today's ventas that have `metodo_entrega` in (envio, envio_a_domicilio, retiro), are not anuladas, and are not Notas de Crédito. It LEFT JOINs with `pedido_armado` and the `equipo` table to get the armador name.

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { todayARG } from "@/lib/formatters";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const fecha = todayARG();

    // 1. Fetch today's ventas with delivery/pickup
    const { data: ventas, error } = await supabase
      .from("ventas")
      .select(`
        id, numero, total, forma_pago, metodo_entrega, origen, created_at,
        clientes ( id, nombre, telefono, domicilio, localidad, auth_id ),
        venta_items ( descripcion, cantidad, precio_unitario, subtotal )
      `)
      .eq("fecha", fecha)
      .neq("estado", "anulada")
      .in("metodo_entrega", ["envio", "envio_a_domicilio", "retiro"])
      .not("tipo_comprobante", "ilike", "Nota de Crédito%")
      .order("created_at", { ascending: true });

    if (error) throw error;
    if (!ventas || ventas.length === 0) {
      return NextResponse.json({ pedidos: [] });
    }

    // 2. Fetch pedido_armado for these ventas
    const ventaIds = ventas.map((v: any) => v.id);
    const { data: armados } = await supabase
      .from("pedido_armado")
      .select("id, venta_id, estado, armador_id, notas, orden_entrega")
      .in("venta_id", ventaIds);

    // 3. Fetch armador names
    const armadorIds = (armados || [])
      .map((a: any) => a.armador_id)
      .filter(Boolean);
    const armadorMap: Record<string, string> = {};
    if (armadorIds.length > 0) {
      const { data: armadores } = await supabase
        .from("equipo")
        .select("id, nombre")
        .in("id", armadorIds);
      for (const a of armadores || []) {
        armadorMap[a.id] = a.nombre;
      }
    }

    // 4. Merge data
    const armadoMap: Record<string, any> = {};
    for (const a of armados || []) {
      armadoMap[a.venta_id] = {
        ...a,
        armador_nombre: a.armador_id ? armadorMap[a.armador_id] || null : null,
      };
    }

    const pedidos = ventas.map((v: any) => ({
      ...v,
      pedido_armado: armadoMap[v.id] || null,
    }));

    // 5. Sort: by orden_entrega (nulls last), then created_at
    pedidos.sort((a: any, b: any) => {
      const oa = a.pedido_armado?.orden_entrega ?? Infinity;
      const ob = b.pedido_armado?.orden_entrega ?? Infinity;
      if (oa !== ob) return oa - ob;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    return NextResponse.json({ pedidos });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error del servidor" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify**

```bash
curl http://localhost:3000/api/equipo/pedidos
# Expected: {"pedidos":[...]} — may be empty if no ventas today
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/equipo/pedidos/route.ts
git commit -m "feat(equipo): add GET endpoint for today's assembly orders"
```

---

## Task 5: API — Update Assembly Status

**Files:**
- Create: `src/app/api/equipo/pedidos/[ventaId]/route.ts`

- [ ] **Step 1: Create the PATCH route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ ventaId: string }> }
) {
  try {
    const { ventaId } = await params;
    const body = await req.json();
    const { estado, armador_id, notas, orden_entrega } = body;

    if (!estado) {
      return NextResponse.json({ error: "Estado requerido" }, { status: 400 });
    }

    // Upsert pedido_armado
    const updateData: Record<string, unknown> = {
      venta_id: ventaId,
      estado,
      updated_at: new Date().toISOString(),
    };
    if (armador_id) updateData.armador_id = armador_id;
    if (notas !== undefined) updateData.notas = notas;
    if (orden_entrega !== undefined) updateData.orden_entrega = orden_entrega;

    const { data: armado, error } = await supabase
      .from("pedido_armado")
      .upsert(updateData, { onConflict: "venta_id" })
      .select()
      .single();

    if (error) throw error;

    // Send notifications based on state transitions
    if (estado === "armado") {
      // Notify admin that order is ready for review
      const { data: venta } = await supabase
        .from("ventas")
        .select("numero, clientes ( nombre )")
        .eq("id", ventaId)
        .single();

      const { data: armador } = armador_id
        ? await supabase.from("equipo").select("nombre").eq("id", armador_id).single()
        : { data: null };

      const clienteNombre = (venta as any)?.clientes?.nombre || "Cliente";
      const armadorNombre = armador?.nombre || "Equipo";
      let mensaje = `${clienteNombre} — ${(venta as any)?.numero || ""} armado por ${armadorNombre}`;
      if (notas) mensaje += `\nNota: ${notas}`;

      await fetch(new URL("/api/notificaciones/enviar", req.url).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: "Pedido listo para controlar",
          mensaje,
          tipo: "sistema",
          segmentacion: { tipo: "rol", valor: "admin" },
        }),
      }).catch(() => {}); // Don't fail the main request if notification fails
    }

    if (estado === "listo") {
      // For pickup orders, notify the client
      const { data: venta } = await supabase
        .from("ventas")
        .select("metodo_entrega, clientes ( nombre, auth_id )")
        .eq("id", ventaId)
        .single();

      const metodo = (venta as any)?.metodo_entrega;
      const cliente = (venta as any)?.clientes;

      if (metodo === "retiro" && cliente?.auth_id) {
        const primerNombre = (cliente.nombre || "").split(" ")[0];
        await fetch(new URL("/api/notificaciones/enviar", req.url).toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            titulo: "Tu pedido está listo",
            mensaje: `¡Hola ${primerNombre}! Tu pedido ya está listo para retirar.`,
            tipo: "pedido",
            segmentacion: { tipo: "cliente", valor: cliente.auth_id },
          }),
        }).catch(() => {});
      }
    }

    return NextResponse.json(armado);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error del servidor" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/api/equipo/pedidos/[ventaId]/route.ts"
git commit -m "feat(equipo): add PATCH endpoint for assembly status updates with notifications"
```

---

## Task 6: Equipo Layout

**Files:**
- Create: `src/app/equipo/layout.tsx`

- [ ] **Step 1: Create minimal layout**

The `/equipo` route is public (no admin sidebar, no auth middleware). The middleware only matches `/admin/:path*` and `/login`, so `/equipo` is already unprotected.

```typescript
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Equipo — Dulce Sur",
  description: "Sistema de equipo",
};

export default function EquipoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/equipo/layout.tsx
git commit -m "feat(equipo): add public layout for /equipo"
```

---

## Task 7: PIN Screen Component

**Files:**
- Create: `src/app/equipo/components/pin-screen.tsx`

- [ ] **Step 1: Build the PIN input with numpad**

```typescript
"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { EquipoSession } from "@/types/equipo";

interface PinScreenProps {
  onAuth: (session: EquipoSession) => void;
}

export function PinScreen({ onAuth }: PinScreenProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const addDigit = (d: string) => {
    if (pin.length < 4) {
      setPin((p) => p + d);
      setError(null);
    }
  };

  const removeDigit = () => {
    setPin((p) => p.slice(0, -1));
    setError(null);
  };

  const submit = async () => {
    if (pin.length !== 4) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/equipo/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (!res.ok) {
        const j = await res.json();
        setError(j.error || "PIN incorrecto");
        setPin("");
        setLoading(false);
        return;
      }
      const data: EquipoSession = await res.json();
      sessionStorage.setItem("equipo_session", JSON.stringify(data));
      onAuth(data);
    } catch {
      setError("Error de conexión");
      setPin("");
    }
    setLoading(false);
  };

  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dulce Sur</h1>
        <p className="text-gray-500 mt-1">Sistema de Equipo</p>
      </div>

      {/* PIN display */}
      <div className="flex gap-3 mb-8">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="w-14 h-14 rounded-xl border-2 border-gray-300 flex items-center justify-center text-2xl font-bold"
          >
            {pin[i] ? "●" : ""}
          </div>
        ))}
      </div>

      {/* Error message */}
      {error && (
        <p className="text-red-500 text-sm font-medium mb-4">{error}</p>
      )}

      {/* Numpad */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {digits.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => addDigit(d)}
            disabled={loading}
            className="w-[72px] h-[72px] rounded-2xl bg-white border border-gray-200 text-xl font-semibold text-gray-800 active:bg-gray-100 disabled:opacity-50 shadow-sm"
          >
            {d}
          </button>
        ))}
      </div>
      <div className="flex justify-center mb-6">
        <button
          type="button"
          onClick={() => addDigit("0")}
          disabled={loading}
          className="w-[72px] h-[72px] rounded-2xl bg-white border border-gray-200 text-xl font-semibold text-gray-800 active:bg-gray-100 disabled:opacity-50 shadow-sm"
        >
          0
        </button>
      </div>

      {/* Actions */}
      <div className="flex gap-3 w-full max-w-[240px]">
        <button
          type="button"
          onClick={removeDigit}
          disabled={loading || pin.length === 0}
          className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-600 font-medium text-sm disabled:opacity-30"
        >
          ← Borrar
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={loading || pin.length !== 4}
          className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-medium text-sm disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Confirmar
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/equipo/components/pin-screen.tsx
git commit -m "feat(equipo): add PIN screen component with numpad"
```

---

## Task 8: Notes Modal Component

**Files:**
- Create: `src/app/equipo/components/notas-modal.tsx`

- [ ] **Step 1: Build the modal**

```typescript
"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

interface NotasModalProps {
  clienteNombre: string;
  onConfirm: (notas: string) => Promise<void>;
  onCancel: () => void;
}

export function NotasModal({ clienteNombre, onConfirm, onCancel }: NotasModalProps) {
  const [notas, setNotas] = useState("");
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    await onConfirm(notas);
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
        <h3 className="font-bold text-gray-900 text-lg">
          Pedido de {clienteNombre}
        </h3>

        <div>
          <label className="text-sm font-medium text-gray-600 block mb-1.5">
            Observaciones del armado
          </label>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Ej: falta 1 unidad, producto roto..."
            rows={3}
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <p className="text-xs text-gray-400 mt-1">Campo opcional</p>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-600 font-medium text-sm"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-medium text-sm flex items-center justify-center gap-1.5"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Confirmar ✓
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/equipo/components/notas-modal.tsx
git commit -m "feat(equipo): add notes modal for assembly completion"
```

---

## Task 9: Pedido Card Component

**Files:**
- Create: `src/app/equipo/components/pedido-card.tsx`

- [ ] **Step 1: Build the order card**

This card shows order info and action buttons based on state and who is viewing.

```typescript
"use client";

import { useState } from "react";
import { Package, ShoppingBag, Truck, Loader2, User } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import type { PedidoConArmado, EquipoSession } from "@/types/equipo";
import { NotasModal } from "./notas-modal";

interface PedidoCardProps {
  pedido: PedidoConArmado;
  session: EquipoSession;
  onUpdateEstado: (ventaId: string, estado: string, notas?: string) => Promise<void>;
}

export function PedidoCard({ pedido, session, onUpdateEstado }: PedidoCardProps) {
  const [showNotas, setShowNotas] = useState(false);
  const [loading, setLoading] = useState(false);

  const armado = pedido.pedido_armado;
  const estado = armado?.estado || "pendiente";
  const esArmador = session.rol === "armador";
  const esAdmin = session.rol === "admin";
  const esMiPedido = armado?.armador_id === session.id;

  const clienteNombre = pedido.clientes?.nombre || "Sin nombre";
  const hora = new Date(pedido.created_at).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  });

  const origenLabel = pedido.origen === "tienda" ? "Web" : pedido.origen === "pos" ? "POS" : "Manual";
  const entregaLabel = pedido.metodo_entrega === "retiro" ? "Retiro" : "Envío";

  const handleTomar = async () => {
    setLoading(true);
    await onUpdateEstado(pedido.id, "armando");
    setLoading(false);
  };

  const handleMarcarArmado = async (notas: string) => {
    await onUpdateEstado(pedido.id, "armado", notas);
    setShowNotas(false);
  };

  const handleAprobar = async () => {
    setLoading(true);
    await onUpdateEstado(pedido.id, "listo");
    setLoading(false);
  };

  // Background color by state
  const bgClass =
    estado === "armando"
      ? "border-amber-300 bg-amber-50/50"
      : estado === "armado"
        ? "border-blue-300 bg-blue-50/50"
        : estado === "listo"
          ? "border-emerald-300 bg-emerald-50/50"
          : "border-gray-200 bg-white";

  return (
    <>
      <div className={`rounded-2xl border-2 p-4 space-y-2 ${bgClass}`}>
        {/* Header: name + total */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 truncate">{clienteNombre}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                {origenLabel}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium flex items-center gap-1">
                {entregaLabel === "Retiro" ? <ShoppingBag className="w-3 h-3" /> : <Truck className="w-3 h-3" />}
                {entregaLabel}
              </span>
            </div>
          </div>
          <p className="font-bold text-gray-900 shrink-0">{formatCurrency(pedido.total)}</p>
        </div>

        {/* Numero + hora */}
        <p className="text-xs text-gray-500">
          #{pedido.numero} · {hora}
        </p>

        {/* Armador info */}
        {armado?.armador_id && (
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <User className="w-3 h-3" />
            Armado por: {armado.armador_nombre || "—"}
          </div>
        )}

        {/* Notas */}
        {armado?.notas && (
          <p className="text-xs text-amber-700 bg-amber-100 rounded-lg px-3 py-1.5">
            Nota: {armado.notas}
          </p>
        )}

        {/* Action buttons */}
        {estado === "pendiente" && esArmador && (
          <button
            onClick={handleTomar}
            disabled={loading}
            className="w-full mt-2 py-3 rounded-xl bg-amber-500 text-white font-semibold text-sm flex items-center justify-center gap-2 active:bg-amber-600 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
            Tomar pedido
          </button>
        )}

        {estado === "armando" && esMiPedido && (
          <button
            onClick={() => setShowNotas(true)}
            disabled={loading}
            className="w-full mt-2 py-3 rounded-xl bg-blue-600 text-white font-semibold text-sm flex items-center justify-center gap-2 active:bg-blue-700"
          >
            Marcar como armado
          </button>
        )}

        {estado === "armado" && !esAdmin && (
          <p className="text-xs text-center text-blue-500 font-medium py-2">
            Esperando control del admin
          </p>
        )}

        {estado === "armado" && esAdmin && (
          <button
            onClick={handleAprobar}
            disabled={loading}
            className="w-full mt-2 py-3 rounded-xl bg-emerald-600 text-white font-semibold text-sm flex items-center justify-center gap-2 active:bg-emerald-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Aprobar ✓
          </button>
        )}

        {estado === "listo" && (
          <p className="text-xs text-center text-emerald-600 font-medium py-1">
            ✓ Listo
          </p>
        )}
      </div>

      {showNotas && (
        <NotasModal
          clienteNombre={clienteNombre}
          onConfirm={handleMarcarArmado}
          onCancel={() => setShowNotas(false)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/equipo/components/pedido-card.tsx
git commit -m "feat(equipo): add pedido card component with state-based actions"
```

---

## Task 10: Tablero de Armado Component

**Files:**
- Create: `src/app/equipo/components/tablero-armado.tsx`

- [ ] **Step 1: Build the assembly board**

This is the main view after authentication. It shows orders grouped by state, with tabs on mobile and a grid on desktop. Includes Supabase Realtime subscription.

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, LogOut, Truck, ShoppingBag } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatDateARG } from "@/lib/formatters";
import type { PedidoConArmado, EquipoSession } from "@/types/equipo";
import { PedidoCard } from "./pedido-card";

interface TableroArmadoProps {
  session: EquipoSession;
  onLogout: () => void;
}

type EntregaFilter = "envio" | "retiro";
type EstadoTab = "pendiente" | "armando" | "armado" | "listo";

const ESTADO_TABS: EstadoTab[] = ["pendiente", "armando", "armado", "listo"];
const ESTADO_LABELS: Record<EstadoTab, string> = {
  pendiente: "Pendiente",
  armando: "Armando",
  armado: "Armado",
  listo: "Listo",
};

export function TableroArmado({ session, onLogout }: TableroArmadoProps) {
  const [pedidos, setPedidos] = useState<PedidoConArmado[]>([]);
  const [loading, setLoading] = useState(true);
  const [entregaFilter, setEntregaFilter] = useState<EntregaFilter>("envio");
  const [estadoTab, setEstadoTab] = useState<EstadoTab>("pendiente");
  const [toast, setToast] = useState<string | null>(null);

  const fetchPedidos = useCallback(async () => {
    try {
      const res = await fetch("/api/equipo/pedidos");
      if (!res.ok) throw new Error("Error al cargar pedidos");
      const data = await res.json();
      setPedidos(data.pedidos || []);
    } catch {
      // silent retry on next interval
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPedidos();
  }, [fetchPedidos]);

  // Supabase Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("pedido_armado_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedido_armado" },
        () => {
          fetchPedidos();
          setToast("Tablero actualizado");
          setTimeout(() => setToast(null), 3000);
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ventas" },
        () => {
          fetchPedidos();
          setToast("Nuevo pedido recibido");
          setTimeout(() => setToast(null), 3000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchPedidos]);

  const handleUpdateEstado = async (ventaId: string, estado: string, notas?: string) => {
    await fetch(`/api/equipo/pedidos/${ventaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        estado,
        armador_id: session.id,
        ...(notas !== undefined ? { notas } : {}),
      }),
    });
    await fetchPedidos();
  };

  // Filter by entrega type
  const filtered = pedidos.filter((p) => {
    if (entregaFilter === "envio") {
      return p.metodo_entrega === "envio" || p.metodo_entrega === "envio_a_domicilio";
    }
    return p.metodo_entrega === "retiro";
  });

  // Group by estado
  const byEstado = (estado: EstadoTab) =>
    filtered.filter((p) => (p.pedido_armado?.estado || "pendiente") === estado);

  const envioCount = pedidos.filter(
    (p) => p.metodo_entrega === "envio" || p.metodo_entrega === "envio_a_domicilio"
  ).length;
  const retiroCount = pedidos.filter((p) => p.metodo_entrega === "retiro").length;

  const today = formatDateARG(new Date().toISOString());

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-4 py-2 rounded-full shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b px-4 py-3 sticky top-0 z-40">
        <div className="flex items-center justify-between">
          <button
            onClick={onLogout}
            className="text-sm text-gray-500 flex items-center gap-1"
          >
            <LogOut className="w-4 h-4" /> Salir
          </button>
          <span className="font-semibold text-gray-800">
            Hola, {session.nombre}
          </span>
          <span className="w-3 h-3 rounded-full bg-emerald-500" />
        </div>
        <p className="text-sm text-gray-500 mt-1">
          Tablero de armado · {today}
        </p>

        {/* Envío / Retiro toggle */}
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => setEntregaFilter("envio")}
            className={`flex-1 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 ${
              entregaFilter === "envio"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            <Truck className="w-4 h-4" /> Envíos ({envioCount})
          </button>
          <button
            onClick={() => setEntregaFilter("retiro")}
            className={`flex-1 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 ${
              entregaFilter === "retiro"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            <ShoppingBag className="w-4 h-4" /> Retiros ({retiroCount})
          </button>
        </div>
      </div>

      {/* Mobile: estado tabs */}
      <div className="md:hidden border-b bg-white sticky top-[145px] z-30">
        <div className="flex overflow-x-auto px-2 gap-1 py-2">
          {ESTADO_TABS.map((tab) => {
            const count = byEstado(tab).length;
            return (
              <button
                key={tab}
                onClick={() => setEstadoTab(tab)}
                className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap ${
                  estadoTab === tab
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {ESTADO_LABELS[tab]} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Mobile: single column */}
      <div className="md:hidden p-4 space-y-3">
        {byEstado(estadoTab).length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-8">
            Sin pedidos en esta categoría
          </p>
        ) : (
          byEstado(estadoTab).map((p) => (
            <PedidoCard
              key={p.id}
              pedido={p}
              session={session}
              onUpdateEstado={handleUpdateEstado}
            />
          ))
        )}
      </div>

      {/* Desktop: 4-column grid */}
      <div className="hidden md:grid md:grid-cols-4 gap-4 p-4">
        {ESTADO_TABS.map((tab) => (
          <div key={tab}>
            <h3 className="font-semibold text-gray-700 text-sm mb-3 px-1">
              {ESTADO_LABELS[tab]} ({byEstado(tab).length})
            </h3>
            <div className="space-y-3">
              {byEstado(tab).map((p) => (
                <PedidoCard
                  key={p.id}
                  pedido={p}
                  session={session}
                  onUpdateEstado={handleUpdateEstado}
                />
              ))}
              {byEstado(tab).length === 0 && (
                <p className="text-center text-xs text-gray-400 py-6">
                  Sin pedidos
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/equipo/components/tablero-armado.tsx
git commit -m "feat(equipo): add tablero de armado with realtime updates and mobile tabs"
```

---

## Task 11: Main Equipo Page

**Files:**
- Create: `src/app/equipo/page.tsx`

- [ ] **Step 1: Wire up PIN → Tablero**

```typescript
"use client";

import { useState, useEffect } from "react";
import type { EquipoSession } from "@/types/equipo";
import { PinScreen } from "./components/pin-screen";
import { TableroArmado } from "./components/tablero-armado";

export default function EquipoPage() {
  const [session, setSession] = useState<EquipoSession | null>(null);
  const [ready, setReady] = useState(false);

  // Restore session from sessionStorage
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("equipo_session");
      if (stored) setSession(JSON.parse(stored));
    } catch {}
    setReady(true);
  }, []);

  const handleLogout = () => {
    sessionStorage.removeItem("equipo_session");
    setSession(null);
  };

  if (!ready) return null; // Avoid flash while checking sessionStorage

  if (!session) {
    return <PinScreen onAuth={setSession} />;
  }

  return <TableroArmado session={session} onLogout={handleLogout} />;
}
```

- [ ] **Step 2: Verify in browser**

Navigate to `http://localhost:3000/equipo`:
1. Should see PIN screen
2. Enter `1234` → should show Tablero for "Juan" (armador)
3. Close tab, reopen → should show PIN screen again (sessionStorage)

- [ ] **Step 3: Commit**

```bash
git add src/app/equipo/page.tsx
git commit -m "feat(equipo): add main page with PIN → Tablero routing"
```

---

## Task 12: Redesign `/ruta/[token]` Page

**Files:**
- Modify: `src/app/ruta/[token]/page.tsx` (complete rewrite, keep API)

- [ ] **Step 1: Rewrite the ruta page**

Complete redesign with: sticky header + progress bar, 4 summary cards, expandable stop cards with action buttons (call, WhatsApp, directions), payment form, auto-expand next stop, completion celebration.

The rewritten page keeps the exact same API calls (`GET /api/ruta/${token}` and `POST /api/ruta/${token}`) and interfaces. Only the visual layout changes.

```typescript
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { formatCurrency } from "@/lib/formatters";
import {
  Loader2, MapPin, Phone, MessageCircle, Navigation,
  Package, CheckCircle2, AlertCircle, ChevronDown,
  ChevronUp, PartyPopper,
} from "lucide-react";

interface Cuenta { id: string; nombre: string; alias: string; }
interface VentaItem { descripcion: string; cantidad: number; precio_unitario: number; subtotal: number; }
interface Cliente { id: string; nombre: string; domicilio: string | null; localidad: string | null; telefono: string | null; saldo: number; }
interface Venta { id: string; numero: string; tipo_comprobante: string; total: number; forma_pago: string; monto_pagado: number; clientes: Cliente; venta_items: VentaItem[]; }
interface HojaItem { id: string; orden: number; completado: boolean; completado_at: string | null; ventas: Venta; }
interface HojaData {
  hoja: { id: string; nombre: string; fecha: string; estado: string; modo_link: string; };
  items: HojaItem[];
  pagadoPorVenta: Record<string, number>;
  cuentasBancarias: Cuenta[];
  recargoTransferencia: number;
}

type MetodoPago = "Efectivo" | "Transferencia" | "Cuenta Corriente" | "Mixto";

export default function RutaPublicaPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<HojaData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Payment form state
  const [metodo, setMetodo] = useState<MetodoPago>("Efectivo");
  const [cuentaBancariaId, setCuentaBancariaId] = useState("");
  const [mixtoEf, setMixtoEf] = useState("");
  const [mixtoTr, setMixtoTr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/ruta/${token}`);
    if (!res.ok) {
      const j = await res.json();
      setError(j.error || "Error al cargar");
    } else {
      const d: HojaData = await res.json();
      setData(d);
      // Auto-expand first non-completed item
      const firstPending = d.items.find((i) => !i.completado);
      if (firstPending) setExpanded(firstPending.id);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const handleExpand = (itemId: string) => {
    if (expanded === itemId) {
      setExpanded(null);
    } else {
      setExpanded(itemId);
      setMetodo("Efectivo");
      setCuentaBancariaId("");
      setMixtoEf("");
      setMixtoTr("");
    }
  };

  const handleConfirmar = async (item: HojaItem) => {
    setSaving(item.id);
    const res = await fetch(`/api/ruta/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "confirmar", item_id: item.id, venta_ids: [item.ventas.id] }),
    });
    if (res.ok) {
      await load();
      setActionError(null);
    } else {
      setActionError("Error al confirmar la entrega");
    }
    setSaving(null);
  };

  const handleCobrar = async (item: HojaItem) => {
    if (!data) return;
    const pendiente = Math.max(0, item.ventas.total - (data.pagadoPorVenta[item.ventas.id] || 0));
    const cuenta = data.cuentasBancarias.find((c) => c.id === cuentaBancariaId);
    const cuentaNombre = cuenta ? `${cuenta.nombre}${cuenta.alias ? ` — ${cuenta.alias}` : ""}` : "";
    const recargo = data.recargoTransferencia ?? 0;
    const surcharge = metodo === "Transferencia" ? Math.round(pendiente * recargo) / 100 : 0;

    setSaving(item.id);
    const res = await fetch(`/api/ruta/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "cobrar",
        item_id: item.id,
        venta_ids: [item.ventas.id],
        cobro: {
          metodo,
          efectivo: metodo === "Mixto" ? Number(mixtoEf) || 0 : metodo === "Efectivo" ? pendiente : 0,
          transferencia: metodo === "Mixto" ? Number(mixtoTr) || 0 : metodo === "Transferencia" ? pendiente : 0,
          cuentaCorriente: metodo === "Cuenta Corriente" ? pendiente : 0,
          cuentaBancaria: cuentaNombre,
          surcharge,
        },
      }),
    });
    if (res.ok) {
      await load();
      setActionError(null);
    } else {
      setActionError("Error al registrar el cobro");
    }
    setSaving(null);
  };

  // Derived data
  const items = data?.items || [];
  const modoLink = data?.hoja.modo_link || "solo_ver";
  const entregadas = items.filter((i) => i.completado).length;
  const totalItems = items.length;
  const pct = totalItems > 0 ? Math.round((entregadas / totalItems) * 100) : 0;
  const allDone = totalItems > 0 && items.every((i) => i.completado);

  // Summary cards data
  const summary = useMemo(() => {
    if (!data) return { pendientes: 0, aCobrar: 0, efectivo: 0, transferencia: 0 };
    const pending = items.filter((i) => !i.completado);
    let aCobrar = 0;
    let efectivo = 0;
    let transferencia = 0;
    for (const item of pending) {
      const p = Math.max(0, item.ventas.total - (data.pagadoPorVenta[item.ventas.id] || 0));
      aCobrar += p;
      const fp = item.ventas.forma_pago;
      if (fp === "Efectivo") efectivo += p;
      else if (fp === "Transferencia") transferencia += p;
      else if (fp === "Mixto") { efectivo += p / 2; transferencia += p / 2; }
    }
    return { pendientes: pending.length, aCobrar, efectivo, transferencia };
  }, [data, items]);

  const fechaDisplay = data?.hoja.fecha
    ? new Date(data.hoja.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "";

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6 text-center">
      <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
      <h1 className="text-xl font-bold text-gray-800 mb-2">Link no disponible</h1>
      <p className="text-gray-500">{error}</p>
    </div>
  );

  if (!data) return null;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Sticky Header */}
      <div className="bg-white border-b px-4 py-4 sticky top-0 z-10 shadow-sm">
        <div className="max-w-xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-bold text-gray-900 text-lg">
                Dulce Sur · Ruta del día
              </h1>
              <p className="text-sm text-gray-500">
                {data.hoja.nombre || "Hoja de ruta"} · {fechaDisplay}
              </p>
            </div>
            <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
          </div>
          {/* Progress bar */}
          <div className="flex items-center gap-3 mt-3">
            <div className="flex-1 bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-emerald-500 h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-sm font-semibold text-gray-600 shrink-0 tabular-nums">
              {entregadas}/{totalItems}
            </span>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {actionError && (
        <div className="max-w-xl mx-auto mx-4 mt-3 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <span className="text-sm text-red-700 flex-1">{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-600 text-lg font-bold leading-none">&times;</button>
        </div>
      )}

      <div className="max-w-xl mx-auto p-4 space-y-4">
        {/* Summary cards (2x2) */}
        {!allDone && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl border p-3">
              <p className="text-xs text-gray-500 font-medium">Entregas</p>
              <p className="text-lg font-bold text-gray-900">{summary.pendientes} pendientes</p>
            </div>
            <div className="bg-white rounded-xl border p-3">
              <p className="text-xs text-gray-500 font-medium">A cobrar</p>
              <p className="text-lg font-bold text-gray-900">{formatCurrency(summary.aCobrar)}</p>
            </div>
            <div className="bg-white rounded-xl border p-3">
              <p className="text-xs text-gray-500 font-medium">Efectivo</p>
              <p className="text-lg font-bold text-gray-900">{formatCurrency(summary.efectivo)}</p>
            </div>
            <div className="bg-white rounded-xl border p-3">
              <p className="text-xs text-gray-500 font-medium">Transferencia</p>
              <p className="text-lg font-bold text-gray-900">{formatCurrency(summary.transferencia)}</p>
            </div>
          </div>
        )}

        {/* Completion celebration */}
        {allDone && (
          <div className="text-center py-12">
            <PartyPopper className="w-16 h-16 text-amber-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-800 mb-2">¡Ruta completada!</h2>
            <p className="text-gray-500">Todas las entregas fueron realizadas</p>
          </div>
        )}

        {/* Stop cards */}
        {items.map((item) => {
          const venta = item.ventas;
          const cliente = venta.clientes;
          const pendiente = Math.max(0, venta.total - (data.pagadoPorVenta[venta.id] || 0));
          const saldoAnterior = Math.max(0, (cliente?.saldo || 0) - (item.completado ? 0 : pendiente));
          const isExpanded = expanded === item.id;
          const telefono = cliente?.telefono?.replace(/\D/g, "") || "";
          const direccionCompleta = [cliente?.domicilio, cliente?.localidad].filter(Boolean).join(", ");

          return (
            <div
              key={item.id}
              className={`bg-white rounded-2xl border shadow-sm transition-all ${
                item.completado ? "opacity-50 border-emerald-200" : "border-gray-200"
              }`}
            >
              {/* Card header — always visible */}
              <button
                className="w-full text-left p-4"
                onClick={() => !item.completado && handleExpand(item.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                        item.completado
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {item.completado ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      ) : (
                        item.orden
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">
                        {cliente?.nombre || "Sin nombre"}
                      </p>
                      {direccionCompleta && (
                        <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="truncate">{direccionCompleta}</span>
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {item.completado ? (
                      <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                        Entregado
                      </span>
                    ) : (
                      <>
                        <p className="font-bold text-gray-900">{formatCurrency(pendiente)}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{venta.forma_pago}</p>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-gray-400 ml-auto mt-1" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-400 ml-auto mt-1" />
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Saldo anterior */}
                {!item.completado && saldoAnterior > 0 && (
                  <div className="mt-2 flex items-center gap-1.5 bg-orange-50 border border-orange-200 rounded-lg px-3 py-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                    <span className="text-xs text-orange-700 font-medium">
                      Saldo anterior pendiente: {formatCurrency(saldoAnterior)}
                    </span>
                  </div>
                )}
              </button>

              {/* Expanded panel */}
              {isExpanded && !item.completado && (
                <div className="border-t px-4 pb-4 space-y-4">
                  {/* Quick action buttons */}
                  <div className="flex gap-2 pt-3">
                    {telefono && (
                      <>
                        <a
                          href={`tel:${telefono}`}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-blue-50 text-blue-600 text-sm font-medium border border-blue-200"
                        >
                          <Phone className="w-4 h-4" /> Llamar
                        </a>
                        <a
                          href={`https://wa.me/${telefono}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-green-50 text-green-600 text-sm font-medium border border-green-200"
                        >
                          <MessageCircle className="w-4 h-4" /> WhatsApp
                        </a>
                      </>
                    )}
                    {direccionCompleta && (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccionCompleta)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-violet-50 text-violet-600 text-sm font-medium border border-violet-200"
                      >
                        <Navigation className="w-4 h-4" /> Cómo llegar
                      </a>
                    )}
                  </div>

                  {/* Products */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                      <Package className="w-3 h-3" /> Productos
                    </p>
                    <div className="space-y-1">
                      {venta.venta_items.map((vi, idx) => (
                        <div key={idx} className="flex justify-between text-sm text-gray-700">
                          <span>{vi.cantidad}x {vi.descripcion}</span>
                          <span className="shrink-0 ml-2">{formatCurrency(vi.subtotal)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="border-t mt-2 pt-2 flex justify-between font-semibold text-sm">
                      <span>Total</span>
                      <span>{formatCurrency(venta.total)}</span>
                    </div>
                  </div>

                  {/* Payment actions */}
                  {modoLink === "solo_ver" && (
                    <p className="text-xs text-gray-400 text-center py-2">
                      Modo solo lectura — el cobro lo registra el administrador
                    </p>
                  )}

                  {modoLink === "confirmar" && (
                    <button
                      onClick={() => handleConfirmar(item)}
                      disabled={saving === item.id}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2"
                    >
                      {saving === item.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                      Confirmar entrega
                    </button>
                  )}

                  {modoLink === "confirmar_cobrar" && (
                    <div className="space-y-3">
                      {/* Payment method selector */}
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                          Forma de pago
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          {(["Efectivo", "Transferencia", "Mixto", "Cuenta Corriente"] as MetodoPago[]).map(
                            (m) => (
                              <button
                                key={m}
                                type="button"
                                onClick={() => setMetodo(m)}
                                className={`py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                                  metodo === m
                                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                                    : "border-gray-200 text-gray-500"
                                }`}
                              >
                                {m === "Cuenta Corriente" ? "Cta. Cte." : m}
                              </button>
                            )
                          )}
                        </div>
                      </div>

                      {/* Mixto inputs */}
                      {metodo === "Mixto" && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-gray-500">Efectivo</label>
                            <input
                              type="number"
                              value={mixtoEf}
                              onChange={(e) => setMixtoEf(e.target.value)}
                              className="w-full border rounded-xl px-3 py-2.5 text-sm mt-1"
                              placeholder="0"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">Transferencia</label>
                            <input
                              type="number"
                              value={mixtoTr}
                              onChange={(e) => setMixtoTr(e.target.value)}
                              className="w-full border rounded-xl px-3 py-2.5 text-sm mt-1"
                              placeholder="0"
                            />
                          </div>
                        </div>
                      )}

                      {/* Bank account selector */}
                      {(metodo === "Transferencia" || (metodo === "Mixto" && Number(mixtoTr) > 0)) &&
                        data.cuentasBancarias.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                              Cuenta bancaria
                            </p>
                            <div className="space-y-1.5">
                              {data.cuentasBancarias.map((c) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => setCuentaBancariaId(c.id)}
                                  className={`w-full text-left px-3 py-2.5 rounded-xl border-2 text-sm transition-all ${
                                    cuentaBancariaId === c.id
                                      ? "border-emerald-500 bg-emerald-50"
                                      : "border-gray-200"
                                  }`}
                                >
                                  <span className="font-medium">{c.nombre}</span>
                                  {c.alias && <span className="text-xs text-gray-400 ml-1">— {c.alias}</span>}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                      {/* Surcharge notice */}
                      {data.recargoTransferencia > 0 &&
                        (metodo === "Transferencia" || (metodo === "Mixto" && Number(mixtoTr) > 0)) && (
                          <p className="text-xs text-violet-600 bg-violet-50 rounded-xl px-3 py-2">
                            Recargo transferencia {data.recargoTransferencia}% incluido
                          </p>
                        )}

                      {/* Confirm button */}
                      <button
                        onClick={() => handleCobrar(item)}
                        disabled={
                          saving === item.id ||
                          ((metodo === "Transferencia" || (metodo === "Mixto" && Number(mixtoTr) > 0)) &&
                            !cuentaBancariaId &&
                            data.cuentasBancarias.length > 0)
                        }
                        className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2"
                      >
                        {saving === item.id ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-5 h-5" />
                        )}
                        Confirmar cobro — {formatCurrency(pendiente)}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Floating "Next stop" button */}
      {!allDone && modoLink !== "solo_ver" && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-gray-50 via-gray-50 to-transparent">
          <div className="max-w-xl mx-auto">
            <button
              onClick={() => {
                const next = items.find((i) => !i.completado);
                if (next) {
                  handleExpand(next.id);
                  document.getElementById(`stop-${next.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                }
              }}
              className="w-full bg-gray-900 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg"
            >
              Siguiente parada →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Important:** Add `id={`stop-${item.id}`}` to each card's outer `<div>` for the scroll-to behavior. In the card element, change:
```
<div key={item.id} className={...}>
```
to:
```
<div key={item.id} id={`stop-${item.id}`} className={...}>
```

- [ ] **Step 2: Verify in browser**

If you have an existing hoja_ruta with a token_fijo, navigate to `http://localhost:3000/ruta/{token}` and verify:
1. Sticky header with progress bar
2. Summary cards showing pending count and amounts
3. First pending item auto-expanded
4. Quick action buttons (call, WhatsApp, directions)
5. Payment flow works same as before
6. "Next stop" floating button

- [ ] **Step 3: Commit**

```bash
git add src/app/ruta/[token]/page.tsx
git commit -m "feat(ruta): redesign delivery route page with summary cards and quick actions"
```

---

## Task 13: Admin Team Management Page

**Files:**
- Create: `src/app/(admin)/admin/equipo/page.tsx`

- [ ] **Step 1: Build the admin CRUD page**

Simple table with add/edit/deactivate modals for team members.

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, Pencil, EyeOff, Eye, Loader2, Users } from "lucide-react";
import type { Equipo } from "@/types/equipo";

export default function EquipoAdminPage() {
  const [miembros, setMiembros] = useState<Equipo[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ nombre: "", pin: "", rol: "armador" as Equipo["rol"] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMiembros = useCallback(async () => {
    const { data } = await supabase
      .from("equipo")
      .select("*")
      .order("created_at", { ascending: false });
    setMiembros(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchMiembros(); }, [fetchMiembros]);

  const openAdd = () => {
    setEditingId(null);
    setForm({ nombre: "", pin: "", rol: "armador" });
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (m: Equipo) => {
    setEditingId(m.id);
    setForm({ nombre: m.nombre, pin: m.pin, rol: m.rol });
    setError(null);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.nombre.trim()) { setError("Nombre requerido"); return; }
    if (!form.pin || form.pin.length !== 4 || !/^\d{4}$/.test(form.pin)) {
      setError("PIN debe ser 4 dígitos");
      return;
    }

    // Check PIN uniqueness
    const existing = miembros.find((m) => m.pin === form.pin && m.id !== editingId);
    if (existing) { setError("Este PIN ya está en uso"); return; }

    setSaving(true);
    setError(null);

    if (editingId) {
      await supabase.from("equipo").update({
        nombre: form.nombre.trim(),
        pin: form.pin,
        rol: form.rol,
      }).eq("id", editingId);
    } else {
      await supabase.from("equipo").insert({
        nombre: form.nombre.trim(),
        pin: form.pin,
        rol: form.rol,
      });
    }

    setSaving(false);
    setModalOpen(false);
    await fetchMiembros();
  };

  const toggleActivo = async (m: Equipo) => {
    await supabase.from("equipo").update({ activo: !m.activo }).eq("id", m.id);
    await fetchMiembros();
  };

  const rolLabel = (rol: string) => {
    switch (rol) {
      case "armador": return "Armador";
      case "repartidor": return "Repartidor";
      case "admin": return "Admin";
      default: return rol;
    }
  };

  const rolColor = (rol: string) => {
    switch (rol) {
      case "armador": return "bg-amber-100 text-amber-700";
      case "repartidor": return "bg-blue-100 text-blue-700";
      case "admin": return "bg-violet-100 text-violet-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-6 h-6" /> Equipo
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Gestión de armadores y repartidores
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800"
        >
          <Plus className="w-4 h-4" /> Agregar
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nombre</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Rol</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">PIN</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Estado</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {miembros.map((m) => (
                <tr key={m.id} className={`border-b last:border-b-0 ${!m.activo ? "opacity-50" : ""}`}>
                  <td className="px-4 py-3 font-medium text-gray-900">{m.nombre}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${rolColor(m.rol)}`}>
                      {rolLabel(m.rol)}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-500">****</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${m.activo ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                      {m.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button onClick={() => openEdit(m)} className="text-gray-400 hover:text-gray-700">
                      <Pencil className="w-4 h-4 inline" />
                    </button>
                    <button onClick={() => toggleActivo(m)} className="text-gray-400 hover:text-gray-700">
                      {m.activo ? <EyeOff className="w-4 h-4 inline" /> : <Eye className="w-4 h-4 inline" />}
                    </button>
                  </td>
                </tr>
              ))}
              {miembros.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    No hay miembros del equipo. Agregá uno para comenzar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
            <h3 className="font-bold text-gray-900 text-lg">
              {editingId ? "Editar miembro" : "Agregar miembro"}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-600 block mb-1">Nombre</label>
                <input
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Nombre del empleado"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-600 block mb-1">PIN (4 dígitos)</label>
                <input
                  value={form.pin}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                    setForm({ ...form, pin: v });
                  }}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="1234"
                  maxLength={4}
                  inputMode="numeric"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-600 block mb-1">Rol</label>
                <select
                  value={form.rol}
                  onChange={(e) => setForm({ ...form, rol: e.target.value as Equipo["rol"] })}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="armador">Armador</option>
                  <option value="repartidor">Repartidor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => setModalOpen(false)}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-600 font-medium text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-gray-900 text-white font-medium text-sm flex items-center justify-center gap-1.5"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingId ? "Guardar" : "Agregar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/(admin)/admin/equipo/page.tsx"
git commit -m "feat(equipo): add admin team management page"
```

---

## Task 14: Sidebar Navigation + Hoja de Ruta Button

**Files:**
- Modify: `src/components/sidebar.tsx`
- Modify: `src/app/(admin)/admin/ventas/hoja-ruta/page.tsx`

- [ ] **Step 1: Add "Equipo" to sidebar navigation**

In `src/components/sidebar.tsx`, find the `navigation` array and add the Equipo entry. Add the `UsersRound` import from lucide-react.

Add import:
```typescript
import { ..., UsersRound } from "lucide-react";
```

Add to navigation array — after the Stock entry and before Reportes:
```typescript
  { name: "Equipo", href: "/admin/equipo", icon: UsersRound },
```

- [ ] **Step 2: Add "Tablero de armado" button to hoja-ruta page**

In `src/app/(admin)/admin/ventas/hoja-ruta/page.tsx`, find the area where the "Guardar y Compartir" button is (in the "Entregas Pendientes" tab). Add a button next to it:

Add `Package` to the lucide-react imports if not already imported.
Add `useRouter` from `next/navigation` if not already imported.

Add button (find the appropriate location near the "Guardar y Compartir" button):
```tsx
<Button
  variant="outline"
  size="sm"
  onClick={() => window.open("/equipo", "_blank")}
>
  <Package className="w-4 h-4 mr-1.5" />
  Tablero de armado
</Button>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/sidebar.tsx "src/app/(admin)/admin/ventas/hoja-ruta/page.tsx"
git commit -m "feat(equipo): add sidebar nav item and tablero button in hoja-ruta"
```

---

## Task 15: Integration — Orden Entrega in Hoja de Ruta

**Files:**
- Modify: `src/app/api/equipo/pedidos/[ventaId]/route.ts`
- Modify: `src/app/(admin)/admin/ventas/hoja-ruta/page.tsx`

- [ ] **Step 1: Auto-assign orden_entrega when admin approves**

In `src/app/api/equipo/pedidos/[ventaId]/route.ts`, when estado='listo' and metodo_entrega is envio/envio_a_domicilio, calculate the next available `orden_entrega`:

Add this block inside the `if (estado === "listo")` section, before the notification code:

```typescript
// For envio orders, assign next available orden_entrega
const ventaData = (venta as any);
if (ventaData?.metodo_entrega && ["envio", "envio_a_domicilio"].includes(ventaData.metodo_entrega)) {
  // Get max existing orden_entrega for today
  const { data: maxOrden } = await supabase
    .from("pedido_armado")
    .select("orden_entrega")
    .not("orden_entrega", "is", null)
    .order("orden_entrega", { ascending: false })
    .limit(1)
    .single();

  const nextOrden = (maxOrden?.orden_entrega || 0) + 1;
  await supabase
    .from("pedido_armado")
    .update({ orden_entrega: nextOrden })
    .eq("venta_id", ventaId);
}
```

Note: The venta data is already fetched earlier in the same `if (estado === "listo")` block. Adjust the variable name to match what's available in scope. If the venta select doesn't include `metodo_entrega`, add it to the select.

- [ ] **Step 2: Join pedido_armado in hoja-ruta fetchVentas**

In `src/app/(admin)/admin/ventas/hoja-ruta/page.tsx`, in the `fetchVentas` function, modify the query to LEFT JOIN with `pedido_armado`:

Find the existing ventas query and add `pedido_armado ( orden_entrega, estado )` to the select. Then use `pedido_armado.orden_entrega` in the sort when available.

This is a targeted change — look for where ventas are fetched and sorted, and integrate the `orden_entrega` as a sort key when the admin creates the hoja de ruta. Approved orders from the tablero should appear in the order they were approved.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/equipo/pedidos/[ventaId]/route.ts" "src/app/(admin)/admin/ventas/hoja-ruta/page.tsx"
git commit -m "feat(equipo): auto-assign delivery order and integrate with hoja de ruta"
```

---

## Task 16: Final Verification

- [ ] **Step 1: Verify /equipo flow end-to-end**

1. Go to `/equipo` → enter PIN `1234` → see tablero as armador "Juan"
2. If there are today's ventas with envio/retiro, they should appear as "Pendiente"
3. Click "Tomar pedido" → card moves to "Armando"
4. Click "Marcar como armado" → enter optional note → card moves to "Armado"
5. Log out, enter admin PIN → see "Aprobar" button on armado cards
6. Click "Aprobar" → card moves to "Listo"

- [ ] **Step 2: Verify /ruta/[token] redesign**

1. Open an existing hoja de ruta link
2. Verify sticky header with progress bar
3. Verify summary cards (entregas, a cobrar, efectivo, transferencia)
4. First pending item auto-expanded
5. Quick action buttons (llamar, WhatsApp, cómo llegar)
6. Payment flow works correctly
7. Completion celebration when all done

- [ ] **Step 3: Verify admin pages**

1. Go to `/admin/equipo` → see team members table
2. Add a new member → verify it appears
3. Edit a member → verify changes saved
4. Deactivate a member → verify shown as inactive
5. Check sidebar has "Equipo" link
6. Check "Tablero de armado" button in hoja de ruta page

- [ ] **Step 4: Final commit and push**

```bash
git push origin main
```

---

## Summary of All Files

| # | Action | File |
|---|--------|------|
| 1 | SQL | `equipo` table in Supabase |
| 2 | SQL | `pedido_armado` table in Supabase |
| 3 | Create | `src/types/equipo.ts` |
| 4 | Modify | `src/types/database.ts` |
| 5 | Create | `src/app/api/equipo/auth/route.ts` |
| 6 | Create | `src/app/api/equipo/pedidos/route.ts` |
| 7 | Create | `src/app/api/equipo/pedidos/[ventaId]/route.ts` |
| 8 | Create | `src/app/equipo/layout.tsx` |
| 9 | Create | `src/app/equipo/page.tsx` |
| 10 | Create | `src/app/equipo/components/pin-screen.tsx` |
| 11 | Create | `src/app/equipo/components/tablero-armado.tsx` |
| 12 | Create | `src/app/equipo/components/pedido-card.tsx` |
| 13 | Create | `src/app/equipo/components/notas-modal.tsx` |
| 14 | Rewrite | `src/app/ruta/[token]/page.tsx` |
| 15 | Create | `src/app/(admin)/admin/equipo/page.tsx` |
| 16 | Modify | `src/components/sidebar.tsx` |
| 17 | Modify | `src/app/(admin)/admin/ventas/hoja-ruta/page.tsx` |
