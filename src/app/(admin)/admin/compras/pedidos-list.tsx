"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  FileText,
  TruckIcon,
  CheckCircle2,
  Clock,
  Search,
  Plus,
  Sparkles,
  Eye,
  Trash2,
  X,
  DollarSign,
  Loader2,
  Package,
  Send,
  Edit,
  AlertTriangle,
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { norm } from "@/lib/utils";
import type { PedidoRow, Proveedor } from "./types";
import { pedidoDisplayNum } from "./types";

/* ───────── Props ───────── */

interface PedidosListProps {
  pedidos: PedidoRow[];
  proveedores: Proveedor[];
  loading: boolean;
  // Filters
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  filterEstado: string;
  setFilterEstado: (v: string) => void;
  pedFilterMode: "day" | "month" | "range" | "all";
  setPedFilterMode: (v: "day" | "month" | "range" | "all") => void;
  pedFilterDay: string;
  setPedFilterDay: (v: string) => void;
  pedFilterMonth: string;
  setPedFilterMonth: (v: string) => void;
  pedFilterYear: string;
  setPedFilterYear: (v: string) => void;
  pedFilterFrom: string;
  setPedFilterFrom: (v: string) => void;
  pedFilterTo: string;
  setPedFilterTo: (v: string) => void;
  // Actions
  onNewPedido: () => void;
  onOpenDetail: (pedido: PedidoRow) => void;
  onRegistrarCompra: (pedido: PedidoRow) => void;
  onDeletePedido: (pedido: PedidoRow) => void;
  onGenerarPedidos: () => void;
  pedirHasta: "minimo" | "maximo";
  setPedirHasta: (v: "minimo" | "maximo") => void;
}

/* ───────── Helpers ───────── */

