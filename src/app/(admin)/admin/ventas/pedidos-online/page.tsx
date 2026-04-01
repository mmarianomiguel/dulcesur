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
  items: PedidoItem[];
  // Enriched fields
  ventaId?: string;
  clienteId?: string;
}

interface ProductoSearch {
  id: string;
  codigo: string;
  nombre: string;
  precio: number;
  unidad_medida?: string;
}

interface PaymentEntry {
  metodo: string;
  monto: number;
  cuenta_bancaria?: string | null;
}

interface NCDetail {
  numero: number;
  total: number;
  items: { descripcion: string; cantidad: number; precio_unitario: number; subtotal: number }[];
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

  // Payment registration (cobro)
  const [cobroOpen, setCobroOpen] = useState(false);
  const [cobroMetodo, setCobroMetodo] = useState("Efectivo");
  const [cobroEfectivo, setCobroEfectivo] = useState("");
  const [cobroTransferencia, setCobroTransferencia] = useState("");
  const [cobroCuenta, setCobroCuenta] = useState("");
  const [cuentasBancarias, setCuentasBancarias] = useState<{ id: string; nombre: string; alias: string }[]>([]);
  const [recargoTransferencia, setRecargoTransferencia] = useState(0);
  const [cobroSaving, setCobroSaving] = useState(false);

  // Print
  const [printOpen, setPrintOpen] = useState(false);
  const [printSale, setPrintSale] = useState<ReceiptSale | null>(null);
  const [receiptConfig, setReceiptConfig] = useState<ReceiptConfig>(defaultReceiptConfig);

  // Add product
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<ProductoSearch[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);

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

    // Fetch items for all pedidos
    const ids = data.map((p: any) => p.id);
    const { data: allItems } = await supabase
      .from("pedido_tienda_items")
      .select("*")
      .in("pedido_id", ids);

    // Fetch linked ventas to get UPP and ventaId
    const numeros = data.map((p: any) => p.numero);
    const { data: ventas } = await supabase
      .from("ventas")
      .select("id, numero, cliente_id")
      .in("numero", numeros);
    const ventaMap: Record<string, { id: string; cliente_id: string }> = {};
    for (const v of ventas || []) ventaMap[v.numero] = { id: v.id, cliente_id: v.cliente_id };
    const ventaIds = Object.values(ventaMap).map(v => v.id);

    let uppByProducto: Record<string, number> = {};
    if (ventaIds.length > 0) {
      const { data: vitems } = await supabase
        .from("venta_items")
        .select("producto_id, presentacion, unidades_por_presentacion")
        .in("venta_id", ventaIds);
      for (const vi of vitems || []) {
        if (vi.producto_id && vi.unidades_por_presentacion) {
          const key = `${vi.producto_id}_${vi.presentacion || ""}`;
          uppByProducto[key] = vi.unidades_por_presentacion;
        }
      }
    }

    const itemsByPedido: Record<number, PedidoItem[]> = {};
    (allItems || []).forEach((item: any) => {
      if (!itemsByPedido[item.pedido_id]) itemsByPedido[item.pedido_id] = [];
      const key = `${item.producto_id}_${item.presentacion || ""}`;
      const upp = uppByProducto[key] || getUPP(item.presentacion || "");
      itemsByPedido[item.pedido_id].push({ ...item, unidades_por_presentacion: upp });
    });

    setPedidos(data.map((p: any) => ({
      ...p,
      estado: (p.estado || "pendiente").toLowerCase(),
      items: itemsByPedido[p.id] || [],
      ventaId: ventaMap[p.numero]?.id || undefined,
      clienteId: ventaMap[p.numero]?.cliente_id || undefined,
    })));
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

