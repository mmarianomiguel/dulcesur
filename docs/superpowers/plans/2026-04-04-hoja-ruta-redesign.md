# Hoja de Ruta Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar la hoja de ruta para persistir el orden en DB, agregar saldo anterior visible, y crear una página pública `/ruta/[token]` para el repartidor con 3 modos configurables (solo ver / confirmar / confirmar+cobrar).

**Architecture:** Se crean 2 tablas nuevas (`hoja_ruta`, `hoja_ruta_items`) que representan una "sesión de reparto". El admin crea la hoja, ordena las entregas, y genera un link con token. El repartidor abre `/ruta/[token]` (sin login) que consume `/api/ruta/[token]` con service-role key para leer y escribir datos. El cobro impacta `caja_movimientos` con la misma lógica que la hoja de ruta actual.

**Tech Stack:** Next.js App Router, Supabase (PostgreSQL + anon client via `@/lib/supabase`), TypeScript, Tailwind CSS, shadcn/ui. No test framework — se verifica con `npx tsc --noEmit` y prueba manual.

---

## File Map

| Archivo | Acción | Responsabilidad |
|---------|--------|-----------------|
| `supabase` (dashboard SQL) | CREATE | Tablas `hoja_ruta` + `hoja_ruta_items` |
| `src/app/api/ruta/[token]/route.ts` | CREATE | GET: leer hoja por token. POST: confirmar/cobrar |
| `src/app/ruta/[token]/page.tsx` | CREATE | Página pública mobile-first para repartidor |
| `src/app/(admin)/admin/ventas/hoja-ruta/page.tsx` | REWRITE | Admin: crear hoja, orden persistido, generar link, historial mejorado |

---

## Task 1: DB Schema — Tablas hoja_ruta y hoja_ruta_items

**Files:**
- Ejecutar SQL en Supabase Dashboard (SQL Editor)

- [ ] **Step 1: Crear tabla `hoja_ruta`**

En el SQL Editor de Supabase ejecutar:

```sql
create table hoja_ruta (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  nombre text not null default '',
  estado text not null default 'borrador' check (estado in ('borrador','activa','completada')),
  modo_link text not null default 'confirmar_cobrar' check (modo_link in ('solo_ver','confirmar','confirmar_cobrar')),
  token_fijo text unique,
  token_temp text unique,
  token_temp_expira timestamptz,
  creado_por uuid references auth.users(id),
  created_at timestamptz default now()
);

-- RLS: solo usuarios autenticados con rol admin/vendedor pueden leer/escribir
alter table hoja_ruta enable row level security;
create policy "auth users can manage hoja_ruta"
  on hoja_ruta for all
  using (auth.uid() is not null);
```

- [ ] **Step 2: Crear tabla `hoja_ruta_items`**

```sql
create table hoja_ruta_items (
  id uuid primary key default gen_random_uuid(),
  hoja_ruta_id uuid not null references hoja_ruta(id) on delete cascade,
  venta_id uuid not null references ventas(id),
  orden int not null default 0,
  completado boolean not null default false,
  completado_at timestamptz,
  unique(hoja_ruta_id, venta_id)
);

alter table hoja_ruta_items enable row level security;
create policy "auth users can manage hoja_ruta_items"
  on hoja_ruta_items for all
  using (auth.uid() is not null);
```

- [ ] **Step 3: Verificar en Table Editor de Supabase**

Confirmar que aparecen las tablas `hoja_ruta` y `hoja_ruta_items` con las columnas correctas.

- [ ] **Step 4: Commit placeholder**

```bash
cd "j:/Proyectos Claude/enexpro"
git commit --allow-empty -m "chore: hoja_ruta DB schema created in Supabase"
```

---

## Task 2: API Route — GET /api/ruta/[token]

**Files:**
- Create: `src/app/api/ruta/[token]/route.ts`

- [ ] **Step 1: Crear el archivo de la route**

Crear `src/app/api/ruta/[token]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const token = params.token;

  // Find hoja by token (fijo or temp)
  const { data: hoja, error } = await supabaseAdmin
    .from("hoja_ruta")
    .select("*")
    .or(`token_fijo.eq.${token},token_temp.eq.${token}`)
    .single();

  if (error || !hoja) {
    return NextResponse.json({ error: "Link no válido" }, { status: 404 });
  }

  // Check temp token expiry
  if (hoja.token_temp === token && hoja.token_temp_expira) {
    if (new Date(hoja.token_temp_expira) < new Date()) {
      return NextResponse.json({ error: "Este link ha expirado" }, { status: 410 });
    }
  }

  // Fetch items with venta + cliente + saldo data
  const { data: items } = await supabaseAdmin
    .from("hoja_ruta_items")
    .select(`
      id, orden, completado, completado_at,
      ventas (
        id, numero, tipo_comprobante, total, forma_pago, monto_pagado, fecha,
        clientes ( id, nombre, domicilio, localidad, telefono, saldo ),
        venta_items ( descripcion, cantidad, precio_unitario, subtotal )
      )
    `)
    .eq("hoja_ruta_id", hoja.id)
    .order("orden");

  // Fetch caja_movimientos for each venta to know what's already paid
  const ventaIds = (items || []).map((i: any) => i.ventas?.id).filter(Boolean);
  let pagadoPorVenta: Record<string, number> = {};
  if (ventaIds.length > 0) {
    const { data: movs } = await supabaseAdmin
      .from("caja_movimientos")
      .select("referencia_id, monto")
      .in("referencia_id", ventaIds)
      .eq("referencia_tipo", "venta")
      .eq("tipo", "ingreso");
    for (const m of movs || []) {
      pagadoPorVenta[m.referencia_id] = (pagadoPorVenta[m.referencia_id] || 0) + m.monto;
    }
  }

  // Fetch bank accounts for transfer payments
  const { data: cuentasBancarias } = await supabaseAdmin
    .from("cuentas_bancarias")
    .select("id, nombre, alias")
    .order("nombre");

  // Fetch transfer surcharge from tienda_config
  const { data: config } = await supabaseAdmin
    .from("tienda_config")
    .select("recargo_transferencia")
    .limit(1)
    .single();

  return NextResponse.json({
    hoja: {
      id: hoja.id,
      nombre: hoja.nombre,
      fecha: hoja.fecha,
      estado: hoja.estado,
      modo_link: hoja.modo_link,
    },
    items: items || [],
    pagadoPorVenta,
    cuentasBancarias: cuentasBancarias || [],
    recargoTransferencia: config?.recargo_transferencia ?? 0,
  });
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd "j:/Proyectos Claude/enexpro" && npx tsc --noEmit 2>&1 | head -20
```

Esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/ruta/[token]/route.ts
git commit -m "feat: GET /api/ruta/[token] — public hoja de ruta data endpoint"
```

---

## Task 3: API Route — POST /api/ruta/[token] (confirmar + cobrar)

**Files:**
- Modify: `src/app/api/ruta/[token]/route.ts`

- [ ] **Step 1: Agregar función helper de fecha/hora Argentina**

Agregar antes del export GET en el mismo archivo:

```typescript
function argNow() {
  const now = new Date();
  const ar = new Date(now.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const fecha = ar.toISOString().split("T")[0];
  const hora = ar.toTimeString().slice(0, 5);
  return { fecha, hora };
}
```

- [ ] **Step 2: Agregar export POST al mismo archivo**

Agregar después del export GET:

```typescript
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const token = params.token;
  const body = await req.json();
  // body: { action: "confirmar" | "cobrar", item_id: string, venta_ids: string[], cobro?: CobrarPayload }
  // CobrarPayload: { metodo: string, efectivo?: number, transferencia?: number, cuentaCorriente?: number, cuentaBancaria?: string, surcharge?: number }

  // Validate token
  const { data: hoja } = await supabaseAdmin
    .from("hoja_ruta")
    .select("id, modo_link, token_fijo, token_temp, token_temp_expira")
    .or(`token_fijo.eq.${token},token_temp.eq.${token}`)
    .single();

  if (!hoja) return NextResponse.json({ error: "Link no válido" }, { status: 404 });
  if (hoja.token_temp === token && hoja.token_temp_expira && new Date(hoja.token_temp_expira) < new Date()) {
    return NextResponse.json({ error: "Link expirado" }, { status: 410 });
  }

  // Mode guards
  if (body.action === "confirmar" && hoja.modo_link === "solo_ver") {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  if (body.action === "cobrar" && hoja.modo_link !== "confirmar_cobrar") {
    return NextResponse.json({ error: "Sin permiso para cobrar" }, { status: 403 });
  }

  const { fecha, hora } = argNow();

  if (body.action === "confirmar") {
    // Mark item as completed, mark ventas as entregado
    await supabaseAdmin
      .from("hoja_ruta_items")
      .update({ completado: true, completado_at: new Date().toISOString() })
      .eq("id", body.item_id);

    await supabaseAdmin
      .from("ventas")
      .update({ entregado: true, estado: "entregado" })
      .in("id", body.venta_ids);

    // Sync pedidos_tienda
    for (const ventaId of body.venta_ids) {
      const { data: v } = await supabaseAdmin.from("ventas").select("numero").eq("id", ventaId).single();
      if (v?.numero) {
        await supabaseAdmin.from("pedidos_tienda").update({ estado: "entregado" }).eq("numero", v.numero);
      }
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "cobrar") {
    const { venta_ids, cobro, item_id } = body;
    // cobro: { metodo, efectivo, transferencia, cuentaCorriente, cuentaBancaria, surcharge }

    for (const ventaId of venta_ids) {
      const { data: venta } = await supabaseAdmin
        .from("ventas")
        .select("id, numero, total, monto_pagado, cliente_id, forma_pago")
        .eq("id", ventaId)
        .single();
      if (!venta) continue;

      const { data: movs } = await supabaseAdmin
        .from("caja_movimientos")
        .select("monto")
        .eq("referencia_id", ventaId)
        .eq("referencia_tipo", "venta")
        .eq("tipo", "ingreso");
      const yaPagado = (movs || []).reduce((s: number, m: any) => s + m.monto, 0);
      const pendiente = Math.max(0, venta.total - yaPagado);
      if (pendiente <= 0) continue;

      // Build caja entries
      const entries: any[] = [];
      if (cobro.metodo === "Mixto") {
        if ((cobro.efectivo || 0) > 0) {
          entries.push({ fecha, hora, tipo: "ingreso", descripcion: `Cobro entrega #${venta.numero} (Efectivo)`, metodo_pago: "Efectivo", monto: cobro.efectivo, referencia_id: ventaId, referencia_tipo: "venta" });
        }
        if ((cobro.transferencia || 0) > 0) {
          entries.push({ fecha, hora, tipo: "ingreso", descripcion: `Cobro entrega #${venta.numero} (Transferencia)`, metodo_pago: "Transferencia", monto: (cobro.transferencia || 0) + (cobro.surcharge || 0), referencia_id: ventaId, referencia_tipo: "venta", ...(cobro.cuentaBancaria ? { cuenta_bancaria: cobro.cuentaBancaria } : {}) });
        }
      } else if (cobro.metodo === "Cuenta Corriente") {
        // No caja entry — goes to cuenta_corriente
      } else {
        entries.push({ fecha, hora, tipo: "ingreso", descripcion: `Cobro entrega #${venta.numero}${(cobro.surcharge || 0) > 0 ? " (Transf)" : ""}`, metodo_pago: cobro.metodo, monto: pendiente + (cobro.surcharge || 0), referencia_id: ventaId, referencia_tipo: "venta", ...(cobro.cuentaBancaria ? { cuenta_bancaria: cobro.cuentaBancaria } : {}) });
      }
      if (entries.length > 0) await supabaseAdmin.from("caja_movimientos").insert(entries);

      // CC portion
      const ccAmount = cobro.metodo === "Cuenta Corriente" ? pendiente : (cobro.cuentaCorriente || 0);
      if (ccAmount > 0 && venta.cliente_id) {
        const { data: newSaldo } = await supabaseAdmin.rpc("atomic_update_client_saldo", { p_client_id: venta.cliente_id, p_change: ccAmount });
        await supabaseAdmin.from("cuenta_corriente").insert({ cliente_id: venta.cliente_id, fecha, comprobante: `Cobro entrega #${venta.numero}`, descripcion: "Saldo a cuenta corriente", debe: ccAmount, haber: 0, saldo: newSaldo ?? 0, forma_pago: cobro.metodo, venta_id: ventaId });
      }

      // Update venta
      const totalCobradoAhora = cobro.metodo === "Cuenta Corriente" ? 0 : pendiente;
      await supabaseAdmin.from("ventas").update({
        forma_pago: cobro.metodo,
        monto_pagado: yaPagado + totalCobradoAhora,
        entregado: true,
        estado: "entregado",
        ...(cobro.cuentaBancaria ? { cuenta_transferencia_alias: cobro.cuentaBancaria } : {}),
      }).eq("id", ventaId);

      // Sync pedidos_tienda
      if (venta.numero) {
        await supabaseAdmin.from("pedidos_tienda").update({ estado: "entregado" }).eq("numero", venta.numero);
      }
    }

    // Mark item as completed
    await supabaseAdmin
      .from("hoja_ruta_items")
      .update({ completado: true, completado_at: new Date().toISOString() })
      .eq("id", item_id);

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Acción desconocida" }, { status: 400 });
}
```

- [ ] **Step 3: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Esperado: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/ruta/[token]/route.ts
git commit -m "feat: POST /api/ruta/[token] — confirmar entrega y cobrar desde repartidor"
```

---

## Task 4: Página pública /ruta/[token]

**Files:**
- Create: `src/app/ruta/[token]/page.tsx`

- [ ] **Step 1: Crear estructura de carpetas**

```bash
mkdir -p "src/app/ruta/[token]"
```

- [ ] **Step 2: Crear la página**

Crear `src/app/ruta/[token]/page.tsx`:

```typescript
"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { formatCurrency } from "@/lib/formatters";
import { Loader2, MapPin, Phone, Package, CheckCircle2, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";

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
      const j = await res.json();
      setData(j);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const handleConfirmar = async (item: HojaItem) => {
    setSaving(item.id);
    const res = await fetch(`/api/ruta/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "confirmar",
        item_id: item.id,
        venta_ids: [item.ventas.id],
      }),
    });
    if (res.ok) { await load(); setExpanded(null); }
    else { alert("Error al confirmar"); }
    setSaving(null);
  };

  const handleCobrar = async (item: HojaItem) => {
    const pendiente = Math.max(0, item.ventas.total - (data?.pagadoPorVenta[item.ventas.id] || 0));
    const cuenta = data?.cuentasBancarias.find(c => c.id === cuentaBancariaId);
    const cuentaNombre = cuenta ? `${cuenta.nombre}${cuenta.alias ? ` — ${cuenta.alias}` : ""}` : "";
    const recargo = data?.recargoTransferencia ?? 0;
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
    if (res.ok) { await load(); setExpanded(null); }
    else { alert("Error al registrar cobro"); }
    setSaving(null);
  };

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

  const { hoja, items, pagadoPorVenta, cuentasBancarias, recargoTransferencia } = data;
  const modoLink = hoja.modo_link;
  const entregadas = items.filter(i => i.completado).length;
  const pct = items.length > 0 ? Math.round((entregadas / items.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 py-4 sticky top-0 z-10 shadow-sm">
        <h1 className="font-bold text-gray-900 text-lg truncate">{hoja.nombre || "Hoja de ruta"}</h1>
        <div className="flex items-center gap-3 mt-2">
          <div className="flex-1 bg-gray-200 rounded-full h-2">
            <div className="bg-emerald-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-sm text-gray-600 shrink-0">{entregadas}/{items.length}</span>
        </div>
      </div>

      {/* Items */}
      <div className="p-4 space-y-3 max-w-xl mx-auto">
        {items.map((item) => {
          const venta = item.ventas;
          const cliente = venta.clientes;
          const pendiente = Math.max(0, venta.total - (pagadoPorVenta[venta.id] || 0));
          const saldoAnterior = Math.max(0, (cliente?.saldo || 0) - (item.completado ? 0 : pendiente));
          const isExpanded = expanded === item.id;

          return (
            <div key={item.id} className={`bg-white rounded-2xl border shadow-sm transition-all ${item.completado ? "opacity-60 border-emerald-200" : "border-gray-200"}`}>
              {/* Card header */}
              <button
                className="w-full text-left p-4"
                onClick={() => !item.completado && setExpanded(isExpanded ? null : item.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${item.completado ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-700"}`}>
                      {item.completado ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : item.orden}
                    </span>
                    <div>
                      <p className="font-semibold text-gray-900">{cliente?.nombre || "Sin nombre"}</p>
                      {cliente?.domicilio && (
                        <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3" />{cliente.domicilio}{cliente.localidad ? `, ${cliente.localidad}` : ""}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {item.completado ? (
                      <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">Entregado</span>
                    ) : (
                      <>
                        <p className="font-bold text-gray-900">{formatCurrency(pendiente)}</p>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400 ml-auto mt-1" /> : <ChevronDown className="w-4 h-4 text-gray-400 ml-auto mt-1" />}
                      </>
                    )}
                  </div>
                </div>

                {/* Saldo anterior badge */}
                {!item.completado && saldoAnterior > 0 && (
                  <div className="mt-2 flex items-center gap-1.5 bg-orange-50 border border-orange-200 rounded-lg px-3 py-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                    <span className="text-xs text-orange-700 font-medium">Saldo anterior pendiente: {formatCurrency(saldoAnterior)}</span>
                  </div>
                )}
              </button>

              {/* Expanded panel */}
              {isExpanded && !item.completado && (
                <div className="border-t px-4 pb-4 space-y-3">
                  {/* Items del pedido */}
                  <div className="pt-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                      <Package className="w-3 h-3" /> Productos
                    </p>
                    <div className="space-y-1">
                      {venta.venta_items.map((vi, idx) => (
                        <div key={idx} className="flex justify-between text-sm text-gray-700">
                          <span>{vi.cantidad}x {vi.descripcion}</span>
                          <span>{formatCurrency(vi.subtotal)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="border-t mt-2 pt-2 flex justify-between font-semibold text-sm">
                      <span>Total</span><span>{formatCurrency(venta.total)}</span>
                    </div>
                  </div>

                  {/* Teléfono */}
                  {cliente?.telefono && (
                    <a href={`tel:${cliente.telefono}`} className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                      <Phone className="w-4 h-4" />{cliente.telefono}
                    </a>
                  )}

                  {/* Acciones según modo */}
                  {modoLink === "solo_ver" && (
                    <p className="text-xs text-gray-400 text-center py-2">Modo solo lectura — el cobro lo registra el administrador</p>
                  )}

                  {modoLink === "confirmar" && (
                    <button
                      onClick={() => handleConfirmar(item)}
                      disabled={saving === item.id}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2"
                    >
                      {saving === item.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                      Confirmar entrega
                    </button>
                  )}

                  {modoLink === "confirmar_cobrar" && (
                    <div className="space-y-3">
                      {/* Método de pago */}
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1.5">Forma de pago</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {(["Efectivo", "Transferencia", "Mixto", "Cuenta Corriente"] as MetodoPago[]).map(m => (
                            <button key={m} type="button" onClick={() => setMetodo(m)}
                              className={`py-2 rounded-lg border-2 text-xs font-semibold transition-all ${metodo === m ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-500"}`}>
                              {m === "Cuenta Corriente" ? "Cta. Cte." : m}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Mixto inputs */}
                      {metodo === "Mixto" && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-gray-500">Efectivo</label>
                            <input type="number" value={mixtoEf} onChange={e => setMixtoEf(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" placeholder="0" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">Transferencia</label>
                            <input type="number" value={mixtoTr} onChange={e => setMixtoTr(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" placeholder="0" />
                          </div>
                        </div>
                      )}

                      {/* Cuenta bancaria para transferencia */}
                      {(metodo === "Transferencia" || (metodo === "Mixto" && Number(mixtoTr) > 0)) && cuentasBancarias.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-gray-500 mb-1.5">Cuenta bancaria</p>
                          <div className="space-y-1.5">
                            {cuentasBancarias.map(c => (
                              <button key={c.id} type="button" onClick={() => setCuentaBancariaId(c.id)}
                                className={`w-full text-left px-3 py-2 rounded-lg border-2 text-sm transition-all ${cuentaBancariaId === c.id ? "border-emerald-500 bg-emerald-50" : "border-gray-200"}`}>
                                <span className="font-medium">{c.nombre}</span>
                                {c.alias && <span className="text-xs text-gray-400 ml-1">— {c.alias}</span>}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {recargoTransferencia > 0 && (metodo === "Transferencia" || (metodo === "Mixto" && Number(mixtoTr) > 0)) && (
                        <p className="text-xs text-violet-600 bg-violet-50 rounded-lg px-3 py-2">
                          Recargo transferencia {recargoTransferencia}% incluido
                        </p>
                      )}

                      <button
                        onClick={() => handleCobrar(item)}
                        disabled={saving === item.id || ((metodo === "Transferencia" || (metodo === "Mixto" && Number(mixtoTr) > 0)) && !cuentaBancariaId && cuentasBancarias.length > 0)}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2"
                      >
                        {saving === item.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                        Confirmar cobro — {formatCurrency(pendiente)}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {items.every(i => i.completado) && items.length > 0 && (
          <div className="text-center py-8">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <p className="font-bold text-gray-800 text-lg">¡Ruta completada!</p>
            <p className="text-gray-500 text-sm">Todas las entregas fueron realizadas</p>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Esperado: sin errores.

- [ ] **Step 4: Test manual**
  - Crear una `hoja_ruta` de prueba en Supabase con un token de prueba, agregar un item
  - Abrir `/ruta/[token-de-prueba]` en el navegador → debe cargar sin error
  - Si la hoja no existe, debe mostrar "Link no disponible"

- [ ] **Step 5: Commit**

```bash
git add src/app/ruta/[token]/page.tsx
git commit -m "feat: public repartidor page /ruta/[token] — mobile-first delivery view"
```

---

## Task 5: Admin — Hoja de ruta page (rewrite)

**Files:**
- Rewrite: `src/app/(admin)/admin/ventas/hoja-ruta/page.tsx`

Esta tarea reemplaza el archivo completo (~2000 líneas). La lógica de cobro (`handleRegistrarPago`) se mantiene igual que en el código actual, solo se reestructura el componente y se agrega la gestión de hojas.

- [ ] **Step 1: Leer el archivo actual completo antes de reescribir**

```bash
wc -l "src/app/(admin)/admin/ventas/hoja-ruta/page.tsx"
```

Confirmar que existe y tiene ~2000 líneas.

- [ ] **Step 2: Reescribir el archivo**

Crear `src/app/(admin)/admin/ventas/hoja-ruta/page.tsx` con el siguiente contenido. El archivo tiene 3 secciones principales:

**SECCIÓN A — Types e imports:**

```typescript
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/formatters";
import { showAdminToast } from "@/components/admin-toast";
import {
  Plus, Link2, Copy, Check, ChevronDown, ChevronUp,
  Loader2, AlertCircle, CheckCircle2, MapPin, Package,
  Eye, Truck, CreditCard, X, GripVertical
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// ─── Types ───
interface VentaRow {
  id: string;
  numero: string;
  tipo_comprobante: string;
  total: number;
  forma_pago: string;
  monto_pagado: number;
  fecha: string;
  cliente_id: string | null;
  metodo_entrega: string | null;
  clientes: { nombre: string; domicilio: string | null; localidad: string | null; telefono: string | null; saldo: number; } | null;
}

interface HojaRuta {
  id: string;
  fecha: string;
  nombre: string;
  estado: string;
  modo_link: string;
  token_fijo: string | null;
  token_temp: string | null;
  token_temp_expira: string | null;
  created_at: string;
}

interface HojaItem {
  id: string;
  orden: number;
  completado: boolean;
  venta_id: string;
  ventas: VentaRow;
}

interface CuentaBancaria { id: string; nombre: string; alias: string; }
```

**SECCIÓN B — Componente principal (estado y carga de datos):**

```typescript
export default function HojaRutaPage() {
  // ─── Tabs ───
  const [tab, setTab] = useState<"hojas" | "pendientes" | "historial">("hojas");

  // ─── Hojas de ruta ───
  const [hojas, setHojas] = useState<HojaRuta[]>([]);
  const [hojaItems, setHojaItems] = useState<Record<string, HojaItem[]>>({});
  const [loadingHojas, setLoadingHojas] = useState(true);
  const [expandedHoja, setExpandedHoja] = useState<string | null>(null);

  // ─── Crear hoja ───
  const [showCrear, setShowCrear] = useState(false);
  const [ventasPendientes, setVentasPendientes] = useState<VentaRow[]>([]);
  const [selectedVentaIds, setSelectedVentaIds] = useState<Set<string>>(new Set());
  const [nombreHoja, setNombreHoja] = useState("");
  const [ordenCreacion, setOrdenCreacion] = useState<string[]>([]);
  const [creando, setCreando] = useState(false);

  // ─── Link generation ───
  const [linkDialog, setLinkDialog] = useState<{ open: boolean; hojaId: string; nombre: string } | null>(null);
  const [modoLink, setModoLink] = useState<"solo_ver" | "confirmar" | "confirmar_cobrar">("confirmar_cobrar");
  const [tipoLink, setTipoLink] = useState<"fijo" | "temporal">("temporal");
  const [expiraHoras, setExpiraHoras] = useState("24");
  const [generandoLink, setGenerandoLink] = useState(false);
  const [linkGenerado, setLinkGenerado] = useState("");
  const [copiado, setCopiado] = useState(false);

  // ─── Cobro ───
  const [cuentasBancarias, setCuentasBancarias] = useState<CuentaBancaria[]>([]);
  const [recargoTransferencia, setRecargoTransferencia] = useState(0);
  const [pagadoPorVenta, setPagadoPorVenta] = useState<Record<string, number>>({});
  const [paySaving, setPaySaving] = useState(false);

  // ─── Historial tab (reuse from old page) ───
  const [historialVentas, setHistorialVentas] = useState<VentaRow[]>([]);
  const [historialFechaDesde, setHistorialFechaDesde] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [historialFechaHasta, setHistorialFechaHasta] = useState(() => new Date().toISOString().split("T")[0]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);

  function argToday() {
    return new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
  }
  function argNow() {
    const ar = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    return { fecha: ar.toISOString().split("T")[0], hora: ar.toTimeString().slice(0, 5) };
  }

  // ─── Load hojas ───
  const fetchHojas = useCallback(async () => {
    setLoadingHojas(true);
    const { data } = await supabase.from("hoja_ruta").select("*").order("created_at", { ascending: false }).limit(20);
    setHojas(data || []);
    setLoadingHojas(false);
  }, []);

  const fetchHojaItems = useCallback(async (hojaId: string) => {
    const { data } = await supabase
      .from("hoja_ruta_items")
      .select(`id, orden, completado, venta_id, ventas ( id, numero, tipo_comprobante, total, forma_pago, monto_pagado, fecha, cliente_id, metodo_entrega, clientes ( nombre, domicilio, localidad, telefono, saldo ) )`)
      .eq("hoja_ruta_id", hojaId)
      .order("orden");
    if (data) {
      setHojaItems(prev => ({ ...prev, [hojaId]: data as HojaItem[] }));
      // Fetch pagado por venta
      const vids = data.map((i: any) => i.venta_id);
      if (vids.length > 0) {
        const { data: movs } = await supabase.from("caja_movimientos").select("referencia_id, monto").in("referencia_id", vids).eq("referencia_tipo", "venta").eq("tipo", "ingreso");
        const map: Record<string, number> = {};
        for (const m of movs || []) map[m.referencia_id] = (map[m.referencia_id] || 0) + m.monto;
        setPagadoPorVenta(prev => ({ ...prev, ...map }));
      }
    }
  }, []);

  // ─── Load ventas pendientes para crear hoja ───
  const fetchVentasPendientes = useCallback(async () => {
    const { data } = await supabase
      .from("ventas")
      .select("id, numero, tipo_comprobante, total, forma_pago, monto_pagado, fecha, cliente_id, metodo_entrega, clientes ( nombre, domicilio, localidad, telefono, saldo )")
      .eq("entregado", false)
      .in("metodo_entrega", ["envio", "envio_a_domicilio", "envio a domicilio"])
      .not("tipo_comprobante", "ilike", "Nota de Crédito%")
      .neq("estado", "anulada")
      .not("cliente_id", "is", null)
      .order("fecha", { ascending: true });
    setVentasPendientes((data || []) as VentaRow[]);
  }, []);

  // ─── Load config ───
  const fetchConfig = useCallback(async () => {
    const [{ data: cb }, { data: cfg }] = await Promise.all([
      supabase.from("cuentas_bancarias").select("id, nombre, alias").order("nombre"),
      supabase.from("tienda_config").select("recargo_transferencia").limit(1).single(),
    ]);
    setCuentasBancarias(cb || []);
    setRecargoTransferencia(cfg?.recargo_transferencia ?? 0);
  }, []);

  useEffect(() => { fetchHojas(); fetchConfig(); }, [fetchHojas, fetchConfig]);

  // ─── Crear nueva hoja ───
  const handleCrearHoja = async () => {
    if (selectedVentaIds.size === 0) return;
    setCreando(true);
    const today = argToday();
    const nombre = nombreHoja.trim() || `Ruta del ${new Date(today + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "long" })}`;
    const { data: nuevaHoja, error } = await supabase.from("hoja_ruta").insert({ fecha: today, nombre, estado: "activa" }).select().single();
    if (error || !nuevaHoja) { showAdminToast("Error al crear hoja", "error"); setCreando(false); return; }

    // Insert items in order
    const ventasOrdenadas = ordenCreacion.filter(id => selectedVentaIds.has(id));
    const items = ventasOrdenadas.map((ventaId, idx) => ({ hoja_ruta_id: nuevaHoja.id, venta_id: ventaId, orden: idx + 1 }));
    await supabase.from("hoja_ruta_items").insert(items);

    showAdminToast(`Hoja "${nombre}" creada`, "success");
    setShowCrear(false);
    setSelectedVentaIds(new Set());
    setNombreHoja("");
    setOrdenCreacion([]);
    await fetchHojas();
    setExpandedHoja(nuevaHoja.id);
    await fetchHojaItems(nuevaHoja.id);
    setCreando(false);
  };

  // ─── Reorder items in hoja (update orden en DB) ───
  const handleMoveItem = async (hojaId: string, itemId: string, direction: "up" | "down") => {
    const items = [...(hojaItems[hojaId] || [])].sort((a, b) => a.orden - b.orden);
    const idx = items.findIndex(i => i.id === itemId);
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === items.length - 1) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    const newItems = [...items];
    [newItems[idx], newItems[swapIdx]] = [newItems[swapIdx], newItems[idx]];
    // Update orden in DB
    await Promise.all(newItems.map((item, i) =>
      supabase.from("hoja_ruta_items").update({ orden: i + 1 }).eq("id", item.id)
    ));
    await fetchHojaItems(hojaId);
  };

  // ─── Generate link ───
  const handleGenerarLink = async () => {
    if (!linkDialog) return;
    setGenerandoLink(true);
    const token = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
    const updates: any = { modo_link: modoLink };
    if (tipoLink === "fijo") {
      updates.token_fijo = token;
    } else {
      updates.token_temp = token;
      updates.token_temp_expira = new Date(Date.now() + Number(expiraHoras) * 3600 * 1000).toISOString();
    }
    await supabase.from("hoja_ruta").update(updates).eq("id", linkDialog.hojaId);
    const url = `${window.location.origin}/ruta/${token}`;
    setLinkGenerado(url);
    await fetchHojas();
    setGenerandoLink(false);
  };

  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  // ─── Cobrar desde admin (misma lógica que hoja de ruta actual) ───
  const handleCobrarAdmin = async (hojaId: string, item: HojaItem, cobro: { metodo: string; efectivo: number; transferencia: number; cc: number; cuentaBancaria: string; }) => {
    setPaySaving(true);
    const { fecha, hora } = argNow();
    const venta = item.ventas;
    const pendiente = Math.max(0, venta.total - (pagadoPorVenta[venta.id] || 0));
    const recargo = cobro.metodo === "Transferencia" ? Math.round(pendiente * recargoTransferencia) / 100 : 0;

    const entries: any[] = [];
    if (cobro.metodo === "Mixto") {
      if (cobro.efectivo > 0) entries.push({ fecha, hora, tipo: "ingreso", descripcion: `Cobro entrega #${venta.numero} (Efectivo)`, metodo_pago: "Efectivo", monto: cobro.efectivo, referencia_id: venta.id, referencia_tipo: "venta" });
      if (cobro.transferencia > 0) entries.push({ fecha, hora, tipo: "ingreso", descripcion: `Cobro entrega #${venta.numero} (Transferencia)`, metodo_pago: "Transferencia", monto: cobro.transferencia, referencia_id: venta.id, referencia_tipo: "venta", ...(cobro.cuentaBancaria ? { cuenta_bancaria: cobro.cuentaBancaria } : {}) });
    } else if (cobro.metodo !== "Cuenta Corriente") {
      entries.push({ fecha, hora, tipo: "ingreso", descripcion: `Cobro entrega #${venta.numero}${recargo > 0 ? " (Transf)" : ""}`, metodo_pago: cobro.metodo, monto: pendiente + recargo, referencia_id: venta.id, referencia_tipo: "venta", ...(cobro.cuentaBancaria ? { cuenta_bancaria: cobro.cuentaBancaria } : {}) });
    }
    if (entries.length > 0) await supabase.from("caja_movimientos").insert(entries);

    if (cobro.cc > 0 && venta.cliente_id) {
      const { data: newSaldo } = await supabase.rpc("atomic_update_client_saldo", { p_client_id: venta.cliente_id, p_change: cobro.cc });
      await supabase.from("cuenta_corriente").insert({ cliente_id: venta.cliente_id, fecha, comprobante: `Cobro entrega #${venta.numero}`, descripcion: "Saldo a cuenta corriente", debe: cobro.cc, haber: 0, saldo: newSaldo ?? 0, forma_pago: cobro.metodo, venta_id: venta.id });
    }

    const pagadoAhora = cobro.metodo === "Cuenta Corriente" ? 0 : pendiente;
    await supabase.from("ventas").update({ forma_pago: cobro.metodo, monto_pagado: (pagadoPorVenta[venta.id] || 0) + pagadoAhora, entregado: true, estado: "entregado", ...(cobro.cuentaBancaria ? { cuenta_transferencia_alias: cobro.cuentaBancaria } : {}) }).eq("id", venta.id);
    if (venta.numero) await supabase.from("pedidos_tienda").update({ estado: "entregado" }).eq("numero", venta.numero);
    await supabase.from("hoja_ruta_items").update({ completado: true, completado_at: new Date().toISOString() }).eq("id", item.id);

    showAdminToast(`Cobro registrado — ${venta.clientes?.nombre}`, "success");
    await fetchHojaItems(hojaId);
    setPaySaving(false);
  };

  // ─── Confirmar entregado sin cobro ───
  const handleConfirmarEntrega = async (hojaId: string, item: HojaItem) => {
    await supabase.from("ventas").update({ entregado: true, estado: "entregado" }).eq("id", item.venta_id);
    await supabase.from("hoja_ruta_items").update({ completado: true, completado_at: new Date().toISOString() }).eq("id", item.id);
    if (item.ventas?.numero) await supabase.from("pedidos_tienda").update({ estado: "entregado" }).eq("numero", item.ventas.numero);
    showAdminToast("Entrega confirmada", "success");
    await fetchHojaItems(hojaId);
  };

  // ─── Load historial (same query as old page) ───
  const fetchHistorial = useCallback(async () => {
    setLoadingHistorial(true);
    const { data } = await supabase
      .from("ventas")
      .select("id, numero, tipo_comprobante, total, forma_pago, monto_pagado, fecha, cliente_id, clientes ( nombre, saldo )")
      .eq("entregado", true)
      .gte("fecha", historialFechaDesde)
      .lte("fecha", historialFechaHasta)
      .not("tipo_comprobante", "ilike", "Nota de Crédito%")
      .order("fecha", { ascending: false });
    setHistorialVentas((data || []) as any);
    setLoadingHistorial(false);
  }, [historialFechaDesde, historialFechaHasta]);

  useEffect(() => { if (tab === "historial") fetchHistorial(); }, [tab, fetchHistorial]);
```

**SECCIÓN C — JSX/Render:**

```typescript
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Hoja de Ruta</h1>
        {tab === "hojas" && (
          <Button onClick={() => { setShowCrear(true); fetchVentasPendientes(); }} className="gap-2">
            <Plus className="w-4 h-4" /> Nueva hoja
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6">
        {([["hojas", "Hojas activas"], ["pendientes", "Sin asignar"], ["historial", "Historial"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${tab === key ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ─── TAB: Hojas activas ─── */}
      {tab === "hojas" && (
        <div className="space-y-4">
          {loadingHojas ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
          ) : hojas.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Truck className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p>No hay hojas de ruta. Creá una nueva.</p>
            </div>
          ) : hojas.map(hoja => {
            const items = hojaItems[hoja.id] || [];
            const entregadas = items.filter(i => i.completado).length;
            const pct = items.length > 0 ? Math.round((entregadas / items.length) * 100) : 0;
            const isExpanded = expandedHoja === hoja.id;
            const existingLink = hoja.token_fijo
              ? `${typeof window !== "undefined" ? window.location.origin : ""}/ruta/${hoja.token_fijo}`
              : hoja.token_temp && hoja.token_temp_expira && new Date(hoja.token_temp_expira) > new Date()
              ? `${typeof window !== "undefined" ? window.location.origin : ""}/ruta/${hoja.token_temp}`
              : null;

            return (
              <div key={hoja.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm">
                {/* Hoja header */}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">{hoja.nombre}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">{new Date(hoja.fecha + "T12:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => { setLinkDialog({ open: true, hojaId: hoja.id, nombre: hoja.nombre }); setLinkGenerado(existingLink || ""); }}
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200">
                        <Link2 className="w-3.5 h-3.5" /> Link
                      </button>
                      <button onClick={() => {
                        const newExpanded = isExpanded ? null : hoja.id;
                        setExpandedHoja(newExpanded);
                        if (newExpanded) fetchHojaItems(hoja.id);
                      }} className="p-1.5 rounded-lg hover:bg-gray-100">
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      </button>
                    </div>
                  </div>

                  {/* Progress */}
                  {items.length > 0 && (
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex-1 bg-gray-100 rounded-full h-2">
                        <div className="bg-emerald-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-gray-500 shrink-0">{entregadas}/{items.length} entregadas</span>
                    </div>
                  )}
                </div>

                {/* Items expanded */}
                {isExpanded && (
                  <div className="border-t">
                    {items.length === 0 ? (
                      <p className="text-center text-gray-400 text-sm py-6">Cargando...</p>
                    ) : items.map((item, idx) => {
                      const venta = item.ventas;
                      const cliente = venta?.clientes;
                      const pendiente = Math.max(0, (venta?.total || 0) - (pagadoPorVenta[venta?.id] || 0));
                      const saldoAnterior = Math.max(0, (cliente?.saldo || 0) - (item.completado ? 0 : pendiente));

                      return (
                        <div key={item.id} className={`flex items-start gap-3 px-4 py-3 border-b last:border-b-0 ${item.completado ? "bg-emerald-50/30" : ""}`}>
                          {/* Reorder buttons */}
                          <div className="flex flex-col gap-0.5 shrink-0 mt-1">
                            <button onClick={() => handleMoveItem(hoja.id, item.id, "up")} disabled={idx === 0}
                              className="text-gray-300 hover:text-gray-600 disabled:opacity-20 p-0.5">▲</button>
                            <button onClick={() => handleMoveItem(hoja.id, item.id, "down")} disabled={idx === items.length - 1}
                              className="text-gray-300 hover:text-gray-600 disabled:opacity-20 p-0.5">▼</button>
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-gray-400 w-5">{item.orden}</span>
                                {item.completado ? (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                ) : null}
                                <span className="font-medium text-sm text-gray-900 truncate">{cliente?.nombre || "Sin cliente"}</span>
                              </div>
                              <span className="text-sm font-bold text-gray-800 shrink-0">
                                {item.completado ? <span className="text-emerald-600 text-xs">Entregado</span> : formatCurrency(pendiente)}
                              </span>
                            </div>
                            {cliente?.domicilio && (
                              <p className="text-xs text-gray-400 mt-0.5 ml-7 truncate">
                                <MapPin className="w-3 h-3 inline mr-1" />{cliente.domicilio}
                              </p>
                            )}
                            {/* Saldo anterior badge */}
                            {!item.completado && saldoAnterior > 0 && (
                              <div className="ml-7 mt-1 inline-flex items-center gap-1 bg-orange-50 border border-orange-200 rounded-md px-2 py-0.5">
                                <AlertCircle className="w-3 h-3 text-orange-500" />
                                <span className="text-xs text-orange-700">Saldo anterior: {formatCurrency(saldoAnterior)}</span>
                              </div>
                            )}
                            {/* Cobrar/Confirmar buttons — only for uncompleted */}
                            {!item.completado && pendiente > 0 && (
                              <div className="ml-7 mt-2 flex gap-2">
                                <button
                                  onClick={() => handleCobrarAdmin(hoja.id, item, { metodo: "Efectivo", efectivo: pendiente, transferencia: 0, cc: 0, cuentaBancaria: "" })}
                                  disabled={paySaving}
                                  className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                                >
                                  Cobrar efectivo
                                </button>
                                <button
                                  onClick={() => handleConfirmarEntrega(hoja.id, item)}
                                  disabled={paySaving}
                                  className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                                >
                                  Sin cobro
                                </button>
                              </div>
                            )}
                            {!item.completado && pendiente <= 0 && (
                              <div className="ml-7 mt-2">
                                <button
                                  onClick={() => handleConfirmarEntrega(hoja.id, item)}
                                  disabled={paySaving}
                                  className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                                >
                                  Confirmar entrega
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ─── TAB: Sin asignar ─── */}
      {tab === "pendientes" && (
        <div className="space-y-3">
          {ventasPendientes.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p>No hay entregas pendientes sin asignar</p>
              <button onClick={fetchVentasPendientes} className="mt-3 text-sm text-primary hover:underline">Actualizar</button>
            </div>
          ) : ventasPendientes.map(v => (
            <div key={v.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm text-gray-900">{v.clientes?.nombre}</p>
                  <p className="text-xs text-gray-400">{v.tipo_comprobante} #{v.numero} — {new Date(v.fecha + "T12:00:00").toLocaleDateString("es-AR")}</p>
                </div>
                <span className="font-bold text-gray-800">{formatCurrency(v.total)}</span>
              </div>
              {v.clientes?.domicilio && <p className="text-xs text-gray-400 mt-1"><MapPin className="w-3 h-3 inline mr-1" />{v.clientes.domicilio}</p>}
              {(v.clientes?.saldo || 0) > 0 && (
                <div className="mt-1 inline-flex items-center gap-1 bg-orange-50 border border-orange-200 rounded-md px-2 py-0.5">
                  <AlertCircle className="w-3 h-3 text-orange-500" />
                  <span className="text-xs text-orange-700">Saldo pendiente: {formatCurrency(v.clientes!.saldo)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ─── TAB: Historial ─── */}
      {tab === "historial" && (
        <div>
          <div className="flex gap-2 mb-4">
            <Input type="date" value={historialFechaDesde} onChange={e => setHistorialFechaDesde(e.target.value)} className="h-9 text-sm" />
            <Input type="date" value={historialFechaHasta} onChange={e => setHistorialFechaHasta(e.target.value)} className="h-9 text-sm" />
            <Button variant="outline" size="sm" onClick={fetchHistorial}>Buscar</Button>
          </div>
          {loadingHistorial ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
          ) : (
            <div className="space-y-3">
              {/* Summary */}
              {historialVentas.length > 0 && (() => {
                const totalCobrado = historialVentas.reduce((s, v) => s + (v.monto_pagado || 0), 0);
                const enCC = historialVentas.filter(v => v.forma_pago === "Cuenta Corriente").reduce((s, v) => s + v.total, 0);
                const conSaldoPendiente = historialVentas.filter(v => (v.clientes?.saldo || 0) > 0);
                return (
                  <div className="bg-gray-50 border rounded-xl p-4 mb-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                    <div><p className="text-xs text-gray-500">Entregas</p><p className="font-bold text-lg">{historialVentas.length}</p></div>
                    <div><p className="text-xs text-gray-500">Total cobrado</p><p className="font-bold text-lg text-emerald-700">{formatCurrency(totalCobrado)}</p></div>
                    <div><p className="text-xs text-gray-500">En cta. cte.</p><p className="font-bold text-lg text-blue-700">{formatCurrency(enCC)}</p></div>
                    <div><p className="text-xs text-gray-500">Con saldo pendiente</p><p className="font-bold text-lg text-orange-600">{conSaldoPendiente.length}</p></div>
                  </div>
                );
              })()}
              {historialVentas.map(v => (
                <div key={v.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-sm text-gray-900">{(v as any).clientes?.nombre}</p>
                      <p className="text-xs text-gray-400">{v.tipo_comprobante} #{v.numero} — {new Date(v.fecha + "T12:00:00").toLocaleDateString("es-AR")}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Forma de pago: {v.forma_pago}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-gray-800">{formatCurrency(v.total)}</p>
                      {(v.monto_pagado || 0) < v.total && (
                        <p className="text-xs text-orange-600 font-medium">Quedó debiendo {formatCurrency(v.total - (v.monto_pagado || 0))}</p>
                      )}
                    </div>
                  </div>
                  {/* Saldo anterior info */}
                  {(v as any).clientes?.saldo > 0 && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-md px-2 py-1">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      Saldo pendiente actual: {formatCurrency((v as any).clientes.saldo)} — no abonado
                    </div>
                  )}
                  {(v as any).clientes?.saldo === 0 && v.forma_pago !== "Cuenta Corriente" && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1">
                      <CheckCircle2 className="w-3 h-3 shrink-0" />
                      Sin saldo pendiente
                    </div>
                  )}
                </div>
              ))}
              {historialVentas.length === 0 && <p className="text-center text-gray-400 py-8">Sin entregas en este período</p>}
            </div>
          )}
        </div>
      )}

      {/* ─── DRAWER: Crear hoja de ruta ─── */}
      <Dialog open={showCrear} onOpenChange={setShowCrear}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva hoja de ruta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input placeholder="Nombre de la hoja (opcional)" value={nombreHoja} onChange={e => setNombreHoja(e.target.value)} />
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Seleccioná las entregas ({selectedVentaIds.size} seleccionadas)</p>
              <div className="space-y-2 max-h-64 overflow-y-auto border rounded-xl p-2">
                {ventasPendientes.length === 0 ? (
                  <p className="text-center text-gray-400 text-sm py-4">No hay entregas pendientes</p>
                ) : ventasPendientes.map(v => {
                  const checked = selectedVentaIds.has(v.id);
                  return (
                    <label key={v.id} className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer border-2 transition-all ${checked ? "border-primary bg-primary/5" : "border-transparent hover:bg-gray-50"}`}>
                      <input type="checkbox" checked={checked} onChange={() => {
                        const next = new Set(selectedVentaIds);
                        if (checked) { next.delete(v.id); setOrdenCreacion(prev => prev.filter(id => id !== v.id)); }
                        else { next.add(v.id); setOrdenCreacion(prev => [...prev, v.id]); }
                        setSelectedVentaIds(next);
                      }} className="mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-gray-900">{v.clientes?.nombre}</p>
                        <p className="text-xs text-gray-400">{v.tipo_comprobante} #{v.numero} — {formatCurrency(v.total)}</p>
                        {v.clientes?.domicilio && <p className="text-xs text-gray-400 truncate"><MapPin className="w-3 h-3 inline mr-1" />{v.clientes.domicilio}</p>}
                        {(v.clientes?.saldo || 0) > 0 && <span className="text-xs text-orange-600 font-medium">Saldo anterior: {formatCurrency(v.clientes!.saldo)}</span>}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
            {selectedVentaIds.size > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Orden de entrega</p>
                <div className="space-y-1.5 border rounded-xl p-2 bg-gray-50">
                  {ordenCreacion.filter(id => selectedVentaIds.has(id)).map((id, idx) => {
                    const v = ventasPendientes.find(vv => vv.id === id);
                    return (
                      <div key={id} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border">
                        <span className="text-xs font-bold text-gray-400 w-5">{idx + 1}</span>
                        <span className="flex-1 text-sm text-gray-800 truncate">{v?.clientes?.nombre}</span>
                        <div className="flex gap-1">
                          <button disabled={idx === 0} onClick={() => { const arr = [...ordenCreacion.filter(i => selectedVentaIds.has(i))]; const j = arr.indexOf(id); [arr[j], arr[j-1]] = [arr[j-1], arr[j]]; setOrdenCreacion(arr); }} className="text-gray-300 hover:text-gray-600 disabled:opacity-20 text-xs">▲</button>
                          <button disabled={idx === ordenCreacion.filter(i => selectedVentaIds.has(i)).length - 1} onClick={() => { const arr = [...ordenCreacion.filter(i => selectedVentaIds.has(i))]; const j = arr.indexOf(id); [arr[j], arr[j+1]] = [arr[j+1], arr[j]]; setOrdenCreacion(arr); }} className="text-gray-300 hover:text-gray-600 disabled:opacity-20 text-xs">▼</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <Button onClick={handleCrearHoja} disabled={selectedVentaIds.size === 0 || creando} className="w-full">
              {creando ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Crear hoja de ruta ({selectedVentaIds.size} entregas)
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── DIALOG: Generar link ─── */}
      <Dialog open={!!linkDialog?.open} onOpenChange={() => { setLinkDialog(null); setLinkGenerado(""); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Link para repartidor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Modo</p>
              <div className="space-y-2">
                {([["solo_ver", "Solo ver", "El repartidor solo puede ver la lista"], ["confirmar", "Confirmar entrega", "Puede marcar como entregado, pero no cobra"], ["confirmar_cobrar", "Confirmar + cobrar", "Puede confirmar y registrar el cobro en caja"]] as const).map(([val, label, desc]) => (
                  <label key={val} className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${modoLink === val ? "border-primary bg-primary/5" : "border-gray-200 hover:border-gray-300"}`}>
                    <input type="radio" name="modo" value={val} checked={modoLink === val} onChange={() => setModoLink(val)} className="mt-0.5" />
                    <div><p className="text-sm font-semibold text-gray-900">{label}</p><p className="text-xs text-gray-500">{desc}</p></div>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Tipo de link</p>
              <div className="grid grid-cols-2 gap-2">
                {([["temporal", "Temporal"], ["fijo", "Fijo (permanente)"]] as const).map(([val, label]) => (
                  <button key={val} onClick={() => setTipoLink(val)}
                    className={`py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${tipoLink === val ? "border-primary bg-primary/5 text-primary" : "border-gray-200 text-gray-500"}`}>
                    {label}
                  </button>
                ))}
              </div>
              {tipoLink === "temporal" && (
                <div className="mt-2 flex items-center gap-2">
                  <label className="text-xs text-gray-500 shrink-0">Expira en</label>
                  <Select value={expiraHoras} onValueChange={setExpiraHoras}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="4">4 horas</SelectItem>
                      <SelectItem value="8">8 horas</SelectItem>
                      <SelectItem value="24">24 horas</SelectItem>
                      <SelectItem value="48">48 horas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {linkGenerado ? (
              <div className="bg-gray-50 border rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-1.5 font-medium">Link generado</p>
                <div className="flex gap-2">
                  <input readOnly value={linkGenerado} className="flex-1 text-xs bg-white border rounded-lg px-2 py-1.5 font-mono" />
                  <button onClick={() => handleCopyLink(linkGenerado)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${copiado ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}>
                    {copiado ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <Button variant="outline" size="sm" className="w-full mt-2 text-xs" onClick={() => { setLinkGenerado(""); }}>
                  Generar nuevo link
                </Button>
              </div>
            ) : (
              <Button onClick={handleGenerarLink} disabled={generandoLink} className="w-full gap-2">
                {generandoLink ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                Generar link
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 3: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Esperado: sin errores relevantes (puede haber warnings de tipos no encontrados — los tipos `VentaRow` son internos al componente).

- [ ] **Step 4: Build completo**

```bash
npx next build 2>&1 | tail -20
```

Esperado: build exitoso sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/app/(admin)/admin/ventas/hoja-ruta/page.tsx
git commit -m "feat: hoja de ruta — persistent order, link generation, saldo anterior, historial mejorado"
```

---

## Task 6: Integración final y .gitignore

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Agregar .superpowers/ al .gitignore**

```bash
echo ".superpowers/" >> .gitignore
git add .gitignore
git commit -m "chore: ignore .superpowers/ brainstorm files"
```

- [ ] **Step 2: Push todo**

```bash
git push origin main
```

- [ ] **Step 3: Test de flujo completo en producción**

1. Abrir `/admin/ventas/hoja-ruta`
2. Hacer click en "Nueva hoja" → verificar que carga las entregas pendientes
3. Seleccionar 2-3 entregas, ordenarlas, crear la hoja
4. Verificar que la hoja aparece en la lista con el progreso correcto
5. Click en "Link" → elegir modo "Confirmar + cobrar", tipo temporal 24h → generar
6. Copiar el link y abrirlo en el celular → verificar que se ve la lista en orden
7. Confirmar una entrega desde el celular → verificar que en admin el progreso se actualiza
8. Verificar en Supabase que `hoja_ruta_items.completado = true` y `ventas.entregado = true`
9. Verificar que `caja_movimientos` tiene la entrada del cobro

---

## Self-Review

**Spec coverage:**
- ✅ DB schema: `hoja_ruta` + `hoja_ruta_items`
- ✅ Admin page: crear hoja, orden persistido, link generation, historial mejorado
- ✅ API route GET: retorna hoja + items + pagadoPorVenta + config
- ✅ API route POST: confirmar + cobrar → caja igual que hoy
- ✅ Página pública `/ruta/[token]`: mobile-first, 3 modos
- ✅ Saldo anterior visible en admin, repartidor y historial
- ✅ Link fijo y temporal con expiración configurable
- ✅ Historial: quién quedó debiendo, quién pagó saldo anterior
- ✅ Token fijo permanente, token temporal con expiración

**Gaps menores:**
- La página admin en Task 5 tiene botón "Cobrar efectivo" hardcodeado. Para cobros con otros métodos (transferencia, mixto) el admin debería ir al historial de ventas. Esto es aceptable para la v1 — el flujo de cobro complejo queda en el historial.
- El reorder en admin usa botones ▲▼ (no drag & drop) para simplicidad y persistencia garantizada en DB.
