"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
// import { Checkbox } from "@/components/ui/checkbox";
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

export interface PagoResult {
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
  proveedor: {
    id: string;
    nombre: string;
    saldo: number;
    cuit?: string | null;
  } | null;
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

      const pending: PendingCompra[] = (data || [])
        .map((c: any) => ({
          id: c.id,
          numero: c.numero,
          fecha: c.fecha,
          total: c.total,
          monto_pagado: c.monto_pagado || 0,
          pendiente: c.total - (c.monto_pagado || 0),
        }))
        .filter((c: PendingCompra) => c.pendiente > 0);

      setCompras(pending);

      const { data: cb } = await supabase
        .from("cuentas_bancarias")
        .select("id, nombre, alias")
        .eq("activa", true);
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
    if (mode !== "fifo") return;
    let remaining = monto;
    const allocs: Allocation[] = compras.map((c) => {
      const aplicar = Math.min(remaining, c.pendiente);
      remaining = Math.max(0, Math.round((remaining - aplicar) * 100) / 100);
      return {
        compra_id: c.id,
        numero: c.numero,
        fecha: c.fecha,
        pendiente: c.pendiente,
        monto_aplicado: aplicar,
      };
    });
    setAllocations(allocs);
  }, [monto, mode, compras]);

  useEffect(() => {
    if (mode === "manual" && allocations.length === 0 && compras.length > 0) {
      setAllocations(
        compras.map((c) => ({
          compra_id: c.id,
          numero: c.numero,
          fecha: c.fecha,
          pendiente: c.pendiente,
          monto_aplicado: 0,
        }))
      );
    }
  }, [mode, compras]);

  const totalAsignado = useMemo(
    () => allocations.reduce((s, a) => s + a.monto_aplicado, 0),
    [allocations]
  );
  const saldoDespues = useMemo(
    () => (proveedor?.saldo || 0) - monto,
    [proveedor, monto]
  );

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
    if (!proveedor || monto <= 0 || saving) return;

    const activeAllocations = allocations.filter((a) => a.monto_aplicado > 0);

    if (
      compras.length > 0 &&
      activeAllocations.length > 0 &&
      Math.round(activeAllocations.reduce((s, a) => s + a.monto_aplicado, 0)) !== Math.round(monto)
    ) {
      showAdminToast("El total asignado no coincide con el monto a pagar", "error");
      return;
    }

    if (formaPago === "Transferencia" && cuentas.length > 0 && !cuentaBancariaId) {
      showAdminToast("Seleccione una cuenta bancaria", "error");
      return;
    }

    setSaving(true);
    try {
      const cuenta = cuentaBancariaId
        ? cuentas.find((c) => c.id === cuentaBancariaId)
        : null;

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
        p_allocations:
          activeAllocations.length > 0
            ? JSON.stringify(
                activeAllocations.map((a) => ({
                  compra_id: a.compra_id,
                  monto_aplicado: a.monto_aplicado,
                }))
              )
            : "[]",
      });

      if (error) {
        showAdminToast("Error al registrar pago: " + error.message, "error");
        setSaving(false);
        return;
      }

      const result = data as any;
      showAdminToast(`Pago ${result.numero} registrado por ${formatCurrency(monto)}`, "success");

      onSuccess({
        pago_id: result.pago_id,
        numero: result.numero,
        nuevo_saldo: result.nuevo_saldo,
        monto,
        forma_pago: formaPago,
        fecha: todayARG(),
        allocations: activeAllocations,
      });

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
              {proveedor.cuit && (
                <p className="text-xs text-muted-foreground">CUIT: {proveedor.cuit}</p>
              )}
            </div>
            <Badge
              variant={proveedor.saldo > 0 ? "destructive" : "default"}
              className="text-sm px-3 py-1"
            >
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
              Deuda después:{" "}
              <span
                className={
                  saldoDespues <= 0
                    ? "text-emerald-600 font-medium"
                    : "text-orange-600 font-medium"
                }
              >
                {formatCurrency(saldoDespues)}
              </span>
              {saldoDespues < 0 && " (a favor)"}
            </p>
          </div>

          {/* Payment method */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Forma de pago</Label>
              <div className="flex gap-2 mt-1">
                {["Efectivo", "Transferencia"].map((fp) => (
                  <Button
                    key={fp}
                    type="button"
                    size="sm"
                    variant={formaPago === fp ? "default" : "outline"}
                    onClick={() => setFormaPago(fp)}
                    className="flex-1"
                  >
                    {fp}
                  </Button>
                ))}
              </div>
            </div>
            {formaPago === "Transferencia" && cuentas.length > 0 && (
              <div>
                <Label>Cuenta origen</Label>
                <Select value={cuentaBancariaId} onValueChange={(v) => setCuentaBancariaId(v || "")}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {cuentas.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nombre} — {c.alias}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Register in caja */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="registrar-caja"
              checked={registrarCaja}
              onChange={(e) => setRegistrarCaja(e.target.checked)}
              className="rounded border-input"
            />
            <Label htmlFor="registrar-caja" className="text-sm cursor-pointer">
              Registrar movimiento en caja
            </Label>
          </div>

          {/* Observation */}
          <div>
            <Label>Observación</Label>
            <Input
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              placeholder="Opcional"
              className="mt-1"
            />
          </div>

          {/* Allocation table */}
          {compras.length > 0 && (
            <div className="border rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Asignación a compras</p>
                <div className="flex gap-1">
                  {(["fifo", "manual"] as const).map((m) => (
                    <Button
                      key={m}
                      type="button"
                      size="sm"
                      variant={mode === m ? "default" : "outline"}
                      onClick={() => setMode(m)}
                      className="text-xs h-7 px-2"
                    >
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
                        <td className="py-1.5 text-right text-xs text-orange-600">
                          {formatCurrency(a.pendiente)}
                        </td>
                        <td className="py-1.5 text-right">
                          {mode === "manual" ? (
                            <Input
                              type="text"
                              inputMode="numeric"
                              value={
                                a.monto_aplicado
                                  ? a.monto_aplicado.toLocaleString("es-AR")
                                  : ""
                              }
                              onChange={(e) => {
                                const v = e.target.value
                                  .replace(/\./g, "")
                                  .replace(/[^0-9]/g, "");
                                handleManualChange(a.compra_id, Number(v) || 0);
                              }}
                              className="h-7 text-xs text-right w-28 ml-auto"
                            />
                          ) : (
                            <span
                              className={`text-xs font-medium ${
                                a.monto_aplicado > 0
                                  ? a.monto_aplicado >= a.pendiente
                                    ? "text-emerald-600"
                                    : "text-blue-600"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {a.monto_aplicado > 0
                                ? formatCurrency(a.monto_aplicado)
                                : "—"}
                              {a.monto_aplicado > 0 &&
                                a.monto_aplicado >= a.pendiente &&
                                " ✓"}
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
                <span
                  className={
                    Math.round(totalAsignado) === Math.round(monto)
                      ? "text-emerald-600"
                      : "text-orange-600"
                  }
                >
                  {formatCurrency(totalAsignado)} / {formatCurrency(monto)}
                </span>
              </div>
            </div>
          )}

          {compras.length === 0 && !loading && (
            <p className="text-xs text-muted-foreground text-center py-2">
              No hay compras pendientes de pago. El pago se aplicará al saldo general.
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={saving || monto <= 0}>
              {saving ? "Registrando..." : `Pagar ${formatCurrency(monto)}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
