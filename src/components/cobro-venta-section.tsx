"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/formatters";
import { Loader2 } from "lucide-react";

// ─── SVG Icons (matching mockup exactly) ───
const IconDollar = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
);
const IconTransfer = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"/></svg>
);
const IconMixto = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"/><path strokeLinecap="round" d="M12 6v12"/></svg>
);
const IconBook = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"/></svg>
);
const IconInfo = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/></svg>
);
const IconCheck = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
);

// ─── Types ───

interface CuentaBancaria {
  id: string;
  nombre: string;
  alias: string;
}

interface PendingInvoice {
  id: string;
  numero: string;
  fecha: string;
  pendiente: number;
}

interface FIFOAllocation {
  venta_id: string;
  numero: string;
  fecha: string;
  pendiente: number;
  aplicar: number;
}

export interface CobroVentaResult {
  metodo: string;
  monto: number;
  efectivo: number;
  transferencia: number;
  cuentaCorriente: number;
  surcharge: number;
  cuentaBancaria: string;
  cuentaBancariaId: string;
  cobrarSaldo: boolean;
  saldoAllocations: FIFOAllocation[];
}

interface Props {
  ventaId: string;
  clienteId: string;
  clienteNombre: string;
  clienteSaldo: number;
  montoVenta: number;
  subtotalItems: number;
  costoEnvio: number;
  recargoTransferencia: number;
  cuentasBancarias: CuentaBancaria[];
  defaultMetodo?: string;
  defaultEfectivo?: number;
  defaultTransferencia?: number;
  defaultCuentaAlias?: string;
  onConfirmar: (result: CobroVentaResult) => Promise<void>;
}

type MetodoPago = "Efectivo" | "Transferencia" | "Mixto" | "Cuenta Corriente";

