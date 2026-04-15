"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Loader2, Package, Clock, CheckCircle2, AlertTriangle, Calendar } from "lucide-react";
import type { PedidoConArmado } from "@/types/equipo";

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

type Estado = "pendiente" | "armando" | "armado" | "listo";

const estadoBadge: Record<Estado, string> = {
  pendiente: "bg-amber-100 text-amber-700",
  armando: "bg-violet-100 text-violet-700",
  armado: "bg-blue-100 text-blue-700",
  listo: "bg-[#f7dde7] text-[#c94070]",
};

const estadoLabel: Record<Estado, string> = {
  pendiente: "Pendiente",
  armando: "Armando",
  armado: "Armado",
  listo: "Listo",
};

function getYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString("en-CA"); // YYYY-MM-DD
}

export function HistorialTab() {
  const [fecha, setFecha] = useState(getYesterday());
  const [pedidos, setPedidos] = useState<PedidoConArmado[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistorial = useCallback(async (f: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/equipo/historial?fecha=${f}`);
      const data = await res.json();
      setPedidos(data.pedidos || []);
    } catch {
      setPedidos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistorial(fecha);
  }, [fecha, fetchHistorial]);

  const stats = useMemo(() => {
    const total = pedidos.length;
    const completados = pedidos.filter(p => p.pedido_armado?.estado === "listo").length;
    let totalArmadoMs = 0;
    let armadoCount = 0;
    for (const p of pedidos) {
      const dur = calcDuration(p.pedido_armado?.inicio_armado_at, p.pedido_armado?.fin_armado_at);
      if (dur && dur > 0) {
        totalArmadoMs += dur;
        armadoCount++;
      }
    }
    const promedioArmado = armadoCount > 0 ? totalArmadoMs / armadoCount : null;
    const totalRechazos = pedidos.reduce((sum, p) => sum + (p.pedido_armado?.rechazos ?? 0), 0);
    return { total, completados, promedioArmado, totalRechazos };
  }, [pedidos]);

  const armadorMetrics = useMemo(() => {
    const map = new Map<string, { nombre: string; count: number; totalMs: number; doneCount: number; rechazos: number }>();
    for (const p of pedidos) {
      const pa = p.pedido_armado;
      if (!pa?.armador_id || !pa.armador_nombre) continue;
      if (!map.has(pa.armador_id)) {
        map.set(pa.armador_id, { nombre: pa.armador_nombre, count: 0, totalMs: 0, doneCount: 0, rechazos: 0 });
      }
      const m = map.get(pa.armador_id)!;
      m.count++;
      m.rechazos += pa.rechazos ?? 0;
      const dur = calcDuration(pa.inicio_armado_at, pa.fin_armado_at);
      if (dur && dur > 0) { m.totalMs += dur; m.doneCount++; }
    }
    return Array.from(map.values());
  }, [pedidos]);

  // Format the date for display
  const fechaDisplay = new Date(fecha + "T12:00:00").toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-6">
      {/* Date picker */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400" />
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            max={new Date().toLocaleDateString("en-CA")}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c94070] focus:border-transparent"
          />
        </div>
        <p className="text-sm text-gray-500 capitalize">{fechaDisplay}</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : pedidos.length === 0 ? (
        <div className="text-center py-16">
          <Package className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-400">No hay pedidos para esta fecha</p>
        </div>
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="w-9 h-9 rounded-xl bg-gray-100 text-gray-600 flex items-center justify-center mb-2">
                <Package className="w-5 h-5" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              <p className="text-xs text-gray-500">Total pedidos</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="w-9 h-9 rounded-xl bg-[#fdf5f6] text-[#c94070] flex items-center justify-center mb-2">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{stats.completados}</p>
              <p className="text-xs text-gray-500">Completados</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center mb-2">
                <Clock className="w-5 h-5" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{formatDuration(stats.promedioArmado)}</p>
              <p className="text-xs text-gray-500">Tiempo promedio</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="w-9 h-9 rounded-xl bg-red-50 text-red-500 flex items-center justify-center mb-2">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{stats.totalRechazos}</p>
              <p className="text-xs text-gray-500">Rechazos</p>
            </div>
          </div>

          {/* Per-armador metrics */}
          {armadorMetrics.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Rendimiento por armador</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {armadorMetrics.map((a) => (
                  <div key={a.nombre} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#f7dde7] text-[#c94070] flex items-center justify-center font-bold text-sm shrink-0">
                      {a.nombre.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 text-sm truncate">{a.nombre}</p>
                      <div className="flex gap-3 text-xs text-gray-500 mt-0.5">
                        <span>{a.count} pedido{a.count !== 1 ? "s" : ""}</span>
                        <span>{a.doneCount > 0 ? `~${formatDuration(Math.round(a.totalMs / a.doneCount))} prom.` : "—"}</span>
                        {a.rechazos > 0 && <span className="text-red-500">{a.rechazos} rechazo{a.rechazos !== 1 ? "s" : ""}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pedidos table -- Desktop */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Detalle de pedidos</h3>

            <div className="hidden md:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-[#fdf5f6]">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">#</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Cliente</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Armador</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">T. Espera</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">T. Armado</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">T. Control</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">T. Total</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Rech.</th>
                  </tr>
                </thead>
                <tbody>
                  {pedidos.map((p) => {
                    const pa = p.pedido_armado;
                    const estado = (pa?.estado ?? "pendiente") as Estado;
                    const tEspera = calcDuration(p.created_at, pa?.inicio_armado_at);
                    const tArmado = calcDuration(pa?.inicio_armado_at, pa?.fin_armado_at);
                    const tControl = calcDuration(pa?.fin_armado_at, pa?.aprobado_at);
                    const tTotal = calcDuration(p.created_at, pa?.aprobado_at);
                    return (
                      <tr key={p.id} className="border-b last:border-b-0 hover:bg-gray-50/50">
                        <td className="px-4 py-3 font-mono text-gray-500">{p.numero}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{p.clientes?.nombre ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${estadoBadge[estado]}`}>
                            {estadoLabel[estado]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{pa?.armador_nombre ?? "—"}</td>
                        <td className="px-4 py-3 text-right text-gray-500">{formatDuration(tEspera)}</td>
                        <td className="px-4 py-3 text-right text-gray-500">{formatDuration(tArmado)}</td>
                        <td className="px-4 py-3 text-right text-gray-500">{formatDuration(tControl)}</td>
                        <td className="px-4 py-3 text-right font-medium text-gray-700">{formatDuration(tTotal)}</td>
                        <td className="px-4 py-3 text-center">
                          {(pa?.rechazos ?? 0) > 0 ? (
                            <span className="text-xs font-medium text-red-500 flex items-center justify-center gap-0.5">
                              <AlertTriangle className="w-3 h-3" />{pa?.rechazos}
                            </span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {pedidos.map((p) => {
                const pa = p.pedido_armado;
                const estado = (pa?.estado ?? "pendiente") as Estado;
                const tEspera = calcDuration(p.created_at, pa?.inicio_armado_at);
                const tArmado = calcDuration(pa?.inicio_armado_at, pa?.fin_armado_at);
                const tTotal = calcDuration(p.created_at, pa?.aprobado_at);
                return (
                  <div key={p.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{p.clientes?.nombre ?? "Sin cliente"}</p>
                        <p className="text-xs text-gray-400 font-mono">#{p.numero}</p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${estadoBadge[estado]}`}>
                        {estadoLabel[estado]}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-gray-400">Armador</span>
                        <p className="text-gray-700 font-medium">{pa?.armador_nombre ?? "—"}</p>
                      </div>
                      <div>
                        <span className="text-gray-400">Rechazos</span>
                        <p className={`font-medium ${(pa?.rechazos ?? 0) > 0 ? "text-red-500" : "text-gray-300"}`}>
                          {(pa?.rechazos ?? 0) > 0 ? pa?.rechazos : "—"}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-400">T. Espera</span>
                        <p className="text-gray-600">{formatDuration(tEspera)}</p>
                      </div>
                      <div>
                        <span className="text-gray-400">T. Armado</span>
                        <p className="text-gray-600">{formatDuration(tArmado)}</p>
                      </div>
                      <div>
                        <span className="text-gray-400">T. Total</span>
                        <p className="text-gray-700 font-medium">{formatDuration(tTotal)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
