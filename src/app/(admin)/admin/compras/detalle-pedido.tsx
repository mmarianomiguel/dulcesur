"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { showAdminToast } from "@/components/admin-toast";
import { todayARG, formatCurrency } from "@/lib/formatters";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Edit,
  Send,
  Save,
  Loader2,
  Copy,
  MessageCircle,
  Package,
  Trash2,
  Check,
  FileText,
  TruckIcon,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from "lucide-react";
import type { PedidoRow, PedidoItemRow, Proveedor } from "./types";
import { pedidoDisplayNum } from "./types";

/* ───────── props ───────── */

interface DetallePedidoProps {
  pedido: PedidoRow;
  proveedores: Proveedor[];
  currentUser: { nombre: string } | null;
  onBack: () => void;
  onRefresh: () => void;
  onRegistrarCompra: (pedido: PedidoRow) => void;
  onDeletePedido: (pedido: PedidoRow) => void;
}

/* ───────── helpers ───────── */

function estadoConfig(estado: string) {
  switch (estado) {
    case "Borrador":
      return { color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300", icon: FileText };
    case "Enviado":
      return { color: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300", icon: TruckIcon };
    case "Recibido":
      return { color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300", icon: CheckCircle2 };
    case "Recibido Parcial":
      return { color: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300", icon: Clock };
    case "Ingresado":
      return { color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300", icon: CheckCircle2 };
    default:
      return { color: "bg-gray-100 text-gray-700", icon: FileText };
  }
}

/* ───────── component ───────── */

export default function DetallePedido({
  pedido,
  proveedores,
  currentUser,
  onBack,
  onRefresh,
  onRegistrarCompra,
  onDeletePedido,
}: DetallePedidoProps) {
  // State
  const [detailPedido, setDetailPedido] = useState<PedidoRow>(pedido);
  const [detailItems, setDetailItems] = useState<PedidoItemRow[]>([]);
  const [editingDetail, setEditingDetail] = useState(false);
  const [observacion, setObservacion] = useState(pedido.observacion || "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Load items on mount
  useEffect(() => {
    supabase
      .from("pedido_proveedor_items")
      .select("*")
      .eq("pedido_id", pedido.id)
      .order("created_at")
      .then(({ data }) => {
        const items = ((data || []) as any[]).map((item) => ({
          ...item,
          cantidad_recibida: item.cantidad_recibida ?? 0,
        }));
        setDetailItems(items as PedidoItemRow[]);
      });
  }, [pedido.id]);

  // Sync pedido prop changes
  useEffect(() => {
    setDetailPedido(pedido);
    setObservacion(pedido.observacion || "");
  }, [pedido]);

  /* ── crear compra pendiente ── */

  const crearCompraPendiente = async (
    pedidoId: string,
    proveedorId: string,
    itemsData: { producto_id: string; codigo: string; descripcion: string; cantidad: number; precio_unitario: number; subtotal: number }[],
    totalEstimadoVal: number,
  ) => {
    const { data: numData } = await supabase.rpc("next_numero", { p_tipo: "compra" });
    const numero = numData || "C-0000";
    const fecha = todayARG();
    const pedDisplay = pedidoDisplayNum(pedidoId);

    const { data: compra, error: compraError } = await supabase
      .from("compras")
      .insert({
        numero,
        fecha,
        proveedor_id: proveedorId,
        total: totalEstimadoVal,
        estado: "Pendiente",
        forma_pago: "Efectivo",
        estado_pago: "Pendiente",
        observacion: `Generado desde pedido ${pedDisplay}`,
      })
      .select("id")
      .single();

    if (compraError || !compra) {
      console.error("Error creando compra pendiente:", compraError?.message);
      return;
    }

    const compraItems = itemsData.map((item) => ({
      compra_id: compra.id,
      producto_id: item.producto_id,
      codigo: item.codigo,
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
      subtotal: item.subtotal,
    }));
    await supabase.from("compra_items").insert(compraItems);
  };

  /* ── change estado ── */

  const changeEstado = async (newEstado: string) => {
    await supabase
      .from("pedidos_proveedor")
      .update({ estado: newEstado })
      .eq("id", detailPedido.id);

    // Si se marca como Enviado, crear compra pendiente
    if (newEstado === "Enviado" && detailPedido.proveedor_id) {
      const compraItemsData = detailItems.map((item) => ({
        producto_id: item.producto_id,
        codigo: item.codigo,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        subtotal: item.subtotal,
      }));
      const total = detailItems.reduce((a, i) => a + i.subtotal, 0);
      await crearCompraPendiente(detailPedido.id, detailPedido.proveedor_id, compraItemsData, total);
      showAdminToast("Pedido guardado y registrado como compra pendiente", "success");
    }

    setDetailPedido({ ...detailPedido, estado: newEstado });
    onRefresh();
  };

  /* ── save edited borrador ── */

  const saveEditedBorrador = async () => {
    if (detailItems.length === 0) return;
    setSaving(true);
    setSaveError("");

    try {
      const total = detailItems.reduce((a, i) => a + i.subtotal, 0);
      await supabase
        .from("pedidos_proveedor")
        .update({ costo_total_estimado: total, observacion: observacion || null })
        .eq("id", detailPedido.id);

      await supabase.from("pedido_proveedor_items").delete().eq("pedido_id", detailPedido.id);

      const rows = detailItems.map((item) => ({
        pedido_id: detailPedido.id,
        producto_id: item.producto_id,
        codigo: item.codigo,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        faltante: item.faltante,
        cantidad_recibida: item.cantidad_recibida || 0,
        precio_unitario: item.precio_unitario,
        subtotal: item.subtotal,
      }));
      await supabase.from("pedido_proveedor_items").insert(rows);

      setDetailPedido({ ...detailPedido, costo_total_estimado: total, observacion: observacion || null });
      setEditingDetail(false);
      setSuccessMsg("Borrador actualizado");
      setTimeout(() => setSuccessMsg(""), 3000);
      onRefresh();
    } catch (err: any) {
      setSaveError(err?.message || "Error al actualizar.");
    } finally {
      setSaving(false);
    }
  };

  /* ── detail item editing ── */

  const updateDetailItemField = (index: number, field: "cantidad" | "precio_unitario", value: number) => {
    setDetailItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      if (field === "cantidad") {
        updated[index].faltante = value;
      }
      updated[index].subtotal = updated[index].cantidad * updated[index].precio_unitario;
      return updated;
    });
  };

  const removeDetailItem = (index: number) => {
    setDetailItems((prev) => prev.filter((_, i) => i !== index));
  };

  /* ── handle delete ── */

  const handleDelete = async () => {
    setDeleting(true);
    try {
      onDeletePedido(detailPedido);
    } finally {
      setDeleting(false);
      setDeleteConfirm(false);
    }
  };

  /* ── derived ── */

  const isParcial = detailPedido.estado === "Recibido Parcial";
  const canReceive = detailPedido.estado === "Borrador" || detailPedido.estado === "Enviado" || isParcial;
  const canEdit = detailPedido.estado === "Borrador" || detailPedido.estado === "Enviado";
  const canDelete = detailPedido.estado === "Borrador" || detailPedido.estado === "Enviado";
  const detailTotal = detailItems.reduce((a, i) => a + i.subtotal, 0);
  const cfg = estadoConfig(detailPedido.estado);
  const EstadoIcon = cfg.icon;

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <Button variant="ghost" size="icon" className="mt-1 shrink-0" onClick={onBack}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
                {pedidoDisplayNum(detailPedido.id)}
              </h1>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
                <EstadoIcon className="w-3.5 h-3.5" />
                {detailPedido.estado}
              </span>
            </div>
            <p className="text-muted-foreground text-sm mt-0.5">
              {detailPedido.proveedores?.nombre || "Sin proveedor"} &middot;{" "}
              {new Date(detailPedido.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canEdit && !editingDetail && (
            <>
              <Button size="sm" variant="outline" onClick={() => setEditingDetail(true)}>
                <Edit className="w-4 h-4 mr-1.5" />Editar
              </Button>
              <Button size="sm" onClick={() => changeEstado("Enviado")}>
                <Send className="w-4 h-4 mr-1.5" />Marcar Enviado
              </Button>
            </>
          )}
          {canEdit && editingDetail && (
            <>
              <Button size="sm" variant="outline" onClick={() => setEditingDetail(false)}>Cancelar</Button>
              <Button size="sm" onClick={saveEditedBorrador} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
                Guardar
              </Button>
            </>
          )}
          <Button size="sm" variant="outline" onClick={() => {
            const provNombre = detailPedido.proveedores?.nombre || "Proveedor";
            const lines = detailItems.map((i) => `\u2022 ${i.cantidad} - ${i.descripcion || "Producto"}`);
            const text = `Hola ${provNombre}, te paso el pedido:\n\n${lines.join("\n")}\n\nGracias!`;
            navigator.clipboard.writeText(text);
            showAdminToast("Pedido copiado al portapapeles", "success");
          }}>
            <Copy className="w-4 h-4 mr-1.5" />Copiar
          </Button>
          <Button size="sm" variant="outline" className="text-green-600 border-green-200 hover:bg-green-50" onClick={() => {
            const provNombre = detailPedido.proveedores?.nombre || "Proveedor";
            const lines = detailItems.map((i) => `\u2022 ${i.cantidad} - ${i.descripcion || "Producto"}`);
            const text = `Hola ${provNombre}, te paso el pedido:\n\n${lines.join("\n")}\n\nGracias!`;
            window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
          }}>
            <MessageCircle className="w-4 h-4 mr-1.5" />WhatsApp
          </Button>
          {canReceive && (
            <Button size="sm" onClick={() => onRegistrarCompra(detailPedido)}>
              <Package className="w-4 h-4 mr-1.5" />Registrar compra
            </Button>
          )}
          {canDelete && !editingDetail && (
            <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200" onClick={() => setDeleteConfirm(true)}>
              <Trash2 className="w-4 h-4 mr-1.5" />Eliminar
            </Button>
          )}
        </div>
      </div>

      {successMsg && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
          {successMsg}
        </div>
      )}

      {/* Info row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border bg-card px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Proveedor</p>
          <p className="text-sm font-semibold mt-0.5">{detailPedido.proveedores?.nombre || "\u2014"}</p>
        </div>
        <div className="rounded-xl border bg-card px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Fecha</p>
          <p className="text-sm font-semibold mt-0.5">{new Date(detailPedido.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}</p>
        </div>
        <div className="rounded-xl border bg-card px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Items</p>
          <p className="text-sm font-semibold mt-0.5">{detailItems.length} productos</p>
        </div>
        <div className="rounded-xl border bg-card px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Total estimado</p>
          <p className="text-sm font-semibold mt-0.5 text-emerald-600">{formatCurrency(detailTotal)}</p>
        </div>
      </div>

      {detailPedido.observacion && !editingDetail && (
        <div className="rounded-xl border bg-muted/30 px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Observaciones</p>
          <p className="text-sm">{detailPedido.observacion}</p>
        </div>
      )}
      {editingDetail && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Observaciones</Label>
          <Input value={observacion} onChange={(e) => setObservacion(e.target.value)} placeholder="Notas..." />
        </div>
      )}

      {/* Items table */}
      <Card>
        <CardContent className="pt-0">
          {/* Mobile card list */}
          <div className="sm:hidden divide-y">
            {detailItems.map((item, idx) => {
              const pendiente = item.cantidad - (item.cantidad_recibida || 0);
              return (
                <div key={item.id} className="py-3 px-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{item.descripcion}</p>
                      <p className="text-xs text-muted-foreground font-mono">{item.codigo}</p>
                    </div>
                    {editingDetail && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-500 shrink-0" onClick={() => removeDetailItem(idx)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground block">Pedido</span>
                      {editingDetail ? (
                        <Input type="number" min={1} value={item.cantidad}
                          onChange={(e) => updateDetailItemField(idx, "cantidad", Math.max(1, Number(e.target.value)))}
                          className="h-8 text-center mt-1" />
                      ) : (
                        <span className="font-medium">{item.cantidad}</span>
                      )}
                    </div>
                    {(isParcial || detailPedido.estado === "Recibido") && (
                      <div>
                        <span className="text-muted-foreground block">Recibido</span>
                        <span className="text-emerald-600 font-medium">{item.cantidad_recibida || 0}</span>
                      </div>
                    )}
                    {(isParcial || detailPedido.estado === "Recibido") && (
                      <div>
                        <span className="text-muted-foreground block">Pendiente</span>
                        {pendiente > 0 ? (
                          <span className="text-amber-600 font-medium">{pendiente}</span>
                        ) : (
                          <Check className="w-4 h-4 text-emerald-500" />
                        )}
                      </div>
                    )}
                    <div>
                      <span className="text-muted-foreground block">Precio Unit.</span>
                      {editingDetail ? (
                        <Input type="number" min={0} value={item.precio_unitario}
                          onChange={(e) => updateDetailItemField(idx, "precio_unitario", Math.max(0, Number(e.target.value)))}
                          className="h-8 text-right mt-1" />
                      ) : (
                        <span>{formatCurrency(item.precio_unitario)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-end text-xs">
                    <span className="text-muted-foreground mr-2">Subtotal:</span>
                    <span className="font-semibold">{formatCurrency(item.subtotal)}</span>
                  </div>
                </div>
              );
            })}
            <div className="flex justify-end pt-3 px-4">
              <span className="text-sm text-muted-foreground mr-4">Total:</span>
              <span className="text-sm font-bold">{formatCurrency(detailTotal)}</span>
            </div>
          </div>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-3 px-4 font-medium">Codigo</th>
                  <th className="text-left py-3 px-4 font-medium">Descripcion</th>
                  <th className="text-center py-3 px-4 font-medium">Pedido</th>
                  {(isParcial || detailPedido.estado === "Recibido") && (
                    <th className="text-center py-3 px-4 font-medium">Recibido</th>
                  )}
                  {(isParcial || detailPedido.estado === "Recibido") && (
                    <th className="text-center py-3 px-4 font-medium">Pendiente</th>
                  )}
                  <th className="text-right py-3 px-4 font-medium">Precio Unit.</th>
                  <th className="text-right py-3 px-4 font-medium">Subtotal</th>
                  {editingDetail && <th className="w-10"></th>}
                </tr>
              </thead>
              <tbody>
                {detailItems.map((item, idx) => {
                  const pendiente = item.cantidad - (item.cantidad_recibida || 0);
                  return (
                    <tr key={item.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                      <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{item.codigo}</td>
                      <td className="py-3 px-4 font-medium">{item.descripcion}</td>
                      <td className="py-3 px-4 text-center">
                        {editingDetail ? (
                          <Input type="number" min={1} value={item.cantidad}
                            onChange={(e) => updateDetailItemField(idx, "cantidad", Math.max(1, Number(e.target.value)))}
                            className="w-20 mx-auto text-center h-8" />
                        ) : (
                          item.cantidad
                        )}
                      </td>
                      {(isParcial || detailPedido.estado === "Recibido") && (
                        <td className="py-3 px-4 text-center">
                          <span className="text-emerald-600 font-medium">{item.cantidad_recibida || 0}</span>
                        </td>
                      )}
                      {(isParcial || detailPedido.estado === "Recibido") && (
                        <td className="py-3 px-4 text-center">
                          {pendiente > 0 ? (
                            <span className="text-amber-600 font-medium">{pendiente}</span>
                          ) : (
                            <Check className="w-4 h-4 text-emerald-500 mx-auto" />
                          )}
                        </td>
                      )}
                      <td className="py-3 px-4 text-right">
                        {editingDetail ? (
                          <Input type="number" min={0} value={item.precio_unitario}
                            onChange={(e) => updateDetailItemField(idx, "precio_unitario", Math.max(0, Number(e.target.value)))}
                            className="w-28 ml-auto text-right h-8" />
                        ) : (
                          formatCurrency(item.precio_unitario)
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold">{formatCurrency(item.subtotal)}</td>
                      {editingDetail && (
                        <td className="py-3 px-2">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-500" onClick={() => removeDetailItem(idx)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex justify-end border-t pt-3 mt-1 px-4">
              <span className="text-sm text-muted-foreground mr-4">Total:</span>
              <span className="text-sm font-bold">{formatCurrency(detailTotal)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(false)}>
        <DialogContent className="max-w-sm">
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-red-500" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold">Eliminar pedido</p>
              <p className="text-sm text-muted-foreground mt-2">
                Estas seguro de eliminar el pedido <strong>{pedidoDisplayNum(detailPedido.id)}</strong>?
              </p>
              <p className="text-xs text-muted-foreground mt-1">Esta accion no se puede deshacer.</p>
            </div>
            <div className="flex gap-2 w-full">
              <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirm(false)}>
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
