"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { norm } from "@/lib/utils";
import { todayARG, nowTimeARG, formatCurrency, formatDatePDF, currentMonthPadded } from "@/lib/formatters";
import { logAudit } from "@/lib/audit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  FileText,
  Download,
  Loader2,
  Eye,
  DollarSign,
  Receipt,
  Printer,
  Truck,
  CheckCircle,
  Filter,
  Ban,
  AlertTriangle,
  Store,
  ShoppingCart,
  Package,
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Clock,
  Plus,
  X,
  Trash2,
  Save,
  Globe,
  MoreHorizontal,
  Pencil,
  ArrowLeftRight,
  Shuffle,
  BookOpen,
  PrinterCheck,
} from "lucide-react";
import Link from "next/link";
import { defaultReceiptConfig } from "@/components/receipt-print-view";
import type { ReceiptConfig, ReceiptLineItem, ReceiptSale } from "@/components/receipt-print-view";
import { PrintPreviewDialog } from "@/components/print-preview-dialog";
import { useCurrentUser } from "@/hooks/use-current-user";
import { CobroVentaSection } from "@/components/cobro-venta-section";
import type { CobroVentaResult } from "@/components/cobro-venta-section";

// ─── Historial types ───
interface ClienteInfo {
  id: string;
  nombre: string;
  cuit: string | null;
  tipo_factura?: string;
  domicilio?: string | null;
  telefono?: string | null;
  email?: string | null;
  situacion_iva?: string;
  localidad?: string | null;
  provincia?: string | null;
  codigo_postal?: string | null;
  numero_documento?: string | null;
}

interface VentaRow {
  id: string;
  numero: string;
  tipo_comprobante: string;
  fecha: string;
  created_at: string;
  forma_pago: string;
  moneda: string;
  subtotal: number;
  descuento_porcentaje: number;
  recargo_porcentaje: number;
  total: number;
  estado: string;
  observacion: string | null;
  entregado: boolean;
  facturado: boolean;
  cliente_id: string | null;
  vendedor_id: string | null;
  origen: string | null;
  metodo_entrega: string | null;
  clientes: ClienteInfo | null;
}

interface VentaItemRow {
  id: string;
  producto_id: string | null;
  codigo: string;
  descripcion: string;
  cantidad: number;
  unidad_medida: string | null;
  precio_unitario: number;
  descuento: number;
  subtotal: number;
  presentacion?: string;
  unidades_por_presentacion?: number;
}

// ─── Pedidos Online types ───
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
  codigo?: string;
  descuento?: number;
  costo_unitario?: number;
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
  // Unified detail fields (populated from historial)
  _source?: "historial" | "pedidos";
  _ventaId?: string;
  _clienteId?: string | null;
  _entregado?: boolean;
  _tipo_comprobante?: string;
  _descuento_porcentaje?: number;
  _recargo_porcentaje?: number;
  _vendedor?: string;
  _cuit?: string;
  _domicilio?: string;
  _comboIds?: Set<string>;
  isOnline?: boolean;
  forma_pago?: string;
}

interface ProductoSearch {
  id: string;
  codigo: string;
  nombre: string;
  precio: number;
  costo?: number;
  unidad_medida?: string;
  es_combo?: boolean;
  imagen_url?: string;
  stock?: number;
  presentaciones?: { nombre: string; precio: number; unidades_por_presentacion: number }[];
}

// ─── Helpers ───

