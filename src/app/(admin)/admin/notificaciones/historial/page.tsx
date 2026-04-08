"use client";

import { useState, useEffect, useCallback } from "react";
import { Clock, Loader2, Eye, ChevronLeft, ChevronRight, CheckCircle, XCircle, Send as SendIcon } from "lucide-react";
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
  cliente: "Cliente específico",
  zona: "Por zona",
  rol: "Por rol",
  inactividad: "Por inactividad",
  clientes_ids: "Lista de clientes",
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

      // Get recipient counts per notification
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
      // Resolve names
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Clock className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Historial de Notificaciones</h1>
        </div>
        <Select value={tipoFilter} onValueChange={(v) => { if (v) { setTipoFilter(v); setPage(0); } }}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {Object.entries(TIPO_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : notifs.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No hay notificaciones enviadas</div>
      ) : (
        <>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Fecha</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Título</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Tipo</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Audiencia</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-gray-600">Destinatarios</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-gray-600">Leídas</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {notifs.map((n) => (
                  <tr key={n.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer" onClick={() => openDetail(n)}>
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{formatDateARG(n.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-sm truncate max-w-xs">{n.titulo}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={TIPO_COLORS[n.tipo] || ""}>{TIPO_LABELS[n.tipo] || n.tipo}</Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{SEG_LABELS[n.segmentacion?.tipo] || n.segmentacion?.tipo}</td>
                    <td className="px-4 py-3 text-center text-sm">{n.dest_count}</td>
                    <td className="px-4 py-3 text-center text-sm">
                      {n.dest_count ? (
                        <span className={n.leidas_count === n.dest_count ? "text-green-600" : "text-gray-500"}>
                          {n.leidas_count}/{n.dest_count}
                        </span>
                      ) : "-"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="icon"><Eye className="h-4 w-4" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">{total} notificaciones</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">{page + 1} / {totalPages}</span>
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
              Detalle de notificación
            </DialogTitle>
          </DialogHeader>
          {detailNotif && (
            <div className="space-y-4 mt-2">
              <div>
                <div className="font-semibold">{detailNotif.titulo}</div>
                <div className="text-sm text-gray-500 mt-1 whitespace-pre-wrap">{detailNotif.mensaje}</div>
              </div>
              <div className="flex gap-2 text-xs text-gray-400">
                <Badge className={TIPO_COLORS[detailNotif.tipo] || ""}>{TIPO_LABELS[detailNotif.tipo]}</Badge>
                <span>{formatDateARG(detailNotif.created_at)}</span>
              </div>

              <div className="border-t pt-3">
                <div className="text-sm font-medium mb-2">Destinatarios ({detailDests.length})</div>
                {loadingDetail ? (
                  <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
                ) : detailDests.length === 0 ? (
                  <div className="text-sm text-gray-400">Sin destinatarios</div>
                ) : (
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {detailDests.map((d) => (
                      <div key={d.id} className="flex items-center justify-between text-sm py-1.5 px-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800">
                        <span className="truncate">{d.cliente_nombre || d.usuario_nombre || "—"}</span>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="flex items-center gap-1 text-xs" title="Push">
                            {d.push_enviada ? <CheckCircle className="h-3.5 w-3.5 text-green-500" /> : <XCircle className="h-3.5 w-3.5 text-gray-300" />}
                            Push
                          </span>
                          <span className="flex items-center gap-1 text-xs" title="Leída">
                            {d.leida ? <CheckCircle className="h-3.5 w-3.5 text-green-500" /> : <XCircle className="h-3.5 w-3.5 text-gray-300" />}
                            Leída
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
