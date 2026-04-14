"use client";

import { useState } from "react";
import { Package, ShoppingBag, Truck, Loader2, User } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import type { PedidoConArmado, EquipoSession } from "@/types/equipo";
import { NotasModal } from "./notas-modal";

interface PedidoCardProps {
  pedido: PedidoConArmado;
  session: EquipoSession;
  onUpdateEstado: (ventaId: string, estado: string, notas?: string) => Promise<void>;
}

export function PedidoCard({ pedido, session, onUpdateEstado }: PedidoCardProps) {
  const [showNotas, setShowNotas] = useState(false);
  const [loading, setLoading] = useState(false);

  const armado = pedido.pedido_armado;
  const estado = armado?.estado || "pendiente";
  const esArmador = session.rol === "armador";
  const esAdmin = session.rol === "admin";
  const esMiPedido = armado?.armador_id === session.id;

  const clienteNombre = pedido.clientes?.nombre || "Sin nombre";
  const hora = new Date(pedido.created_at).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  });

  const origenLabel = pedido.origen === "tienda" ? "Web" : pedido.origen === "pos" ? "POS" : "Manual";
  const entregaLabel = pedido.metodo_entrega === "retiro" ? "Retiro" : "Envío";

  const handleTomar = async () => {
    setLoading(true);
    await onUpdateEstado(pedido.id, "armando");
    setLoading(false);
  };

  const handleMarcarArmado = async (notas: string) => {
    await onUpdateEstado(pedido.id, "armado", notas);
    setShowNotas(false);
  };

  const handleAprobar = async () => {
    setLoading(true);
    await onUpdateEstado(pedido.id, "listo");
    setLoading(false);
  };

  // Background color by state
  const bgClass =
    estado === "armando"
      ? "border-amber-300 bg-amber-50/50"
      : estado === "armado"
        ? "border-blue-300 bg-blue-50/50"
        : estado === "listo"
          ? "border-emerald-300 bg-emerald-50/50"
          : "border-gray-200 bg-white";

  return (
    <>
      <div className={`rounded-2xl border-2 p-4 space-y-2 ${bgClass}`}>
        {/* Header: name + total */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 truncate">{clienteNombre}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                {origenLabel}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium flex items-center gap-1">
                {entregaLabel === "Retiro" ? <ShoppingBag className="w-3 h-3" /> : <Truck className="w-3 h-3" />}
                {entregaLabel}
              </span>
            </div>
          </div>
          <p className="font-bold text-gray-900 shrink-0">{formatCurrency(pedido.total)}</p>
        </div>

        {/* Numero + hora */}
        <p className="text-xs text-gray-500">
          #{pedido.numero} · {hora}
        </p>

        {/* Armador info */}
        {armado?.armador_id && (
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <User className="w-3 h-3" />
            Armado por: {armado.armador_nombre || "—"}
          </div>
        )}

        {/* Notas */}
        {armado?.notas && (
          <p className="text-xs text-amber-700 bg-amber-100 rounded-lg px-3 py-1.5">
            Nota: {armado.notas}
          </p>
        )}

        {/* Action buttons */}
        {estado === "pendiente" && esArmador && (
          <button
            onClick={handleTomar}
            disabled={loading}
            className="w-full mt-2 py-3 rounded-xl bg-amber-500 text-white font-semibold text-sm flex items-center justify-center gap-2 active:bg-amber-600 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
            Tomar pedido
          </button>
        )}

        {estado === "armando" && esMiPedido && (
          <button
            onClick={() => setShowNotas(true)}
            disabled={loading}
            className="w-full mt-2 py-3 rounded-xl bg-blue-600 text-white font-semibold text-sm flex items-center justify-center gap-2 active:bg-blue-700"
          >
            Marcar como armado
          </button>
        )}

        {estado === "armado" && !esAdmin && (
          <p className="text-xs text-center text-blue-500 font-medium py-2">
            Esperando control del admin
          </p>
        )}

        {estado === "armado" && esAdmin && (
          <button
            onClick={handleAprobar}
            disabled={loading}
            className="w-full mt-2 py-3 rounded-xl bg-emerald-600 text-white font-semibold text-sm flex items-center justify-center gap-2 active:bg-emerald-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Aprobar ✓
          </button>
        )}

        {estado === "listo" && (
          <p className="text-xs text-center text-emerald-600 font-medium py-1">
            ✓ Listo
          </p>
        )}
      </div>

      {showNotas && (
        <NotasModal
          clienteNombre={clienteNombre}
          onConfirm={handleMarcarArmado}
          onCancel={() => setShowNotas(false)}
        />
      )}
    </>
  );
}
