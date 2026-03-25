"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { VentaDetailDialog } from "@/components/venta-detail-dialog";
import type { VentaDetailData, VentaDetailItem } from "@/components/venta-detail-dialog";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Receipt,
  Users,
  Package as PackageIcon,
  CreditCard,
  Loader2,
  Calendar,
  ShoppingCart,
  Truck,
  Clock,
  Eye,
  Store,
  CheckCircle,
  Printer,
  MapPin,
  AlertTriangle,
  PackageCheck,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { ReceiptPrintView, defaultReceiptConfig } from "@/components/receipt-print-view";
import type { ReceiptConfig, ReceiptSale, ReceiptLineItem } from "@/components/receipt-print-view";
import { useWhiteLabel } from "@/hooks/use-white-label";
import { formatCurrency } from "@/lib/formatters";

function todayARG() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
}

const PIE_COLORS = ["oklch(0.55 0.2 264)", "oklch(0.65 0.18 160)", "oklch(0.7 0.15 50)", "oklch(0.6 0.2 300)"];

// Map Spanish day names to JS getDay() values
const DIA_TO_NUM: Record<string, number> = {
  Domingo: 0, Lunes: 1, Martes: 2, "Miercoles": 3, "Miércoles": 3,
  Jueves: 4, Viernes: 5, "Sabado": 6, "Sábado": 6,
};

type FilterMode = "diario" | "mensual" | "rango";

interface ClienteInfo {
  nombre: string;
  domicilio: string | null;
  localidad: string | null;
  telefono: string | null;
  saldo: number;
  situacion_iva: string | null;
}

interface VentaItemRow {
  id: string;
  producto_id: string | null;
  codigo: string | null;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  descuento: number;
  subtotal: number;
  unidad_medida: string | null;
  presentacion: string | null;
  unidades_por_presentacion: number | null;
}

interface PedidoVenta {
  id: string;
  numero: string;
  fecha: string;
  forma_pago: string;
  total: number;
  subtotal: number;
  estado: string;
  observacion: string | null;
  entregado: boolean;
  metodo_entrega: string | null;
  created_at: string;
  clientes: ClienteInfo | null;
  venta_items: VentaItemRow[];
}

function loadReceiptConfig(): ReceiptConfig {
  try {
    const stored = localStorage.getItem("receipt_config");
    if (stored) return { ...defaultReceiptConfig, ...JSON.parse(stored) };
  } catch (err) { console.error("Error loading dashboard:", err); }
  return defaultReceiptConfig;
}

// Clean up description to avoid "Unidad (Unidad)" or "Caja (x16) (Caja (x16))"
function cleanItemDescription(desc: string, presentacion?: string | null): string {
  let clean = desc
    .replace(/\s*[-–]\s*Unidad(\s*\(Unidad\))?$/, "")
    .replace(/\s*\(Unidad\)\s*$/, "");
  if (presentacion && presentacion !== "Unidad") {
    const escaped = presentacion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    clean = clean.replace(new RegExp(`(\\(?${escaped}\\)?)\\s*\\(?${escaped}\\)?`, "gi"), "$1");
  }
  return clean;
}