  // Load payment info and NCs for a pedido
  const loadPaymentInfo = async (pedido: Pedido) => {
    if (!pedido.ventaId) {
      setDetailPayments([]);
      setDetailNCs([]);
      return;
    }
    const [{ data: movs }, { data: ccRows }, { data: ncRows }] = await Promise.all([
      supabase.from("caja_movimientos").select("metodo_pago, monto, tipo, cuenta_bancaria").eq("referencia_id", pedido.ventaId).eq("referencia_tipo", "venta"),
      supabase.from("cuenta_corriente").select("debe").eq("venta_id", pedido.ventaId).gt("debe", 0),
      supabase.from("ventas").select("numero, total, venta_items(descripcion, cantidad, precio_unitario, subtotal)").eq("remito_origen_id", pedido.ventaId).eq("tipo_comprobante", "NC"),
    ]);

    const payments: PaymentEntry[] = [];
    for (const m of movs || []) {
      if (m.tipo === "ingreso" && m.monto > 0) {
        payments.push({ metodo: m.metodo_pago, monto: m.monto, cuenta_bancaria: (m as any).cuenta_bancaria });
      }
    }
    const ccTotal = (ccRows || []).reduce((a: number, r: any) => a + (r.debe || 0), 0);
    if (ccTotal > 0) payments.push({ metodo: "Cuenta Corriente", monto: ccTotal });

    // If no payments found, fallback to pedido.metodo_pago
    if (payments.length === 0 && pedido.total > 0) {
      payments.push({ metodo: pedido.metodo_pago || "Pendiente de cobro", monto: pedido.total });
    }

    setDetailPayments(payments);

    // NCs
    const ncs: NCDetail[] = (ncRows || []).map((nc: any) => ({
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

  // Open detail
  const openDetail = async (pedido: Pedido) => {
    setSelectedPedido(pedido);
    setEditItems(pedido.items.map((i) => ({ ...i })));
    setHasChanges(false);
    setDetailPayments([]);
    setDetailNCs([]);
    setDetailOpen(true);
    loadPaymentInfo(pedido);
  };

  // Update item quantity
  const updateItemQty = (index: number, qty: number) => {
    if (qty <= 0) return;
    setEditItems((prev) => prev.map((item, i) =>
      i === index ? { ...item, cantidad: qty, subtotal: qty * item.precio_unitario } : item
    ));
    setHasChanges(true);
  };

  // Remove item
  const removeItem = (index: number) => {
    if (editItems.length <= 1) return;
    setEditItems((prev) => prev.filter((_, i) => i !== index));
    setHasChanges(true);
  };

  // Search products to add
  const searchProducts = async (query: string) => {
    setProductSearch(query);
    if (query.length < 2) { setProductResults([]); return; }
    setSearchingProducts(true);
    const { data } = await supabase
      .from("productos")
      .select("id, codigo, nombre, precio, unidad_medida")
      .eq("activo", true)
      .or(`nombre.ilike.%${query}%,codigo.ilike.%${query}%`)
      .limit(10);
    setProductResults((data || []) as ProductoSearch[]);
    setSearchingProducts(false);
  };

  // Add product to pedido
  const addProduct = (product: ProductoSearch) => {
    const existing = editItems.findIndex((i) => i.producto_id === product.id);
    if (existing >= 0) {
      updateItemQty(existing, editItems[existing].cantidad + 1);
    } else {
      setEditItems((prev) => [...prev, {
        producto_id: product.id,
        nombre: product.nombre,
        presentacion: product.unidad_medida || "Unidad",
        cantidad: 1,
        precio_unitario: product.precio,
        subtotal: product.precio,
        unidades_por_presentacion: 1,
      }]);
      setHasChanges(true);
    }
    setAddProductOpen(false);
    setProductSearch("");
    setProductResults([]);
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
              descripcion: `${item.nombre} (${item.presentacion})`,
              cantidad: item.cantidad, precio_unitario: item.precio_unitario,
              subtotal: item.precio_unitario * item.cantidad, unidad_medida: "Un",
              presentacion: item.presentacion, unidades_por_presentacion: item.unidades_por_presentacion || 1,
            }))
          );

          if (Math.abs(diferencia) > 0.01) {
            const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
            const hora = nowTimeARG();
            const { data: cajaRows } = await supabase.from("caja_movimientos").select("metodo_pago, cuenta_bancaria").eq("referencia_id", venta.id).eq("referencia_tipo", "venta").limit(1);
            const metodoPago = cajaRows?.[0]?.metodo_pago || venta.forma_pago || "Efectivo";
            const cuentaBancaria = (cajaRows?.[0] as any)?.cuenta_bancaria || null;
            await supabase.from("caja_movimientos").insert({
              fecha: hoy, hora, tipo: diferencia > 0 ? "ingreso" : "egreso",
              descripcion: `Ajuste por edición Pedido Web #${selectedPedido.numero} (${diferencia > 0 ? "+" : ""}${formatCurrency(diferencia)})`,
              metodo_pago: metodoPago, monto: Math.abs(diferencia),
              referencia_id: venta.id, referencia_tipo: diferencia > 0 ? "venta" : "ajuste_edicion",
              cuenta_bancaria: cuentaBancaria,
            });

            if (venta.cliente_id) {
              const { data: ccRows } = await supabase.from("cuenta_corriente").select("id").eq("venta_id", venta.id).limit(1);
              if (ccRows && ccRows.length > 0) {
                const { data: clienteData } = await supabase.from("clientes").select("saldo").eq("id", venta.cliente_id).single();
                const saldoActual = clienteData?.saldo || 0;
                const nuevoSaldo = saldoActual + diferencia;
                await supabase.from("cuenta_corriente").insert({
                  cliente_id: venta.cliente_id, fecha: hoy, comprobante: `Edición Pedido Web #${selectedPedido.numero}`,
                  descripcion: "Ajuste por edición de pedido",
                  debe: diferencia > 0 ? diferencia : 0, haber: diferencia < 0 ? Math.abs(diferencia) : 0,
                  saldo: nuevoSaldo, forma_pago: "Ajuste", venta_id: venta.id,
                });
                await supabase.from("clientes").update({ saldo: nuevoSaldo }).eq("id", venta.cliente_id);
              }
            }
          }
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

  // Register payment (cobro)
  const handleRegistrarPago = async () => {
    if (!selectedPedido || !selectedPedido.ventaId) return;
    setCobroSaving(true);

    try {
      const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
      const hora = nowTimeARG();
      const ventaId = selectedPedido.ventaId;
      const monto = selectedPedido.total;

      const entries: any[] = [];
      let formaPago = cobroMetodo;
      let totalConRecargo = monto;

      if (cobroMetodo === "Mixto") {
        const efvo = Number(cobroEfectivo) || 0;
        const transf = Number(cobroTransferencia) || 0;
        const surcharge = recargoTransferencia > 0 ? Math.round(transf * recargoTransferencia / 100) : 0;
        if (efvo > 0) entries.push({ fecha: hoy, hora, tipo: "ingreso", descripcion: `Cobro #${selectedPedido.numero} (Efectivo)`, metodo_pago: "Efectivo", monto: efvo, referencia_id: ventaId, referencia_tipo: "venta" });
        if (transf > 0) entries.push({ fecha: hoy, hora, tipo: "ingreso", descripcion: `Cobro #${selectedPedido.numero} (Transferencia${surcharge > 0 ? ` +${recargoTransferencia}%` : ""})`, metodo_pago: "Transferencia", monto: transf + surcharge, referencia_id: ventaId, referencia_tipo: "venta", ...(cobroCuenta ? { cuenta_bancaria: cobroCuenta } : {}) });
        totalConRecargo = efvo + transf + surcharge;
        formaPago = "Mixto";
      } else if (cobroMetodo === "Transferencia") {
        const surcharge = recargoTransferencia > 0 ? Math.round(monto * recargoTransferencia / 100) : 0;
        entries.push({ fecha: hoy, hora, tipo: "ingreso", descripcion: `Cobro #${selectedPedido.numero}${surcharge > 0 ? ` (Transf +${recargoTransferencia}%)` : ""}`, metodo_pago: "Transferencia", monto: monto + surcharge, referencia_id: ventaId, referencia_tipo: "venta", ...(cobroCuenta ? { cuenta_bancaria: cobroCuenta } : {}) });
        totalConRecargo = monto + surcharge;
      } else if (cobroMetodo === "Cuenta Corriente") {
        // Move to cuenta corriente
        formaPago = "Cuenta Corriente";
      } else {
        entries.push({ fecha: hoy, hora, tipo: "ingreso", descripcion: `Cobro #${selectedPedido.numero}`, metodo_pago: "Efectivo", monto, referencia_id: ventaId, referencia_tipo: "venta" });
      }

      // Insert caja entries
      if (entries.length > 0) {
        await supabase.from("caja_movimientos").insert(entries);
      }

      // Update venta
      const ventaUpd: Record<string, unknown> = { forma_pago: formaPago };
      if (totalConRecargo !== monto) ventaUpd.total = totalConRecargo;
      await supabase.from("ventas").update(ventaUpd).eq("id", ventaId);

      // Handle CC
      if (cobroMetodo === "Cuenta Corriente" && selectedPedido.clienteId) {
        const { data: clienteData } = await supabase.from("clientes").select("saldo").eq("id", selectedPedido.clienteId).single();
        const saldoActual = clienteData?.saldo || 0;
        const nuevoSaldo = saldoActual + monto;
        await supabase.from("cuenta_corriente").insert({
          cliente_id: selectedPedido.clienteId, fecha: hoy,
          comprobante: `Pedido Web #${selectedPedido.numero}`,
          descripcion: "Pedido online a cuenta corriente",
          debe: monto, haber: 0, saldo: nuevoSaldo,
          forma_pago: "Cuenta Corriente", venta_id: ventaId,
        });
        await supabase.from("clientes").update({ saldo: nuevoSaldo }).eq("id", selectedPedido.clienteId);
      }

      showAdminToast("Pago registrado correctamente", "success");
      setCobroOpen(false);
      loadPaymentInfo(selectedPedido);
    } catch (err: any) {
      showAdminToast("Error al registrar pago: " + (err.message || ""), "error");
    } finally {
      setCobroSaving(false);
    }
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

      {/* ═══ DETAIL DIALOG ═══ */}
      <Dialog open={detailOpen} onOpenChange={(open) => {
        if (!open && hasChanges) {
          setConfirmDialog({ open: true, title: "Cambios sin guardar", message: "Tenés cambios sin guardar. ¿Cerrar de todas formas?", onConfirm: () => setDetailOpen(false) });
          return;
        }
        setDetailOpen(open);
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
          {selectedPedido && (() => {
            const est = estadoBadge[selectedPedido.estado] || estadoBadge.pendiente;
            const EstIcon = est.icon;
            const nextStates = estadoFlow[selectedPedido.estado] || [];
            const isEditable = selectedPedido.estado !== "entregado" && selectedPedido.estado !== "cancelado";
            const hasPagos = detailPayments.some(p => p.metodo !== "Pendiente de cobro");

            return (
              <>
                {/* Header */}
                <div className="px-6 py-4 border-b bg-muted/30">
                  <DialogHeader className="p-0 space-y-0">
                    <div className="flex items-center justify-between">
                      <DialogTitle className="text-lg font-semibold flex items-center gap-2">
                        <Globe className="w-5 h-5 text-primary" />
                        Pedido #{selectedPedido.numero}
                      </DialogTitle>
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${est.bg} ${est.text}`}>
                        <EstIcon className="w-3.5 h-3.5" />
                        {est.label}
                      </span>
                    </div>
                  </DialogHeader>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(selectedPedido.created_at).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                  {/* Client + Delivery info */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5" /> Cliente
                      </h3>
                      <div className="bg-muted/30 rounded-lg p-3 space-y-1.5 text-sm">
                        <p className="font-medium">{selectedPedido.nombre_cliente}</p>
                        {selectedPedido.email && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Mail className="w-3 h-3" />{selectedPedido.email}</p>}
                        {selectedPedido.telefono && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Phone className="w-3 h-3" />{selectedPedido.telefono}</p>}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Truck className="w-3.5 h-3.5" /> Entrega
                      </h3>
                      <div className="bg-muted/30 rounded-lg p-3 space-y-1.5 text-sm">
                        <p className="flex items-center gap-1.5 font-medium">
                          {selectedPedido.metodo_entrega === "envio" ? (
                            <><Truck className="w-3.5 h-3.5 text-blue-500" /> Envio a domicilio</>
                          ) : (
                            <><Store className="w-3.5 h-3.5 text-green-500" /> Retiro en local</>
                          )}
                        </p>
                        {selectedPedido.direccion_texto && (
                          <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><MapPin className="w-3 h-3 mt-0.5 shrink-0" />{selectedPedido.direccion_texto}</p>
                        )}
                        {selectedPedido.fecha_entrega && (
                          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Calendar className="w-3 h-3" />
                            {new Date(selectedPedido.fecha_entrega + "T12:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {selectedPedido.observacion && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                      <p className="font-medium text-amber-800 text-xs mb-1">Observacion del cliente:</p>
                      <p className="text-amber-700">{selectedPedido.observacion}</p>
                    </div>
                  )}

                  {/* Status actions */}
                  {nextStates.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-muted-foreground">Cambiar estado:</span>
                      {nextStates.map((ns) => {
                        const nsInfo = estadoBadge[ns];
                        const NsIcon = nsInfo?.icon || Package;
                        const isCancel = ns === "cancelado";
                        return (
                          <Button
                            key={ns}
                            variant={isCancel ? "outline" : "default"}
                            size="sm"
                            className={`h-8 text-xs gap-1.5 ${isCancel ? "text-destructive border-destructive/30 hover:bg-destructive/10" : ""}`}
                            onClick={() => {
                              if (isCancel) {
                                setConfirmDialog({
                                  open: true, title: "Cancelar pedido",
                                  message: `¿Cancelar el pedido #${selectedPedido.numero}? Se devolverá el stock.`,
                                  onConfirm: () => {
                                    handleEstadoChange(selectedPedido, ns);
                                    setSelectedPedido({ ...selectedPedido, estado: ns });
                                  },
                                });
                              } else {
                                handleEstadoChange(selectedPedido, ns);
                                setSelectedPedido({ ...selectedPedido, estado: ns });
                              }
                            }}
                          >
                            <NsIcon className="w-3.5 h-3.5" />
                            Marcar como {nsInfo?.label}
                          </Button>
                        );
                      })}
                    </div>
                  )}

                  {/* Items table */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5" /> Productos ({editItems.length})
                      </h3>
                      {isEditable && (
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setAddProductOpen(true)}>
                          <Plus className="w-3 h-3" /> Agregar
                        </Button>
                      )}
                    </div>

                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/30">
                            <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Producto</th>
                            <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground w-28">Presentacion</th>
                            <th className="text-center px-3 py-2 font-medium text-xs text-muted-foreground w-20">Cant.</th>
                            <th className="text-right px-3 py-2 font-medium text-xs text-muted-foreground w-24">Precio</th>
                            <th className="text-right px-3 py-2 font-medium text-xs text-muted-foreground w-24">Subtotal</th>
                            {isEditable && <th className="w-10"></th>}
                          </tr>
                        </thead>
                        <tbody>
                          {editItems.map((item, idx) => (
                            <tr key={idx} className="border-b last:border-0">
                              <td className="px-3 py-2 font-medium">{item.nombre}</td>
                              <td className="px-3 py-2 text-xs text-muted-foreground">{item.presentacion}</td>
                              <td className="px-3 py-2 text-center">
                                {isEditable ? (
                                  <Input
                                    type="number"
                                    min={0.5}
                                    step={0.5}
                                    value={item.cantidad}
                                    onChange={(e) => updateItemQty(idx, Number(e.target.value))}
                                    className="h-7 w-16 text-center mx-auto"
                                  />
                                ) : (
                                  <span>{item.unidades_por_presentacion < 1 ? item.cantidad * item.unidades_por_presentacion : item.cantidad}</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right">{formatCurrency(item.precio_unitario)}</td>
                              <td className="px-3 py-2 text-right font-semibold">{formatCurrency(item.precio_unitario * item.cantidad)}</td>
                              {isEditable && (
                                <td className="px-2 py-2">
                                  <button onClick={() => removeItem(idx)} className="text-muted-foreground hover:text-destructive disabled:opacity-30" disabled={editItems.length <= 1} title="Quitar producto">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Totals */}
                    <div className="mt-3 space-y-1 text-sm text-right">
                      <p className="text-muted-foreground">Subtotal: <span className="font-medium text-foreground">{formatCurrency(editItems.reduce((s, i) => s + i.precio_unitario * i.cantidad, 0))}</span></p>
                      {(selectedPedido.costo_envio || 0) > 0 && (
                        <p className="text-muted-foreground">Envio: <span className="font-medium text-foreground">{formatCurrency(selectedPedido.costo_envio)}</span></p>
                      )}
                      <p className="text-base font-bold">Total: {formatCurrency(editItems.reduce((s, i) => s + i.precio_unitario * i.cantidad, 0) + (selectedPedido.costo_envio || 0))}</p>
                    </div>
                  </div>

                  {/* Payment detail */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5" /> Detalle de pago
                      </h3>
                      {!hasPagos && isEditable && (
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => { setCobroMetodo("Efectivo"); setCobroEfectivo(""); setCobroTransferencia(""); setCobroCuenta(""); setCobroOpen(true); }}>
                          <Banknote className="w-3 h-3" /> Registrar cobro
                        </Button>
                      )}
                    </div>
                    <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                      {detailPayments.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Cargando...</p>
                      ) : (
                        detailPayments.map((p, i) => (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              {p.metodo === "Efectivo" && <Banknote className="w-3.5 h-3.5 text-green-600" />}
                              {p.metodo === "Transferencia" && <Landmark className="w-3.5 h-3.5 text-blue-600" />}
                              {p.metodo === "Cuenta Corriente" && <FileText className="w-3.5 h-3.5 text-orange-600" />}
                              {!["Efectivo", "Transferencia", "Cuenta Corriente"].includes(p.metodo) && <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />}
                              <span>{p.metodo}</span>
                              {p.cuenta_bancaria && <span className="text-[10px] text-muted-foreground">({p.cuenta_bancaria})</span>}
                            </div>
                            <span className="font-semibold">{formatCurrency(p.monto)}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Notas de Crédito */}
                  {detailNCs.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-red-600 flex items-center gap-1.5 mb-3">
                        <FileText className="w-3.5 h-3.5" /> Notas de Crédito
                      </h3>
                      <div className="space-y-2">
                        {detailNCs.map((nc, i) => (
                          <div key={i} className="border border-red-200 bg-red-50/50 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-semibold text-red-700">NC #{nc.numero}</span>
                              <span className="text-sm font-bold text-red-700">-{formatCurrency(nc.total)}</span>
                            </div>
                            {nc.items.map((item, j) => (
                              <div key={j} className="flex justify-between text-xs text-red-600 pl-2">
                                <span>{item.cantidad} × {item.descripcion}</span>
                                <span>-{formatCurrency(item.subtotal)}</span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-3 border-t bg-muted/30">
                  <div className="flex items-center gap-2">
                    {hasChanges && (
                      <p className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Cambios sin guardar</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handlePrint(selectedPedido)}>
                      <Printer className="w-3.5 h-3.5" /> Imprimir
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => {
                      if (hasChanges) {
                        setConfirmDialog({ open: true, title: "Cambios sin guardar", message: "Tenés cambios sin guardar. ¿Cerrar de todas formas?", onConfirm: () => setDetailOpen(false) });
                        return;
                      }
                      setDetailOpen(false);
                    }}>Cerrar</Button>
                    {hasChanges && (
                      <Button size="sm" onClick={handleSave} disabled={saving}>
                        {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                        Guardar
                      </Button>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ═══ COBRO DIALOG ═══ */}
      <Dialog open={cobroOpen} onOpenChange={setCobroOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Banknote className="w-5 h-5 text-primary" /> Registrar cobro
            </DialogTitle>
          </DialogHeader>
          {selectedPedido && (
            <div className="space-y-4">
              <div className="bg-muted/30 rounded-lg p-3 flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Total a cobrar</span>
                <span className="text-lg font-bold">{formatCurrency(selectedPedido.total)}</span>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Método de pago</Label>
                <Select value={cobroMetodo} onValueChange={(v) => v && setCobroMetodo(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Efectivo">Efectivo</SelectItem>
                    <SelectItem value="Transferencia">Transferencia</SelectItem>
                    <SelectItem value="Mixto">Mixto</SelectItem>
                    <SelectItem value="Cuenta Corriente">Cuenta Corriente</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {cobroMetodo === "Mixto" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Efectivo</Label>
                    <Input type="number" placeholder="0" value={cobroEfectivo} onChange={(e) => setCobroEfectivo(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Transferencia</Label>
                    <Input type="number" placeholder="0" value={cobroTransferencia} onChange={(e) => setCobroTransferencia(e.target.value)} />
                  </div>
                </div>
              )}

              {(cobroMetodo === "Transferencia" || cobroMetodo === "Mixto") && (
                <>
                  {recargoTransferencia > 0 && (
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Recargo {recargoTransferencia}% por transferencia
                    </p>
                  )}
                  {cuentasBancarias.length > 0 && (
                    <div className="space-y-1">
                      <Label className="text-xs">Cuenta bancaria</Label>
                      <Select value={cobroCuenta} onValueChange={(v) => v && setCobroCuenta(v)}>
                        <SelectTrigger><SelectValue placeholder="Seleccionar cuenta..." /></SelectTrigger>
                        <SelectContent>
                          {cuentasBancarias.map((c) => (
                            <SelectItem key={c.id} value={c.alias || c.nombre}>{c.nombre}{c.alias ? ` (${c.alias})` : ""}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </>
              )}

              <Button className="w-full" onClick={handleRegistrarPago} disabled={cobroSaving}>
                {cobroSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                Confirmar cobro
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══ ADD PRODUCT DIALOG ═══ */}
      <Dialog open={addProductOpen} onOpenChange={setAddProductOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2"><Plus className="w-4 h-4" /> Agregar producto</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar por nombre o codigo..." value={productSearch} onChange={(e) => searchProducts(e.target.value)} className="pl-9" autoFocus />
            </div>
            {searchingProducts && <div className="text-center py-4"><Loader2 className="w-4 h-4 animate-spin mx-auto" /></div>}
            {productResults.length > 0 && (
              <div className="border rounded-lg max-h-60 overflow-y-auto">
                {productResults.map((p) => (
                  <button key={p.id} onClick={() => addProduct(p)} className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors border-b last:border-0 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{p.nombre}</p>
                      <p className="text-xs text-muted-foreground">{p.codigo}</p>
                    </div>
                    <span className="text-sm font-semibold">{formatCurrency(p.precio)}</span>
                  </button>
                ))}
              </div>
            )}
            {productSearch.length >= 2 && !searchingProducts && productResults.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No se encontraron productos</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

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
