"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, LogOut, Truck, ShoppingBag } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatDateARG } from "@/lib/formatters";
import type { PedidoConArmado, EquipoSession } from "@/types/equipo";
import { PedidoCard } from "./pedido-card";

interface TableroArmadoProps {
  session: EquipoSession;
  onLogout: () => void;
}

type EntregaFilter = "envio" | "retiro";
type EstadoTab = "pendiente" | "armando" | "armado" | "listo";

const ESTADO_TABS: EstadoTab[] = ["pendiente", "armando", "armado", "listo"];
const ESTADO_LABELS: Record<EstadoTab, string> = {
  pendiente: "Pendiente",
  armando: "Armando",
  armado: "Armado",
  listo: "Listo",
};

export function TableroArmado({ session, onLogout }: TableroArmadoProps) {
  const [pedidos, setPedidos] = useState<PedidoConArmado[]>([]);
  const [loading, setLoading] = useState(true);
  const [entregaFilter, setEntregaFilter] = useState<EntregaFilter>("envio");
  const [estadoTab, setEstadoTab] = useState<EstadoTab>("pendiente");
  const [toast, setToast] = useState<string | null>(null);

  const fetchPedidos = useCallback(async () => {
    try {
      const res = await fetch("/api/equipo/pedidos");
      if (!res.ok) throw new Error("Error al cargar pedidos");
      const data = await res.json();
      setPedidos(data.pedidos || []);
    } catch {
      // silent retry on next interval
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPedidos();
  }, [fetchPedidos]);

  // Supabase Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("pedido_armado_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedido_armado" },
        () => {
          fetchPedidos();
          setToast("Tablero actualizado");
          setTimeout(() => setToast(null), 3000);
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ventas" },
        () => {
          fetchPedidos();
          setToast("Nuevo pedido recibido");
          setTimeout(() => setToast(null), 3000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchPedidos]);

  const handleUpdateEstado = async (ventaId: string, estado: string, notas?: string) => {
    await fetch(`/api/equipo/pedidos/${ventaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        estado,
        armador_id: session.id,
        ...(notas !== undefined ? { notas } : {}),
      }),
    });
    await fetchPedidos();
  };

  // Filter by entrega type
  const filtered = pedidos.filter((p) => {
    if (entregaFilter === "envio") {
      return p.metodo_entrega === "envio" || p.metodo_entrega === "envio_a_domicilio";
    }
    return p.metodo_entrega === "retiro";
  });

  // Group by estado
  const byEstado = (estado: EstadoTab) =>
    filtered.filter((p) => (p.pedido_armado?.estado || "pendiente") === estado);

  const envioCount = pedidos.filter(
    (p) => p.metodo_entrega === "envio" || p.metodo_entrega === "envio_a_domicilio"
  ).length;
  const retiroCount = pedidos.filter((p) => p.metodo_entrega === "retiro").length;

  const today = formatDateARG(new Date().toISOString());

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-4 py-2 rounded-full shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b px-4 py-3 sticky top-0 z-40">
        <div className="flex items-center justify-between">
          <button
            onClick={onLogout}
            className="text-sm text-gray-500 flex items-center gap-1"
          >
            <LogOut className="w-4 h-4" /> Salir
          </button>
          <span className="font-semibold text-gray-800">
            Hola, {session.nombre}
          </span>
          <span className="w-3 h-3 rounded-full bg-emerald-500" />
        </div>
        <p className="text-sm text-gray-500 mt-1">
          Tablero de armado · {today}
        </p>

        {/* Envío / Retiro toggle */}
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => setEntregaFilter("envio")}
            className={`flex-1 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 ${
              entregaFilter === "envio"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            <Truck className="w-4 h-4" /> Envíos ({envioCount})
          </button>
          <button
            onClick={() => setEntregaFilter("retiro")}
            className={`flex-1 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 ${
              entregaFilter === "retiro"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            <ShoppingBag className="w-4 h-4" /> Retiros ({retiroCount})
          </button>
        </div>
      </div>

      {/* Mobile: estado tabs */}
      <div className="md:hidden border-b bg-white sticky top-[145px] z-30">
        <div className="flex overflow-x-auto px-2 gap-1 py-2">
          {ESTADO_TABS.map((tab) => {
            const count = byEstado(tab).length;
            return (
              <button
                key={tab}
                onClick={() => setEstadoTab(tab)}
                className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap ${
                  estadoTab === tab
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {ESTADO_LABELS[tab]} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Mobile: single column */}
      <div className="md:hidden p-4 space-y-3">
        {byEstado(estadoTab).length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-8">
            Sin pedidos en esta categoría
          </p>
        ) : (
          byEstado(estadoTab).map((p) => (
            <PedidoCard
              key={p.id}
              pedido={p}
              session={session}
              onUpdateEstado={handleUpdateEstado}
            />
          ))
        )}
      </div>

      {/* Desktop: 4-column grid */}
      <div className="hidden md:grid md:grid-cols-4 gap-4 p-4">
        {ESTADO_TABS.map((tab) => (
          <div key={tab}>
            <h3 className="font-semibold text-gray-700 text-sm mb-3 px-1">
              {ESTADO_LABELS[tab]} ({byEstado(tab).length})
            </h3>
            <div className="space-y-3">
              {byEstado(tab).map((p) => (
                <PedidoCard
                  key={p.id}
                  pedido={p}
                  session={session}
                  onUpdateEstado={handleUpdateEstado}
                />
              ))}
              {byEstado(tab).length === 0 && (
                <p className="text-center text-xs text-gray-400 py-6">
                  Sin pedidos
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
