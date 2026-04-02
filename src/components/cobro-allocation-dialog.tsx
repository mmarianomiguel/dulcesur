"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { showAdminToast } from "@/components/admin-toast";
import { todayARG, nowTimeARG, formatCurrency } from "@/lib/formatters";
import { DollarSign, Banknote, ArrowLeftRight, Check, Plus, X } from "lucide-react";

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
  total: number;
  pendiente: number;
  monto_aplicado: number;
}

interface CuentaBancaria {
  id: string;
  nombre: string;
  alias: string;
}

interface PaymentLine {
  id: string;
  formaPago: "Efectivo" | "Transferencia";
  cuentaBancariaId: string;
  monto: number;
  montoInput: string;
}

export interface CobroResult {
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
  cliente: {
    id: string;
    nombre: string;
    saldo: number;
    cuit?: string | null;
    domicilio?: string | null;
    localidad?: string | null;
    provincia?: string | null;
  } | null;
  onSuccess: (result: CobroResult) => void;
}

let lineIdCounter = 0;
const newLineId = () => `line-${++lineIdCounter}`;

export function CobroAllocationDialog({ open, onOpenChange, cliente, onSuccess }: Props) {
  const [observacion, setObservacion] = useState("");
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"fifo" | "manual">("fifo");

  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([]);
  const [invoices, setInvoices] = useState<PendingInvoice[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch pending invoices when dialog opens
  useEffect(() => {
    if (!open || !cliente) return;
    setLoading(true);
    let cancelled = false;
    const fetchData = async () => {
      // Fetch all non-cancelled invoices — filter by pending amount client-side
      // (can't filter forma_pago because partial payments like Pedido Web have forma_pago=Efectivo)
      const { data: ventas } = await supabase
        .from("ventas")
        .select("id, numero, fecha, tipo_comprobante, total, monto_pagado, forma_pago, origen")
        .eq("cliente_id", cliente.id)
        .in("tipo_comprobante", [
          "Factura A", "Factura B", "Factura C", "Factura X",
          "Nota de Débito A", "Nota de Débito B", "Nota de Débito C", "Nota de Débito X",
          "Remito X", "Pedido Web",
        ])
        .neq("estado", "anulada")
        .order("fecha", { ascending: true })
        .order("created_at", { ascending: true });

      let pending: PendingInvoice[] = (ventas || [])
        .filter((v: any) => {
          // POS sales paid with Efectivo/Transferencia are fully paid — skip them
          // Only web orders (origen=tienda) or CC/Mixto/Pendiente can have real pending debt
          if (
            (v.forma_pago === "Efectivo" || v.forma_pago === "Transferencia") &&
            v.origen !== "tienda"
          ) return false;
          return true;
        })
        .map((v: any) => ({
          id: v.id,
          numero: v.numero,
          fecha: v.fecha,
          tipo_comprobante: v.tipo_comprobante,
          total: v.total,
          monto_pagado: v.monto_pagado || 0,
          pendiente: v.total - (v.monto_pagado || 0),
        }))
        .filter((v: PendingInvoice) => v.pendiente > 0.01);

      // Reconcile: client saldo is the source of truth.
      // If sum of pending invoices > client saldo, old payments weren't tracked in monto_pagado.
      // FIFO-reduce from oldest until total pending matches actual saldo.
      const clientSaldo = cliente.saldo;
      const sumPending = pending.reduce((s, v) => s + v.pendiente, 0);
      if (sumPending > clientSaldo + 0.01 && clientSaldo >= 0) {
        let excess = Math.round((sumPending - clientSaldo) * 100) / 100;
        pending = pending.map((v) => {
          if (excess <= 0) return v;
          const reduce = Math.min(excess, v.pendiente);
          excess = Math.round((excess - reduce) * 100) / 100;
          const newPendiente = Math.round((v.pendiente - reduce) * 100) / 100;
          return { ...v, monto_pagado: v.monto_pagado + reduce, pendiente: newPendiente };
        }).filter((v) => v.pendiente > 0.01);
      }

      if (cancelled) return;
      setInvoices(pending);

      const { data: cb } = await supabase
        .from("cuentas_bancarias")
        .select("id, nombre, alias")
        .eq("activo", true);
      if (cancelled) return;
      setCuentas(cb || []);

      setObservacion("");
      setMode("fifo");
      setPaymentLines([{ id: newLineId(), formaPago: "Efectivo", cuentaBancariaId: "", monto: 0, montoInput: "" }]);
      setLoading(false);
    };
    fetchData();
    return () => { cancelled = true; };
  }, [open, cliente]);

  // Total monto = sum of all payment lines
  const montoCobrar = useMemo(
    () => paymentLines.reduce((sum, l) => sum + l.monto, 0),
    [paymentLines]
  );

  // Total asignado = sum of allocations (what goes to invoices)
  const totalAsignado = useMemo(
    () => allocations.reduce((sum, a) => sum + a.monto_aplicado, 0),
    [allocations]
  );

  // In FIFO: totalAsignado follows montoCobrar. In manual: montoCobrar follows totalAsignado.
  // We use montoCobrar as the "cobrado" amount always.
  const totalCobrado = mode === "fifo" ? montoCobrar : totalAsignado;

  const saldoRestante = useMemo(
    () => (cliente?.saldo || 0) - totalCobrado,
    [cliente, totalCobrado]
  );

  // FIFO auto-allocation: distribute montoCobrar across invoices (oldest first)
  useEffect(() => {
    if (mode !== "fifo") return;
    let remaining = montoCobrar;
    const allocs: Allocation[] = invoices.map((inv) => {
      const aplicar = Math.min(remaining, inv.pendiente);
      remaining = Math.max(0, Math.round((remaining - aplicar) * 100) / 100);
      return {
        venta_id: inv.id,
        numero: inv.numero,
        fecha: inv.fecha,
        total: inv.total,
        pendiente: inv.pendiente,
        monto_aplicado: aplicar,
      };
    });
    setAllocations(allocs);
  }, [mode, invoices, montoCobrar]);

  // When switching to manual, reset allocations to zeros
  const [prevMode, setPrevMode] = useState(mode);
  useEffect(() => {
    if (mode === "manual" && prevMode !== "manual" && invoices.length > 0) {
      setAllocations(
        invoices.map((inv) => ({
          venta_id: inv.id,
          numero: inv.numero,
          fecha: inv.fecha,
          total: inv.total,
          pendiente: inv.pendiente,
          monto_aplicado: 0,
        }))
      );
    }
    setPrevMode(mode);
  }, [mode, invoices]);

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

  // Payment line handlers
  const updateLine = (lineId: string, updates: Partial<PaymentLine>) => {
    setPaymentLines((prev) => prev.map((l) => l.id === lineId ? { ...l, ...updates } : l));
  };

  const addLine = () => {
    setPaymentLines((prev) => [
      ...prev,
      { id: newLineId(), formaPago: "Efectivo", cuentaBancariaId: "", monto: 0, montoInput: "" },
    ]);
  };

  const removeLine = (lineId: string) => {
    setPaymentLines((prev) => prev.length <= 1 ? prev : prev.filter((l) => l.id !== lineId));
  };

  const handleSubmit = async () => {
    if (!cliente || totalCobrado <= 0 || saving) return;

    // Validate Transferencia lines have a bank account
    for (const line of paymentLines) {
      if (line.formaPago === "Transferencia" && line.monto > 0 && !line.cuentaBancariaId) {
        showAdminToast("Seleccione una cuenta bancaria para cada transferencia", "error");
        return;
      }
    }

    const activeLines = paymentLines.filter((l) => l.monto > 0);
    if (activeLines.length === 0) {
      showAdminToast("Ingrese al menos un pago", "error");
      return;
    }

    const activeAllocations = allocations.filter((a) => a.monto_aplicado > 0);

    setSaving(true);
    try {
      // Split allocations proportionally across payment lines
      let remainingAllocs = activeAllocations.map((a) => ({ ...a }));
      let lastResult: any = null;

      for (let i = 0; i < activeLines.length; i++) {
        const line = activeLines[i];
        const cuenta = line.cuentaBancariaId
          ? cuentas.find((c) => c.id === line.cuentaBancariaId)
          : null;

        // Carve out this line's share of allocations sequentially
        let lineRemaining = line.monto;
        const lineAllocs: { venta_id: string; monto_aplicado: number }[] = [];

        for (const alloc of remainingAllocs) {
          if (lineRemaining <= 0 || alloc.monto_aplicado <= 0) continue;
          const take = Math.min(lineRemaining, alloc.monto_aplicado);
          lineAllocs.push({ venta_id: alloc.venta_id, monto_aplicado: Math.round(take * 100) / 100 });
          alloc.monto_aplicado = Math.round((alloc.monto_aplicado - take) * 100) / 100;
          lineRemaining = Math.round((lineRemaining - take) * 100) / 100;
        }

        const { data, error } = await supabase.rpc("atomic_register_cobro_v2", {
          p_client_id: cliente.id,
          p_monto: line.monto,
          p_forma_pago: line.formaPago,
          p_observacion: observacion || null,
          p_fecha: todayARG(),
          p_hora: nowTimeARG(),
          p_cuenta_bancaria_id: line.cuentaBancariaId || null,
          p_cuenta_bancaria_nombre: cuenta?.nombre || null,
          p_allocations: lineAllocs,
        });

        if (error) {
          showAdminToast("Error al registrar cobro: " + error.message, "error");
          setSaving(false);
          return;
        }

        lastResult = data;
      }

      const result = lastResult as any;
      const mainLine = activeLines[0];
      const mainCuenta = mainLine.cuentaBancariaId
        ? cuentas.find((c) => c.id === mainLine.cuentaBancariaId)
        : null;

      const formaDesc = activeLines.length === 1
        ? mainLine.formaPago
        : activeLines.map((l) => `${l.formaPago} ${formatCurrency(l.monto)}`).join(" + ");

      showAdminToast(
        `${activeLines.length > 1 ? `${activeLines.length} cobros registrados` : `Cobro ${result.numero} registrado`} por ${formatCurrency(totalCobrado)}`,
        "success"
      );

      onSuccess({
        cobro_id: result.cobro_id,
        numero: result.numero,
        nuevo_saldo: result.nuevo_saldo,
        monto: totalCobrado,
        forma_pago: formaDesc,
        fecha: todayARG(),
        allocations: activeAllocations,
        cuenta_bancaria_nombre: mainCuenta?.nombre || "",
        cuenta_bancaria_alias: mainCuenta?.alias || "",
        observacion,
      });

      onOpenChange(false);
    } catch (err: any) {
      showAdminToast("Error: " + (err.message || "Error inesperado"), "error");
    }
    setSaving(false);
  };

  if (!cliente) return null;

  const saldoTotal = cliente.saldo;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0" showCloseButton={false}>
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center">
                <DollarSign className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="text-[15px] font-bold">Registrar Cobro</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {cliente.nombre}
                  <span className="mx-1 text-muted-foreground/40">|</span>
                  Saldo: <span className="font-semibold text-orange-500">{formatCurrency(saldoTotal)}</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 space-y-5">
          {/* Section 1: Comprobantes pendientes de pago */}
          {invoices.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Comprobantes pendientes de pago
                </h3>
                <div className="flex gap-1">
                  {(["fifo", "manual"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-colors ${
                        mode === m
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {m === "fifo" ? "FIFO" : "Manual"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border rounded-xl overflow-hidden">
                <div className="max-h-52 overflow-y-auto">
                  <table className="w-full text-[12px]">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-muted/50 border-b">
                        <th className="text-left py-2 px-3 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">Comprobante N°</th>
                        <th className="text-left py-2 px-3 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground w-20">Fecha</th>
                        <th className="text-right py-2 px-3 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground w-24">Total FC</th>
                        <th className="text-right py-2 px-3 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground w-24">Saldo FC</th>
                        <th className="text-right py-2 px-3 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground w-28">Pago</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allocations.map((a) => {
                        const inv = invoices.find((i) => i.id === a.venta_id);
                        const hasPago = a.monto_aplicado > 0;
                        const fullPaid = hasPago && a.monto_aplicado >= a.pendiente;
                        return (
                          <tr key={a.venta_id} className={`border-b last:border-0 ${hasPago ? "hover:bg-emerald-50/30" : "hover:bg-muted/30"}`}>
                            <td className="py-2.5 px-3 font-mono text-xs">{a.numero}</td>
                            <td className="py-2.5 px-3 text-xs text-muted-foreground tabular-nums">
                              {new Date(a.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                            </td>
                            <td className="py-2.5 px-3 text-right text-xs tabular-nums">
                              {formatCurrency(inv?.total || a.pendiente)}
                            </td>
                            <td className="py-2.5 px-3 text-right text-xs font-medium text-orange-600 tabular-nums">
                              {formatCurrency(a.pendiente)}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              {mode === "manual" ? (
                                <div className="relative ml-auto w-28">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">$</span>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={a.monto_aplicado ? a.monto_aplicado.toLocaleString("es-AR") : ""}
                                    onChange={(e) => {
                                      const v = e.target.value.replace(/[^0-9.,]/g, "").replace(/\./g, "").replace(",", ".");
                                      handleManualChange(a.venta_id, parseFloat(v) || 0);
                                    }}
                                    placeholder="0"
                                    className={`w-full rounded-lg h-7 text-xs font-semibold text-right pr-2.5 pl-5 tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-400 ${
                                      hasPago
                                        ? "border border-emerald-300 bg-emerald-50/50 text-emerald-700"
                                        : "border border-input bg-background text-muted-foreground placeholder:text-muted-foreground/40"
                                    }`}
                                  />
                                </div>
                              ) : (
                                <span
                                  className={`text-xs font-bold tabular-nums ${
                                    fullPaid
                                      ? "text-emerald-600"
                                      : hasPago
                                        ? "text-blue-600"
                                        : "text-muted-foreground"
                                  }`}
                                >
                                  {hasPago ? formatCurrency(a.monto_aplicado) : "—"}
                                  {fullPaid && " \u2713"}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Saldo total footer */}
                <div className="bg-muted/50 border-t px-4 py-2.5 flex items-center justify-end">
                  <span className="text-xs text-muted-foreground mr-3 font-medium">Saldo total</span>
                  <span className="text-sm font-bold text-orange-600 tabular-nums">{formatCurrency(saldoTotal)}</span>
                </div>
              </div>
            </div>
          )}

          {invoices.length === 0 && !loading && (
            <div className="text-center py-4 text-muted-foreground">
              <p className="text-sm">No hay comprobantes pendientes.</p>
              <p className="text-xs mt-1">El cobro se aplicará al saldo general.</p>
            </div>
          )}

          {/* Section 2: Detalle de cobros — multi-line */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Detalle de cobros
              </h3>
              <button
                type="button"
                onClick={addLine}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-muted-foreground hover:bg-muted border border-dashed border-muted-foreground/30 transition-colors"
              >
                <Plus className="w-3 h-3" />
                Agregar pago
              </button>
            </div>

            <div className="border rounded-xl overflow-hidden">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="text-left py-2 px-3 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">Forma de pago</th>
                    <th className="text-left py-2 px-3 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">Detalle / Cuenta</th>
                    <th className="text-right py-2 px-3 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground w-28">Recibido</th>
                    <th className="text-right py-2 px-3 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground w-28">Importe</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {paymentLines.map((line) => (
                    <tr key={line.id} className="border-b last:border-0 hover:bg-muted/30">
                      {/* Payment method */}
                      <td className="py-2.5 px-3">
                        <div className="flex gap-1.5">
                          {(["Efectivo", "Transferencia"] as const).map((fp) => (
                            <button
                              key={fp}
                              type="button"
                              onClick={() => {
                                const updates: Partial<PaymentLine> = { formaPago: fp };
                                if (fp === "Transferencia" && cuentas.length > 0) {
                                  updates.cuentaBancariaId = cuentas[0].id;
                                }
                                if (fp === "Efectivo") {
                                  updates.cuentaBancariaId = "";
                                }
                                updateLine(line.id, updates);
                              }}
                              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-all ${
                                line.formaPago === fp
                                  ? fp === "Efectivo"
                                    ? "bg-green-50 border border-green-200 text-green-700 dark:bg-green-950 dark:border-green-800 dark:text-green-400"
                                    : "bg-violet-50 border border-violet-200 text-violet-700 dark:bg-violet-950 dark:border-violet-800 dark:text-violet-400"
                                  : "border border-transparent text-muted-foreground hover:bg-muted"
                              }`}
                            >
                              {fp === "Efectivo" ? <Banknote className="w-3 h-3" /> : <ArrowLeftRight className="w-3 h-3" />}
                              {fp}
                            </button>
                          ))}
                        </div>
                      </td>
                      {/* Account / detail — dropdown */}
                      <td className="py-2.5 px-3">
                        {line.formaPago === "Transferencia" && cuentas.length > 0 ? (
                          <select
                            value={line.cuentaBancariaId}
                            onChange={(e) => updateLine(line.id, { cuentaBancariaId: e.target.value })}
                            className="h-7 rounded-lg border border-input bg-background text-xs px-2 pr-7 focus:outline-none focus:ring-2 focus:ring-violet-400 w-full max-w-[220px]"
                          >
                            <option value="">Seleccionar cuenta...</option>
                            {cuentas.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.nombre}{c.alias ? ` — ${c.alias}` : ""}
                              </option>
                            ))}
                          </select>
                        ) : line.formaPago === "Transferencia" && cuentas.length === 0 ? (
                          <span className="text-xs text-muted-foreground italic">Sin cuentas bancarias</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      {/* Recibido — editable input */}
                      <td className="py-2.5 px-3 text-right">
                        <div className="relative ml-auto w-28">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">$</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={line.montoInput}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^0-9.,]/g, "").replace(/\./g, "").replace(",", ".");
                              const num = parseFloat(raw) || 0;
                              updateLine(line.id, {
                                monto: num,
                                montoInput: num > 0 ? num.toLocaleString("es-AR") : raw === "" ? "" : "0",
                              });
                            }}
                            placeholder="0"
                            className={`w-full rounded-lg h-7 text-xs font-semibold text-right pr-2.5 pl-5 tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-400 ${
                              line.monto > 0
                                ? "border border-emerald-300 bg-emerald-50/50 text-emerald-700"
                                : "border border-input bg-background text-muted-foreground placeholder:text-muted-foreground/40"
                            }`}
                          />
                        </div>
                      </td>
                      {/* Importe */}
                      <td className="py-2.5 px-3 text-right tabular-nums text-xs font-bold">
                        {formatCurrency(line.monto)}
                      </td>
                      {/* Remove */}
                      <td className="py-2.5 pr-3">
                        {paymentLines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeLine(line.id)}
                            className="p-0.5 rounded text-muted-foreground/40 hover:text-red-500 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Observation */}
            <div className="mt-2">
              <Input
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                placeholder="Observación (opcional)"
                className="h-8 text-xs"
              />
            </div>
          </div>

          {/* Bottom summary */}
          <div className="bg-muted/50 rounded-xl border p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Cobrado</p>
                  <p className="text-base font-bold text-emerald-600 tabular-nums">{formatCurrency(totalCobrado)}</p>
                </div>
                <div className="w-px h-8 bg-border" />
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Saldo restante</p>
                  <p className={`text-base font-bold tabular-nums ${saldoRestante < 0 ? "text-blue-600" : saldoRestante === 0 ? "text-emerald-600" : "text-orange-600"}`}>
                    {saldoRestante < 0
                      ? <>{formatCurrency(Math.abs(saldoRestante))} <span className="text-[10px] font-medium text-blue-500">a favor</span></>
                      : saldoRestante === 0
                        ? <>{formatCurrency(0)} <span className="text-[10px] font-medium text-emerald-500">saldado</span></>
                        : formatCurrency(saldoRestante)
                    }
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="h-10" onClick={() => onOpenChange(false)} disabled={saving}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={saving || totalCobrado <= 0}
                  className="h-10 bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-sm"
                >
                  <Check className="w-4 h-4" />
                  {saving ? "Registrando..." : "Guardar e Imprimir"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
