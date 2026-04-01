"use client";

import { nowTimeARG, formatCurrency } from "@/lib/formatters";
import { useEffect, useState, useCallback, lazy, Suspense } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { showAdminToast } from "@/components/admin-toast";
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
import {
  Search,
  Loader2,
  Eye,
  Truck,
  Store,
  ShoppingCart,
  Package,
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Plus,
  X,
  Trash2,
  Save,
  CheckCircle,
  AlertTriangle,
  Globe,
  Printer,
  CreditCard,
  Banknote,
  ArrowRight,
  PackageCheck,
  FileText,
  Landmark,
} from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { VentaDetailDialog, type NCDetail } from "@/components/venta-detail-dialog";
import { defaultReceiptConfig } from "@/components/receipt-print-view";
import type { ReceiptConfig, ReceiptSale, ReceiptLineItem } from "@/components/receipt-print-view";

const PrintPreviewDialog = lazy(() => import("@/components/print-preview-dialog").then(m => ({ default: m.PrintPreviewDialog })));

interface PedidoItem {
  id?: number;
  pedido_id?: number;
  producto_id: string;
  nombre: string;
  presentacion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  unidades_por_presentacion: number;
}

interface Pedido {
  id: number;
  numero: string;
  created_at: string;
  estado: string;
  nombre_cliente: string;
  email: string;
  telefono: string;
  metodo_entrega: string;
  direccion_texto: string | null;
  fecha_entrega: string | null;
  metodo_pago: string;
  subtotal: number;
  costo_envio: number;
  total: number;
  observacion: string | null;
  cliente_auth_id: string | null;
  // Payment fields from checkout
  monto_efectivo: number;
  monto_transferencia: number;
  recargo_transferencia: number;
  cuenta_bancaria_alias?: string | null;
  items: PedidoItem[];
  // Enriched fields
  ventaId?: string;
  clienteId?: string;
  _preloadedPayments?: PaymentEntry[];
}

interface PaymentEntry {
  metodo: string;
  monto: number;
  cuenta_bancaria?: string | null;
}