export default function DashboardPage() {
  const { config: wl } = useWhiteLabel();
  const [loading, setLoading] = useState(true);

  // ─── Filter state ───
  const [filterMode, setFilterMode] = useState<FilterMode>("diario");
  const [filterDate, setFilterDate] = useState(todayARG());
  const [filterMonth, setFilterMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [filterFrom, setFilterFrom] = useState(todayARG());
  const [filterTo, setFilterTo] = useState(todayARG());

  // ─── Data state ───
  const [ventasPeriodo, setVentasPeriodo] = useState(0);
  const [ticketsPeriodo, setTicketsPeriodo] = useState(0);
  const [gastosPeriodo, setGastosPeriodo] = useState(0);
  const [gananciaPeriodo, setGananciaPeriodo] = useState(0);
  const [capitalMercaderia, setCapitalMercaderia] = useState(0);
  const [cuentasCobrar, setCuentasCobrar] = useState(0);
  const [cuentasPagar, setCuentasPagar] = useState(0);
  const [paymentBreakdown, setPaymentBreakdown] = useState<{ name: string; value: number }[]>([]);
  const [monthlyData, setMonthlyData] = useState<{ name: string; ventas: number; egresos: number }[]>([]);
  const [ventasPorCategoria, setVentasPorCategoria] = useState<{ name: string; value: number }[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<{ id: string; nombre: string; codigo: string; stock: number; stock_minimo: number }[]>([]);

  // ─── Pedidos Online state ───
  const [pedidosOnline, setPedidosOnline] = useState<PedidoVenta[]>([]);
  const [pedidoEntregaMap, setPedidoEntregaMap] = useState<Record<string, string>>({});
  const [pedidoEstadoMap, setPedidoEstadoMap] = useState<Record<string, string>>({});
  const [pedidoFilter, setPedidoFilter] = useState<"todos" | "envio" | "retiro">("todos");
  const [selectedDayTab, setSelectedDayTab] = useState<string>("_today");
  const [diasEntrega, setDiasEntrega] = useState<string[]>([]);
  const [pedidoDetailOpen, setPedidoDetailOpen] = useState(false);
  const [pedidoDetail, setPedidoDetail] = useState<PedidoVenta | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // ─── Combo data for preview ───
  const [comboProductIds, setComboProductIds] = useState<Set<string>>(new Set());
  const [comboItemsMap, setComboItemsMap] = useState<Record<string, { nombre: string; cantidad: number }[]>>({});

  // ─── Print state ───
  const [receiptConfig, setReceiptConfig] = useState<ReceiptConfig>(defaultReceiptConfig);
  const [printSale, setPrintSale] = useState<ReceiptSale | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  // ─── Compute date range from filter ───
  const getDateRange = useCallback((): { start: string; end: string } => {
    if (filterMode === "diario") {
      const next = new Date(filterDate + "T12:00:00");
      next.setDate(next.getDate() + 1);
      return { start: filterDate, end: next.toISOString().split("T")[0] };
    }
    if (filterMode === "mensual") {
      const [y, m] = filterMonth.split("-").map(Number);
      const start = `${y}-${String(m).padStart(2, "0")}-01`;
      const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
      return { start, end };
    }
    const next = new Date(filterTo + "T12:00:00");
    next.setDate(next.getDate() + 1);
    return { start: filterFrom, end: next.toISOString().split("T")[0] };
  }, [filterMode, filterDate, filterMonth, filterFrom, filterTo]);

  const getFilterLabel = () => {
    if (filterMode === "diario") return new Date(filterDate + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
    if (filterMode === "mensual") {
      const [y, m] = filterMonth.split("-").map(Number);
      return new Date(y, m - 1, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
    }
    const from = new Date(filterFrom + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" });
    const to = new Date(filterTo + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
    return `${from} — ${to}`;
  };

  // ─── Build day tabs: Hoy first, then Lun-Sáb for the next 6 days ───
  const buildDayTabs = useCallback(() => {
    const today = todayARG();
    const todayDate = new Date(today + "T12:00:00");
    const tabs: { key: string; label: string; sublabel: string; isToday?: boolean; isPending?: boolean }[] = [];

    // Pendientes tab
    tabs.push({ key: "_pending", label: "Pendientes", sublabel: "", isPending: true });

    // Hoy always first
    tabs.push({
      key: today,
      label: "Hoy",
      sublabel: todayDate.toLocaleDateString("es-AR", { day: "numeric", month: "short" }),
      isToday: true,
    });

    // Next 6 days (Lun-Sáb)
    const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    for (let i = 1; i <= 6; i++) {
      const d = new Date(today + "T12:00:00");
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split("T")[0];
      tabs.push({
        key: dateStr,
        label: DAY_NAMES[d.getDay()],
        sublabel: d.toLocaleDateString("es-AR", { day: "numeric", month: "short" }),
      });
    }

    return tabs;
  }, []);

  // ─── Fetch pedidos online ───
  const fetchPedidosOnline = useCallback(async () => {
    const { data: ventasOnline } = await supabase
      .from("ventas")
      .select("id, numero, fecha, forma_pago, total, subtotal, estado, observacion, entregado, metodo_entrega, created_at, cuenta_transferencia_alias, clientes(nombre, domicilio, localidad, telefono, saldo, situacion_iva), venta_items(id, producto_id, codigo, descripcion, cantidad, precio_unitario, descuento, subtotal, unidad_medida, presentacion, unidades_por_presentacion)")
      .eq("origen", "tienda")
      .eq("entregado", false)
      .neq("estado", "anulada")
      .order("created_at", { ascending: false });

    const rows = (ventasOnline || []) as unknown as PedidoVenta[];
    setPedidosOnline(rows);

    // Fetch combo data for preview
    const allProductIds = rows.flatMap((v) => v.venta_items.map((i) => i.producto_id)).filter(Boolean) as string[];
    if (allProductIds.length > 0) {
      const uniqueIds = [...new Set(allProductIds)];
      const { data: prods } = await supabase.from("productos").select("id, es_combo").in("id", uniqueIds);
      const cIds = new Set<string>();
      for (const p of prods || []) {
        if ((p as any).es_combo) cIds.add(p.id);
      }
      setComboProductIds(cIds);
      const cMap: Record<string, { nombre: string; cantidad: number }[]> = {};
      for (const comboId of cIds) {
        const { data: ciData } = await supabase
          .from("combo_items")
          .select("cantidad, productos!combo_items_producto_id_fkey(nombre)")
          .eq("combo_id", comboId);
        cMap[comboId] = (ciData || []).map((ci: any) => ({ nombre: ci.productos?.nombre || "", cantidad: ci.cantidad }));
      }
      setComboItemsMap(cMap);
    } else {
      setComboProductIds(new Set());
      setComboItemsMap({});
    }

    const numeros = rows.map((v) => v.numero);
    if (numeros.length > 0) {
      const { data: pedidosTienda } = await supabase
        .from("pedidos_tienda")
        .select("numero, fecha_entrega, estado")
        .in("numero", numeros);
      const entregaMap: Record<string, string> = {};
      const estadoMap: Record<string, string> = {};
      (pedidosTienda || []).forEach((p: { numero: string; fecha_entrega: string | null; estado: string }) => {
        if (p.fecha_entrega) entregaMap[p.numero] = p.fecha_entrega;
        estadoMap[p.numero] = p.estado;
      });
      setPedidoEntregaMap(entregaMap);
      setPedidoEstadoMap(estadoMap);
    } else {
      setPedidoEntregaMap({});
      setPedidoEstadoMap({});
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const { start, end } = getDateRange();

    // Load receipt config from localStorage
    setReceiptConfig(loadReceiptConfig());

    // Fetch tienda config for delivery days
    const { data: tiendaConfig } = await supabase.from("tienda_config").select("dias_entrega").single();
    if (tiendaConfig?.dias_entrega) setDiasEntrega(tiendaConfig.dias_entrega);

    // Period sales
    const { data: periodSales } = await supabase.from("ventas").select("id, total, forma_pago, estado").gte("fecha", start).lt("fecha", end).neq("estado", "anulada");
    const salesTotal = (periodSales || []).reduce((a, v) => a + v.total, 0);
    setVentasPeriodo(salesTotal);
    setTicketsPeriodo((periodSales || []).length);

    // Split Mixto into Efectivo+Transferencia+CC using caja_movimientos + cuenta_corriente
    const mixtoIds = (periodSales || []).filter((v) => v.forma_pago === "Mixto").map((v) => v.id);
    let mixtoMovs: { referencia_id: string; metodo_pago: string; monto: number }[] = [];
    let mixtoCCData: { venta_id: string; debe: number }[] = [];
    if (mixtoIds.length > 0) {
      const [{ data: movs }, { data: ccRows }] = await Promise.all([
        supabase.from("caja_movimientos").select("referencia_id, metodo_pago, monto").eq("tipo", "ingreso").eq("referencia_tipo", "venta").in("referencia_id", mixtoIds),
        supabase.from("cuenta_corriente").select("venta_id, debe").in("venta_id", mixtoIds),
      ]);
      mixtoMovs = (movs || []) as any[];
      mixtoCCData = (ccRows || []) as any[];
    }
    const paymentMap: Record<string, number> = {};
    (periodSales || []).forEach((v) => {
      if (v.forma_pago === "Mixto") {
        const movs = mixtoMovs.filter((m) => m.referencia_id === v.id);
        const ccParts = mixtoCCData.filter((c) => c.venta_id === v.id);
        let desglosado = false;
        movs.forEach((m) => { paymentMap[m.metodo_pago] = (paymentMap[m.metodo_pago] || 0) + m.monto; desglosado = true; });
        ccParts.forEach((c) => { if (c.debe > 0) { paymentMap["Cuenta Corriente"] = (paymentMap["Cuenta Corriente"] || 0) + c.debe; desglosado = true; } });
        if (!desglosado) paymentMap["Efectivo"] = (paymentMap["Efectivo"] || 0) + v.total;
      } else {
        paymentMap[v.forma_pago] = (paymentMap[v.forma_pago] || 0) + v.total;
      }
    });
    setPaymentBreakdown(Object.entries(paymentMap).map(([name, value]) => ({ name, value })));

    const { data: periodExpenses } = await supabase.from("caja_movimientos").select("monto").gte("fecha", start).lt("fecha", end).eq("tipo", "egreso");
    setGastosPeriodo((periodExpenses || []).reduce((a, e) => a + Math.abs(e.monto), 0));

    const { data: ventaIds } = await supabase.from("ventas").select("id").gte("fecha", start).lt("fecha", end).neq("estado", "anulada");
    let gananciaTotal = 0;
    if (ventaIds && ventaIds.length > 0) {
      const ids = ventaIds.map((v) => v.id);
      const { data: items } = await supabase.from("venta_items").select("cantidad, precio_unitario, descuento, unidades_por_presentacion, presentacion, productos(costo)").in("venta_id", ids);
      gananciaTotal = (items || []).reduce((acc, item: any) => {
        const costoUnitario = item.productos?.costo ?? 0;
        const cantidad = Number(item.cantidad) || 0;
        const precioUnitario = Number(item.precio_unitario) || 0;
        const descPct = Number(item.descuento) || 0;
        const precioConDesc = precioUnitario * (1 - descPct / 100);
        let unidadesPorPres = Number(item.unidades_por_presentacion) || 1;
        const presTxt = (item.presentacion || "").toLowerCase();
        if (presTxt.includes("medio") && unidadesPorPres === 1) unidadesPorPres = 0.5;
        return acc + (precioConDesc - costoUnitario * unidadesPorPres) * cantidad;
      }, 0);
    }
    setGananciaPeriodo(gananciaTotal);

    const { data: prods } = await supabase.from("productos").select("id, nombre, codigo, stock, stock_minimo, precio, costo").eq("activo", true).limit(10000);
    setCapitalMercaderia((prods || []).reduce((a, p: any) => a + p.stock * (p.costo || p.precio), 0));
    setLowStockProducts((prods || []).filter((p: any) => p.stock_minimo > 0 && p.stock <= p.stock_minimo).sort((a: any, b: any) => a.stock - b.stock).slice(0, 20) as any);
    const { data: cls } = await supabase.from("clientes").select("saldo").eq("activo", true);
    setCuentasCobrar((cls || []).reduce((a, c) => a + (c.saldo > 0 ? c.saldo : 0), 0));
    const { data: provs } = await supabase.from("proveedores").select("saldo").eq("activo", true);
    setCuentasPagar((provs || []).reduce((a, p) => a + (p.saldo > 0 ? p.saldo : 0), 0));

    const months: { name: string; ventas: number; egresos: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(todayARG() + "T12:00:00"); d.setMonth(d.getMonth() - i);
      const year = d.getFullYear(); const month = d.getMonth() + 1;
      const mStart = `${year}-${String(month).padStart(2, "0")}-01`;
      const mEnd = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
      const { data: mv } = await supabase.from("ventas").select("total").gte("fecha", mStart).lt("fecha", mEnd).neq("estado", "anulada");
      const { data: me } = await supabase.from("caja_movimientos").select("monto").eq("tipo", "egreso").gte("fecha", mStart).lt("fecha", mEnd);
      months.push({ name: d.toLocaleDateString("es-AR", { month: "short" }), ventas: (mv || []).reduce((a, v) => a + v.total, 0), egresos: (me || []).reduce((a, e) => a + Math.abs(e.monto), 0) });
    }
    setMonthlyData(months);

    const { data: ventasCat } = await supabase.from("venta_items").select("subtotal, productos(categoria_id, categorias(nombre)), ventas!inner(fecha, estado)").gte("ventas.fecha", start).lt("ventas.fecha", end).neq("ventas.estado", "anulada");
    const catMap: Record<string, number> = {};
    (ventasCat || []).forEach((vi: any) => { catMap[vi.productos?.categorias?.nombre || "Sin categoria"] = (catMap[vi.productos?.categorias?.nombre || "Sin categoria"] || 0) + (vi.subtotal || 0); });
    setVentasPorCategoria(Object.entries(catMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value));

    await fetchPedidosOnline();
    setLoading(false);
  }, [getDateRange, fetchPedidosOnline]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ─── Realtime: new online orders notification ───
  const [newOrderAlert, setNewOrderAlert] = useState<string | null>(null);
  useEffect(() => {
    const channel = supabase
      .channel("new-online-orders")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ventas", filter: "origen=eq.tienda" }, (payload) => {
        const v = payload.new as any;
        setNewOrderAlert(`Nuevo pedido online #${v.numero} — $${Math.round(v.total).toLocaleString()}`);
        fetchPedidosOnline();
        setTimeout(() => setNewOrderAlert(null), 8000);
        // Play notification sound
        try { new Audio("/notification.mp3").play().catch(() => {}); } catch {}
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchPedidosOnline]);

  // ─── Print effect ───
  useEffect(() => {
    if (printSale && printRef.current) {
      const timeout = setTimeout(() => {
        const printWindow = window.open("", "_blank");
        if (!printWindow || !printRef.current) return;
        const content = printRef.current.innerHTML;
        printWindow.document.write(`<!DOCTYPE html><html><head><title>${printSale.tipoComprobante} ${printSale.numero}</title>
          <style>@page{size:A4;margin:0}body{margin:0;padding:0}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style>
          </head><body>${content}</body></html>`);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
        setPrintSale(null);
      }, 150);
      return () => clearTimeout(timeout);
    }
  }, [printSale]);

  // ─── Pedido actions ───
  const handleMarkDelivered = async (venta: PedidoVenta) => {
    if (!confirm(`Marcar pedido #${venta.numero} como entregado?`)) return;
    setActionLoading(venta.id);
    await supabase.from("ventas").update({ entregado: true, estado: "entregado" }).eq("id", venta.id);
    await supabase.from("pedidos_tienda").update({ estado: "entregado" }).eq("numero", venta.numero);
    setPedidosOnline((prev) => prev.filter((p) => p.id !== venta.id));
    setActionLoading(null);
  };

  const handleMarkArmado = async (venta: PedidoVenta) => {
    setActionLoading(venta.id);
    await supabase.from("pedidos_tienda").update({ estado: "armado" }).eq("numero", venta.numero);
    await supabase.from("ventas").update({ estado: "armado" }).eq("id", venta.id);
    setPedidoEstadoMap((prev) => ({ ...prev, [venta.numero]: "armado" }));
    setActionLoading(null);
  };

  const handlePrintRemito = async (venta: PedidoVenta) => {
    const cliente = venta.clientes;

    // Fetch product IDs to check for combos
    const { data: ventaItemsDB } = await supabase
      .from("venta_items")
      .select("id, producto_id, codigo, descripcion, cantidad, unidad_medida, precio_unitario, descuento, subtotal, presentacion, unidades_por_presentacion")
      .eq("venta_id", venta.id)
      .order("created_at");
    const itemsForPrint = (ventaItemsDB || []) as VentaItemRow[];

    // Load combo data
    const productIds = itemsForPrint.map((i) => i.producto_id).filter(Boolean) as string[];
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

    const saleItems: ReceiptLineItem[] = itemsForPrint.map((item) => ({
      id: item.id,
      producto_id: item.producto_id || "",
      code: item.codigo || "",
      description: item.descripcion,
      qty: item.cantidad,
      unit: item.unidad_medida || "Un",
      price: item.precio_unitario,
      discount: item.descuento || 0,
      subtotal: item.subtotal,
      presentacion: item.presentacion || "Unidad",
      unidades_por_presentacion: item.unidades_por_presentacion || 1,
      stock: 0,
      es_combo: comboIds.has(item.producto_id || ""),
      comboItems: comboItemsMap[item.producto_id || ""] || [],
    }));

    // Fetch payment breakdown from caja_movimientos
    let pagoEf = 0, pagoTr = 0, pagoCC = 0;
    const { data: movs } = await supabase.from("caja_movimientos")
      .select("metodo_pago, monto, tipo")
      .eq("referencia_id", venta.id)
      .eq("referencia_tipo", "venta");
    for (const m of movs || []) {
      if (m.tipo === "ingreso") {
        if (m.metodo_pago === "Efectivo") pagoEf += m.monto;
        else if (m.metodo_pago === "Transferencia") pagoTr += m.monto;
        else if (m.metodo_pago === "Cuenta Corriente") pagoCC += m.monto;
      }
    }
    // Fallback: if no caja_movimientos, try pedidos_tienda
    if (pagoEf === 0 && pagoTr === 0 && pagoCC === 0) {
      const { data: pedido } = await supabase.from("pedidos_tienda")
        .select("monto_efectivo, monto_transferencia, recargo_transferencia")
        .eq("numero", venta.numero)
        .single();
      if (pedido) {
        pagoEf = pedido.monto_efectivo || 0;
        pagoTr = pedido.monto_transferencia || 0;
      }
    }

    // Fetch client saldo
    const saldoActual = cliente?.saldo || 0;

    const sale: ReceiptSale = {
      numero: venta.numero,
      total: venta.total,
      subtotal: venta.subtotal || venta.total,
      descuento: 0,
      recargo: 0,
      transferSurcharge: 0,
      tipoComprobante: "Pedido Web",
      formaPago: venta.forma_pago,
      moneda: "ARS",
      cliente: cliente?.nombre || "Consumidor Final",
      clienteDireccion: [cliente?.domicilio, cliente?.localidad].filter(Boolean).join(", ") || null,
      clienteTelefono: cliente?.telefono || null,
      clienteCondicionIva: cliente?.situacion_iva || null,
      vendedor: "Pedido Online",
      items: saleItems,
      fecha: new Date(venta.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }),
      saldoAnterior: saldoActual,
      saldoNuevo: saldoActual,
      pagoEfectivo: pagoEf || undefined,
      pagoTransferencia: pagoTr || undefined,
      pagoCuentaCorriente: pagoCC || undefined,
    };
    setPrintSale(sale);
  };

  // ─── Filtered pedidos ───
  const today = todayARG();
  const dayTabs = buildDayTabs();
  const activeTab = selectedDayTab === "_today" ? today : selectedDayTab;
  const effectiveTab = dayTabs.find((t) => t.key === activeTab) ? activeTab : today;

  const pendientes = pedidosOnline.filter((p) => {
    const fe = pedidoEntregaMap[p.numero];
    if (!fe) return true;
    return fe < today;
  });

  const countByTab: Record<string, number> = {};
  for (const tab of dayTabs) {
    if (tab.key === "_pending") {
      countByTab[tab.key] = pendientes.length;
    } else {
      countByTab[tab.key] = pedidosOnline.filter((p) => pedidoEntregaMap[p.numero] === tab.key).length;
    }
  }

  let tabPedidos = effectiveTab === "_pending"
    ? pendientes
    : pedidosOnline.filter((p) => pedidoEntregaMap[p.numero] === effectiveTab);

  // Apply envio/retiro filter
  if (pedidoFilter === "envio") tabPedidos = tabPedidos.filter((p) => p.metodo_entrega === "envio");
  if (pedidoFilter === "retiro") tabPedidos = tabPedidos.filter((p) => p.metodo_entrega === "retiro");

  const totalPedidos = tabPedidos.reduce((s, p) => s + p.total, 0);
  const countEnvio = pedidosOnline.filter((p) => p.metodo_entrega === "envio").length;
  const countRetiro = pedidosOnline.filter((p) => p.metodo_entrega === "retiro").length;

  const ganancia = gananciaPeriodo;
  const periodLabel = filterMode === "diario" ? "del dia" : filterMode === "mensual" ? "del mes" : "del periodo";

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">Resumen de actividad — {getFilterLabel()}</p>
        </div>
        <Badge variant="outline" className="text-xs w-fit">{wl.system_name || "DulceSur"}</Badge>
      </div>

      {/* ─── Accesos Rápidos ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link href="/admin/ventas" className="flex items-center gap-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl p-4 hover:shadow-lg hover:scale-[1.02] transition-all">
          <ShoppingCart className="w-6 h-6 shrink-0" />
          <div><p className="font-bold text-sm">Nueva Venta</p><p className="text-[10px] opacity-80">Abrir POS</p></div>
        </Link>
        <Link href="/admin/clientes" className="flex items-center gap-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl p-4 hover:shadow-lg hover:scale-[1.02] transition-all">
          <CreditCard className="w-6 h-6 shrink-0" />
          <div><p className="font-bold text-sm">Cobrar Deuda</p><p className="text-[10px] opacity-80">Cuenta corriente</p></div>
        </Link>
        <Link href="/admin/compras" className="flex items-center gap-3 bg-gradient-to-r from-violet-500 to-violet-600 text-white rounded-xl p-4 hover:shadow-lg hover:scale-[1.02] transition-all">
          <Truck className="w-6 h-6 shrink-0" />
          <div><p className="font-bold text-sm">Cargar Compra</p><p className="text-[10px] opacity-80">Proveedor</p></div>
        </Link>
        <Link href="/admin/productos" className="flex items-center gap-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl p-4 hover:shadow-lg hover:scale-[1.02] transition-all">
          <PackageIcon className="w-6 h-6 shrink-0" />
          <div><p className="font-bold text-sm">Productos</p><p className="text-[10px] opacity-80">Gestionar catálogo</p></div>
        </Link>
      </div>

      {/* ─── Stock Bajo ─── */}
      {lowStockProducts.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-semibold text-amber-800">Stock bajo ({lowStockProducts.length} producto{lowStockProducts.length !== 1 ? "s" : ""})</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {lowStockProducts.slice(0, 10).map((p) => (
              <div key={p.id} className="flex items-center gap-1.5 bg-white rounded-md border border-amber-200 px-2.5 py-1 text-xs">
                <span className="font-medium text-amber-900 truncate max-w-[180px]">{p.nombre}</span>
                <span className={`font-bold ${p.stock <= 0 ? "text-red-600" : "text-amber-600"}`}>{p.stock} un.</span>
                <span className="text-amber-500">/ mín. {p.stock_minimo}</span>
              </div>
            ))}
            {lowStockProducts.length > 10 && (
              <span className="text-xs text-amber-600 self-center">+{lowStockProducts.length - 10} más</span>
            )}
          </div>
        </div>
      )}

      {/* ─── Pedidos Online ─── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-primary" />
              Pedidos Online
              {pedidosOnline.length > 0 && (
                <Badge variant="secondary" className="text-xs">{pedidosOnline.length} pendiente{pedidosOnline.length !== 1 ? "s" : ""}</Badge>
              )}
            </CardTitle>
            <Link href="/admin/ventas/hoja-ruta">
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                <Truck className="w-3.5 h-3.5" />
                Hoja de Ruta
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Day tabs */}
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {dayTabs.map((tab) => {
              const count = countByTab[tab.key] || 0;
              const isActive = effectiveTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setSelectedDayTab(tab.key === today ? "_today" : tab.key)}
                  className={`flex flex-col items-center min-w-[72px] px-3 py-2 rounded-xl border-2 transition-all text-center shrink-0 ${
                    isActive
                      ? tab.isPending
                        ? "border-red-500 bg-red-50 dark:bg-red-950/20"
                        : "border-primary bg-primary/5"
                      : count > 0
                        ? "border-muted bg-muted/50 hover:border-muted-foreground/30"
                        : "border-transparent bg-muted/30 hover:bg-muted/50"
                  }`}
                >
                  <span className={`text-xs font-semibold ${
                    isActive ? tab.isPending ? "text-red-700 dark:text-red-400" : "text-primary" : "text-muted-foreground"
                  }`}>{tab.label}</span>
                  <span className={`text-[10px] ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                    {tab.isPending ? (count > 0 ? <AlertTriangle className="w-3 h-3 text-red-500 inline" /> : "—") : tab.sublabel}
                  </span>
                  {count > 0 && (
                    <span className={`mt-0.5 text-[10px] font-bold rounded-full px-1.5 ${
                      isActive ? tab.isPending ? "bg-red-500 text-white" : "bg-primary text-primary-foreground" : "bg-muted-foreground/20 text-muted-foreground"
                    }`}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Entrega filter */}
          <div className="flex items-center gap-3">
            <div className="flex border rounded-lg overflow-hidden">
              {([
                { key: "todos" as const, label: "Todos" },
                { key: "envio" as const, label: "Envio", icon: Truck },
                { key: "retiro" as const, label: "Retiro", icon: Store },
              ]).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setPedidoFilter(tab.key)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5 ${
                    pedidoFilter === tab.key
                      ? "bg-primary text-primary-foreground"
                      : "bg-background hover:bg-muted text-muted-foreground"
                  }`}
                >
                  {tab.icon && <tab.icon className="w-3 h-3" />}
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Pedidos list */}
          {tabPedidos.length === 0 ? (
            <div className="text-center py-10">
              <ShoppingCart className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">
                {pedidosOnline.length === 0 ? "No hay pedidos online pendientes" : "No hay pedidos con los filtros seleccionados"}
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-sm px-1">
                <span className="text-muted-foreground">{tabPedidos.length} pedido{tabPedidos.length !== 1 ? "s" : ""}</span>
                <span className="font-bold">{formatCurrency(totalPedidos)}</span>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="w-[50px]"></TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="hidden sm:table-cell">Pago</TableHead>
                      <TableHead className="hidden md:table-cell">Pedido</TableHead>
                      <TableHead className="hidden md:table-cell">Estado</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right w-[160px]">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tabPedidos.map((p) => {
                      const createdDate = new Date(p.created_at);
                      const dateStr = createdDate.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });
                      const timeStr = createdDate.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Argentina/Buenos_Aires" });
                      const isOverdue = effectiveTab === "_pending";
                      const isLoading = actionLoading === p.id;
                      const pedidoEstado = pedidoEstadoMap[p.numero] || "pendiente";
                      const isArmado = pedidoEstado === "armado";
                      const isRetiro = p.metodo_entrega === "retiro";

                      return (
                        <TableRow key={p.id} className={isOverdue ? "bg-red-50/50 dark:bg-red-950/10" : ""}>
                          <TableCell>
                            <div className={`w-8 h-8 rounded-md flex items-center justify-center ${
                              p.metodo_entrega === "envio" ? "bg-blue-100 dark:bg-blue-900/30" : "bg-emerald-100 dark:bg-emerald-900/30"
                            }`}>
                              {p.metodo_entrega === "envio" ? <Truck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> : <Store className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <span className="font-medium text-sm">{p.clientes?.nombre || "Sin cliente"}</span>
                              <span className="text-xs text-muted-foreground ml-2">#{p.numero}</span>
                            </div>
                            {p.clientes?.domicilio && p.metodo_entrega === "envio" && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                                <MapPin className="w-3 h-3 shrink-0" />
                                <span className="truncate max-w-[200px]">{[p.clientes.domicilio, p.clientes.localidad].filter(Boolean).join(", ")}</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <Badge variant="outline" className="text-[10px] font-normal">{p.forma_pago}</Badge>
                            {(() => {
                              const fp = (p.forma_pago || "").toLowerCase();
                              const hasTransfer = fp.includes("transferencia") || fp.includes("mixto");
                              if (hasTransfer && !(p as any).cuenta_transferencia_alias) {
                                return <Badge variant="outline" className="text-[10px] font-normal ml-1 border-amber-300 bg-amber-50 text-amber-700">Sin cuenta</Badge>;
                              }
                              return null;
                            })()}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="w-3 h-3" />
                              {dateStr} {timeStr}
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            {isArmado ? (
                              <Badge className="text-[10px] px-1.5 py-0 bg-violet-100 text-violet-700 hover:bg-violet-100 dark:bg-violet-900/30 dark:text-violet-400">Armado</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">Pendiente</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="font-bold text-sm">{formatCurrency(p.total)}</span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Ver detalle"
                                onClick={() => { setPedidoDetail(p); setPedidoDetailOpen(true); }}>
                                <Eye className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Imprimir remito"
                                onClick={() => handlePrintRemito(p)}>
                                <Printer className="w-3.5 h-3.5" />
                              </Button>
                              {isRetiro && !isArmado && (
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-violet-600 hover:text-violet-700 hover:bg-violet-50"
                                  title="Marcar como armado" disabled={isLoading}
                                  onClick={() => handleMarkArmado(p)}>
                                  {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PackageCheck className="w-3.5 h-3.5" />}
                                </Button>
                              )}
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                title="Marcar entregado" disabled={isLoading}
                                onClick={() => handleMarkDelivered(p)}>
                                {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ─── Date filter ─── */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Resumen de Actividad</span>
            </div>
            <div className="flex border rounded-lg overflow-hidden">
              {(["diario", "mensual", "rango"] as FilterMode[]).map((mode) => (
                <button key={mode} onClick={() => setFilterMode(mode)}
                  className={`px-4 py-1.5 text-sm font-medium transition-colors ${filterMode === mode ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted text-muted-foreground"}`}>
                  {mode === "diario" ? "Diario" : mode === "mensual" ? "Mensual" : "Entre Fechas"}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-1">
              {filterMode === "diario" && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">Filtrar por dia</span>
                  <Input type="date" value={filterDate} onChange={(ev) => setFilterDate(ev.target.value)} className="h-9 w-44" />
                </div>
              )}
              {filterMode === "mensual" && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">Mes</span>
                  <Input type="month" value={filterMonth} onChange={(ev) => setFilterMonth(ev.target.value)} className="h-9 w-44" />
                </div>
              )}
              {filterMode === "rango" && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">Desde</span>
                  <Input type="date" value={filterFrom} onChange={(ev) => setFilterFrom(ev.target.value)} className="h-9 w-40" />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">Hasta</span>
                  <Input type="date" value={filterTo} onChange={(ev) => setFilterTo(ev.target.value)} className="h-9 w-40" />
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Ventas {periodLabel}</p><p className="text-2xl font-bold mt-1">{formatCurrency(ventasPeriodo)}</p></div><div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><DollarSign className="w-5 h-5 text-primary" /></div></div></CardContent></Card>
            <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Ganancia</p><div className="flex items-baseline gap-2 mt-1"><p className="text-2xl font-bold">{formatCurrency(ganancia)}</p><span className={`text-sm font-semibold ${ganancia >= 0 ? "text-emerald-600" : "text-red-500"}`}>{ventasPeriodo > 0 ? `${((ganancia / ventasPeriodo) * 100).toFixed(1)}%` : "—"}</span></div></div><div className={`w-10 h-10 rounded-xl flex items-center justify-center ${ganancia >= 0 ? "bg-emerald-500/10" : "bg-red-500/10"}`}>{ganancia >= 0 ? <TrendingUp className="w-5 h-5 text-emerald-500" /> : <TrendingDown className="w-5 h-5 text-red-500" />}</div></div></CardContent></Card>
            <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Gastos</p><p className="text-2xl font-bold mt-1">{formatCurrency(gastosPeriodo)}</p></div><div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center"><TrendingDown className="w-5 h-5 text-orange-500" /></div></div></CardContent></Card>
            <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Tickets</p><p className="text-2xl font-bold mt-1">{ticketsPeriodo}</p></div><div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center"><Receipt className="w-5 h-5 text-violet-500" /></div></div></CardContent></Card>
          </div>

          {/* Balance cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-primary/5 border-primary/10"><CardContent className="pt-6 flex items-center gap-4"><PackageIcon className="w-8 h-8 text-primary/60" /><div><p className="text-xs text-muted-foreground">Capital en mercaderia</p><p className="text-lg font-semibold">{formatCurrency(capitalMercaderia)}</p></div></CardContent></Card>
            <Card className="bg-emerald-500/5 border-emerald-500/10"><CardContent className="pt-6 flex items-center gap-4"><Users className="w-8 h-8 text-emerald-500/60" /><div><p className="text-xs text-muted-foreground">Cuentas a cobrar</p><p className="text-lg font-semibold">{formatCurrency(cuentasCobrar)}</p></div></CardContent></Card>
            <Card className="bg-orange-500/5 border-orange-500/10"><CardContent className="pt-6 flex items-center gap-4"><CreditCard className="w-8 h-8 text-orange-500/60" /><div><p className="text-xs text-muted-foreground">Cuentas a pagar</p><p className="text-lg font-semibold">{formatCurrency(cuentasPagar)}</p></div></CardContent></Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle className="text-base">Ventas y egresos — ultimos 6 meses</CardTitle></CardHeader>
              <CardContent><div className="h-[300px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyData} barGap={4}><CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.005 260)" /><XAxis dataKey="name" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v > 1000000 ? `${(v / 1000000).toFixed(0)}M` : v > 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)} /><Tooltip formatter={(value) => formatCurrency(Number(value))} contentStyle={{ borderRadius: "0.75rem", fontSize: "13px" }} /><Bar dataKey="ventas" name="Ventas" fill="oklch(0.55 0.2 264)" radius={[6, 6, 0, 0]} /><Bar dataKey="egresos" name="Egresos" fill="oklch(0.7 0.15 50)" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Formas de pago ({periodLabel})</CardTitle></CardHeader>
              <CardContent>
                {paymentBreakdown.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">Sin ventas en este periodo</p> : (
                  <>
                    <div className="h-[200px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={paymentBreakdown} innerRadius={55} outerRadius={80} dataKey="value" stroke="none">{paymentBreakdown.map((_, i) => (<Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />))}</Pie><Tooltip formatter={(value) => formatCurrency(Number(value))} contentStyle={{ borderRadius: "0.75rem", fontSize: "13px" }} /></PieChart></ResponsiveContainer></div>
                    <div className="space-y-2 mt-2">{paymentBreakdown.map((m, i) => (<div key={m.name} className="flex items-center justify-between text-sm"><div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} /><span className="text-muted-foreground">{m.name}</span></div><span className="font-medium">{formatCurrency(m.value)}</span></div>))}</div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Ventas por categoria */}
          <Card>
            <CardHeader><CardTitle className="text-base">Ventas por categoria — {periodLabel}</CardTitle></CardHeader>
            <CardContent>
              {ventasPorCategoria.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">Sin datos en este periodo</p> : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={ventasPorCategoria} layout="vertical" barSize={20}><CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.005 260)" /><XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => v > 1000000 ? `${(v / 1000000).toFixed(0)}M` : v > 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)} /><YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={120} /><Tooltip formatter={(value) => formatCurrency(Number(value))} contentStyle={{ borderRadius: "0.75rem", fontSize: "13px" }} /><Bar dataKey="value" name="Ventas" fill="oklch(0.55 0.2 264)" radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer></div>
                  <div className="space-y-2">{ventasPorCategoria.map((cat, i) => { const totalCat = ventasPorCategoria.reduce((a, c) => a + c.value, 0); const pct = totalCat > 0 ? ((cat.value / totalCat) * 100).toFixed(1) : "0"; return (<div key={cat.name} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0"><div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} /><span>{cat.name}</span></div><div className="flex items-center gap-3"><span className="text-muted-foreground text-xs">{pct}%</span><span className="font-medium">{formatCurrency(cat.value)}</span></div></div>); })}</div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Pedido Detail Dialog */}
      <VentaDetailDialog
        open={pedidoDetailOpen}
        onOpenChange={setPedidoDetailOpen}
        data={pedidoDetail ? {
          numero: pedidoDetail.numero,
          created_at: pedidoDetail.created_at,
          fecha: pedidoDetail.fecha,
          estado: pedidoEstadoMap[pedidoDetail.numero] || "pendiente",
          forma_pago: pedidoDetail.forma_pago,
          metodo_entrega: pedidoDetail.metodo_entrega || undefined,
          total: pedidoDetail.total,
          subtotal: pedidoDetail.subtotal,
          observacion: pedidoDetail.observacion,
          entregado: pedidoDetail.entregado,
          nombre_cliente: pedidoDetail.clientes?.nombre || "Consumidor Final",
          telefono: pedidoDetail.clientes?.telefono || undefined,
          domicilio: [pedidoDetail.clientes?.domicilio, pedidoDetail.clientes?.localidad].filter(Boolean).join(", ") || undefined,
          fecha_entrega: pedidoEntregaMap[pedidoDetail.numero] || null,
          cuenta_transferencia_alias: (pedidoDetail as any).cuenta_transferencia_alias || null,
          origen: "pedidos",
          comboIds: comboProductIds,
        } : null}
        items={pedidoDetail?.venta_items.map((item) => ({
          id: item.id,
          producto_id: item.producto_id,
          codigo: item.codigo || undefined,
          descripcion: item.descripcion,
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario,
          descuento: item.descuento,
          subtotal: item.subtotal,
          unidades_por_presentacion: item.unidades_por_presentacion ?? undefined,
        })) || []}
        onPrint={pedidoDetail ? () => { setPedidoDetailOpen(false); handlePrintRemito(pedidoDetail); } : undefined}
        footerExtra={pedidoDetail ? (
          <div className="flex gap-2">
            {pedidoDetail.metodo_entrega === "retiro" && (pedidoEstadoMap[pedidoDetail.numero] || "pendiente") !== "armado" && (
              <Button variant="outline" size="sm" className="gap-1.5 text-violet-600 border-violet-200 hover:bg-violet-50"
                disabled={actionLoading === pedidoDetail.id}
                onClick={() => handleMarkArmado(pedidoDetail)}>
                <PackageCheck className="w-3.5 h-3.5" /> Marcar Armado
              </Button>
            )}
            <Button variant="default" size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
              disabled={actionLoading === pedidoDetail.id}
              onClick={() => { setPedidoDetailOpen(false); handleMarkDelivered(pedidoDetail); }}>
              <CheckCircle className="w-3.5 h-3.5" /> Marcar Entregado
            </Button>
          </div>
        ) : undefined}
      />

      {/* Hidden print container */}
      <div ref={printRef} className="hidden">
        {printSale && <ReceiptPrintView sale={printSale} config={receiptConfig} />}
      </div>

      {/* New order notification toast */}
      {newOrderAlert && (
        <div className="fixed top-4 right-4 z-[100] animate-in fade-in slide-in-from-right-4 duration-300">
          <div className="flex items-center gap-3 bg-emerald-600 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-2xl">
            <ShoppingCart className="w-5 h-5 shrink-0" />
            {newOrderAlert}
          </div>
        </div>
      )}
    </div>
  );
}
