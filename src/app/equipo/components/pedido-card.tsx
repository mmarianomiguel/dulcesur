"use client";

import { useState } from "react";
import { ShoppingBag, Truck, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import type { PedidoConArmado, EquipoSession } from "@/types/equipo";

interface PedidoCardProps {
  pedido: PedidoConArmado;
  session: EquipoSession;
  onUpdateEstado: (ventaId: string, estado: string, notas?: string) => Promise<void>;
}

type TipoPresentacion = "unidad" | "medio" | "caja" | "combo";

function getTipoPresentacion(item: any): TipoPresentacion {
  if (item.es_combo) return "combo";
  const upp = item.unidades_por_presentacion ?? 1;
  if (upp === 0.5) return "medio";
  if (upp > 1) return "caja";
  return "unidad";
}

function getDisplayCantidad(item: any): string {
  const tipo = getTipoPresentacion(item);
  const cantidad = item.cantidad;
  const upp = item.unidades_por_presentacion ?? 1;
  const total = cantidad * upp;

  if (tipo === "unidad") return `${cantidad} ${cantidad === 1 ? "unidad" : "unidades"}`;
  if (tipo === "medio") {
    if (total === 0.5) return "½ cartón";
    if (total === 1) return "1 cartón";
    if (total % 1 === 0.5) return `${Math.floor(total)}½ cartones`;
    return `${total} cartones`;
  }
  if (tipo === "caja") {
    const nombrePres = item.presentacion || "caja";
    return `${cantidad} ${cantidad === 1 ? nombrePres : nombrePres + "s"} × ${upp} unidades`;
  }
  if (tipo === "combo") return `${cantidad} ${cantidad === 1 ? "combo" : "combos"}`;
  return `${cantidad}`;
}

function TypeBadge({ tipo }: { tipo: TipoPresentacion }) {
  const config = {
    unidad: { label: "Unidad", className: "bg-gray-100 text-gray-600" },
    medio: { label: "Medio cartón", className: "bg-amber-100 text-amber-800" },
    caja: { label: "Caja / display", className: "bg-blue-100 text-blue-800" },
    combo: { label: "Combo", className: "bg-violet-100 text-violet-800" },
  }[tipo];

  return (
    <span className={`inline-flex items-center text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide mt-1 ${config.className}`}>
      {config.label}
    </span>
  );
}

export function PedidoCard({ pedido, session, onUpdateEstado }: PedidoCardProps) {
  const items = pedido.venta_items || [];
  const [checked, setChecked] = useState<boolean[]>(items.map(() => false));
  const [modalOpen, setModalOpen] = useState(false);
  const [notas, setNotas] = useState("");
  const [comboExpanded, setComboExpanded] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  const armado = pedido.pedido_armado;
  const estado = armado?.estado || "pendiente";
  const armadorNombre = armado?.armador_nombre || "";
  const notaArmador = armado?.notas || "";
  const isAdmin = session.rol === "admin";
  const isArmador = session.rol === "armador";
  const esMiPedido = armado?.armador_id === session.id;

  const clienteNombre = pedido.clientes?.nombre || "Sin cliente";
  const hora = new Date(pedido.created_at).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  });

  const origenLabel = pedido.origen === "tienda" ? "Web" : pedido.origen === "pos" ? "POS" : "Manual";
  const entregaLabel = pedido.metodo_entrega === "retiro" ? "Retiro" : "Envío";
  const EntregaIcon = pedido.metodo_entrega === "retiro" ? ShoppingBag : Truck;

  const marcados = checked.filter(Boolean).length;
  const total = items.length;
  const pct = total > 0 ? Math.round((marcados / total) * 100) : 0;
  const sinMarcar = items.filter((_, i) => !checked[i]);

  const borderColor: Record<string, string> = {
    pendiente: "#f59e0b",
    armando: "#00BFFF",
    armado: "#00BFFF",
    listo: "#FF2D6B",
  };

  const displayItems = (isAdmin && estado === "armado")
    ? [...items.map((item, i) => ({ item, i, isChecked: checked[i] })).filter(x => x.isChecked),
       ...items.map((item, i) => ({ item, i, isChecked: checked[i] })).filter(x => !x.isChecked)]
    : items.map((item, i) => ({ item, i, isChecked: checked[i] }));

  const [confirmSoltar, setConfirmSoltar] = useState(false);

  const handleTomar = async () => {
    setSaving(true);
    await onUpdateEstado(pedido.id, "armando");
    setSaving(false);
  };

  const handleSoltar = async () => {
    setSaving(true);
    await onUpdateEstado(pedido.id, "pendiente");
    setConfirmSoltar(false);
    setChecked(items.map(() => false));
    setSaving(false);
  };

  const handleConfirmarArmado = async () => {
    setSaving(true);
    await onUpdateEstado(pedido.id, "armado", notas);
    setModalOpen(false);
    setNotas("");
    setSaving(false);
  };

  const handleAprobar = async () => {
    setSaving(true);
    await onUpdateEstado(pedido.id, "listo");
    setSaving(false);
  };

  const showItems = (estado === "armando" && esMiPedido) || (isAdmin && estado === "armado");

  return (
    <>
      <div
        className="bg-white rounded-2xl overflow-hidden"
        style={{
          border: "1px solid #E5E7EB",
          borderLeft: `4px solid ${borderColor[estado] || "#e5e7eb"}`,
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        }}
      >
        {/* Header */}
        <div className="px-4 py-3">
          <div className="flex items-start justify-between gap-2 mb-1">
            <span className="font-bold text-gray-900 text-[15px] truncate">
              {clienteNombre}
            </span>
            <span className="font-extrabold text-primary text-[15px] shrink-0">
              {formatCurrency(pedido.total)}
            </span>
          </div>
          <div className="flex gap-1.5 flex-wrap mb-2">
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              {origenLabel}
            </span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 flex items-center gap-1">
              <EntregaIcon className="w-3 h-3" />
              {entregaLabel}
            </span>
            {armado?.urgente && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 animate-pulse">
                🔥 URGENTE
              </span>
            )}
            {(armado?.rechazos ?? 0) > 0 && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">
                {armado!.rechazos} {armado!.rechazos === 1 ? "rechazo" : "rechazos"}
              </span>
            )}
          </div>
          <div className="text-[11px] text-gray-400">
            #{pedido.numero} · {hora}
          </div>
          {armadorNombre && estado !== "pendiente" && (
            <div className="text-[11px] text-gray-400 mt-0.5">
              Armando: {armadorNombre}
            </div>
          )}
          {armado?.motivo_rechazo && estado === "armando" && (
            <div className="mt-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 flex gap-2">
              <span className="text-red-500 text-sm shrink-0">!</span>
              <div>
                <p className="text-[11px] font-bold text-red-800 mb-0.5">Devuelto por el admin</p>
                <p className="text-[11px] text-red-700">{armado.motivo_rechazo}</p>
              </div>
            </div>
          )}

          {/* Barra de progreso */}
          {estado === "armando" && esMiPedido && total > 0 && (
            <div className="mt-3">
              <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-muted-foreground font-medium">
                  {pct === 100 ? "Todo listo ✓" : `${marcados} de ${total} marcados`}
                </span>
                <span className="text-[10px] text-muted-foreground font-medium">{pct}%</span>
              </div>
            </div>
          )}
        </div>

        {/* Items list */}
        {showItems && (
          <>
            <div style={{ height: "0.5px", background: "#E5E7EB", margin: "0 16px" }} />

            {/* Nota del armador (solo admin) */}
            {isAdmin && notaArmador && (
              <div className="mx-4 mt-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex gap-2">
                <span className="text-amber-500 text-sm shrink-0">⚠</span>
                <div>
                  <p className="text-[11px] font-bold text-amber-800 mb-0.5">Nota del armador</p>
                  <p className="text-[11px] text-amber-700">{notaArmador}</p>
                </div>
              </div>
            )}

            <div className="px-4 py-3">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                Productos a armar
              </p>

              <div style={{ maxHeight: 280, overflowY: "auto", WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
                {displayItems.map(({ item, i, isChecked }) => {
                  const tipo = getTipoPresentacion(item);
                  const displayCant = getDisplayCantidad(item);
                  const isComboExp = comboExpanded.has(i);
                  const sinMarcarItem = isAdmin && estado === "armado" && !isChecked;

                  return (
                    <div
                      key={i}
                      className="py-2 border-b last:border-b-0"
                      style={{
                        borderColor: "#F4F4F6",
                        ...(sinMarcarItem ? {
                          backgroundColor: "#fff8f0",
                          borderLeftWidth: 3,
                          borderLeftColor: "#f59e0b",
                          borderLeftStyle: "solid" as const,
                          paddingLeft: 8,
                        } : {}),
                      }}
                    >
                      <div className="flex items-start gap-3">
                        {/* Checkbox */}
                        {isArmador && estado === "armando" && esMiPedido && (
                          <button
                            onClick={() => {
                              const next = [...checked];
                              next[i] = !next[i];
                              setChecked(next);
                            }}
                            className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                              isChecked ? "bg-primary" : "bg-muted/30 border-[1.5px] border-gray-300"
                            }`}
                          >
                            {isChecked && (
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12"/>
                              </svg>
                            )}
                          </button>
                        )}

                        {/* Info del item */}
                        <div className="flex-1 min-w-0">
                          <p className={`text-[13px] font-semibold leading-tight ${
                            isChecked ? "line-through text-gray-300" : "text-gray-900"
                          }`}>
                            {item.descripcion}
                          </p>
                          <p className={`text-[11px] mt-0.5 ${isChecked ? "text-gray-300" : "text-gray-500"}`}>
                            {displayCant}
                          </p>
                          <TypeBadge tipo={tipo} />
                        </div>

                        {/* Subtotal */}
                        <span className={`text-[12px] font-bold shrink-0 ${
                          isChecked ? "line-through text-gray-300" : "text-gray-900"
                        }`}>
                          {formatCurrency(item.subtotal)}
                        </span>
                      </div>

                      {/* Combo expandible */}
                      {tipo === "combo" && (item as any).combo_items && (item as any).combo_items.length > 0 && (
                        <>
                          <button
                            onClick={() => {
                              const next = new Set(comboExpanded);
                              if (next.has(i)) next.delete(i); else next.add(i);
                              setComboExpanded(next);
                            }}
                            className="flex items-center gap-1 text-[10px] text-sky-700 font-semibold mt-2 ml-10"
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                              {isComboExp ? <polyline points="18 15 12 9 6 15"/> : <polyline points="6 9 12 15 18 9"/>}
                            </svg>
                            {isComboExp ? "Ocultar" : "Ver contenido"}
                          </button>
                          {isComboExp && (
                            <div className="ml-10 mt-2 bg-sky-100 rounded-xl border border-sky-400/20 px-3 py-2">
                              {(item as any).combo_items.map((ci: any, ci_i: number) => (
                                <div key={ci_i} className="flex items-center gap-2 py-1 text-[11px] text-sky-700">
                                  <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                                  {ci.cantidad}× {ci.nombre}
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Notas (visible en armado sin items expandidos) */}
        {!showItems && armado?.notas && (
          <div className="mx-4 mb-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            <p className="text-xs text-amber-700">Nota: {armado.notas}</p>
          </div>
        )}

        {/* Acciones */}
        <div className="px-4 pb-4 flex flex-col gap-2">
          {isArmador && estado === "pendiente" && (
            <button
              onClick={handleTomar}
              disabled={saving}
              className="h-12 rounded-2xl bg-amber-500 text-white font-bold text-[13px] flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Tomar pedido
            </button>
          )}
          {isArmador && estado === "armando" && esMiPedido && (
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmSoltar(true)}
                disabled={saving}
                className="h-12 flex-1 rounded-2xl bg-muted/30 border border-gray-200 text-gray-500 font-bold text-[13px] flex items-center justify-center gap-2 active:scale-95 transition-all"
              >
                Soltar
              </button>
              <button
                onClick={() => setModalOpen(true)}
                disabled={saving}
                className="h-12 flex-[2] rounded-2xl bg-sky-400 text-white font-bold text-[13px] flex items-center justify-center gap-2 active:scale-95 transition-all"
              >
                Marcar como armado
              </button>
            </div>
          )}
          {isArmador && estado === "armado" && (
            <div className="h-12 rounded-2xl bg-gray-100 text-gray-400 font-semibold text-[13px] flex items-center justify-center">
              Esperando control del admin
            </div>
          )}
          {estado === "listo" && (
            <div className="h-10 rounded-2xl bg-emerald-100 text-emerald-700 font-semibold text-[13px] flex items-center justify-center">
              ✓ Listo
            </div>
          )}
          {isAdmin && estado === "armado" && (
            <button
              onClick={handleAprobar}
              disabled={saving}
              className="h-12 rounded-2xl bg-primary text-white font-bold text-[13px] flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-[#FF2D6B]/20 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
              Aprobar pedido
            </button>
          )}
        </div>
      </div>

      {/* Modal confirmar soltar pedido */}
      {confirmSoltar && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(18,19,26,0.6)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmSoltar(false); }}
        >
          <div className="w-[90%] max-w-sm bg-white rounded-3xl px-5 py-6 space-y-4">
            <p className="text-[16px] font-extrabold text-gray-900">Soltar pedido</p>
            <p className="text-[13px] text-gray-500">
              El pedido de <strong>{clienteNombre}</strong> volverá a la lista de pendientes y otro armador podrá tomarlo.
            </p>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => setConfirmSoltar(false)}
                className="h-12 rounded-2xl bg-muted/30 border border-gray-200 text-gray-500 font-bold text-[13px]"
              >
                Cancelar
              </button>
              <button
                onClick={handleSoltar}
                disabled={saving}
                className="h-12 rounded-2xl bg-red-500 text-white font-bold text-[13px] flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Soltar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de observaciones */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end"
          style={{ background: "rgba(18,19,26,0.6)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}
        >
          <div className="w-full bg-white rounded-t-3xl px-5 pt-5 pb-10">
            {/* Handle */}
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-5" />

            <p className="text-[16px] font-extrabold text-gray-900 mb-1">Marcar como armado</p>
            <p className="text-[12px] text-gray-400 mb-5">
              {clienteNombre} · {formatCurrency(pedido.total)}
            </p>

            {/* Items sin marcar */}
            {sinMarcar.length > 0 && (
              <div className="mb-4">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                  Items sin marcar
                </p>
                <div className="bg-amber-50 border border-amber-200 rounded-2xl px-3 py-3 flex gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" className="shrink-0 mt-0.5">
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  <div>
                    <p className="text-[12px] font-bold text-amber-800 mb-1">
                      {sinMarcar.length} {sinMarcar.length === 1 ? "item sin marcar" : "items sin marcar"}
                    </p>
                    <p className="text-[11px] text-amber-700 leading-relaxed">
                      {sinMarcar.slice(0, 3).map(i => i.descripcion).join(", ")}
                      {sinMarcar.length > 3 ? ` y ${sinMarcar.length - 3} más...` : ""}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Observaciones */}
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
              Observaciones del armado
            </p>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Ej: lácteos se agregan al cargar, falta 1 unidad..."
              className="w-full h-20 border border-gray-200 rounded-2xl px-4 py-3 text-[13px] text-gray-800 resize-none bg-muted/30 placeholder:text-gray-400 focus:outline-none focus:border-primary"
            />
            <p className="text-[10px] text-muted-foreground mt-2 mb-5">
              Opcional · el admin lo verá al controlar
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setModalOpen(false)}
                className="h-14 rounded-2xl bg-muted/30 border border-gray-200 text-gray-500 font-bold text-[14px]"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmarArmado}
                disabled={saving}
                className="h-14 rounded-2xl bg-primary text-white font-bold text-[14px] flex items-center justify-center gap-2 shadow-lg shadow-[#FF2D6B]/20 active:scale-95 transition-all disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    Confirmar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
