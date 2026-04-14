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
        <div className="max-w-xl mx-auto px-4 mt-3">
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <span className="text-sm text-red-700 flex-1">{actionError}</span>
            <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-600 text-lg font-bold leading-none">&times;</button>
          </div>
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
              id={`stop-${item.id}`}
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
