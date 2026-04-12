"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { showAdminToast } from "@/components/admin-toast";
import { formatCurrency, todayARG, nowTimeARG } from "@/lib/formatters";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Pencil,
  Save,
  X,
  Loader2,
  Printer,
  Copy,
  MessageCircle,
  CreditCard,
  RotateCcw,
  Eye,
  Package,
  TrendingUp,
  Download,
  AlertCircle,
} from "lucide-react";
import { logAudit } from "@/lib/audit";
import { PagoProveedorAllocationDialog } from "@/components/pago-proveedor-allocation-dialog";

import type { CompraRow, CompraItemRow, Proveedor } from "./types";

/* ───────── helpers ───────── */

function todayString() {
  return todayARG();
}

/* ───────── props ───────── */

interface DetalleCompraProps {
  compra: CompraRow;
  providers: Proveedor[];
  currentUser: { nombre: string } | null;
  onBack: () => void;
  onRefresh: () => void;
}

/* ───────── component ───────── */

export default function DetalleCompra({
  compra: initialCompra,
  providers,
  currentUser,
  onBack,
  onRefresh,
}: DetalleCompraProps) {
  // Local copy of compra so we can update estado/total in-place
  const [detailCompra, setDetailCompra] = useState<CompraRow>(initialCompra);

  // Items
  const [detailItems, setDetailItems] = useState<CompraItemRow[]>([]);

  // Edit prices mode
  const [editingPrices, setEditingPrices] = useState(false);
  const [editedPrices, setEditedPrices] = useState<Record<string, number>>({});
  const [savingPrices, setSavingPrices] = useState(false);

  // Anular
  const [anularCompraDialog, setAnularCompraDialog] = useState(false);
  const [anulando, setAnulando] = useState(false);

  // Devolucion (partial return)
  const [devolucionDialog, setDevolucionDialog] = useState(false);
  const [devolucionItems, setDevolucionItems] = useState<
    {
      id: string;
      producto_id: string;
      codigo: string;
      descripcion: string;
      cantidad_original: number;
      cantidad_devolver: number;
      precio_unitario: number;
    }[]
  >([]);
  const [devolucionMotivo, setDevolucionMotivo] = useState("");
  const [procesandoDevolucion, setProcesandoDevolucion] = useState(false);

  // Post-purchase: modified prices dialog
  const [showPreciosDialog, setShowPreciosDialog] = useState(false);
  const [preciosModificados, setPreciosModificados] = useState<
    {
      producto_id?: string;
      nombre: string;
      codigo: string;
      precioAnterior: number;
      precioNuevo: number;
      costoAnterior: number;
      costoNuevo: number;
    }[]
  >([]);

  // Visibilidad dialog
  const [showVisibilidadDialog, setShowVisibilidadDialog] = useState(false);
  const [productosOcultos, setProductosOcultos] = useState<
    { id: string; nombre: string }[]
  >([]);

  // Payment dialog
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);

  // Confirm dialog (generic)
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ open: false, title: "", message: "", onConfirm: () => {} });
  const confirmDialogRef = useRef<() => void>(() => {});

  // Saving (for confirm ingreso)
  const [saving, setSaving] = useState(false);

  /* ── sync prop changes ── */
  useEffect(() => {
    setDetailCompra(initialCompra);
  }, [initialCompra]);

  /* ── load items on mount ── */
  useEffect(() => {
    supabase
      .from("compra_items")
      .select(
        "id, compra_id, producto_id, codigo, descripcion, cantidad, precio_unitario, subtotal"
      )
      .eq("compra_id", detailCompra.id)
      .order("created_at")
      .then(({ data }) => setDetailItems((data as CompraItemRow[]) || []));
  }, [detailCompra.id]);

  /* ── computed ── */
  const devolucionTotal = devolucionItems.reduce(
    (sum, i) => sum + i.cantidad_devolver * i.precio_unitario,
    0
  );

  /* ───────── handlers ───────── */

  const handleAnularCompra = async () => {
    setAnulando(true);
    try {
      const isPendiente = detailCompra.estado === "Pendiente";

      if (isPendiente) {
        // Pendiente: just delete (never had stock/caja impact)
        await supabase
          .from("compra_items")
          .delete()
          .eq("compra_id", detailCompra.id);
        await supabase.from("compras").delete().eq("id", detailCompra.id);
      } else {
        // Confirmed: revert stock, caja, CC proveedor — mark as Anulada (keep audit trail)
        for (const item of detailItems) {
          if (!item.producto_id) continue;
          const { data: prod } = await supabase
            .from("productos")
            .select("stock")
            .eq("id", item.producto_id)
            .maybeSingle();
          if (!prod) continue;
          const unitsToRevert = item.cantidad;
          const newStock = prod.stock - unitsToRevert;
          await supabase
            .from("productos")
            .update({ stock: newStock })
            .eq("id", item.producto_id);
          await supabase.from("stock_movimientos").insert({
            producto_id: item.producto_id,
            tipo: "anulacion",
            cantidad_antes: prod.stock,
            cantidad_despues: newStock,
            cantidad: unitsToRevert,
            referencia: `Anulación Compra #${detailCompra.numero}`,
            descripcion: `Anulación compra - ${item.descripcion}`,
            usuario: currentUser?.nombre || "Admin",
            orden_id: detailCompra.id,
          });
        }
        // Revert caja movements
        const { data: cajaRows } = await supabase
          .from("caja_movimientos")
          .select("*")
          .eq("referencia_id", detailCompra.id)
          .eq("referencia_tipo", "compra");
        for (const cm of cajaRows || []) {
          await supabase.from("caja_movimientos").insert({
            fecha: todayString(),
            hora: nowTimeARG(),
            tipo: "ingreso",
            descripcion: `Anulación Compra #${detailCompra.numero}`,
            metodo_pago: (cm as any).metodo_pago || "Efectivo",
            monto: Math.abs((cm as any).monto),
            referencia_id: detailCompra.id,
            referencia_tipo: "anulacion",
          });
        }
        // Revert CC proveedor
        if (
          detailCompra.proveedor_id &&
          (detailCompra as any).forma_pago === "Cuenta Corriente"
        ) {
          const { data: finalSaldo } = await supabase.rpc(
            "atomic_update_proveedor_saldo",
            {
              p_proveedor_id: detailCompra.proveedor_id,
              p_change: -detailCompra.total,
            }
          );

          await supabase.from("cuenta_corriente_proveedor").insert({
            proveedor_id: detailCompra.proveedor_id,
            fecha: todayString(),
            tipo: "anulacion",
            descripcion: `Anulación Compra #${detailCompra.numero}`,
            monto: detailCompra.total,
            saldo_resultante: finalSaldo,
            referencia_id: detailCompra.id,
            referencia_tipo: "anulacion",
          });
        }
        // Mark as Anulada instead of deleting (audit trail)
        await supabase
          .from("compras")
          .update({ estado: "Anulada" })
          .eq("id", detailCompra.id);
      }
      onBack();
      onRefresh();
      showAdminToast(
        isPendiente
          ? "Compra eliminada."
          : "Compra anulada. Stock y caja revertidos.",
        "success"
      );
    } catch (err: any) {
      showAdminToast(
        "Error al anular: " + (err.message || "Error"),
        "error"
      );
    }
    setAnulando(false);
    setAnularCompraDialog(false);
  };

  const openDevolucionDialog = () => {
    if (!detailItems.length) return;
    setDevolucionItems(
      detailItems.map((item) => ({
        id: item.id,
        producto_id: item.producto_id,
        codigo: item.codigo,
        descripcion: item.descripcion,
        cantidad_original: item.cantidad,
        cantidad_devolver: 0,
        precio_unitario: item.precio_unitario,
      }))
    );
    setDevolucionMotivo("");
    setDevolucionDialog(true);
  };

  const handleDevolucion = async () => {
    const itemsToReturn = devolucionItems.filter(
      (i) => i.cantidad_devolver > 0
    );
    if (itemsToReturn.length === 0) {
      showAdminToast("Selecciona al menos un item para devolver", "error");
      return;
    }
    setProcesandoDevolucion(true);
    try {
      const returnTotal = itemsToReturn.reduce(
        (sum, i) => sum + i.cantidad_devolver * i.precio_unitario,
        0
      );

      // 1. Subtract returned quantities from product stock (fresh read first)
      for (const item of itemsToReturn) {
        if (!item.producto_id) continue;
        const { data: prod } = await supabase
          .from("productos")
          .select("stock")
          .eq("id", item.producto_id)
          .maybeSingle();
        if (!prod) continue;
        const stockAntes = prod.stock;
        const newStock = stockAntes - item.cantidad_devolver;
        await supabase
          .from("productos")
          .update({ stock: newStock })
          .eq("id", item.producto_id);

        await supabase.from("stock_movimientos").insert({
          producto_id: item.producto_id,
          tipo: "devolucion_proveedor",
          cantidad_antes: stockAntes,
          cantidad_despues: newStock,
          cantidad: item.cantidad_devolver,
          referencia: `Devolución Compra #${detailCompra.numero}`,
          descripcion: `Devolución a proveedor - ${item.descripcion}${devolucionMotivo ? ` (${devolucionMotivo})` : ""}`,
          usuario: currentUser?.nombre || "Admin",
          orden_id: detailCompra.id,
        });
      }

      // 2. Handle financial impact
      const wasPaid = detailCompra.estado_pago === "Pagada";
      const wasCC = detailCompra.forma_pago === "Cuenta Corriente";

      if (wasPaid && !wasCC) {
        await supabase.from("caja_movimientos").insert({
          fecha: todayARG(),
          hora: nowTimeARG(),
          tipo: "ingreso",
          descripcion: `Devolución Compra #${detailCompra.numero} - ${detailCompra.proveedores?.nombre || "Proveedor"}`,
          metodo_pago: detailCompra.forma_pago || "Efectivo",
          monto: returnTotal,
          referencia_id: detailCompra.id,
          referencia_tipo: "devolucion_compra",
        });
      }

      if (wasCC && detailCompra.proveedor_id) {
        const { data: finalSaldo } = await supabase.rpc(
          "atomic_update_proveedor_saldo",
          {
            p_proveedor_id: detailCompra.proveedor_id,
            p_change: -returnTotal,
          }
        );

        await supabase.from("cuenta_corriente_proveedor").insert({
          proveedor_id: detailCompra.proveedor_id,
          fecha: todayARG(),
          tipo: "devolucion",
          descripcion: `Devolución Compra #${detailCompra.numero}${devolucionMotivo ? ` - ${devolucionMotivo}` : ""}`,
          monto: returnTotal,
          saldo_resultante: finalSaldo,
          referencia_id: detailCompra.id,
          referencia_tipo: "devolucion_compra",
        });
      }

      // 3. Update compra total and append devolucion note to observacion
      const newTotal = Math.max(0, detailCompra.total - returnTotal);
      await supabase
        .from("compras")
        .update({
          total: newTotal,
          observacion: [
            detailCompra.observacion,
            `[Devolución ${todayARG()}] ${itemsToReturn.map((i) => `${i.descripcion} x${i.cantidad_devolver}`).join(", ")} = ${formatCurrency(returnTotal)}${devolucionMotivo ? ` — Motivo: ${devolucionMotivo}` : ""}`,
          ]
            .filter(Boolean)
            .join("\n"),
        })
        .eq("id", detailCompra.id);

      // 4. Update compra_items quantities
      for (const item of itemsToReturn) {
        const newQty = item.cantidad_original - item.cantidad_devolver;
        if (newQty <= 0) {
          await supabase.from("compra_items").delete().eq("id", item.id);
        } else {
          await supabase
            .from("compra_items")
            .update({
              cantidad: newQty,
              subtotal: newQty * item.precio_unitario,
            })
            .eq("id", item.id);
        }
      }

      logAudit({
        userName: currentUser?.nombre || "Admin Sistema",
        action: "UPDATE",
        module: "compras",
        entityId: detailCompra.id,
        after: {
          tipo: "devolucion_parcial",
          items: itemsToReturn.length,
          total_devuelto: returnTotal,
          motivo: devolucionMotivo,
        },
      });

      setDevolucionDialog(false);
      onBack();
      onRefresh();
      showAdminToast(
        `Devolución registrada por ${formatCurrency(returnTotal)}. Stock actualizado.`,
        "success"
      );
    } catch (err: any) {
      showAdminToast(
        "Error al procesar devolución: " + (err.message || "Error"),
        "error"
      );
    }
    setProcesandoDevolucion(false);
  };

  /* ── save edited prices (confirmed compra) ── */

  const handleSaveEditedPrices = async () => {
    if (Object.keys(editedPrices).length === 0) return;
    // Prevent editing prices on cancelled purchases
    if (detailCompra.estado === "Anulada") {
      showAdminToast(
        "No se pueden editar precios de una compra anulada",
        "error"
      );
      return;
    }
    setSavingPrices(true);
    try {
      // Update each changed item
      for (const item of detailItems) {
        const newPrice = editedPrices[item.id];
        if (newPrice === undefined || newPrice === item.precio_unitario)
          continue;

        const newSubtotal =
          Math.round(newPrice * item.cantidad * 100) / 100;
        await supabase
          .from("compra_items")
          .update({ precio_unitario: newPrice, subtotal: newSubtotal })
          .eq("id", item.id);

        // Update product costo if changed
        if (item.producto_id) {
          await supabase
            .from("productos")
            .update({ costo: newPrice, fecha_actualizacion: todayString() })
            .eq("id", item.producto_id);
        }
      }

      // Recalculate compra total
      const { data: updatedItems } = await supabase
        .from("compra_items")
        .select("subtotal")
        .eq("compra_id", detailCompra.id);
      const newSubtotal = (updatedItems || []).reduce(
        (a: number, i: any) => a + (i.subtotal || 0),
        0
      );
      const disc = detailCompra.descuento_porcentaje || 0;
      const newTotal =
        disc > 0
          ? Math.round(newSubtotal * (1 - disc / 100) * 100) / 100
          : newSubtotal;

      await supabase
        .from("compras")
        .update({ subtotal: newSubtotal, total: newTotal })
        .eq("id", detailCompra.id);

      // Refresh detail
      setDetailCompra({ ...detailCompra, subtotal: newSubtotal, total: newTotal });
      const { data: refreshedItems } = await supabase
        .from("compra_items")
        .select(
          "id, compra_id, producto_id, codigo, descripcion, cantidad, precio_unitario, subtotal"
        )
        .eq("compra_id", detailCompra.id)
        .order("created_at");
      setDetailItems((refreshedItems as CompraItemRow[]) || []);
      setEditingPrices(false);
      setEditedPrices({});
      onRefresh();
      showAdminToast("Precios actualizados correctamente", "success");
    } catch (err: any) {
      showAdminToast(
        "Error al actualizar precios: " + (err.message || "Error"),
        "error"
      );
    }
    setSavingPrices(false);
  };

  /* ───────── render ───────── */

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
              Compra {detailCompra.numero}
            </h1>
            <Badge
              variant={
                detailCompra.estado === "Confirmada" ? "default" : "secondary"
              }
              className="text-xs"
            >
              {detailCompra.estado}
            </Badge>
            {detailCompra.estado_pago && (
              <Badge
                variant="outline"
                className={`text-xs ${
                  detailCompra.estado_pago === "Pagada"
                    ? "border-green-300 bg-green-50 text-green-700"
                    : detailCompra.estado_pago === "Pago Parcial"
                      ? "border-orange-300 bg-orange-50 text-orange-700"
                      : "border-yellow-300 bg-yellow-50 text-yellow-700"
                }`}
              >
                {detailCompra.estado_pago}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground text-sm">
            {detailCompra.proveedores?.nombre || "Sin proveedor"} &middot;{" "}
            {new Date(
              detailCompra.fecha + "T12:00:00"
            ).toLocaleDateString("es-AR", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            })}
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* Carteles de precio */}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              const productIds = detailItems
                .map((i) => i.producto_id)
                .filter(Boolean);
              if (productIds.length === 0) return;
              window.open(
                `/admin/productos/lista-precios?ids=${productIds.join(",")}`,
                "_blank"
              );
            }}
          >
            <Printer className="w-3.5 h-3.5" />
            Carteles de precio
          </Button>

          {/* Pendiente-only buttons */}
          {detailCompra.estado === "Pendiente" && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                const provNombre =
                  detailCompra.proveedores?.nombre || "Proveedor";
                const lines = detailItems.map(
                  (i: any) => `• ${i.descripcion} x${i.cantidad}`
                );
                const text = `Hola ${provNombre}, te paso el pedido:\n\n${lines.join("\n")}\n\nGracias!`;
                navigator.clipboard.writeText(text);
                showAdminToast("Pedido copiado al portapapeles", "success");
              }}
            >
              <Copy className="w-3.5 h-3.5" />
              Copiar pedido
            </Button>
          )}
          {detailCompra.estado === "Pendiente" && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-green-600 border-green-200 hover:bg-green-50"
              onClick={() => {
                const provNombre =
                  detailCompra.proveedores?.nombre || "Proveedor";
                const lines = detailItems.map(
                  (i: any) => `• ${i.descripcion} x${i.cantidad}`
                );
                const text = `Hola ${provNombre}, te paso el pedido:\n\n${lines.join("\n")}\n\nGracias!`;
                const encoded = encodeURIComponent(text);
                window.open(`https://wa.me/?text=${encoded}`, "_blank");
              }}
            >
              <MessageCircle className="w-3.5 h-3.5" />
              WhatsApp
            </Button>
          )}
          {detailCompra.estado === "Pendiente" && (
            <Button
              size="sm"
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => {
                const doConfirm = async () => {
                  setSaving(true);
                  try {
                    // Execute stock, caja, price updates for pending purchase
                    for (const item of detailItems) {
                      const { data: prodData } = await supabase
                        .from("productos")
                        .select("stock")
                        .eq("id", item.producto_id)
                        .maybeSingle();
                      const stockAntes = prodData?.stock ?? 0;
                      const newStock = stockAntes + item.cantidad;
                      await supabase
                        .from("productos")
                        .update({ stock: newStock })
                        .eq("id", item.producto_id);
                      await supabase.from("stock_movimientos").insert({
                        producto_id: item.producto_id,
                        tipo: "compra",
                        cantidad_antes: stockAntes,
                        cantidad_despues: newStock,
                        cantidad: item.cantidad,
                        referencia: `Compra #${detailCompra.numero}`,
                        descripcion: `Compra - ${item.descripcion}`,
                        usuario: currentUser?.nombre || "Admin Sistema",
                        orden_id: detailCompra.id,
                      });
                    }
                    // Register caja
                    if (
                      detailCompra.total > 0 &&
                      detailCompra.forma_pago !== "Cuenta Corriente"
                    ) {
                      await supabase.from("caja_movimientos").insert({
                        fecha: detailCompra.fecha,
                        hora: new Date().toLocaleTimeString("es-AR", {
                          timeZone: "America/Argentina/Buenos_Aires",
                          hour: "2-digit",
                          minute: "2-digit",
                        }),
                        tipo: "egreso",
                        descripcion: `Compra ${detailCompra.numero} - ${detailCompra.proveedores?.nombre || "Proveedor"}`,
                        metodo_pago: detailCompra.forma_pago,
                        monto: -detailCompra.total,
                      });
                    }
                    // Update estado
                    await supabase
                      .from("compras")
                      .update({ estado: "Confirmada" })
                      .eq("id", detailCompra.id);
                    setDetailCompra({
                      ...detailCompra,
                      estado: "Confirmada",
                    } as any);
                    // Mark linked pedido as "Ingresado" if this compra was generated from one
                    if (detailCompra.observacion) {
                      const pedMatch =
                        detailCompra.observacion.match(
                          /pedido\s+(PED-[a-f0-9]+)/i
                        );
                      if (pedMatch) {
                        const pedShortId = pedMatch[1].replace("PED-", "");
                        const { data: pedidos } = await supabase
                          .from("pedidos_proveedor")
                          .select("id")
                          .ilike("id", `${pedShortId}%`)
                          .limit(1);
                        if (pedidos && pedidos.length > 0) {
                          await supabase
                            .from("pedidos_proveedor")
                            .update({ estado: "Ingresado" })
                            .eq("id", pedidos[0].id);
                        }
                      }
                    }
                    showAdminToast("Compra ingresada al stock", "success");
                    // Check hidden products
                    const itemIds = detailItems
                      .map((i: any) => i.producto_id)
                      .filter(Boolean);
                    const { data: ocultos } = await supabase
                      .from("productos")
                      .select("id, nombre")
                      .in("id", itemIds)
                      .eq("visibilidad", "oculto");
                    if (ocultos && ocultos.length > 0) {
                      setProductosOcultos(ocultos);
                      setShowVisibilidadDialog(true);
                    }
                  } catch (err) {
                    showAdminToast("Error al confirmar ingreso", "error");
                  }
                  setSaving(false);
                };
                confirmDialogRef.current = doConfirm;
                setConfirmDialog({
                  open: true,
                  title: "Confirmar ingreso",
                  message:
                    "¿Confirmar ingreso al stock? Se actualizará stock, caja y precios.",
                  onConfirm: doConfirm,
                });
              }}
            >
              <Package className="w-3.5 h-3.5" />
              Confirmar ingreso al stock
            </Button>
          )}

          {/* Confirmada-only buttons */}
          {detailCompra.estado === "Confirmada" && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-amber-600 border-amber-200 hover:bg-amber-50"
              onClick={openDevolucionDialog}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Devolución
            </Button>
          )}
          {detailCompra.estado === "Confirmada" && !editingPrices && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                const priceMap: Record<string, number> = {};
                detailItems.forEach((i) => {
                  priceMap[i.id] = i.precio_unitario;
                });
                setEditedPrices(priceMap);
                setEditingPrices(true);
              }}
            >
              <Pencil className="w-3.5 h-3.5" />
              Editar precios
            </Button>
          )}
          {editingPrices && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingPrices(false);
                  setEditedPrices({});
                }}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={handleSaveEditedPrices}
                disabled={savingPrices}
              >
                {savingPrices ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                Guardar precios
              </Button>
            </>
          )}
          {detailCompra.estado === "Confirmada" &&
            detailCompra.estado_pago !== "Pagada" &&
            !editingPrices && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                onClick={() => {
                  setShowPaymentDialog(true);
                }}
              >
                <CreditCard className="w-3.5 h-3.5" />
                Registrar Pago
              </Button>
            )}

          {/* Anular (both estados) */}
          {detailCompra.estado !== "Anulada" && !editingPrices && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => setAnularCompraDialog(true)}
            >
              <X className="w-3.5 h-3.5" />
              Anular compra
            </Button>
          )}

          {/* Total display */}
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-bold">
              {formatCurrency(detailCompra.total)}
            </p>
          </div>
        </div>
      </div>

      {/* Info grid */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-xs text-muted-foreground block">
                Proveedor
              </span>
              <span className="font-medium">
                {detailCompra.proveedores?.nombre || "---"}
              </span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">
                Fecha
              </span>
              <span className="font-medium">
                {new Date(
                  detailCompra.fecha + "T12:00:00"
                ).toLocaleDateString("es-AR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })}
              </span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">
                Forma de pago
              </span>
              <span className="font-medium">
                {detailCompra.forma_pago || "---"}
              </span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">
                Estado pago
              </span>
              <Badge
                variant="outline"
                className={`text-xs mt-0.5 ${
                  detailCompra.estado_pago === "Pagada"
                    ? "border-green-300 bg-green-50 text-green-700"
                    : detailCompra.estado_pago === "Pago Parcial"
                      ? "border-orange-300 bg-orange-50 text-orange-700"
                      : "border-yellow-300 bg-yellow-50 text-yellow-700"
                }`}
              >
                {detailCompra.estado_pago || "---"}
              </Badge>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">
                Tipo comprobante
              </span>
              {detailCompra.tipo_comprobante ? (
                <Badge variant="outline" className="text-xs mt-0.5">
                  {detailCompra.tipo_comprobante}
                </Badge>
              ) : (
                <span className="font-medium">---</span>
              )}
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">
                N comprobante
              </span>
              <span className="font-medium">
                {detailCompra.numero_comprobante || "---"}
              </span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">
                Total
              </span>
              <span className="font-bold">
                {formatCurrency(detailCompra.total)}
              </span>
              {detailCompra.descuento_porcentaje != null &&
                detailCompra.descuento_porcentaje > 0 && (
                  <span className="text-xs text-red-500 block">
                    -{detailCompra.descuento_porcentaje}% s/{" "}
                    {formatCurrency(detailCompra.subtotal || 0)}
                  </span>
                )}
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">
                Pagado
              </span>
              <span className="font-bold text-green-600">
                {formatCurrency(detailCompra.monto_pagado || 0)}
              </span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">
                Saldo pendiente
              </span>
              <span
                className={`font-bold ${
                  detailCompra.total - (detailCompra.monto_pagado || 0) > 0
                    ? "text-red-600"
                    : "text-green-600"
                }`}
              >
                {formatCurrency(
                  Math.max(
                    0,
                    detailCompra.total - (detailCompra.monto_pagado || 0)
                  )
                )}
              </span>
            </div>
          </div>
          {detailCompra.observacion && (
            <p className="text-sm text-muted-foreground mt-3 border-t pt-3">
              {detailCompra.observacion}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Items table */}
      <Card>
        <CardContent className="pt-0">
          {/* Mobile card list */}
          <div className="sm:hidden divide-y">
            {detailItems.map((item) => {
              const editedPrice = editedPrices[item.id];
              const currentPrice =
                editedPrice !== undefined ? editedPrice : item.precio_unitario;
              const currentSubtotal = editingPrices
                ? Math.round(currentPrice * item.cantidad * 100) / 100
                : item.subtotal;
              return (
                <div
                  key={item.id}
                  className={`py-3 px-4 space-y-1.5 ${editingPrices && editedPrice !== undefined && editedPrice !== item.precio_unitario ? "bg-amber-50/50" : ""}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {item.descripcion}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {item.codigo}
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      Cant:{" "}
                      <span className="font-medium text-foreground">
                        {item.cantidad}
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      Costo:{" "}
                      {editingPrices ? (
                        <MoneyInput
                          min={0}
                          value={currentPrice}
                          onValueChange={(val) =>
                            setEditedPrices((prev) => ({
                              ...prev,
                              [item.id]: val,
                            }))
                          }
                          className="w-24 inline-block text-right h-7 text-xs"
                        />
                      ) : (
                        <span className="font-medium text-foreground">
                          {formatCurrency(item.precio_unitario)}
                        </span>
                      )}
                    </span>
                    <span className="font-semibold">
                      {formatCurrency(currentSubtotal)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-3 px-4 font-medium">Codigo</th>
                  <th className="text-left py-3 px-4 font-medium">
                    Descripcion
                  </th>
                  <th className="text-center py-3 px-4 font-medium">
                    Cantidad
                  </th>
                  <th className="text-right py-3 px-4 font-medium">
                    Costo Unit.
                  </th>
                  <th className="text-right py-3 px-4 font-medium">
                    Subtotal
                  </th>
                </tr>
              </thead>
              <tbody>
                {detailItems.map((item) => {
                  const editedPrice = editedPrices[item.id];
                  const currentPrice =
                    editedPrice !== undefined
                      ? editedPrice
                      : item.precio_unitario;
                  const currentSubtotal = editingPrices
                    ? Math.round(currentPrice * item.cantidad * 100) / 100
                    : item.subtotal;
                  return (
                    <tr
                      key={item.id}
                      className={`border-b last:border-0 hover:bg-muted/50 transition-colors ${editingPrices && editedPrice !== undefined && editedPrice !== item.precio_unitario ? "bg-amber-50/50" : ""}`}
                    >
                      <td className="py-3 px-4 font-mono text-xs text-muted-foreground">
                        {item.codigo}
                      </td>
                      <td className="py-3 px-4 font-medium">
                        {item.descripcion}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {item.cantidad}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {editingPrices ? (
                          <MoneyInput
                            min={0}
                            value={currentPrice}
                            onValueChange={(val) =>
                              setEditedPrices((prev) => ({
                                ...prev,
                                [item.id]: val,
                              }))
                            }
                            className="w-24 ml-auto text-right h-8"
                          />
                        ) : (
                          formatCurrency(item.precio_unitario)
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold">
                        {formatCurrency(currentSubtotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t pt-3 mt-1 px-4 space-y-1">
            {detailCompra.descuento_porcentaje != null &&
              detailCompra.descuento_porcentaje > 0 && (
                <>
                  <div className="flex justify-end">
                    <span className="text-sm text-muted-foreground mr-4">
                      Subtotal:
                    </span>
                    <span className="text-sm tabular-nums">
                      {formatCurrency(detailCompra.subtotal || 0)}
                    </span>
                  </div>
                  <div className="flex justify-end text-red-500">
                    <span className="text-sm mr-4">
                      Descuento ({detailCompra.descuento_porcentaje}%):
                    </span>
                    <span className="text-sm tabular-nums">
                      -
                      {formatCurrency(
                        (detailCompra.subtotal || 0) - detailCompra.total
                      )}
                    </span>
                  </div>
                </>
              )}
            <div className="flex justify-end">
              <span className="text-sm text-muted-foreground mr-4">
                Total:
              </span>
              <span className="text-sm font-bold">
                {formatCurrency(detailCompra.total)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Dialogs ── */}

      {/* Anular compra confirmation modal */}
      <Dialog open={anularCompraDialog} onOpenChange={setAnularCompraDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              Anular compra
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-red-50 border border-red-200 p-4 space-y-2">
              <p className="text-sm text-red-900">
                ¿Anular compra{" "}
                <span className="font-bold">#{detailCompra.numero}</span> por{" "}
                <span className="font-bold">
                  {formatCurrency(detailCompra.total)}
                </span>
                ?
              </p>
              <p className="text-xs text-red-700">
                {detailCompra.estado === "Pendiente"
                  ? "La compra no fue ingresada al stock. Solo se anulará el registro."
                  : "Se revertirá todo el stock y los movimientos de caja asociados."}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setAnularCompraDialog(false)}
                disabled={anulando}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={handleAnularCompra}
                disabled={anulando}
                className="gap-1.5"
              >
                {anulando ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <X className="w-4 h-4" />
                )}
                {anulando ? "Anulando..." : "Confirmar anulación"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment dialog */}
      <PagoProveedorAllocationDialog
        open={showPaymentDialog}
        onOpenChange={setShowPaymentDialog}
        proveedor={
          providers.find((p) => p.id === detailCompra.proveedor_id) || null
        }
        onSuccess={() => {
          onRefresh();
          setShowPaymentDialog(false);
        }}
      />

      {/* Devolucion (partial return) dialog */}
      <Dialog open={devolucionDialog} onOpenChange={setDevolucionDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <RotateCcw className="w-5 h-5" />
              Devolución parcial — Compra #{detailCompra.numero}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Indicá la cantidad a devolver de cada producto. Solo se
              procesarán los items con cantidad mayor a 0.
            </p>
            <div className="rounded-lg border divide-y max-h-72 overflow-y-auto">
              {devolucionItems.map((item, idx) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 px-3 py-2.5"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {item.descripcion}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      {item.codigo} &middot; Cant. original:{" "}
                      {item.cantidad_original} &middot;{" "}
                      {formatCurrency(item.precio_unitario)}/u
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">
                      Devolver
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      max={item.cantidad_original}
                      value={item.cantidad_devolver}
                      onChange={(e) => {
                        const val = Math.max(
                          0,
                          Math.min(
                            item.cantidad_original,
                            Number(e.target.value) || 0
                          )
                        );
                        setDevolucionItems((prev) =>
                          prev.map((it, i) =>
                            i === idx
                              ? { ...it, cantidad_devolver: val }
                              : it
                          )
                        );
                      }}
                      className="w-20 text-center"
                    />
                  </div>
                  {item.cantidad_devolver > 0 && (
                    <span className="text-sm font-semibold text-amber-600 tabular-nums w-24 text-right flex-shrink-0">
                      {formatCurrency(
                        item.cantidad_devolver * item.precio_unitario
                      )}
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div>
              <Label className="text-sm">Motivo de la devolución</Label>
              <Textarea
                value={devolucionMotivo}
                onChange={(e) => setDevolucionMotivo(e.target.value)}
                placeholder="Ej: Producto en mal estado, error en pedido..."
                rows={2}
                className="mt-1"
              />
            </div>

            {devolucionTotal > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-amber-900">Total a devolver:</span>
                  <span className="font-bold text-amber-900 text-lg">
                    {formatCurrency(devolucionTotal)}
                  </span>
                </div>
                <p className="text-xs text-amber-700">
                  Se descontará del stock y{" "}
                  {detailCompra.forma_pago === "Cuenta Corriente"
                    ? "se reducirá el saldo del proveedor en cuenta corriente"
                    : detailCompra.estado_pago === "Pagada"
                      ? "se registrará un ingreso en caja"
                      : "se actualizará el total de la compra"}
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button
                variant="outline"
                onClick={() => setDevolucionDialog(false)}
                disabled={procesandoDevolucion}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleDevolucion}
                disabled={procesandoDevolucion || devolucionTotal === 0}
                className="gap-1.5 bg-amber-600 hover:bg-amber-700"
              >
                {procesandoDevolucion ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RotateCcw className="w-4 h-4" />
                )}
                {procesandoDevolucion
                  ? "Procesando..."
                  : `Confirmar devolución — ${formatCurrency(devolucionTotal)}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Prices dialog */}
      <Dialog open={showPreciosDialog} onOpenChange={setShowPreciosDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Precios ({preciosModificados.length} productos)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border divide-y max-h-60 overflow-y-auto">
              {preciosModificados.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-3 py-2.5 text-sm"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{p.nombre}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      {p.codigo}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-primary">
                      {formatCurrency(p.precioNuevo)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t">
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={() => {
                  const productIds =
                    detailItems
                      ?.map((i: any) => i.producto_id)
                      .filter(Boolean) || [];
                  if (productIds.length > 0) {
                    window.open(
                      `/admin/productos/lista-precios?ids=${productIds.join(",")}`,
                      "_blank"
                    );
                  } else {
                    showAdminToast("No se encontraron productos", "error");
                  }
                }}
              >
                <Printer className="w-4 h-4" />
                Imprimir carteles
              </Button>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setShowPreciosDialog(false)}>
                Cerrar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: productos ocultos que ahora tienen stock */}
      <Dialog
        open={showVisibilidadDialog}
        onOpenChange={setShowVisibilidadDialog}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">
              Mostrar productos en la tienda
            </DialogTitle>
          </DialogHeader>
          {(() => {
            const [selected, setSelected] = [
              productosOcultos.filter(
                (p) => (p as any)._selected !== false
              ),
              (id: string, val: boolean) =>
                setProductosOcultos((prev) =>
                  prev.map((p) =>
                    p.id === id ? ({ ...p, _selected: val } as any) : p
                  )
                ),
            ];
            const allSelected = productosOcultos.every(
              (p) => (p as any)._selected !== false
            );
            const noneSelected = productosOcultos.every(
              (p) => (p as any)._selected === false
            );
            const selectedIds = productosOcultos
              .filter((p) => (p as any)._selected !== false)
              .map((p) => p.id);
            const productos = productosOcultos.filter(
              (p) => !(p as any).es_combo
            );
            const combos = productosOcultos.filter(
              (p) => (p as any).es_combo
            );

            return (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Estos productos están ocultos pero ahora tienen stock.
                  Seleccioná cuáles querés mostrar en la tienda.
                </p>

                {/* Select all / none */}
                <div className="flex items-center gap-3 text-xs">
                  <button
                    className="text-primary hover:underline font-medium"
                    onClick={() =>
                      setProductosOcultos((prev) =>
                        prev.map(
                          (p) => ({ ...p, _selected: true } as any)
                        )
                      )
                    }
                  >
                    Seleccionar todos
                  </button>
                  <span className="text-muted-foreground">&middot;</span>
                  <button
                    className="text-muted-foreground hover:underline"
                    onClick={() =>
                      setProductosOcultos((prev) =>
                        prev.map(
                          (p) => ({ ...p, _selected: false } as any)
                        )
                      )
                    }
                  >
                    Ninguno
                  </button>
                  <span className="ml-auto text-muted-foreground">
                    {selectedIds.length} de {productosOcultos.length}
                  </span>
                </div>

                <div className="max-h-60 overflow-y-auto space-y-3">
                  {/* Productos */}
                  {productos.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Productos ({productos.length})
                      </p>
                      {productos.map((p) => {
                        const checked =
                          (p as any)._selected !== false;
                        return (
                          <label
                            key={p.id}
                            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition ${checked ? "bg-emerald-50 border-emerald-300" : "bg-gray-50 border-gray-200 opacity-60"}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) =>
                                setSelected(p.id, e.target.checked)
                              }
                              className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                            />
                            <span className="text-sm font-medium">
                              {p.nombre}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {/* Combos */}
                  {combos.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Combos ({combos.length})
                      </p>
                      {combos.map((p) => {
                        const checked =
                          (p as any)._selected !== false;
                        return (
                          <label
                            key={p.id}
                            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition ${checked ? "bg-violet-50 border-violet-300" : "bg-gray-50 border-gray-200 opacity-60"}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) =>
                                setSelected(p.id, e.target.checked)
                              }
                              className="rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                            />
                            <span className="text-sm font-medium">
                              {p.nombre}
                            </span>
                            <span className="ml-auto text-[10px] font-medium text-violet-500 bg-violet-100 px-1.5 py-0.5 rounded">
                              COMBO
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowVisibilidadDialog(false);
                      setProductosOcultos([]);
                    }}
                  >
                    Dejar ocultos
                  </Button>
                  <Button
                    disabled={noneSelected}
                    className="bg-emerald-600 hover:bg-emerald-700"
                    onClick={async () => {
                      if (selectedIds.length === 0) return;
                      await supabase
                        .from("productos")
                        .update({ visibilidad: "visible" })
                        .in("id", selectedIds);
                      setShowVisibilidadDialog(false);
                      setProductosOcultos([]);
                      showAdminToast(
                        `${selectedIds.length} producto${selectedIds.length > 1 ? "s" : ""} visible${selectedIds.length > 1 ? "s" : ""} en la tienda`,
                        "success"
                      );
                    }}
                  >
                    <Eye className="w-4 h-4 mr-1.5" />
                    Mostrar{" "}
                    {selectedIds.length > 0 ? `(${selectedIds.length})` : ""}
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Confirm Dialog */}
      <Dialog
        open={confirmDialog.open}
        onOpenChange={(o) =>
          setConfirmDialog((prev) => ({ ...prev, open: o }))
        }
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{confirmDialog.title}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirmDialog.message}
          </p>
          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() =>
                setConfirmDialog((prev) => ({ ...prev, open: false }))
              }
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                confirmDialogRef.current();
                setConfirmDialog((prev) => ({ ...prev, open: false }));
              }}
            >
              Confirmar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
