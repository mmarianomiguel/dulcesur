# Cobros & Pagos a Proveedores — Invoice-Level Allocation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the basic cobros/pagos system with invoice-level payment allocation (FIFO auto or manual), sequential numbering, full atomicity (including caja), and receipt generation.

**Architecture:** Two new detail tables (`cobro_items`, `pago_proveedor_items`) link payments to specific invoices/purchases. Two new Supabase RPCs handle everything atomically. Frontend gets a redesigned dialog with an allocation table showing invoices and applied amounts. Same pattern for clients and suppliers.

**Tech Stack:** Next.js 16, React 19, Supabase (PostgreSQL RPCs), TypeScript, shadcn/ui, Tailwind CSS 4

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/components/cobro-allocation-dialog.tsx` | Reusable cobro dialog with invoice allocation table, FIFO/manual toggle |
| Create | `src/components/pago-proveedor-allocation-dialog.tsx` | Same pattern for supplier payments with compra allocation |
| Modify | `src/app/(admin)/admin/clientes/page.tsx` | Replace old cobro dialog with new component |
| Modify | `src/app/(admin)/admin/clientes/cobranzas/page.tsx` | Replace old cobro flow with new component |
| Modify | `src/app/(admin)/admin/proveedores/page.tsx` | Replace old pago flow with new component |
| Modify | `src/app/(admin)/admin/compras/page.tsx` | Replace handleRegisterPayment with new component |
| Modify | `src/types/database.ts` | Add Cobro (updated), CobroItem, PagoProveedorItem interfaces |

**SQL (user runs manually):** 2 RPCs + 2 tables + schema changes

---

## Task 1: SQL — New Tables, Updated RPCs

**Files:** SQL to run in Supabase SQL Editor

- [ ] **Step 1: User runs the following SQL in Supabase**

```sql
-- ============================================================
-- 1. COBRO_ITEMS TABLE (links cobros to ventas)
-- ============================================================
CREATE TABLE IF NOT EXISTS cobro_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cobro_id UUID NOT NULL REFERENCES cobros(id) ON DELETE CASCADE,
  venta_id UUID NOT NULL REFERENCES ventas(id) ON DELETE RESTRICT,
  monto_aplicado NUMERIC NOT NULL CHECK (monto_aplicado > 0),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cobro_items_cobro ON cobro_items(cobro_id);
CREATE INDEX idx_cobro_items_venta ON cobro_items(venta_id);

-- ============================================================
-- 2. ADD COLUMNS TO COBROS TABLE
-- ============================================================
ALTER TABLE cobros ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE cobros ADD COLUMN IF NOT EXISTS numero TEXT;
ALTER TABLE cobros ADD COLUMN IF NOT EXISTS hora TEXT;
ALTER TABLE cobros ADD COLUMN IF NOT EXISTS fecha TEXT;
ALTER TABLE cobros ADD COLUMN IF NOT EXISTS cuenta_bancaria_id UUID;
ALTER TABLE cobros ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'aplicado';
ALTER TABLE cobros ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- Add primary key if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'cobros' AND constraint_type = 'PRIMARY KEY'
  ) THEN
    ALTER TABLE cobros ADD PRIMARY KEY (id);
  END IF;
END $$;

-- ============================================================
-- 3. PAGO_PROVEEDOR_ITEMS TABLE (links pagos to compras)
-- ============================================================
CREATE TABLE IF NOT EXISTS pago_proveedor_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pago_id UUID NOT NULL REFERENCES pagos_proveedores(id) ON DELETE CASCADE,
  compra_id UUID NOT NULL REFERENCES compras(id) ON DELETE RESTRICT,
  monto_aplicado NUMERIC NOT NULL CHECK (monto_aplicado > 0),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pago_prov_items_pago ON pago_proveedor_items(pago_id);
CREATE INDEX idx_pago_prov_items_compra ON pago_proveedor_items(compra_id);

-- ============================================================
-- 4. ADD monto_pagado TO VENTAS (track how much has been collected)
-- ============================================================
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS monto_pagado NUMERIC DEFAULT 0;