const estadoBadge: Record<string, { bg: string; text: string; label: string; icon: typeof Package }> = {
  pendiente: { bg: "bg-amber-50 border-amber-200", text: "text-amber-700", label: "Pendiente", icon: ShoppingCart },
  armado: { bg: "bg-violet-50 border-violet-200", text: "text-violet-700", label: "Armado", icon: PackageCheck },
  confirmado: { bg: "bg-blue-50 border-blue-200", text: "text-blue-700", label: "Confirmado", icon: CheckCircle },
  entregado: { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", label: "Entregado", icon: Truck },
  cancelado: { bg: "bg-red-50 border-red-200", text: "text-red-700", label: "Cancelado", icon: X },
};

// Status flow: the allowed next states from each state
const estadoFlow: Record<string, string[]> = {
  pendiente: ["armado", "cancelado"],
  armado: ["confirmado", "entregado", "cancelado"],
  confirmado: ["entregado", "cancelado"],
  entregado: [],
  cancelado: ["pendiente"],
};

export default function PedidosOnlinePage() {
  const currentUser = useCurrentUser();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterEstado, setFilterEstado] = useState("activos");
  const [filterEntrega, setFilterEntrega] = useState("todos");
  const [search, setSearch] = useState("");

  // Detail/Edit dialog
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedPedido, setSelectedPedido] = useState<Pedido | null>(null);
  const [editItems, setEditItems] = useState<PedidoItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void }>({ open: false, title: "", message: "", onConfirm: () => {} });

  // Payment detail
  const [detailPayments, setDetailPayments] = useState<PaymentEntry[]>([]);
  const [detailNCs, setDetailNCs] = useState<NCDetail[]>([]);

  // Payment config
  const [cuentasBancarias, setCuentasBancarias] = useState<{ id: string; nombre: string; alias: string }[]>([]);
  const [recargoTransferencia, setRecargoTransferencia] = useState(0);

  // Print
  const [printOpen, setPrintOpen] = useState(false);
  const [printSale, setPrintSale] = useState<ReceiptSale | null>(null);
  const [receiptConfig, setReceiptConfig] = useState<ReceiptConfig>(defaultReceiptConfig);

  // Compute unidades_por_presentacion from presentation name
  const getUPP = (presentacion: string): number => {
    const lower = (presentacion || "").toLowerCase();
    if (lower.includes("medio")) return 0.5;
    const boxMatch = presentacion.match(/[Cc]aja\s*\(?x?(\d+)\)?/);
    if (boxMatch) return Number(boxMatch[1]);
    return 1;
  };

  // Load config + bank accounts on mount
  useEffect(() => {
    Promise.all([
      supabase.from("cuentas_bancarias").select("id, nombre, alias").eq("activo", true).order("nombre"),
      supabase.from("tienda_config").select("logo_url, url_tienda, recargo_transferencia").limit(1).single(),
      supabase.from("empresa").select("nombre, web, domicilio, telefono, cuit, condicion_iva, inicio_actividades, ingresos_brutos, white_label").limit(1).single(),
      supabase.from("configuracion_impresion").select("*").limit(1).single(),
    ]).then(([cuentasRes, tcRes, empRes, impRes]) => {
      if (cuentasRes.data) setCuentasBancarias(cuentasRes.data as any[]);
      const tc = tcRes.data as any;
      if (tc?.recargo_transferencia > 0) setRecargoTransferencia(tc.recargo_transferencia);

      // Build receipt config
      const emp = empRes.data as any;
      const imp = impRes.data as any;
      const wl = emp?.white_label || {};
      setReceiptConfig({
        ...defaultReceiptConfig,
        logoUrl: imp?.logo_url || tc?.logo_url || wl?.logo_url || defaultReceiptConfig.logoUrl,
        empresaNombre: emp?.nombre || "",
        empresaWeb: emp?.web || tc?.url_tienda || "",
        empresaDomicilio: emp?.domicilio || "",
        empresaTelefono: emp?.telefono || "",
        empresaCuit: emp?.cuit || "",
        empresaIva: emp?.condicion_iva || "",
        empresaInicioAct: emp?.inicio_actividades || "",
        empresaIngrBrutos: emp?.ingresos_brutos || "",
        ...(imp || {}),
      });
    });
  }, []);

  const fetchPedidos = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("pedidos_tienda")
      .select("*")
      .order("created_at", { ascending: false });

    if (!data) { setLoading(false); return; }

    const ids = data.map((p: any) => p.id);
    const numeros = data.map((p: any) => p.numero);

    // Parallel: fetch items + linked ventas at the same time
    const [{ data: allItems }, { data: ventas }] = await Promise.all([
      supabase.from("pedido_tienda_items").select("*").in("pedido_id", ids),
      supabase.from("ventas").select("id, numero, cliente_id").in("numero", numeros),
    ]);

    const ventaMap: Record<string, { id: string; cliente_id: string }> = {};
    for (const v of ventas || []) ventaMap[v.numero] = { id: v.id, cliente_id: v.cliente_id };
    const ventaIds = Object.values(ventaMap).map(v => v.id);

    // Fetch UPP for quantity display
    const { data: uppData } = ventaIds.length > 0
      ? await supabase.from("venta_items").select("producto_id, presentacion, unidades_por_presentacion, venta_id").in("venta_id", ventaIds)
      : { data: [] };

    const uppByProducto: Record<string, number> = {};
    for (const vi of uppData || []) {
      if (vi.producto_id && vi.unidades_por_presentacion) {
        uppByProducto[`${vi.producto_id}_${vi.presentacion || ""}`] = vi.unidades_por_presentacion;
      }
    }

    const itemsByPedido: Record<number, PedidoItem[]> = {};
    (allItems || []).forEach((item: any) => {
      if (!itemsByPedido[item.pedido_id]) itemsByPedido[item.pedido_id] = [];
      const key = `${item.producto_id}_${item.presentacion || ""}`;
      const upp = uppByProducto[key] || getUPP(item.presentacion || "");
      itemsByPedido[item.pedido_id].push({ ...item, unidades_por_presentacion: upp });
    });

    setPedidos(data.map((p: any) => {
      const ventaId = ventaMap[p.numero]?.id;
      return {
        ...p,
        estado: (p.estado || "pendiente").toLowerCase(),
        items: itemsByPedido[p.id] || [],
        ventaId: ventaId || undefined,
        clienteId: ventaMap[p.numero]?.cliente_id || undefined,
      };
    }));
    setLoading(false);
  }, []);

  useEffect(() => { fetchPedidos(); }, [fetchPedidos]);

  // Filter pedidos
  const filtered = pedidos.filter((p) => {
    if (filterEstado === "activos" && (p.estado === "entregado" || p.estado === "cancelado")) return false;
    if (filterEstado !== "activos" && filterEstado !== "todos" && p.estado !== filterEstado) return false;
    if (filterEntrega !== "todos" && p.metodo_entrega !== filterEntrega) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!p.numero.toLowerCase().includes(q) && !p.nombre_cliente.toLowerCase().includes(q) && !p.email?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Build payment entries from pedido fields (checkout data / cobro saved data)
  const buildPaymentsFromPedido = (pedido: Pedido): PaymentEntry[] => {
    const metodo = (pedido.metodo_pago || "").toLowerCase();
    const payments: PaymentEntry[] = [];
    if (metodo === "mixto" || metodo.includes("mixto")) {
      if ((pedido.monto_efectivo || 0) > 0) payments.push({ metodo: "Efectivo", monto: pedido.monto_efectivo });
      if ((pedido.monto_transferencia || 0) > 0) payments.push({ metodo: "Transferencia", monto: pedido.monto_transferencia, cuenta_bancaria: pedido.cuenta_bancaria_alias || null });
    } else if (metodo.includes("transferencia")) {
      payments.push({ metodo: "Transferencia", monto: pedido.total, cuenta_bancaria: pedido.cuenta_bancaria_alias || null });
    } else if (metodo.includes("cuenta")) {
      payments.push({ metodo: "Cuenta Corriente", monto: pedido.total });
    } else if (metodo.includes("efectivo")) {
      payments.push({ metodo: "Efectivo", monto: pedido.total });
    }
    if (payments.length === 0) payments.push({ metodo: "Pendiente de cobro", monto: pedido.total });
    return payments;
  };

  // Load payment info and NCs for a pedido
  const loadPaymentInfo = async (pedido: Pedido) => {
    // For non-entregado pedidos, show payment from pedido fields (not caja)
    const isEntregado = pedido.estado === "entregado";

    if (!pedido.ventaId) {
      setDetailPayments(buildPaymentsFromPedido(pedido));
      setDetailNCs([]);
      return;
    }

    // Fetch NCs always; only fetch caja entries if entregado
    const [cajaRes, ccRes, ncRes] = await Promise.all([
      isEntregado
        ? supabase.from("caja_movimientos").select("metodo_pago, monto, tipo, cuenta_bancaria").eq("referencia_id", pedido.ventaId).eq("referencia_tipo", "venta")
        : Promise.resolve({ data: [] }),
      isEntregado
        ? supabase.from("cuenta_corriente").select("debe").eq("venta_id", pedido.ventaId).gt("debe", 0)
        : Promise.resolve({ data: [] }),
      supabase.from("ventas").select("numero, total, venta_items(descripcion, cantidad, precio_unitario, subtotal)").eq("remito_origen_id", pedido.ventaId).eq("tipo_comprobante", "NC"),
    ]);

    let payments: PaymentEntry[];
    if (isEntregado) {
      // Entregado: show actual caja entries
      payments = [];
      for (const m of cajaRes.data || []) {
        if (m.tipo === "ingreso" && m.monto > 0) {
          payments.push({ metodo: m.metodo_pago, monto: m.monto, cuenta_bancaria: (m as any).cuenta_bancaria });
        }
      }
      const ccTotal = (ccRes.data || []).reduce((a: number, r: any) => a + (r.debe || 0), 0);
      if (ccTotal > 0) payments.push({ metodo: "Cuenta Corriente", monto: ccTotal });
      if (payments.length === 0) payments = buildPaymentsFromPedido(pedido);
    } else {
      // Not entregado: show from pedido fields
      payments = buildPaymentsFromPedido(pedido);
    }

    setDetailPayments(payments);

    // NCs
    const ncs: NCDetail[] = (ncRes.data || []).map((nc: any) => ({
      numero: nc.numero,
      total: nc.total,
      items: (nc.venta_items || []).map((i: any) => ({
        descripcion: i.descripcion,
        cantidad: i.cantidad,
        precio_unitario: i.precio_unitario,
        subtotal: i.subtotal,
      })),
    }));
    setDetailNCs(ncs);
  };

  // Open detail — build payment display from pedido fields instantly
  const openDetail = async (pedido: Pedido) => {
    setSelectedPedido(pedido);
    setEditItems(pedido.items.map((i) => ({ ...i })));
    setHasChanges(false);
    setDetailNCs([]);

    // Instantly show payment from pedido fields
    setDetailPayments(buildPaymentsFromPedido(pedido));

    setDetailOpen(true);

    // Fetch NCs in background (less common, ok to be async)
    if (pedido.ventaId) {
      const { data: ncRows } = await supabase
        .from("ventas")
        .select("numero, total, venta_items(descripcion, cantidad, precio_unitario, subtotal)")
        .eq("remito_origen_id", pedido.ventaId)
        .eq("tipo_comprobante", "NC");
      setDetailNCs((ncRows || []).map((nc: any) => ({
        numero: nc.numero,
        total: nc.total,
        items: (nc.venta_items || []).map((i: any) => ({
          descripcion: i.descripcion, cantidad: i.cantidad,
          precio_unitario: i.precio_unitario, subtotal: i.subtotal,
        })),
      })));
    }
  };

  // Save changes
  const handleSave = async () => {
    if (!selectedPedido) return;
    setSaving(true);
    const errores: string[] = [];

    try {
      const originalItems = selectedPedido.items;
      const stockDiffs: Record<string, number> = {};
      for (const orig of originalItems) {
        const upp = orig.unidades_por_presentacion || 1;
        stockDiffs[orig.producto_id] = (stockDiffs[orig.producto_id] || 0) + (orig.cantidad * upp);
      }
      for (const item of editItems) {
        const upp = item.unidades_por_presentacion || 1;
        stockDiffs[item.producto_id] = (stockDiffs[item.producto_id] || 0) - (item.cantidad * upp);
      }

      for (const [productoId, diff] of Object.entries(stockDiffs)) {
        if (Math.abs(diff) < 0.001) continue;
        const { data: prod } = await supabase.from("productos").select("stock").eq("id", productoId).single();
        if (!prod) { errores.push(`Producto ${productoId} no encontrado`); continue; }
        const stockAntes = prod.stock;
        const stockDespues = stockAntes + diff;
        await supabase.from("productos").update({ stock: stockDespues }).eq("id", productoId);
        await supabase.from("stock_movimientos").insert({
          producto_id: productoId, tipo: diff > 0 ? "Ajuste" : "Venta", cantidad: diff,
          cantidad_antes: stockAntes, cantidad_despues: stockDespues,
          referencia: `Edición Pedido Web #${selectedPedido.numero}`,
          descripcion: diff > 0 ? "Devolución por edición de pedido" : "Agregado por edición de pedido",
          usuario: currentUser?.nombre || "Admin Sistema",
        });
      }

      await supabase.from("pedido_tienda_items").delete().eq("pedido_id", selectedPedido.id);
      const newItems = editItems.map((item) => ({
        pedido_id: selectedPedido.id, producto_id: item.producto_id, nombre: item.nombre,
        presentacion: item.presentacion, cantidad: item.cantidad,
        precio_unitario: item.precio_unitario, subtotal: item.precio_unitario * item.cantidad,
      }));
      await supabase.from("pedido_tienda_items").insert(newItems);

      const nuevoSubtotal = editItems.reduce((sum, i) => sum + i.precio_unitario * i.cantidad, 0);
      const nuevoTotal = nuevoSubtotal + (selectedPedido.costo_envio || 0);
      await supabase.from("pedidos_tienda").update({ subtotal: nuevoSubtotal, total: nuevoTotal }).eq("id", selectedPedido.id);

      // Sync linked venta
      if (selectedPedido.ventaId) {
        const { data: venta } = await supabase.from("ventas").select("id, total, cliente_id, forma_pago").eq("id", selectedPedido.ventaId).single();
        if (venta) {
          const totalAnterior = venta.total || 0;
          const diferencia = nuevoTotal - totalAnterior;
          await supabase.from("ventas").update({ subtotal: nuevoSubtotal, total: nuevoTotal }).eq("id", venta.id);
          await supabase.from("venta_items").delete().eq("venta_id", venta.id);
          await supabase.from("venta_items").insert(
            editItems.map((item) => ({
              venta_id: venta.id, producto_id: item.producto_id,
              descripcion: item.presentacion && item.presentacion !== "Unidad" ? `${item.nombre} (${item.presentacion})` : item.nombre,
              cantidad: item.cantidad, precio_unitario: item.precio_unitario,
              subtotal: item.precio_unitario * item.cantidad, unidad_medida: "Un",
              presentacion: item.presentacion, unidades_por_presentacion: item.unidades_por_presentacion || 1,
            }))
          );

          // No caja adjustments on edit — the "saldo pendiente" mechanism handles
          // differences. The cobro will be registered manually when the client pays.
        }
      }

      if (errores.length > 0) showAdminToast("Guardado con advertencias: " + errores.join(". "), "info");
      else showAdminToast("Pedido actualizado correctamente", "success");
      setHasChanges(false);
      fetchPedidos();
      setDetailOpen(false);
    } catch (err: any) {
      showAdminToast("Error al guardar: " + (err.message || "Error desconocido"), "error");
    } finally {
      setSaving(false);
    }
  };

  // Update estado with status flow
  const handleEstadoChange = async (pedido: Pedido, nuevoEstado: string) => {
    const estadoAnterior = pedido.estado;
    await supabase.from("pedidos_tienda").update({ estado: nuevoEstado }).eq("id", pedido.id);

    const ventaEstado = nuevoEstado === "cancelado" ? "anulada" : nuevoEstado;
    const ventaUpdate: Record<string, unknown> = { estado: ventaEstado };
    if (nuevoEstado === "entregado") ventaUpdate.entregado = true;
    if (nuevoEstado === "cancelado") {
      ventaUpdate.entregado = false;
      ventaUpdate.observacion = "ANULADA (Cancelación desde Pedidos Online)";
    }
    await supabase.from("ventas").update(ventaUpdate).eq("numero", pedido.numero);

    // ═══ ENTREGADO: register payment in caja from saved payment data ═══
    if (nuevoEstado === "entregado" && pedido.ventaId) {
      const ventaId = pedido.ventaId;

      // Check if caja entries already exist (prevent duplicates on cancel→reactivate→entregado)
      const { data: existingCaja } = await supabase.from("caja_movimientos").select("id").eq("referencia_id", ventaId).eq("referencia_tipo", "venta").limit(1);
      const { data: existingCC } = await supabase.from("cuenta_corriente").select("id").eq("venta_id", ventaId).limit(1);

      if ((!existingCaja || existingCaja.length === 0) && (!existingCC || existingCC.length === 0)) {
        const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
        const hora = nowTimeARG();

        // Fetch fresh payment data from DB (includes cuenta_transferencia_alias from venta)
        const [{ data: freshPedido }, { data: freshVenta }] = await Promise.all([
          supabase.from("pedidos_tienda").select("metodo_pago, monto_efectivo, monto_transferencia, total").eq("id", pedido.id).single(),
          supabase.from("ventas").select("forma_pago, monto_efectivo, monto_transferencia, total, cuenta_transferencia_alias, cliente_id").eq("id", ventaId).single(),
        ]);

        const fp = freshPedido || pedido;
        const metodo = (fp.metodo_pago || "efectivo").toLowerCase();
        const total = fp.total || pedido.total;
        const cuentaAlias = freshVenta?.cuenta_transferencia_alias || null;
        const clienteId = freshVenta?.cliente_id || pedido.clienteId;
        const entries: any[] = [];

        if (metodo === "mixto" || metodo.includes("mixto")) {
          const efvo = fp.monto_efectivo || 0;
          const transf = fp.monto_transferencia || 0;
          if (efvo > 0) entries.push({ fecha: hoy, hora, tipo: "ingreso", descripcion: `Cobro Pedido Web #${pedido.numero} (Efectivo)`, metodo_pago: "Efectivo", monto: efvo, referencia_id: ventaId, referencia_tipo: "venta" });
          if (transf > 0) entries.push({ fecha: hoy, hora, tipo: "ingreso", descripcion: `Cobro Pedido Web #${pedido.numero} (Transferencia)`, metodo_pago: "Transferencia", monto: transf, referencia_id: ventaId, referencia_tipo: "venta", ...(cuentaAlias ? { cuenta_bancaria: cuentaAlias } : {}) });
        } else if (metodo.includes("transferencia")) {
          entries.push({ fecha: hoy, hora, tipo: "ingreso", descripcion: `Cobro Pedido Web #${pedido.numero}`, metodo_pago: "Transferencia", monto: total, referencia_id: ventaId, referencia_tipo: "venta", ...(cuentaAlias ? { cuenta_bancaria: cuentaAlias } : {}) });
        } else if (metodo.includes("cuenta")) {
          // Cuenta Corriente: no caja entry, create CC entry
          if (clienteId) {
            const { data: clienteData } = await supabase.from("clientes").select("saldo").eq("id", clienteId).single();
            const saldoActual = clienteData?.saldo || 0;
            const nuevoSaldo = saldoActual + total;
            await supabase.from("cuenta_corriente").insert({
              cliente_id: clienteId, fecha: hoy,
              comprobante: `Pedido Web #${pedido.numero}`,
              descripcion: "Pedido online a cuenta corriente",
              debe: total, haber: 0, saldo: nuevoSaldo,
              forma_pago: "Cuenta Corriente", venta_id: ventaId,
            });
            await supabase.from("clientes").update({ saldo: nuevoSaldo }).eq("id", clienteId);
          }
        } else {
          // Efectivo (default)
          entries.push({ fecha: hoy, hora, tipo: "ingreso", descripcion: `Cobro Pedido Web #${pedido.numero}`, metodo_pago: "Efectivo", monto: total, referencia_id: ventaId, referencia_tipo: "venta" });
        }

        if (entries.length > 0) await supabase.from("caja_movimientos").insert(entries);
      }
    }

    // Return stock when cancelling
    if (nuevoEstado === "cancelado" && estadoAnterior !== "cancelado") {
      for (const item of pedido.items) {
        if (!item.producto_id) continue;
        const upp = item.unidades_por_presentacion || 1;
        const unitsToRestore = item.cantidad * upp;
        const { data: prod } = await supabase.from("productos").select("stock").eq("id", item.producto_id).single();
        if (!prod) continue;
        const stockAntes = prod.stock;
        await supabase.from("productos").update({ stock: stockAntes + unitsToRestore }).eq("id", item.producto_id);
        await supabase.from("stock_movimientos").insert({
          producto_id: item.producto_id, tipo: "anulacion", cantidad: unitsToRestore,
          cantidad_antes: stockAntes, cantidad_despues: stockAntes + unitsToRestore,
          referencia: `Cancelación Pedido Web #${pedido.numero}`,
          descripcion: `Devolución stock - ${item.nombre} (${item.presentacion})`,
          usuario: currentUser?.nombre || "Admin Sistema",
        });
      }
    }

    // Re-decrement stock if un-cancelling
    if (estadoAnterior === "cancelado" && nuevoEstado !== "cancelado") {
      for (const item of pedido.items) {
        if (!item.producto_id) continue;
        const upp = item.unidades_por_presentacion || 1;
        const unitsToDecrement = item.cantidad * upp;
        const { data: prod } = await supabase.from("productos").select("stock").eq("id", item.producto_id).single();
        if (!prod) continue;
        const stockAntes = prod.stock;
        await supabase.from("productos").update({ stock: stockAntes - unitsToDecrement }).eq("id", item.producto_id);
        await supabase.from("stock_movimientos").insert({
          producto_id: item.producto_id, tipo: "Venta", cantidad: -unitsToDecrement,
          cantidad_antes: stockAntes, cantidad_despues: stockAntes - unitsToDecrement,
          referencia: `Reactivación Pedido Web #${pedido.numero}`,
          descripcion: `Descuento stock - ${item.nombre} (${item.presentacion})`,
          usuario: currentUser?.nombre || "Admin Sistema",
        });
      }
    }

    showAdminToast(`Pedido #${pedido.numero} → ${estadoBadge[nuevoEstado]?.label || nuevoEstado}`, "success");
    fetchPedidos();
  };

  // Print receipt
  const handlePrint = (pedido: Pedido) => {
    const items: ReceiptLineItem[] = pedido.items.map((i, idx) => ({
      id: String(idx),
      producto_id: i.producto_id || "",
      code: "",
      description: i.nombre,
      qty: i.cantidad,
      unit: "Un",
      price: i.precio_unitario,
      discount: 0,
      subtotal: i.precio_unitario * i.cantidad,
      presentacion: i.presentacion,
      unidades_por_presentacion: i.unidades_por_presentacion || 1,
      stock: 0,
    }));

    const efvo = detailPayments.filter(p => p.metodo === "Efectivo").reduce((s, p) => s + p.monto, 0);
    const transf = detailPayments.filter(p => p.metodo === "Transferencia").reduce((s, p) => s + p.monto, 0);
    const cc = detailPayments.filter(p => p.metodo === "Cuenta Corriente").reduce((s, p) => s + p.monto, 0);

    setPrintSale({
      numero: pedido.numero,
      total: pedido.total,
      subtotal: pedido.subtotal,
      descuento: 0,
      recargo: 0,
      transferSurcharge: 0,
      tipoComprobante: "X",
      formaPago: pedido.metodo_pago || "Efectivo",
      cliente: pedido.nombre_cliente,
      clienteDireccion: pedido.direccion_texto,
      clienteTelefono: pedido.telefono,
      vendedor: "Tienda Online",
      moneda: "ARS",
      items,
      fecha: new Date(pedido.created_at).toLocaleDateString("es-AR"),
      saldoAnterior: 0,
      saldoNuevo: 0,
      pagoEfectivo: efvo || undefined,
      pagoTransferencia: transf || undefined,
      pagoCuentaCorriente: cc || undefined,
    });
    setPrintOpen(true);
  };

  // Stats
  const pendientes = pedidos.filter((p) => p.estado === "pendiente").length;
  const armados = pedidos.filter((p) => p.estado === "armado").length;
  const entregados = pedidos.filter((p) => p.estado === "entregado").length;
  const totalPendiente = pedidos.filter((p) => p.estado === "pendiente" || p.estado === "armado").reduce((s, p) => s + p.total, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <Globe className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Pedidos Online</h1>
            <p className="text-sm text-muted-foreground">{filtered.length} de {pedidos.length} pedidos</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="cursor-pointer hover:border-amber-300 transition-colors" onClick={() => setFilterEstado("pendiente")}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Pendientes</p>
              <ShoppingCart className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-2xl font-bold text-amber-600">{pendientes}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-violet-300 transition-colors" onClick={() => setFilterEstado("armado")}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Armados</p>
              <PackageCheck className="w-4 h-4 text-violet-500" />
            </div>
            <p className="text-2xl font-bold text-violet-600">{armados}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Por entregar</p>
              <Banknote className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold">{formatCurrency(totalPendiente)}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-emerald-300 transition-colors" onClick={() => setFilterEstado("entregado")}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Entregados</p>
              <CheckCircle className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-2xl font-bold text-emerald-600">{entregados}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar por numero, cliente o email..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
            </div>
            <Select value={filterEstado} onValueChange={(v) => setFilterEstado(v || "activos")}>
              <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="activos">Activos</SelectItem>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="pendiente">Pendiente</SelectItem>
                <SelectItem value="armado">Armado</SelectItem>
                <SelectItem value="confirmado">Confirmado</SelectItem>
                <SelectItem value="entregado">Entregado</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterEntrega} onValueChange={(v) => setFilterEntrega(v || "todos")}>
              <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Entrega" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas</SelectItem>
                <SelectItem value="envio">Envio</SelectItem>
                <SelectItem value="retiro_local">Retiro en local</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Pedidos list */}
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="text-center py-16">
              <ShoppingCart className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No hay pedidos con los filtros seleccionados</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground">Pedido</th>
                    <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground">Cliente</th>
                    <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground">Entrega</th>
                    <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground">Fecha entrega</th>
                    <th className="text-center px-4 py-3 font-medium text-xs text-muted-foreground">Items</th>
                    <th className="text-right px-4 py-3 font-medium text-xs text-muted-foreground">Total</th>
                    <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground">Pago</th>
                    <th className="text-center px-4 py-3 font-medium text-xs text-muted-foreground">Estado</th>
                    <th className="text-center px-4 py-3 font-medium text-xs text-muted-foreground">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((pedido) => {
                    const est = estadoBadge[pedido.estado] || estadoBadge.pendiente;
                    const nextStates = estadoFlow[pedido.estado] || [];
                    return (
                      <tr key={pedido.id} className="border-b hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-semibold">#{pedido.numero}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(pedido.created_at).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium">{pedido.nombre_cliente}</p>
                          <p className="text-[10px] text-muted-foreground">{pedido.email}</p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {pedido.metodo_entrega === "envio" ? (
                              <><Truck className="w-3.5 h-3.5 text-blue-500" /><span className="text-xs">Envio</span></>
                            ) : (
                              <><Store className="w-3.5 h-3.5 text-green-500" /><span className="text-xs">Retiro</span></>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {pedido.fecha_entrega ? new Date(pedido.fecha_entrega + "T12:00:00").toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" }) : "---"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant="secondary" className="text-xs">{pedido.items.length}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">{formatCurrency(pedido.total)}</td>
                        <td className="px-4 py-3 text-xs">{pedido.metodo_pago || "—"}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-semibold border ${est.bg} ${est.text}`}>
                            {est.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => openDetail(pedido)}>
                              <Eye className="w-3.5 h-3.5" /> Ver
                            </Button>
                            {/* Quick status action */}
                            {nextStates.length > 0 && nextStates[0] !== "cancelado" && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs gap-1"
                                onClick={() => handleEstadoChange(pedido, nextStates[0])}
                              >
                                <ArrowRight className="w-3 h-3" />
                                {estadoBadge[nextStates[0]]?.label}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ DETAIL DIALOG (Universal) ═══ */}
      <VentaDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        data={selectedPedido ? {
          numero: selectedPedido.numero,
          created_at: selectedPedido.created_at,
          estado: selectedPedido.estado,
          metodo_pago: selectedPedido.metodo_pago,
          metodo_entrega: selectedPedido.metodo_entrega,
          subtotal: selectedPedido.subtotal,
          total: selectedPedido.total,
          costo_envio: selectedPedido.costo_envio,
          observacion: selectedPedido.observacion,
          nombre_cliente: selectedPedido.nombre_cliente,
          email: selectedPedido.email,
          telefono: selectedPedido.telefono,
          direccion_texto: selectedPedido.direccion_texto,
          fecha_entrega: selectedPedido.fecha_entrega,
          monto_efectivo: selectedPedido.monto_efectivo,
          monto_transferencia: selectedPedido.monto_transferencia,
          origen: "pedidos",
        } : null}
        items={selectedPedido?.items.map(i => ({
          producto_id: i.producto_id,
          descripcion: i.nombre,
          nombre: i.nombre,
          presentacion: i.presentacion,
          cantidad: i.cantidad,
          precio_unitario: i.precio_unitario,
          subtotal: i.precio_unitario * i.cantidad,
          unidades_por_presentacion: i.unidades_por_presentacion,
        })) || []}
        pagos={detailPayments}
        ncs={detailNCs}
        editable
        editItems={editItems.map(i => ({
          producto_id: i.producto_id,
          nombre: i.nombre,
          presentacion: i.presentacion,
          cantidad: i.cantidad,
          precio_unitario: i.precio_unitario,
          subtotal: i.precio_unitario * i.cantidad,
          unidades_por_presentacion: i.unidades_por_presentacion,
        }))}
        onEditItemsChange={(newItems) => {
          setEditItems(newItems.map(i => ({
            ...i,
            subtotal: i.precio_unitario * i.cantidad,
          })));
          setHasChanges(true);
        }}
        hasChanges={hasChanges}
        onSave={handleSave}
        saving={saving}
        onEstadoChange={(ns) => {
          if (!selectedPedido) return;
          handleEstadoChange(selectedPedido, ns);
          setSelectedPedido({ ...selectedPedido, estado: ns });
        }}
        onPrint={() => selectedPedido && handlePrint(selectedPedido)}
        onSearchProducts={async (query) => {
          const { data } = await supabase
            .from("productos")
            .select("id, codigo, nombre, precio, unidad_medida")
            .eq("activo", true)
            .or(`nombre.ilike.%${query}%,codigo.ilike.%${query}%`)
            .limit(10);
          return (data || []) as { id: string; codigo: string; nombre: string; precio: number; unidad_medida?: string }[];
        }}
        onConfirmAction={(title, message, action) => {
          setConfirmDialog({ open: true, title, message, onConfirm: action });
        }}
        cobroConfig={{
          cuentasBancarias,
          recargoTransferencia,
          onRegistrarCobro: async (metodo, monto, opts) => {
            if (!selectedPedido) return;
            // Save payment info to pedido + venta — NO caja entries yet.
            // Caja entries are created only when marking "Entregado".
            let formaPago = metodo;
            let montoEfectivo = 0;
            let montoTransferencia = 0;
            let recargoTransf = 0;
            const cuentaAlias = opts.cuenta || null;

            if (metodo === "Mixto") {
              const efvo = opts.efectivo || 0;
              const transf = opts.transferencia || 0;
              const surcharge = recargoTransferencia > 0 ? Math.round(transf * recargoTransferencia / 100) : 0;
              montoEfectivo = efvo;
              montoTransferencia = transf + surcharge;
              recargoTransf = surcharge;
            } else if (metodo === "Transferencia") {
              const surcharge = recargoTransferencia > 0 ? Math.round(monto * recargoTransferencia / 100) : 0;
              montoTransferencia = monto + surcharge;
              recargoTransf = surcharge;
            } else if (metodo === "Cuenta Corriente") {
              formaPago = "Cuenta Corriente";
            } else {
              montoEfectivo = monto;
            }

            const nuevoTotal = metodo === "Cuenta Corriente" ? monto : montoEfectivo + montoTransferencia;

            // Update pedidos_tienda with payment data
            await supabase.from("pedidos_tienda").update({
              metodo_pago: metodo.toLowerCase(),
              monto_efectivo: montoEfectivo,
              monto_transferencia: montoTransferencia,
              recargo_transferencia: recargoTransf,
              total: nuevoTotal,
            }).eq("id", selectedPedido.id);

            // Update venta
            if (selectedPedido.ventaId) {
              await supabase.from("ventas").update({
                forma_pago: formaPago,
                monto_efectivo: montoEfectivo,
                monto_transferencia: montoTransferencia,
                total: nuevoTotal,
                cuenta_transferencia_alias: cuentaAlias,
              }).eq("id", selectedPedido.ventaId);
            }

            // Update local state
            const updatedPedido = {
              ...selectedPedido,
              metodo_pago: metodo.toLowerCase(),
              monto_efectivo: montoEfectivo,
              monto_transferencia: montoTransferencia,
              recargo_transferencia: recargoTransf,
              cuenta_bancaria_alias: cuentaAlias,
              total: nuevoTotal,
            };
            setSelectedPedido(updatedPedido);
            setDetailPayments(buildPaymentsFromPedido(updatedPedido));

            showAdminToast("Método de pago guardado", "success");
            fetchPedidos();
          },
        }}
      />

      {/* ═══ CONFIRM DIALOG ═══ */}
      <Dialog open={confirmDialog.open} onOpenChange={(o) => setConfirmDialog(prev => ({ ...prev, open: o }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{confirmDialog.title}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{confirmDialog.message}</p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}>Cancelar</Button>
            <Button onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(prev => ({ ...prev, open: false })); }}>Confirmar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══ PRINT DIALOG ═══ */}
      {printSale && (
        <Suspense fallback={null}>
          <PrintPreviewDialog
            open={printOpen}
            onClose={() => { setPrintOpen(false); setPrintSale(null); }}
            config={receiptConfig}
            sale={printSale}
            title={`Pedido #${printSale.numero}`}
          />
        </Suspense>
      )}
    </div>
  );
}
