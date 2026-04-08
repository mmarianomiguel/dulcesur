"use client";

import { useState, useEffect, useCallback } from "react";
import { Clock, Loader2, Eye, ChevronLeft, ChevronRight, CheckCircle, XCircle, Send as SendIcon, Users, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { showAdminToast } from "@/components/admin-toast";
import { supabase } from "@/lib/supabase";
import { formatDateARG } from "@/lib/formatters";

const TIPO_COLORS: Record<string, string> = {
  pedido: "bg-blue-100 text-blue-700",
  promocion: "bg-green-100 text-green-700",
  recordatorio: "bg-amber-100 text-amber-700",
  catalogo: "bg-purple-100 text-purple-700",
  cuenta_corriente: "bg-rose-100 text-rose-700",
  sistema: "bg-gray-100 text-gray-700",
};

const TIPO_LABELS: Record<string, string> = {
  pedido: "Pedido",
  promocion: "Promoción",
  recordatorio: "Recordatorio",
  catalogo: "Catálogo",
  cuenta_corriente: "Cta. Cte.",
  sistema: "Sistema",
};

const SEG_LABELS: Record<string, string> = {
  todos: "Todos",
  cliente: "Cliente",
  zona: "Zona",
  rol: "Rol",
  inactividad: "Inactivos",
  clientes_ids: "Hoja ruta",
};

const PAGE_SIZE = 20;

interface NotifRow {
  id: string;
  titulo: string;
  mensaje: string;
  tipo: string;
  url: string | null;
  segmentacion: any;
  created_at: string;
  enviada_por: string | null;
  dest_count?: number;
  leidas_count?: number;
}

interface DestRow {
  id: string;
  cliente_id: number | null;
  usuario_id: string | null;
  leida: boolean;
  push_enviada: boolean;
  push_error: string | null;
  cliente_nombre?: string;
  usuario_nombre?: string;
}

function tiempoRelativo(fecha: string): string {
  const diff = Date.now() - new Date(fecha).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

export default function HistorialPage() {
  const [notifs, setNotifs] = useState<NotifRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [tipoFilter, setTipoFilter] = useState("all");
  const [detailNotif, setDetailNotif] = useState<NotifRow | null>(null);
  const [detailDests, setDetailDests] = useState<DestRow[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const fetchNotifs = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("notificaciones")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (tipoFilter !== "all") query = query.eq("tipo", tipoFilter);

      const { data, count, error } = await query;
      if (error) throw error;

      const notifIds = (data || []).map((n: any) => n.id);
      let destCounts: Record<string, { total: number; leidas: number }> = {};

      if (notifIds.length > 0) {
        const { data: dests } = await supabase
          .from("notificacion_destinatarios")
          .select("notificacion_id, leida")
          .in("notificacion_id", notifIds);

        (dests || []).forEach((d: any) => {
          if (!destCounts[d.notificacion_id]) destCounts[d.notificacion_id] = { total: 0, leidas: 0 };
          destCounts[d.notificacion_id].total++;
          if (d.leida) destCounts[d.notificacion_id].leidas++;
        });
      }

      setNotifs((data || []).map((n: any) => ({
        ...n,
        dest_count: destCounts[n.id]?.total ?? 0,
        leidas_count: destCounts[n.id]?.leidas ?? 0,
      })));
      setTotal(count ?? 0);
    } catch {
      showAdminToast("Error al cargar historial", "error");
    } finally {
      setLoading(false);
    }
  }, [page, tipoFilter]);

  useEffect(() => { fetchNotifs(); }, [fetchNotifs]);

  const openDetail = async (notif: NotifRow) => {
    setDetailNotif(notif);
    setLoadingDetail(true);
    try {
      const { data: dests } = await supabase
        .from("notificacion_destinatarios")
        .select("*")
        .eq("notificacion_id", notif.id)
        .order("created_at", { ascending: false });

      const rows = dests || [];
      const clienteIds = rows.filter((d: any) => d.cliente_id).map((d: any) => d.cliente_id);
      const userIds = rows.filter((d: any) => d.usuario_id).map((d: any) => d.usuario_id);

      let clienteNames: Record<number, string> = {};
      let userNames: Record<string, string> = {};

      if (clienteIds.length > 0) {
        const { data: clientes } = await supabase.from("clientes").select("id, nombre").in("id", clienteIds);
        (clientes || []).forEach((c: any) => { clienteNames[c.id] = c.nombre; });
      }
      if (userIds.length > 0) {
        const { data: users } = await supabase.from("usuarios").select("id, nombre").in("id", userIds);
        (users || []).forEach((u: any) => { userNames[u.id] = u.nombre; });
      }

      setDetailDests(rows.map((d: any) => ({
        ...d,
        cliente_nombre: d.cliente_id ? clienteNames[d.cliente_id] || `Cliente #${d.cliente_id}` : undefined,
        usuario_nombre: d.usuario_id ? userNames[d.usuario_id] || `Usuario ${d.usuario_id.slice(0, 8)}` : undefined,
      })));
    } catch {
      showAdminToast("Error al cargar detalle", "error");
    } finally {
      setLoadingDetail(false);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Clock className="h-4.5 w-4.5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold truncate">Historial</h1>
            <p className="text-xs text-muted-foreground hidden sm:block">Todas las notificaciones enviadas</p>
          </div>
        </div>
        <Select value={tipoFilter} onValueChange={(v) => { if (v) { setTipoFilter(v); setPage(0); } }}>
          <SelectTrigger className="w-32 sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {Object.entries(TIPO_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : notifs.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-3">
            <Inbox className="h-7 w-7 text-gray-400" />
          </div>
          <p className="text-gray-500 font-medium">No hay notificaciones</p>
          <p className="text-sm text-gray-400 mt-1">Las notificaciones enviadas aparecerán acá</p>
        </div>
      ) : (
        <>
          {/* Card list */}
          <div className="space-y-2">
            {notifs.map((n) => (
              <button
                key={n.id}
                onClick={() => openDetail(n)}
                className="w-full text-left bg-white dark:bg-gray-900 border rounded-xl p-3.5 sm:p-4 hover:border-primary/20 hover:shadow-sm transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Title row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm truncate">{n.titulo}</span>
                      <Badge className={`${TIPO_COLORS[n.tipo] || ""} text-[10px] px-1.5 py-0 shrink-0`}>
                        {TIPO_LABELS[n.tipo] || n.tipo}
                      </Badge>
                    </div>

                    {/* Message preview */}
                    <p className="text-xs text-gray-500 mt-1 line-clamp-1">{n.mensaje}</p>

                    {/* Meta row */}
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-400">
                      <span>{formatDateARG(n.created_at)}</span>
                      <span className="flex items-center gap-0.5">
                        <Users className="h-3 w-3" /> {n.dest_count}
                      </span>
                      <span>
                        {n.dest_count ? (
                          <span className={n.leidas_count === n.dest_count ? "text-green-500" : ""}>
                            {n.leidas_count}/{n.dest_count} leídas
                          </span>
                        ) : "—"}
                      </span>
                      <span className="hidden sm:inline">{SEG_LABELS[n.segmentacion?.tipo] || ""}</span>
                    </div>
                  </div>

                  {/* Arrow indicator */}
                  <ChevronRight className="h-4 w-4 text-gray-300 shrink-0 mt-1" />
                </div>
              </button>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm text-gray-500">{total} notificaciones</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm tabular-nums">{page + 1} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Detail dialog */}
      <Dialog open={!!detailNotif} onOpenChange={() => setDetailNotif(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SendIcon className="h-5 w-5 text-primary" />
              Detalle
            </DialogTitle>
          </DialogHeader>
          {detailNotif && (
            <div className="space-y-4 mt-2">
              {/* Notification content */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3.5">
                <div className="font-semibold text-sm">{detailNotif.titulo}</div>
                <div className="text-xs text-gray-500 mt-1 whitespace-pre-wrap">{detailNotif.mensaje}</div>
              </div>

              <div className="flex items-center gap-2 flex-wrap text-xs text-gray-400">
                <Badge className={TIPO_COLORS[detailNotif.tipo] || ""}>{TIPO_LABELS[detailNotif.tipo]}</Badge>
                <span>{formatDateARG(detailNotif.created_at)}</span>
                <span>{SEG_LABELS[detailNotif.segmentacion?.tipo] || ""}</span>
              </div>

              {/* Recipients */}
              <div className="border-t pt-3">
                <div className="text-sm font-medium mb-2 flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-gray-400" />
                  Destinatarios ({detailDests.length})
                </div>
                {loadingDetail ? (
                  <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
                ) : detailDests.length === 0 ? (
                  <div className="text-sm text-gray-400 py-4 text-center">Sin destinatarios</div>
                ) : (
                  <div className="space-y-0.5 max-h-64 overflow-y-auto">
                    {detailDests.map((d) => (
                      <div key={d.id} className="flex items-center justify-between text-sm py-2 px-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
                        <span className="truncate font-medium text-xs">{d.cliente_nombre || d.usuario_nombre || "—"}</span>
                        <div className="flex items-center gap-2.5 shrink-0">
                          <span className="flex items-center gap-1 text-[11px]" title="Push enviada">
                            {d.push_enviada ? <CheckCircle className="h-3.5 w-3.5 text-green-500" /> : <XCircle className="h-3.5 w-3.5 text-gray-300" />}
                          </span>
                          <span className="flex items-center gap-1 text-[11px]" title="Leída">
                            {d.leida ? <Eye className="h-3.5 w-3.5 text-green-500" /> : <Eye className="h-3.5 w-3.5 text-gray-300" />}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