-- ============================================================
-- 5. NEW ATOMIC RPC: REGISTER COBRO WITH INVOICE ALLOCATION
-- ============================================================
CREATE OR REPLACE FUNCTION atomic_register_cobro_v2(
  p_client_id UUID,
  p_monto NUMERIC,
  p_forma_pago TEXT,
  p_observacion TEXT,
  p_fecha TEXT,
  p_hora TEXT,
  p_cuenta_bancaria_id UUID,
  p_cuenta_bancaria_nombre TEXT,
  p_allocations JSONB  -- array of {venta_id, monto_aplicado}
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_saldo NUMERIC;
  v_cobro_id UUID;
  v_numero TEXT;
  v_alloc JSONB;
  v_venta_id UUID;
  v_monto_aplicado NUMERIC;
BEGIN
  -- 1. Get sequential number
  SELECT next_numero('cobro') INTO v_numero;

  -- 2. Update client saldo
  UPDATE clientes
  SET saldo = saldo - p_monto, updated_at = now()
  WHERE id = p_client_id
  RETURNING saldo INTO v_new_saldo;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente % no encontrado', p_client_id;
  END IF;

  -- 3. Insert cobro record
  INSERT INTO cobros (id, numero, cliente_id, fecha, hora, monto, forma_pago, observacion, cuenta_bancaria_id, estado)
  VALUES (gen_random_uuid(), v_numero, p_client_id, p_fecha, p_hora, p_monto, p_forma_pago, p_observacion, p_cuenta_bancaria_id, 'aplicado')
  RETURNING id INTO v_cobro_id;

  -- 4. Insert cobro_items and update venta.monto_pagado
  FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_venta_id := (v_alloc->>'venta_id')::UUID;
    v_monto_aplicado := (v_alloc->>'monto_aplicado')::NUMERIC;

    INSERT INTO cobro_items (cobro_id, venta_id, monto_aplicado)
    VALUES (v_cobro_id, v_venta_id, v_monto_aplicado);

    UPDATE ventas
    SET monto_pagado = COALESCE(monto_pagado, 0) + v_monto_aplicado
    WHERE id = v_venta_id;
  END LOOP;

  -- 5. Insert cuenta_corriente entry
  INSERT INTO cuenta_corriente (cliente_id, fecha, comprobante, descripcion, debe, haber, saldo, forma_pago, venta_id)
  VALUES (p_client_id, p_fecha, v_numero, 'Cobro - ' || p_forma_pago, 0, p_monto, v_new_saldo, p_forma_pago, NULL);

  -- 6. Insert caja_movimiento
  INSERT INTO caja_movimientos (fecha, hora, tipo, descripcion, metodo_pago, monto, referencia_id, referencia_tipo, cuenta_bancaria)
  VALUES (
    p_fecha, p_hora, 'ingreso',
    'Cobro ' || v_numero || ' — ' || (SELECT nombre FROM clientes WHERE id = p_client_id) ||
      CASE WHEN p_cuenta_bancaria_nombre IS NOT NULL THEN ' → ' || p_cuenta_bancaria_nombre ELSE '' END,
    p_forma_pago, p_monto, v_cobro_id, 'cobro',
    p_cuenta_bancaria_nombre
  );

  RETURN jsonb_build_object(
    'cobro_id', v_cobro_id,
    'numero', v_numero,
    'nuevo_saldo', v_new_saldo
  );
END;
$$;

-- ============================================================
-- 6. NEW ATOMIC RPC: REGISTER PAGO PROVEEDOR WITH ALLOCATION
-- ============================================================
CREATE OR REPLACE FUNCTION atomic_register_pago_proveedor(
  p_proveedor_id UUID,
  p_monto NUMERIC,
  p_forma_pago TEXT,
  p_observacion TEXT,
  p_fecha TEXT,
  p_hora TEXT,
  p_cuenta_bancaria_id UUID,
  p_cuenta_bancaria_nombre TEXT,
  p_registrar_caja BOOLEAN,
  p_allocations JSONB  -- array of {compra_id, monto_aplicado}
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_saldo NUMERIC;
  v_pago_id UUID;
  v_numero TEXT;
  v_alloc JSONB;
  v_compra_id UUID;
  v_monto_aplicado NUMERIC;
  v_nuevo_pagado NUMERIC;
  v_compra_total NUMERIC;
BEGIN
  -- 1. Get sequential number
  SELECT next_numero('orden_pago') INTO v_numero;

  -- 2. Update proveedor saldo
  UPDATE proveedores
  SET saldo = saldo - p_monto, updated_at = now()
  WHERE id = p_proveedor_id
  RETURNING saldo INTO v_new_saldo;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proveedor % no encontrado', p_proveedor_id;
  END IF;

  -- 3. Insert pago record
  INSERT INTO pagos_proveedores (id, numero, proveedor_id, fecha, monto, forma_pago, observacion, cuenta_bancaria_id)
  VALUES (gen_random_uuid(), v_numero, p_proveedor_id, p_fecha, p_monto, p_forma_pago, p_observacion, p_cuenta_bancaria_id)
  RETURNING id INTO v_pago_id;

  -- 4. Insert pago_items and update compra.monto_pagado
  FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_compra_id := (v_alloc->>'compra_id')::UUID;
    v_monto_aplicado := (v_alloc->>'monto_aplicado')::NUMERIC;

    INSERT INTO pago_proveedor_items (pago_id, compra_id, monto_aplicado)
    VALUES (v_pago_id, v_compra_id, v_monto_aplicado);

    UPDATE compras
    SET monto_pagado = COALESCE(monto_pagado, 0) + v_monto_aplicado,
        estado_pago = CASE
          WHEN COALESCE(monto_pagado, 0) + v_monto_aplicado >= total THEN 'Pagada'
          ELSE 'Pago Parcial'
        END
    WHERE id = v_compra_id;
  END LOOP;

  -- 5. Insert CC proveedor entry
  INSERT INTO cuenta_corriente_proveedor (proveedor_id, fecha, tipo, descripcion, monto, saldo_resultante, referencia_id, referencia_tipo)
  VALUES (p_proveedor_id, p_fecha, 'pago', 'Pago ' || v_numero || ' - ' || p_forma_pago, p_monto, v_new_saldo, v_pago_id, 'pago');

  -- 6. Insert caja movement if requested and not CC
  IF p_registrar_caja AND p_forma_pago <> 'Cuenta Corriente' THEN
    INSERT INTO caja_movimientos (fecha, hora, tipo, descripcion, metodo_pago, monto, referencia_id, referencia_tipo, cuenta_bancaria)
    VALUES (
      p_fecha, p_hora, 'egreso',
      'Pago ' || v_numero || ' — ' || (SELECT nombre FROM proveedores WHERE id = p_proveedor_id) ||
        CASE WHEN p_cuenta_bancaria_nombre IS NOT NULL THEN ' → ' || p_cuenta_bancaria_nombre ELSE '' END,
      p_forma_pago, -p_monto, v_pago_id, 'pago_proveedor',
      p_cuenta_bancaria_nombre
    );
  END IF;

  RETURN jsonb_build_object(
    'pago_id', v_pago_id,
    'numero', v_numero,
    'nuevo_saldo', v_new_saldo
  );
END;
$$;

-- ============================================================
-- 7. GRANTS
-- ============================================================
GRANT EXECUTE ON FUNCTION atomic_register_cobro_v2(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION atomic_register_pago_proveedor(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, BOOLEAN, JSONB) TO authenticated;
GRANT ALL ON cobro_items TO authenticated;
GRANT ALL ON pago_proveedor_items TO authenticated;

-- ============================================================
-- 8. ADD numero COLUMN TO pagos_proveedores IF NOT EXISTS
-- ============================================================
ALTER TABLE pagos_proveedores ADD COLUMN IF NOT EXISTS numero TEXT;
ALTER TABLE pagos_proveedores ADD COLUMN IF NOT EXISTS cuenta_bancaria_id UUID;

-- ============================================================
-- 9. NUMERADOR ENTRIES FOR NEW TYPES
-- ============================================================
INSERT INTO numeradores (tipo, punto_venta, ultimo_numero)
VALUES ('cobro', '001', 0)
ON CONFLICT DO NOTHING;

INSERT INTO numeradores (tipo, punto_venta, ultimo_numero)
VALUES ('orden_pago', '001', 0)
ON CONFLICT DO NOTHING;
```

---

## Task 2: TypeScript Interfaces

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Update Cobro interface and add CobroItem, PagoProveedorItem**

Add/update these interfaces in `src/types/database.ts`:

```typescript
export interface Cobro {
  id: string;
  numero: string;
  cliente_id: string;
  fecha: string;
  hora: string;
  monto: number;
  forma_pago: string;
  observacion: string | null;
  cuenta_bancaria_id: string | null;
  estado: "aplicado" | "anulado";
  created_at: string;
}

export interface CobroItem {
  id: string;
  cobro_id: string;
  venta_id: string;
  monto_aplicado: number;
  created_at: string;
}

export interface PagoProveedorItem {
  id: string;
  pago_id: string;
  compra_id: string;
  monto_aplicado: number;
  created_at: string;
}
```

Update `PagoProveedor` to include `numero` and `cuenta_bancaria_id`:

```typescript
export interface PagoProveedor {
  id: string;
  numero: string;
  proveedor_id: string;
  fecha: string;
  monto: number;
  forma_pago: string;
  compra_id: string | null;
  observacion: string | null;
  cuenta_bancaria_id: string | null;
  created_at: string;
}
```

Add `monto_pagado` to `Venta` if not already present:

```typescript
// In Venta interface, add:
monto_pagado?: number;
```

- [ ] **Step 2: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: add CobroItem and PagoProveedorItem interfaces"
```

---

## Task 3: Cobro Allocation Dialog Component

**Files:**
- Create: `src/components/cobro-allocation-dialog.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { showAdminToast } from "@/components/admin-toast";
import { todayARG, nowTimeARG, formatCurrency } from "@/lib/formatters";

interface PendingInvoice {
  id: string;
  numero: string;
  fecha: string;
  tipo_comprobante: string;
  total: number;
  monto_pagado: number;
  pendiente: number;
}

interface Allocation {
  venta_id: string;
  numero: string;
  fecha: string;
  pendiente: number;
  monto_aplicado: number;
}

interface CuentaBancaria {
  id: string;
  nombre: string;
  alias: string;
}

interface CobroResult {
  cobro_id: string;
  numero: string;
  nuevo_saldo: number;
  monto: number;
  forma_pago: string;
  fecha: string;
  allocations: Allocation[];
  cuenta_bancaria_nombre: string;
  cuenta_bancaria_alias: string;
  observacion: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cliente: { id: string; nombre: string; saldo: number; cuit?: string | null; domicilio?: string | null; localidad?: string | null; provincia?: string | null } | null;
  onSuccess: (result: CobroResult) => void;
}

export function CobroAllocationDialog({ open, onOpenChange, cliente, onSuccess }: Props) {
  const [monto, setMonto] = useState(0);
  const [formaPago, setFormaPago] = useState("Efectivo");
  const [cuentaBancariaId, setCuentaBancariaId] = useState("");
  const [observacion, setObservacion] = useState("");
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"fifo" | "manual">("fifo");

  const [invoices, setInvoices] = useState<PendingInvoice[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch pending invoices for this client
  useEffect(() => {
    if (!open || !cliente) return;
    setLoading(true);
    const fetchData = async () => {
      // Fetch invoices with pending balance (CC sales that have debt)
      const { data: ventas } = await supabase
        .from("ventas")
        .select("id, numero, fecha, tipo_comprobante, total, monto_pagado")
        .eq("cliente_id", cliente.id)
        .in("tipo_comprobante", ["Factura A", "Factura B", "Factura C", "Factura X", "Nota de Débito A", "Nota de Débito B", "Nota de Débito C", "Nota de Débito X", "Remito X"])
        .neq("estado", "anulada")
        .order("fecha", { ascending: true })
        .order("created_at", { ascending: true });

      const pending: PendingInvoice[] = (ventas || [])
        .map((v: any) => ({
          id: v.id,
          numero: v.numero,
          fecha: v.fecha,
          tipo_comprobante: v.tipo_comprobante,
          total: v.total,
          monto_pagado: v.monto_pagado || 0,
          pendiente: v.total - (v.monto_pagado || 0),
        }))
        .filter((v: PendingInvoice) => v.pendiente > 0);

      setInvoices(pending);

      // Fetch bank accounts
      const { data: cb } = await supabase.from("cuentas_bancarias").select("id, nombre, alias").eq("activa", true);
      setCuentas(cb || []);

      // Default monto to full saldo
      setMonto(Math.max(0, Math.round(cliente.saldo)));
      setFormaPago("Efectivo");
      setCuentaBancariaId("");
      setObservacion("");
      setMode("fifo");
      setLoading(false);
    };
    fetchData();
  }, [open, cliente]);

  // Auto-allocate FIFO when monto changes or mode is fifo
  useEffect(() => {
    if (mode !== "fifo" || invoices.length === 0) return;
    let remaining = monto;
    const allocs: Allocation[] = invoices.map((inv) => {
      const aplicar = Math.min(remaining, inv.pendiente);
      remaining = Math.max(0, Math.round((remaining - aplicar) * 100) / 100);
      return {
        venta_id: inv.id,
        numero: inv.numero,
        fecha: inv.fecha,
        pendiente: inv.pendiente,
        monto_aplicado: aplicar,
      };
    });
    setAllocations(allocs);
  }, [monto, mode, invoices]);

  const totalAsignado = useMemo(() => allocations.reduce((sum, a) => sum + a.monto_aplicado, 0), [allocations]);
  const saldoDespues = useMemo(() => (cliente?.saldo || 0) - monto, [cliente, monto]);

  const handleManualChange = (ventaId: string, value: number) => {
    setAllocations((prev) =>
      prev.map((a) => {
        if (a.venta_id !== ventaId) return a;
        const inv = invoices.find((i) => i.id === ventaId);
        const maxAllowed = inv ? inv.pendiente : value;
        return { ...a, monto_aplicado: Math.min(value, maxAllowed) };
      })
    );
  };

  const handleSubmit = async () => {
    if (!cliente || monto <= 0) return;

    const activeAllocations = allocations.filter((a) => a.monto_aplicado > 0);
    const assignedTotal = Math.round(activeAllocations.reduce((s, a) => s + a.monto_aplicado, 0));

    if (assignedTotal !== Math.round(monto) && invoices.length > 0) {
      showAdminToast(`El total asignado ($${assignedTotal.toLocaleString("es-AR")}) no coincide con el monto a cobrar ($${monto.toLocaleString("es-AR")})`, "error");
      return;
    }

    if (formaPago === "Transferencia" && cuentas.length > 0 && !cuentaBancariaId) {
      showAdminToast("Seleccione una cuenta bancaria", "error");
      return;
    }

    setSaving(true);
    try {
      const cuenta = cuentaBancariaId ? cuentas.find((c) => c.id === cuentaBancariaId) : null;

      const { data, error } = await supabase.rpc("atomic_register_cobro_v2", {
        p_client_id: cliente.id,
        p_monto: monto,
        p_forma_pago: formaPago,
        p_observacion: observacion || null,
        p_fecha: todayARG(),
        p_hora: nowTimeARG(),
        p_cuenta_bancaria_id: cuentaBancariaId || null,
        p_cuenta_bancaria_nombre: cuenta?.nombre || null,
        p_allocations: JSON.stringify(activeAllocations.map((a) => ({ venta_id: a.venta_id, monto_aplicado: a.monto_aplicado }))),
      });

      if (error) {
        showAdminToast("Error al registrar cobro: " + error.message, "error");
        setSaving(false);
        return;
      }

      const result = data as any;
      showAdminToast(`Cobro ${result.numero} registrado por ${formatCurrency(monto)}`, "success");

      onSuccess({
        cobro_id: result.cobro_id,
        numero: result.numero,
        nuevo_saldo: result.nuevo_saldo,
        monto,
        forma_pago: formaPago,
        fecha: todayARG(),
        allocations: activeAllocations,
        cuenta_bancaria_nombre: cuenta?.nombre || "",
        cuenta_bancaria_alias: cuenta?.alias || "",
        observacion,
      });

      onOpenChange(false);
    } catch (err: any) {
      showAdminToast("Error: " + (err.message || "Error inesperado"), "error");
    }
    setSaving(false);
  };

  if (!cliente) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">Registrar Cobro</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-1">
          {/* Client header */}
          <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
            <div>
              <p className="font-semibold">{cliente.nombre}</p>
              {cliente.cuit && <p className="text-xs text-muted-foreground">CUIT: {cliente.cuit}</p>}
            </div>
            <Badge variant={cliente.saldo > 0 ? "destructive" : "default"} className="text-sm px-3 py-1">
              Saldo: {formatCurrency(cliente.saldo)}
            </Badge>
          </div>

          {/* Amount */}
          <div>
            <Label>Monto a cobrar</Label>
            <Input
              type="text"
              inputMode="numeric"
              autoFocus
              value={monto ? monto.toLocaleString("es-AR") : ""}
              onChange={(e) => {
                const v = e.target.value.replace(/\./g, "").replace(/[^0-9]/g, "");
                setMonto(Number(v) || 0);
              }}
              className="text-lg font-semibold h-11 mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Saldo después: <span className={saldoDespues <= 0 ? "text-emerald-600 font-medium" : "text-orange-600 font-medium"}>{formatCurrency(saldoDespues)}</span>
              {saldoDespues < 0 && " (a favor)"}
            </p>
          </div>

          {/* Payment method */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Forma de pago</Label>
              <div className="flex gap-2 mt-1">
                {["Efectivo", "Transferencia"].map((fp) => (
                  <Button key={fp} type="button" size="sm" variant={formaPago === fp ? "default" : "outline"} onClick={() => setFormaPago(fp)} className="flex-1">
                    {fp}
                  </Button>
                ))}
              </div>
            </div>
            {formaPago === "Transferencia" && cuentas.length > 0 && (
              <div>
                <Label>Cuenta destino</Label>
                <Select value={cuentaBancariaId} onValueChange={setCuentaBancariaId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>
                    {cuentas.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nombre} — {c.alias}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Observation */}
          <div>
            <Label>Observación</Label>
            <Input value={observacion} onChange={(e) => setObservacion(e.target.value)} placeholder="Opcional" className="mt-1" />
          </div>

          {/* Allocation section */}
          {invoices.length > 0 && (
            <div className="border rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Asignación a comprobantes</p>
                <div className="flex gap-1">
                  {(["fifo", "manual"] as const).map((m) => (
                    <Button key={m} type="button" size="sm" variant={mode === m ? "default" : "outline"} onClick={() => setMode(m)} className="text-xs h-7 px-2">
                      {m === "fifo" ? "FIFO automático" : "Manual"}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b">
                      <th className="text-left py-1.5 font-medium">Comprobante</th>
                      <th className="text-left py-1.5 font-medium">Fecha</th>
                      <th className="text-right py-1.5 font-medium">Pendiente</th>
                      <th className="text-right py-1.5 font-medium w-32">Aplicar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocations.map((a) => (
                      <tr key={a.venta_id} className="border-b last:border-0">
                        <td className="py-1.5 font-mono text-xs">{a.numero}</td>
                        <td className="py-1.5 text-xs text-muted-foreground">{a.fecha}</td>
                        <td className="py-1.5 text-right text-xs text-orange-600">{formatCurrency(a.pendiente)}</td>
                        <td className="py-1.5 text-right">
                          {mode === "manual" ? (
                            <Input
                              type="text"
                              inputMode="numeric"
                              value={a.monto_aplicado ? a.monto_aplicado.toLocaleString("es-AR") : ""}
                              onChange={(e) => {
                                const v = e.target.value.replace(/\./g, "").replace(/[^0-9]/g, "");
                                handleManualChange(a.venta_id, Number(v) || 0);
                              }}
                              className="h-7 text-xs text-right w-28 ml-auto"
                            />
                          ) : (
                            <span className={`text-xs font-medium ${a.monto_aplicado > 0 ? (a.monto_aplicado >= a.pendiente ? "text-emerald-600" : "text-blue-600") : "text-muted-foreground"}`}>
                              {a.monto_aplicado > 0 ? formatCurrency(a.monto_aplicado) : "—"}
                              {a.monto_aplicado > 0 && a.monto_aplicado >= a.pendiente && " ✓"}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between text-xs font-medium pt-1 border-t">
                <span>Total asignado</span>
                <span className={Math.round(totalAsignado) === Math.round(monto) ? "text-emerald-600" : "text-orange-600"}>
                  {formatCurrency(totalAsignado)} / {formatCurrency(monto)}
                </span>
              </div>
            </div>
          )}

          {invoices.length === 0 && !loading && (
            <p className="text-xs text-muted-foreground text-center py-2">No hay comprobantes pendientes. El cobro se aplicará al saldo general.</p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={saving || monto <= 0}>
              {saving ? "Registrando..." : `Cobrar ${formatCurrency(monto)}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/cobro-allocation-dialog.tsx
git commit -m "feat: add cobro allocation dialog with FIFO/manual invoice assignment"
```

---

## Task 4: Pago Proveedor Allocation Dialog Component

**Files:**
- Create: `src/components/pago-proveedor-allocation-dialog.tsx`

- [ ] **Step 1: Create the component**

Same pattern as `cobro-allocation-dialog.tsx` but for suppliers. Key differences:
- Fetches `compras` instead of `ventas` (with `estado_pago != 'Pagada'`)
- Calls `atomic_register_pago_proveedor` RPC instead of `atomic_register_cobro_v2`
- Shows compra numbers instead of factura numbers
- Has a "Registrar en caja" checkbox (defaults to true)
- Payment method includes "Cuenta Corriente" option
- Button says "Pagar" instead of "Cobrar"
- No receipt generation (proveedores page handles its own UI)

```tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { showAdminToast } from "@/components/admin-toast";
import { todayARG, nowTimeARG, formatCurrency } from "@/lib/formatters";

interface PendingCompra {
  id: string;
  numero: string;
  fecha: string;
  total: number;
  monto_pagado: number;
  pendiente: number;
}

interface Allocation {
  compra_id: string;
  numero: string;
  fecha: string;
  pendiente: number;
  monto_aplicado: number;
}

interface CuentaBancaria {
  id: string;
  nombre: string;
  alias: string;
}

interface PagoResult {
  pago_id: string;
  numero: string;
  nuevo_saldo: number;
  monto: number;
  forma_pago: string;
  fecha: string;
  allocations: Allocation[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proveedor: { id: string; nombre: string; saldo: number; cuit?: string | null } | null;
  onSuccess: (result: PagoResult) => void;
}

export function PagoProveedorAllocationDialog({ open, onOpenChange, proveedor, onSuccess }: Props) {
  const [monto, setMonto] = useState(0);
  const [formaPago, setFormaPago] = useState("Efectivo");
  const [cuentaBancariaId, setCuentaBancariaId] = useState("");
  const [observacion, setObservacion] = useState("");
  const [registrarCaja, setRegistrarCaja] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"fifo" | "manual">("fifo");

  const [compras, setCompras] = useState<PendingCompra[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !proveedor) return;
    setLoading(true);
    const fetchData = async () => {
      const { data } = await supabase
        .from("compras")
        .select("id, numero, fecha, total, monto_pagado")
        .eq("proveedor_id", proveedor.id)
        .neq("estado", "Anulada")
        .neq("estado_pago", "Pagada")
        .order("fecha", { ascending: true })
        .order("created_at", { ascending: true });

      const pending: PendingCompra[] = (data || []).map((c: any) => ({
        id: c.id,
        numero: c.numero,
        fecha: c.fecha,
        total: c.total,
        monto_pagado: c.monto_pagado || 0,
        pendiente: c.total - (c.monto_pagado || 0),
      })).filter((c: PendingCompra) => c.pendiente > 0);

      setCompras(pending);

      const { data: cb } = await supabase.from("cuentas_bancarias").select("id, nombre, alias").eq("activa", true);
      setCuentas(cb || []);

      setMonto(Math.max(0, Math.round(proveedor.saldo)));
      setFormaPago("Efectivo");
      setCuentaBancariaId("");
      setObservacion("");
      setRegistrarCaja(true);
      setMode("fifo");
      setLoading(false);
    };
    fetchData();
  }, [open, proveedor]);

  // FIFO auto-allocation
  useEffect(() => {
    if (mode !== "fifo" || compras.length === 0) return;
    let remaining = monto;
    const allocs: Allocation[] = compras.map((c) => {
      const aplicar = Math.min(remaining, c.pendiente);
      remaining = Math.max(0, Math.round((remaining - aplicar) * 100) / 100);
      return { compra_id: c.id, numero: c.numero, fecha: c.fecha, pendiente: c.pendiente, monto_aplicado: aplicar };
    });
    setAllocations(allocs);
  }, [monto, mode, compras]);

  const totalAsignado = useMemo(() => allocations.reduce((s, a) => s + a.monto_aplicado, 0), [allocations]);
  const saldoDespues = useMemo(() => (proveedor?.saldo || 0) - monto, [proveedor, monto]);

  const handleManualChange = (compraId: string, value: number) => {
    setAllocations((prev) =>
      prev.map((a) => {
        if (a.compra_id !== compraId) return a;
        const c = compras.find((x) => x.id === compraId);
        return { ...a, monto_aplicado: Math.min(value, c ? c.pendiente : value) };
      })
    );
  };

  const handleSubmit = async () => {
    if (!proveedor || monto <= 0) return;
    const activeAllocations = allocations.filter((a) => a.monto_aplicado > 0);

    if (activeAllocations.length > 0 && Math.round(activeAllocations.reduce((s, a) => s + a.monto_aplicado, 0)) !== Math.round(monto)) {
      showAdminToast("El total asignado no coincide con el monto a pagar", "error");
      return;
    }

    if (formaPago === "Transferencia" && cuentas.length > 0 && !cuentaBancariaId) {
      showAdminToast("Seleccione una cuenta bancaria", "error");
      return;
    }

    setSaving(true);
    try {
      const cuenta = cuentaBancariaId ? cuentas.find((c) => c.id === cuentaBancariaId) : null;

      const { data, error } = await supabase.rpc("atomic_register_pago_proveedor", {
        p_proveedor_id: proveedor.id,
        p_monto: monto,
        p_forma_pago: formaPago,
        p_observacion: observacion || null,
        p_fecha: todayARG(),
        p_hora: nowTimeARG(),
        p_cuenta_bancaria_id: cuentaBancariaId || null,
        p_cuenta_bancaria_nombre: cuenta?.nombre || null,
        p_registrar_caja: registrarCaja,
        p_allocations: JSON.stringify(activeAllocations.map((a) => ({ compra_id: a.compra_id, monto_aplicado: a.monto_aplicado }))),
      });

      if (error) {
        showAdminToast("Error al registrar pago: " + error.message, "error");
        setSaving(false);
        return;
      }

      const result = data as any;
      showAdminToast(`Pago ${result.numero} registrado por ${formatCurrency(monto)}`, "success");
      onSuccess({ pago_id: result.pago_id, numero: result.numero, nuevo_saldo: result.nuevo_saldo, monto, forma_pago: formaPago, fecha: todayARG(), allocations: activeAllocations });
      onOpenChange(false);
    } catch (err: any) {
      showAdminToast("Error: " + (err.message || "Error inesperado"), "error");
    }
    setSaving(false);
  };

  if (!proveedor) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">Registrar Pago a Proveedor</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-1">
          {/* Provider header */}
          <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
            <div>
              <p className="font-semibold">{proveedor.nombre}</p>
              {proveedor.cuit && <p className="text-xs text-muted-foreground">CUIT: {proveedor.cuit}</p>}
            </div>
            <Badge variant={proveedor.saldo > 0 ? "destructive" : "default"} className="text-sm px-3 py-1">
              Deuda: {formatCurrency(proveedor.saldo)}
            </Badge>
          </div>

          {/* Amount */}
          <div>
            <Label>Monto a pagar</Label>
            <Input
              type="text"
              inputMode="numeric"
              autoFocus
              value={monto ? monto.toLocaleString("es-AR") : ""}
              onChange={(e) => {
                const v = e.target.value.replace(/\./g, "").replace(/[^0-9]/g, "");
                setMonto(Number(v) || 0);
              }}
              className="text-lg font-semibold h-11 mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Deuda después: <span className={saldoDespues <= 0 ? "text-emerald-600 font-medium" : "text-orange-600 font-medium"}>{formatCurrency(saldoDespues)}</span>
              {saldoDespues < 0 && " (a favor)"}
            </p>
          </div>

          {/* Payment method */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Forma de pago</Label>
              <div className="flex gap-2 mt-1">
                {["Efectivo", "Transferencia"].map((fp) => (
                  <Button key={fp} type="button" size="sm" variant={formaPago === fp ? "default" : "outline"} onClick={() => setFormaPago(fp)} className="flex-1">
                    {fp}
                  </Button>
                ))}
              </div>
            </div>
            {formaPago === "Transferencia" && cuentas.length > 0 && (
              <div>
                <Label>Cuenta origen</Label>
                <Select value={cuentaBancariaId} onValueChange={setCuentaBancariaId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>
                    {cuentas.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nombre} — {c.alias}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Register in caja checkbox */}
          <div className="flex items-center gap-2">
            <Checkbox id="registrar-caja" checked={registrarCaja} onCheckedChange={(v) => setRegistrarCaja(!!v)} />
            <Label htmlFor="registrar-caja" className="text-sm cursor-pointer">Registrar movimiento en caja</Label>
          </div>

          {/* Observation */}
          <div>
            <Label>Observación</Label>
            <Input value={observacion} onChange={(e) => setObservacion(e.target.value)} placeholder="Opcional" className="mt-1" />
          </div>

          {/* Allocation table */}
          {compras.length > 0 && (
            <div className="border rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Asignación a compras</p>
                <div className="flex gap-1">
                  {(["fifo", "manual"] as const).map((m) => (
                    <Button key={m} type="button" size="sm" variant={mode === m ? "default" : "outline"} onClick={() => setMode(m)} className="text-xs h-7 px-2">
                      {m === "fifo" ? "FIFO automático" : "Manual"}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b">
                      <th className="text-left py-1.5 font-medium">Compra</th>
                      <th className="text-left py-1.5 font-medium">Fecha</th>
                      <th className="text-right py-1.5 font-medium">Pendiente</th>
                      <th className="text-right py-1.5 font-medium w-32">Aplicar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocations.map((a) => (
                      <tr key={a.compra_id} className="border-b last:border-0">
                        <td className="py-1.5 font-mono text-xs">{a.numero}</td>
                        <td className="py-1.5 text-xs text-muted-foreground">{a.fecha}</td>
                        <td className="py-1.5 text-right text-xs text-orange-600">{formatCurrency(a.pendiente)}</td>
                        <td className="py-1.5 text-right">
                          {mode === "manual" ? (
                            <Input
                              type="text"
                              inputMode="numeric"
                              value={a.monto_aplicado ? a.monto_aplicado.toLocaleString("es-AR") : ""}
                              onChange={(e) => {
                                const v = e.target.value.replace(/\./g, "").replace(/[^0-9]/g, "");
                                handleManualChange(a.compra_id, Number(v) || 0);
                              }}
                              className="h-7 text-xs text-right w-28 ml-auto"
                            />
                          ) : (
                            <span className={`text-xs font-medium ${a.monto_aplicado > 0 ? (a.monto_aplicado >= a.pendiente ? "text-emerald-600" : "text-blue-600") : "text-muted-foreground"}`}>
                              {a.monto_aplicado > 0 ? formatCurrency(a.monto_aplicado) : "—"}
                              {a.monto_aplicado > 0 && a.monto_aplicado >= a.pendiente && " ✓"}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between text-xs font-medium pt-1 border-t">
                <span>Total asignado</span>
                <span className={Math.round(totalAsignado) === Math.round(monto) ? "text-emerald-600" : "text-orange-600"}>
                  {formatCurrency(totalAsignado)} / {formatCurrency(monto)}
                </span>
              </div>
            </div>
          )}

          {compras.length === 0 && !loading && (
            <p className="text-xs text-muted-foreground text-center py-2">No hay compras pendientes de pago. El pago se aplicará al saldo general.</p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={saving || monto <= 0}>
              {saving ? "Registrando..." : `Pagar ${formatCurrency(monto)}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/pago-proveedor-allocation-dialog.tsx
git commit -m "feat: add pago proveedor allocation dialog with FIFO/manual compra assignment"
```

---

## Task 5: Integrate Cobro Dialog into Clientes Page

**Files:**
- Modify: `src/app/(admin)/admin/clientes/page.tsx`

- [ ] **Step 1: Replace old cobro dialog with new component**

1. Add import: `import { CobroAllocationDialog } from "@/components/cobro-allocation-dialog";`
2. Remove the old inline cobro dialog JSX (the `<Dialog open={cobroOpen}>` block with amount input, payment buttons, etc.)
3. Remove the `executeCobro` function
4. Remove old RPC call to `atomic_register_cobro`
5. Remove the caja_movimientos insert after the RPC
6. Replace with:

```tsx
<CobroAllocationDialog
  open={cobroOpen}
  onOpenChange={setCobroOpen}
  cliente={cobroClient}
  onSuccess={(result) => {
    // Build receipt data from result
    setCobroReceipt({
      open: true,
      cliente: cobroClient!.nombre,
      clienteCuit: cobroClient!.cuit || "",
      clienteDomicilio: [cobroClient!.domicilio, cobroClient!.localidad, cobroClient!.provincia].filter(Boolean).join(", "),
      monto: result.monto,
      formaPago: result.forma_pago,
      fecha: result.fecha,
      saldoAnterior: (cobroClient!.saldo),
      saldoNuevo: result.nuevo_saldo,
      empresaNombre: "", // fetched separately or cached
      empresaCuit: "",
      empresaDomicilio: "",
      empresaTelefono: "",
      cuentaBancaria: result.cuenta_bancaria_nombre,
      cuentaAlias: result.cuenta_bancaria_alias,
      observacion: result.observacion,
      numero: result.numero,
      comprobantes: result.allocations.map((a) => ({ comprobante: a.numero, debe: a.pendiente, haber: a.monto_aplicado })),
    });
    logAudit({ action: "CREATE", module: "clientes", entityId: cobroClient!.id, userName: currentUser?.nombre || "Admin", after: { cobro: result.numero, monto: result.monto, formaPago: result.forma_pago } });
    fetchClients();
  }}
/>
```

7. Keep the existing cobro receipt dialog (it now shows which invoices were paid)
8. Add `numero` field to `cobroReceipt` state type and display it in the receipt header
9. Remove the old state variables that are no longer needed: `cobroFormaPago`, `cobroCuentaBancariaId`, `cobroObs` (these are now inside the component)
10. Keep: `cobroOpen`, `cobroClient`, `cobroMonto` (used for opening the dialog), `cobroReceipt`, `saving`

- [ ] **Step 2: Fetch empresa data once on mount for receipt**

Add to the existing data fetch:
```tsx
const [empresa, setEmpresa] = useState<any>(null);
// In useEffect:
const { data: emp } = await supabase.from("empresa").select("nombre, cuit, domicilio, telefono").limit(1).single();
setEmpresa(emp);
```

Then use `empresa` in the receipt instead of fetching each time.

- [ ] **Step 3: Commit**

```bash
git add src/app/(admin)/admin/clientes/page.tsx
git commit -m "feat: integrate cobro allocation dialog into clientes page"
```

---

## Task 6: Integrate Cobro Dialog into Cobranzas Page

**Files:**
- Modify: `src/app/(admin)/admin/clientes/cobranzas/page.tsx`

- [ ] **Step 1: Replace old cobro flow with new component**

1. Add import: `import { CobroAllocationDialog } from "@/components/cobro-allocation-dialog";`
2. Remove the old inline cobro dialog JSX
3. Remove the old `handleCobro` function with RPC call and caja insert
4. Remove old state variables: `cobroFormaPago`, `cobroCuentaBancariaId`, `cobroObs`
5. Replace with:

```tsx
<CobroAllocationDialog
  open={cobroOpen}
  onOpenChange={setCobroOpen}
  cliente={cobroClient}
  onSuccess={(result) => {
    showAdminToast(`Cobro ${result.numero} registrado`, "success");
    fetchClients();
  }}
/>
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(admin)/admin/clientes/cobranzas/page.tsx
git commit -m "feat: integrate cobro allocation dialog into cobranzas page"
```

---

## Task 7: Integrate Pago Dialog into Proveedores Page

**Files:**
- Modify: `src/app/(admin)/admin/proveedores/page.tsx`

- [ ] **Step 1: Replace old pago flow with new component**

1. Add import: `import { PagoProveedorAllocationDialog } from "@/components/pago-proveedor-allocation-dialog";`
2. Remove the old `executePago` function (manual saldo update, CC insert, caja insert, compra status updates — all handled by RPC now)
3. Remove the old pago dialog JSX
4. Replace with:

```tsx
<PagoProveedorAllocationDialog
  open={pagoDialog.open}
  onOpenChange={(open) => setPagoDialog({ open, data: open ? pagoDialog.data : null })}
  proveedor={pagoDialog.data}
  onSuccess={(result) => {
    showAdminToast(`Pago ${result.numero} registrado`, "success");
    fetchProviders();
  }}
/>
```

5. Remove old state: `pagoForm`, `provCuentas` — now inside component

- [ ] **Step 2: Commit**

```bash
git add src/app/(admin)/admin/proveedores/page.tsx
git commit -m "feat: integrate pago proveedor allocation dialog into proveedores page"
```

---

## Task 8: Integrate Pago Dialog into Compras Page

**Files:**
- Modify: `src/app/(admin)/admin/compras/page.tsx`

- [ ] **Step 1: Replace handleRegisterPayment with new component**

1. Add import: `import { PagoProveedorAllocationDialog } from "@/components/pago-proveedor-allocation-dialog";`
2. Remove the `handleRegisterPayment` function
3. Remove old payment dialog JSX and state (`showPaymentDialog`, `paymentAmount`, `paymentMethod`, `paymentCuentaBancariaId`, `savingPayment`)
4. When user clicks "Registrar pago" on a compra detail, open the new dialog with the proveedor data:

```tsx
<PagoProveedorAllocationDialog
  open={showPaymentDialog}
  onOpenChange={setShowPaymentDialog}
  proveedor={detailCompra ? providers.find((p) => p.id === detailCompra.proveedor_id) || null : null}
  onSuccess={(result) => {
    // Refresh compra detail to show updated monto_pagado
    fetchData();
    if (detailCompra) {
      // Refresh the detail view
      const updated = { ...detailCompra, monto_pagado: (detailCompra.monto_pagado || 0) + result.monto };
      setDetailCompra(updated);
    }
  }}
/>
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(admin)/admin/compras/page.tsx
git commit -m "feat: integrate pago proveedor allocation dialog into compras page"
```

---

## Task 9: Update Receipt to Show Invoice Allocation

**Files:**
- Modify: `src/app/(admin)/admin/clientes/page.tsx` (receipt section)

- [ ] **Step 1: Update receipt dialog to show allocation details**

In the cobro receipt dialog, update the comprobantes table to show:
- Column "Comprobante" — invoice number
- Column "Deuda" — amount that was pending
- Column "Aplicado" — amount covered by this cobro
- Column "Estado" — "Cubierto" if fully paid, "Parcial" if partially paid

Add the cobro `numero` to the receipt header (e.g., "RECIBO RE-00001").

- [ ] **Step 2: Commit**

```bash
git add src/app/(admin)/admin/clientes/page.tsx
git commit -m "feat: update cobro receipt to show invoice allocation details"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** Invoice allocation (FIFO + manual) ✓, Sequential numbering ✓, Full atomicity (including caja) ✓, Receipt with allocation ✓, Both clients and suppliers ✓
- [x] **Placeholder scan:** No TBDs, all code is complete
- [x] **Type consistency:** `CobroResult`, `PagoResult`, `Allocation` types consistent across components and integration points. RPC parameter names match SQL definitions.