export function CobroVentaSection({
  ventaId, clienteId, clienteNombre, clienteSaldo, montoVenta,
  subtotalItems, costoEnvio, recargoTransferencia, cuentasBancarias,
  defaultMetodo, defaultEfectivo, defaultTransferencia, defaultCuentaAlias,
  onConfirmar,
}: Props) {
  // ─── State ───
  const [metodo, setMetodo] = useState<MetodoPago>("Efectivo");
  const [cuentaBancariaId, setCuentaBancariaId] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const submittingRef = useRef(false);

  // Mixto toggles (like POS)
  const [mixtoToggleEfectivo, setMixtoToggleEfectivo] = useState(true);
  const [mixtoToggleTransferencia, setMixtoToggleTransferencia] = useState(true);
  const [mixtoToggleCuentaCorriente, setMixtoToggleCuentaCorriente] = useState(false);
  const [mixtoEfectivo, setMixtoEfectivo] = useState(0);
  const [mixtoCuentaCorriente, setMixtoCuentaCorriente] = useState(0);

  // Cobrar saldo adeudado
  const [cobrarSaldo, setCobrarSaldo] = useState(false);
  const [saldoMode, setSaldoMode] = useState<"fifo" | "manual">("fifo");
  const [pendingInvoices, setPendingInvoices] = useState<PendingInvoice[]>([]);
  const [saldoAllocations, setSaldoAllocations] = useState<FIFOAllocation[]>([]);

  // ─── Pre-fill from defaults ───
  useEffect(() => {
    if (defaultMetodo) {
      const m = defaultMetodo.toLowerCase();
      if (m.includes("transferencia")) setMetodo("Transferencia");
      else if (m.includes("mixto")) setMetodo("Mixto");
      else if (m.includes("cuenta")) setMetodo("Cuenta Corriente");
      else setMetodo("Efectivo");
    }
    if (defaultCuentaAlias) {
      const match = cuentasBancarias.find(
        (c) => c.alias === defaultCuentaAlias || c.nombre === defaultCuentaAlias
      );
      if (match) setCuentaBancariaId(match.id);
    }
  }, [defaultMetodo, defaultCuentaAlias, cuentasBancarias]);

  // Auto-select first bank account for Transferencia/Mixto
  useEffect(() => {
    if ((metodo === "Transferencia" || (metodo === "Mixto" && mixtoToggleTransferencia)) && !cuentaBancariaId && cuentasBancarias.length > 0) {
      setCuentaBancariaId(cuentasBancarias[0].id);
    }
  }, [metodo, mixtoToggleTransferencia, cuentasBancarias]);

  // ─── Mixto computed ───
  const mixtoActiveMethods = useMemo(() => {
    const m: string[] = [];
    if (mixtoToggleEfectivo) m.push("efectivo");
    if (mixtoToggleTransferencia) m.push("transferencia");
    if (mixtoToggleCuentaCorriente) m.push("corriente");
    return m;
  }, [mixtoToggleEfectivo, mixtoToggleTransferencia, mixtoToggleCuentaCorriente]);

  // Transferencia is auto-calculated as remainder
  const mixtoTransferencia = useMemo(() => {
    if (!mixtoToggleTransferencia) return 0;
    return Math.max(0, Math.round((montoVenta - mixtoEfectivo - mixtoCuentaCorriente) * 100) / 100);
  }, [montoVenta, mixtoEfectivo, mixtoCuentaCorriente, mixtoToggleTransferencia]);

  const mixtoSum = mixtoEfectivo + mixtoTransferencia + mixtoCuentaCorriente;
  const mixtoRemaining = Math.round((montoVenta - mixtoSum) * 100) / 100;

  // ─── Fetch pending invoices when cobrar saldo enabled ───
  useEffect(() => {
    if (!cobrarSaldo || !clienteId || clienteSaldo <= 0) {
      setPendingInvoices([]);
      setSaldoAllocations([]);
      return;
    }
    let cancelled = false;
    const fetchPending = async () => {
      const { data: ventas } = await supabase
        .from("ventas")
        .select("id, numero, fecha, tipo_comprobante, total, monto_pagado, forma_pago, origen")
        .eq("cliente_id", clienteId)
        .neq("estado", "anulada")
        .neq("id", ventaId)
        .order("fecha", { ascending: true })
        .order("created_at", { ascending: true });

      let pending = (ventas || [])
        .filter((v: any) => {
          if ((v.forma_pago === "Efectivo" || v.forma_pago === "Transferencia") && v.origen !== "tienda") return false;
          return true;
        })
        .map((v: any) => ({
          id: v.id, numero: v.numero, fecha: v.fecha,
          pendiente: v.total - (v.monto_pagado || 0),
        }))
        .filter((v) => v.pendiente > 0.01);

      const sumPending = pending.reduce((s, v) => s + v.pendiente, 0);
      if (sumPending > clienteSaldo + 0.01 && clienteSaldo >= 0) {
        let excess = Math.round((sumPending - clienteSaldo) * 100) / 100;
        pending = pending.map((v) => {
          if (excess <= 0) return v;
          const reduce = Math.min(excess, v.pendiente);
          excess = Math.round((excess - reduce) * 100) / 100;
          return { ...v, pendiente: Math.round((v.pendiente - reduce) * 100) / 100 };
        }).filter((v) => v.pendiente > 0.01);
      }
      if (!cancelled) {
        setPendingInvoices(pending);
      }
    };
    fetchPending();
    return () => { cancelled = true; };
  }, [cobrarSaldo, clienteId, clienteSaldo, ventaId]);

  // FIFO auto-allocation
  useEffect(() => {
    if (!cobrarSaldo || saldoMode !== "fifo") return;
    let remaining = clienteSaldo;
    setSaldoAllocations(pendingInvoices.map((inv) => {
      const aplicar = Math.min(remaining, inv.pendiente);
      remaining = Math.max(0, Math.round((remaining - aplicar) * 100) / 100);
      return { venta_id: inv.id, numero: inv.numero, fecha: inv.fecha, pendiente: inv.pendiente, aplicar };
    }));
  }, [cobrarSaldo, saldoMode, pendingInvoices, clienteSaldo]);

  useEffect(() => {
    if (saldoMode === "manual" && pendingInvoices.length > 0) {
      setSaldoAllocations(pendingInvoices.map((inv) => ({
        venta_id: inv.id, numero: inv.numero, fecha: inv.fecha, pendiente: inv.pendiente, aplicar: 0,
      })));
    }
  }, [saldoMode, pendingInvoices]);

  // ─── Computed values ───
  const recPct = recargoTransferencia || 0;

  const surcharge = useMemo(() => {
    if (recPct <= 0) return 0;
    if (metodo === "Transferencia") return Math.round(montoVenta * recPct) / 100;
    if (metodo === "Mixto") return Math.round(mixtoTransferencia * recPct) / 100;
    return 0;
  }, [metodo, montoVenta, mixtoTransferencia, recPct]);

  const saldoTotalAsignado = useMemo(
    () => saldoAllocations.reduce((s, a) => s + a.aplicar, 0),
    [saldoAllocations]
  );

  // For non-Mixto: effective CC amount
  const effectiveCC = metodo === "Cuenta Corriente" ? montoVenta : metodo === "Mixto" ? mixtoCuentaCorriente : 0;
  const effectiveEf = metodo === "Efectivo" ? montoVenta : metodo === "Mixto" ? mixtoEfectivo : 0;
  const effectiveTr = metodo === "Transferencia" ? montoVenta : metodo === "Mixto" ? mixtoTransferencia : 0;

  const totalACobrar = (montoVenta + surcharge) + (cobrarSaldo ? saldoTotalAsignado : 0);

  // Show transfer UI?
  const showTransferUI = metodo === "Transferencia" || (metodo === "Mixto" && mixtoToggleTransferencia);

  const cuentaSelected = cuentasBancarias.find((c) => c.id === cuentaBancariaId);

  // ─── Validation ───
  const canConfirm = useMemo(() => {
    if (saving || done) return false;
    // CC requires a client
    if (metodo === "Cuenta Corriente" && !clienteId) return false;
    if (metodo === "Mixto") {
      if (mixtoActiveMethods.length < 2) return false;
      if (Math.abs(mixtoRemaining) >= 1) return false;
      // At least one method must have a non-zero amount
      if (mixtoEfectivo + mixtoTransferencia + mixtoCuentaCorriente <= 0) return false;
      // CC in Mixto also requires client
      if (mixtoCuentaCorriente > 0 && !clienteId) return false;
    }
    // Transferencia requires a bank account (even if none configured — block it)
    if (showTransferUI && !cuentaBancariaId) return false;
    return true;
  }, [saving, done, metodo, clienteId, mixtoActiveMethods, mixtoRemaining, mixtoEfectivo, mixtoTransferencia, mixtoCuentaCorriente, showTransferUI, cuentaBancariaId]);

  // ─── Submit ───
  const handleConfirmar = async () => {
    if (!canConfirm || submittingRef.current) return;
    submittingRef.current = true;
    setSaving(true);
    try {
      await onConfirmar({
        metodo,
        monto: montoVenta,
        efectivo: effectiveEf,
        transferencia: effectiveTr,
        cuentaCorriente: effectiveCC,
        surcharge,
        cuentaBancaria: cuentaSelected ? `${cuentaSelected.nombre}${cuentaSelected.alias ? ` — ${cuentaSelected.alias}` : ""}` : "",
        cuentaBancariaId,
        cobrarSaldo,
        saldoAllocations: cobrarSaldo ? saldoAllocations.filter((a) => a.aplicar > 0) : [],
      });
      setDone(true);
    } catch (err: any) {
      const { showAdminToast } = await import("@/components/admin-toast");
      showAdminToast("Error al registrar cobro: " + (err.message || "Error inesperado"), "error");
    } finally {
      setSaving(false);
      submittingRef.current = false;
    }
  };

  // ─── Render ───
  const metodos: { value: MetodoPago; label: string; Icon: typeof IconDollar }[] = [
    { value: "Efectivo", label: "Efectivo", Icon: IconDollar },
    { value: "Transferencia", label: "Transferencia", Icon: IconTransfer },
    { value: "Mixto", label: "Mixto", Icon: IconMixto },
    { value: "Cuenta Corriente", label: "Cta Cte", Icon: IconBook },
  ];

  return (
    <div className="space-y-4">
      {/* Section title */}
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100">
          <IconDollar className="w-3.5 h-3.5 text-emerald-600" />
        </div>
        <h3 className="text-sm font-semibold text-gray-900">Registrar cobro</h3>
      </div>

      {/* Payment method selector */}
      <div>
        <label className="text-xs font-medium text-gray-500 mb-1.5 block">Forma de pago</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {metodos.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setMetodo(value)}
              className={`flex flex-col items-center gap-1 rounded-lg border-2 p-2 text-[11px] font-medium transition-all ${
                metodo === value
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700 font-semibold ring-1 ring-emerald-500/20"
                  : "border-gray-200 bg-white text-gray-400 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              <Icon />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── MIXTO: POS-style toggles + inputs ─── */}
      {metodo === "Mixto" && (
        <div className="space-y-3">
          {/* Toggle methods */}
          <div>
            <p className="text-[10px] font-semibold tracking-wider text-gray-500 uppercase mb-1.5">Métodos a combinar</p>
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
              {[
                { key: "efectivo", label: "Efectivo", Icon: IconDollar, active: mixtoToggleEfectivo, toggle: setMixtoToggleEfectivo, disabled: false },
                { key: "transferencia", label: "Transf.", Icon: IconTransfer, active: mixtoToggleTransferencia, toggle: setMixtoToggleTransferencia, disabled: false },
                { key: "corriente", label: "Cta. Cte.", Icon: IconBook, active: mixtoToggleCuentaCorriente, toggle: setMixtoToggleCuentaCorriente, disabled: !clienteId },
              ].map(({ key, label, Icon, active, toggle, disabled }) => (
                <button
                  key={key}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    const next = !active;
                    toggle(next);
                    if (!next) {
                      if (key === "efectivo") setMixtoEfectivo(0);
                      if (key === "corriente") setMixtoCuentaCorriente(0);
                    }
                  }}
                  className={`flex flex-col items-center gap-1 rounded-lg border-2 p-2 sm:p-2.5 transition-all text-xs font-medium ${
                    disabled
                      ? "border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed"
                      : active
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                        : "border-gray-200 bg-white hover:bg-gray-50 text-gray-400"
                  }`}
                >
                  <Icon />
                  {label}
                </button>
              ))}
            </div>
            {!clienteId && (
              <p className="text-[10px] text-amber-600 mt-1">* Selecciona un cliente para usar Cuenta Corriente</p>
            )}
          </div>

          {/* Amount inputs — Efectivo / CC editable, Transferencia readonly */}
          {mixtoActiveMethods.length >= 2 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
              {[
                { key: "efectivo", label: "Efectivo", active: mixtoToggleEfectivo },
                { key: "corriente", label: "Cta. Cte.", active: mixtoToggleCuentaCorriente },
              ]
                .filter(({ active }) => active)
                .map(({ key, label }) => {
                  const value = key === "efectivo" ? mixtoEfectivo : mixtoCuentaCorriente;
                  const setter = key === "efectivo" ? setMixtoEfectivo : setMixtoCuentaCorriente;
                  return (
                    <div key={key} className="space-y-1">
                      <label className="text-[10px] font-medium text-gray-500">{label}</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                        <Input
                          type="text"
                          inputMode="numeric"
                          value={value ? new Intl.NumberFormat("es-AR").format(value) : ""}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^0-9.,]/g, "").replace(/\./g, "").replace(",", ".");
                            const val = Math.max(0, Math.min(parseFloat(raw) || 0, montoVenta));
                            setter(val);
                            // Auto-fill the other non-transfer field as remainder
                            if (!mixtoToggleTransferencia) {
                              const otherSetter = key === "efectivo" ? setMixtoCuentaCorriente : setMixtoEfectivo;
                              otherSetter(Math.max(0, montoVenta - val));
                            }
                          }}
                          className="pl-6 h-9 text-right text-sm font-medium"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  );
                })}
              {/* Transferencia: readonly, auto-calculated */}
              {mixtoToggleTransferencia && (
                <div className="col-span-2 sm:col-span-1 space-y-1">
                  <label className="text-[10px] font-medium text-gray-500">Transferencia</label>
                  {(() => {
                    const transfRecargo = recPct > 0 ? Math.round(mixtoTransferencia * recPct / 100) : 0;
                    return (
                      <div className="h-9 rounded-md border bg-gray-50 px-3 flex items-center justify-end text-sm font-medium text-gray-700">
                        {formatCurrency(mixtoTransferencia + transfRecargo)}
                      </div>
                    );
                  })()}
                  {recPct > 0 && mixtoTransferencia > 0 && (
                    <p className="text-[9px] text-emerald-600">inc. {recPct}% recargo</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Assigned indicator */}
          {mixtoActiveMethods.length >= 2 && (
            <div className="flex items-center justify-between text-xs">
              <span className={Math.abs(mixtoRemaining) < 1 ? "text-emerald-600 font-medium" : "text-amber-600 font-medium"}>
                Asignado: {formatCurrency(mixtoSum)} / {formatCurrency(montoVenta)}
              </span>
              {mixtoRemaining > 0.01 && (
                <span className="text-amber-600 font-medium">Falta: {formatCurrency(mixtoRemaining)}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Bank account selector — card-style buttons */}
      {showTransferUI && cuentasBancarias.length > 0 && (
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1.5 block">
            Cuenta destino{metodo === "Mixto" ? " (para transferencia)" : ""}
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {cuentasBancarias.map((c) => {
              const isSelected = cuentaBancariaId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCuentaBancariaId(c.id)}
                  className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-xs font-medium text-left transition-all ${
                    isSelected
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full shrink-0 ${isSelected ? "bg-emerald-500" : "bg-gray-300"}`} />
                  <div>
                    <div className="font-semibold">{c.nombre}</div>
                    {c.alias && (
                      <div className={`text-[10px] ${isSelected ? "text-emerald-600/70" : "text-gray-400"}`}>{c.alias}</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Surcharge indicator */}
      {surcharge > 0 && (
        <div className="rounded-lg bg-violet-50 border border-violet-200/80 px-3 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <div className="flex items-center gap-2">
            <IconInfo className="w-4 h-4 text-violet-500 shrink-0" />
            <div>
              <p className="text-xs font-medium text-violet-800">
                {metodo === "Mixto"
                  ? <>Recargo {recPct}% sobre porcion transferencia ({formatCurrency(mixtoTransferencia)})</>
                  : <>Recargo transferencia <span className="font-bold">{recPct}%</span></>
                }
              </p>
              <p className="text-[10px] text-violet-600">
                Cliente transfiere {formatCurrency(effectiveTr + surcharge)}
                {metodo !== "Mixto" && <> (incluye {formatCurrency(surcharge)} de recargo)</>}
              </p>
            </div>
          </div>
          <span className="text-sm font-bold text-violet-700 sm:ml-2 self-end sm:self-auto">+{formatCurrency(surcharge)}</span>
        </div>
      )}

      {/* Cuenta Corriente info */}
      {metodo === "Cuenta Corriente" && (
        <div className="rounded-lg bg-blue-50 border border-blue-200/80 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <IconBook className="w-4 h-4 text-blue-500 shrink-0" />
            <div>
              <p className="text-xs font-medium text-blue-800">Se carga {formatCurrency(montoVenta)} a la cuenta corriente del cliente</p>
              <p className="text-[10px] text-blue-600">Saldo actual: {formatCurrency(clienteSaldo)} &rarr; Nuevo saldo: {formatCurrency(clienteSaldo + montoVenta)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Mixto CC info */}
      {metodo === "Mixto" && mixtoCuentaCorriente > 0 && (
        <div className="rounded-lg bg-blue-50 border border-blue-200/80 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <IconBook className="w-4 h-4 text-blue-500 shrink-0" />
            <div>
              <p className="text-xs font-medium text-blue-800">{formatCurrency(mixtoCuentaCorriente)} queda en cuenta corriente</p>
              <p className="text-[10px] text-blue-600">Saldo actual: {formatCurrency(clienteSaldo)} &rarr; Nuevo saldo: {formatCurrency(clienteSaldo + mixtoCuentaCorriente)}</p>
            </div>
          </div>
        </div>
      )}

      {/* ─── Cobrar saldo adeudado ─── */}
      {clienteSaldo > 0 && metodo !== "Cuenta Corriente" && (
        <>
          <div className="border-t border-dashed border-gray-200" />
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={cobrarSaldo} onChange={(e) => setCobrarSaldo(e.target.checked)}
                  className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4" />
                <div>
                  <label className="text-sm font-medium text-gray-900 cursor-pointer">Cobrar saldo adeudado</label>
                  <p className="text-[10px] text-gray-500">El cliente tiene saldo pendiente de comprobantes anteriores</p>
                </div>
              </div>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">
                {formatCurrency(clienteSaldo)}
              </span>
            </div>

            {/* FIFO allocation table */}
            {cobrarSaldo && pendingInvoices.length > 0 && (
              <div className="mt-3 border rounded-lg overflow-x-auto">
                <div className="bg-gray-50 px-3 py-2 flex items-center justify-between border-b">
                  <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Asignacion FIFO</span>
                  <div className="flex gap-1">
                    {(["fifo", "manual"] as const).map((m) => (
                      <button key={m} type="button" onClick={() => setSaldoMode(m)}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                          saldoMode === m ? "bg-emerald-100 text-emerald-700 border border-emerald-200" : "text-gray-400 hover:bg-gray-100 border border-transparent"
                        }`}>{m === "fifo" ? "FIFO" : "Manual"}</button>
                    ))}
                  </div>
                </div>
                <table className="w-full text-xs min-w-[360px]">
                  <thead>
                    <tr className="text-[10px] text-gray-400 uppercase border-b bg-gray-50/50">
                      <th className="text-left px-3 py-1.5 font-medium">Comprobante</th>
                      <th className="text-left px-2 py-1.5 font-medium">Fecha</th>
                      <th className="text-right px-2 py-1.5 font-medium">Pendiente</th>
                      <th className="text-right px-3 py-1.5 font-medium">Aplicar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {saldoAllocations.map((a) => {
                      const hasPago = a.aplicar > 0;
                      const fullPaid = hasPago && a.aplicar >= a.pendiente - 0.01;
                      return (
                        <tr key={a.venta_id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50">
                          <td className="px-3 py-2 font-mono text-gray-700">{a.numero}</td>
                          <td className="px-2 py-2 text-gray-500">
                            {new Date(a.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                          </td>
                          <td className="px-2 py-2 text-right text-orange-600 font-medium">{formatCurrency(a.pendiente)}</td>
                          <td className="px-3 py-2 text-right">
                            {saldoMode === "manual" ? (
                              <input type="text" inputMode="numeric" value={a.aplicar || ""} placeholder="0"
                                onChange={(e) => {
                                  const parsed = e.target.value.replace(/[^0-9.,]/g, "").replace(/\./g, "").replace(",", ".");
                                  const raw = Math.max(0, Math.min(parseFloat(parsed) || 0, a.pendiente));
                                  setSaldoAllocations((prev) => {
                                    const otherSum = prev.reduce((s, x) => s + (x.venta_id === a.venta_id ? 0 : x.aplicar), 0);
                                    const maxForThis = Math.min(raw, Math.max(0, clienteSaldo - otherSum));
                                    return prev.map((x) => x.venta_id === a.venta_id ? { ...x, aplicar: maxForThis } : x);
                                  });
                                }}
                                className="w-20 rounded border border-input bg-background h-6 text-xs text-right pr-2 pl-1 focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                            ) : hasPago ? (
                              <span className={`font-semibold ${fullPaid ? "text-emerald-600" : "text-blue-600"}`}>
                                {formatCurrency(a.aplicar)} {fullPaid && <span className="text-emerald-500">&#10003;</span>}
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="bg-gray-50 px-3 py-2 border-t flex items-center justify-between">
                  <span className="text-[11px] font-medium text-gray-500">Total asignado</span>
                  <span className="text-xs font-bold text-emerald-600">{formatCurrency(saldoTotalAsignado)} / {formatCurrency(clienteSaldo)}</span>
                </div>
              </div>
            )}
            {cobrarSaldo && pendingInvoices.length === 0 && (
              <p className="mt-2 text-xs text-gray-500">No se encontraron comprobantes pendientes. El cobro se aplicará al saldo general.</p>
            )}
          </div>
        </>
      )}

      {/* No pending saldo indicator */}
      {clienteSaldo <= 0 && metodo !== "Cuenta Corriente" && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200/60">
          <IconCheck className="w-4 h-4 text-emerald-500" />
          <p className="text-xs text-emerald-700 font-medium">El cliente no tiene saldo adeudado</p>
        </div>
      )}

      {/* ─── Divider ─── */}
      <div className="border-t border-dashed border-gray-200" />

      {/* ─── Summary breakdown ─── */}
      <div className="bg-gray-50 rounded-lg px-4 py-3 space-y-2">
        <div className="flex justify-between text-sm text-gray-600">
          <span>Pedido (subtotal efectivo)</span>
          <span className="font-medium text-gray-800">{formatCurrency(subtotalItems)}</span>
        </div>
        {costoEnvio > 0 && (
          <div className="flex justify-between text-sm text-gray-600">
            <span>Costo de envío</span>
            <span className="font-medium text-gray-800">{formatCurrency(costoEnvio)}</span>
          </div>
        )}
        {metodo === "Mixto" && mixtoActiveMethods.length >= 2 && (
          <>
            {mixtoEfectivo > 0 && (
              <div className="flex justify-between text-xs text-gray-500 pl-3">
                <span>Efectivo</span>
                <span>{formatCurrency(mixtoEfectivo)}</span>
              </div>
            )}
            {mixtoTransferencia > 0 && (
              <div className="flex justify-between text-xs text-gray-500 pl-3">
                <span>Transferencia</span>
                <span>{formatCurrency(mixtoTransferencia)}</span>
              </div>
            )}
            {mixtoCuentaCorriente > 0 && (
              <div className="flex justify-between text-xs text-blue-600 pl-3">
                <span>Cuenta corriente</span>
                <span>{formatCurrency(mixtoCuentaCorriente)}</span>
              </div>
            )}
          </>
        )}
        {surcharge > 0 && (
          <div className="flex justify-between text-sm text-violet-600">
            <span>Recargo transferencia ({recPct}%{metodo === "Mixto" ? ` s/ ${formatCurrency(mixtoTransferencia)}` : ""})</span>
            <span className="font-medium">+{formatCurrency(surcharge)}</span>
          </div>
        )}
        {metodo === "Cuenta Corriente" && (
          <div className="flex justify-between text-sm text-blue-600">
            <span>A cuenta corriente</span>
            <span className="font-medium">{formatCurrency(montoVenta)}</span>
          </div>
        )}
        {cobrarSaldo && saldoTotalAsignado > 0 && (
          <div className="flex justify-between text-sm text-gray-600">
            <span>Saldo adeudado anterior</span>
            <span className="font-medium text-gray-800">{formatCurrency(saldoTotalAsignado)}</span>
          </div>
        )}
        <div className="border-t border-gray-200 pt-2 flex justify-between">
          {metodo === "Cuenta Corriente" ? (
            <>
              <span className="text-sm font-bold text-gray-900">A cuenta corriente</span>
              <span className="text-lg font-bold text-gray-900">{formatCurrency(montoVenta)}</span>
            </>
          ) : (
            <>
              <span className="text-sm font-bold text-gray-900">Total a cobrar</span>
              <span className="text-lg font-bold text-gray-900">{formatCurrency(totalACobrar)}</span>
            </>
          )}
        </div>
      </div>

      {/* Confirm button */}
      <Button
        className={`w-full py-3 h-auto gap-2 text-sm font-semibold shadow-sm ${
          metodo === "Cuenta Corriente"
            ? "bg-blue-600 hover:bg-blue-700 shadow-blue-200"
            : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200"
        }`}
        onClick={handleConfirmar}
        disabled={!canConfirm}
      >
        {saving ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : metodo === "Cuenta Corriente" ? (
          <>
            <IconBook className="w-5 h-5" />
            Cargar a Cuenta Corriente — {formatCurrency(montoVenta)}
          </>
        ) : (
          <>
            <IconCheck className="w-5 h-5" />
            Confirmar cobro — {formatCurrency(totalACobrar)}
          </>
        )}
      </Button>

      <p className="text-[10px] text-gray-400 text-center">
        {metodo === "Cuenta Corriente"
          ? "Se registra en caja diaria, actualiza el saldo del cliente y se registra en cuenta corriente"
          : "Se registra en caja, actualiza saldo del cliente y marca los comprobantes como pagados"
        }
      </p>
    </div>
  );
}
