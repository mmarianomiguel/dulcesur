"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/formatters";
import {
  Package,
  Clock,
  Timer,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  GripVertical,
  Truck,
  ShoppingBag,
  ChevronDown,
  ChevronUp,
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

function formatLiveDuration(startStr: string | null | undefined, _tick: number): string {
  if (!startStr) return "\u2014";
  const ms = Date.now() - new Date(startStr).getTime();
  if (ms <= 0) return "0m";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hrs}h ${remainMins}m`;
}

function formatHora(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Argentina/Buenos_Aires",
    });
  } catch {
    return "\u2014";
  }
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

const borderColor: Record<string, string> = {
  pendiente: "#f59e0b",
  armando: "#7c3aed",
  armado: "#3b82f6",
  listo: "#c94070",
};

const estadoTabs: Estado[] = ["pendiente", "armando", "armado", "listo"];

/* ── Entrega helpers ── */

type MetodoEntregaFilter = "todos" | "envio" | "retiro";

function isEnvio(metodo: string | null): boolean {
  return metodo === "envio" || metodo === "envio_a_domicilio";
}

function isRetiro(metodo: string | null): boolean {
  return metodo === "retiro";
}

/* ── Component ── */

export function SupervisionTab() {
  const [pedidos, setPedidos] = useState<PedidoConArmado[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectMotivo, setRejectMotivo] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [ordenModified, setOrdenModified] = useState(false);
  const [savingOrden, setSavingOrden] = useState(false);

  /* New state: filters */
  const [activeEstado, setActiveEstado] = useState<Estado | null>(null);
  const [entregaFilter, setEntregaFilter] = useState<MetodoEntregaFilter>("todos");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
      (p) => !p.pedido_armado || p.pedido_armado.estado === "pendiente"
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

  /* ── Envío/Retiro counts ── */

  const entregaCounts = useMemo(() => {
    const envio = pedidos.filter((p) => isEnvio(p.metodo_entrega)).length;
    const retiro = pedidos.filter((p) => isRetiro(p.metodo_entrega)).length;
    return { envio, retiro };
  }, [pedidos]);

  /* ── Estado counts ── */

  const estadoCounts = useMemo(() => {
    const counts: Record<Estado, number> = {
      pendiente: 0,
      armando: 0,
      armado: 0,
      listo: 0,
    };
    for (const p of pedidos) {
      const e = (p.pedido_armado?.estado ?? "pendiente") as Estado;
      counts[e]++;
    }
    return counts;
  }, [pedidos]);

  /* ── Filtered pedidos ── */

  const filteredPedidos = useMemo(() => {
    let result = pedidos;

    // Entrega filter
    if (entregaFilter === "envio") {
      result = result.filter((p) => isEnvio(p.metodo_entrega));
    } else if (entregaFilter === "retiro") {
      result = result.filter((p) => isRetiro(p.metodo_entrega));
    }

    // Estado filter
    if (activeEstado) {
      result = result.filter((p) => {
        const e = p.pedido_armado?.estado ?? "pendiente";
        return e === activeEstado;
      });
    }

    return result;
  }, [pedidos, entregaFilter, activeEstado]);

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

  /* ── Orden de entrega (drag & drop) ── */

  const listosEnvio = useMemo(() => {
    return pedidos
      .filter(
        (p) =>
          p.pedido_armado?.estado === "listo" &&
          (p.metodo_entrega === "envio" || p.metodo_entrega === "envio_a_domicilio")
      )
      .sort((a, b) => {
        const oa = a.pedido_armado?.orden_entrega ?? Infinity;
        const ob = b.pedido_armado?.orden_entrega ?? Infinity;
        return oa - ob;
      });
  }, [pedidos]);

  const [orderedListos, setOrderedListos] = useState<PedidoConArmado[]>([]);

  useEffect(() => {
    setOrderedListos(listosEnvio);
    setOrdenModified(false);
  }, [listosEnvio]);

  const handleDragStart = (id: string) => setDragId(id);
  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    setDragOverId(id);
  };
  const handleDragEnd = () => {
    setDragId(null);
    setDragOverId(null);
  };

  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) {
      handleDragEnd();
      return;
    }
    const fromIdx = orderedListos.findIndex((p) => p.id === dragId);
    const toIdx = orderedListos.findIndex((p) => p.id === targetId);
    if (fromIdx === -1 || toIdx === -1) {
      handleDragEnd();
      return;
    }
    const reordered = [...orderedListos];
    reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, orderedListos[fromIdx]);
    setOrderedListos(reordered);
    setOrdenModified(true);
    handleDragEnd();
  };

  const saveOrden = async () => {
    setSavingOrden(true);
    try {
      await Promise.all(
        orderedListos.map((p, i) =>
          fetch(`/api/equipo/pedidos/${p.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ estado: "listo", orden_entrega: i + 1 }),
          })
        )
      );
      await fetchPedidos();
    } finally {
      setSavingOrden(false);
      setOrdenModified(false);
    }
  };

  /* ── Actions ── */

  const handleToggleUrgente = async (ventaId: string, currentUrgente: boolean) => {
    setActionLoading(ventaId);
    try {
      const pa = pedidos.find(p => p.id === ventaId)?.pedido_armado;
      await fetch(`/api/equipo/pedidos/${ventaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estado: pa?.estado || "pendiente",
          urgente: !currentUrgente,
        }),
      });
      await fetchPedidos();
    } finally {
      setActionLoading(null);
    }
  };

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
      {/* ── A) Stats row ── */}
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

      {/* ── B) Envío / Retiro toggle ── */}
      <div className="flex gap-2">
        <button
          onClick={() => setEntregaFilter(entregaFilter === "envio" ? "todos" : "envio")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
            entregaFilter === "envio"
              ? "bg-[#c94070] text-white shadow-sm"
              : "bg-white text-gray-600 border border-gray-200 hover:border-[#f0dde5]"
          }`}
        >
          <Truck className="w-4 h-4" />
          Envío
          <span
            className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
              entregaFilter === "envio"
                ? "bg-white/20 text-white"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {entregaCounts.envio}
          </span>
        </button>
        <button
          onClick={() => setEntregaFilter(entregaFilter === "retiro" ? "todos" : "retiro")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
            entregaFilter === "retiro"
              ? "bg-[#c94070] text-white shadow-sm"
              : "bg-white text-gray-600 border border-gray-200 hover:border-[#f0dde5]"
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          Retiro
          <span
            className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
              entregaFilter === "retiro"
                ? "bg-white/20 text-white"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {entregaCounts.retiro}
          </span>
        </button>
      </div>

      {/* ── C) Estado tabs ── */}
      <div className="grid grid-cols-4 gap-1.5">
        {estadoTabs.map((tab) => {
          const isActive = activeEstado === tab;
          const tabColors: Record<Estado, { active: string; inactive: string }> = {
            pendiente: {
              active: "bg-amber-500 text-white",
              inactive: "bg-amber-50 text-amber-700 border border-amber-200",
            },
            armando: {
              active: "bg-violet-600 text-white",
              inactive: "bg-violet-50 text-violet-700 border border-violet-200",
            },
            armado: {
              active: "bg-blue-500 text-white",
              inactive: "bg-blue-50 text-blue-700 border border-blue-200",
            },
            listo: {
              active: "bg-[#c94070] text-white",
              inactive: "bg-[#fdf5f6] text-[#c94070] border border-[#f0dde5]",
            },
          };

          return (
            <button
              key={tab}
              onClick={() => setActiveEstado(isActive ? null : tab)}
              className={`flex flex-col items-center py-2 rounded-xl text-xs font-medium transition-all ${
                isActive ? tabColors[tab].active : tabColors[tab].inactive
              }`}
            >
              <span className="text-lg font-bold leading-none mb-0.5">{estadoCounts[tab]}</span>
              {estadoLabel[tab]}
            </button>
          );
        })}
      </div>

      {/* ── D) Pedido cards ── */}
      <div>
        {filteredPedidos.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            {pedidos.length === 0
              ? "No hay pedidos de armado hoy."
              : "No hay pedidos con estos filtros."}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredPedidos.map((p) => {
              const pa = p.pedido_armado;
              const estado = (pa?.estado ?? "pendiente") as Estado;
              const tEspera = calcDuration(p.created_at, pa?.inicio_armado_at);
              const tArmado = calcDuration(pa?.inicio_armado_at, pa?.fin_armado_at);
              const tControl = calcDuration(pa?.fin_armado_at, pa?.aprobado_at);
              const tTotal = calcDuration(p.created_at, pa?.aprobado_at);
              const isExpanded = expandedIds.has(p.id);
              const esEnvio = isEnvio(p.metodo_entrega);

              return (
                <div
                  key={p.id}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
                  style={{ borderLeftWidth: 4, borderLeftColor: borderColor[estado] }}
                >
                  {/* Card header */}
                  <div className="p-4 space-y-3">
                    {/* Row 1: client, order #, hora, estado */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-gray-900 truncate">
                          {p.clientes?.nombre ?? "Sin cliente"}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-gray-400 font-mono">
                            #{p.numero?.slice(-4)}
                          </span>
                          <span className="text-xs text-gray-400">
                            {formatHora(p.created_at)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Envío/Retiro badge */}
                        <span
                          className={`text-xs px-2 py-1 rounded-full font-medium flex items-center gap-1 ${
                            esEnvio
                              ? "bg-sky-50 text-sky-600"
                              : "bg-orange-50 text-orange-600"
                          }`}
                        >
                          {esEnvio ? (
                            <Truck className="w-3 h-3" />
                          ) : (
                            <ShoppingBag className="w-3 h-3" />
                          )}
                          <span className="hidden sm:inline">
                            {esEnvio ? "Envío" : "Retiro"}
                          </span>
                        </span>
                        {/* Urgente badge */}
                        {pa?.urgente && (
                          <span className="text-xs px-2 py-1 rounded-full font-medium bg-red-100 text-red-600 animate-pulse">
                            🔥 Urgente
                          </span>
                        )}
                        {/* Estado badge */}
                        <span
                          className={`text-xs px-2 py-1 rounded-full font-medium ${estadoBadge[estado]}`}
                        >
                          {estadoLabel[estado]}
                        </span>
                      </div>
                    </div>

                    {/* Row 2: armador + rechazos */}
                    {(pa?.armador_nombre || (pa?.rechazos ?? 0) > 0) && (
                      <div className="flex items-center gap-3 text-xs">
                        {pa?.armador_nombre && (
                          <div className="flex items-center gap-1.5">
                            <div className="w-5 h-5 rounded-full bg-[#f7dde7] text-[#c94070] flex items-center justify-center font-bold text-[10px] shrink-0">
                              {pa.armador_nombre.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-gray-600 font-medium">
                              {pa.armador_nombre}
                            </span>
                          </div>
                        )}
                        {(pa?.rechazos ?? 0) > 0 && (
                          <span className="text-red-500 font-medium flex items-center gap-0.5">
                            <AlertTriangle className="w-3 h-3" />
                            {pa?.rechazos} rechazo{(pa?.rechazos ?? 0) !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Armador notes */}
                    {pa?.notas && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex gap-2">
                        <span className="text-amber-500 text-sm shrink-0">&#9888;</span>
                        <div>
                          <p className="text-[11px] font-bold text-amber-800 mb-0.5">Nota del armador</p>
                          <p className="text-[11px] text-amber-700">{pa.notas}</p>
                        </div>
                      </div>
                    )}

                    {/* Row 3: time metrics grid */}
                    <div className="grid grid-cols-4 gap-2">
                      <TimeMetric label="T. Espera" value={estado === "pendiente" ? undefined : formatDuration(tEspera)} liveValue={estado === "pendiente" ? <span className="text-amber-600">{formatLiveDuration(p.created_at, tick)}</span> : undefined} />
                      <TimeMetric label="T. Armado" value={estado === "armando" && pa?.inicio_armado_at ? undefined : formatDuration(tArmado)} liveValue={estado === "armando" && pa?.inicio_armado_at ? <span className="text-violet-600 font-semibold animate-pulse">{formatLiveDuration(pa.inicio_armado_at, tick)}</span> : undefined} />
                      <TimeMetric label="T. Control" value={formatDuration(tControl)} />
                      <TimeMetric label="T. Total" value={formatDuration(tTotal)} bold />
                    </div>

                    {/* Row 4: Actions for "armado" estado */}
                    {estado === "armado" && (
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => handleApprove(p.id)}
                          disabled={actionLoading === p.id}
                          className="flex-1 flex items-center justify-center gap-1.5 text-xs py-2.5 rounded-xl bg-emerald-50 text-emerald-700 font-medium hover:bg-emerald-100 disabled:opacity-50 transition-colors"
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
                          className="flex-1 flex items-center justify-center gap-1.5 text-xs py-2.5 rounded-xl bg-red-50 text-red-600 font-medium hover:bg-red-100 disabled:opacity-50 transition-colors"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Rechazar
                        </button>
                      </div>
                    )}

                    {/* Urgent toggle */}
                    {estado !== "listo" && (
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => handleToggleUrgente(p.id, pa?.urgente ?? false)}
                          disabled={actionLoading === p.id}
                          className={`text-xs px-2.5 py-1.5 rounded-lg font-medium disabled:opacity-50 ${
                            pa?.urgente
                              ? "bg-red-50 text-red-600 hover:bg-red-100"
                              : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                          }`}
                        >
                          {pa?.urgente ? "Quitar urgente" : "🔥 Urgente"}
                        </button>
                      </div>
                    )}

                    {/* "Listo" indicator */}
                    {estado === "listo" && (
                      <div className="flex items-center gap-1.5 text-xs text-[#c94070] font-medium pt-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Completado
                      </div>
                    )}

                    {/* Expand/collapse items button */}
                    {p.venta_items && p.venta_items.length > 0 && (
                      <button
                        onClick={() => toggleExpand(p.id)}
                        className="w-full flex items-center justify-center gap-1 text-xs text-gray-400 hover:text-gray-600 py-1 transition-colors"
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp className="w-3.5 h-3.5" />
                            Ocultar productos ({p.venta_items.length})
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3.5 h-3.5" />
                            Ver productos ({p.venta_items.length})
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Expanded items list */}
                  {isExpanded && p.venta_items && p.venta_items.length > 0 && (
                    <div className="border-t border-gray-100 bg-[#fdf5f6]/50">
                      <div className="divide-y divide-gray-100">
                        {p.venta_items.map((item, idx) => (
                          <div
                            key={idx}
                            className="px-4 py-2.5 flex items-start justify-between gap-2"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-gray-800 truncate">
                                {item.descripcion}
                              </p>
                              {item.presentacion && (
                                <p className="text-xs text-gray-400 mt-0.5">
                                  {item.presentacion}
                                  {item.unidades_por_presentacion
                                    ? ` (x${item.unidades_por_presentacion})`
                                    : ""}
                                </p>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-medium text-gray-700">
                                x{item.cantidad}
                              </p>
                              <p className="text-xs text-gray-400">
                                {formatCurrency(item.subtotal)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="px-4 py-2.5 border-t border-gray-200 flex justify-between items-center">
                        <span className="text-xs font-medium text-gray-500">Total</span>
                        <span className="text-sm font-bold text-gray-900">
                          {formatCurrency(p.total)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── E) Armadores metrics ── */}
      {armadorMetrics.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Armadores</h3>
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

      {/* ── F) Orden de entrega (drag & drop) ── */}
      {orderedListos.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">
              Orden de entrega
            </h3>
            {ordenModified && (
              <button
                onClick={saveOrden}
                disabled={savingOrden}
                className="text-xs px-3 py-1.5 rounded-lg bg-[#c94070] text-white font-medium hover:bg-[#a83360] disabled:opacity-50 flex items-center gap-1.5"
              >
                {savingOrden && <Loader2 className="w-3 h-3 animate-spin" />}
                Guardar orden
              </button>
            )}
          </div>
          <div className="space-y-2">
            {orderedListos.map((p, idx) => (
              <div
                key={p.id}
                draggable
                onDragStart={() => handleDragStart(p.id)}
                onDragOver={(e) => handleDragOver(e, p.id)}
                onDragEnd={handleDragEnd}
                onDrop={() => handleDrop(p.id)}
                className={`bg-white rounded-xl border border-gray-100 p-3 flex items-center gap-3 cursor-grab active:cursor-grabbing transition-all ${
                  dragId === p.id ? "opacity-50 scale-95" : ""
                } ${
                  dragOverId === p.id && dragId !== p.id
                    ? "ring-2 ring-[#c94070]"
                    : ""
                }`}
              >
                <GripVertical className="w-4 h-4 text-gray-300 shrink-0" />
                <span className="w-6 h-6 rounded-full bg-[#f7dde7] text-[#c94070] flex items-center justify-center text-xs font-bold shrink-0">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {p.clientes?.nombre ?? "\u2014"}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {[p.clientes?.domicilio, p.clientes?.localidad]
                      .filter(Boolean)
                      .join(", ") || "Sin dirección"}
                  </p>
                </div>
                <span className="text-xs text-gray-400 font-mono shrink-0">
                  #{p.numero?.slice(-4)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── G) Reject Modal ── */}
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
      <div
        className={`w-9 h-9 rounded-xl ${color} flex items-center justify-center mb-2`}
      >
        {icon}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

/* ── Time Metric ── */

function TimeMetric({
  label,
  value,
  bold = false,
  liveValue,
}: {
  label: string;
  value?: string;
  bold?: boolean;
  liveValue?: React.ReactNode;
}) {
  return (
    <div className="bg-gray-50 rounded-lg px-2 py-1.5 text-center">
      <p className="text-[10px] text-gray-400 leading-tight">{label}</p>
      <div
        className={`text-xs mt-0.5 ${
          bold ? "font-semibold text-gray-800" : "text-gray-600"
        }`}
      >
        {liveValue ?? value}
      </div>
    </div>
  );
}