const estadoBadge: Record<string, { bg: string; text: string; label: string }> = {
  pendiente: { bg: "bg-amber-50 border-amber-200", text: "text-amber-700", label: "Pendiente" },
  armado: { bg: "bg-violet-50 border-violet-200", text: "text-violet-700", label: "Armado" },
  confirmado: { bg: "bg-blue-50 border-blue-200", text: "text-blue-700", label: "Confirmado" },
  entregado: { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", label: "Entregado" },
  cancelado: { bg: "bg-red-50 border-red-200", text: "text-red-700", label: "Cancelado" },
  cerrada: { bg: "bg-gray-50 border-gray-200", text: "text-gray-700", label: "Completado" },
};

export default function ListadoVentasPage() {
  const currentUser = useCurrentUser();
  // ─── Unified source filter ───
  const [filterSource, setFilterSource] = useState<"todos" | "pos" | "online">("todos");
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void }>({ open: false, title: "", message: "", onConfirm: () => {} });
  const [entregarDialog, setEntregarDialog] = useState<{ open: boolean; order: Pedido | null }>({ open: false, order: null });

  // ══════════════════════════════════════════════════════════════
  // HISTORIAL DE VENTAS STATE
  // ══════════════════════════════════════════════════════════════
  const [ventas, setVentas] = useState<VentaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterOrigen, setFilterOrigen] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterPayment, setFilterPayment] = useState("all");
  const [quickPeriod, setQuickPeriod] = useState<"today" | "week" | "month" | "custom">("today");
  const [filterMode, setFilterMode] = useState<"day" | "month" | "range" | "all">("range");
  const [filterDay, setFilterDay] = useState(todayARG());
  const [filterMonth, setFilterMonth] = useState(currentMonthPadded());
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()));
  const [filterFrom, setFilterFrom] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; });
  const [filterTo, setFilterTo] = useState(todayARG());
  const [searchClient, setSearchClient] = useState(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("buscar") || "";
    }
    return "";
  });
  const [showFilters, setShowFilters] = useState(false);
  const [visiblePage, setVisiblePage] = useState(1);
  const PAGE_SIZE = 50;

  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Anulacion
  const [anularVenta, setAnularVenta] = useState<VentaRow | null>(null);
  const [anularMotivo, setAnularMotivo] = useState("");
  const [anulando, setAnulando] = useState(false);

  // Printed tracking
  const [printedPedidos, setPrintedPedidos] = useState<Set<string>>(new Set());

  // Print
  const [vendedores, setVendedores] = useState<{ id: string; nombre: string }[]>([]);
  const [receiptConfig, setReceiptConfig] = useState(defaultReceiptConfig);
  const [printVenta, setPrintVenta] = useState<VentaRow | null>(null);
  const [printItems, setPrintItems] = useState<VentaItemRow[]>([]);
  const [printLineItems, setPrintLineItems] = useState<ReceiptLineItem[]>([]);
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const [printSaleObj, setPrintSaleObj] = useState<ReceiptSale | null>(null);
  const [printClienteSaldo, setPrintClienteSaldo] = useState(0);
  const [printSaldoAnteriorCC, setPrintSaldoAnteriorCC] = useState(0);
  const [printPagos, setPrintPagos] = useState<{ efectivo: number; transferencia: number; cuentaCorriente: number; recibido: number; vuelto: number }>({ efectivo: 0, transferencia: 0, cuentaCorriente: 0, recibido: 0, vuelto: 0 });

  // ══════════════════════════════════════════════════════════════
  // PEDIDOS ONLINE STATE
  // ══════════════════════════════════════════════════════════════
  const [poPedidos, setPoPedidos] = useState<Pedido[]>([]);
  const [poLoading, setPoLoading] = useState(true);
  const [poFilterEstado, setPoFilterEstado] = useState("todos");
  const [poFilterEntrega, setPoFilterEntrega] = useState("todos");
  const [poSearch, setPoSearch] = useState("");

  // PO Detail/Edit dialog
  const [poDetailOpen, setPoDetailOpen] = useState(false);
  const [poSelectedPedido, setPoSelectedPedido] = useState<Pedido | null>(null);
  const [poEditItems, setPoEditItems] = useState<PedidoItem[]>([]);
  const [poSaving, setPoSaving] = useState(false);
  const [poHasChanges, setPoHasChanges] = useState(false);
  const [cuentasBancarias, setCuentasBancarias] = useState<any[]>([]);
  const [recargoTransferencia, setRecargoTransferencia] = useState(2);
  const [clienteSaldo, setClienteSaldo] = useState(0);
  const [showCuentaSelector, setShowCuentaSelector] = useState(false);
  const [detailPagos, setDetailPagos] = useState<{ metodo: string; monto: number }[]>([]);
  const [detailNCs, setDetailNCs] = useState<{ numero: number; total: number; items: { descripcion: string; cantidad: number; precio_unitario: number; subtotal: number }[] }[]>([]);
  const [editandoPago, setEditandoPago] = useState(false);

  // PO Cancel confirmation
  const [poCancelPedido, setPoCancelPedido] = useState<Pedido | null>(null);
  const [poCancelling, setPoCancelling] = useState(false);

  // PO Add product search
  const [poAddProductOpen, setPoAddProductOpen] = useState(false);
  const [poProductSearch, setPoProductSearch] = useState("");
  const [poProductResults, setPoProductResults] = useState<ProductoSearch[]>([]);
  const [poSearchingProducts, setPoSearchingProducts] = useState(false);
  const [poSearchHighlight, setPoSearchHighlight] = useState(0);

  // ══════════════════════════════════════════════════════════════
  // HISTORIAL LOGIC
  // ══════════════════════════════════════════════════════════════

  const fetchVentas = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("ventas")
      .select("*, created_at, clientes(id, nombre, cuit, tipo_factura, domicilio, telefono, email, situacion_iva, localidad, provincia, codigo_postal, numero_documento)")
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false });

    if (filterOrigen === "pos") query = query.or("origen.eq.pos,origen.is.null");
    else if (filterOrigen === "tienda") query = query.eq("origen", "tienda");
    if (filterType !== "all") query = query.eq("tipo_comprobante", filterType);
    if (filterPayment !== "all") query = query.eq("forma_pago", filterPayment);

    if (quickPeriod === "today") {
      query = query.eq("fecha", todayARG());
    } else if (quickPeriod === "week") {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - diffToMonday);
      const mondayStr = monday.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
      query = query.gte("fecha", mondayStr).lte("fecha", todayARG());
    } else if (quickPeriod === "month") {
      const now = new Date();
      const firstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      query = query.gte("fecha", firstDay).lte("fecha", todayARG());
    } else if (filterMode === "day") {
      query = query.eq("fecha", filterDay);
    } else if (filterMode === "month") {
      const m = filterMonth.padStart(2, "0");
      const start = `${filterYear}-${m}-01`;
      const nextMonth = Number(filterMonth) === 12 ? 1 : Number(filterMonth) + 1;
      const nextYear = Number(filterMonth) === 12 ? Number(filterYear) + 1 : Number(filterYear);
      const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
      query = query.gte("fecha", start).lt("fecha", end);
    } else if (filterMode === "range" && filterFrom && filterTo) {
      query = query.gte("fecha", filterFrom).lte("fecha", filterTo);
    }

    query = query.limit(200);
    const { data } = await query;
    let results = (data as unknown as VentaRow[]) || [];
    setVisiblePage(1);

    // Recover client names for ventas where join returned null but cliente_id exists
    // This can happen due to RLS policies or FK issues
    const missingClientIds = [...new Set(results.filter((v) => v.cliente_id && !v.clientes).map((v) => v.cliente_id!))];
    if (missingClientIds.length > 0) {
      const { data: missingClients } = await supabase
        .from("clientes")
        .select("id, nombre, cuit, tipo_factura, domicilio, telefono, email, situacion_iva, localidad, provincia, codigo_postal, numero_documento")
        .in("id", missingClientIds);
      if (missingClients && missingClients.length > 0) {
        const clientMap = new Map(missingClients.map((c: any) => [c.id, c]));
        results = results.map((v) => {
          if (v.cliente_id && !v.clientes && clientMap.has(v.cliente_id)) {
            return { ...v, clientes: clientMap.get(v.cliente_id)! as ClienteInfo };
          }
          return v;
        });
      }
    }

    if (searchClient) {
      results = results.filter((v) =>
        norm(v.clientes?.nombre || "").includes(norm(searchClient)) ||
        norm(v.numero).includes(norm(searchClient))
      );
    }

    setVentas(results);
    setLoading(false);
  }, [quickPeriod, filterOrigen, filterType, filterPayment, filterMode, filterDay, filterMonth, filterYear, filterFrom, filterTo, searchClient]);

  useEffect(() => { fetchVentas(); }, [fetchVentas]);
  // Fetch all reference data in parallel on mount
  useEffect(() => {
    // Synchronous localStorage reads
    try {
      const stored = localStorage.getItem("receipt_config");
      if (stored) setReceiptConfig((prev) => ({ ...prev, ...JSON.parse(stored) }));
    } catch (err) { console.error("Error loading receipt config:", err); }
    try {
      const printed = localStorage.getItem("printed_pedidos");
      if (printed) setPrintedPedidos(new Set(JSON.parse(printed)));
    } catch {}

    // Parallel Supabase queries for independent reference data
    Promise.all([
      supabase.from("cuentas_bancarias").select("*").eq("activo", true).order("nombre"),
      supabase.from("usuarios").select("id, nombre").eq("activo", true),
      supabase.from("empresa").select("nombre, domicilio, telefono, cuit, situacion_iva").limit(1).single(),
      supabase.from("tienda_config").select("logo_url, url_tienda, recargo_transferencia").limit(1).single(),
    ]).then(([cuentasRes, usuariosRes, empresaRes, tiendaRes]) => {
      if (cuentasRes.error) console.error("Error cargando cuentas bancarias:", cuentasRes.error);
      if (usuariosRes.error) console.error("Error cargando vendedores:", usuariosRes.error);
      setCuentasBancarias(cuentasRes.data || []);
      setVendedores(usuariosRes.data || []);

      const emp = empresaRes.data;
      if (emp) {
        setReceiptConfig((prev) => ({
          ...prev,
          empresaNombre: prev.empresaNombre || emp.nombre || "",
          empresaDomicilio: prev.empresaDomicilio || emp.domicilio || "",
          empresaTelefono: prev.empresaTelefono || emp.telefono || "",
          empresaCuit: prev.empresaCuit || emp.cuit || "",
          empresaIva: prev.empresaIva || emp.situacion_iva || "",
        }));
      }

      const tc = tiendaRes.data;
      if (tc) {
        setReceiptConfig((prev) => ({
          ...prev,
          logoUrl: prev.logoUrl || "https://res.cloudinary.com/dss3lnovd/image/upload/v1774505786/dulcesur/logo-dulcesur-negro.jpg",
          empresaWeb: prev.empresaWeb || tc.url_tienda || "",
        }));
        if (tc.recargo_transferencia > 0) setRecargoTransferencia(tc.recargo_transferencia);
      }
    }).catch((err) => console.error("Error cargando datos de referencia:", err));
  }, []);

  const openDetail = async (v: VentaRow) => {
    const [{ data }, { data: movData }, { data: clienteData }] = await Promise.all([
      supabase.from("venta_items").select("*").eq("venta_id", v.id).order("created_at"),
      supabase.from("caja_movimientos").select("metodo_pago, monto, descripcion").eq("referencia_id", v.id).eq("referencia_tipo", "venta").eq("tipo", "ingreso"),
      v.cliente_id ? supabase.from("clientes").select("saldo").eq("id", v.cliente_id).single() : Promise.resolve({ data: null }),
    ]);
    const vitems = (data as VentaItemRow[]) || [];

    // Build detailPagos from caja_movimientos
    const pagosFromCaja: { metodo: string; monto: number }[] = [];
    for (const m of movData || []) {
      let label = m.metodo_pago;
      if (m.metodo_pago === "Transferencia" && m.descripcion) {
        const match = m.descripcion.match(/\+(\d+(?:\.\d+)?)%/);
        if (match) label = `Transferencia (${match[1]}%)`;
      }
      const existing = pagosFromCaja.find((p) => p.metodo === label);
      if (existing) existing.monto += m.monto;
      else pagosFromCaja.push({ metodo: label, monto: m.monto });
    }
    if (pagosFromCaja.length === 0 && v.forma_pago && v.forma_pago !== "Pendiente" && v.forma_pago !== "Cuenta Corriente") {
      // Fallback: venta was paid but no caja entry (old data) — use monto_pagado
      const montoPagado = (v as any).monto_pagado || 0;
      if (montoPagado > 0) pagosFromCaja.push({ metodo: v.forma_pago, monto: montoPagado });
      else if (v.entregado) pagosFromCaja.push({ metodo: v.forma_pago, monto: v.total });
    }
    setDetailPagos(pagosFromCaja);
    setClienteSaldo((clienteData as any)?.saldo || 0);

    // Check for combos
    const productIds = vitems.map((i) => i.producto_id).filter(Boolean) as string[];
    let comboIds = new Set<string>();
    if (productIds.length > 0) {
      const { data: prods } = await supabase.from("productos").select("id, es_combo").in("id", productIds);
      for (const p of prods || []) { if ((p as any).es_combo) comboIds.add(p.id); }
    }

    // Convert VentaRow → Pedido format for unified dialog
    const estado = v.estado === "anulada" ? "cancelado" : v.entregado ? "entregado" : v.estado || "pendiente";
    const pedidoItems: PedidoItem[] = vitems.map((item) => ({
      producto_id: item.producto_id || "",
      nombre: item.descripcion
        .replace(/\s*[-–]\s*Unidad(\s*\(Unidad\))?$/, "")
        .replace(/\s*\(Unidad\)$/, "")
        .replace(/(\([^)]+\))\s*\1/gi, "$1")
        .replace(/Caja\s*\(?x?0\.5\)?/gi, "Medio Cartón")
        .replace(/(Medio\s*Cart[oó]n)\s*\(?\s*Medio\s*Cart[oó]n\s*\)?/gi, "$1"),
      presentacion: item.presentacion || "Unidad",
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
      subtotal: item.subtotal,
      unidades_por_presentacion: item.unidades_por_presentacion || 1,
      codigo: item.codigo,
      descuento: item.descuento,
    }));

    // For online orders, get data from pedidos_tienda for correct client info
    let ptData: any = null;
    if (v.origen === "tienda" || v.tipo_comprobante === "Pedido Web") {
      const { data: pt } = await supabase.from("pedidos_tienda").select("*").eq("numero", v.numero).maybeSingle();
      if (pt) ptData = pt;
    }

    const pseudoPedido: Pedido = {
      id: ptData?.id || 0,
      numero: v.numero,
      created_at: v.created_at || v.fecha,
      estado,
      nombre_cliente: ptData?.nombre_cliente || v.clientes?.nombre || "Consumidor Final",
      email: ptData?.email || "",
      telefono: ptData?.telefono || v.clientes?.telefono || "",
      metodo_entrega: ptData?.metodo_entrega || v.metodo_entrega || "",
      direccion_texto: ptData?.direccion_texto || v.clientes?.domicilio || null,
      fecha_entrega: null,
      metodo_pago: v.forma_pago,
      subtotal: v.subtotal,
      costo_envio: ptData?.costo_envio || 0,
      total: v.total,
      observacion: v.observacion,
      cliente_auth_id: null,
      items: pedidoItems,
      _source: "historial",
      _ventaId: v.id,
      _clienteId: v.cliente_id,
      _entregado: v.entregado,
      _tipo_comprobante: v.tipo_comprobante,
      _descuento_porcentaje: v.descuento_porcentaje,
      _recargo_porcentaje: v.recargo_porcentaje,
      _vendedor: getVendedorNombre(v.vendedor_id),
      _cuit: v.clientes?.cuit || "",
      _domicilio: v.clientes?.domicilio || "",
      _comboIds: comboIds,
      isOnline: v.origen === "tienda" || v.tipo_comprobante === "Pedido Web",
    };

    setPoSelectedPedido(pseudoPedido);
    setPoEditItems(pedidoItems.map((i) => ({ ...i })));
    setPoHasChanges(false);
    setEditandoPago(false);
    setPoDetailOpen(true);
  };

  const marcarEntregado = async (v: VentaRow) => {
    setActionLoading(v.id);
    await supabase.from("ventas").update({ entregado: true, estado: "entregado" }).eq("id", v.id);
    // Sync to pedidos_tienda so client sees "entregado"
    await supabase.from("pedidos_tienda").update({ estado: "entregado" }).eq("numero", v.numero);
    await fetchVentas();
    await fetchPedidos();
    setActionLoading(null);
  };

  const handleAnular = async () => {
    if (!anularVenta) return;
    if (anularVenta.estado === "anulada") { showAdminToast("Esta venta ya fue anulada", "error"); setAnularVenta(null); return; }
    setAnulando(true);
    const v = anularVenta;
    const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
    const hora = nowTimeARG();
    const motivoTexto = anularMotivo ? ` (${anularMotivo})` : "";
    const errores: string[] = [];

    try {
      // 1. Get venta_items to reverse stock
      const { data: vitems, error: vitemsErr } = await supabase.from("venta_items").select("*").eq("venta_id", v.id);
      if (vitemsErr) throw new Error(`Error obteniendo items: ${vitemsErr.message}`);
      const items = (vitems as VentaItemRow[]) || [];

      // 2. Reverse stock for each item
      for (const item of items) {
        if (!item.producto_id) continue;
        const { data: prod, error: prodErr } = await supabase.from("productos").select("id, stock, es_combo").eq("id", item.producto_id).single();
        if (prodErr || !prod) { errores.push(`Producto ${item.descripcion} no encontrado`); continue; }

        if ((prod as any).es_combo) {
          // Combo: reverse each component
          const { data: comboItems } = await supabase
            .from("combo_items")
            .select("producto_id, cantidad, productos!combo_items_producto_id_fkey(nombre)")
            .eq("combo_id", item.producto_id);
          for (const ci of comboItems || []) {
            const { data: compProd } = await supabase.from("productos").select("id, stock").eq("id", (ci as any).producto_id).single();
            if (!compProd) { errores.push(`Componente combo no encontrado`); continue; }
            const unitsToRestore = item.cantidad * (ci as any).cantidad;
            const newStock = compProd.stock + unitsToRestore;
            const { error: updErr } = await supabase.from("productos").update({ stock: newStock }).eq("id", (ci as any).producto_id);
            if (updErr) { errores.push(`Error stock combo: ${updErr.message}`); continue; }
            await supabase.from("stock_movimientos").insert({
              producto_id: (ci as any).producto_id,
              tipo: "anulacion",
              cantidad_antes: compProd.stock,
              cantidad_despues: newStock,
              cantidad: unitsToRestore,
              referencia: `Anulación Venta #${v.numero}`,
              descripcion: `Anulación venta - ${(ci as any).productos?.nombre || item.descripcion}${motivoTexto}`,
              usuario: currentUser?.nombre || "Admin Sistema",
              orden_id: v.id,
            });
          }
        } else {
          // Regular product - fallback: parse units from presentacion name if unidades_por_presentacion is wrong
          let upp = item.unidades_por_presentacion || 1;
          if (upp === 1 && item.presentacion && item.presentacion !== "Unidad") {
            const match = item.presentacion.toLowerCase().match(/x\s*(\d+)/);
            if (match) upp = Number(match[1]);
          }
          const unitsToRestore = item.cantidad * upp;
          const newStock = prod.stock + unitsToRestore;
          const { error: updErr } = await supabase.from("productos").update({ stock: newStock }).eq("id", item.producto_id);
          if (updErr) { errores.push(`Error stock ${item.descripcion}: ${updErr.message}`); continue; }
          await supabase.from("stock_movimientos").insert({
            producto_id: item.producto_id,
            tipo: "anulacion",
            cantidad_antes: prod.stock,
            cantidad_despues: newStock,
            cantidad: unitsToRestore,
            referencia: `Anulación Venta #${v.numero}`,
            descripcion: `Anulación venta - ${item.descripcion}${motivoTexto}`,
            usuario: currentUser?.nombre || "Admin Sistema",
            orden_id: v.id,
          });
        }
      }

      // 3. Reverse caja_movimientos
      const { data: cajaRows } = await supabase
        .from("caja_movimientos")
        .select("*")
        .eq("referencia_id", v.id)
        .eq("referencia_tipo", "venta");
      for (const cm of cajaRows || []) {
        const { error: cajaErr } = await supabase.from("caja_movimientos").insert({
          fecha: hoy, hora,
          tipo: "cancelacion",
          descripcion: `Cancelación Venta #${v.numero}${motivoTexto}`,
          metodo_pago: (cm as any).metodo_pago,
          monto: (cm as any).monto,
          referencia_id: v.id,
          referencia_tipo: "anulacion",
          cuenta_bancaria: (cm as any).cuenta_bancaria || null,
        });
        if (cajaErr) errores.push(`Error caja: ${cajaErr.message}`);
      }

      // 4. Reverse cuenta_corriente entries and update client saldo via atomic RPC
      if (v.cliente_id) {
        const { data: ccRows } = await supabase
          .from("cuenta_corriente")
          .select("*")
          .eq("venta_id", v.id);
        if (ccRows && ccRows.length > 0) {
          // Calculate total saldo change from reversing all CC entries
          const totalChange = ccRows.reduce((acc, cc) => acc - (cc as any).debe + (cc as any).haber, 0);

          // Atomic saldo update via RPC
          const { data: nuevoSaldo, error: saldoErr } = await supabase.rpc("atomic_update_client_saldo", {
            p_client_id: v.cliente_id,
            p_change: totalChange,
          });
          if (saldoErr) { errores.push(`Error actualizando saldo: ${saldoErr.message}`); }

          // Insert reversal CC entries with the new running saldo
          let saldoRunning = nuevoSaldo ?? 0;
          for (let i = ccRows.length - 1; i >= 0; i--) {
            const cc = ccRows[i];
            await supabase.from("cuenta_corriente").insert({
              cliente_id: v.cliente_id,
              fecha: hoy,
              comprobante: `Anulación Venta #${v.numero}`,
              descripcion: `Anulación de venta${motivoTexto}`,
              debe: (cc as any).haber,
              haber: (cc as any).debe,
              saldo: saldoRunning,
              forma_pago: "Anulación",
              venta_id: v.id,
            });
          }
        }
      }

      // 5. If critical stock errors occurred, abort anulación
      if (errores.length > 0) {
        throw new Error(`No se pudo restaurar stock: ${errores.join(". ")}. Venta NO anulada.`);
      }

      // 6. Mark venta as anulada
      const { error: anularErr } = await supabase.from("ventas").update({
        estado: "anulada",
        observacion: v.observacion
          ? `${v.observacion} | ANULADA${motivoTexto}`
          : `ANULADA${motivoTexto}`,
      }).eq("id", v.id);
      if (anularErr) throw new Error(`Error marcando como anulada: ${anularErr.message}`);

      // 7. Sync to pedidos_tienda so client sees "cancelado"
      await supabase.from("pedidos_tienda").update({ estado: "cancelado" }).eq("numero", v.numero);

      // 8. Create cancelacion caja_movimiento if original sale was paid (not Pendiente/CC)
      //    and no caja_movimientos existed to reverse in step 3
      if (
        v.forma_pago !== "Pendiente" &&
        v.forma_pago !== "Cuenta Corriente" &&
        (!cajaRows || cajaRows.length === 0)
      ) {
        await supabase.from("caja_movimientos").insert({
          fecha: hoy,
          hora,
          tipo: "cancelacion",
          descripcion: `Anulación Venta #${v.numero}${motivoTexto}`,
          metodo_pago: v.forma_pago,
          monto: v.total,
          referencia_id: v.id,
          referencia_tipo: "anulacion",
        });
      }

      logAudit({
        userName: currentUser?.nombre || "Admin Sistema",
        action: "ANULACION",
        module: "ventas",
        entityId: v.id,
        before: { numero: v.numero, total: v.total, estado: v.estado },
        after: { estado: "anulada", motivo: anularMotivo },
      });

      showAdminToast("Venta anulada correctamente", "success");
      setAnularVenta(null);
      setAnularMotivo("");
      await fetchVentas();
      await fetchPedidos();
    } catch (err: any) {
      showAdminToast(`Error al anular: ${err?.message || String(err)}`, "error");
    } finally {
      setAnulando(false);
    }
  };

  const getVendedorNombre = (id: string | null) => {
    if (!id) return "—";
    return vendedores.find((v) => v.id === id)?.nombre || "—";
  };

  // ─── Print ───
  const preparePrint = async (v: VentaRow) => {
    const { data } = await supabase.from("venta_items").select("*").eq("venta_id", v.id).order("created_at");
    const items = (data as VentaItemRow[]) || [];
    // Always use current client saldo for reprints (reflects latest cobranzas)
    let saldo = 0;
    let saldoAnteriorCC = 0;
    if (v.cliente_id) {
      const { data: cd } = await supabase.from("clientes").select("saldo").eq("id", v.cliente_id).single();
      saldo = cd?.saldo || 0;
      // saldoAnteriorCC not applicable for reprints — just show current state
      saldoAnteriorCC = 0;
    }

    // Load combo data for combo products
    const productIds = items.map((i) => i.producto_id).filter(Boolean) as string[];
    const comboItemsMap: Record<string, { nombre: string; cantidad: number }[]> = {};
    const comboIds = new Set<string>();
    if (productIds.length > 0) {
      const { data: prods } = await supabase.from("productos").select("id, es_combo").in("id", productIds);
      for (const p of prods || []) {
        if ((p as any).es_combo) comboIds.add(p.id);
      }
      for (const comboId of comboIds) {
        const { data: ciData } = await supabase
          .from("combo_items")
          .select("cantidad, productos!combo_items_producto_id_fkey(nombre)")
          .eq("combo_id", comboId);
        comboItemsMap[comboId] = (ciData || []).map((ci: any) => ({ nombre: ci.productos?.nombre || "", cantidad: ci.cantidad }));
      }
    }

    const lineItems: ReceiptLineItem[] = items.map((item) => ({
      id: item.id,
      producto_id: item.producto_id || "",
      code: item.codigo,
      description: item.descripcion,
      qty: item.cantidad,
      unit: item.unidad_medida || "Un",
      price: item.precio_unitario,
      discount: item.descuento,
      subtotal: item.subtotal,
      presentacion: (item as any).presentacion || "",
      unidades_por_presentacion: (item as any).unidades_por_presentacion ?? 1,
      stock: 0,
      es_combo: comboIds.has(item.producto_id || ""),
      comboItems: comboItemsMap[item.producto_id || ""] || [],
    }));

    // Load payment breakdown from caja_movimientos
    const { data: movs } = await supabase.from("caja_movimientos").select("metodo_pago, monto, tipo").eq("referencia_id", v.id).eq("referencia_tipo", "venta");
    let pagoEf = 0, pagoTr = 0, pagoCC = 0;
    for (const m of movs || []) {
      if (m.tipo === "ingreso") {
        if (m.metodo_pago === "Efectivo") pagoEf += m.monto;
        else if (m.metodo_pago === "Transferencia") pagoTr += m.monto;
        else if (m.metodo_pago === "Cuenta Corriente") pagoCC += m.monto;
      }
    }
    if ((movs || []).length === 0) {
      // No movimientos: estimate from forma_pago
      if (v.forma_pago === "Efectivo") pagoEf = v.total;
      else if (v.forma_pago === "Transferencia") pagoTr = v.total;
      else if (v.forma_pago === "Cuenta Corriente") pagoCC = v.total;
      else if (v.forma_pago === "Mixto") { pagoEf = (v as any).monto_efectivo || 0; pagoTr = (v as any).monto_transferencia || 0; }
    }
    // Derive formaPago from actual payments (v.forma_pago may be stale if cobro was just registered)
    let derivedFormaPago: string;
    if ((movs || []).length > 0) {
      if (pagoTr > 0 && pagoEf === 0 && pagoCC === 0) derivedFormaPago = "Transferencia";
      else if (pagoEf > 0 && pagoTr === 0 && pagoCC === 0) derivedFormaPago = "Efectivo";
      else if (pagoCC > 0 && pagoEf === 0 && pagoTr === 0) derivedFormaPago = "Cuenta Corriente";
      else if (pagoTr > 0 || pagoEf > 0) derivedFormaPago = "Mixto";
      else derivedFormaPago = v.forma_pago;
    } else {
      derivedFormaPago = v.forma_pago;
    }
    setPrintPagos({ efectivo: pagoEf, transferencia: pagoTr, cuentaCorriente: pagoCC, recibido: 0, vuelto: 0 });
    setPrintClienteSaldo(saldo);
    setPrintSaldoAnteriorCC(saldoAnteriorCC);
    setPrintVenta(v);
    setPrintItems(items);
    setPrintLineItems(lineItems);
    // Build sale object and show preview
    const vendedorName = getVendedorNombre(v.vendedor_id) === "—" && (v.origen === "tienda" || v.tipo_comprobante?.toLowerCase().includes("web")) ? "Tienda Online" : getVendedorNombre(v.vendedor_id);
    const descAmt = Math.round(v.subtotal * (v.descuento_porcentaje || 0) / 100);
    const recAmt = Math.round((v.subtotal - descAmt) * (v.recargo_porcentaje || 0) / 100);
    const surchargeCalc = Math.max(0, v.total - (v.subtotal - descAmt + recAmt));
    setPrintSaleObj({
      numero: v.numero,
      total: v.total,
      subtotal: v.subtotal,
      descuento: descAmt,
      recargo: recAmt,
      transferSurcharge: surchargeCalc,
      tipoComprobante: v.tipo_comprobante,
      formaPago: derivedFormaPago,
      moneda: v.moneda || "ARS",
      cliente: v.clientes?.nombre || "Consumidor Final",
      clienteDireccion: v.clientes?.domicilio || null,
      clienteTelefono: v.clientes?.telefono || null,
      clienteCondicionIva: v.clientes?.situacion_iva || null,
      metodoEntrega: v.metodo_entrega || null,
      vendedor: vendedorName,
      fecha: formatDatePDF(v.fecha),
      saldoAnterior: saldo, // current saldo at time of reprint
      saldoNuevo: saldo,
      items: lineItems,
      pagoEfectivo: pagoEf || undefined,
      pagoTransferencia: pagoTr || undefined,
      pagoCuentaCorriente: pagoCC || undefined,
    });
    setPrintPreviewOpen(true);
    // NOTE: Payment split (pagoEf/pagoTr/pagoCC) is reconstructed from caja_movimientos
    // and may not sum exactly to v.total if movimientos were manually edited. This is an
    // accepted assumption for receipt reprints — no sum validation is performed.
    // Mark as printed
    try {
      const printed = new Set(printedPedidos);
      printed.add(v.numero);
      const arr = [...printed].slice(-200);
      localStorage.setItem("printed_pedidos", JSON.stringify(arr));
      setPrintedPedidos(new Set(arr));
    } catch {}
  };

  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const rows = ventas.map((v) => ({
      "Número": v.numero,
      "Fecha": v.fecha,
      "Tipo Comprobante": v.tipo_comprobante,
      "Cliente": v.clientes?.nombre || "",
      "Total": v.total,
      "Forma de Pago": v.forma_pago,
      "Estado": v.estado,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 30 }, { wch: 14 }, { wch: 18 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ventas");
    XLSX.writeFile(wb, `Ventas_${filterYear}_${filterMonth}.xlsx`);
  };

  // ─── Historial Derived ───
  const ventasActivas = ventas.filter((v) => v.estado !== "anulada");
  const totalSum = ventasActivas.reduce((a, v) => {
    const isNC = v.tipo_comprobante.includes("Nota de Crédito");
    return a + (isNC ? -v.total : v.total);
  }, 0);
  const pendientesEntrega = ventasActivas.filter((v) => !v.entregado).length;
  const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

  // ══════════════════════════════════════════════════════════════
  // PEDIDOS ONLINE LOGIC
  // ══════════════════════════════════════════════════════════════

  // Compute unidades_por_presentacion from presentation name
  const getUPP = (presentacion: string): number => {
    const lower = (presentacion || "").toLowerCase();
    if (lower.includes("medio")) return 0.5;
    const boxMatch = presentacion.match(/[Cc]aja\s*\(?x?(\d+)\)?/);
    if (boxMatch) return Number(boxMatch[1]);
    return 1;
  };

  const fetchPedidos = useCallback(async () => {
    setPoLoading(true);
    let ptQuery = supabase
      .from("pedidos_tienda")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    // Apply same date filter as ventas
    const todayStr = todayARG();
    if (quickPeriod === "today") {
      ptQuery = ptQuery.gte("created_at", todayStr + "T00:00:00").lte("created_at", todayStr + "T23:59:59");
    } else if (quickPeriod === "week") {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - diffToMonday);
      const mondayStr = monday.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
      ptQuery = ptQuery.gte("created_at", mondayStr + "T00:00:00").lte("created_at", todayStr + "T23:59:59");
    } else if (quickPeriod === "month") {
      const now = new Date();
      const firstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      ptQuery = ptQuery.gte("created_at", firstDay + "T00:00:00").lte("created_at", todayStr + "T23:59:59");
    } else if (filterMode === "day") {
      ptQuery = ptQuery.gte("created_at", filterDay + "T00:00:00").lte("created_at", filterDay + "T23:59:59");
    } else if (filterMode === "month") {
      const m = filterMonth.padStart(2, "0");
      const start = `${filterYear}-${m}-01`;
      const nextMonth = Number(filterMonth) === 12 ? 1 : Number(filterMonth) + 1;
      const nextYear = Number(filterMonth) === 12 ? Number(filterYear) + 1 : Number(filterYear);
      const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
      ptQuery = ptQuery.gte("created_at", start + "T00:00:00").lt("created_at", end + "T00:00:00");
    } else if (filterMode === "range" && filterFrom && filterTo) {
      ptQuery = ptQuery.gte("created_at", filterFrom + "T00:00:00").lte("created_at", filterTo + "T23:59:59");
    }

    const { data } = await ptQuery;

    if (!data) { setPoLoading(false); return; }

    // Fetch items for all pedidos
    const ids = data.map((p: any) => p.id);
    const { data: allItems } = await supabase
      .from("pedido_tienda_items")
      .select("*")
      .in("pedido_id", ids);

    // Also fetch venta_items to get unidades_por_presentacion
    const numeros = data.map((p: any) => p.numero);
    const { data: ventasData } = await supabase
      .from("ventas")
      .select("id, numero")
      .in("numero", numeros);
    const ventaIdMap: Record<string, string> = {};
    for (const v of ventasData || []) ventaIdMap[v.numero] = v.id;
    const ventaIds = Object.values(ventaIdMap);

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
      // Try to get UPP from venta_items, fallback to computing from presentation name
      const key = `${item.producto_id}_${item.presentacion || ""}`;
      const upp = uppByProducto[key] || getUPP(item.presentacion || "");
      itemsByPedido[item.pedido_id].push({ ...item, unidades_por_presentacion: upp });
    });

    setPoPedidos(data.map((p: any) => ({ ...p, items: itemsByPedido[p.id] || [] })));
    setPoLoading(false);
  }, [quickPeriod, filterMode, filterDay, filterMonth, filterYear, filterFrom, filterTo]);

  useEffect(() => { fetchPedidos(); }, [fetchPedidos]);

  // Filter pedidos
  const poFiltered = poPedidos.filter((p) => {
    if (poFilterEstado !== "todos") {
      if (poFilterEstado === "entregado" ? (p.estado !== "entregado" && p.estado !== "cerrada") : p.estado !== poFilterEstado) return false;
    }
    if (poFilterEntrega !== "todos" && p.metodo_entrega !== poFilterEntrega) return false;
    if (poSearch) {
      const q = norm(poSearch);
      if (!norm(p.numero).includes(q) && !norm(p.nombre_cliente).includes(q) && !norm(p.email || "").includes(q)) return false;
    }
    return true;
  });

  // Open PO detail - also find linked venta for print
  const poOpenDetail = async (pedido: Pedido) => {
    let ventaId = pedido._ventaId;
    let items = pedido.items;
    const cId = (pedido as any)._clienteId || (pedido as any).cliente_id;

    // Find linked venta if not already known (serial — unavoidable when missing)
    if (!ventaId && pedido.numero) {
      const { data: linkedVenta } = await supabase.from("ventas").select("id").eq("numero", pedido.numero).single();
      if (linkedVenta) ventaId = linkedVenta.id;
    }

    // Batch ALL remaining queries in parallel to avoid serial round-trips
    const [
      { data: vitems },
      { data: movs },
      { data: ccMovs },
      { data: ncVentas },
      { data: ventaData },
      { data: ptData },
      { data: clienteData },
      { data: cobroItemsData },
    ] = await Promise.all([
      items.length === 0 && ventaId
        ? supabase.from("venta_items").select("*").eq("venta_id", ventaId).order("created_at")
        : Promise.resolve({ data: null, error: null }),
      ventaId
        ? supabase.from("caja_movimientos").select("metodo_pago, monto, tipo, descripcion").eq("referencia_id", ventaId).eq("referencia_tipo", "venta").eq("tipo", "ingreso")
        : Promise.resolve({ data: [], error: null }),
      ventaId
        ? supabase.from("cuenta_corriente").select("debe").eq("venta_id", ventaId)
        : Promise.resolve({ data: [], error: null }),
      ventaId
        ? supabase.from("ventas").select("id, numero, total, venta_items(descripcion, cantidad, precio_unitario, subtotal)").eq("remito_origen_id", ventaId).ilike("tipo_comprobante", "Nota de Crédito%").neq("estado", "anulada")
        : Promise.resolve({ data: [], error: null }),
      ventaId
        ? supabase.from("ventas").select("monto_efectivo, monto_transferencia, monto_pagado, forma_pago, total").eq("id", ventaId).single()
        : Promise.resolve({ data: null, error: null }),
      pedido.numero
        ? supabase.from("pedidos_tienda").select("monto_efectivo, monto_transferencia, metodo_pago, total").eq("numero", pedido.numero).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      cId
        ? supabase.from("clientes").select("saldo").eq("id", cId).single()
        : Promise.resolve({ data: null, error: null }),
      ventaId
        ? supabase.from("cobro_items").select("monto_aplicado, cobros(forma_pago)").eq("venta_id", ventaId)
        : Promise.resolve({ data: [], error: null }),
    ]);

    // Process items
    if (items.length === 0 && vitems) {
      items = vitems.map((item: any) => ({
        producto_id: item.producto_id || "",
        nombre: item.descripcion?.replace(/\s*[-–]\s*Unidad(\s*\(Unidad\))?$/, "").replace(/\s*\(Unidad\)$/, "") || "",
        presentacion: item.presentacion || "Unidad",
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        subtotal: item.subtotal,
        unidades_por_presentacion: item.unidades_por_presentacion || 1,
        codigo: item.codigo,
        descuento: item.descuento,
        costo_unitario: item.costo_unitario || 0,
      }));
    }

    // Build pagos from caja_movimientos + cuenta_corriente + NC refunds
    const pagos: { metodo: string; monto: number }[] = [];
    for (const m of movs || []) {
      let label = m.metodo_pago;
      if (m.metodo_pago === "Transferencia" && m.descripcion) {
        const match = m.descripcion.match(/\+(\d+(?:\.\d+)?)%/);
        if (match) label = `Transferencia (${match[1]}%)`;
      }
      const existing = pagos.find((p) => p.metodo === label);
      if (existing) existing.monto += m.monto;
      else pagos.push({ metodo: label, monto: m.monto });
    }
    const ccTotal = (ccMovs || []).reduce((s: number, c: any) => s + (c.debe || 0), 0);
    if (ccTotal > 0) pagos.push({ metodo: "Cuenta Corriente", monto: ccTotal });
    const ncTotalAmt = (ncVentas || []).reduce((s: number, nc: any) => s + (nc.total || 0), 0);
    if (ncTotalAmt > 0) pagos.push({ metodo: "Nota de Crédito (devolución)", monto: ncTotalAmt });
    // Add payments made via cobros (hoja de ruta saldo allocation) — not in caja_movimientos for this venta
    for (const ci of cobroItemsData || []) {
      const fp = (ci as any).cobros?.forma_pago || "Cobro";
      const existing = pagos.find((p) => p.metodo === fp);
      if (existing) existing.monto += (ci as any).monto_aplicado;
      else pagos.push({ metodo: fp, monto: (ci as any).monto_aplicado });
    }
    setDetailNCs((ncVentas || []).map((nc: any) => ({
      numero: nc.numero,
      total: nc.total,
      items: (nc.venta_items || []).map((i: any) => ({
        descripcion: i.descripcion,
        cantidad: i.cantidad,
        precio_unitario: i.precio_unitario,
        subtotal: i.subtotal,
      })),
    })));

    // For Mixto online orders: enrich with pedidos_tienda to show original payment split
    const fpLower = ((pedido as any).forma_pago || pedido.metodo_pago || "").toLowerCase();
    const isOnlineOrder = pedido._source === "pedidos" || (pedido as any).isOnline || (pedido as any).origen === "tienda" || (pedido as any).tipo_comprobante === "Pedido Web" || (pedido as any)._tipo_comprobante === "Pedido Web";
    if (fpLower === "mixto" && ptData) {
      if (ptData.monto_efectivo > 0 && !pagos.some((p) => p.metodo === "Efectivo")) {
        pagos.push({ metodo: "Efectivo (a cobrar)", monto: ptData.monto_efectivo });
      }
      if (ptData.monto_transferencia > 0 && !pagos.some((p) => p.metodo === "Transferencia")) {
        pagos.push({ metodo: "Transferencia", monto: ptData.monto_transferencia });
      }
    }

    // Fallback: if no caja_movimientos (online orders not yet paid)
    if (pagos.length === 0) {
      if (ventaData) {
        if (isOnlineOrder) {
          if (ventaData.monto_transferencia > 0) pagos.push({ metodo: "Transferencia (a cobrar)", monto: ventaData.monto_transferencia });
          if (ventaData.monto_efectivo > 0) pagos.push({ metodo: "Efectivo (a cobrar)", monto: ventaData.monto_efectivo });
        } else {
          if (ventaData.monto_efectivo > 0) pagos.push({ metodo: "Efectivo", monto: ventaData.monto_efectivo });
          if (ventaData.monto_transferencia > 0) pagos.push({ metodo: "Transferencia", monto: ventaData.monto_transferencia });
        }
        if (pagos.length === 0) {
          const fpLabel = ventaData.forma_pago || pedido.metodo_pago || "Efectivo";
          const isPending = fpLabel.toLowerCase() === "pendiente";
          if (isOnlineOrder || isPending) {
            pagos.push({ metodo: `${fpLabel} (a cobrar)`, monto: ventaData.total || pedido.total });
          } else {
            pagos.push({ metodo: fpLabel, monto: ventaData.total || pedido.total });
          }
        }
      } else if (ptData) {
        if (isOnlineOrder) {
          if (ptData.monto_transferencia > 0) pagos.push({ metodo: "Transferencia", monto: ptData.monto_transferencia });
          if (ptData.monto_efectivo > 0) pagos.push({ metodo: "Efectivo (a cobrar)", monto: ptData.monto_efectivo });
        } else {
          if (ptData.monto_efectivo > 0) pagos.push({ metodo: "Efectivo", monto: ptData.monto_efectivo });
          if (ptData.monto_transferencia > 0) pagos.push({ metodo: "Transferencia", monto: ptData.monto_transferencia });
        }
        if (pagos.length === 0) {
          const fpLabel2 = ptData.metodo_pago || "Efectivo";
          const isPending2 = fpLabel2.toLowerCase() === "pendiente";
          if (isOnlineOrder || isPending2) {
            pagos.push({ metodo: `${fpLabel2} (a cobrar)`, monto: ptData.total || pedido.total });
          } else {
            pagos.push({ metodo: fpLabel2, monto: ptData.total || pedido.total });
          }
        }
      }
    }

    setDetailPagos(pagos);
    if (!ventaId) setDetailNCs([]);
    setClienteSaldo(clienteData?.saldo || 0);
    setPoSelectedPedido({ ...pedido, items, _source: pedido._source || "pedidos", _ventaId: ventaId } as any);
    setPoEditItems(items.map((i) => ({ ...i })));
    setPoHasChanges(false);
    setEditandoPago(false);
    setPoDetailOpen(true);
  };

  // Update item quantity
  const poUpdateItemQty = (index: number, qty: number) => {
    if (qty <= 0) return;
    setPoEditItems((prev) => prev.map((item, i) =>
      i === index ? { ...item, cantidad: qty, subtotal: qty * item.precio_unitario * (1 - (item.descuento || 0) / 100) } : item
    ));
    setPoHasChanges(true);
  };

  // Update item discount
  const poUpdateItemDiscount = (index: number, pct: number) => {
    const d = Math.max(0, Math.min(100, pct));
    setPoEditItems((prev) => prev.map((item, i) =>
      i === index ? { ...item, descuento: d, subtotal: item.cantidad * item.precio_unitario * (1 - d / 100) } : item
    ));
    setPoHasChanges(true);
  };

  // Remove item
  const poRemoveItem = (index: number) => {
    if (poEditItems.length <= 1) return; // Don't allow empty pedido
    setPoEditItems((prev) => prev.filter((_, i) => i !== index));
    setPoHasChanges(true);
  };

  // Search products to add
  const poSearchProducts = async (query: string) => {
    setPoProductSearch(query);
    setPoSearchHighlight(0);
    if (query.length < 2) { setPoProductResults([]); return; }
    setPoSearchingProducts(true);
    const { data } = await supabase
      .from("productos")
      .select("id, codigo, nombre, precio, costo, unidad_medida, es_combo, imagen_url, stock, presentaciones(nombre, precio, cantidad)")
      .eq("activo", true)
      .or(`nombre.ilike.%${query}%,codigo.ilike.%${query}%`)
      .limit(10);
    setPoProductResults((data || []).map((p: any) => ({
      id: p.id, codigo: p.codigo, nombre: p.nombre, precio: p.precio, costo: p.costo || 0,
      unidad_medida: p.unidad_medida, es_combo: p.es_combo || false,
      imagen_url: p.imagen_url || undefined, stock: p.stock ?? undefined,
      presentaciones: p.es_combo ? [] : (p.presentaciones || []).map((pr: any) => ({
        nombre: pr.nombre, precio: pr.precio, unidades_por_presentacion: pr.cantidad,
      })),
    })));
    setPoSearchingProducts(false);
  };

  // Add product to pedido
  const poAddProduct = (product: ProductoSearch, pres?: { nombre: string; precio: number; unidades_por_presentacion: number }) => {
    const presNombre = pres?.nombre || "Unidad";
    const presPrecio = pres?.precio ?? product.precio;
    const presUpp = pres?.unidades_por_presentacion ?? 1;
    const existing = poEditItems.findIndex((i) => i.producto_id === product.id && i.presentacion === presNombre);
    if (existing >= 0) {
      poUpdateItemQty(existing, poEditItems[existing].cantidad + 1);
    } else {
      setPoEditItems((prev) => [...prev, {
        producto_id: product.id,
        nombre: product.nombre,
        presentacion: presNombre,
        cantidad: 1,
        precio_unitario: presPrecio,
        subtotal: presPrecio,
        unidades_por_presentacion: presUpp,
        costo_unitario: product.costo || 0,
      }]);
      setPoHasChanges(true);
    }
    setPoAddProductOpen(false);
    setPoProductSearch("");
    setPoProductResults([]);
  };

  // Save changes
  const poHandleSave = async () => {
    if (!poSelectedPedido) return;
    setPoSaving(true);
    const errores: string[] = [];

    try {
      const originalItems = poSelectedPedido.items;

      // Identify combo products and fetch their components
      const allProductIds = [...new Set([
        ...originalItems.map((i) => i.producto_id),
        ...poEditItems.map((i) => i.producto_id),
      ])].filter(Boolean);

      const comboComponentsMap: Record<string, { producto_id: string; cantidad: number; nombre: string }[]> = {};
      if (allProductIds.length > 0) {
        const { data: prods } = await supabase.from("productos").select("id, es_combo").in("id", allProductIds);
        const comboIds = (prods || []).filter((p: any) => p.es_combo).map((p: any) => p.id);
        for (const comboId of comboIds) {
          const { data: ciData } = await supabase
            .from("combo_items")
            .select("producto_id, cantidad, productos!combo_items_producto_id_fkey(nombre)")
            .eq("combo_id", comboId);
          comboComponentsMap[comboId] = (ciData || []).map((ci: any) => ({
            producto_id: ci.producto_id,
            cantidad: ci.cantidad,
            nombre: ci.productos?.nombre || "",
          }));
        }
      }

      // Calculate stock differences per product (in UNITS)
      // For combos: expand to component products
      const stockDiffs: Record<string, number> = {};
      const addStockDiff = (productoId: string, qty: number, upp: number) => {
        const components = comboComponentsMap[productoId];
        if (components && components.length > 0) {
          // Combo: apply to each component
          for (const comp of components) {
            stockDiffs[comp.producto_id] = (stockDiffs[comp.producto_id] || 0) + (qty * comp.cantidad);
          }
        } else {
          // Regular product
          stockDiffs[productoId] = (stockDiffs[productoId] || 0) + (qty * upp);
        }
      };

      const getUpp = (item: any) => {
        let u = item.unidades_por_presentacion || 1;
        if (u === 1 && item.presentacion && item.presentacion !== "Unidad") {
          const match = item.presentacion.toLowerCase().match(/x\s*(\d+)/);
          if (match) u = Number(match[1]);
        }
        return u;
      };

      // Return stock from original items (positive = freed)
      for (const orig of originalItems) {
        addStockDiff(orig.producto_id, orig.cantidad, getUpp(orig));
      }
      // Deduct stock from new items (negative = consumed)
      for (const item of poEditItems) {
        addStockDiff(item.producto_id, -item.cantidad, getUpp(item));
      }
      // stockDiffs > 0 means units freed -> return stock
      // stockDiffs < 0 means units consumed -> decrement stock

      // Apply stock adjustments
      const isHistorialRef = poSelectedPedido._source === "historial";
      const refLabelStock = isHistorialRef ? `Edición Venta #${poSelectedPedido.numero}` : `Edición Pedido Web #${poSelectedPedido.numero}`;
      for (const [productoId, diff] of Object.entries(stockDiffs)) {
        if (Math.abs(diff) < 0.001) continue;
        const { data: prod, error: prodErr } = await supabase.from("productos").select("stock").eq("id", productoId).single();
        if (prodErr || !prod) { errores.push(`Producto ${productoId} no encontrado`); continue; }
        const stockAntes = prod.stock;
        const stockDespues = stockAntes + diff;
        const { error: updErr } = await supabase.from("productos").update({ stock: stockDespues }).eq("id", productoId);
        if (updErr) { errores.push(`Error stock: ${updErr.message}`); continue; }
        await supabase.from("stock_movimientos").insert({
          producto_id: productoId,
          tipo: diff > 0 ? "Ajuste" : "Venta",
          cantidad: diff,
          cantidad_antes: stockAntes,
          cantidad_despues: stockDespues,
          referencia: refLabelStock,
          descripcion: diff > 0 ? "Devolución por edición de pedido" : "Agregado por edición de pedido",
          usuario: currentUser?.nombre || "Admin Sistema",
        });
      }

      const nuevoSubtotal = poEditItems.reduce((sum, i) => sum + i.precio_unitario * i.cantidad, 0);
      const isHistorial = poSelectedPedido._source === "historial";
      const descPct = (poSelectedPedido as any)._descuento_porcentaje || 0;
      const recPct = (poSelectedPedido as any)._recargo_porcentaje || 0;
      const nuevoTotal = (isHistorial && !poSelectedPedido.isOnline)
        ? Math.round(nuevoSubtotal * (1 - descPct / 100) * (1 + recPct / 100))
        : nuevoSubtotal + (poSelectedPedido.costo_envio || 0) + ((poSelectedPedido as any).recargo_transferencia || 0);
      const refLabel = isHistorial ? `Edición Venta #${poSelectedPedido.numero}` : `Edición Pedido Web #${poSelectedPedido.numero}`;

      // Update pedido_tienda_items — for PO source OR historial ventas from online orders
      // (so the client sees the updated items in their tienda account)
      const pedidoTiendaId = poSelectedPedido.id > 0 ? poSelectedPedido.id : null;
      const shouldSyncPedidoTienda = !isHistorial || (poSelectedPedido.isOnline && pedidoTiendaId);
      if (shouldSyncPedidoTienda && pedidoTiendaId) {
        const { error: delErr } = await supabase.from("pedido_tienda_items").delete().eq("pedido_id", pedidoTiendaId);
        if (delErr) errores.push(`Error actualizando items en tienda: ${delErr.message}`);
        else {
          const { error: insErr } = await supabase.from("pedido_tienda_items").insert(
            poEditItems.map((item) => ({
              pedido_id: pedidoTiendaId,
              producto_id: item.producto_id,
              nombre: item.nombre,
              presentacion: item.presentacion,
              cantidad: item.cantidad,
              precio_unitario: item.precio_unitario,
              subtotal: item.precio_unitario * item.cantidad,
            }))
          );
          if (insErr) errores.push(`Error insertando items en tienda: ${insErr.message}`);
        }
        const { error: pedErr } = await supabase.from("pedidos_tienda").update({
          subtotal: nuevoSubtotal,
          total: nuevoTotal,
        }).eq("id", pedidoTiendaId);
        if (pedErr) errores.push(`Error actualizando total en tienda: ${pedErr.message}`);
      }

      // Update venta + venta_items
      const ventaId = isHistorial
        ? poSelectedPedido._ventaId
        : (await supabase.from("ventas").select("id, total, cliente_id, forma_pago").eq("numero", poSelectedPedido.numero).maybeSingle()).data?.id;

      if (ventaId) {
        const { data: ventaData } = await supabase.from("ventas").select("total, cliente_id, forma_pago").eq("id", ventaId).single();
        const totalAnterior = ventaData?.total || 0;
        const diferencia = nuevoTotal - totalAnterior;

        const { error: ventaErr } = await supabase.from("ventas").update({
          subtotal: nuevoSubtotal,
          total: nuevoTotal,
        }).eq("id", ventaId);
        if (ventaErr) errores.push(`Error sync venta: ${ventaErr.message}`);

        await supabase.from("venta_items").delete().eq("venta_id", ventaId);
        const { error: viErr } = await supabase.from("venta_items").insert(
          poEditItems.map((item) => ({
            venta_id: ventaId,
            producto_id: item.producto_id,
            descripcion: `${item.nombre} (${item.presentacion})`,
            cantidad: item.cantidad,
            precio_unitario: item.precio_unitario,
            subtotal: item.precio_unitario * item.cantidad,
            unidad_medida: "Un",
            presentacion: item.presentacion,
            unidades_por_presentacion: item.unidades_por_presentacion || 1,
            costo_unitario: item.costo_unitario || 0,
          }))
        );
        if (viErr) errores.push(`Error sync venta_items: ${viErr.message}`);

        // Adjust caja + CC if total changed
        if (Math.abs(diferencia) > 0.01) {
          const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
          const hora = nowTimeARG();

          const { data: cajaRows } = await supabase
            .from("caja_movimientos")
            .select("metodo_pago, cuenta_bancaria")
            .eq("referencia_id", ventaId)
            .eq("referencia_tipo", "venta")
            .limit(1);

          // Only adjust caja if venta was already paid (has existing caja entries).
          // For unpaid ventas, skip — the full amount will be registered when cobro is collected.
          if (cajaRows && cajaRows.length > 0) {
            const metodoPago = cajaRows[0].metodo_pago || ventaData?.forma_pago || "Efectivo";
            const cuentaBancaria = cajaRows[0].cuenta_bancaria || null;
            const { error: cajaErr } = await supabase.from("caja_movimientos").insert({
              fecha: hoy, hora,
              tipo: diferencia > 0 ? "ingreso" : "egreso",
              descripcion: `Ajuste por edición #${poSelectedPedido.numero} (${diferencia > 0 ? "+" : ""}${formatCurrency(diferencia)})`,
              metodo_pago: metodoPago,
              monto: Math.abs(diferencia),
              referencia_id: ventaId,
              referencia_tipo: "ajuste_edicion",
              cuenta_bancaria: cuentaBancaria,
            });
            if (cajaErr) errores.push(`Error caja: ${cajaErr.message}`);
          }

          const clienteId = ventaData?.cliente_id;
          if (clienteId) {
            const { data: ccRows } = await supabase
              .from("cuenta_corriente")
              .select("id")
              .eq("venta_id", ventaId)
              .limit(1);
            if (ccRows && ccRows.length > 0) {
              const { data: newSaldo } = await supabase.rpc("atomic_update_client_saldo", { p_client_id: clienteId, p_change: diferencia });
              await supabase.from("cuenta_corriente").insert({
                cliente_id: clienteId,
                fecha: hoy,
                comprobante: refLabel,
                descripcion: `Ajuste por edición (${diferencia > 0 ? "aumento" : "reducción"})`,
                debe: diferencia > 0 ? diferencia : 0,
                haber: diferencia < 0 ? Math.abs(diferencia) : 0,
                saldo: newSaldo ?? 0,
                forma_pago: "Ajuste",
                venta_id: ventaId,
              });
            }
          }
        }
      }

      if (errores.length > 0) {
        showAdminToast("Guardado con advertencias: " + errores.join(". "), "info");
      }
      setPoHasChanges(false);
      await fetchPedidos();
      await fetchVentas();
      setPoDetailOpen(false);
    } catch (err: any) {
      showAdminToast("Error al guardar: " + (err.message || "Error desconocido"), "error");
    } finally {
      setPoSaving(false);
    }
  };

  // Update estado -- sync to linked venta, return stock + caja + CC on cancel
  const poHandleEstadoChange = async (pedido: Pedido, nuevoEstado: string) => {
    const estadoAnterior = pedido.estado;
    const isHistorial = pedido._source === "historial";
    const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
    const hora = nowTimeARG();

    // Single update to pedidos_tienda by numero (covers all sources)
    if (pedido.numero) {
      const { error: ptErr } = await supabase.from("pedidos_tienda").update({ estado: nuevoEstado }).eq("numero", pedido.numero);
      if (ptErr) showAdminToast(`Error al sincronizar pedido: ${ptErr.message}`, "error");
    }

    // Find linked venta (use cached _ventaId first, then query)
    let ventaLinked: { id: string; cliente_id: string | null } | null = null;
    if (pedido._ventaId) {
      ventaLinked = { id: pedido._ventaId, cliente_id: pedido._clienteId || null };
    } else if (pedido.numero) {
      const { data } = await supabase.from("ventas").select("id, cliente_id").eq("numero", pedido.numero).maybeSingle();
      ventaLinked = data as typeof ventaLinked;
    }

    // Sync estado to linked venta
    if (ventaLinked) {
      const ventaEstado = nuevoEstado === "cancelado" ? "anulada" : nuevoEstado;
      const ventaUpdate: Record<string, unknown> = { estado: ventaEstado };
      if (nuevoEstado === "entregado") ventaUpdate.entregado = true;
      if (nuevoEstado === "cancelado") {
        ventaUpdate.entregado = false;
        ventaUpdate.observacion = `ANULADA (Cancelación desde ${isHistorial ? "Historial" : "Pedidos Online"})`;
      }
      await supabase.from("ventas").update(ventaUpdate).eq("id", ventaLinked.id);
    }

    // Return stock when cancelling (only if wasn't already cancelled)
    if (nuevoEstado === "cancelado" && estadoAnterior !== "cancelado") {
      for (const item of pedido.items) {
        if (!item.producto_id) continue;
        let upp = item.unidades_por_presentacion || 1;
        if (upp === 1 && item.presentacion && item.presentacion !== "Unidad") {
          const match = item.presentacion.toLowerCase().match(/x\s*(\d+)/);
          if (match) upp = Number(match[1]);
        }
        const unitsToRestore = item.cantidad * upp;

        // Check if product is a combo
        const { data: prodInfo } = await supabase.from("productos").select("id, es_combo").eq("id", item.producto_id).single();
        if (!prodInfo) continue;

        if ((prodInfo as any).es_combo) {
          // Combo: reverse stock on each component product
          const { data: comboItems } = await supabase
            .from("combo_items")
            .select("producto_id, cantidad, productos!combo_items_producto_id_fkey(nombre)")
            .eq("combo_id", item.producto_id);
          for (const ci of comboItems || []) {
            const compUnits = unitsToRestore * (ci as any).cantidad;
            const { data: stockResult } = await supabase.rpc("atomic_update_stock", { p_product_id: (ci as any).producto_id, p_change: compUnits });
            const stockAntes = (stockResult?.new_stock ?? 0) - compUnits;
            const stockDespues = stockResult?.new_stock ?? 0;
            await supabase.from("stock_movimientos").insert({
              producto_id: (ci as any).producto_id,
              tipo: "anulacion",
              cantidad: compUnits,
              cantidad_antes: stockAntes,
              cantidad_despues: stockDespues,
              referencia: `Cancelación Pedido Web #${pedido.numero}`,
              descripcion: `Devolución stock combo - ${(ci as any).productos?.nombre || item.nombre} (${item.presentacion})`,
              usuario: currentUser?.nombre || "Admin Sistema",
            });
          }
        } else {
          // Regular product: atomic stock update
          const { data: stockResult } = await supabase.rpc("atomic_update_stock", { p_product_id: item.producto_id, p_change: unitsToRestore });
          const stockAntes = (stockResult?.new_stock ?? 0) - unitsToRestore;
          const stockDespues = stockResult?.new_stock ?? 0;
          await supabase.from("stock_movimientos").insert({
            producto_id: item.producto_id,
            tipo: "anulacion",
            cantidad: unitsToRestore,
            cantidad_antes: stockAntes,
            cantidad_despues: stockDespues,
            referencia: `Cancelación Pedido Web #${pedido.numero}`,
            descripcion: `Devolución stock - ${item.nombre} (${item.presentacion})`,
            usuario: currentUser?.nombre || "Admin Sistema",
          });
        }
      }

      // Reverse caja_movimientos for linked venta
      if (ventaLinked) {
        const { data: cajaRows } = await supabase
          .from("caja_movimientos")
          .select("*")
          .eq("referencia_id", ventaLinked.id)
          .eq("referencia_tipo", "venta");
        for (const cm of cajaRows || []) {
          await supabase.from("caja_movimientos").insert({
            fecha: hoy, hora,
            tipo: "cancelacion",
            descripcion: `Cancelación Pedido Web #${pedido.numero}`,
            metodo_pago: (cm as any).metodo_pago,
            monto: (cm as any).monto,
            referencia_id: ventaLinked.id,
            referencia_tipo: "anulacion",
            cuenta_bancaria: (cm as any).cuenta_bancaria || null,
          });
        }

        // Reverse cuenta_corriente entries
        if (ventaLinked.cliente_id) {
          const { data: ccRows } = await supabase
            .from("cuenta_corriente")
            .select("*")
            .eq("venta_id", ventaLinked.id);
          if (ccRows && ccRows.length > 0) {
            const { data: clienteData } = await supabase.from("clientes").select("saldo").eq("id", ventaLinked.cliente_id).single();
            let saldoActual = clienteData?.saldo || 0;
            for (const cc of ccRows) {
              const nuevoSaldo = saldoActual - (cc as any).debe + (cc as any).haber;
              await supabase.from("cuenta_corriente").insert({
                cliente_id: ventaLinked.cliente_id,
                fecha: hoy,
                comprobante: `Cancelación Pedido Web #${pedido.numero}`,
                descripcion: `Cancelación de pedido online`,
                debe: (cc as any).haber,
                haber: (cc as any).debe,
                saldo: nuevoSaldo,
                forma_pago: "Anulación",
                venta_id: ventaLinked.id,
              });
              saldoActual = nuevoSaldo;
            }
            await supabase.from("clientes").update({ saldo: saldoActual }).eq("id", ventaLinked.cliente_id);
          }
        }
      }
    }

    // Re-decrement stock if un-cancelling (restoring a previously cancelled pedido)
    if (estadoAnterior === "cancelado" && nuevoEstado !== "cancelado") {
      for (const item of pedido.items) {
        if (!item.producto_id) continue;
        let upp = item.unidades_por_presentacion || 1;
        if (upp === 1 && item.presentacion && item.presentacion !== "Unidad") {
          const match = item.presentacion.toLowerCase().match(/x\s*(\d+)/);
          if (match) upp = Number(match[1]);
        }
        const unitsToDecrement = item.cantidad * upp;

        // Check if product is a combo
        const { data: prodInfo } = await supabase.from("productos").select("id, es_combo").eq("id", item.producto_id).single();
        if (!prodInfo) continue;

        if ((prodInfo as any).es_combo) {
          // Combo: decrement stock on each component product
          const { data: comboItems } = await supabase
            .from("combo_items")
            .select("producto_id, cantidad, productos!combo_items_producto_id_fkey(nombre)")
            .eq("combo_id", item.producto_id);
          for (const ci of comboItems || []) {
            const compUnits = unitsToDecrement * (ci as any).cantidad;
            const { data: stockResult } = await supabase.rpc("atomic_update_stock", { p_product_id: (ci as any).producto_id, p_change: -compUnits });
            const stockAntes = (stockResult?.new_stock ?? 0) + compUnits;
            const stockDespues = stockResult?.new_stock ?? 0;
            await supabase.from("stock_movimientos").insert({
              producto_id: (ci as any).producto_id,
              tipo: "Venta",
              cantidad: -compUnits,
              cantidad_antes: stockAntes,
              cantidad_despues: stockDespues,
              referencia: `Reactivación Pedido Web #${pedido.numero}`,
              descripcion: `Descuento stock combo - ${(ci as any).productos?.nombre || item.nombre} (${item.presentacion})`,
              usuario: currentUser?.nombre || "Admin Sistema",
            });
          }
        } else {
          // Regular product: atomic stock update
          const { data: stockResult } = await supabase.rpc("atomic_update_stock", { p_product_id: item.producto_id, p_change: -unitsToDecrement });
          const stockAntes = (stockResult?.new_stock ?? 0) + unitsToDecrement;
          const stockDespues = stockResult?.new_stock ?? 0;
          await supabase.from("stock_movimientos").insert({
            producto_id: item.producto_id,
            tipo: "Venta",
            cantidad: -unitsToDecrement,
            cantidad_antes: stockAntes,
            cantidad_despues: stockDespues,
            referencia: `Reactivación Pedido Web #${pedido.numero}`,
            descripcion: `Descuento stock - ${item.nombre} (${item.presentacion})`,
            usuario: currentUser?.nombre || "Admin Sistema",
          });
        }
      }
    }

    // Update local state instead of full refetch for speed
    setPoPedidos((prev) => prev.map((p) => p.numero === pedido.numero ? { ...p, estado: nuevoEstado } : p));
    setVentas((prev) => prev.map((v) => v.numero === pedido.numero ? { ...v, estado: nuevoEstado === "cancelado" ? "anulada" : nuevoEstado, entregado: nuevoEstado === "entregado" } as any : v));
  };

  // Change metodo_pago for online orders / POS envio orders
  const handleCambiarMetodoPago = async (nuevoMetodo: string) => {
    if (!poSelectedPedido) return;
    const total = poSelectedPedido.total;
    const updates: Record<string, unknown> = { metodo_pago: nuevoMetodo };
    if (nuevoMetodo === "efectivo") { updates.monto_efectivo = total; updates.monto_transferencia = 0; }
    else if (nuevoMetodo === "transferencia") { updates.monto_efectivo = 0; updates.monto_transferencia = total; }
    else { updates.monto_efectivo = 0; updates.monto_transferencia = 0; }

    const { error } = await supabase.from("pedidos_tienda").update(updates).eq("numero", poSelectedPedido.numero);
    if (error) { showAdminToast(`Error: ${error.message}`, "error"); return; }

    const ventaId = (poSelectedPedido as any)._ventaId;
    if (ventaId) {
      const ventaForma = nuevoMetodo.charAt(0).toUpperCase() + nuevoMetodo.slice(1).replace("_", " ");
      await supabase.from("ventas").update({ forma_pago: ventaForma }).eq("id", ventaId);
    }

    setPoSelectedPedido({ ...poSelectedPedido, metodo_pago: nuevoMetodo });
    setPoPedidos((prev) => prev.map((p) => p.numero === poSelectedPedido.numero ? { ...p, metodo_pago: nuevoMetodo } : p));
    setEditandoPago(false);
    showAdminToast("Método de pago actualizado", "success");
  };

  // PO Stats
  const poPendientes = poPedidos.filter((p) => p.estado === "pendiente").length;
  const poArmados = poPedidos.filter((p) => p.estado === "armado").length;
  const poTotalPendiente = poPedidos.filter((p) => p.estado === "pendiente" || p.estado === "armado").reduce((s, p) => s + p.total, 0);

  // ══════════════════════════════════════════════════════════════
  // UNIFIED ALL ORDERS
  // ══════════════════════════════════════════════════════════════

  const formatEntrega = (v: string | null | undefined) => {
    if (!v) return "";
    if (v === "envio") return "Envio";
    if (v === "retiro_local" || v === "retiro") return "Retiro en local";
    return v.charAt(0).toUpperCase() + v.slice(1);
  };

  const formatPago = (v: string | null | undefined) => {
    if (!v) return "";
    if (v === "efectivo") return "Efectivo";
    if (v === "transferencia") return "Transferencia";
    if (v === "cuenta_corriente") return "Cuenta Corriente";
    if (v === "mixto") return "Mixto";
    return v.charAt(0).toUpperCase() + v.slice(1);
  };

  const allOrders = useMemo(() => {
    // Only block render on initial load (no data yet), not on refetch after save
    if ((loading || poLoading) && ventas.length === 0 && poPedidos.length === 0) return [];
    const fromHistorial: Pedido[] = ventas.map((v) => {
      const estado = v.estado === "anulada" ? "cancelado" : v.entregado ? "entregado" : v.estado === "cerrada" ? "cerrada" : v.estado || "pendiente";
      return {
        id: 0,
        numero: v.numero,
        created_at: v.created_at || v.fecha,
        estado,
        nombre_cliente: v.clientes?.nombre || "Consumidor Final",
        email: v.clientes?.email || "",
        telefono: v.clientes?.telefono || "",
        metodo_entrega: v.metodo_entrega || "",
        direccion_texto: v.clientes?.domicilio || null,
        fecha_entrega: null,
        metodo_pago: v.forma_pago,
        subtotal: v.subtotal,
        costo_envio: 0,
        total: v.total,
        observacion: v.observacion,
        cliente_auth_id: null,
        items: [],
        _source: "historial" as const,
        _ventaId: v.id,
        _clienteId: v.cliente_id,
        _entregado: v.entregado,
        _tipo_comprobante: v.tipo_comprobante,
        _descuento_porcentaje: v.descuento_porcentaje,
        _recargo_porcentaje: v.recargo_porcentaje,
        _vendedor: v.vendedor_id ? (vendedores.find((vd) => vd.id === v.vendedor_id)?.nombre || "") : "",
        _cuit: v.clientes?.cuit || "",
        _domicilio: v.clientes?.domicilio || "",
        forma_pago: v.forma_pago,
        cuenta_transferencia_alias: (v as any).cuenta_transferencia_alias || null,
        cuenta_transferencia_id: (v as any).cuenta_transferencia_id || null,
      } as Pedido;
    });

    const fromPedidos: Pedido[] = poPedidos.map((p) => ({ ...p, _source: "pedidos" as const }));

    // Build map of pedidos_tienda by numero for enrichment
    const pedidoByNumero = new Map(fromPedidos.map((p) => [p.numero, p]));

    // Enrich historial entries that are online orders with pedidos_tienda data
    // but always keep the historial entry (it has venta data like _ventaId, totals, etc.)
    const enrichedHistorial = fromHistorial.map((h) => {
      const pt = pedidoByNumero.get(h.numero);
      if (pt) {
        // Merge pedidos_tienda client info into the historial entry
        pedidoByNumero.delete(h.numero); // consumed, won't be added again
        return {
          ...h,
          nombre_cliente: pt.nombre_cliente || h.nombre_cliente,
          email: pt.email || h.email,
          telefono: pt.telefono || h.telefono,
          metodo_entrega: pt.metodo_entrega || h.metodo_entrega,
          direccion_texto: pt.direccion_texto || h.direccion_texto,
          fecha_entrega: pt.fecha_entrega || h.fecha_entrega,
          isOnline: true,
          _source: "historial" as const,
        };
      }
      return h;
    });

    // Add remaining pedidos_tienda that don't have a matching venta yet
    const remainingPedidos = [...pedidoByNumero.values()];

    return [...enrichedHistorial, ...remainingPedidos].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [ventas, poPedidos, vendedores, loading, poLoading]);

  const filteredOrders = useMemo(() => {
    return allOrders.filter((o) => {
      // Source filter
      const isOnlineOrder = o._source === "pedidos" || o.isOnline || (o as any)._tipo_comprobante === "Pedido Web";
      if (filterSource === "pos" && isOnlineOrder) return false;
      if (filterSource === "online" && !isOnlineOrder) return false;
      // Estado filter
      if (poFilterEstado !== "todos") {
        if (poFilterEstado === "entregado" ? (o.estado !== "entregado" && o.estado !== "cerrada") : o.estado !== poFilterEstado) return false;
      }
      // Payment filter
      if (filterPayment !== "all") {
        const pago = (o.forma_pago || o.metodo_pago || "").toLowerCase();
        if (filterPayment.toLowerCase() !== pago) return false;
      }
      // Search filter
      if (searchClient) {
        const q = norm(searchClient);
        if (
          !norm(o.nombre_cliente || "").includes(q) &&
          !norm(o.numero || "").includes(q) &&
          !norm(o.email || "").includes(q)
        ) return false;
      }
      return true;
    });
  }, [allOrders, filterSource, poFilterEstado, filterPayment, searchClient]);

  // Unified stats
  const unifiedTotal = filteredOrders.filter((o) => o.estado !== "cancelado").reduce((s, o) => {
    const isNC = o._tipo_comprobante?.includes("Nota de Crédito");
    return s + (isNC ? -o.total : o.total);
  }, 0);
  const unifiedPendientes = filteredOrders.filter((o) => o.estado === "pendiente" || o.estado === "armado").length;

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <Receipt className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Ventas y Pedidos</h1>
            <p className="text-sm text-muted-foreground">
              {filteredOrders.length} resultados{poPendientes > 0 ? ` · ${poPendientes} pendiente${poPendientes > 1 ? "s" : ""} online` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportExcel}>
            <Download className="w-4 h-4 mr-2" />Exportar
          </Button>
          <Link href="/admin/ventas/carga-manual">
            <Button variant="outline" size="sm"><FileText className="w-4 h-4 mr-2" />Carga manual</Button>
          </Link>
          <Link href="/admin/ventas/hoja-ruta">
            <Button variant="outline" size="sm"><Truck className="w-4 h-4 mr-2" />Entregas y Ruta</Button>
          </Link>
          <Link href="/admin/ventas">
            <Button size="sm"><Plus className="w-4 h-4 mr-2" />Nueva venta</Button>
          </Link>
        </div>
      </div>

      {/* Unified Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Receipt className="w-5 h-5 text-primary" /></div>
            <div><p className="text-xs text-muted-foreground">Total ventas</p><p className="text-xl font-bold">{filteredOrders.filter((o) => o.estado !== "cancelado").length}</p></div>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer transition-all ${poFilterEstado === "pendiente" ? "ring-2 ring-amber-400" : "hover:shadow-md"}`} onClick={() => setPoFilterEstado(poFilterEstado === "pendiente" ? "todos" : "pendiente")}>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center"><Clock className="w-5 h-5 text-amber-500" /></div>
            <div><p className="text-xs text-muted-foreground">Pendientes online</p><p className="text-xl font-bold text-amber-600">{poPendientes}</p></div>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer transition-all ${poFilterEstado === "armado" ? "ring-2 ring-violet-400" : "hover:shadow-md"}`} onClick={() => setPoFilterEstado(poFilterEstado === "armado" ? "todos" : "armado")}>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center"><Package className="w-5 h-5 text-violet-500" /></div>
            <div><p className="text-xs text-muted-foreground">Pendientes entrega</p><p className="text-xl font-bold text-violet-600">{unifiedPendientes}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center"><DollarSign className="w-5 h-5 text-emerald-500" /></div>
            <div><p className="text-xs text-muted-foreground">Total facturado</p><p className="text-xl font-bold">{formatCurrency(unifiedTotal)}</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Unified Filters */}
      <Card>
        <CardContent className="pt-5 pb-4 space-y-3 overflow-visible">
          {/* Row 1: Search + Date period */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar número, cliente o email..." value={searchClient} onChange={(e) => setSearchClient(e.target.value)} className="pl-9 h-9" />
            </div>
            <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
              {([["today", "Hoy"], ["week", "Esta semana"], ["month", "Este mes"], ["custom", "Personalizado"]] as const).map(([key, label]) => (
                <button key={key} onClick={() => setQuickPeriod(key)} className={`px-3 py-1.5 text-sm rounded-md transition-all ${quickPeriod === key ? "bg-white text-foreground font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                  {key === "custom" && <Calendar className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />}
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom date controls */}
          {quickPeriod === "custom" && (
            <div className="flex items-center gap-2 flex-wrap pl-1">
              <Select value={filterMode} onValueChange={(v) => setFilterMode((v ?? "day") as any)}>
                <SelectTrigger className="w-28 h-8 text-sm">
                  {filterMode === "day" ? "Día" : filterMode === "month" ? "Mes" : filterMode === "range" ? "Rango" : "Todos"}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Día</SelectItem>
                  <SelectItem value="month">Mes</SelectItem>
                  <SelectItem value="range">Rango</SelectItem>
                  <SelectItem value="all">Todos</SelectItem>
                </SelectContent>
              </Select>
              {filterMode === "day" && (
                <Input type="date" value={filterDay} onChange={(e) => setFilterDay(e.target.value)} className="w-40 h-8 text-sm" />
              )}
              {filterMode === "month" && (
                <>
                  <Select value={filterMonth} onValueChange={(v) => setFilterMonth(v ?? "1")}>
                    <SelectTrigger className="w-32 h-8 text-sm"><SelectValue placeholder="Mes" /></SelectTrigger>
                    <SelectContent>
                      {months.map((m, i) => (<SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <Input type="number" value={filterYear} onChange={(e) => setFilterYear(e.target.value)} className="w-20 h-8 text-sm" />
                </>
              )}
              {filterMode === "range" && (
                <>
                  <Input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className="w-40 h-8 text-sm" />
                  <span className="text-muted-foreground text-sm">a</span>
                  <Input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className="w-40 h-8 text-sm" />
                </>
              )}
            </div>
          )}

          {/* Row 2: Filters - Origin, Estado, Cobro, Comprobante */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 border-t">
            {/* Origin */}
            <div className="flex items-center gap-1.5 pt-2">
              <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider mr-0.5">Origen</span>
              {([["todos", "Todos", null], ["pos", "POS", Store], ["online", "Online", Globe]] as const).map(([val, label, Icon]) => (
                <button
                  key={val}
                  onClick={() => setFilterSource(val as any)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    filterSource === val
                      ? "bg-foreground text-background shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {Icon && <Icon className="w-3 h-3 inline mr-1 -mt-0.5" />}
                  {label}
                </button>
              ))}
            </div>

            {/* Separator */}
            <div className="hidden sm:block w-px h-6 bg-border mt-2" />

            {/* Estado */}
            <div className="flex items-center gap-1.5 pt-2">
              <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider mr-0.5">Estado</span>
              {([["todos", "Todos"], ["pendiente", "Pendiente"], ["armado", "Armado"], ["entregado", "Entregado"], ["cancelado", "Cancelado"]] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setPoFilterEstado(val)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    poFilterEstado === val
                      ? "bg-foreground text-background shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Separator */}
            <div className="hidden sm:block w-px h-6 bg-border mt-2" />

            {/* Forma de cobro */}
            <div className="flex items-center gap-1.5 pt-2">
              <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider mr-0.5">Cobro</span>
              <Select value={filterPayment} onValueChange={(v) => setFilterPayment(v ?? "all")}>
                <SelectTrigger className="h-7 w-auto min-w-[90px] text-xs border-dashed">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="Efectivo">Efectivo</SelectItem>
                  <SelectItem value="Transferencia">Transferencia</SelectItem>
                  <SelectItem value="Cuenta Corriente">Cuenta Corriente</SelectItem>
                  <SelectItem value="Mixto">Mixto</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Tipo comprobante */}
            <div className="flex items-center gap-1.5 pt-2">
              <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider mr-0.5">Tipo</span>
              <Select value={filterType} onValueChange={(v) => setFilterType(v ?? "all")}>
                <SelectTrigger className="h-7 w-auto min-w-[90px] text-xs border-dashed">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="Remito X">Remito X</SelectItem>
                  <SelectItem value="Pedido Web">Pedido Web</SelectItem>
                  <SelectItem value="Nota de Crédito B">NC B</SelectItem>
                  <SelectItem value="Nota de Crédito C">NC C</SelectItem>
                  <SelectItem value="Nota de Débito B">ND B</SelectItem>
                  <SelectItem value="Nota de Débito C">ND C</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Unified Cards */}
      {(loading || poLoading) ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : filteredOrders.length === 0 ? (
        <div className="text-center py-16">
          <ShoppingCart className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No se encontraron ventas con los filtros seleccionados</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.slice(0, PAGE_SIZE * visiblePage).map((order, idx) => {
            const est = estadoBadge[order.estado] || estadoBadge.pendiente;
            const isHistorial = order._source === "historial";
            const pago = formatPago(order.forma_pago || order.metodo_pago);
            const entrega = formatEntrega(order.metodo_entrega);
            const isNC = order._tipo_comprobante?.includes("Nota de Crédito");
            const estadoSteps = ["pendiente", "armado", "entregado"];
            const currentStep = order.estado === "cancelado" ? -1 : estadoSteps.indexOf(order.estado);

            return (
              <Card key={`${order._source}-${order._ventaId || order.id}-${idx}`} className={`transition-all ${order.estado === "cancelado" ? "opacity-50" : "hover:shadow-md"}`}>
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    {/* Left: Customer & order info */}
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-base">{order.nombre_cliente}</span>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${est.bg} ${est.text}`}>
                              {est.label}
                            </span>
                            <Badge variant="outline" className={`text-[10px] font-normal ${isHistorial ? "border-gray-300 text-gray-600 bg-gray-50" : "border-blue-300 text-blue-700 bg-blue-50"}`}>
                              {(order.isOnline || order._source === "pedidos" || order._tipo_comprobante === "Pedido Web") ? <><Globe className="w-3 h-3 mr-0.5" />Online</> : <><Store className="w-3 h-3 mr-0.5" />POS</>}
                            </Badge>
                            {isNC && <Badge variant="destructive" className="text-[10px]">NC</Badge>}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            {order.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{order.email}</span>}
                            {order.telefono && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{order.telefono}</span>}
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {order.fecha_entrega ? (
                                <>Entrega: {new Date(order.fecha_entrega + "T12:00:00").toLocaleDateString("es-AR", { weekday: "short", day: "2-digit", month: "2-digit" })}</>
                              ) : (
                                <>{new Date(order.created_at).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}{" "}
                                {order.created_at.includes("T") && new Date(order.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Argentina/Buenos_Aires" })}</>
                              )}
                            </span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-lg font-bold ${order.estado === "cancelado" ? "line-through text-muted-foreground" : isNC ? "text-red-500" : ""}`}>
                            {isNC ? `-${formatCurrency(order.total)}` : formatCurrency(order.total)}
                          </p>
                          <p className="text-[10px] text-muted-foreground font-mono">#{order.numero}</p>
                        </div>
                      </div>

                      {/* Delivery & payment info */}
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {entrega && (
                          <Badge variant="outline" className={`font-normal ${order.metodo_entrega === "envio" ? "border-blue-300 text-blue-700 bg-blue-50" : "border-gray-300"}`}>
                            {order.metodo_entrega === "envio" ? <><Truck className="w-3 h-3 mr-1" />{entrega}</> : <><Store className="w-3 h-3 mr-1" />{entrega}</>}
                          </Badge>
                        )}
                        {order.metodo_entrega === "envio" && order.direccion_texto && (
                          <span className="text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3 shrink-0" /><span className="truncate max-w-[300px]">{order.direccion_texto}</span></span>
                        )}
                        {pago && (
                          <Badge variant="outline" className="font-normal">
                            <DollarSign className="w-3 h-3 mr-1" />{pago}
                          </Badge>
                        )}
                        {/* Warning: transfer without bank account — only for actual transfers, not Mixto without transfer */}
                        {(order.forma_pago || order.metodo_pago || "").toLowerCase().includes("transferencia") &&
                          !(order as any).cuenta_transferencia_alias && order.estado !== "cancelado" && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 font-medium bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                            <AlertTriangle className="w-3 h-3" />
                            Sin cuenta
                          </span>
                        )}
                        {isHistorial && order._tipo_comprobante && (
                          <Badge variant="secondary" className="text-[10px] font-normal">{order._tipo_comprobante}</Badge>
                        )}
                        {order._vendedor && order._vendedor !== "" && (
                          <span className="text-muted-foreground flex items-center gap-1"><User className="w-3 h-3" />{order._vendedor}</span>
                        )}
                      </div>

                      {/* Progress stepper */}
                      {order.estado !== "cancelado" && order.estado !== "cerrada" && !isNC && (
                        <div className="flex items-center gap-1 pt-1">
                          {estadoSteps.map((step, i) => (
                            <div key={step} className="flex items-center gap-1">
                              <div className={`w-2 h-2 rounded-full ${i <= currentStep ? "bg-primary" : "bg-gray-200"}`} />
                              <span className={`text-[10px] ${i <= currentStep ? "text-foreground font-medium" : "text-muted-foreground/50"}`}>
                                {step === "pendiente" ? "Pendiente" : step === "armado" ? "Armado" : "Entregado"}
                              </span>
                              {i < estadoSteps.length - 1 && <div className={`w-6 h-[2px] ${i < currentStep ? "bg-primary" : "bg-gray-200"}`} />}
                            </div>
                          ))}
                        </div>
                      )}
                      {order.estado === "cancelado" && (
                        <div className="flex items-center gap-1 pt-1">
                          <Ban className="w-3 h-3 text-red-500" />
                          <span className="text-[10px] text-red-500 font-medium">Cancelado</span>
                        </div>
                      )}
                    </div>

                    {/* Right: Actions */}
                    <div className="flex sm:flex-col items-center gap-1.5 shrink-0">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => poOpenDetail(order)} title="Ver detalle">
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className={`h-8 w-8 p-0 ${printedPedidos.has(order.numero) ? "text-emerald-600" : ""}`} onClick={async () => {
                        try {
                          let v = ventas.find((vr) => vr.id === order._ventaId);
                          if (!v && order._ventaId) {
                            v = ventas.find((vr) => vr.numero === order.numero);
                          }
                          if (!v) {
                            const { data: rows } = await supabase.from("ventas").select("*, clientes(nombre, cuit, domicilio, telefono, email)").eq("numero", order.numero).order("created_at", { ascending: false }).limit(1);
                            if (rows && rows.length > 0) v = rows[0] as any;
                          }
                          if (v) {
                            if (order.nombre_cliente && (order._source === "pedidos" || (order as any).isOnline)) {
                              (v as any).clientes = { nombre: order.nombre_cliente, cuit: "", domicilio: order.direccion_texto || "", telefono: order.telefono || "", email: order.email || "" };
                            }
                            preparePrint(v);
                          } else {
                            showAdminToast("No se encontró la venta vinculada para imprimir", "error");
                          }
                        } catch (err) {
                          showAdminToast("Error al preparar impresión", "error");
                        }
                      }} title={printedPedidos.has(order.numero) ? "Ya impreso — reimprimir" : "Imprimir"}>
                        {printedPedidos.has(order.numero) ? <PrinterCheck className="w-4 h-4" /> : <Printer className="w-4 h-4" />}
                      </Button>
                      {/* Cobrar button — for online orders or POS with envío, not yet paid */}
                      {order.estado !== "entregado" && order.estado !== "cancelado" && order.estado !== "cerrada" && !isNC && (
                        order.isOnline || order._source === "pedidos" || order._tipo_comprobante === "Pedido Web" || (order.metodo_entrega || "").toLowerCase().includes("envio") || (order.metodo_entrega || "").toLowerCase().includes("envío") ||
                        order.forma_pago === "Pendiente" || order.metodo_pago === "Pendiente"
                      ) && (
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={() => poOpenDetail(order)} title="Cobrar">
                          <DollarSign className="w-4 h-4" />
                        </Button>
                      )}
                      {order.estado !== "entregado" && order.estado !== "cancelado" && order.estado !== "cerrada" && !isNC && (
                        <>
                          {order.estado === "pendiente" && (
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-violet-600 hover:text-violet-700 hover:bg-violet-50" onClick={async () => { await poHandleEstadoChange(order, "armado"); setPoPedidos(prev => prev.map(p => p.numero === order.numero ? { ...p, estado: "armado" } : p)); setVentas(prev => prev.map(v => v.numero === order.numero ? { ...v, estado: "armado" } : v)); showAdminToast("Marcado como armado", "success"); }} title="Marcar armado">
                              <Package className="w-4 h-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={async () => {
                            // First check if payment was already registered (cobro already done)
                            const ventaId = (order as any)._ventaId || (order as any).venta_id;
                            let alreadyPaid = false;
                            if (ventaId) {
                              const { data: venta } = await supabase.from("ventas").select("monto_pagado, total, forma_pago").eq("id", ventaId).single();
                              if (venta && venta.monto_pagado > 0 && venta.forma_pago !== "Pendiente") {
                                alreadyPaid = true;
                              }
                              if (!alreadyPaid) {
                                // Also check caja_movimientos
                                const { count } = await supabase.from("caja_movimientos").select("id", { count: "exact", head: true }).eq("referencia_id", ventaId).eq("referencia_tipo", "venta");
                                if (count && count > 0) alreadyPaid = true;
                              }
                            }

                            if (alreadyPaid) {
                              // Already paid — just mark as entregado, no payment
                              if (ventaId) {
                                await supabase.from("ventas").update({ entregado: true, estado: "entregado" }).eq("id", ventaId);
                                await supabase.from("pedidos_tienda").update({ estado: "entregado" }).eq("numero", order.numero);
                              }
                              await poHandleEstadoChange(order, "entregado");
                              setPoPedidos(prev => prev.map(p => p.numero === order.numero ? { ...p, estado: "entregado" } : p));
                              setVentas(prev => prev.map(v => v.numero === order.numero ? { ...v, estado: "entregado", entregado: true } : v));
                              showAdminToast("Marcado como entregado", "success");
                            } else {
                              // Check if order needs payment dialog
                              const fp = (order.forma_pago || order.metodo_pago || "").toLowerCase();
                              const hasPendingPayment = fp === "pendiente" || !fp || order._source === "pedidos" || (order as any).isOnline || (order.metodo_entrega || "").toLowerCase().includes("envio") || (order.metodo_entrega || "").toLowerCase().includes("envío");
                              if (hasPendingPayment) {
                                setEntregarDialog({ open: true, order });
                              } else {
                                // POS retiro already paid — direct mark
                                await poHandleEstadoChange(order, "entregado");
                                setPoPedidos(prev => prev.map(p => p.numero === order.numero ? { ...p, estado: "entregado" } : p));
                                setVentas(prev => prev.map(v => v.numero === order.numero ? { ...v, estado: "entregado", entregado: true } : v));
                                showAdminToast("Marcado como entregado", "success");
                              }
                            }
                          }} title="Marcar entregado">
                            <CheckCircle className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                      {order.estado !== "cancelado" && !isNC && (
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => {
                          if (isHistorial) {
                            const v = ventas.find((vr) => vr.id === order._ventaId);
                            if (v) { setAnularVenta(v); setAnularMotivo(""); }
                          } else {
                            setPoCancelPedido(order);
                          }
                        }} title="Cancelar">
                          <Ban className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {/* Load more button */}
          {filteredOrders.length > PAGE_SIZE * visiblePage && (
            <div className="flex justify-center pt-3">
              <Button variant="outline" onClick={() => setVisiblePage((p) => p + 1)}>
                Cargar más ({filteredOrders.length - PAGE_SIZE * visiblePage} restantes)
              </Button>
            </div>
          )}
          {/* Total bar */}
          {filteredOrders.length > 0 && (
            <div className="flex justify-end pt-2 px-2">
              <span className="text-sm text-muted-foreground mr-4">Total del periodo:</span>
              <span className="text-sm font-bold">{formatCurrency(unifiedTotal)}</span>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* ANULAR DIALOG */}
      {/* ══════════════════════════════════════════════════════════ */}
      <Dialog open={!!anularVenta} onOpenChange={(open) => { if (!open) setAnularVenta(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Anular comprobante
            </DialogTitle>
          </DialogHeader>
          {anularVenta && (
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm space-y-2">
                <p className="font-medium text-red-800">Esta acción revertirá:</p>
                <ul className="list-disc list-inside text-red-700 space-y-1">
                  <li>El stock de los productos será restaurado</li>
                  <li>Se generará un egreso en caja para compensar</li>
                  {anularVenta.forma_pago === "Cuenta Corriente" || anularVenta.forma_pago === "Mixto" ? (
                    <li>Se revertirá el movimiento en cuenta corriente del cliente</li>
                  ) : null}
                </ul>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Comprobante:</span> <span className="font-medium">{anularVenta.numero}</span></div>
                <div><span className="text-muted-foreground">Total:</span> <span className="font-bold">{formatCurrency(anularVenta.total)}</span></div>
                <div><span className="text-muted-foreground">Cliente:</span> <span className="font-medium">{anularVenta.clientes?.nombre || "—"}</span></div>
                <div><span className="text-muted-foreground">Pago:</span> <span className="font-medium">{anularVenta.forma_pago}</span></div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Motivo de anulación (opcional)</Label>
                <Input
                  placeholder="Ej: Error en el monto, devolución del cliente..."
                  value={anularMotivo}
                  onChange={(e) => setAnularMotivo(e.target.value)}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setAnularVenta(null)} disabled={anulando}>
                  Cancelar
                </Button>
                <Button variant="destructive" onClick={handleAnular} disabled={anulando}>
                  {anulando ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Ban className="w-4 h-4 mr-2" />}
                  Confirmar anulación
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* UNIFIED DETAIL / EDIT DIALOG */}
      {/* ══════════════════════════════════════════════════════════ */}
      <Dialog open={poDetailOpen} onOpenChange={(open) => {
        if (!open && poHasChanges) {
          setConfirmDialog({
            open: true,
            title: "Cambios sin guardar",
            message: "Tenés cambios sin guardar. ¿Cerrar de todas formas?",
            onConfirm: () => setPoDetailOpen(false),
          });
          return;
        }
        setPoDetailOpen(open);
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
          {poSelectedPedido && (() => {
            const isHistorial = poSelectedPedido._source === "historial";
            const isCancelled = poSelectedPedido.estado === "cancelado";
            const isDelivered = poSelectedPedido.estado === "entregado";
            const isNCType = poSelectedPedido._tipo_comprobante?.includes("Nota de Crédito");
            const isEditable = poSelectedPedido.estado === "pendiente" || poSelectedPedido.estado === "armado";
            const estBadge = estadoBadge[poSelectedPedido.estado] || estadoBadge.pendiente;
            const itemsSubtotal = poEditItems.reduce((s, i) => s + i.precio_unitario * i.cantidad, 0);
            const descPct = poSelectedPedido._descuento_porcentaje || 0;
            const recPct = poSelectedPedido._recargo_porcentaje || 0;
            const envio = poSelectedPedido.costo_envio || 0;
            const computedTotal = isHistorial
              ? itemsSubtotal * (1 - descPct / 100) * (1 + recPct / 100)
              : itemsSubtotal + envio;

            return (
            <>
              {/* Header */}
              <div className="px-6 py-4 border-b bg-muted/30">
                <DialogHeader className="p-0 space-y-0">
                  <DialogTitle className="text-lg font-semibold flex items-center gap-2">
                    {isHistorial ? <Receipt className="w-5 h-5 text-primary" /> : <ShoppingCart className="w-5 h-5 text-primary" />}
                    {isHistorial ? `${poSelectedPedido._tipo_comprobante} #${poSelectedPedido.numero}` : `Pedido #${poSelectedPedido.numero}`}
                  </DialogTitle>
                </DialogHeader>
                <div className="flex items-center gap-3 mt-1">
                  <p className="text-xs text-muted-foreground">
                    {new Date(poSelectedPedido.created_at).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" })}
                    {poSelectedPedido.created_at.includes("T") && `, ${new Date(poSelectedPedido.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Argentina/Buenos_Aires" })}`}
                  </p>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${estBadge.bg} ${estBadge.text}`}>
                    {estBadge.label}
                  </span>
                  {!isHistorial && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-pink-50 text-pink-700 border border-pink-200">
                      <Globe className="w-3 h-3 mr-1" />Pedido Web
                    </span>
                  )}
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {/* Client + Delivery info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                      <User className="w-4 h-4" /> Cliente
                    </h3>
                    <div className="bg-muted/30 rounded-lg p-3 space-y-1.5 text-sm">
                      <p className="font-medium">{poSelectedPedido.nombre_cliente}</p>
                      {poSelectedPedido.email && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Mail className="w-3 h-3" />{poSelectedPedido.email}</p>}
                      {poSelectedPedido.telefono && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Phone className="w-3 h-3" />{poSelectedPedido.telefono}</p>}
                      {poSelectedPedido._domicilio && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="w-3 h-3" />{poSelectedPedido._domicilio}</p>}
                      {poSelectedPedido._cuit && <p className="text-xs text-muted-foreground">CUIT: {poSelectedPedido._cuit}</p>}
                    </div>
                  </div>
                  {/* Entrega */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                      <Truck className="w-4 h-4" /> Entrega
                    </h3>
                    <div className="bg-muted/30 rounded-lg p-3 space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        {(() => {
                          const me = poSelectedPedido.metodo_entrega;
                          if (me === "envio") return <><Truck className="w-4 h-4 text-blue-500" /><span className="font-medium">Envío a domicilio</span></>;
                          if (me === "retiro" || me === "retiro_local") return <><Store className="w-4 h-4 text-green-500" /><span className="font-medium">Retiro en local</span></>;
                          if (!me && isHistorial) return poSelectedPedido._entregado
                            ? <><CheckCircle className="w-4 h-4 text-green-500" /><span className="font-medium">Entregado</span></>
                            : <><Clock className="w-4 h-4 text-amber-500" /><span className="font-medium">Pendiente de entrega</span></>;
                          return me ? <span className="font-medium">{me}</span> : null;
                        })()}
                      </div>
                      {poSelectedPedido.direccion_texto && poSelectedPedido.metodo_entrega === "envio" && (
                        <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><MapPin className="w-3 h-3 mt-0.5 shrink-0" />{poSelectedPedido.direccion_texto}</p>
                      )}
                      {poSelectedPedido.fecha_entrega && (
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          {new Date(poSelectedPedido.fecha_entrega + "T12:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
                        </p>
                      )}
                      {poSelectedPedido._vendedor && poSelectedPedido._vendedor !== "—" && (
                        <p className="text-xs text-muted-foreground">Vendedor: {poSelectedPedido._vendedor}</p>
                      )}
                    </div>
                  </div>

                  {/* Pago */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                      <DollarSign className="w-4 h-4" /> Detalle de Pago
                    </h3>
                    <div className="bg-muted/30 rounded-lg p-3 space-y-2 text-sm">
                      {detailPagos.length > 0 ? (() => {
                        const ncPagos = detailPagos.filter(p => p.metodo.includes("Nota de Crédito"));
                        const realPagos = detailPagos.filter(p => !p.metodo.includes("Nota de Crédito") && !p.metodo.includes("(a cobrar)"));
                        const ncTotal = ncPagos.reduce((s, p) => s + p.monto, 0);
                        const pagadoTotal = realPagos.reduce((s, p) => s + p.monto, 0);
                        return (
                          <>
                            {realPagos.map((p, i) => (
                              <div key={i} className="flex items-center justify-between">
                                <span className="text-muted-foreground">{p.metodo}</span>
                                <span className="font-medium">{formatCurrency(p.monto)}</span>
                              </div>
                            ))}
                            {ncPagos.map((p, i) => (
                              <div key={`nc-${i}`}>
                                <div className="flex items-center justify-between">
                                  <span className="text-red-600">{p.metodo}</span>
                                  <span className="font-medium text-red-600">-{formatCurrency(p.monto)}</span>
                                </div>
                                {detailNCs.length > 0 && (
                                  <div className="mt-1 ml-2 space-y-0.5">
                                    {detailNCs.flatMap((nc) => nc.items).map((item, j) => (
                                      <div key={j} className="flex items-center justify-between text-[11px] text-red-500 pl-2 border-l-2 border-red-200">
                                        <span className="truncate mr-2">{item.cantidad}x {item.descripcion}</span>
                                        <span className="shrink-0">-{formatCurrency(item.subtotal)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                            <div className="border-t pt-2 flex items-center justify-between">
                              <span className="font-bold">Total</span>
                              <span className="font-bold text-base">{formatCurrency(pagadoTotal)}</span>
                            </div>
                          </>
                        );
                      })() : (
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{formatPago((poSelectedPedido as any).forma_pago || poSelectedPedido.metodo_pago)}</span>
                          <span className="font-bold">{formatCurrency(poSelectedPedido.total)}</span>
                        </div>
                      )}
                      {/* Cambiar método de pago — solo si no hay cobro confirmado y la orden está activa */}
                      {!isCancelled && !isDelivered && (poSelectedPedido.isOnline || poSelectedPedido.metodo_entrega === "envio") && detailPagos.filter(p => !p.metodo.includes("(a cobrar)") && !p.metodo.includes("Nota de Cr")).length === 0 && (
                        <div className="pt-1 border-t">
                          {!editandoPago ? (
                            <button onClick={() => setEditandoPago(true)} className="text-xs text-primary hover:underline font-medium">
                              Cambiar método de pago
                            </button>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Select defaultValue={(poSelectedPedido as any).forma_pago?.toLowerCase().replace(" ", "_") || poSelectedPedido.metodo_pago || "transferencia"} onValueChange={handleCambiarMetodoPago}>
                                <SelectTrigger className="h-7 text-xs flex-1">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="efectivo">Efectivo</SelectItem>
                                  <SelectItem value="transferencia">Transferencia</SelectItem>
                                  <SelectItem value="cuenta_corriente">Cuenta Corriente</SelectItem>
                                </SelectContent>
                              </Select>
                              <button onClick={() => setEditandoPago(false)} className="text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Registrar cobro — any order with pending amount */}
                {!isCancelled && poSelectedPedido.estado !== "cancelado" && (() => {
                  const pagado = detailPagos.filter(p => !p.metodo.includes("(a cobrar)")).reduce((s, p) => s + p.monto, 0);
                  const pendiente = Math.round((computedTotal - pagado) * 100) / 100;
                  if (pendiente < 1) return null;
                  const fp = ((poSelectedPedido as any).forma_pago || poSelectedPedido.metodo_pago || "").toLowerCase();
                  if (fp === "cuenta corriente" && !poSelectedPedido.isOnline) return null;
                  const clienteId = (poSelectedPedido as any)._clienteId || (poSelectedPedido as any).cliente_id;

                  return (
                    <CobroVentaSection
                      ventaId={(poSelectedPedido as any)._ventaId || (poSelectedPedido as any).venta_id || ""}
                      clienteId={clienteId || ""}
                      clienteNombre={poSelectedPedido.nombre_cliente || ""}
                      clienteSaldo={clienteSaldo}
                      montoVenta={computedTotal}
                      subtotalItems={itemsSubtotal}
                      costoEnvio={poSelectedPedido.costo_envio || 0}
                      recargoTransferencia={recargoTransferencia}
                      cuentasBancarias={cuentasBancarias}
                      defaultMetodo={(poSelectedPedido as any).forma_pago || poSelectedPedido.metodo_pago}
                      defaultEfectivo={(poSelectedPedido as any).monto_efectivo}
                      defaultTransferencia={(poSelectedPedido as any).monto_transferencia}
                      defaultCuentaAlias={(poSelectedPedido as any).cuenta_transferencia_alias}
                      onConfirmar={async (result: CobroVentaResult) => {
                        const hoy = todayARG();
                        const hora = nowTimeARG();
                        let ventaId = (poSelectedPedido as any)._ventaId || (poSelectedPedido as any).venta_id;
                        if (!ventaId) {
                          const { data: v } = await supabase.from("ventas").select("id").eq("numero", poSelectedPedido.numero).single();
                          ventaId = v?.id;
                        }
                        if (!ventaId) {
                          showAdminToast("Error: no se encontró la venta vinculada", "error");
                          return;
                        }

                        // Guard: check if already paid
                        const { count: existingPayments } = await supabase.from("caja_movimientos").select("id", { count: "exact", head: true }).eq("referencia_id", ventaId).eq("referencia_tipo", "venta");
                        if (existingPayments && existingPayments > 0) {
                          showAdminToast("Este pedido ya tiene cobro registrado", "error");
                          return;
                        }

                        // Build caja entries
                        const entries: any[] = [];
                        if (result.metodo === "Mixto") {
                          if (result.efectivo > 0) entries.push({ fecha: hoy, hora, tipo: "ingreso", descripcion: `Cobro #${poSelectedPedido.numero} (Efectivo)`, metodo_pago: "Efectivo", monto: result.efectivo, referencia_id: ventaId, referencia_tipo: "venta" });
                          if (result.transferencia > 0) {
                            entries.push({ fecha: hoy, hora, tipo: "ingreso", descripcion: `Cobro #${poSelectedPedido.numero} (Transferencia${result.surcharge > 0 ? ` +${recargoTransferencia}%` : ""})`, metodo_pago: "Transferencia", monto: result.transferencia + result.surcharge, referencia_id: ventaId, referencia_tipo: "venta", ...(result.cuentaBancaria ? { cuenta_bancaria: result.cuentaBancaria } : {}) });
                          }
                        } else if (result.metodo === "Cuenta Corriente") {
                          entries.push({ fecha: hoy, hora, tipo: "ingreso", descripcion: `Cobro #${poSelectedPedido.numero} (Cuenta Corriente)`, metodo_pago: "Cuenta Corriente", monto: result.monto, referencia_id: ventaId, referencia_tipo: "venta" });
                        } else {
                          if (result.monto > 0) {
                            entries.push({ fecha: hoy, hora, tipo: "ingreso", descripcion: `Cobro #${poSelectedPedido.numero}${result.surcharge > 0 ? ` (Transf +${recargoTransferencia}%)` : ""}`, metodo_pago: result.metodo, monto: result.metodo === "Transferencia" ? result.monto + result.surcharge : result.monto, referencia_id: ventaId, referencia_tipo: "venta", ...(result.metodo === "Transferencia" && result.cuentaBancaria ? { cuenta_bancaria: result.cuentaBancaria } : {}) });
                          }
                        }
                        if (entries.length > 0) await supabase.from("caja_movimientos").insert(entries);

                        // CC portion (Mixto remainder or full CC) — atomic saldo update
                        const ccAmount = result.cuentaCorriente;
                        if (ccAmount > 0 && clienteId) {
                          const { data: newSaldo } = await supabase.rpc("atomic_update_client_saldo", { p_client_id: clienteId, p_change: ccAmount });
                          const saldoAfter = newSaldo ?? 0;
                          await supabase.from("cuenta_corriente").insert({ cliente_id: clienteId, fecha: hoy, comprobante: `Cobro #${poSelectedPedido.numero}`, descripcion: result.metodo === "Cuenta Corriente" ? "A cuenta corriente" : "Saldo pendiente a cuenta corriente", debe: ccAmount, haber: 0, saldo: saldoAfter, forma_pago: result.metodo === "Cuenta Corriente" ? "Cuenta Corriente" : "Mixto", venta_id: ventaId });
                          setClienteSaldo(saldoAfter);
                        }

                        // Update venta
                        const ventaUpd: Record<string, any> = { forma_pago: result.metodo, monto_pagado: pagado + result.monto };
                        if (result.cuentaBancaria) ventaUpd.cuenta_transferencia_alias = result.cuentaBancaria;
                        if (result.surcharge > 0) {
                          ventaUpd.total = result.monto + result.surcharge;
                        }
                        await supabase.from("ventas").update(ventaUpd).eq("id", ventaId);

                        // FIFO allocation: update monto_pagado on old invoices
                        if (result.cobrarSaldo && result.saldoAllocations.length > 0) {
                          for (const alloc of result.saldoAllocations) {
                            if (alloc.aplicar <= 0) continue;
                            const { data: old } = await supabase.from("ventas").select("monto_pagado").eq("id", alloc.venta_id).single();
                            await supabase.from("ventas").update({ monto_pagado: ((old as any)?.monto_pagado || 0) + alloc.aplicar }).eq("id", alloc.venta_id);
                          }
                          const totalAllocated = result.saldoAllocations.reduce((s, a) => s + a.aplicar, 0);
                          if (totalAllocated > 0 && clienteId) {
                            const { data: newSaldo2 } = await supabase.rpc("atomic_update_client_saldo", { p_client_id: clienteId, p_change: -totalAllocated });
                            const saldoAfter2 = Math.max(0, newSaldo2 ?? 0);
                            await supabase.from("cuenta_corriente").insert({ cliente_id: clienteId, fecha: hoy, comprobante: `Cobro saldo #${poSelectedPedido.numero}`, descripcion: `Cobro deuda anterior (${result.saldoAllocations.length} comprobante${result.saldoAllocations.length > 1 ? "s" : ""})`, debe: 0, haber: totalAllocated, saldo: saldoAfter2, forma_pago: result.metodo, venta_id: null });
                            setClienteSaldo(saldoAfter2);
                          }
                        }

                        // Refresh payment breakdown
                        if (ventaId) {
                          const [{ data: movs }, { data: ccMovs }, { data: ncVentas }] = await Promise.all([
                            supabase.from("caja_movimientos").select("metodo_pago, monto, tipo, descripcion").eq("referencia_id", ventaId).eq("referencia_tipo", "venta").eq("tipo", "ingreso"),
                            supabase.from("cuenta_corriente").select("debe").eq("venta_id", ventaId),
                            supabase.from("ventas").select("id, total").eq("remito_origen_id", ventaId).ilike("tipo_comprobante", "Nota de Crédito%").neq("estado", "anulada"),
                          ]);
                          const newPagos: { metodo: string; monto: number }[] = [];
                          for (const m of movs || []) {
                            let label = m.metodo_pago;
                            if (m.metodo_pago === "Transferencia" && m.descripcion) {
                              const match = m.descripcion.match(/\+(\d+(?:\.\d+)?)%/);
                              if (match) label = `Transferencia (${match[1]}%)`;
                            }
                            const existing = newPagos.find((p) => p.metodo === label);
                            if (existing) existing.monto += m.monto;
                            else newPagos.push({ metodo: label, monto: m.monto });
                          }
                          const ccTotal = (ccMovs || []).reduce((s: number, c: any) => s + (c.debe || 0), 0);
                          if (ccTotal > 0) newPagos.push({ metodo: "Cuenta Corriente", monto: ccTotal });
                          const ncTotal = (ncVentas || []).reduce((s: number, nc: any) => s + (nc.total || 0), 0);
                          if (ncTotal > 0) newPagos.push({ metodo: "Nota de Crédito (devolución)", monto: ncTotal });
                          setDetailPagos(newPagos);
                        }
                        showAdminToast("Cobro registrado", "success");
                      }}
                    />
                  );
                })()}

                {poSelectedPedido.observacion && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                    <p className="font-medium text-amber-800 text-xs mb-1">Observacion:</p>
                    <p className="text-amber-700">{poSelectedPedido.observacion}</p>
                  </div>
                )}

                {/* Estado de entrega — stepper */}
                {!isCancelled && (() => {
                  const steps = ["pendiente", "armado", "entregado"] as const;
                  const stepLabels: Record<string, string> = { pendiente: "Pendiente", armado: "Armado", entregado: "Entregado" };
                  const currentIdx = steps.indexOf(poSelectedPedido.estado as any);
                  const isCompleted = poSelectedPedido.estado === "entregado" || poSelectedPedido.estado === "cerrada";

                  const advanceTo = async (val: string) => {
                    if (val === poSelectedPedido.estado) return;
                    await poHandleEstadoChange(poSelectedPedido, val);
                    setPoSelectedPedido({ ...poSelectedPedido, estado: val });
                    setPoPedidos(prev => prev.map(p => p.numero === poSelectedPedido.numero ? { ...p, estado: val } : p));
                    setVentas(prev => prev.map(v => v.numero === poSelectedPedido.numero ? { ...v, estado: val, entregado: val === "entregado" } as any : v));
                    showAdminToast(`Estado: ${stepLabels[val] || val}`, "success");
                  };

                  return (
                    <div className="space-y-3">
                      {/* Stepper */}
                      <div className="flex items-center gap-0">
                        {steps.map((step, i) => {
                          const isActive = i <= currentIdx || isCompleted;
                          const isCurrent = step === poSelectedPedido.estado || (isCompleted && step === "entregado");
                          return (
                            <div key={step} className="flex items-center flex-1 last:flex-none">
                              <button
                                type="button"
                                onClick={() => advanceTo(step)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                                  isCurrent
                                    ? "bg-emerald-600 text-white shadow-sm"
                                    : isActive
                                      ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                                      : "bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                                }`}
                              >
                                {isActive && !isCurrent ? (
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
                                ) : (
                                  <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center text-[9px] font-bold ${
                                    isCurrent ? "border-white bg-white/20 text-white" : "border-current"
                                  }`}>{i + 1}</span>
                                )}
                                {stepLabels[step]}
                              </button>
                              {i < steps.length - 1 && (
                                <div className={`flex-1 h-0.5 mx-1 rounded ${i < currentIdx || isCompleted ? "bg-emerald-300" : "bg-gray-200"}`} />
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Next action button */}
                      {!isCompleted && currentIdx < steps.length - 1 && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                          onClick={() => advanceTo(steps[currentIdx + 1])}
                        >
                          Avanzar a {stepLabels[steps[currentIdx + 1]]}
                        </Button>
                      )}
                    </div>
                  );
                })()}

                {/* Bank account info — read-only, shown only if already assigned */}
                {(poSelectedPedido as any).cuenta_transferencia_alias && detailPagos.some((p) => p.metodo.includes("Transferencia")) && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                    <span className="text-xs text-blue-700">Cuenta: <span className="font-semibold">{(poSelectedPedido as any).cuenta_transferencia_alias}</span></span>
                  </div>
                )}

                {/* Items table */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                      <Package className="w-4 h-4" /> {isNCType ? "Productos devueltos" : "Productos"} ({isNCType ? poEditItems.filter((i) => i.cantidad > 0).length : poEditItems.length})
                    </h3>
                    {isEditable && !isNCType && (
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setPoAddProductOpen(true)}>
                        <Plus className="w-3 h-3" /> Agregar producto
                      </Button>
                    )}
                  </div>

                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Producto</th>
                          <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground w-24">Presentacion</th>
                          <th className="text-center px-3 py-2 font-medium text-xs text-muted-foreground w-20">Cant.</th>
                          <th className="text-right px-3 py-2 font-medium text-xs text-muted-foreground w-24">Precio</th>
                          {isEditable && (
                            <th className="text-right px-3 py-2 font-medium text-xs text-muted-foreground w-20">Desc.%</th>
                          )}
                          {!isEditable && poEditItems.some((i) => (i.descuento || 0) > 0) && (
                            <th className="text-right px-3 py-2 font-medium text-xs text-muted-foreground w-16">Desc.</th>
                          )}
                          <th className="text-right px-3 py-2 font-medium text-xs text-muted-foreground w-24">Subtotal</th>
                          {isEditable && !isNCType && <th className="w-10"></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {(isNCType ? poEditItems.filter((i) => i.cantidad > 0) : poEditItems).map((item, idx) => {
                          const isCombo = poSelectedPedido._comboIds?.has(item.producto_id);
                          return (
                          <tr key={idx} className="border-b last:border-0">
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1.5">
                                {isCombo && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-black text-white tracking-wider shrink-0">COMBO</span>
                                )}
                                <span className="font-medium">{item.presentacion && item.presentacion !== "Unidad" ? item.nombre.replace(` - ${item.presentacion}`, "") : item.nombre}</span>
                              </div>
                              {item.codigo && <p className="text-[10px] text-muted-foreground font-mono">{item.codigo}</p>}
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">{item.presentacion}</td>
                            <td className="px-3 py-2 text-center">
                              {!isEditable || isNCType ? (
                                <span>{item.cantidad}</span>
                              ) : (
                                <Input
                                  type="number"
                                  min={1}
                                  value={item.cantidad}
                                  onChange={(e) => poUpdateItemQty(idx, Number(e.target.value))}
                                  className="h-7 w-16 text-center mx-auto"
                                />
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {formatCurrency(item.precio_unitario)}
                              {(item.unidades_por_presentacion || 1) > 1 && (
                                <p className="text-[10px] text-muted-foreground">{formatCurrency(item.precio_unitario / item.unidades_por_presentacion)} c/u</p>
                              )}
                            </td>
                            {isEditable && (
                              <td className="px-2 py-2">
                                <div className="flex items-center gap-0.5">
                                  <Input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={item.descuento || 0}
                                    onChange={(e) => poUpdateItemDiscount(idx, Number(e.target.value))}
                                    className="h-7 w-14 text-center"
                                  />
                                  <span className="text-xs text-muted-foreground">%</span>
                                </div>
                              </td>
                            )}
                            {!isEditable && poEditItems.some((i) => (i.descuento || 0) > 0) && (
                              <td className="px-3 py-2 text-right text-xs">{(item.descuento || 0) > 0 ? `-${item.descuento}%` : ""}</td>
                            )}
                            <td className="px-3 py-2 text-right font-semibold">{formatCurrency(item.precio_unitario * item.cantidad * (1 - (item.descuento || 0) / 100))}</td>
                            {isEditable && !isNCType && (
                              <td className="px-2 py-2">
                                <button
                                  onClick={() => poRemoveItem(idx)}
                                  className="text-muted-foreground hover:text-destructive disabled:opacity-30"
                                  disabled={poEditItems.length <= 1}
                                  title="Quitar producto"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            )}
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Totals */}
                  <div className="mt-3 space-y-1 text-sm text-right">
                    {(descPct > 0 || recPct > 0 || envio > 0) && (
                      <p className="text-muted-foreground">Subtotal: <span className="font-medium text-foreground">{formatCurrency(itemsSubtotal)}</span></p>
                    )}
                    {descPct > 0 && (
                      <p className="text-muted-foreground">Descuento ({descPct}%): <span className="font-medium text-red-500">-{formatCurrency(itemsSubtotal * descPct / 100)}</span></p>
                    )}
                    {envio > 0 && (
                      <p className="text-muted-foreground">Envio: <span className="font-medium text-foreground">{formatCurrency(envio)}</span></p>
                    )}
                    <p className="text-base font-bold">Total: {formatCurrency(poSelectedPedido.total)}</p>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-3 border-t bg-muted/30">
                <div>
                  {poHasChanges && (
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Cambios sin guardar
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={async () => {
                    try {
                      // Always fetch from DB to get fresh total/forma_pago (may have changed after cobro)
                      let v: VentaRow | undefined;
                      if (poSelectedPedido._ventaId || poSelectedPedido.numero) {
                        const { data: rows } = poSelectedPedido._ventaId
                          ? await supabase.from("ventas").select("*, clientes(nombre, cuit, domicilio, telefono, email)").eq("id", poSelectedPedido._ventaId).limit(1)
                          : await supabase.from("ventas").select("*, clientes(nombre, cuit, domicilio, telefono, email)").eq("numero", poSelectedPedido.numero).order("created_at", { ascending: false }).limit(1);
                        if (rows && rows.length > 0) v = rows[0] as VentaRow;
                      }
                      if (!v) {
                        v = ventas.find((vr) => vr.id === poSelectedPedido._ventaId);
                        if (!v) v = ventas.find((vr) => vr.numero === poSelectedPedido.numero);
                      }
                      if (v) {
                        if (poSelectedPedido.nombre_cliente && (poSelectedPedido._source === "pedidos" || poSelectedPedido.isOnline)) {
                          (v as any).clientes = {
                            nombre: poSelectedPedido.nombre_cliente,
                            cuit: (poSelectedPedido as any)._cuit || "",
                            domicilio: poSelectedPedido.direccion_texto || (poSelectedPedido as any)._domicilio || "",
                            telefono: poSelectedPedido.telefono || "",
                            email: poSelectedPedido.email || "",
                          };
                        }
                        setPoDetailOpen(false);
                        preparePrint(v);
                      } else {
                        showAdminToast("No se encontró la venta vinculada", "error");
                      }
                    } catch (err) {
                      showAdminToast("Error al preparar impresión", "error");
                    }
                  }}>
                    {poSelectedPedido && printedPedidos.has(poSelectedPedido.numero) ? <PrinterCheck className="w-3.5 h-3.5 mr-1.5" /> : <Printer className="w-3.5 h-3.5 mr-1.5" />}
                    {poSelectedPedido && printedPedidos.has(poSelectedPedido.numero) ? "Reimprimir" : "Imprimir"}
                  </Button>
                  <Button variant="outline" onClick={() => {
                    if (poHasChanges) {
                      setConfirmDialog({
                        open: true,
                        title: "Cambios sin guardar",
                        message: "Tenés cambios sin guardar. ¿Cerrar de todas formas?",
                        onConfirm: () => setPoDetailOpen(false),
                      });
                      return;
                    }
                    setPoDetailOpen(false);
                  }}>
                    Cerrar
                  </Button>
                  {poHasChanges && !isDelivered && (
                    <Button onClick={poHandleSave} disabled={poSaving}>
                      {poSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                      Guardar cambios
                    </Button>
                  )}
                </div>
              </div>
            </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* PO ADD PRODUCT DIALOG */}
      {/* ══════════════════════════════════════════════════════════ */}
      <Dialog open={poAddProductOpen} onOpenChange={(o) => { setPoAddProductOpen(o); if (!o) { setPoProductSearch(""); setPoProductResults([]); setPoSearchHighlight(0); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Plus className="w-4 h-4" /> Agregar producto al pedido
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre o código..."
                value={poProductSearch}
                onChange={(e) => poSearchProducts(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setPoSearchHighlight((h) => Math.min(h + 1, poProductResults.length - 1)); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setPoSearchHighlight((h) => Math.max(h - 1, 0)); }
                  else if (e.key === "Enter" && poProductResults.length > 0) { e.preventDefault(); poAddProduct(poProductResults[poSearchHighlight]); }
                  else if (e.key === "Escape") { setPoAddProductOpen(false); }
                }}
                className="pl-9"
                autoFocus
              />
            </div>
            {poSearchingProducts && <div className="text-center py-4"><Loader2 className="w-4 h-4 animate-spin mx-auto" /></div>}
            {poProductResults.length > 0 && (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {poProductResults.map((p, idx) => {
                  const highlighted = idx === poSearchHighlight;
                  const boxVariants = (!p.es_combo && p.presentaciones) ? p.presentaciones.filter((pr: any) => pr.unidades_por_presentacion > 1) : [];
                  const stockVal = p.stock ?? null;
                  return (
                    <div
                      key={p.id}
                      ref={highlighted ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
                      className={`rounded-xl border p-3 transition-colors ${highlighted ? "ring-2 ring-primary border-primary bg-muted/50" : "hover:border-primary/30 hover:bg-primary/5"}`}
                      onMouseEnter={() => setPoSearchHighlight(idx)}
                    >
                      <button onClick={() => poAddProduct(p)} className="w-full flex items-center gap-3 text-left">
                        <div className="w-11 h-11 rounded-lg bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                          {p.imagen_url ? <img src={p.imagen_url} alt="" className="w-full h-full object-cover" /> : <Package className="w-5 h-5 text-muted-foreground/30" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-sm truncate">{p.nombre}</span>
                            {p.es_combo && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-100 text-emerald-700 shrink-0">COMBO</span>}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                            <span className="font-mono">{p.codigo}</span>
                            <span>·</span>
                            {stockVal !== null && <><span>Stock: <strong className={stockVal <= 0 ? "text-red-500" : ""}>{stockVal}</strong></span><span>·</span></>}
                            <span className="font-semibold text-foreground">{formatCurrency(p.precio)}</span>
                          </div>
                        </div>
                      </button>
                      {boxVariants.length > 0 && (
                        <div className="flex gap-2 mt-2.5 pl-14">
                          <Button size="sm" variant="outline" className="h-8 text-xs flex-1" onClick={() => poAddProduct(p)}>+ Unidad</Button>
                          {boxVariants.map((pr, i) => (
                            <Button key={i} size="sm" className="h-8 text-xs flex-1" onClick={() => poAddProduct(p, pr)}>
                              + {pr.nombre} ({pr.unidades_por_presentacion} un.)
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {poProductSearch.length >= 2 && !poSearchingProducts && poProductResults.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No se encontraron productos</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* PO CANCEL CONFIRMATION DIALOG */}
      {/* ══════════════════════════════════════════════════════════ */}
      <Dialog open={!!poCancelPedido} onOpenChange={(open) => { if (!open) setPoCancelPedido(null); }}>
        <DialogContent className="max-w-sm">
          <div className="text-center pt-2">
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-7 h-7 text-red-500" />
            </div>
            <DialogHeader className="text-center">
              <DialogTitle className="text-center text-lg">Cancelar este pedido?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground mt-2">Se revertira el stock y los movimientos de caja</p>
            {poCancelPedido && (
              <>
                <p className="font-mono font-bold mt-3 text-base">#{poCancelPedido.numero}</p>
                <p className="text-sm text-muted-foreground">{poCancelPedido.nombre_cliente} &middot; {formatCurrency(poCancelPedido.total)}</p>
                <div className="flex gap-2 mt-5">
                  <Button variant="outline" className="flex-1" onClick={() => setPoCancelPedido(null)} disabled={poCancelling}>
                    No, volver
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    disabled={poCancelling}
                    onClick={async () => {
                      setPoCancelling(true);
                      await poHandleEstadoChange(poCancelPedido, "cancelado");
                      setPoCancelling(false);
                      setPoCancelPedido(null);
                    }}
                  >
                    {poCancelling ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Si, cancelar
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Print preview dialog */}
      {printSaleObj && (
        <PrintPreviewDialog
          open={printPreviewOpen}
          onClose={() => { setPrintPreviewOpen(false); setPrintSaleObj(null); }}
          config={receiptConfig}
          sale={printSaleObj}
          title={`Vista previa — ${printSaleObj.tipoComprobante} N° ${printSaleObj.numero}`}
        />
      )}

      {/* Confirm Dialog */}
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

      {/* Entregar Dialog — ask about payment before marking as delivered */}
      <Dialog open={entregarDialog.open} onOpenChange={(o) => setEntregarDialog(prev => ({ ...prev, open: o }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Marcar como entregado</DialogTitle></DialogHeader>
          {entregarDialog.order && (() => {
            const order = entregarDialog.order!;
            const fp = order.forma_pago || order.metodo_pago || "Efectivo";
            return (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  El pedido <span className="font-semibold">#{order.numero}</span> tiene pago pendiente.
                </p>
                <p className="text-sm text-gray-600">
                  El cliente eligió: <span className="font-semibold">{fp}</span>
                </p>
                <div className="flex flex-col gap-2 pt-2">
                  <Button
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => {
                      setEntregarDialog({ open: false, order: null });
                      poOpenDetail(order);
                    }}
                  >
                    <DollarSign className="w-4 h-4 mr-2" />
                    Registrar cobro
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={async () => {
                      setEntregarDialog({ open: false, order: null });
                      // Auto-register payment with original method and mark as delivered
                      const hoy = todayARG();
                      const hora = nowTimeARG();
                      let ventaId = (order as any)._ventaId || (order as any).venta_id;
                      if (!ventaId) {
                        const { data: v } = await supabase.from("ventas").select("id").eq("numero", order.numero).single();
                        ventaId = v?.id;
                      }

                      // Guard: check if already paid (cobro was registered separately)
                      if (ventaId) {
                        const { count } = await supabase.from("caja_movimientos").select("id", { count: "exact", head: true }).eq("referencia_id", ventaId).eq("referencia_tipo", "venta");
                        if (count && count > 0) {
                          // Already has payment — just mark as entregado
                          await supabase.from("ventas").update({ entregado: true, estado: "entregado" }).eq("id", ventaId);
                          await supabase.from("pedidos_tienda").update({ estado: "entregado" }).eq("numero", order.numero);
                          await poHandleEstadoChange(order, "entregado");
                          setPoPedidos(prev => prev.map(p => p.numero === order.numero ? { ...p, estado: "entregado" } : p));
                          setVentas(prev => prev.map(v => v.numero === order.numero ? { ...v, estado: "entregado", entregado: true } : v));
                          showAdminToast("Marcado como entregado (cobro ya registrado)", "success");
                          return;
                        }
                      }

                      const clienteIdOrder = (order as any)._clienteId || (order as any).cliente_id;
                      const metodo = fp.toLowerCase().includes("cuenta") ? "Cuenta Corriente"
                        : fp.toLowerCase().includes("transfer") ? "Transferencia"
                        : "Efectivo";

                      if (ventaId) {
                        if (metodo === "Cuenta Corriente" && clienteIdOrder) {
                          // CC: add to saldo + register in caja
                          const { data: nuevoSaldoData } = await supabase.rpc("atomic_update_client_saldo", { p_client_id: clienteIdOrder, p_change: order.total });
                          const newSaldo = nuevoSaldoData ?? 0;
                          await supabase.from("cuenta_corriente").insert({ cliente_id: clienteIdOrder, fecha: hoy, comprobante: `Cobro #${order.numero}`, descripcion: "A cuenta corriente", debe: order.total, haber: 0, saldo: newSaldo, forma_pago: "Cuenta Corriente", venta_id: ventaId });
                          await supabase.from("caja_movimientos").insert({ fecha: hoy, hora, tipo: "ingreso", descripcion: `Cobro #${order.numero} (Cuenta Corriente)`, metodo_pago: "Cuenta Corriente", monto: order.total, referencia_id: ventaId, referencia_tipo: "venta" });
                        } else {
                          // Efectivo or Transferencia: caja entry
                          // Use pre-surcharge base (subtotal + envio) to avoid double-charging
                          // online orders whose total already includes the transfer surcharge
                          const orderBase = ((order as any).subtotal || 0) + ((order as any).costo_envio || 0) || order.total;
                          const surchargeAmt = metodo === "Transferencia" && recargoTransferencia > 0 ? Math.round(orderBase * recargoTransferencia / 100) : 0;
                          await supabase.from("caja_movimientos").insert({ fecha: hoy, hora, tipo: "ingreso", descripcion: `Cobro #${order.numero}${surchargeAmt > 0 ? ` (Transf +${recargoTransferencia}%)` : ""}`, metodo_pago: metodo, monto: orderBase + surchargeAmt, referencia_id: ventaId, referencia_tipo: "venta" });
                          if (surchargeAmt > 0) {
                            await supabase.from("ventas").update({ total: orderBase + surchargeAmt }).eq("id", ventaId);
                          }
                        }
                        await supabase.from("ventas").update({ forma_pago: metodo, monto_pagado: order.total, entregado: true, estado: "entregado" }).eq("id", ventaId);
                        await supabase.from("pedidos_tienda").update({ estado: "entregado" }).eq("numero", order.numero);
                      }
                      await poHandleEstadoChange(order, "entregado");
                      setPoPedidos(prev => prev.map(p => p.numero === order.numero ? { ...p, estado: "entregado" } : p));
                      setVentas(prev => prev.map(v => v.numero === order.numero ? { ...v, estado: "entregado", entregado: true } : v));
                      showAdminToast(`Entregado con pago ${metodo}`, "success");
                    }}
                  >
                    <Truck className="w-4 h-4 mr-2" />
                    Entregar con pago original ({fp})
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
