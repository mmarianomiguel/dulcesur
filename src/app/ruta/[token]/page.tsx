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

  // Payment form state (shared — resets when expanding new item)
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
      setData(await res.json());
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
                onClick={() => !item.completado && handleExpand(item.id)}
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
