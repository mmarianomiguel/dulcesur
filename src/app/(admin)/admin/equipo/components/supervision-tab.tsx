"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import {
  Package,
  Clock,
  Timer,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
} from "lucide-react";
import type { PedidoConArmado } from "@/types/equipo";

/* ── Time helpers ── */

function formatDuration(ms: number | null): string {
  if (ms === null || ms <= 0) return "\u2014";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hrs}h ${remainMins}m`;
}

function calcDuration(
  start: string | null | undefined,
  end: string | null | undefined
): number | null {
  if (!start || !end) return null;
  return new Date(end).getTime() - new Date(start).getTime();
}

/* ── Estado helpers ── */

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

/* ── Component ── */

export function SupervisionTab() {
  const [pedidos, setPedidos] = useState<PedidoConArmado[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectMotivo, setRejectMotivo] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchPedidos = useCallback(async () => {
    try {
      const res = await fetch("/api/equipo/pedidos");
      const data = await res.json();
      setPedidos(data.pedidos || []);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPedidos();
  }, [fetchPedidos]);

  /* Realtime subscriptions */
  useEffect(() => {
    const channel = supabase
      .channel("supervision-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedido_armado" },
        () => fetchPedidos()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ventas" },
        () => fetchPedidos()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchPedidos]);

  /* ── Stats ── */

  const stats = useMemo(() => {
    const total = pedidos.length;
    const pendientes = pedidos.filter(
      (p) => p.pedido_armado?.estado === "pendiente"
    ).length;
    const enProceso = pedidos.filter(
      (p) =>
        p.pedido_armado?.estado === "armando" ||
        p.pedido_armado?.estado === "armado"
    ).length;
    const listos = pedidos.filter(
      (p) => p.pedido_armado?.estado === "listo"
    ).length;
    return { total, pendientes, enProceso, listos };
  }, [pedidos]);

  /* ── Per-armador metrics ── */

  const armadorMetrics = useMemo(() => {
    const map = new Map<
      string,
      { nombre: string; count: number; totalMs: number; doneCount: number; rechazos: number }
    >();
    for (const p of pedidos) {
      const pa = p.pedido_armado;
      if (!pa?.armador_id || !pa.armador_nombre) continue;
      if (!map.has(pa.armador_id)) {
        map.set(pa.armador_id, {
          nombre: pa.armador_nombre,
          count: 0,
          totalMs: 0,
          doneCount: 0,
          rechazos: 0,
        });
      }
      const m = map.get(pa.armador_id)!;
      m.count++;
      m.rechazos += pa.rechazos ?? 0;
      const dur = calcDuration(pa.inicio_armado_at, pa.fin_armado_at);
      if (dur && dur > 0) {
        m.totalMs += dur;
        m.doneCount++;
      }
    }
    return Array.from(map.values());
  }, [pedidos]);

  /* ── Actions ── */

  const handleApprove = async (ventaId: string) => {
    setActionLoading(ventaId);
    try {
      await fetch(`/api/equipo/pedidos/${ventaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: "listo" }),
      });
      await fetchPedidos();
    } finally {
      setActionLoading(null);
    }
  };

  const openRejectModal = (ventaId: string) => {
    setRejectTarget(ventaId);
    setRejectMotivo("");
    setRejectModalOpen(true);
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    setActionLoading(rejectTarget);
    try {
      await fetch(`/api/equipo/pedidos/${rejectTarget}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estado: "rechazado",
          motivo_rechazo: rejectMotivo.trim() || "Sin motivo",
        }),
      });
      await fetchPedidos();
    } finally {
      setActionLoading(null);
      setRejectModalOpen(false);
      setRejectTarget(null);
    }
  };

  /* ── Render helpers ── */

  const progressPct = (count: number) =>
    stats.total > 0 ? (count / stats.total) * 100 : 0;

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── A) Progress Overview ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<Package className="w-5 h-5" />}
          label="Total del día"
          value={stats.total}
          color="bg-gray-100 text-gray-600"
        />
        <StatCard
          icon={<Clock className="w-5 h-5" />}
          label="Pendientes"
          value={stats.pendientes}
          color="bg-amber-50 text-amber-600"
        />
        <StatCard
          icon={<Timer className="w-5 h-5" />}
          label="En proceso"
          value={stats.enProceso}
          color="bg-violet-50 text-violet-600"
        />
        <StatCard
          icon={<CheckCircle2 className="w-5 h-5" />}
          label="Listos"
          value={stats.listos}
          color="bg-[#fdf5f6] text-[#c94070]"
        />
      </div>

      {/* Progress bar */}
      <div className="h-3 rounded-full bg-gray-100 overflow-hidden flex">
        {stats.listos > 0 && (
          <div
            className="bg-[#c94070] transition-all"
            style={{ width: `${progressPct(stats.listos)}%` }}
          />
        )}
        {stats.enProceso > 0 && (
          <div
            className="bg-violet-400 transition-all"
            style={{ width: `${progressPct(stats.enProceso)}%` }}
          />
        )}
        {stats.pendientes > 0 && (
          <div
            className="bg-amber-300 transition-all"
            style={{ width: `${progressPct(stats.pendientes)}%` }}
          />
        )}
      </div>

      {/* ── B) Per-Armador Metrics ── */}
      {armadorMetrics.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Armadores
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {armadorMetrics.map((a) => (
              <div
                key={a.nombre}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-full bg-[#f7dde7] text-[#c94070] flex items-center justify-center font-bold text-sm shrink-0">
                  {a.nombre.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 text-sm truncate">
                    {a.nombre}
                  </p>
                  <div className="flex gap-3 text-xs text-gray-500 mt-0.5">
                    <span>
                      {a.count} pedido{a.count !== 1 ? "s" : ""}
                    </span>
                    <span>
                      {a.doneCount > 0
                        ? `~${formatDuration(Math.round(a.totalMs / a.doneCount))} prom.`
                        : "\u2014"}
                    </span>
                    {a.rechazos > 0 && (
                      <span className="text-red-500">
                        {a.rechazos} rechazo{a.rechazos !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── C) Pedidos Detail ── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Pedidos</h3>

        {pedidos.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            No hay pedidos de armado hoy.
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-[#fdf5f6]">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">
                      #
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">
                      Cliente
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">
                      Estado
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">
                      Armador
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">
                      T. Espera
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">
                      T. Armado
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">
                      T. Control
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">
                      T. Total
                    </th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">
                      Rech.
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pedidos.map((p) => {
                    const pa = p.pedido_armado;
                    const estado = pa?.estado ?? "pendiente";
                    const tEspera = calcDuration(
                      p.created_at,
                      pa?.inicio_armado_at
                    );
                    const tArmado = calcDuration(
                      pa?.inicio_armado_at,
                      pa?.fin_armado_at
                    );
                    const tControl = calcDuration(
                      pa?.fin_armado_at,
                      pa?.aprobado_at
                    );
                    const tTotal = calcDuration(p.created_at, pa?.aprobado_at);

                    return (
                      <tr
                        key={p.id}
                        className="border-b last:border-b-0 hover:bg-gray-50/50"
                      >
                        <td className="px-4 py-3 font-mono text-gray-500">
                          {p.numero}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {p.clientes?.nombre ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-xs px-2 py-1 rounded-full font-medium ${estadoBadge[estado]}`}
                          >
                            {estadoLabel[estado]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {pa?.armador_nombre ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500">
                          {formatDuration(tEspera)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500">
                          {formatDuration(tArmado)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500">
                          {formatDuration(tControl)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-700">
                          {formatDuration(tTotal)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {(pa?.rechazos ?? 0) > 0 ? (
                            <span className="text-xs font-medium text-red-500 flex items-center justify-center gap-0.5">
                              <AlertTriangle className="w-3 h-3" />
                              {pa?.rechazos}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {estado === "armado" && (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleApprove(p.id)}
                                disabled={actionLoading === p.id}
                                className="text-xs px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 font-medium hover:bg-emerald-100 disabled:opacity-50"
                              >
                                {actionLoading === p.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                )}
                              </button>
                              <button
                                onClick={() => openRejectModal(p.id)}
                                disabled={actionLoading === p.id}
                                className="text-xs px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 font-medium hover:bg-red-100 disabled:opacity-50"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
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
                const estado = pa?.estado ?? "pendiente";
                const tEspera = calcDuration(
                  p.created_at,
                  pa?.inicio_armado_at
                );
                const tArmado = calcDuration(
                  pa?.inicio_armado_at,
                  pa?.fin_armado_at
                );
                const tControl = calcDuration(
                  pa?.fin_armado_at,
                  pa?.aprobado_at
                );
                const tTotal = calcDuration(p.created_at, pa?.aprobado_at);

                return (
                  <div
                    key={p.id}
                    className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-gray-900">
                          {p.clientes?.nombre ?? "Sin cliente"}
                        </p>
                        <p className="text-xs text-gray-400 font-mono">
                          #{p.numero}
                        </p>
                      </div>
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-medium ${estadoBadge[estado]}`}
                      >
                        {estadoLabel[estado]}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-gray-400">Armador</span>
                        <p className="text-gray-700 font-medium">
                          {pa?.armador_nombre ?? "—"}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-400">Rechazos</span>
                        <p
                          className={`font-medium ${(pa?.rechazos ?? 0) > 0 ? "text-red-500" : "text-gray-300"}`}
                        >
                          {(pa?.rechazos ?? 0) > 0 ? pa?.rechazos : "—"}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-400">T. Espera</span>
                        <p className="text-gray-600">
                          {formatDuration(tEspera)}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-400">T. Armado</span>
                        <p className="text-gray-600">
                          {formatDuration(tArmado)}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-400">T. Control</span>
                        <p className="text-gray-600">
                          {formatDuration(tControl)}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-400">T. Total</span>
                        <p className="text-gray-700 font-medium">
                          {formatDuration(tTotal)}
                        </p>
                      </div>
                    </div>

                    {estado === "armado" && (
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => handleApprove(p.id)}
                          disabled={actionLoading === p.id}
                          className="flex-1 flex items-center justify-center gap-1.5 text-xs py-2 rounded-xl bg-emerald-50 text-emerald-700 font-medium hover:bg-emerald-100 disabled:opacity-50"
                        >
                          {actionLoading === p.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          )}
                          Aprobar
                        </button>
                        <button
                          onClick={() => openRejectModal(p.id)}
                          disabled={actionLoading === p.id}
                          className="flex-1 flex items-center justify-center gap-1.5 text-xs py-2 rounded-xl bg-red-50 text-red-600 font-medium hover:bg-red-100 disabled:opacity-50"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Rechazar
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── D) Reject Modal ── */}
      {rejectModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
            <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-500" />
              Rechazar pedido
            </h3>
            <div>
              <label className="text-sm font-medium text-gray-600 block mb-1">
                Motivo del rechazo
              </label>
              <textarea
                value={rejectMotivo}
                onChange={(e) => setRejectMotivo(e.target.value)}
                rows={3}
                className="w-full border border-[#f0dde5] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#c94070] resize-none"
                placeholder="Describí el motivo del rechazo..."
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setRejectModalOpen(false);
                  setRejectTarget(null);
                }}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-600 font-medium text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleReject}
                disabled={actionLoading !== null}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-medium text-sm flex items-center justify-center gap-1.5 hover:bg-red-700 disabled:opacity-50"
              >
                {actionLoading && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                Rechazar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Stat Card ── */

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className={`w-9 h-9 rounded-xl ${color} flex items-center justify-center mb-2`}>
        {icon}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}
