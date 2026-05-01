"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { buildStockUpdate } from "@/lib/stock-utils";
import { norm } from "@/lib/utils";
import { todayARG, nowTimeARG, formatCurrency, formatDatePDF, currentMonthPadded } from "@/lib/formatters";
import { recalcFromVenta, calcTotalConNC } from "@/lib/order-calc";
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
import { useRouter } from "next/navigation";
import { defaultReceiptConfig } from "@/components/receipt-print-view";
import type { ReceiptConfig, ReceiptLineItem, ReceiptSale } from "@/components/receipt-print-view";
import { PrintPreviewDialog } from "@/components/print-preview-dialog";
import { useCurrentUser } from "@/hooks/use-current-user";
import { CobroVentaSection } from "@/components/cobro-venta-section";
import type { CobroVentaResult, CobroPreview } from "@/components/cobro-venta-section";
import { VentaDetailDialog } from "@/components/venta-detail-dialog";

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
  monto_pagado: number;
  remito_origen_id: string | null;
  impreso_at: string | null;
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
  _monto_pagado?: number;
  _remito_origen_id?: string | null;
  _impreso_at?: string | null;
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
  const router = useRouter();
  const currentUser = useCurrentUser();
  // ─── Unified source filter ───
  const [filterSource, setFilterSource] = useState<"todos" | "pos" | "online">("todos");
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void }>({ open: false, title: "", message: "", onConfirm: () => {} });
  const [entregarDialog, setEntregarDialog] = useState<{ open: boolean; order: Pedido | null }>({ open: false, order: null });
  // Prompt para mandar mensaje de WhatsApp al cliente cuando se marca un retiro como armado.
  const [waPrompt, setWaPrompt] = useState<{ open: boolean; telefono: string; mensaje: string; nombreCliente: string }>({ open: false, telefono: "", mensaje: "", nombreCliente: "" });

  // ══════════════════════════════════════════════════════════════
  // HISTORIAL DE VENTAS STATE
  // ══════════════════════════════════════════════════════════════
  const [ventas, setVentas] = useState<VentaRow[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; order: Pedido } | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filterOrigen, setFilterOrigen] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterPayment, setFilterPayment] = useState("all");
  const [filterBanco, setFilterBanco] = useState("all");
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
  const [cobroPreview, setCobroPreview] = useState<CobroPreview | null>(null);
  const [showCuentaSelector, setShowCuentaSelector] = useState(false);
  const [ncPorVenta, setNcPorVenta] = useState<Record<string, number>>({});
  const [detailPagos, setDetailPagos] = useState<{ metodo: string; monto: number; cuenta_bancaria?: string | null }[]>([]);
  const [detailCobroSaldo, setDetailCobroSaldo] = useState<{ metodo: string; monto: number; fecha?: string }[]>([]);
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
  const [poPresHighlight, setPoPresHighlight] = useState(0);

  // ══════════════════════════════════════════════════════════════
  // HISTORIAL LOGIC
  // ══════════════════════════════════════════════════════════════

  const fetchVentas = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("ventas")
      .select("*, remito_origen_id, created_at, cuenta_transferencia_alias, clientes(id, nombre, cuit, tipo_factura, domicilio, telefono, email, situacion_iva, localidad, provincia, codigo_postal, numero_documento)")
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false });

    if (filterOrigen === "pos") query = query.or("origen.eq.pos,origen.is.null");
    else if (filterOrigen === "tienda") query = query.eq("origen", "tienda");
    if (filterType !== "all") query = query.eq("tipo_comprobante", filterType);
    if (filterPayment !== "all") {
      // Include Mixto when the user filters by a specific method: Mixto orders
      // may contain Efectivo/Transferencia/CC components. The exact split is
      // visible in the detail dialog.
      if (filterPayment === "Transferencia") {
        query = query.or("forma_pago.eq.Transferencia,and(forma_pago.eq.Mixto,monto_transferencia.gt.0)");
      } else if (filterPayment === "Efectivo") {
        query = query.or("forma_pago.eq.Efectivo,and(forma_pago.eq.Mixto,monto_efectivo.gt.0)");
      } else if (filterPayment === "Cuenta Corriente") {
        query = query.in("forma_pago", ["Cuenta Corriente", "Mixto"]);
      } else {
        query = query.eq("forma_pago", filterPayment);
      }
    }
    // Note: filterBanco is NOT applied server-side because chaining multiple
    // .or() calls in supabase-js drops all but the last (one "or=" URL param
    // wins). The banco match happens client-side via .includes() so both
    // "alias" and "Nombre — alias" formats are supported.

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
    setLimitReached(data?.length === 200);
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

    // Batch fetch NCs linked to these ventas
    const ventaIds = results.filter(v => !v.tipo_comprobante.includes("Nota de Crédito")).map(v => v.id);
    if (ventaIds.length > 0) {
      const { data: ncs } = await supabase
        .from("ventas")
        .select("remito_origen_id, total")
        .in("remito_origen_id", ventaIds)
        .ilike("tipo_comprobante", "Nota de Crédito%")
        .neq("estado", "anulada");
      const map: Record<string, number> = {};
      (ncs || []).forEach((nc: any) => {
        if (nc.remito_origen_id) map[nc.remito_origen_id] = (map[nc.remito_origen_id] || 0) + (nc.total || 0);
      });
      setNcPorVenta(map);
    } else {
      setNcPorVenta({});
    }

    setLoading(false);
  }, [quickPeriod, filterOrigen, filterType, filterPayment, filterBanco, filterMode, filterDay, filterMonth, filterYear, filterFrom, filterTo, searchClient]);

  useEffect(() => { fetchVentas(); }, [fetchVentas]);
  // Fetch all reference data in parallel on mount
  useEffect(() => {
    // Synchronous localStorage reads
    try {
      const stored = localStorage.getItem("receipt_config");
      if (stored) setReceiptConfig((prev) => ({ ...prev, ...JSON.parse(stored) }));
    } catch (err) { console.error("Error loading receipt config:", err); }

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

  const handleContextMenu = (e: React.MouseEvent, order: Pedido) => {
    e.preventDefault();
    e.stopPropagation();
    const menuWidth = 220;
    const menuHeight = 360;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = e.clientX;
    let y = e.clientY;
    if (x + menuWidth > vw - 8) x = vw - menuWidth - 8;
    if (y + menuHeight > vh - 8) y = vh - menuHeight - 8;
    if (y < 8) y = 8;
    setContextMenu({ x, y, order });
  };

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("click", close);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", close, true);
    };
  }, [contextMenu]);

  const openDetail = async (v: VentaRow) => {
    const [{ data }, { data: movData }, { data: clienteData }, { data: cobroSaldoData }] = await Promise.all([
      supabase.from("venta_items").select("*").eq("venta_id", v.id).order("created_at"),
      supabase.from("caja_movimientos").select("metodo_pago, monto, descripcion").eq("referencia_id", v.id).eq("referencia_tipo", "venta").eq("tipo", "ingreso"),
      v.cliente_id ? supabase.from("clientes").select("saldo").eq("id", v.cliente_id).single() : Promise.resolve({ data: null }),
      supabase.from("caja_movimientos").select("metodo_pago, monto, descripcion, created_at").eq("referencia_id", v.id).eq("referencia_tipo", "cobro_saldo").eq("tipo", "ingreso"),
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
    // Cobro saldo entries (money collected for old debts as part of this sale)
    const cobroSaldoEntries = (cobroSaldoData || []).map((cs: any) => ({
      metodo: cs.metodo_pago, monto: cs.monto,
      fecha: cs.created_at ? new Date(cs.created_at).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "",
    }));
    setDetailCobroSaldo(cobroSaldoEntries);
    const saldoCargado = (clienteData as any)?.saldo ?? 0;
    setClienteSaldo(saldoCargado);
    if (v.cliente_id && saldoCargado === 0) {
      supabase.from("clientes").select("saldo").eq("id", v.cliente_id).single().then(({ data: freshCliente }) => {
        const saldoFresh = (freshCliente as any)?.saldo ?? 0;
        if (saldoFresh > 0) setClienteSaldo(saldoFresh);
      });
    }

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
      _monto_pagado: v.monto_pagado || 0,
      isOnline: v.origen === "tienda" || v.tipo_comprobante === "Pedido Web",
    };

    // Fetch stock for each product to show in edit mode
    const prodIds = pedidoItems.map((i) => i.producto_id).filter(Boolean);
    if (prodIds.length > 0) {
      const { data: stockData } = await supabase
        .from("productos")
        .select("id, stock")
        .in("id", prodIds);
      if (stockData) {
        const stockMap: Record<string, number> = {};
        for (const s of stockData) stockMap[s.id] = s.stock;
        for (const item of pedidoItems) {
          if (item.producto_id && stockMap[item.producto_id] !== undefined) {
            (item as any).stock = stockMap[item.producto_id];
          }
        }
      }
    }

    setPoSelectedPedido(pseudoPedido);
    setCobroPreview(null);
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
      // For regular ventas: stock was TAKEN (sale) → reverse ADDS back (+qty)
      // For NCs: stock was RETURNED (devolucion) → reverse TAKES back out (-qty)
      const isNCAnul = v.tipo_comprobante?.includes("Nota de Crédito");
      const stockDirection = isNCAnul ? -1 : 1; // NC anulation: subtract; regular: add

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
            const unitsChange = item.cantidad * (ci as any).cantidad * stockDirection;
            const newStock = compProd.stock + unitsChange;
            const { error: updErr } = await supabase.from("productos").update(buildStockUpdate(newStock, compProd.stock)).eq("id", (ci as any).producto_id);
            if (updErr) { errores.push(`Error stock combo: ${updErr.message}`); continue; }
            await supabase.from("stock_movimientos").insert({
              producto_id: (ci as any).producto_id,
              tipo: "anulacion",
              cantidad_antes: compProd.stock,
              cantidad_despues: newStock,
              cantidad: unitsChange,
              referencia: `Anulación ${isNCAnul ? "NC" : "Venta"} #${v.numero}`,
              descripcion: `Anulación ${isNCAnul ? "nota de crédito" : "venta"} - ${(ci as any).productos?.nombre || item.descripcion}${motivoTexto}`,
              usuario: currentUser?.nombre || "Admin Sistema",
              orden_id: v.id,
            });
          }
        } else {
          let upp = item.unidades_por_presentacion || 1;
          if (upp === 1 && item.presentacion && item.presentacion !== "Unidad") {
            const match = item.presentacion.toLowerCase().match(/x\s*(\d+)/);
            if (match) upp = Number(match[1]);
          }
          const unitsChange = item.cantidad * upp * stockDirection;
          const newStock = prod.stock + unitsChange;
          const { error: updErr } = await supabase.from("productos").update(buildStockUpdate(newStock, prod.stock)).eq("id", item.producto_id);
          if (updErr) { errores.push(`Error stock ${item.descripcion}: ${updErr.message}`); continue; }
          await supabase.from("stock_movimientos").insert({
            producto_id: item.producto_id,
            tipo: "anulacion",
            cantidad_antes: prod.stock,
            cantidad_despues: newStock,
            cantidad: unitsChange,
            referencia: `Anulación ${isNCAnul ? "NC" : "Venta"} #${v.numero}`,
            descripcion: `Anulación ${isNCAnul ? "nota de crédito" : "venta"} - ${item.descripcion}${motivoTexto}`,
            usuario: currentUser?.nombre || "Admin Sistema",
            orden_id: v.id,
          });
        }
      }

      // 3. Reverse ALL caja_movimientos linked to this venta (immutable ledger — append cancelacion entries)
      // 3a. Direct payment entries (referencia_tipo = 'venta' or 'cobro_saldo')
      const { data: cajaDirectRows } = await supabase
        .from("caja_movimientos")
        .select("*")
        .eq("referencia_id", v.id)
        .in("referencia_tipo", ["venta", "cobro_saldo"])
        .eq("tipo", "ingreso");

      // 3a-fallback. Find cobro_saldo entries without referencia_id (old entries, search by description)
      const cobroSaldoFromDesc: any[] = [];
      if (!(cajaDirectRows || []).some((r: any) => r.referencia_tipo === "cobro_saldo")) {
        const { data: descSearch } = await supabase
          .from("caja_movimientos")
          .select("*")
          .eq("tipo", "ingreso")
          .eq("referencia_tipo", "cobro_saldo")
          .ilike("descripcion", `%Venta #${v.numero}%`);
        if (descSearch && descSearch.length > 0) {
          cobroSaldoFromDesc.push(...descSearch);
        }
      }

      // 3b. Cobro entries from atomic_register_cobro_v2 (referencia_tipo = 'cobro', referencia_id = cobro_id)
      const { data: cobroItemRows } = await supabase
        .from("cobro_items")
        .select("cobro_id, monto_aplicado")
        .eq("venta_id", v.id);
      const cobroIds = (cobroItemRows || []).map((ci: any) => ci.cobro_id).filter(Boolean);
      let cajaCobroRows: any[] = [];
      if (cobroIds.length > 0) {
        const { data: cobrosData } = await supabase
          .from("caja_movimientos")
          .select("*")
          .in("referencia_id", cobroIds)
          .eq("referencia_tipo", "cobro")
          .eq("tipo", "ingreso");
        cajaCobroRows = cobrosData || [];
      }

      // 3c. Collect all caja entries to reverse
      const allCajaToReverse = [...(cajaDirectRows || []), ...cajaCobroRows, ...cobroSaldoFromDesc];

      // 3d. Check for already-reversed entries (idempotency — don't reverse twice)
      const existingAnulacionIds = new Set<string>();
      if (allCajaToReverse.length > 0) {
        const { data: existingReversals } = await supabase
          .from("caja_movimientos")
          .select("referencia_id")
          .eq("referencia_tipo", "anulacion")
          .eq("tipo", "cancelacion")
          .in("referencia_id", [v.id, ...cobroIds]);
        for (const r of existingReversals || []) existingAnulacionIds.add((r as any).referencia_id);
      }

      // 3e. Insert cancelacion entries for each payment (append-only ledger)
      for (const cm of allCajaToReverse) {
        // For cobro entries, use the cobro_id as referencia; for direct, use venta.id
        const refId = cobroIds.includes((cm as any).referencia_id) ? (cm as any).referencia_id : v.id;
        // Skip if already reversed
        if (existingAnulacionIds.has(refId)) continue;

        // For cobro entries that cover multiple ventas, only reverse the portion allocated to this venta
        let montoToReverse = (cm as any).monto;
        if ((cm as any).referencia_tipo === "cobro" && cobroItemRows) {
          const thisCobroItems = cobroItemRows.filter((ci: any) => ci.cobro_id === (cm as any).referencia_id);
          const allocatedToThisVenta = thisCobroItems.reduce((s: number, ci: any) => s + (ci.monto_aplicado || 0), 0);
          // If the cobro covers multiple ventas, only reverse the portion for this venta
          if (allocatedToThisVenta > 0 && allocatedToThisVenta < montoToReverse) {
            montoToReverse = allocatedToThisVenta;
          }
        }

        const { error: cajaErr } = await supabase.from("caja_movimientos").insert({
          fecha: hoy, hora,
          tipo: "cancelacion",
          descripcion: `Cancelación Venta #${v.numero}${motivoTexto}`,
          metodo_pago: (cm as any).metodo_pago,
          monto: montoToReverse,
          referencia_id: v.id,
          referencia_tipo: "anulacion",
          cuenta_bancaria: (cm as any).cuenta_bancaria || null,
        });
        if (cajaErr) errores.push(`Error caja: ${cajaErr.message}`);
      }

      // 4. Reverse cuenta_corriente entries and update client saldo via atomic RPC
      if (v.cliente_id) {
        // 4a. CC entries linked directly to this venta
        const { data: ccRows } = await supabase
          .from("cuenta_corriente")
          .select("*")
          .eq("venta_id", v.id);

        // 4b. CC entries linked to cobros that allocated to this venta
        let ccCobroRows: any[] = [];
        if (cobroIds.length > 0) {
          // The cobro RPC inserts CC with venta_id = NULL but comprobante = cobro numero
          // Find cobro records to get their numeros
          const { data: cobrosInfo } = await supabase
            .from("cobros")
            .select("id, numero")
            .in("id", cobroIds);
          if (cobrosInfo && cobrosInfo.length > 0) {
            const cobroNumeros = cobrosInfo.map((c: any) => c.numero);
            const { data: ccCobros } = await supabase
              .from("cuenta_corriente")
              .select("*")
              .eq("cliente_id", v.cliente_id)
              .in("comprobante", cobroNumeros);
            ccCobroRows = ccCobros || [];
          }
        }

        // 4c. CC entries from POS cobrar saldo (linked to OLD ventas, search by comprobante/desc)
        let ccCobroSaldoRows: any[] = [];
        const { data: ccSaldoSearch } = await supabase
          .from("cuenta_corriente")
          .select("*")
          .eq("cliente_id", v.cliente_id)
          .or(`comprobante.ilike.%Venta #${v.numero}%,descripcion.ilike.%Venta #${v.numero}%`);
        if (ccSaldoSearch) {
          // Only include entries NOT already in ccRows (avoid duplicates)
          const existingIds = new Set((ccRows || []).map((r: any) => r.id));
          ccCobroSaldoRows = ccSaldoSearch.filter((r: any) => !existingIds.has(r.id));
        }

        const allCCToReverse = [...(ccRows || []), ...ccCobroRows, ...ccCobroSaldoRows];

        // Also account for cobro_saldo: those amounts were subtracted from saldo
        // but their CC entries reference OLD ventas (not this one). Add them back.
        const cobroSaldoAmount = allCajaToReverse
          .filter((c: any) => c.referencia_tipo === "cobro_saldo")
          .reduce((s: number, c: any) => s + c.monto, 0);

        if (allCCToReverse.length > 0 || cobroSaldoAmount > 0) {
          // Calculate total saldo change from reversing CC entries + cobro saldo
          const ccChange = allCCToReverse.reduce((acc, cc) => acc - (cc as any).debe + (cc as any).haber, 0);
          const totalChange = ccChange + cobroSaldoAmount; // cobro saldo adds back to saldo

          // Atomic saldo update via RPC
          const { data: nuevoSaldo, error: saldoErr } = await supabase.rpc("atomic_update_client_saldo", {
            p_client_id: v.cliente_id,
            p_change: totalChange,
          });
          if (saldoErr) { errores.push(`Error actualizando saldo: ${saldoErr.message}`); }

          // Insert reversal CC entries with the new running saldo
          if (!saldoErr && nuevoSaldo != null) {
            let saldoRunning = nuevoSaldo;
            for (let i = allCCToReverse.length - 1; i >= 0; i--) {
              const cc = allCCToReverse[i];
              const reversalDebe = (cc as any).haber;
              const reversalHaber = (cc as any).debe;
              await supabase.from("cuenta_corriente").insert({
                cliente_id: v.cliente_id,
                fecha: hoy,
                comprobante: `Anulación Venta #${v.numero}`,
                descripcion: `Anulación de venta${motivoTexto}`,
                debe: reversalDebe,
                haber: reversalHaber,
                saldo: saldoRunning,
                forma_pago: "Anulación",
                venta_id: v.id,
              });
              // Update running saldo for next entry
              saldoRunning = saldoRunning + reversalDebe - reversalHaber;
            }
          }
          // If cobro saldo was reversed, restore monto_pagado on old ventas + add CC entry
          if (cobroSaldoAmount > 0) {
            // Find the CC haber entries from cobro saldo (they have venta_id of OLD ventas)
            const { data: cobroSaldoCCEntries } = await supabase
              .from("cuenta_corriente")
              .select("venta_id, haber")
              .eq("cliente_id", v.cliente_id)
              .gt("haber", 0)
              .ilike("comprobante", "Cobro saldo%");
            // Reduce monto_pagado on each old venta that was paid by the cobro
            for (const ccEntry of cobroSaldoCCEntries || []) {
              if (!ccEntry.venta_id || ccEntry.haber <= 0) continue;
              const { data: oldVenta } = await supabase.from("ventas").select("monto_pagado").eq("id", ccEntry.venta_id).single();
              if (oldVenta) {
                const newMp = Math.max(0, (oldVenta.monto_pagado || 0) - ccEntry.haber);
                await supabase.from("ventas").update({ monto_pagado: newMp }).eq("id", ccEntry.venta_id);
              }
            }
            // CC entry to document the reversal
            await supabase.from("cuenta_corriente").insert({
              cliente_id: v.cliente_id,
              fecha: hoy,
              comprobante: `Anulación Venta #${v.numero}`,
              descripcion: `Reversión cobro saldo anterior${motivoTexto}`,
              debe: cobroSaldoAmount,
              haber: 0,
              saldo: nuevoSaldo,
              forma_pago: "Anulación",
              venta_id: v.id,
            });
          }
        }
      }

      // 5. If errors occurred, abort anulación
      if (errores.length > 0) {
        throw new Error(`Error en anulación: ${errores.join(". ")}. Venta NO anulada.`);
      }

      // 6. Race condition guard: re-fetch estado before marking
      const { data: freshVenta } = await supabase.from("ventas").select("estado").eq("id", v.id).single();
      if (freshVenta?.estado === "anulada") throw new Error("Esta venta ya fue anulada por otro usuario.");

      // 7. Mark venta as anulada + reset monto_pagado (compare-and-swap: only if not already anulada)
      const { data: anularRows, error: anularErr } = await supabase.from("ventas").update({
        estado: "anulada",
        monto_pagado: 0,
        observacion: v.observacion
          ? `${v.observacion} | ANULADA${motivoTexto}`
          : `ANULADA${motivoTexto}`,
      }).eq("id", v.id).neq("estado", "anulada").select("id");
      if (anularErr) throw new Error(`Error marcando como anulada: ${anularErr.message}`);
      if (!anularRows || anularRows.length === 0) throw new Error("Esta venta ya fue anulada por otro usuario.");

      // 8. Sync to pedidos_tienda so client sees "cancelado"
      await supabase.from("pedidos_tienda").update({ estado: "cancelado" }).eq("numero", v.numero);

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

  const handleRegistrarCobro = async (result: CobroVentaResult) => {
    if (!poSelectedPedido) return;
    const hoy = todayARG();
    const hora = nowTimeARG();
    let ventaId = (poSelectedPedido as any)._ventaId || (poSelectedPedido as any).venta_id;
    if (!ventaId) {
      const { data: v } = await supabase
        .from("ventas")
        .select("id")
        .eq("numero", poSelectedPedido.numero)
        .not("tipo_comprobante", "ilike", "Factura%")
        .not("tipo_comprobante", "ilike", "Nota de Crédito%")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      ventaId = v?.id;
    }
    if (!ventaId) {
      showAdminToast("Error: no se encontró la venta vinculada", "error");
      return;
    }

    // If "cobrar en entrega": only update forma_pago, no caja entry
    if (result.cobrarEnEntrega) {
      await supabase.from("ventas").update({ forma_pago: result.metodo }).eq("id", ventaId);
      if (poSelectedPedido.numero) await supabase.from("pedidos_tienda").update({ metodo_pago: result.metodo.toLowerCase().replace(" ", "_") }).eq("numero", poSelectedPedido.numero);
      showAdminToast(`Método de pago actualizado a ${result.metodo}. Se cobrará en entrega.`, "success");
      setPoSelectedPedido(null);
      return;
    }

    // Guard: check venta is not anulada
    const { data: ventaCheck } = await supabase.from("ventas").select("estado").eq("id", ventaId).single();
    if (ventaCheck?.estado === "anulada") {
      showAdminToast("No se puede cobrar una venta anulada", "error");
      return;
    }

    // Guard: check if already paid
    const { count: existingPayments } = await supabase.from("caja_movimientos").select("id", { count: "exact", head: true }).eq("referencia_id", ventaId).eq("referencia_tipo", "venta");
    if (existingPayments && existingPayments > 0) {
      showAdminToast("Este pedido ya tiene cobro registrado", "error");
      return;
    }

    // Compute pagado and clienteId
    const pagado = detailPagos.filter(p => !p.metodo.includes("(a cobrar)") && !p.metodo.includes("Nota de Cr")).reduce((s, p) => s + p.monto, 0);
    const clienteId = (poSelectedPedido as any)._clienteId || (poSelectedPedido as any).cliente_id;

    // Build caja entries
    const entries: any[] = [];
    if (result.metodo === "Mixto") {
      if (result.efectivo > 0) entries.push({ fecha: hoy, hora, tipo: "ingreso", descripcion: `Cobro #${poSelectedPedido.numero} (Efectivo)`, metodo_pago: "Efectivo", monto: result.efectivo, referencia_id: ventaId, referencia_tipo: "venta" });
      if (result.transferencia > 0) {
        entries.push({ fecha: hoy, hora, tipo: "ingreso", descripcion: `Cobro #${poSelectedPedido.numero} (Transferencia${result.surcharge > 0 ? ` +${recargoTransferencia}%` : ""})`, metodo_pago: "Transferencia", monto: result.transferencia + result.surcharge, referencia_id: ventaId, referencia_tipo: "venta", ...(result.cuentaBancaria ? { cuenta_bancaria: result.cuentaBancaria } : {}) });
      }
    } else if (result.metodo === "Cuenta Corriente") {
      // CC does NOT go to caja — it's not real money in the register
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

    // Update venta — only count real money received, NOT CC (which is debt)
    const realPaid = (result.efectivo || 0) + (result.transferencia || 0) + (result.surcharge || 0);
    const ventaUpd: Record<string, any> = { forma_pago: result.metodo, monto_pagado: pagado + realPaid };
    if (result.cuentaBancaria) ventaUpd.cuenta_transferencia_alias = result.cuentaBancaria;
    ventaUpd.total = result.monto + (result.surcharge || 0);
    await supabase.from("ventas").update(ventaUpd).eq("id", ventaId);

    // Sync local state so card/dialog reflect the cobro without a page reload
    const numero = poSelectedPedido.numero;
    const newMontoPagado = pagado + realPaid;
    const newCuenta = result.cuentaBancaria || (poSelectedPedido as any).cuenta_transferencia_alias || null;
    setPoSelectedPedido(prev => prev ? ({
      ...prev,
      forma_pago: result.metodo,
      metodo_pago: result.metodo,
      _monto_pagado: newMontoPagado,
      cuenta_transferencia_alias: newCuenta,
      total: ventaUpd.total,
    } as any) : prev);
    setVentas(prev => prev.map(v => v.id === ventaId ? ({
      ...v,
      forma_pago: result.metodo,
      monto_pagado: newMontoPagado,
      cuenta_transferencia_alias: newCuenta,
      total: ventaUpd.total,
    } as any) : v));
    setPoPedidos(prev => prev.map(p => p.numero === numero ? ({
      ...p,
      metodo_pago: result.metodo,
      forma_pago: result.metodo,
      _monto_pagado: newMontoPagado,
      cuenta_transferencia_alias: newCuenta,
      total: ventaUpd.total,
    } as any) : p));

    // FIFO allocation: update monto_pagado on old invoices
    if (result.cobrarSaldo && result.saldoAllocations.length > 0) {
      for (const alloc of result.saldoAllocations) {
        if (alloc.aplicar <= 0) continue;
        const { data: old } = await supabase.from("ventas").select("monto_pagado").eq("id", alloc.venta_id).single();
        await supabase.from("ventas").update({ monto_pagado: ((old as any)?.monto_pagado || 0) + alloc.aplicar }).eq("id", alloc.venta_id);
      }
      const totalAllocated = result.saldoAllocations.reduce((s, a) => s + a.aplicar, 0);
      if (totalAllocated > 0 && clienteId) {
        const clienteNombreCobro = poSelectedPedido.nombre_cliente || "";
        await supabase.from("caja_movimientos").insert({
          fecha: hoy, hora, tipo: "ingreso",
          descripcion: `Cobro saldo adeudado — ${clienteNombreCobro} (${result.saldoAllocations.filter(a => a.aplicar > 0).map(a => `#${a.numero}`).join(", ")})`,
          metodo_pago: result.metodo === "Mixto" ? "Efectivo" : result.metodo,
          monto: totalAllocated,
          referencia_tipo: "cobro_saldo",
        });

        const { data: newSaldo2 } = await supabase.rpc("atomic_update_client_saldo", { p_client_id: clienteId, p_change: -totalAllocated });
        const saldoAfter2 = Math.max(0, newSaldo2 ?? 0);
        let runningSaldo2 = saldoAfter2 + totalAllocated;
        for (const alloc of result.saldoAllocations) {
          if (alloc.aplicar <= 0) continue;
          runningSaldo2 -= alloc.aplicar;
          await supabase.from("cuenta_corriente").insert({
            cliente_id: clienteId, fecha: hoy,
            comprobante: `Cobro saldo #${alloc.numero}`,
            descripcion: `Cobro deuda anterior — ${result.metodo}`,
            debe: 0, haber: alloc.aplicar, saldo: Math.max(0, runningSaldo2),
            forma_pago: result.metodo, venta_id: alloc.venta_id,
          });
        }
        setClienteSaldo(saldoAfter2);
      }
    }

    // Refresh payment breakdown
    if (ventaId) {
      const [{ data: movs }, { data: ccMovs }, { data: ncVentas }] = await Promise.all([
        supabase.from("caja_movimientos").select("metodo_pago, monto, tipo, descripcion, cuenta_bancaria").eq("referencia_id", ventaId).eq("referencia_tipo", "venta").eq("tipo", "ingreso"),
        supabase.from("cuenta_corriente").select("debe").eq("venta_id", ventaId),
        supabase.from("ventas").select("id, total").eq("remito_origen_id", ventaId).ilike("tipo_comprobante", "Nota de Crédito%").neq("estado", "anulada"),
      ]);
      const newPagos: { metodo: string; monto: number; cuenta_bancaria?: string | null }[] = [];
      for (const m of movs || []) {
        let label = m.metodo_pago;
        if (m.metodo_pago === "Transferencia" && m.descripcion) {
          const match = m.descripcion.match(/\+(\d+(?:\.\d+)?)%/);
          if (match) label = `Transferencia (${match[1]}%)`;
        }
        const cuenta = (m as any).cuenta_bancaria || null;
        const existing = newPagos.find((p) => p.metodo === label && (p.cuenta_bancaria || null) === cuenta);
        if (existing) existing.monto += m.monto;
        else newPagos.push({ metodo: label, monto: m.monto, cuenta_bancaria: cuenta });
      }
      const ccTotal = (ccMovs || []).reduce((s: number, c: any) => s + (c.debe || 0), 0);
      if (ccTotal > 0) newPagos.push({ metodo: "Cuenta Corriente", monto: ccTotal });
      const ncTotal = (ncVentas || []).reduce((s: number, nc: any) => s + (nc.total || 0), 0);
      if (ncTotal > 0) newPagos.push({ metodo: "Nota de Crédito (devolución)", monto: ncTotal });
      setDetailPagos(newPagos);
    }
    showAdminToast("Cobro registrado", "success");
  };

  const getVendedorNombre = (id: string | null) => {
    if (!id) return "—";
    return vendedores.find((v) => v.id === id)?.nombre || "—";
  };

  // ─── Print ───
  const preparePrint = async (v: VentaRow) => {
    // Batch independent queries in parallel: items, cliente saldo, caja_movimientos, pedidos_tienda
    const [
      { data },
      { data: cd },
      { data: movs },
      { data: ptPrint },
    ] = await Promise.all([
      supabase.from("venta_items").select("*").eq("venta_id", v.id).order("created_at"),
      v.cliente_id
        ? supabase.from("clientes").select("saldo").eq("id", v.cliente_id).single()
        : Promise.resolve({ data: null }),
      supabase.from("caja_movimientos").select("metodo_pago, monto, tipo").eq("referencia_id", v.id).eq("referencia_tipo", "venta"),
      v.forma_pago === "Mixto" && v.numero
        ? supabase.from("pedidos_tienda").select("monto_efectivo, monto_transferencia").eq("numero", v.numero).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const items = (data as VentaItemRow[]) || [];
    const saldo = cd?.saldo || 0;
    const saldoAnteriorCC = 0;

    // Load combo data for combo products (must wait for items)
    const productIds = items.map((i) => i.producto_id).filter(Boolean) as string[];
    const comboItemsMap: Record<string, { nombre: string; cantidad: number }[]> = {};
    const comboIds = new Set<string>();
    if (productIds.length > 0) {
      const { data: prods } = await supabase.from("productos").select("id, es_combo").in("id", productIds);
      for (const p of prods || []) {
        if ((p as any).es_combo) comboIds.add(p.id);
      }
      if (comboIds.size > 0) {
        const comboResults = await Promise.all([...comboIds].map((comboId) =>
          supabase
            .from("combo_items")
            .select("cantidad, productos!combo_items_producto_id_fkey(nombre)")
            .eq("combo_id", comboId)
            .then(({ data: ciData }) => ({ comboId, ciData }))
        ));
        for (const { comboId, ciData } of comboResults) {
          comboItemsMap[comboId] = (ciData || []).map((ci: any) => ({
            nombre: ci.productos?.nombre || "",
            cantidad: ci.cantidad,
          }));
        }
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

    // Payment breakdown from caja_movimientos (pre-fetched)
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
      else if (v.forma_pago === "Mixto") {
        pagoEf = ptPrint?.monto_efectivo || (v as any).monto_efectivo || 0;
        pagoTr = ptPrint?.monto_transferencia || (v as any).monto_transferencia || 0;
      }
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
    const ventaCalc = recalcFromVenta({ subtotal: v.subtotal, descuento_porcentaje: v.descuento_porcentaje || 0, recargo_porcentaje: v.recargo_porcentaje || 0, total: v.total });
    // Recalcular surcharge sobre base neta (subtotal - NC)
    const ncAmtPrint = ncPorVenta[v.id] || 0;
    const totalImpreso = calcTotalConNC({
      subtotal: v.subtotal || 0,
      total: v.total,
      recargo_porcentaje: v.recargo_porcentaje,
      ncTotal: ncAmtPrint,
    });
    const baseNetaPrint = (v.subtotal || 0) - ncAmtPrint;
    const recPctPrint = v.recargo_porcentaje || 0;
    const pctDerivadoPrint = (v.total - (v.subtotal || 0)) > 0 && (v.subtotal || 0) > 0
      ? (v.total - (v.subtotal || 0)) / (v.subtotal || 0) : 0;
    const pctUsarPrint = recPctPrint > 0 ? recPctPrint / 100 : pctDerivadoPrint;
    const surchargeCorregido = baseNetaPrint > 0 && pctUsarPrint > 0
      ? Math.round(baseNetaPrint * pctUsarPrint)
      : 0;
    setPrintSaleObj({
      numero: v.numero,
      total: totalImpreso,
      subtotal: v.subtotal,
      descuento: ventaCalc.descuentoMonto,
      recargo: ventaCalc.recargoMonto,
      transferSurcharge: surchargeCorregido,
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
    // Mark as printed — persisted in DB so it syncs across devices/users
    try {
      const nowIso = new Date().toISOString();
      await supabase.from("ventas").update({ impreso_at: nowIso }).eq("id", v.id);
      setVentas((prev) => prev.map((row) => row.id === v.id ? { ...row, impreso_at: nowIso } : row));
    } catch (err) {
      console.error("Error marking venta as impresa:", err);
    }
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

  // Realtime: escuchar nuevos pedidos y notificar
  useEffect(() => {
    const channel = supabase
      .channel("pedidos_tienda_nuevos")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "pedidos_tienda" },
        (payload) => {
          const nuevo = payload.new as any;
          showAdminToast(
            `Nuevo pedido #${nuevo.numero} — ${nuevo.nombre_cliente}`,
            "success"
          );
          try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 880;
            gain.gain.value = 0.3;
            osc.start();
            osc.stop(ctx.currentTime + 0.15);
            setTimeout(() => {
              const osc2 = ctx.createOscillator();
              const gain2 = ctx.createGain();
              osc2.connect(gain2);
              gain2.connect(ctx.destination);
              osc2.frequency.value = 1100;
              gain2.gain.value = 0.3;
              osc2.start();
              osc2.stop(ctx.currentTime + 0.2);
            }, 200);
          } catch {}
          fetchPedidos();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchPedidos]);

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

    // Optimistic UI: abrir el dialog YA con la data que tenemos.
    // Limpiar estado anterior asi no muestra datos stale, y completar abajo cuando lleguen las queries.
    setDetailPagos([]);
    setDetailNCs([]);
    setDetailCobroSaldo([]);
    setClienteSaldo(0);
    setCobroPreview(null);
    setPoEditItems(items.map((i) => ({ ...i })));
    setPoHasChanges(false);
    setEditandoPago(false);
    setPoSelectedPedido({ ...pedido, items, _source: pedido._source || "pedidos" } as any);
    setPoDetailOpen(true);

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
      { data: cobroSaldoMovs },
    ] = await Promise.all([
      items.length === 0 && ventaId
        ? supabase.from("venta_items").select("*").eq("venta_id", ventaId).order("created_at")
        : Promise.resolve({ data: null, error: null }),
      ventaId
        ? supabase.from("caja_movimientos").select("metodo_pago, monto, tipo, descripcion, cuenta_bancaria").eq("referencia_id", ventaId).eq("referencia_tipo", "venta").eq("tipo", "ingreso")
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
      ventaId
        ? supabase.from("caja_movimientos").select("metodo_pago, monto, created_at").eq("referencia_id", ventaId).eq("referencia_tipo", "cobro_saldo").eq("tipo", "ingreso")
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
    const pagos: { metodo: string; monto: number; cuenta_bancaria?: string | null }[] = [];
    for (const m of movs || []) {
      let label = m.metodo_pago;
      if (m.metodo_pago === "Transferencia" && m.descripcion) {
        const match = m.descripcion.match(/\+(\d+(?:\.\d+)?)%/);
        if (match) label = `Transferencia (${match[1]}%)`;
      }
      const cuenta = (m as any).cuenta_bancaria || null;
      const existing = pagos.find((p) => p.metodo === label && (p.cuenta_bancaria || null) === cuenta);
      if (existing) existing.monto += m.monto;
      else pagos.push({ metodo: label, monto: m.monto, cuenta_bancaria: cuenta });
    }
    // Add payments made via cobros (hoja de ruta saldo allocation) — not in caja_movimientos for this venta
    const cobroTotalAmt = (cobroItemsData || []).reduce((s: number, ci: any) => s + (ci.monto_aplicado || 0), 0);
    for (const ci of cobroItemsData || []) {
      const fp = (ci as any).cobros?.forma_pago || "Cobro";
      const existing = pagos.find((p) => p.metodo === fp);
      if (existing) existing.monto += (ci as any).monto_aplicado;
      else pagos.push({ metodo: fp, monto: (ci as any).monto_aplicado });
    }
    // CC charge: show only the portion NOT covered by cobros (avoids double-counting)
    const ccTotal = (ccMovs || []).reduce((s: number, c: any) => s + (c.debe || 0), 0);
    const ccRemainder = Math.max(0, ccTotal - cobroTotalAmt);
    if (ccRemainder > 0) pagos.push({ metodo: "Cuenta Corriente", monto: ccRemainder });
    const ncTotalAmt = (ncVentas || []).reduce((s: number, nc: any) => s + (nc.total || 0), 0);
    if (ncTotalAmt > 0) pagos.push({ metodo: "Nota de Crédito (devolución)", monto: ncTotalAmt });
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
      if (ptData.monto_efectivo > 0 && !pagos.some((p) => p.metodo.includes("Efectivo"))) {
        pagos.push({ metodo: "Efectivo (a cobrar)", monto: ptData.monto_efectivo });
      }
      if (ptData.monto_transferencia > 0 && !pagos.some((p) => p.metodo.includes("Transferencia"))) {
        pagos.push({ metodo: "Transferencia (a cobrar)", monto: ptData.monto_transferencia });
      }
    }

    // Fallback: if no caja_movimientos (online orders not yet paid)
    // Check if venta is already fully paid via monto_pagado
    const alreadyPaid = ventaData && ventaData.monto_pagado > 0 && ventaData.monto_pagado >= (ventaData.total || pedido.total) * 0.99;
    if (pagos.length === 0) {
      if (ventaData) {
        if (isOnlineOrder && !alreadyPaid) {
          if (ventaData.monto_transferencia > 0) pagos.push({ metodo: "Transferencia (a cobrar)", monto: ventaData.monto_transferencia });
          if (ventaData.monto_efectivo > 0) pagos.push({ metodo: "Efectivo (a cobrar)", monto: ventaData.monto_efectivo });
        } else {
          if (ventaData.monto_efectivo > 0) pagos.push({ metodo: "Efectivo", monto: ventaData.monto_efectivo });
          if (ventaData.monto_transferencia > 0) pagos.push({ metodo: "Transferencia", monto: ventaData.monto_transferencia });
        }
        if (pagos.length === 0) {
          const fpLabel = ventaData.forma_pago || pedido.metodo_pago || "Efectivo";
          const isPending = fpLabel.toLowerCase() === "pendiente";
          if ((isOnlineOrder || isPending) && !alreadyPaid) {
            pagos.push({ metodo: `${fpLabel} (a cobrar)`, monto: ventaData.total || pedido.total });
          } else {
            pagos.push({ metodo: fpLabel, monto: ventaData.total || pedido.total });
          }
        }
      } else if (ptData) {
        if (isOnlineOrder && !alreadyPaid) {
          if (ptData.monto_transferencia > 0) pagos.push({ metodo: "Transferencia", monto: ptData.monto_transferencia });
          if (ptData.monto_efectivo > 0) pagos.push({ metodo: "Efectivo (a cobrar)", monto: ptData.monto_efectivo });
        } else {
          if (ptData.monto_efectivo > 0) pagos.push({ metodo: "Efectivo", monto: ptData.monto_efectivo });
          if (ptData.monto_transferencia > 0) pagos.push({ metodo: "Transferencia", monto: ptData.monto_transferencia });
        }
        if (pagos.length === 0) {
          const fpLabel2 = ptData.metodo_pago || "Efectivo";
          const isPending2 = fpLabel2.toLowerCase() === "pendiente";
          if ((isOnlineOrder || isPending2) && !alreadyPaid) {
            pagos.push({ metodo: `${fpLabel2} (a cobrar)`, monto: ptData.total || pedido.total });
          } else {
            pagos.push({ metodo: fpLabel2, monto: ptData.total || pedido.total });
          }
        }
      }
    }

    setDetailPagos(pagos);
    if (!ventaId) setDetailNCs([]);
    setDetailCobroSaldo((cobroSaldoMovs || []).map((cs: any) => ({
      metodo: cs.metodo_pago, monto: cs.monto,
      fecha: cs.created_at ? new Date(cs.created_at).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "",
    })));
    setClienteSaldo(clienteData?.saldo || 0);
    // Enrich pedido with payment split from pedidos_tienda (for Mixto pre-fill)
    const ptEfectivo = ptData?.monto_efectivo || (ventaData as any)?.monto_efectivo || 0;
    const ptTransferencia = ptData?.monto_transferencia || (ventaData as any)?.monto_transferencia || 0;
    const ptMontoPagado = (ventaData as any)?.monto_pagado ?? 0;
    // Fetch stock for each product to show in edit mode
    const editProdIds = items.map((i) => i.producto_id).filter(Boolean);
    if (editProdIds.length > 0) {
      const { data: stockData2 } = await supabase
        .from("productos")
        .select("id, stock")
        .in("id", editProdIds);
      if (stockData2) {
        const stockMap2: Record<string, number> = {};
        for (const s of stockData2) stockMap2[s.id] = s.stock;
        for (const item of items) {
          if (item.producto_id && stockMap2[item.producto_id] !== undefined) {
            (item as any).stock = stockMap2[item.producto_id];
          }
        }
      }
    }

    setPoSelectedPedido({ ...pedido, items, _source: pedido._source || "pedidos", _ventaId: ventaId, monto_efectivo: ptEfectivo, monto_transferencia: ptTransferencia, _monto_pagado: ptMontoPagado } as any);
    setCobroPreview(null);
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
    setPoPresHighlight(0);
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
  const poAddProduct = async (product: ProductoSearch, pres?: { nombre: string; precio: number; unidades_por_presentacion: number }) => {
    if (product.es_combo) {
      const { data: comboItems } = await supabase
        .from("combo_items")
        .select("cantidad, productos!combo_items_producto_id_fkey(nombre, stock)")
        .eq("combo_id", product.id);
      const sinStock = (comboItems || []).filter((ci: any) =>
        ((ci.productos?.stock || 0) < ci.cantidad)
      );
      if (sinStock.length > 0) {
        showAdminToast(
          `Sin stock suficiente: ${sinStock.map((ci: any) => ci.productos?.nombre).join(", ")}`,
          "info"
        );
      }
    } else {
      const { data: prodFresh } = await supabase
        .from("productos")
        .select("stock")
        .eq("id", product.id)
        .single();
      if ((prodFresh?.stock ?? 0) <= 0) {
        showAdminToast(
          `Sin stock: ${product.nombre}`,
          "info"
        );
      }
    }

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
      await Promise.all(
        Object.entries(stockDiffs)
          .filter(([, diff]) => Math.abs(diff) >= 0.001)
          .map(async ([productoId, diff]) => {
            const { data: prod, error: prodErr } = await supabase
              .from("productos").select("stock").eq("id", productoId).single();
            if (prodErr || !prod) { errores.push(`Producto ${productoId} no encontrado`); return; }
            const stockAntes = prod.stock;
            const stockDespues = stockAntes + diff;
            const { error: updErr } = await supabase.from("productos")
              .update(buildStockUpdate(stockDespues, stockAntes)).eq("id", productoId);
            if (updErr) { errores.push(`Error stock: ${updErr.message}`); return; }
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
          })
      );

      const nuevoSubtotal = poEditItems.reduce((sum, i) => sum + i.precio_unitario * i.cantidad * (1 - (i.descuento || 0) / 100), 0);
      const isHistorial = poSelectedPedido._source === "historial";
      const descPct = (poSelectedPedido as any)._descuento_porcentaje || 0;
      const recPct = (poSelectedPedido as any)._recargo_porcentaje || 0;

      // Recuperar % de recargo de transferencia desde tienda_config
      let pctTransfer = 0;
      const { data: tcData } = await supabase
        .from("tienda_config")
        .select("recargo_transferencia")
        .limit(1)
        .single();
      if (tcData && tcData.recargo_transferencia > 0) pctTransfer = tcData.recargo_transferencia;

      // Total base (sin recargo de transferencia)
      const nuevoTotalBase = (isHistorial && !poSelectedPedido.isOnline)
        ? Math.round(nuevoSubtotal * (1 - descPct / 100) * (1 + recPct / 100))
        : nuevoSubtotal + (poSelectedPedido.costo_envio || 0);

      // Calcular recargo de transferencia según forma de pago
      // Usar _ventaId (ya resuelto en poOpenDetail) para evitar ambigüedad por numero duplicado
      let ventaFormaPago = (poSelectedPedido as any).forma_pago || "";
      const knownVentaId = poSelectedPedido._ventaId;
      if (knownVentaId) {
        const { data: fpData } = await supabase.from("ventas").select("forma_pago").eq("id", knownVentaId).single();
        if (fpData?.forma_pago) ventaFormaPago = fpData.forma_pago;
      } else if (poSelectedPedido.numero) {
        const { data: fpData } = await supabase.from("ventas").select("forma_pago").eq("numero", poSelectedPedido.numero).maybeSingle();
        if (fpData?.forma_pago) ventaFormaPago = fpData.forma_pago;
      }

      let nuevoTransferSurcharge = 0;
      let nuevoMixtoEfectivo = 0;
      let nuevoMixtoTransferencia = 0;

      if (ventaFormaPago === "Transferencia" && pctTransfer > 0) {
        nuevoTransferSurcharge = Math.round(nuevoTotalBase * pctTransfer / 100);
      } else if (ventaFormaPago === "Mixto" && pctTransfer > 0) {
        let efectivoOriginal = 0;
        if (poSelectedPedido.numero) {
          const { data: ptMixto } = await supabase
            .from("pedidos_tienda")
            .select("monto_efectivo, monto_transferencia")
            .eq("numero", poSelectedPedido.numero)
            .maybeSingle();
          efectivoOriginal = ptMixto?.monto_efectivo || 0;
        }
        if (efectivoOriginal > 0 && efectivoOriginal < nuevoTotalBase) {
          nuevoMixtoEfectivo = efectivoOriginal;
          nuevoMixtoTransferencia = nuevoTotalBase - efectivoOriginal;
          nuevoTransferSurcharge = Math.round(nuevoMixtoTransferencia * pctTransfer / 100);
        }
      }

      const nuevoTotal = nuevoTotalBase + nuevoTransferSurcharge;
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
              descuento: item.descuento || 0,
              subtotal: item.precio_unitario * item.cantidad * (1 - (item.descuento || 0) / 100),
            }))
          );
          if (insErr) errores.push(`Error insertando items en tienda: ${insErr.message}`);
        }
        // Construir el update de pedidos_tienda con desglose Mixto/Transferencia
        const ptUpdate: Record<string, any> = {
          subtotal: nuevoSubtotal,
          total: nuevoTotal,
        };
        if (ventaFormaPago === "Transferencia") {
          ptUpdate.monto_efectivo = 0;
          ptUpdate.monto_transferencia = nuevoTotalBase;
        } else if (ventaFormaPago === "Mixto") {
          if (nuevoMixtoEfectivo > 0) {
            ptUpdate.monto_efectivo = nuevoMixtoEfectivo;
            ptUpdate.monto_transferencia = nuevoMixtoTransferencia;
          } else {
            ptUpdate.monto_efectivo = 0;
            ptUpdate.monto_transferencia = 0;
          }
        }
        const { error: pedErr } = await supabase.from("pedidos_tienda").update(ptUpdate).eq("id", pedidoTiendaId);
        if (pedErr) errores.push(`Error actualizando total en tienda: ${pedErr.message}`);
      }

      // Update venta + venta_items
      // Prefer _ventaId (already resolved in poOpenDetail) — querying by numero can fail
      // when multiple ventas share the same numero (e.g., remito + factura)
      const ventaId = knownVentaId
        || (poSelectedPedido.numero
          ? (await supabase
              .from("ventas")
              .select("id")
              .eq("numero", poSelectedPedido.numero)
              .not("tipo_comprobante", "ilike", "Factura%")
              .not("tipo_comprobante", "ilike", "Nota de Crédito%")
              .order("created_at", { ascending: true })
              .limit(1)
              .maybeSingle()
            ).data?.id
          : null);

      if (ventaId) {
        const { data: ventaData } = await supabase.from("ventas").select("total, cliente_id, forma_pago").eq("id", ventaId).single();
        const totalAnterior = ventaData?.total || 0;
        const diferencia = nuevoTotal - totalAnterior;

        const { error: ventaErr } = await supabase.from("ventas").update({
          subtotal: nuevoSubtotal,
          total: nuevoTotal,
        }).eq("id", ventaId);
        if (ventaErr) errores.push(`Error sync venta: ${ventaErr.message}`);

        // Recuperar costos originales de venta_items antes de eliminarlos
        const { data: originalVentaItems } = await supabase
          .from("venta_items")
          .select("producto_id, presentacion, costo_unitario")
          .eq("venta_id", ventaId);

        const costoMap: Record<string, number> = {};
        for (const vi of originalVentaItems || []) {
          if (vi.costo_unitario > 0) {
            const key = `${vi.producto_id}_${vi.presentacion || "Unidad"}`;
            costoMap[key] = vi.costo_unitario;
          }
        }

        // Para productos nuevos, buscar costo en la tabla productos
        const productIdsNuevos = poEditItems
          .filter(item => {
            const key = `${item.producto_id}_${item.presentacion || "Unidad"}`;
            return !costoMap[key];
          })
          .map(item => item.producto_id)
          .filter(Boolean);

        if (productIdsNuevos.length > 0) {
          const { data: prodData } = await supabase
            .from("productos")
            .select("id, costo")
            .in("id", productIdsNuevos);
          for (const p of prodData || []) {
            const matchingItem = poEditItems.find(i => i.producto_id === p.id);
            if (matchingItem) {
              const key = `${p.id}_${matchingItem.presentacion || "Unidad"}`;
              const upp = matchingItem.unidades_por_presentacion || 1;
              costoMap[key] = (p.costo || 0) * upp;
            }
          }
        }

        await supabase.from("venta_items").delete().eq("venta_id", ventaId);
        const { error: viErr } = await supabase.from("venta_items").insert(
          poEditItems.map((item) => {
            const key = `${item.producto_id}_${item.presentacion || "Unidad"}`;
            const costoFinal = costoMap[key] || item.costo_unitario || 0;
            return {
              venta_id: ventaId,
              producto_id: item.producto_id,
              descripcion: (item.presentacion && item.presentacion !== "Unidad" && item.presentacion !== "Un")
                ? `${item.nombre} (${item.presentacion})`
                : item.nombre,
              cantidad: item.cantidad,
              precio_unitario: item.precio_unitario,
              descuento: item.descuento || 0,
              subtotal: item.precio_unitario * item.cantidad * (1 - (item.descuento || 0) / 100),
              unidad_medida: "Un",
              presentacion: item.presentacion,
              unidades_por_presentacion: item.unidades_por_presentacion || 1,
              costo_unitario: costoFinal,
            };
          })
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
      setPoPedidos(prev => prev.map(p =>
        p.numero === poSelectedPedido.numero
          ? { ...p, items: poEditItems.map(i => ({ ...i })), total: nuevoTotal, subtotal: nuevoSubtotal }
          : p
      ));
      setVentas(prev => prev.map(v =>
        v.numero === poSelectedPedido.numero
          ? { ...v, total: nuevoTotal, subtotal: nuevoSubtotal }
          : v
      ));
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
      await Promise.all([
        supabase.from("pedidos_tienda").update({ estado: nuevoEstado }).eq("numero", pedido.numero),
        supabase.from("pedido_estado_historial").insert({
          pedido_numero: pedido.numero,
          estado: nuevoEstado,
        }),
      ]);
    }

    // Find linked venta (use cached _ventaId first, then query)
    let ventaLinked: { id: string; cliente_id: string | null } | null = null;
    if (pedido._ventaId) {
      ventaLinked = { id: pedido._ventaId, cliente_id: pedido._clienteId || null };
    } else if (pedido.numero) {
      const { data } = await supabase
        .from("ventas")
        .select("id, cliente_id")
        .eq("numero", pedido.numero)
        .not("tipo_comprobante", "ilike", "Factura%")
        .not("tipo_comprobante", "ilike", "Nota de Crédito%")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
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

      // Sync pedido_armado so supervision tab reflects the change
      if (nuevoEstado === "armado") {
        const now = new Date().toISOString();
        await supabase
          .from("pedido_armado")
          .upsert(
            {
              venta_id: ventaLinked.id,
              estado: "listo",
              fin_armado_at: now,
              aprobado_at: now,
              updated_at: now,
            },
            { onConflict: "venta_id" }
          );
      }
    }

    // Return stock when cancelling (only if wasn't already cancelled)
    if (nuevoEstado === "cancelado" && estadoAnterior !== "cancelado") {
      // Si los items vienen vacíos (cancelación desde historial), cargarlos desde la DB
      let itemsParaStock = pedido.items;
      if (itemsParaStock.length === 0 && ventaLinked) {
        const { data: ventaItems } = await supabase
          .from("venta_items")
          .select("producto_id, cantidad, presentacion, unidades_por_presentacion, descripcion")
          .eq("venta_id", ventaLinked.id);
        itemsParaStock = (ventaItems || []).map((vi: any) => ({
          producto_id: vi.producto_id,
          nombre: vi.descripcion,
          presentacion: vi.presentacion || "Unidad",
          cantidad: vi.cantidad,
          precio_unitario: 0,
          subtotal: 0,
          unidades_por_presentacion: vi.unidades_por_presentacion || 1,
        }));
      }

      for (const item of itemsParaStock) {
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
            const { data: stockResult } = await supabase.rpc("atomic_update_stock", { p_producto_id: (ci as any).producto_id, p_change: compUnits });
            const stockAntes = (stockResult?.stock_despues ?? 0) - compUnits;
            const stockDespues = stockResult?.stock_despues ?? 0;
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
          const { data: stockResult } = await supabase.rpc("atomic_update_stock", { p_producto_id: item.producto_id, p_change: unitsToRestore });
          const stockAntes = (stockResult?.stock_despues ?? 0) - unitsToRestore;
          const stockDespues = stockResult?.stock_despues ?? 0;
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
      // Si los items vienen vacíos (reactivación desde historial), cargarlos desde la DB
      let itemsParaStockReact = pedido.items;
      if (itemsParaStockReact.length === 0 && ventaLinked) {
        const { data: ventaItemsReact } = await supabase
          .from("venta_items")
          .select("producto_id, cantidad, presentacion, unidades_por_presentacion, descripcion")
          .eq("venta_id", ventaLinked.id);
        itemsParaStockReact = (ventaItemsReact || []).map((vi: any) => ({
          producto_id: vi.producto_id,
          nombre: vi.descripcion,
          presentacion: vi.presentacion || "Unidad",
          cantidad: vi.cantidad,
          precio_unitario: 0,
          subtotal: 0,
          unidades_por_presentacion: vi.unidades_por_presentacion || 1,
        }));
      }

      for (const item of itemsParaStockReact) {
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
            const { data: stockResult } = await supabase.rpc("atomic_update_stock", { p_producto_id: (ci as any).producto_id, p_change: -compUnits });
            const stockAntes = (stockResult?.stock_despues ?? 0) + compUnits;
            const stockDespues = stockResult?.stock_despues ?? 0;
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
          const { data: stockResult } = await supabase.rpc("atomic_update_stock", { p_producto_id: item.producto_id, p_change: -unitsToDecrement });
          const stockAntes = (stockResult?.stock_despues ?? 0) + unitsToDecrement;
          const stockDespues = stockResult?.stock_despues ?? 0;
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

    // Notificar al cliente si se marca como armado y es retiro en local
    if (nuevoEstado === "armado") {
      const esRetiro = (pedido.metodo_entrega || "").includes("retiro");
      if (esRetiro && pedido.numero) {
        const [{ data: ptArmado }, { data: tiendaCfg }] = await Promise.all([
          supabase
            .from("pedidos_tienda")
            .select("cliente_auth_id, metodo_pago, monto_efectivo, total")
            .eq("numero", pedido.numero)
            .maybeSingle(),
          supabase
            .from("tienda_config")
            .select("horario_atencion_fin")
            .limit(1)
            .single(),
        ]);

        const clienteAuthId = ptArmado?.cliente_auth_id;
        if (clienteAuthId) {
          const nombre = pedido.nombre_cliente || "";
          const primerNombre = nombre.trim().split(" ")[0] || "Hola";
          const horarioCierre = tiendaCfg?.horario_atencion_fin
            ? tiendaCfg.horario_atencion_fin.substring(0, 5).replace(":00", "")
            : undefined;

          const formaPago = ptArmado?.metodo_pago || "";
          const fp = formaPago.toLowerCase();
          const montoPendiente = ptArmado?.total || pedido.total || 0;
          const montoEfectivo = fp === "mixto"
            ? (ptArmado?.monto_efectivo || 0)
            : fp === "efectivo" ? montoPendiente : 0;
          const esMixto = fp === "mixto";
          const esEfectivo = fp === "efectivo";

          const fmtMonto = (n: number) =>
            "$" + Math.round(n).toLocaleString("es-AR");

          const horarioTexto = horarioCierre ? ` hasta las ${horarioCierre}hs` : "";
          let mensaje = `Hola ${primerNombre}, ya podés pasar a retirar tu pedido${horarioTexto}.`;
          if (esMixto && montoEfectivo > 0) {
            mensaje += ` Te quedan ${fmtMonto(montoEfectivo)} para completar el pago.`;
          } else if (esEfectivo && montoPendiente > 0) {
            mensaje += ` Recordá que el total a abonar es ${fmtMonto(montoPendiente)}.`;
          }

          fetch("/api/notificaciones/enviar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              titulo: `${primerNombre}, tu pedido está listo 🎉`,
              mensaje,
              tipo: "pedido",
              url: "/cuenta/pedidos",
              segmentacion: { tipo: "cliente", valor: Number(clienteAuthId) },
            }),
          }).catch(() => {});
        }
      }

      // WhatsApp prompt: solo para retiros con teléfono cargado
      if (esRetiro && pedido.telefono) {
        const primerNombre = (pedido.nombre_cliente || "").trim().split(" ")[0] || "Hola";
        const totalFmt = "$" + Math.round(pedido.total || 0).toLocaleString("es-AR");
        const waMsg = `Hola ${primerNombre}! Tu pedido #${pedido.numero} ya está listo para retirar.\n\nEl total es: ${totalFmt}\n\nTe esperamos! 🍬`;
        setWaPrompt({ open: true, telefono: pedido.telefono, mensaje: waMsg, nombreCliente: primerNombre });
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
        _remito_origen_id: v.remito_origen_id,
        _impreso_at: v.impreso_at,
        _descuento_porcentaje: v.descuento_porcentaje,
        _recargo_porcentaje: v.recargo_porcentaje,
        _vendedor: v.vendedor_id ? (vendedores.find((vd) => vd.id === v.vendedor_id)?.nombre || "") : "",
        _cuit: v.clientes?.cuit || "",
        _domicilio: v.clientes?.domicilio || "",
        forma_pago: v.forma_pago,
        cuenta_transferencia_alias: (v as any).cuenta_transferencia_alias || null,
        cuenta_transferencia_id: (v as any).cuenta_transferencia_id || null,
        monto_efectivo: (v as any).monto_efectivo || 0,
        monto_transferencia: (v as any).monto_transferencia || 0,
        monto_pagado: v.monto_pagado || 0,
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
    const todayStr = todayARG();
    return allOrders.filter((o) => {
      // Source filter
      const isOnlineOrder = o._source === "pedidos" || o.isOnline || (o as any)._tipo_comprobante === "Pedido Web";
      if (filterSource === "pos" && isOnlineOrder) return false;
      if (filterSource === "online" && !isOnlineOrder) return false;
      // When viewing "Hoy", hide online orders whose delivery date is in the future
      if (quickPeriod === "today" && isOnlineOrder && o.fecha_entrega && o.fecha_entrega > todayStr) return false;
      // Estado filter
      if (poFilterEstado !== "todos") {
        if (poFilterEstado === "entregado" ? (o.estado !== "entregado" && o.estado !== "cerrada") : o.estado !== poFilterEstado) return false;
      }
      const pago = (o.forma_pago || o.metodo_pago || "").toLowerCase();
      const isMixto = pago === "mixto";
      const montoEf = (o as any).monto_efectivo || 0;
      const montoTr = (o as any).monto_transferencia || 0;
      const montoPagado = (o as any).monto_pagado ?? (o as any)._monto_pagado ?? 0;
      const totalOrden = o.total || 0;
      // Si hay filtro de banco, ignoramos la constrainta de forma de pago:
      // basta con que la venta haya transferido a esa cuenta (Transferencia pura o Mixto con monto_transferencia > 0).
      if (filterBanco !== "all") {
        const alias = String((o as any).cuenta_transferencia_alias || "");
        if (!alias.includes(filterBanco)) return false;
        const tuvoTransferencia = pago === "transferencia" || (isMixto && montoTr > 0);
        if (!tuvoTransferencia) return false;
      } else if (filterPayment !== "all") {
        // Payment filter — includes Mixto orders that have the selected method
        const target = filterPayment.toLowerCase();
        // For CC: a Mixto counts only if there's an unpaid residue (went to CC)
        const mixtoTuvoCC = isMixto && montoPagado < totalOrden * 0.99;
        let matches = false;
        if (target === "transferencia") matches = pago === "transferencia" || (isMixto && montoTr > 0);
        else if (target === "efectivo") matches = pago === "efectivo" || (isMixto && montoEf > 0);
        else if (target === "cuenta corriente") matches = pago === "cuenta corriente" || mixtoTuvoCC;
        else if (target === "mixto") matches = isMixto;
        else matches = pago === target;
        if (!matches) return false;
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
  }, [allOrders, filterSource, poFilterEstado, filterPayment, filterBanco, searchClient, quickPeriod]);

  // Count online orders hidden because delivery is in the future (only relevant in "today" view)
  const hiddenFutureOrders = useMemo(() => {
    if (quickPeriod !== "today") return 0;
    const todayStr = todayARG();
    return allOrders.filter((o) => {
      const isOnlineOrder = o._source === "pedidos" || o.isOnline || (o as any)._tipo_comprobante === "Pedido Web";
      return isOnlineOrder && o.fecha_entrega && o.fecha_entrega > todayStr;
    }).length;
  }, [allOrders, quickPeriod]);

  // Unified stats — NCs are already reflected in parent venta's total, don't subtract again
  const activeOrders = filteredOrders.filter((o) => o.estado !== "cancelado" && o.estado !== "anulada" && !o._tipo_comprobante?.includes("Nota de Crédito"));

  // Para cada venta activa, calcular el total correcto descontando NC con recargo implícito
  const unifiedTotal = activeOrders.reduce((s, o) => {
    const ventaId = (o as any)._ventaId || "";
    const ncAmt = ncPorVenta[ventaId] || 0;
    if (ncAmt === 0) return s + o.total;
    const ventaSubtotal = (o as any).subtotal || o.total;
    const recargoImplicito = o.total - ventaSubtotal;
    const pctEfectivo = recargoImplicito > 0 && ventaSubtotal > 0 ? recargoImplicito / ventaSubtotal : 0;
    const baseNeta = ventaSubtotal - ncAmt;
    return s + baseNeta + (baseNeta > 0 ? Math.round(baseNeta * pctEfectivo) : 0);
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
              {hiddenFutureOrders > 0 && (
                <button
                  type="button"
                  onClick={() => setQuickPeriod("week")}
                  className="ml-2 inline-flex items-center gap-1 text-amber-600 font-medium hover:text-amber-700 hover:underline cursor-pointer"
                >
                  <Calendar className="w-3 h-3" />
                  {hiddenFutureOrders} con entrega futura oculto{hiddenFutureOrders > 1 ? "s" : ""} — tocá para ver{hiddenFutureOrders > 1 ? "los" : "lo"}
                </button>
              )}
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
            <div><p className="text-xs text-muted-foreground">Total ventas</p><p className="text-xl font-bold">{filteredOrders.filter((o) => o.estado !== "cancelado" && o.estado !== "anulada" && !o._tipo_comprobante?.includes("Nota de Crédito") && !o._tipo_comprobante?.includes("Nota de Débito")).length}</p></div>
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
          <div className="flex flex-wrap items-center gap-2 pt-3 border-t">
            {/* Origin */}
            <div className="flex items-center gap-1 bg-muted/60 rounded-lg p-0.5">
              {([["todos", "Todos", null], ["pos", "POS", Store], ["online", "Online", Globe]] as const).map(([val, label, Icon]) => (
                <button
                  key={val}
                  onClick={() => setFilterSource(val as any)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                    filterSource === val
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {Icon && <Icon className="w-3 h-3" />}
                  {label}
                </button>
              ))}
            </div>

            <div className="w-px h-5 bg-border hidden sm:block" />

            {/* Estado */}
            <div className="flex items-center gap-1 bg-muted/60 rounded-lg p-0.5">
              {([["todos", "Todos"], ["pendiente", "Pendiente"], ["armado", "Armado"], ["entregado", "Entregado"], ["cancelado", "Cancelado"]] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setPoFilterEstado(val)}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                    poFilterEstado === val
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="w-px h-5 bg-border hidden sm:block" />

            {/* Cobro — pills en lugar de Select */}
            <div className="flex items-center gap-1 bg-muted/60 rounded-lg p-0.5">
              {([["all", "Todos"], ["Efectivo", "Efectivo"], ["Transferencia", "Transfer."], ["Cuenta Corriente", "Cta Cte"], ["Mixto", "Mixto"]] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => { setFilterPayment(val); setFilterBanco("all"); }}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                    filterPayment === val
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Banco — visible salvo que el filtro sea estrictamente Efectivo o Cta Cte (casos sin transferencia) */}
            {filterPayment !== "Efectivo" && filterPayment !== "Cuenta Corriente" && cuentasBancarias.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                {[{ id: "all", label: "Todos" }, ...cuentasBancarias.map((c: any) => ({ id: c.alias || c.nombre, label: c.alias || c.nombre }))].map((banco) => (
                  <button
                    key={banco.id}
                    onClick={() => setFilterBanco(banco.id)}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all border ${
                      filterBanco === banco.id
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-background text-blue-700 border-blue-200 hover:border-blue-400"
                    }`}
                  >
                    {banco.label}
                  </button>
                ))}
              </div>
            )}

            <div className="w-px h-5 bg-border hidden sm:block" />

            {/* Tipo comprobante */}
            <Select value={filterType} onValueChange={(v) => setFilterType(v ?? "all")}>
              <SelectTrigger className="h-8 w-auto min-w-[100px] text-xs border-dashed bg-muted/40">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                <SelectItem value="Remito X">Remito X</SelectItem>
                <SelectItem value="Pedido Web">Pedido Web</SelectItem>
                <SelectItem value="Nota de Crédito B">NC B</SelectItem>
                <SelectItem value="Nota de Crédito C">NC C</SelectItem>
                <SelectItem value="Nota de Débito B">ND B</SelectItem>
                <SelectItem value="Nota de Débito C">ND C</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {limitReached && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <p className="text-sm">Mostrando 200 ventas — hay más registros. Acotá el período para ver todos.</p>
        </div>
      )}

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
          {filteredOrders.filter(o => !o._tipo_comprobante?.includes("Nota de Crédito") || !o._remito_origen_id).slice(0, PAGE_SIZE * visiblePage).map((order, idx) => {
            const est = estadoBadge[order.estado] || estadoBadge.pendiente;
            const isHistorial = order._source === "historial";
            const pago = formatPago(order.forma_pago || order.metodo_pago);
            const entrega = formatEntrega(order.metodo_entrega);
            const isNC = order._tipo_comprobante?.includes("Nota de Crédito");
            const orderDelivered = order.estado === "entregado";
            const orderCancelled = order.estado === "cancelado";
            const estadoSteps = ["pendiente", "armado", "entregado"];
            const currentStep = order.estado === "cancelado" ? -1 : estadoSteps.indexOf(order.estado);

            return (
              <Card key={`${order._source}-${order._ventaId || order.id}-${idx}`} onContextMenu={(e) => handleContextMenu(e, order)} className={`transition-all ${order.estado === "cancelado" ? "opacity-50" : "hover:shadow-md"}`}>
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
                          {(() => {
                            const ncAmt = !isNC ? (ncPorVenta[order._ventaId || ""] || 0) : 0;
                            const cancelled = order.estado === "cancelado";
                            if (isNC) {
                              return (
                                <>
                                  <p className="text-base font-bold text-red-500">-{formatCurrency(order.total)}</p>
                                  {order._remito_origen_id && (
                                    <p className="text-[10px] text-muted-foreground">→ aplicada al pedido</p>
                                  )}
                                </>
                              );
                            }
                            // Total con NC: v.total in DB already has NC deducted
                            // Reconstruct original total for strikethrough display
                            if (ncAmt > 0 && !cancelled) {
                              const totalOriginal = order.total + ncAmt; // restore pre-NC total
                              return (
                                <>
                                  <p className="text-sm text-muted-foreground line-through">{formatCurrency(totalOriginal)}</p>
                                  <p className="text-lg font-bold text-primary">{formatCurrency(order.total)}</p>
                                  <p className="text-[10px] text-red-500 flex items-center justify-end gap-1">
                                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400" />
                                    NC -{formatCurrency(ncAmt)}
                                  </p>
                                </>
                              );
                            }
                            return (
                              <p className={`text-lg font-bold ${cancelled ? "line-through text-muted-foreground" : ""}`}>
                                {formatCurrency(order.total)}
                              </p>
                            );
                          })()}
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
                          <span className="text-muted-foreground flex items-center gap-1 min-w-0"><MapPin className="w-3 h-3 shrink-0" /><span className="truncate max-w-[160px] sm:max-w-[300px]">{order.direccion_texto}</span></span>
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
                      <Button variant="ghost" size="sm" className={`h-8 w-8 p-0 ${order._impreso_at ? "text-emerald-600" : ""}`} onClick={async () => {
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
                      }} title={order._impreso_at ? "Ya impreso — reimprimir" : "Imprimir"}>
                        {order._impreso_at ? <PrinterCheck className="w-4 h-4" /> : <Printer className="w-4 h-4" />}
                      </Button>
                      {/* Cobrar button — for online orders or POS with envío, not yet paid */}
                      {order.estado !== "entregado" && order.estado !== "cancelado" && order.estado !== "cerrada" && !isNC && (
                        ((order as any)._monto_pagado ?? 0) < (order.total || 0) * 0.99
                      ) && (
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
                              const fp = (order.forma_pago || order.metodo_pago || "").toLowerCase();
                              const tieneCuenta = (order as any).cuenta_transferencia_alias;
                              const necesitaCuenta = (fp.includes("transferencia") || fp.includes("mixto")) && !tieneCuenta;
                              if (necesitaCuenta) {
                                // Tiene cobro pero sin cuenta bancaria — abrir dialog para completar
                                setEntregarDialog({ open: true, order });
                              } else {
                                if (ventaId) {
                                  await supabase.from("ventas").update({ entregado: true, estado: "entregado" }).eq("id", ventaId);
                                  await supabase.from("pedidos_tienda").update({ estado: "entregado" }).eq("numero", order.numero);
                                }
                                await poHandleEstadoChange(order, "entregado");
                                setPoPedidos(prev => prev.map(p => p.numero === order.numero ? { ...p, estado: "entregado" } : p));
                                setVentas(prev => prev.map(v => v.numero === order.numero ? { ...v, estado: "entregado", entregado: true } : v));
                                showAdminToast("Marcado como entregado", "success");
                              }
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
                      {order.estado !== "cancelado" && (
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

      {/* UNIFIED DETAIL DIALOG (VentaDetailDialog component) */}
      {poSelectedPedido && (
        <VentaDetailDialog
          open={poDetailOpen}
          onOpenChange={(open) => {
            if (!open) setPoHasChanges(false);
            setPoDetailOpen(open);
          }}
          data={{
            numero: poSelectedPedido.numero,
            created_at: poSelectedPedido.created_at,
            estado: poSelectedPedido.estado,
            tipo_comprobante: (poSelectedPedido as any)._tipo_comprobante,
            forma_pago: (poSelectedPedido as any).forma_pago || poSelectedPedido.metodo_pago,
            metodo_entrega: poSelectedPedido.metodo_entrega || undefined,
            total: poSelectedPedido.total,
            subtotal: poSelectedPedido.subtotal,
            descuento_porcentaje: (poSelectedPedido as any)._descuento_porcentaje,
            recargo_porcentaje: (poSelectedPedido as any)._recargo_porcentaje,
            costo_envio: poSelectedPedido.costo_envio || 0,
            observacion: poSelectedPedido.observacion,
            entregado: (poSelectedPedido as any)._entregado,
            nombre_cliente: poSelectedPedido.nombre_cliente,
            email: poSelectedPedido.email || undefined,
            telefono: poSelectedPedido.telefono || undefined,
            domicilio: (poSelectedPedido as any)._domicilio || undefined,
            cuit: (poSelectedPedido as any)._cuit || undefined,
            vendedor: (poSelectedPedido as any)._vendedor || undefined,
            cuenta_transferencia_alias: (poSelectedPedido as any).cuenta_transferencia_alias || null,
            monto_efectivo: (poSelectedPedido as any).monto_efectivo || 0,
            monto_transferencia: (poSelectedPedido as any).monto_transferencia || 0,
            origen: poSelectedPedido._source,
            fecha_entrega: poSelectedPedido.fecha_entrega || null,
            direccion_texto: poSelectedPedido.direccion_texto || null,
            comboIds: (poSelectedPedido as any)._comboIds,
          }}
          items={poEditItems.map(i => ({
            producto_id: i.producto_id,
            descripcion: i.nombre,
            nombre: i.nombre,
            presentacion: i.presentacion,
            cantidad: i.cantidad,
            precio_unitario: i.precio_unitario,
            subtotal: i.subtotal,
            unidades_por_presentacion: i.unidades_por_presentacion,
            descuento: (i as any).descuento,
          }))}
          pagos={detailPagos.map(p => ({ metodo: p.metodo, monto: p.monto, cuenta_bancaria: p.cuenta_bancaria }))}
          ncs={detailNCs}
          editable={poSelectedPedido.estado === "pendiente" || poSelectedPedido.estado === "armado"}
          editItems={poEditItems.map(i => ({
            producto_id: i.producto_id,
            nombre: i.nombre,
            presentacion: i.presentacion || "Unidad",
            cantidad: i.cantidad,
            precio_unitario: i.precio_unitario,
            subtotal: i.subtotal,
            unidades_por_presentacion: i.unidades_por_presentacion || 1,
            descuento: i.descuento || 0,
            stock: (i as any).stock,
          }))}
          onEditItemsChange={(newItems) => {
            setPoEditItems(prev => newItems.map(ni => {
              const existing = prev.find(p => p.producto_id === ni.producto_id && (p.presentacion || "Unidad") === (ni.presentacion || "Unidad"));
              return {
                ...ni,
                codigo: existing?.codigo || "",
                descuento: ni.descuento ?? existing?.descuento ?? 0,
                costo_unitario: existing?.costo_unitario || 0,
              };
            }));
            setPoHasChanges(true);
          }}
          onSave={poHandleSave}
          saving={poSaving}
          hasChanges={poHasChanges}
          onEstadoChange={async (nuevoEstado) => {
            await poHandleEstadoChange(poSelectedPedido, nuevoEstado);
            setPoSelectedPedido({ ...poSelectedPedido, estado: nuevoEstado });
            setPoPedidos(prev => prev.map(p => p.numero === poSelectedPedido.numero ? { ...p, estado: nuevoEstado } : p));
            setVentas(prev => prev.map(v => v.numero === poSelectedPedido.numero ? { ...v, estado: nuevoEstado, entregado: nuevoEstado === "entregado" } as any : v));
            showAdminToast(`Estado: ${nuevoEstado}`, "success");
          }}
          onPrint={async () => {
            try {
              let v = ventas.find(vr => vr.id === (poSelectedPedido as any)._ventaId);
              if (!v) {
                const { data: rows } = await supabase.from("ventas").select("*, clientes(nombre, cuit, domicilio, telefono, email)").eq("numero", poSelectedPedido.numero).order("created_at", { ascending: false }).limit(1);
                if (rows && rows.length > 0) v = rows[0] as any;
              }
              if (v) {
                if (poSelectedPedido.nombre_cliente && (poSelectedPedido._source === "pedidos" || (poSelectedPedido as any).isOnline)) {
                  (v as any).clientes = { nombre: poSelectedPedido.nombre_cliente, cuit: (poSelectedPedido as any)._cuit || "", domicilio: poSelectedPedido.direccion_texto || (poSelectedPedido as any)._domicilio || "", telefono: poSelectedPedido.telefono || "", email: poSelectedPedido.email || "" };
                }
                setPoDetailOpen(false);
                preparePrint(v);
              } else {
                showAdminToast("No se encontró la venta vinculada", "error");
              }
            } catch {
              showAdminToast("Error al preparar impresión", "error");
            }
          }}
          onConfirmAction={(title, message, action) => setConfirmDialog({ open: true, title, message, onConfirm: action })}
          onMetodoEntregaChange={async (nuevoMetodo) => {
            if (!poSelectedPedido) return;
            const ventaId = (poSelectedPedido as any)._ventaId || (poSelectedPedido as any).venta_id;
            try {
              if (ventaId) await supabase.from("ventas").update({ metodo_entrega: nuevoMetodo }).eq("id", ventaId);
              if (poSelectedPedido.numero) {
                const ptMetodo = nuevoMetodo === "envio" ? "envio" : "retiro_local";
                await supabase.from("pedidos_tienda").update({ metodo_entrega: ptMetodo }).eq("numero", poSelectedPedido.numero);
              }
              setPoSelectedPedido({ ...poSelectedPedido, metodo_entrega: nuevoMetodo } as any);
              setPoPedidos(prev => prev.map(p => p.numero === poSelectedPedido.numero ? { ...p, metodo_entrega: nuevoMetodo } : p));
              setVentas(prev => prev.map(v => v.numero === poSelectedPedido.numero ? { ...v, metodo_entrega: nuevoMetodo } : v));
              showAdminToast(`Cambiado a ${nuevoMetodo === "envio" ? "Envío" : "Retiro"}`, "success");
            } catch {
              showAdminToast("Error al cambiar método de entrega", "error");
            }
          }}
          onFechaEntregaChange={async (nuevaFecha) => {
            if (!poSelectedPedido?.numero) return;
            const ventaId = (poSelectedPedido as any)._ventaId || (poSelectedPedido as any).venta_id;
            try {
              await supabase.from("pedidos_tienda").update({ fecha_entrega: nuevaFecha }).eq("numero", poSelectedPedido.numero);
              // Also sync ventas.fecha so the pedido appears in the hoja de ruta of the new date.
              // Only safe when not delivered/cancelled (UI already enforces this).
              if (ventaId) await supabase.from("ventas").update({ fecha: nuevaFecha }).eq("id", ventaId);
              setPoSelectedPedido({ ...poSelectedPedido, fecha_entrega: nuevaFecha } as any);
              setPoPedidos(prev => prev.map(p => p.numero === poSelectedPedido.numero ? { ...p, fecha_entrega: nuevaFecha } : p));
              setVentas(prev => prev.map(v => v.numero === poSelectedPedido.numero ? { ...v, fecha: nuevaFecha } : v));
              showAdminToast("Fecha de entrega actualizada", "success");
            } catch {
              showAdminToast("Error al actualizar fecha", "error");
            }
          }}
          onSearchProducts={async (query) => {
            const { data } = await supabase
              .from("productos")
              .select("id, codigo, nombre, precio, costo, unidad_medida, es_combo, imagen_url, stock, presentaciones(nombre, precio, cantidad)")
              .eq("activo", true)
              .or(`nombre.ilike.%${query}%,codigo.ilike.%${query}%`)
              .limit(10);
            return (data || []).map((p: any) => ({
              id: p.id,
              codigo: p.codigo,
              nombre: p.nombre,
              precio: p.precio,
              unidad_medida: p.unidad_medida,
              es_combo: p.es_combo,
              imagen_url: p.imagen_url,
              stock: p.stock,
              presentaciones: (p.presentaciones || []).map((pr: any) => ({
                nombre: pr.nombre,
                precio: pr.precio,
                unidades_por_presentacion: pr.cantidad,
              })),
            }));
          }}
          cobroConfig={(() => {
            const isCancelled = poSelectedPedido.estado === "cancelado";
            const isDelivered = poSelectedPedido.estado === "entregado";
            const clienteId = (poSelectedPedido as any)._clienteId || "";
            const fp = ((poSelectedPedido as any).forma_pago || poSelectedPedido.metodo_pago || "").toLowerCase();
            if (isCancelled || isDelivered || (fp === "cuenta corriente" && !(poSelectedPedido as any).isOnline)) return undefined;
            return {
              ventaId: (poSelectedPedido as any)._ventaId || "",
              clienteId,
              clienteSaldo,
              cuentasBancarias,
              recargoTransferencia,
              onRegistrarCobro: handleRegistrarCobro,
            };
          })()}
        />
      )}


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
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setPoSearchHighlight((h) => Math.min(h + 1, poProductResults.length - 1));
                    setPoPresHighlight(0);
                  }
                  else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setPoSearchHighlight((h) => Math.max(h - 1, 0));
                    setPoPresHighlight(0);
                  }
                  else if (e.key === "ArrowRight") {
                    e.preventDefault();
                    const prod = poProductResults[poSearchHighlight];
                    if (!prod) return;
                    const variants = (prod.presentaciones || []).filter((pr: any) => (pr.unidades_por_presentacion || 1) !== 1);
                    const totalOpts = 1 + variants.length; // Unidad + variants
                    setPoPresHighlight((h) => Math.min(h + 1, totalOpts - 1));
                  }
                  else if (e.key === "ArrowLeft") {
                    e.preventDefault();
                    setPoPresHighlight((h) => Math.max(h - 1, 0));
                  }
                  else if (e.key === "Enter" && poProductResults.length > 0) {
                    e.preventDefault();
                    const prod = poProductResults[poSearchHighlight];
                    if (!prod) return;
                    const variants = (prod.presentaciones || []).filter((pr: any) => (pr.unidades_por_presentacion || 1) !== 1);
                    if (poPresHighlight === 0) {
                      poAddProduct(prod); // Unidad
                    } else {
                      poAddProduct(prod, variants[poPresHighlight - 1]);
                    }
                  }
                  else if (e.key === "Escape") {
                    setPoAddProductOpen(false);
                    setPoProductSearch("");
                    setPoProductResults([]);
                  }
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
                  const rawVariants = (!p.es_combo && p.presentaciones) ? p.presentaciones : [];
                  const boxVariants = rawVariants.filter((pr: any) => (pr.unidades_por_presentacion || 1) !== 1);
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
                            {p.es_combo
                              ? <><span className="text-violet-600 font-medium">Combo</span><span>·</span></>
                              : stockVal !== null && <><span>Stock: <strong className={stockVal <= 0 ? "text-red-500" : ""}>{stockVal}</strong></span><span>·</span></>
                            }
                            <span className="font-semibold text-foreground">{formatCurrency(p.precio)}</span>
                          </div>
                        </div>
                      </button>
                      {boxVariants.length > 0 && (
                        <div className="flex gap-2 mt-2.5 pl-14">
                          <Button
                            size="sm"
                            variant={highlighted && poPresHighlight === 0 ? "default" : "outline"}
                            className="h-8 text-xs flex-1"
                            onClick={() => poAddProduct(p)}
                          >
                            + Unidad
                          </Button>
                          {boxVariants.map((pr, i) => (
                            <Button
                              key={i}
                              size="sm"
                              variant={highlighted && poPresHighlight === i + 1 ? "default" : "default"}
                              className={`h-8 text-xs flex-1 ${highlighted && poPresHighlight === i + 1 ? "ring-2 ring-offset-1 ring-primary" : ""}`}
                              onClick={() => poAddProduct(p, pr)}
                            >
                              + {pr.nombre}
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

      {/* WhatsApp prompt — al marcar retiro como armado */}
      <Dialog open={waPrompt.open} onOpenChange={(o) => setWaPrompt(prev => ({ ...prev, open: o }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-emerald-500 text-2xl">💬</span>
              Avisar al cliente por WhatsApp
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {waPrompt.nombreCliente} · <span className="font-mono">{waPrompt.telefono}</span>
            </p>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Mensaje</label>
              <textarea
                value={waPrompt.mensaje}
                onChange={(ev) => setWaPrompt(prev => ({ ...prev, mensaje: ev.target.value }))}
                rows={6}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Editalo si querés. Al apretar &quot;Abrir WhatsApp&quot; se abre la app/web con el mensaje listo, vos solo apretás Enviar.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button
                variant="outline"
                className="sm:flex-1"
                onClick={() => setWaPrompt(prev => ({ ...prev, open: false }))}
              >
                No avisar
              </Button>
              <Button
                className="sm:flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => {
                  // Normalizar telefono argentino: solo dígitos, prepend "549" si no tiene país
                  let digits = waPrompt.telefono.replace(/\D/g, "");
                  if (digits.startsWith("0")) digits = digits.slice(1);
                  if (digits.startsWith("15")) digits = digits.slice(2);
                  if (!digits.startsWith("54")) digits = "549" + digits;
                  else if (!digits.startsWith("549")) digits = "549" + digits.slice(2);
                  const url = `https://wa.me/${digits}?text=${encodeURIComponent(waPrompt.mensaje)}`;
                  window.open(url, "_blank", "noopener,noreferrer");
                  setWaPrompt(prev => ({ ...prev, open: false }));
                }}
              >
                Abrir WhatsApp
              </Button>
            </div>
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
                        : fp.toLowerCase().includes("mixto") ? "Mixto"
                        : "Efectivo";

                      const cuentaAlias = (order as any).cuenta_transferencia_alias || null;
                      // Guard: Transferencia/Mixto require a bank account. If missing, force full cobro dialog.
                      if ((metodo === "Transferencia" || metodo === "Mixto") && !cuentaAlias) {
                        showAdminToast("Falta seleccionar la cuenta bancaria — usá 'Registrar cobro'", "error");
                        poOpenDetail(order);
                        return;
                      }

                      if (ventaId) {
                        // Pre-surcharge base: leer subtotal directo de la venta para evitar
                        // que poEditItems (estado React global, puede quedar stale entre pedidos)
                        // contamine el cálculo. Si la venta no trae subtotal, caer al order.subtotal del card.
                        const { data: ventaBaseRow } = await supabase
                          .from("ventas")
                          .select("subtotal")
                          .eq("id", ventaId)
                          .single();
                        const subtotalVenta = (ventaBaseRow?.subtotal ?? order.subtotal ?? 0);
                        const orderBase = subtotalVenta + (order.costo_envio || 0);
                        // If pedido already has the surcharge applied, do NOT add it again
                        const pedidoRecargo = Number((order as any).recargo_transferencia) || 0;
                        const alreadyHasRecargo = pedidoRecargo > 0;

                        let finalTotal = orderBase;

                        if (metodo === "Cuenta Corriente" && clienteIdOrder) {
                          // CC: add to saldo (NO caja entry — CC is not cash in register)
                          const { data: nuevoSaldoData } = await supabase.rpc("atomic_update_client_saldo", { p_client_id: clienteIdOrder, p_change: orderBase });
                          const newSaldo = nuevoSaldoData ?? 0;
                          await supabase.from("cuenta_corriente").insert({ cliente_id: clienteIdOrder, fecha: hoy, comprobante: `Cobro #${order.numero}`, descripcion: "A cuenta corriente", debe: orderBase, haber: 0, saldo: newSaldo, forma_pago: "Cuenta Corriente", venta_id: ventaId });
                          finalTotal = orderBase;
                        } else if (metodo === "Mixto") {
                          // Mixto: use stored efectivo/transferencia split — amounts already include surcharge if pedidoRecargo > 0
                          const me = (order as any).monto_efectivo || 0;
                          const mt = (order as any).monto_transferencia || 0;
                          const surchargeAmt = alreadyHasRecargo ? 0 : (mt > 0 && recargoTransferencia > 0 ? Math.round(mt * recargoTransferencia / 100) : 0);
                          const mtFinal = mt + surchargeAmt;
                          if (me > 0) await supabase.from("caja_movimientos").insert({ fecha: hoy, hora, tipo: "ingreso", descripcion: `Cobro #${order.numero} (Efectivo)`, metodo_pago: "Efectivo", monto: me, referencia_id: ventaId, referencia_tipo: "venta" });
                          if (mt > 0) await supabase.from("caja_movimientos").insert({ fecha: hoy, hora, tipo: "ingreso", descripcion: `Cobro #${order.numero} (Transferencia)`, metodo_pago: "Transferencia", monto: mtFinal, referencia_id: ventaId, referencia_tipo: "venta", cuenta_bancaria: cuentaAlias });
                          finalTotal = me + mtFinal;
                        } else if (metodo === "Transferencia") {
                          // Transferencia pura — si el pedido ya trae recargo, usar total directo
                          const surchargeAmt = alreadyHasRecargo ? 0 : (recargoTransferencia > 0 ? Math.round(orderBase * recargoTransferencia / 100) : 0);
                          const base = alreadyHasRecargo ? (order.total || orderBase) : orderBase;
                          const monto = base + surchargeAmt;
                          await supabase.from("caja_movimientos").insert({ fecha: hoy, hora, tipo: "ingreso", descripcion: `Cobro #${order.numero} (Transferencia)`, metodo_pago: "Transferencia", monto, referencia_id: ventaId, referencia_tipo: "venta", cuenta_bancaria: cuentaAlias });
                          finalTotal = monto;
                        } else {
                          // Efectivo
                          await supabase.from("caja_movimientos").insert({ fecha: hoy, hora, tipo: "ingreso", descripcion: `Cobro #${order.numero}`, metodo_pago: "Efectivo", monto: orderBase, referencia_id: ventaId, referencia_tipo: "venta" });
                          finalTotal = orderBase;
                        }

                        const ventaUpd: Record<string, unknown> = { forma_pago: metodo, monto_pagado: finalTotal, total: finalTotal, entregado: true, estado: "entregado" };
                        if (cuentaAlias && (metodo === "Transferencia" || metodo === "Mixto")) ventaUpd.cuenta_transferencia_alias = cuentaAlias;
                        await supabase.from("ventas").update(ventaUpd).eq("id", ventaId);
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

      {contextMenu && (() => {
        const order = contextMenu.order;
        const v = ventas.find((vr) => vr.id === order._ventaId) || ventas.find((vr) => vr.numero === order.numero);
        const isCancelled = order.estado === "cancelado" || order.estado === "anulada";
        const isDelivered = order.estado === "entregado";
        return (
          <div
            className="fixed z-50 bg-background border border-border rounded-xl shadow-lg py-1 min-w-[220px]"
            style={{ left: contextMenu.x, top: contextMenu.y, maxHeight: "calc(100vh - 16px)", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className="px-3 py-2 border-b">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide truncate">
                {`#${order.numero} — ${order.nombre_cliente}`.slice(0, 32)}
                {`#${order.numero} — ${order.nombre_cliente}`.length > 32 ? "..." : ""}
              </p>
            </div>
            <div className="py-1">
              <button
                className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-muted/60 transition-colors text-left"
                onClick={() => { setContextMenu(null); poOpenDetail(order); }}
              >
                <Eye className="w-4 h-4 text-muted-foreground" /> Ver detalle
              </button>
              <button
                className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-muted/60 transition-colors text-left"
                onClick={async () => {
                  setContextMenu(null);
                  try {
                    let ventaForPrint = v;
                    if (!ventaForPrint) {
                      const { data: rows } = await supabase.from("ventas").select("*, clientes(nombre, cuit, domicilio, telefono, email)").eq("numero", order.numero).order("created_at", { ascending: false }).limit(1);
                      if (rows && rows.length > 0) ventaForPrint = rows[0] as any;
                    }
                    if (ventaForPrint) {
                      if (order.nombre_cliente && (order._source === "pedidos" || (order as any).isOnline)) {
                        (ventaForPrint as any).clientes = { nombre: order.nombre_cliente, cuit: "", domicilio: order.direccion_texto || "", telefono: order.telefono || "", email: order.email || "" };
                      }
                      preparePrint(ventaForPrint);
                    } else {
                      showAdminToast("No se encontró la venta vinculada para imprimir", "error");
                    }
                  } catch {
                    showAdminToast("Error al preparar impresión", "error");
                  }
                }}
              >
                {(order as any)._impreso_at ? <PrinterCheck className="w-4 h-4 text-emerald-600" /> : <Printer className="w-4 h-4 text-muted-foreground" />}
                {(order as any)._impreso_at ? "Reimprimir comprobante" : "Imprimir comprobante"}
              </button>
              {!isDelivered && !isCancelled && (
                <button
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-muted/60 transition-colors text-left"
                  onClick={async () => {
                    setContextMenu(null);
                    if (v) {
                      await marcarEntregado(v);
                    } else {
                      await poHandleEstadoChange(order, "entregado");
                      setVentas(prev => prev.map(vr => vr.numero === order.numero ? { ...vr, estado: "entregado", entregado: true } as any : vr));
                      showAdminToast("Marcado como entregado", "success");
                    }
                  }}
                >
                  <CheckCircle className="w-4 h-4 text-green-600" /> Marcar entregado
                </button>
              )}
            </div>
            <div className="border-t py-1">
              <button
                className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-muted/60 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!order.nombre_cliente}
                onClick={() => {
                  setContextMenu(null);
                  router.push(`/admin/clientes?buscar=${encodeURIComponent(order.nombre_cliente || "")}`);
                }}
              >
                <User className="w-4 h-4 text-muted-foreground" /> Ver cliente
              </button>
            </div>
            {!isCancelled && v && (
              <div className="border-t py-1">
                <button
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-muted/60 transition-colors text-left text-destructive"
                  onClick={() => { setContextMenu(null); setAnularVenta(v); setAnularMotivo(""); }}
                >
                  <Ban className="w-4 h-4" /> Anular venta
                </button>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
