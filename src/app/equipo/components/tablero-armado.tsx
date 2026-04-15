"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, LogOut, Truck, ShoppingBag, Star } from "lucide-react";
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

const TAB_COLORS: Record<EstadoTab, { active: string; inactive: string }> = {
  pendiente: { active: "bg-amber-500 text-white", inactive: "bg-amber-100 text-amber-800" },
  armando: { active: "bg-violet-600 text-white", inactive: "bg-violet-100 text-violet-800" },
  armado: { active: "bg-blue-600 text-white", inactive: "bg-blue-100 text-blue-800" },
  listo: { active: "bg-[#c94070] text-white", inactive: "bg-[#f7dde7] text-[#a03058]" },
};

export function TableroArmado({ session, onLogout }: TableroArmadoProps) {
  const [pedidos, setPedidos] = useState<PedidoConArmado[]>([]);
  const [loading, setLoading] = useState(true);
  const [entregaFilter, setEntregaFilter] = useState<EntregaFilter>("envio");
  const [estadoTab, setEstadoTab] = useState<EstadoTab>("pendiente");
  const [toast, setToast] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"info" | "success">("info");

  const showToast = (msg: string, type: "info" | "success" = "info") => {
    setToast(msg);
    setToastType(type);
    setTimeout(() => setToast(null), 3000);
  };

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
          showToast("Tablero actualizado", "success");
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ventas" },
        () => {
          fetchPedidos();
          showToast("Nuevo pedido recibido", "success");
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
  const totalPedidos = pedidos.length;
  const listoCount = pedidos.filter((p) => p.pedido_armado?.estado === "listo").length;
  const armandoCount = pedidos.filter((p) => p.pedido_armado?.estado === "armando").length;

  const today = formatDateARG(new Date().toISOString());

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#1e0a10]">
        <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center mb-4 overflow-hidden">
          <img
            src="https://res.cloudinary.com/dss3lnovd/image/upload/w_200,h_80,c_fit,q_auto,f_auto/v1775498382/dulcesur/xxzbm0omlakbcgob46ln.png"
            alt="Dulce Sur"
            width={56}
            height={32}
            className="object-contain"
          />
        </div>
        <Loader2 className="w-6 h-6 animate-spin text-white/50" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fdf5f6]">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 text-white text-sm px-4 py-2 rounded-full shadow-lg ${
          toastType === "success" ? "bg-[#c94070]" : "bg-[#1e0a10]"
        }`}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="bg-[#1e0a10] px-4 pt-4 pb-5 sticky top-0 z-40">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={onLogout}
            className="text-sm text-white/50 flex items-center gap-1 hover:text-white/70 transition-colors"
          >
            <LogOut className="w-4 h-4" /> Salir
          </button>
          <div className="text-right">
            <span className="text-white/50 text-sm">Hola, </span>
            <span className="font-bold text-white text-sm">{session.nombre}</span>
          </div>
        </div>
        <p className="text-white/50 text-xs mb-4">
          Tablero de armado · {today}
        </p>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-white/10 border border-white/10 rounded-xl px-3 py-2">
            <p className="text-white/40 text-[10px] font-medium uppercase">Total</p>
            <p className="text-white font-bold text-lg">{totalPedidos}</p>
          </div>
          <div className="bg-white/10 border border-white/10 rounded-xl px-3 py-2">
            <p className="text-white/40 text-[10px] font-medium uppercase">Armando</p>
            <p className="text-white font-bold text-lg">{armandoCount}</p>
          </div>
          <div className="bg-white/10 border border-white/10 rounded-xl px-3 py-2">
            <p className="text-white/40 text-[10px] font-medium uppercase">Listos</p>
            <p className="text-white font-bold text-lg">{listoCount}</p>
          </div>
        </div>

        {/* Envío / Retiro toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setEntregaFilter("envio")}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 transition-all ${
              entregaFilter === "envio"
                ? "bg-white text-[#c94070]"
                : "bg-white/10 text-white/70"
            }`}
          >
            <Truck className="w-4 h-4" /> Envíos ({envioCount})
          </button>
          <button
            onClick={() => setEntregaFilter("retiro")}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 transition-all ${
              entregaFilter === "retiro"
                ? "bg-white text-[#c94070]"
                : "bg-white/10 text-white/70"
            }`}
          >
            <ShoppingBag className="w-4 h-4" /> Retiros ({retiroCount})
          </button>
        </div>
      </div>

      {/* Mobile: estado tabs */}
      <div className="md:hidden border-b border-[#f0dde5] bg-white sticky top-[195px] z-30">
        <div className="flex overflow-x-auto px-2 gap-1.5 py-2.5">
          {ESTADO_TABS.map((tab) => {
            const count = byEstado(tab).length;
            const colors = TAB_COLORS[tab];
            return (
              <button
                key={tab}
                onClick={() => setEstadoTab(tab)}
                className={`shrink-0 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
                  estadoTab === tab ? colors.active : colors.inactive
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
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-[#f7dde7] flex items-center justify-center mx-auto mb-4">
              <Star className="w-7 h-7 text-[#c94070]" />
            </div>
            <p className="font-semibold text-gray-500 mb-1">Todo al día</p>
            <p className="text-sm text-gray-400">No hay pedidos en esta categoría</p>
          </div>
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
                <div className="text-center py-8">
                  <div className="w-12 h-12 rounded-full bg-[#f7dde7] flex items-center justify-center mx-auto mb-3">
                    <Star className="w-5 h-5 text-[#c94070]" />
                  </div>
                  <p className="text-xs text-gray-400">Sin pedidos</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
