"use client";

import { nowTimeARG, formatCurrency } from "@/lib/formatters";
import { recalcFromVenta } from "@/lib/order-calc";
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
import type { CobroVentaResult } from "@/components/cobro-venta-section";
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
  descuento?: number;
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
  const [clienteSaldo, setClienteSaldo] = useState(0);

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
      supabase.from("ventas").select("id, numero, cliente_id, estado, entregado").in("numero", numeros),
    ]);

    const ventaMap: Record<string, { id: string; cliente_id: string; estado: string; entregado: boolean }> = {};
    for (const v of ventas || []) ventaMap[v.numero] = { id: v.id, cliente_id: v.cliente_id, estado: v.estado, entregado: v.entregado };
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
      const ventaInfo = ventaMap[p.numero];
      // Derive estado: check venta.entregado flag first, then map venta.estado to pedido states, fallback to pedidos_tienda.estado
      let estado = (p.estado || "pendiente").toLowerCase();
      if (ventaInfo) {
        if (ventaInfo.entregado || ventaInfo.estado === "entregado" || ventaInfo.estado === "entregada") {
          estado = "entregado";
        } else if (ventaInfo.estado === "anulada") {
          estado = "cancelado";
        } else if (ventaInfo.estado === "facturada") {
          estado = "entregado"; // facturada implies delivered
        }
        // For "abierta"/"cerrada" states, keep pedidos_tienda.estado as it's more specific
      }
      return {
        ...p,
        estado,
        items: itemsByPedido[p.id] || [],
        ventaId: ventaInfo?.id || undefined,
        clienteId: ventaInfo?.cliente_id || undefined,
      };
    }));
    setLoading(false);
  }, []);

  useEffect(() => { fetchPedidos(); }, [fetchPedidos]);

  // Realtime: refresh when pedidos_tienda OR ventas change (historial/hoja de ruta updates estado)
  useEffect(() => {
    const channel = supabase
      .channel("pedidos-tienda-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos_tienda" }, () => {
        fetchPedidos();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "ventas" }, () => {
        fetchPedidos();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchPedidos]);

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
    const isPaid = pedido.estado === "entregado";
    const sfx = isPaid ? "" : " (a cobrar)";
    const payments: PaymentEntry[] = [];
    if (metodo === "mixto" || metodo.includes("mixto")) {
      if ((pedido.monto_efectivo || 0) > 0) payments.push({ metodo: `Efectivo${sfx}`, monto: pedido.monto_efectivo });
      if ((pedido.monto_transferencia || 0) > 0) payments.push({ metodo: `Transferencia${sfx}`, monto: pedido.monto_transferencia, cuenta_bancaria: pedido.cuenta_bancaria_alias || null });
    } else if (metodo.includes("transferencia")) {
      payments.push({ metodo: `Transferencia${sfx}`, monto: pedido.total, cuenta_bancaria: pedido.cuenta_bancaria_alias || null });
    } else if (metodo.includes("cuenta")) {
      payments.push({ metodo: `Cuenta Corriente${sfx}`, monto: pedido.total });
    } else if (metodo.includes("efectivo")) {
      payments.push({ metodo: `Efectivo${sfx}`, monto: pedido.total });
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

    // Fetch client saldo
    if (pedido.clienteId) {
      supabase.from("clientes").select("saldo").eq("id", pedido.clienteId).single()
        .then(({ data: c }) => setClienteSaldo(c?.saldo || 0));
    } else {
      setClienteSaldo(0);
    }

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
        const { data: stockResult, error: rpcErr } = await supabase.rpc("atomic_update_stock", { p_producto_id: productoId, p_change: diff });
        if (rpcErr) { errores.push(`Error stock ${productoId}: ${rpcErr.message}`); continue; }
        const stockDespues = stockResult?.stock_despues ?? 0;
        const stockAntes = stockResult?.stock_antes ?? (stockDespues - diff);
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
      // Reset payment amounts to match new total (surcharge will be re-applied on cobro save)
      const metodo = (selectedPedido.metodo_pago || "efectivo").toLowerCase();
      const pedidoUpdate: Record<string, unknown> = { subtotal: nuevoSubtotal, total: nuevoTotal };
      if (metodo.includes("transferencia") && !metodo.includes("mixto")) {
        pedidoUpdate.monto_transferencia = nuevoTotal;
        pedidoUpdate.monto_efectivo = 0;
        pedidoUpdate.recargo_transferencia = 0;
      } else if (metodo.includes("mixto")) {
        // Keep proportions: scale existing split to new total
        const oldTotal = selectedPedido.total || 1;
        const ratio = nuevoTotal / oldTotal;
        pedidoUpdate.monto_efectivo = Math.round((selectedPedido.monto_efectivo || 0) * ratio);
        pedidoUpdate.monto_transferencia = Math.round((selectedPedido.monto_transferencia || 0) * ratio);
        pedidoUpdate.recargo_transferencia = 0;
      } else {
        pedidoUpdate.monto_efectivo = nuevoTotal;
        pedidoUpdate.monto_transferencia = 0;
        pedidoUpdate.recargo_transferencia = 0;
      }
      await supabase.from("pedidos_tienda").update(pedidoUpdate).eq("id", selectedPedido.id);

      // Sync linked venta
      if (selectedPedido.ventaId) {
        const { data: venta } = await supabase.from("ventas").select("id, total, cliente_id, forma_pago").eq("id", selectedPedido.ventaId).single();
        if (venta) {
          const totalAnterior = venta.total || 0;
          const diferencia = nuevoTotal - totalAnterior;
          await supabase.from("ventas").update({ subtotal: nuevoSubtotal, total: nuevoTotal }).eq("id", venta.id);
          await supabase.from("venta_items").delete().eq("venta_id", venta.id);
          // Fetch costo + es_combo for each product so we preserve costo_unitario
          const prodIds = [...new Set(editItems.map(i => i.producto_id).filter(Boolean))];
          const { data: prodCostos } = prodIds.length > 0
            ? await supabase.from("productos").select("id, costo, es_combo").in("id", prodIds)
            : { data: [] };
          const costoMap: Record<string, { costo: number; es_combo: boolean }> = {};
          for (const p of prodCostos || []) costoMap[p.id] = { costo: p.costo || 0, es_combo: !!p.es_combo };

          await supabase.from("venta_items").insert(
            editItems.map((item) => {
              const upp = item.unidades_por_presentacion || 1;
              const prod = costoMap[item.producto_id];
              // Same logic as checkout: costo × UPP (combos keep raw costo)
              const costoUnit = prod ? (prod.es_combo ? prod.costo : prod.costo * upp) : 0;
              return {
                venta_id: venta.id, producto_id: item.producto_id,
                descripcion: item.presentacion && item.presentacion !== "Unidad" ? `${item.nombre} (${item.presentacion})` : item.nombre,
                cantidad: item.cantidad, precio_unitario: item.precio_unitario,
                costo_unitario: costoUnit,
                subtotal: item.precio_unitario * item.cantidad, unidad_medida: "Un",
                presentacion: item.presentacion, unidades_por_presentacion: upp,
              };
            })
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
    const { error: updateError } = await supabase.from("pedidos_tienda").update({ estado: nuevoEstado }).eq("id", pedido.id);
    if (updateError) {
      showAdminToast(`Error al cambiar estado: ${updateError.message}`, "error");
      return;
    }
    // Registrar en historial para que el cliente vea el timeline
    await supabase.from("pedido_estado_historial").insert({
      pedido_numero: pedido.numero,
      estado: nuevoEstado,
    });

    const hoyGlobal = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
    const ventaEstado = nuevoEstado === "cancelado" ? "anulada" : nuevoEstado;
    const ventaUpdate: Record<string, unknown> = { estado: ventaEstado };
    if (nuevoEstado === "entregado") {
      ventaUpdate.entregado = true;
      // Update venta.fecha to actual delivery date so caja/reports land on the right day
      // (checkout creates delivery ventas with fecha = fechaEntrega which may be in the future)
      ventaUpdate.fecha = hoyGlobal;
    }
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
        const hoy = hoyGlobal;
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
            const { data: nuevoSaldo } = await supabase.rpc("atomic_update_client_saldo", { p_client_id: clienteId, p_change: total });
            await supabase.from("cuenta_corriente").insert({
              cliente_id: clienteId, fecha: hoy,
              comprobante: `Pedido Web #${pedido.numero}`,
              descripcion: "Pedido online a cuenta corriente",
              debe: total, haber: 0, saldo: nuevoSaldo,
              forma_pago: "Cuenta Corriente", venta_id: ventaId,
            });
          }
        } else {
          // Efectivo (default)
          entries.push({ fecha: hoy, hora, tipo: "ingreso", descripcion: `Cobro Pedido Web #${pedido.numero}`, metodo_pago: "Efectivo", monto: total, referencia_id: ventaId, referencia_tipo: "venta" });
        }

        if (entries.length > 0) await supabase.from("caja_movimientos").insert(entries);
      }
    }

    // Reverse caja + CC + saldo when cancelling (cobro may have been confirmed before entregado)
    if (nuevoEstado === "cancelado" && estadoAnterior !== "cancelado" && pedido.ventaId) {
      const ventaId = pedido.ventaId;
      const clienteId = pedido.clienteId;

      // Reverse caja entries
      const { data: cajaEntries } = await supabase
        .from("caja_movimientos")
        .select("id, monto")
        .eq("referencia_id", ventaId)
        .eq("referencia_tipo", "venta");
      if (cajaEntries && cajaEntries.length > 0) {
        await supabase.from("caja_movimientos").delete().eq("referencia_id", ventaId).eq("referencia_tipo", "venta");
      }

      // Reverse CC entries + recalculate saldo
      if (clienteId) {
        const { data: ccEntries } = await supabase
          .from("cuenta_corriente")
          .select("id, debe, haber")
          .eq("venta_id", ventaId);
        if (ccEntries && ccEntries.length > 0) {
          const netDebt = ccEntries.reduce((s, e) => s + (e.debe || 0) - (e.haber || 0), 0);
          await supabase.from("cuenta_corriente").delete().eq("venta_id", ventaId);
          // Reverse the saldo change (subtract what was added as debt, add back what was collected)
          if (netDebt !== 0) {
            const { data: newSaldo } = await supabase.rpc("atomic_update_client_saldo", {
              p_client_id: clienteId,
              p_change: -netDebt,
            });
            setClienteSaldo(newSaldo ?? 0);
          }
        }
      }

      // Reset monto_pagado
      await supabase.from("ventas").update({ monto_pagado: 0 }).eq("id", ventaId);
    }

    // Return stock when cancelling (handles combos: restores component product stock)
    if (nuevoEstado === "cancelado" && estadoAnterior !== "cancelado") {
      for (const item of pedido.items) {
        if (!item.producto_id) continue;
        // Check if product is a combo
        const { data: prod } = await supabase.from("productos").select("id, es_combo").eq("id", item.producto_id).single();
        if (!prod) continue;

        if (prod.es_combo) {
          // Combo: reverse stock on each component product
          const { data: comboItems } = await supabase
            .from("combo_items")
            .select("producto_id, cantidad, productos!combo_items_producto_id_fkey(nombre)")
            .eq("combo_id", item.producto_id);
          for (const ci of comboItems || []) {
            const componentId = (ci as any).producto_id;
            const unitsToRestore = item.cantidad * (ci as any).cantidad;
            const { data: newStockResult } = await supabase.rpc("atomic_update_stock", { p_producto_id: componentId, p_change: unitsToRestore });
            const newStock = newStockResult?.stock_despues ?? 0;
            const stockAntes = newStock - unitsToRestore;
            await supabase.from("stock_movimientos").insert({
              producto_id: componentId, tipo: "anulacion", cantidad: unitsToRestore,
              cantidad_antes: stockAntes, cantidad_despues: newStock,
              referencia: `Cancelación Pedido Web #${pedido.numero}`,
              descripcion: `Devolución stock combo - ${(ci as any).productos?.nombre || item.nombre}`,
              usuario: currentUser?.nombre || "Admin Sistema",
            });
          }
        } else {
          // Regular product
          const upp = item.unidades_por_presentacion || 1;
          const unitsToRestore = item.cantidad * upp;
          const { data: newStockResult } = await supabase.rpc("atomic_update_stock", { p_producto_id: item.producto_id, p_change: unitsToRestore });
          const newStock = newStockResult?.stock_despues ?? 0;
          const stockAntes = newStock - unitsToRestore;
          await supabase.from("stock_movimientos").insert({
            producto_id: item.producto_id, tipo: "anulacion", cantidad: unitsToRestore,
            cantidad_antes: stockAntes, cantidad_despues: newStock,
            referencia: `Cancelación Pedido Web #${pedido.numero}`,
            descripcion: `Devolución stock - ${item.nombre} (${item.presentacion})`,
            usuario: currentUser?.nombre || "Admin Sistema",
          });
        }
      }
    }

    // Re-decrement stock if un-cancelling (handles combos: decrements component product stock)
    if (estadoAnterior === "cancelado" && nuevoEstado !== "cancelado") {
      for (const item of pedido.items) {
        if (!item.producto_id) continue;
        const { data: prod } = await supabase.from("productos").select("id, es_combo").eq("id", item.producto_id).single();
        if (!prod) continue;

        if (prod.es_combo) {
          // Combo: decrement stock on each component product
          const { data: comboItems } = await supabase
            .from("combo_items")
            .select("producto_id, cantidad, productos!combo_items_producto_id_fkey(nombre)")
            .eq("combo_id", item.producto_id);
          for (const ci of comboItems || []) {
            const componentId = (ci as any).producto_id;
            const unitsToDecrement = item.cantidad * (ci as any).cantidad;
            const { data: newStockResult } = await supabase.rpc("atomic_update_stock", { p_producto_id: componentId, p_change: -unitsToDecrement });
            const newStock = newStockResult?.stock_despues ?? 0;
            const stockAntes = newStock + unitsToDecrement;
            await supabase.from("stock_movimientos").insert({
              producto_id: componentId, tipo: "Venta", cantidad: -unitsToDecrement,
              cantidad_antes: stockAntes, cantidad_despues: newStock,
              referencia: `Reactivación Pedido Web #${pedido.numero}`,
              descripcion: `Descuento stock combo - ${(ci as any).productos?.nombre || item.nombre}`,
              usuario: currentUser?.nombre || "Admin Sistema",
            });
          }
        } else {
          // Regular product
          const upp = item.unidades_por_presentacion || 1;
          const unitsToDecrement = item.cantidad * upp;
          const { data: newStockResult } = await supabase.rpc("atomic_update_stock", { p_producto_id: item.producto_id, p_change: -unitsToDecrement });
          const newStock = newStockResult?.stock_despues ?? 0;
          const stockAntes = newStock + unitsToDecrement;
          await supabase.from("stock_movimientos").insert({
            producto_id: item.producto_id, tipo: "Venta", cantidad: -unitsToDecrement,
            cantidad_antes: stockAntes, cantidad_despues: newStock,
            referencia: `Reactivación Pedido Web #${pedido.numero}`,
            descripcion: `Descuento stock - ${item.nombre} (${item.presentacion})`,
            usuario: currentUser?.nombre || "Admin Sistema",
          });
        }
      }
    }

    showAdminToast(`Pedido #${pedido.numero} → ${estadoBadge[nuevoEstado]?.label || nuevoEstado}`, "success");
    fetchPedidos();
  };

  // Print receipt
  const handlePrint = async (pedido: Pedido) => {
    // If we have a linked venta, fetch real data (tipoComprobante, surcharge, item discounts, etc.)
    if (pedido.ventaId) {
      const [{ data: v }, { data: vitems }, { data: movs }, { data: ncVentas }] = await Promise.all([
        supabase.from("ventas").select("id, numero, total, subtotal, descuento_porcentaje, recargo_porcentaje, tipo_comprobante, forma_pago, monto_efectivo, monto_transferencia, metodo_entrega, cliente_id, moneda").eq("id", pedido.ventaId).single(),
        supabase.from("venta_items").select("*").eq("venta_id", pedido.ventaId).order("created_at"),
        supabase.from("caja_movimientos").select("metodo_pago, monto, tipo").eq("referencia_id", pedido.ventaId).eq("referencia_tipo", "venta"),
        supabase.from("ventas").select("total").eq("remito_origen_id", pedido.ventaId).ilike("tipo_comprobante", "Nota de Crédito%").neq("estado", "anulada"),
      ]);
      if (v) {
        // Cargar categoria_id de los productos vinculados para agrupar en el ticket.
        const prodIdsForCat = [...new Set((vitems || []).map((it: any) => it.producto_id).filter(Boolean) as string[])];
        const prodCatMap: Record<string, string | null> = {};
        const categoriaMap: Record<string, { nombre: string; orden: number | null }> = {};
        if (prodIdsForCat.length > 0) {
          const { data: prodData } = await supabase.from("productos").select("id, categoria_id").in("id", prodIdsForCat);
          for (const p of (prodData as any[]) || []) prodCatMap[p.id] = p.categoria_id || null;
          const catIds = [...new Set(Object.values(prodCatMap).filter(Boolean) as string[])];
          if (catIds.length > 0) {
            const { data: cats } = await supabase.from("categorias").select("id, nombre, orden").in("id", catIds);
            for (const c of (cats as any[]) || []) categoriaMap[c.id] = { nombre: c.nombre, orden: c.orden ?? null };
          }
        }
        const lineItems: ReceiptLineItem[] = (vitems || []).map((item: any) => {
          const catId = prodCatMap[item.producto_id || ""] || null;
          const cat = catId ? categoriaMap[catId] : null;
          return {
            id: item.id,
            producto_id: item.producto_id || "",
            code: item.codigo || "",
            description: item.descripcion,
            qty: item.cantidad,
            unit: item.unidad_medida || "Un",
            price: item.precio_unitario,
            discount: item.descuento || 0,
            subtotal: item.subtotal,
            presentacion: item.presentacion || "",
            unidades_por_presentacion: item.unidades_por_presentacion ?? 1,
            stock: 0,
            categoria_nombre: cat?.nombre ?? null,
            categoria_orden: cat?.orden ?? null,
          };
        });
        let pagoEf = 0, pagoTr = 0, pagoCC = 0;
        for (const m of movs || []) {
          if (m.tipo === "ingreso") {
            if (m.metodo_pago === "Efectivo") pagoEf += m.monto;
            else if (m.metodo_pago === "Transferencia") pagoTr += m.monto;
            else if (m.metodo_pago === "Cuenta Corriente") pagoCC += m.monto;
          }
        }
        if ((movs || []).length === 0) {
          if (v.forma_pago === "Efectivo") pagoEf = v.total;
          else if (v.forma_pago === "Transferencia") pagoTr = v.total;
          else if (v.forma_pago === "Cuenta Corriente") pagoCC = v.total;
          else if (v.forma_pago === "Mixto") { pagoEf = v.monto_efectivo || 0; pagoTr = v.monto_transferencia || 0; }
        }
        const ventaSub = v.subtotal || pedido.subtotal;
        const ventaCalc = recalcFromVenta({ subtotal: ventaSub, descuento_porcentaje: v.descuento_porcentaje || 0, recargo_porcentaje: v.recargo_porcentaje || 0, total: v.total });
        const descAmt = ventaCalc.descuentoMonto;
        const recAmt = ventaCalc.recargoMonto;
        // Recalcular surcharge sobre base neta (subtotal - NC)
        const ncAmtPrint = (ncVentas || []).reduce((s: number, nc: any) => s + (nc.total || 0), 0);
        const baseNetaPrint = ventaSub - ncAmtPrint;
        const recPctPrint = v.recargo_porcentaje || 0;
        const surchargeCalc = recPctPrint > 0 && baseNetaPrint > 0
          ? Math.round(baseNetaPrint * recPctPrint / 100)
          : ventaCalc.transferSurcharge;
        // Derive formaPago from actual caja_movimientos payments (overrides v.forma_pago which may be stale)
        let derivedFormaPago: string;
        if ((movs || []).length > 0) {
          if (pagoTr > 0 && pagoEf === 0 && pagoCC === 0) derivedFormaPago = "Transferencia";
          else if (pagoEf > 0 && pagoTr === 0 && pagoCC === 0) derivedFormaPago = "Efectivo";
          else if (pagoCC > 0 && pagoEf === 0 && pagoTr === 0) derivedFormaPago = "Cuenta Corriente";
          else if (pagoTr > 0 || pagoEf > 0) derivedFormaPago = "Mixto";
          else derivedFormaPago = v.forma_pago || pedido.metodo_pago || "Efectivo";
        } else {
          derivedFormaPago = v.forma_pago || pedido.metodo_pago || "Efectivo";
        }
        setPrintSale({
          numero: v.numero || pedido.numero,
          total: v.total - ncAmtPrint,
          subtotal: v.subtotal || pedido.subtotal,
          descuento: descAmt,
          recargo: recAmt,
          transferSurcharge: surchargeCalc,
          tipoComprobante: v.tipo_comprobante || "X",
          formaPago: derivedFormaPago,
          cliente: pedido.nombre_cliente,
          clienteDireccion: pedido.direccion_texto,
          clienteTelefono: pedido.telefono,
          metodoEntrega: v.metodo_entrega || null,
          vendedor: "Tienda Online",
          moneda: v.moneda || "ARS",
          items: lineItems,
          fecha: new Date(pedido.created_at).toLocaleDateString("es-AR"),
          saldoAnterior: 0,
          saldoNuevo: 0,
          pagoEfectivo: pagoEf || undefined,
          pagoTransferencia: pagoTr || undefined,
          pagoCuentaCorriente: pagoCC || undefined,
        });
        setPrintOpen(true);
        return;
      }
    }

    // Fallback: no linked venta yet — use pedido data directly
    const items: ReceiptLineItem[] = pedido.items.map((i, idx) => ({
      id: String(idx),
      producto_id: i.producto_id || "",
      code: "",
      description: i.nombre,
      qty: i.cantidad,
      unit: "Un",
      price: i.precio_unitario,
      discount: i.descuento || 0,
      subtotal: i.subtotal ?? (i.precio_unitario * i.cantidad),
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
                          {pedido.fecha_entrega ? (
                            <span className={pedido.metodo_entrega !== "envio" ? "text-amber-700 font-medium" : ""}>
                              {pedido.metodo_entrega !== "envio" ? "Retiro: " : ""}
                              {new Date(pedido.fecha_entrega + "T12:00:00").toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" })}
                            </span>
                          ) : "---"}
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
          cuenta_transferencia_alias: selectedPedido.cuenta_bancaria_alias || null,
          origen: "pedidos",
        } : null}
        items={selectedPedido?.items.map(i => ({
          producto_id: i.producto_id,
          descripcion: i.nombre,
          nombre: i.nombre,
          presentacion: i.presentacion,
          cantidad: i.cantidad,
          precio_unitario: i.precio_unitario,
          descuento: i.descuento || 0,
          subtotal: i.subtotal ?? (i.precio_unitario * i.cantidad),
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
            .select("id, codigo, nombre, precio, unidad_medida, es_combo, imagen_url, stock, presentaciones(nombre, precio, cantidad)")
            .eq("activo", true)
            .or(`nombre.ilike.%${query}%,codigo.ilike.%${query}%`)
            .limit(10);
          return (data || []).map((p: any) => ({
            id: p.id,
            codigo: p.codigo,
            nombre: p.nombre,
            precio: p.precio,
            unidad_medida: p.unidad_medida,
            es_combo: p.es_combo || false,
            imagen_url: p.imagen_url || undefined,
            stock: p.stock ?? undefined,
            presentaciones: p.es_combo ? [] : (p.presentaciones || []).map((pr: any) => ({
              nombre: pr.nombre,
              precio: pr.precio,
              unidades_por_presentacion: pr.cantidad,
            })),
          }));
        }}
        onConfirmAction={(title, message, action) => {
          setConfirmDialog({ open: true, title, message, onConfirm: action });
        }}
        cobroConfig={{
          ventaId: selectedPedido?.ventaId || "",
          clienteId: selectedPedido?.clienteId || "",
          clienteSaldo,
          cuentasBancarias,
          recargoTransferencia,
          onRegistrarCobro: async (result: CobroVentaResult) => {
            if (!selectedPedido) return;
            const ventaId = selectedPedido.ventaId;
            const clienteId = selectedPedido.clienteId;
            const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
            const hora = nowTimeARG();
            const cuentaAlias = result.cuentaBancaria || null;

            // 1. Calculate payment amounts
            const montoEfectivo = result.efectivo;
            const montoTransferencia = result.transferencia + result.surcharge;
            const montoCuentaCorriente = result.cuentaCorriente;

            // 2. Save payment info to pedido + venta
            await supabase.from("pedidos_tienda").update({
              metodo_pago: result.metodo.toLowerCase(),
              monto_efectivo: montoEfectivo,
              monto_transferencia: montoTransferencia,
              recargo_transferencia: result.surcharge,
              total: montoEfectivo + montoTransferencia + montoCuentaCorriente,
            }).eq("id", selectedPedido.id);

            if (ventaId) {
              await supabase.from("ventas").update({
                forma_pago: result.metodo,
                monto_efectivo: montoEfectivo,
                monto_transferencia: montoTransferencia,
                total: montoEfectivo + montoTransferencia + montoCuentaCorriente,
                cuenta_transferencia_alias: cuentaAlias,
                monto_pagado: montoEfectivo + montoTransferencia + montoCuentaCorriente,
              }).eq("id", ventaId);
            }

            // 3. Create caja entries (for non-CC portions)
            if (ventaId) {
              const cajaEntries: any[] = [];
              if (montoEfectivo > 0) {
                cajaEntries.push({
                  fecha: hoy, hora, tipo: "ingreso",
                  descripcion: `Cobro Pedido Web #${selectedPedido.numero} (Efectivo)`,
                  metodo_pago: "Efectivo", monto: montoEfectivo,
                  referencia_id: ventaId, referencia_tipo: "venta",
                });
              }
              if (montoTransferencia > 0) {
                cajaEntries.push({
                  fecha: hoy, hora, tipo: "ingreso",
                  descripcion: `Cobro Pedido Web #${selectedPedido.numero} (Transferencia)`,
                  metodo_pago: "Transferencia", monto: montoTransferencia,
                  referencia_id: ventaId, referencia_tipo: "venta",
                  ...(cuentaAlias ? { cuenta_bancaria: cuentaAlias } : {}),
                });
              }
              if (cajaEntries.length > 0) {
                await supabase.from("caja_movimientos").insert(cajaEntries);
              }
            }

            // 4. Handle CC portion — create cuenta_corriente entry + update saldo
            if (montoCuentaCorriente > 0 && clienteId && ventaId) {
              const { data: clienteData } = await supabase.from("clientes").select("saldo").eq("id", clienteId).single();
              const saldoActual = clienteData?.saldo || 0;
              const nuevoSaldo = saldoActual + montoCuentaCorriente;
              await supabase.from("cuenta_corriente").insert({
                cliente_id: clienteId, fecha: hoy,
                comprobante: `Pedido Web #${selectedPedido.numero}`,
                descripcion: result.metodo === "Cuenta Corriente" ? "Pedido online a cuenta corriente" : "Resto a cuenta corriente (pago mixto)",
                debe: montoCuentaCorriente, haber: 0, saldo: nuevoSaldo,
                forma_pago: "Cuenta Corriente", venta_id: ventaId,
              });
              await supabase.from("clientes").update({ saldo: nuevoSaldo }).eq("id", clienteId);
              setClienteSaldo(nuevoSaldo);
            }

            // 5. Cobrar saldo adeudado — FIFO allocations
            if (result.cobrarSaldo && result.saldoAllocations.length > 0 && clienteId) {
              let saldoActual = clienteSaldo;
              // If we just added CC above, re-fetch
              if (montoCuentaCorriente > 0) {
                const { data: freshCliente } = await supabase.from("clientes").select("saldo").eq("id", clienteId).single();
                saldoActual = freshCliente?.saldo || 0;
              }

              for (const alloc of result.saldoAllocations) {
                if (alloc.aplicar <= 0) continue;

                // Create caja entry for saldo payment
                const saldoCajaEntries: any[] = [];
                if (result.metodo === "Efectivo" || (result.metodo === "Mixto" && montoEfectivo > 0)) {
                  saldoCajaEntries.push({
                    fecha: hoy, hora, tipo: "ingreso",
                    descripcion: `Cobro saldo - Pedido #${alloc.numero} (Efectivo)`,
                    metodo_pago: "Efectivo", monto: alloc.aplicar,
                    referencia_id: alloc.venta_id, referencia_tipo: "venta",
                  });
                } else if (result.metodo === "Transferencia" || (result.metodo === "Mixto" && montoTransferencia > 0)) {
                  saldoCajaEntries.push({
                    fecha: hoy, hora, tipo: "ingreso",
                    descripcion: `Cobro saldo - Pedido #${alloc.numero} (Transferencia)`,
                    metodo_pago: "Transferencia", monto: alloc.aplicar,
                    referencia_id: alloc.venta_id, referencia_tipo: "venta",
                    ...(cuentaAlias ? { cuenta_bancaria: cuentaAlias } : {}),
                  });
                }
                if (saldoCajaEntries.length > 0) {
                  await supabase.from("caja_movimientos").insert(saldoCajaEntries);
                }

                // Update monto_pagado on the old venta
                const { data: oldVenta } = await supabase.from("ventas").select("monto_pagado").eq("id", alloc.venta_id).single();
                await supabase.from("ventas").update({
                  monto_pagado: (oldVenta?.monto_pagado || 0) + alloc.aplicar,
                }).eq("id", alloc.venta_id);

                // CC haber entry (reducing saldo)
                saldoActual = Math.max(0, Math.round((saldoActual - alloc.aplicar) * 100) / 100);
                await supabase.from("cuenta_corriente").insert({
                  cliente_id: clienteId, fecha: hoy,
                  comprobante: `Cobro saldo - Pedido #${alloc.numero}`,
                  descripcion: `Cobro parcial/total de deuda anterior`,
                  debe: 0, haber: alloc.aplicar, saldo: saldoActual,
                  forma_pago: result.metodo, venta_id: alloc.venta_id,
                });
              }

              // Update client saldo
              await supabase.from("clientes").update({ saldo: saldoActual }).eq("id", clienteId);
              setClienteSaldo(saldoActual);
            }

            // 6. Update local state
            const updatedPedido = {
              ...selectedPedido,
              metodo_pago: result.metodo.toLowerCase(),
              monto_efectivo: montoEfectivo,
              monto_transferencia: montoTransferencia,
              recargo_transferencia: result.surcharge,
              cuenta_bancaria_alias: cuentaAlias,
              total: montoEfectivo + montoTransferencia + montoCuentaCorriente,
            };
            setSelectedPedido(updatedPedido);
            setDetailPayments(buildPaymentsFromPedido(updatedPedido));

            showAdminToast("Cobro registrado correctamente", "success");
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