function estadoConfig(estado: string) {
  switch (estado) {
    case "Borrador":
      return { color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300", borderColor: "border-l-slate-400", icon: FileText };
    case "Enviado":
      return { color: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300", borderColor: "border-l-blue-500", icon: TruckIcon };
    case "Recibido":
      return { color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300", borderColor: "border-l-emerald-500", icon: CheckCircle2 };
    case "Recibido Parcial":
      return { color: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300", borderColor: "border-l-amber-500", icon: Clock };
    case "Ingresado":
      return { color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300", borderColor: "border-l-emerald-600", icon: CheckCircle2 };
    default:
      return { color: "bg-gray-100 text-gray-700", borderColor: "border-l-gray-400", icon: FileText };
  }
}

function relativeDate(fecha: string): string {
  const d = new Date(fecha + "T12:00:00");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "hoy";
  if (diffDays === 1) return "ayer";
  if (diffDays === -1) return "mañana";
  if (diffDays > 0 && diffDays <= 7) return `hace ${diffDays} días`;
  if (diffDays < 0 && diffDays >= -7) return `en ${Math.abs(diffDays)} días`;
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/* ───────── Component ───────── */

export function PedidosList({
  pedidos,
  proveedores,
  loading,
  searchTerm,
  setSearchTerm,
  filterEstado,
  setFilterEstado,
  pedFilterMode,
  setPedFilterMode,
  pedFilterDay,
  setPedFilterDay,
  pedFilterMonth,
  setPedFilterMonth,
  pedFilterYear,
  setPedFilterYear,
  pedFilterFrom,
  setPedFilterFrom,
  pedFilterTo,
  setPedFilterTo,
  onNewPedido,
  onOpenDetail,
  onRegistrarCompra,
  onDeletePedido,
  onGenerarPedidos,
  pedirHasta,
  setPedirHasta,
}: PedidosListProps) {
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; pedido: PedidoRow | null }>({ open: false, pedido: null });
  const [deleting, setDeleting] = useState(false);
  const [mostrarIngresados, setMostrarIngresados] = useState(false);

  /* ── Stats ── */
  const borradores = pedidos.filter((p) => p.estado === "Borrador").length;
  const enviados = pedidos.filter((p) => p.estado === "Enviado" || p.estado === "Recibido Parcial").length;
  const recibidos = pedidos.filter((p) => p.estado === "Recibido" || p.estado === "Ingresado").length;
  const costoTotal = pedidos.reduce((a, p) => a + (p.costo_total_estimado || 0), 0);

  /* ── Filtered list ── */
  const filtered = useMemo(() => {
    return pedidos.filter((p) => {
      // Ocultar Ingresados por defecto (ya fueron convertidos en compra)
      if (!mostrarIngresados && (p.estado === "Ingresado" || p.estado === "Recibido")) return false;
      const matchSearch =
        norm(pedidoDisplayNum(p.id)).includes(norm(searchTerm)) ||
        norm(p.proveedores?.nombre || "").includes(norm(searchTerm));
      let matchEstado = filterEstado === "all";
      if (filterEstado === "Enviado") matchEstado = p.estado === "Enviado" || p.estado === "Recibido Parcial";
      else if (filterEstado === "Recibido") matchEstado = p.estado === "Recibido" || p.estado === "Ingresado";
      else if (filterEstado !== "all") matchEstado = p.estado === filterEstado;
      return matchSearch && matchEstado;
    });
  }, [pedidos, searchTerm, filterEstado, mostrarIngresados]);

  /* ── Delete handler ── */
  async function handleDelete() {
    if (!deleteConfirm.pedido) return;
    setDeleting(true);
    onDeletePedido(deleteConfirm.pedido);
    setDeleting(false);
    setDeleteConfirm({ open: false, pedido: null });
  }

  /* ═══════════════════ RENDER ═══════════════════ */

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Pedidos a Proveedores</h2>
          <p className="text-muted-foreground text-sm">Gestiona tus pedidos de compra</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center rounded-lg border overflow-hidden text-sm">
            <button className={`px-3 py-2 ${pedirHasta === "maximo" ? "bg-primary text-white" : "bg-white hover:bg-gray-50"}`} onClick={() => setPedirHasta("maximo")}>Hasta máx</button>
            <button className={`px-3 py-2 ${pedirHasta === "minimo" ? "bg-primary text-white" : "bg-white hover:bg-gray-50"}`} onClick={() => setPedirHasta("minimo")}>Hasta mín</button>
          </div>
          <Button variant="outline" onClick={onGenerarPedidos}>
            <Sparkles className="w-4 h-4 mr-2" />Generar Pedidos
          </Button>
          <Button onClick={onNewPedido}>
            <Plus className="w-4 h-4 mr-2" />Nuevo Pedido
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          onClick={() => setFilterEstado(filterEstado === "Borrador" ? "all" : "Borrador")}
          className={`rounded-xl border px-4 py-3 text-left transition-all hover:shadow-sm ${filterEstado === "Borrador" ? "ring-2 ring-slate-400 bg-slate-50 dark:bg-slate-900" : "bg-card"}`}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <FileText className="w-4.5 h-4.5 text-slate-600 dark:text-slate-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Borradores</p>
              <p className="text-lg font-bold">{borradores}</p>
            </div>
          </div>
        </button>
        <button
          onClick={() => setFilterEstado(filterEstado === "Enviado" ? "all" : "Enviado")}
          className={`rounded-xl border px-4 py-3 text-left transition-all hover:shadow-sm ${filterEstado === "Enviado" ? "ring-2 ring-blue-400 bg-blue-50 dark:bg-blue-950" : "bg-card"}`}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
              <TruckIcon className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Enviados</p>
              <p className="text-lg font-bold">{enviados}</p>
            </div>
          </div>
        </button>
        <button
          onClick={() => setFilterEstado(filterEstado === "Recibido" ? "all" : "Recibido")}
          className={`rounded-xl border px-4 py-3 text-left transition-all hover:shadow-sm ${filterEstado === "Recibido" ? "ring-2 ring-emerald-400 bg-emerald-50 dark:bg-emerald-950" : "bg-card"}`}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
              <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Recibidos</p>
              <p className="text-lg font-bold">{recibidos}</p>
            </div>
          </div>
        </button>
        <div className="rounded-xl border bg-card px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center">
              <DollarSign className="w-4.5 h-4.5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Costo total</p>
              <p className="text-lg font-bold">{formatCurrency(costoTotal)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar pedido o proveedor..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 h-9" />
        </div>

        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <div className="flex items-center rounded-lg border bg-card overflow-hidden">
            {(["all", "day", "month", "range"] as const).map((m) => {
              const labels = { all: "Todo", day: "Dia", month: "Mes", range: "Rango" };
              return (
                <button
                  key={m}
                  onClick={() => setPedFilterMode(m)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${pedFilterMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                >
                  {labels[m]}
                </button>
              );
            })}
          </div>

          {pedFilterMode === "day" && (
            <Input type="date" value={pedFilterDay} onChange={(e) => setPedFilterDay(e.target.value)} className="w-40 h-9" />
          )}
          {pedFilterMode === "month" && (
            <div className="flex items-center gap-1.5">
              <Select value={pedFilterMonth} onValueChange={(v) => setPedFilterMonth(v ?? "1")}>
                <SelectTrigger className="w-24 h-9 text-xs"><SelectValue placeholder="Mes" /></SelectTrigger>
                <SelectContent>
                  {meses.map((m, i) => (
                    <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input type="number" value={pedFilterYear} onChange={(e) => setPedFilterYear(e.target.value)} className="w-20 h-9 text-xs" />
            </div>
          )}
          {pedFilterMode === "range" && (
            <div className="flex items-center gap-1.5">
              <Input type="date" value={pedFilterFrom} onChange={(e) => setPedFilterFrom(e.target.value)} className="w-36 h-9" />
              <span className="text-xs text-muted-foreground">a</span>
              <Input type="date" value={pedFilterTo} onChange={(e) => setPedFilterTo(e.target.value)} className="w-36 h-9" />
            </div>
          )}

          {filterEstado !== "all" && (
            <Button variant="ghost" size="sm" className="h-9 text-xs text-muted-foreground" onClick={() => setFilterEstado("all")}>
              <X className="w-3.5 h-3.5 mr-1" />Limpiar filtro
            </Button>
          )}
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none h-9 px-2">
            <input
              type="checkbox"
              checked={mostrarIngresados}
              onChange={(e) => setMostrarIngresados(e.target.checked)}
              className="rounded"
            />
            Mostrar ingresados
          </label>
        </div>
      </div>

      {/* Pedido cards */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Package className="w-10 h-10 mb-3 opacity-40" />
          <p className="text-sm">No se encontraron pedidos</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => {
            const cfg = estadoConfig(p.estado);
            const Icon = cfg.icon;
            const provName = p.proveedores?.nombre || "\u2014";
            const rel = relativeDate(p.fecha);

            return (
              <div
                key={p.id}
                className={`rounded-xl border border-l-4 ${cfg.borderColor} bg-card p-4 hover:shadow-md transition-all cursor-pointer group`}
                onClick={() => onOpenDetail(p)}
              >
                {/* Top row: PED number + cost */}
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="font-mono text-xs font-semibold text-muted-foreground">{pedidoDisplayNum(p.id)}</span>
                  <span className="text-sm font-bold shrink-0">{formatCurrency(p.costo_total_estimado || 0)}</span>
                </div>

                {/* Provider name */}
                <p className="font-medium text-sm truncate mb-1">{provName}</p>

                {/* Date relative */}
                <p className="text-xs text-muted-foreground mb-3 capitalize">{rel}</p>

                {/* Bottom row: estado badge + actions */}
                <div className="flex items-center justify-between gap-2">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium ${cfg.color}`}>
                    <Icon className="w-3 h-3" />
                    {p.estado}
                  </span>

                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {p.estado === "Borrador" && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => onOpenDetail(p)}
                        >
                          <Edit className="w-3.5 h-3.5 mr-1" />Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          onClick={() => onRegistrarCompra(p)}
                        >
                          <Send className="w-3.5 h-3.5 mr-1" />Confirmar
                        </Button>
                      </>
                    )}
                    {(p.estado === "Enviado" || p.estado === "Recibido Parcial") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                        onClick={() => onRegistrarCompra(p)}
                      >
                        <Package className="w-3.5 h-3.5 mr-1" />Registrar
                      </Button>
                    )}
                    {(p.estado === "Recibido" || p.estado === "Ingresado") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground"
                        onClick={() => onOpenDetail(p)}
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" />Ver
                      </Button>
                    )}
                    {(p.estado === "Borrador" || p.estado === "Enviado") && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => setDeleteConfirm({ open: true, pedido: p })}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirm.open} onOpenChange={(open) => !open && setDeleteConfirm({ open: false, pedido: null })}>
        <DialogContent className="max-w-sm">
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-red-500" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold">Eliminar pedido</p>
              <p className="text-sm text-muted-foreground mt-2">
                Estas seguro de eliminar el pedido <strong>{deleteConfirm.pedido ? pedidoDisplayNum(deleteConfirm.pedido.id) : ""}</strong>?
              </p>
              <p className="text-xs text-muted-foreground mt-1">Esta accion no se puede deshacer.</p>
            </div>
            <div className="flex gap-2 w-full">
              <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirm({ open: false, pedido: null })}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                Eliminar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
