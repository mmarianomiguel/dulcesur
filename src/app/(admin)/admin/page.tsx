"use client";

import { useEffect, useState, useCallback, lazy, Suspense } from "react";
import { supabase } from "@/lib/supabase";
import { showAdminToast } from "@/components/admin-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  ArrowLeftRight,
  Shuffle,
  BookOpen,
  Landmark,
  PrinterCheck,
  ExternalLink,
  Phone,
  Banknote,
  User,
  Wallet,
  SlidersHorizontal,
  BarChart3,
  FileText,
  AlertCircle,
  Info,
  ArrowRight,
  Sun,
  Trophy,
  UserCheck,
} from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
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
import { defaultReceiptConfig } from "@/components/receipt-print-view";
import type { ReceiptConfig, ReceiptSale, ReceiptLineItem } from "@/components/receipt-print-view";
import { useWhiteLabel } from "@/hooks/use-white-label";
import { VentasHoyWidget } from "@/components/ventas-hoy-widget";
import { formatCurrency, todayARG } from "@/lib/formatters";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

// Lazy load PrintPreviewDialog (heavy, rarely used on initial load)
const PrintPreviewDialog = lazy(() => import("@/components/print-preview-dialog").then(m => ({ default: m.PrintPreviewDialog })));

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
  provincia: string | null;
  codigo_postal: string | null;
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
  origen?: string;
  clientes: ClienteInfo | null;
  venta_items: VentaItemRow[];
}

function loadReceiptConfig(): ReceiptConfig {
  try {
    const stored = localStorage.getItem("receipt_config");
    if (stored) {
      const parsed = JSON.parse(stored);
      const merged = { ...defaultReceiptConfig, ...parsed };
      if (!merged.logoUrl) merged.logoUrl = defaultReceiptConfig.logoUrl;
      return merged;
    }
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

// ─── Printed pedidos tracking ───
function getPrintedPedidos(): Set<string> {
  try {
    const stored = localStorage.getItem("printed_pedidos");
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch { return new Set(); }
}
function markPedidoPrinted(numero: string) {
  const printed = getPrintedPedidos();
  printed.add(numero);
  // Keep only last 200 to avoid localStorage bloat
  const arr = [...printed].slice(-200);
  localStorage.setItem("printed_pedidos", JSON.stringify(arr));
}

export default function DashboardPage() {
  const { config: wl } = useWhiteLabel();
  const currentUser = useCurrentUser();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [chartsLoading, setChartsLoading] = useState(true);

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
  const [saldoMismatches, setSaldoMismatches] = useState<{ id: string; nombre: string; saldo: number; calculado: number; diff: number }[]>([]);

  // ─── Pedidos Online state ───
  const [pedidosOnline, setPedidosOnline] = useState<PedidoVenta[]>([]);
  const [pedidoEntregaMap, setPedidoEntregaMap] = useState<Record<string, string>>({});
  const [pedidoEstadoMap, setPedidoEstadoMap] = useState<Record<string, string>>({});
  const [pedidoFilter, setPedidoFilter] = useState<"todos" | "envio" | "retiro">("todos");
  const [selectedDayTab, setSelectedDayTab] = useState<string>("_today");
  const [diasEntrega, setDiasEntrega] = useState<string[]>([]);
  const [pedidoDetailOpen, setPedidoDetailOpen] = useState(false);
  const [pedidoDetail, setPedidoDetail] = useState<PedidoVenta | null>(null);
  const [pedidoDetailPagos, setPedidoDetailPagos] = useState<{ metodo: string; monto: number; cuenta_bancaria?: string | null }[]>([]);
  const [printedPedidos, setPrintedPedidos] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deliveryConfirm, setDeliveryConfirm] = useState<{ open: boolean; venta: PedidoVenta | null; pendiente: number; type: "paid" | "unpaid" | "no_client"; cobroMetodo?: string; cobroMonto?: number; cobroMixtoEf?: number; cobroMixtoTr?: number; cobroCuentaBancaria?: string }>({ open: false, venta: null, pendiente: 0, type: "paid" });
  const [deliveryCuentasBancarias, setDeliveryCuentasBancarias] = useState<{ id: string; nombre: string; alias?: string }[]>([]);
  const [recargoTransferencia, setRecargoTransferencia] = useState(0);

  // ─── Widget visibility ───
  const WIDGETS = [
    { key: "stats", label: "Ventas, Ganancia, Gastos, Tickets" },
    { key: "balance", label: "Capital, Cuentas a cobrar/pagar" },
    { key: "charts", label: "Gráficos (ventas mensuales, formas de pago)" },
    { key: "categories", label: "Ventas por categoría" },
    { key: "pedidos", label: "Pedidos online" },
    { key: "saldos", label: "Alertas de saldo" },
    { key: "caja", label: "Estado de caja" },
    { key: "stockbajo", label: "Productos con stock bajo" },
    { key: "ultimasventas", label: "Últimas ventas" },
    { key: "briefing", label: "Resumen operativo" },
  ];
  const [widgetConfig, setWidgetConfig] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem("dashboard_widgets");
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  });
  const [showWidgetSettings, setShowWidgetSettings] = useState(false);
  const isWidgetVisible = (key: string) => widgetConfig[key] !== false;
  const toggleWidget = (key: string) => {
    const next = { ...widgetConfig, [key]: !isWidgetVisible(key) };
    setWidgetConfig(next);
    localStorage.setItem("dashboard_widgets", JSON.stringify(next));
  };

  // ─── Combo data for preview ───
  const [comboProductIds, setComboProductIds] = useState<Set<string>>(new Set());
  const [comboItemsMap, setComboItemsMap] = useState<Record<string, { nombre: string; cantidad: number }[]>>({});
  const [ncPorPedido, setNcPorPedido] = useState<Record<string, number>>({});

  // ─── New dashboard widgets state ───
  const [turnoAbierto, setTurnoAbierto] = useState<{ id: string; fecha_apertura: string; hora_apertura: string; efectivo_inicial: number; operador: string } | null>(null);
  const [cajaTurnTotals, setCajaTurnTotals] = useState<{ efectivo: number; transferencia: number; total: number }>({ efectivo: 0, transferencia: 0, total: 0 });
  const [ultimasVentas, setUltimasVentas] = useState<{ id: string; numero: number; cliente: string; total: number; forma_pago: string; fecha: string }[]>([]);
  const [itemsSinCosto, setItemsSinCosto] = useState(0);

  // ─── Print state ───
  const [receiptConfig, setReceiptConfig] = useState<ReceiptConfig>(defaultReceiptConfig);
  const [printSale, setPrintSale] = useState<ReceiptSale | null>(null);
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);

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
      .select("id, numero, fecha, forma_pago, total, subtotal, estado, observacion, entregado, metodo_entrega, created_at, cuenta_transferencia_alias, cliente_id, origen, clientes(nombre, domicilio, localidad, provincia, codigo_postal, telefono, saldo, situacion_iva), venta_items(id, producto_id, codigo, descripcion, cantidad, precio_unitario, descuento, subtotal, unidad_medida, presentacion, unidades_por_presentacion)")
      .eq("origen", "tienda")
      .eq("entregado", false)
      .neq("estado", "anulada")
      .order("created_at", { ascending: false });

    const rows = (ventasOnline || []) as unknown as PedidoVenta[];
    setPedidosOnline(rows);

    // Fetch combo data + pedidos_tienda in parallel
    const allProductIds = rows.flatMap((v) => v.venta_items.map((i) => i.producto_id)).filter(Boolean) as string[];
    const numeros = rows.map((v) => v.numero);

    // Fire all independent queries in parallel
    const ventaIds = rows.map((v) => v.id);
    const [prodsResult, pedidosTiendaResult, ncResult] = await Promise.all([
      allProductIds.length > 0
        ? supabase.from("productos").select("id, es_combo").in("id", [...new Set(allProductIds)])
        : Promise.resolve({ data: [] }),
      numeros.length > 0
        ? supabase.from("pedidos_tienda").select("numero, fecha_entrega, estado").in("numero", numeros)
        : Promise.resolve({ data: [] }),
      ventaIds.length > 0
        ? supabase.from("ventas").select("remito_origen_id, total").in("remito_origen_id", ventaIds).ilike("tipo_comprobante", "Nota de Crédito%").neq("estado", "anulada")
        : Promise.resolve({ data: [] }),
    ]);

    // Build NC map
    const ncMap: Record<string, number> = {};
    ((ncResult.data || []) as any[]).forEach((nc: any) => {
      if (nc.remito_origen_id) {
        ncMap[nc.remito_origen_id] = (ncMap[nc.remito_origen_id] || 0) + (nc.total || 0);
      }
    });
    setNcPorPedido(ncMap);

    // Process combos
    if (allProductIds.length > 0) {
      const prods = prodsResult.data;
      const cIds = new Set<string>();
      for (const p of prods || []) {
        if ((p as any).es_combo) cIds.add(p.id);
      }
      setComboProductIds(cIds);
      const cMap: Record<string, { nombre: string; cantidad: number }[]> = {};
      if (cIds.size > 0) {
        const { data: allComboItems } = await supabase
          .from("combo_items")
          .select("combo_id, cantidad, productos!combo_items_producto_id_fkey(nombre)")
          .in("combo_id", [...cIds]);
        for (const ci of (allComboItems || []) as any[]) {
          if (!cMap[ci.combo_id]) cMap[ci.combo_id] = [];
          cMap[ci.combo_id].push({ nombre: ci.productos?.nombre || "", cantidad: ci.cantidad });
        }
      }
      setComboItemsMap(cMap);
    } else {
      setComboProductIds(new Set());
      setComboItemsMap({});
    }

    // Process pedidos_tienda (already fetched above)
    if (numeros.length > 0) {
      const pedidosTienda = pedidosTiendaResult.data;
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

  const fixSaldo = async (clientId: string, correctSaldo: number) => {
    await supabase.from("clientes").update({ saldo: correctSaldo }).eq("id", clientId);
    setSaldoMismatches((prev) => prev.filter((c) => c.id !== clientId));
    showAdminToast("Saldo corregido", "success");
  };

  const fixAllSaldos = async () => {
    for (const c of saldoMismatches) {
      await supabase.from("clientes").update({ saldo: c.calculado }).eq("id", c.id);
    }
    setSaldoMismatches([]);
    showAdminToast(`${saldoMismatches.length} saldos corregidos`, "success");
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
    const { start, end } = getDateRange();

    // Load receipt config and printed pedidos from localStorage
    const localConfig = loadReceiptConfig();
    setReceiptConfig(localConfig);
    setPrintedPedidos(getPrintedPedidos());

    // Enrich receipt config with empresa data from Supabase (company name/address for print)
    supabase.from("empresa").select("nombre, domicilio, telefono, cuit, situacion_iva").limit(1).single().then(({ data: emp }) => {
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
    });

    // ─── Función para cargar gráficos diferidos ───
    const fetchCharts = async (start: string, end: string) => {
      setChartsLoading(true);
      try {
        const monthQueries: Promise<{ name: string; ventas: number; egresos: number }>[] = [];
        for (let i = 5; i >= 0; i--) {
          const d = new Date(todayARG() + "T12:00:00");
          d.setDate(1);
          d.setMonth(d.getMonth() - i);
          const year = d.getFullYear(); const month = d.getMonth() + 1;
          const mStart = `${year}-${String(month).padStart(2, "0")}-01`;
          const mEnd = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
          const label = d.toLocaleDateString("es-AR", { month: "short" });
          monthQueries.push(
            Promise.all([
              supabase.from("ventas").select("total, tipo_comprobante").gte("fecha", mStart).lt("fecha", mEnd).neq("estado", "anulada"),
              supabase.from("caja_movimientos").select("monto").eq("tipo", "egreso").gte("fecha", mStart).lt("fecha", mEnd),
            ]).then(([{ data: mv }, { data: me }]) => {
              const regularSales = (mv || []).filter((v: any) => !v.tipo_comprobante?.toLowerCase().startsWith("nota de crédito"));
              const ncSales = (mv || []).filter((v: any) => v.tipo_comprobante?.toLowerCase().startsWith("nota de crédito"));
              return {
                name: label,
                ventas: regularSales.reduce((a: number, v: any) => a + v.total, 0) - ncSales.reduce((a: number, v: any) => a + v.total, 0),
                egresos: (me || []).reduce((a, e) => a + Math.abs(e.monto), 0),
              };
            })
          );
        }
        const monthlyDataResult = await Promise.all(monthQueries);
        setMonthlyData(monthlyDataResult);
      } finally {
        setChartsLoading(false);
      }
    };

    // ─── All independent queries in parallel (including turno + últimas ventas) ───
    const [
      { data: tiendaConfig },
      { data: periodSalesRaw },
      { data: periodExpenses },
      { data: prods },
      { data: allClients },
      { data: provs },
      { data: ccSums },
      { data: ventasCat },
      { data: turnoData },
      { data: ultimasVentasRaw },
      // fetchPedidosOnline runs in parallel too
    ] = await Promise.all([
      supabase.from("tienda_config").select("recargo_transferencia, url_tienda").single(),
      supabase.from("ventas").select("id, total, forma_pago, estado, tipo_comprobante").gte("fecha", start).lt("fecha", end).neq("estado", "anulada"),
      supabase.from("caja_movimientos").select("monto").gte("fecha", start).lt("fecha", end).eq("tipo", "egreso"),
      supabase.from("productos").select("id, nombre, codigo, stock, stock_minimo, precio, costo").eq("activo", true),
      supabase.from("clientes").select("id, nombre, saldo").eq("activo", true),
      supabase.from("proveedores").select("saldo").eq("activo", true),
      supabase.from("cuenta_corriente").select("cliente_id, debe, haber"),
      supabase.from("venta_items").select("subtotal, productos(categoria_id, categorias(nombre)), ventas!inner(fecha, estado)").gte("ventas.fecha", start).lt("ventas.fecha", end).neq("ventas.estado", "anulada"),
      supabase.from("turnos_caja").select("id, fecha_apertura, hora_apertura, efectivo_inicial, operador").eq("estado", "abierto").order("created_at", { ascending: false }).limit(1),
      supabase.from("ventas").select("id, numero, total, forma_pago, fecha, clientes(nombre)").neq("estado", "anulada").not("tipo_comprobante", "ilike", "Nota de Crédito%").not("tipo_comprobante", "ilike", "Nota de Débito%").order("created_at", { ascending: false }).limit(8),
    ]);

    // Start pedidos online fetch in parallel with processing below
    const pedidosOnlinePromise = fetchPedidosOnline();

    // ─── Turno de caja abierto + totales del turno ───
    const turnoActual = turnoData && turnoData.length > 0 ? turnoData[0] as any : null;
    setTurnoAbierto(turnoActual);
    if (turnoActual) {
      supabase.from("caja_movimientos").select("metodo_pago, monto, tipo").gte("fecha", turnoActual.fecha_apertura).then(({ data: cajaMov }) => {
        let ef = 0, tr = 0;
        for (const m of cajaMov || []) {
          if (m.tipo === "ingreso") {
            if (m.metodo_pago === "Efectivo") ef += m.monto;
            else if (m.metodo_pago === "Transferencia") tr += m.monto;
          }
        }
        setCajaTurnTotals({ efectivo: ef, transferencia: tr, total: ef + tr });
      });
    }

    // ─── Últimas ventas ───
    setUltimasVentas((ultimasVentasRaw || []).map((v: any) => ({ id: v.id, numero: v.numero, cliente: v.clientes?.nombre || "Cons. Final", total: v.total, forma_pago: v.forma_pago, fecha: v.fecha })));

    // ─── Tienda config ───
    if ((tiendaConfig as any)?.recargo_transferencia > 0) setRecargoTransferencia((tiendaConfig as any).recargo_transferencia);
    if ((tiendaConfig as any)?.url_tienda) setReceiptConfig((prev) => ({ ...prev, empresaWeb: prev.empresaWeb || (tiendaConfig as any).url_tienda }));

    // ─── Period sales (reuse single ventas query for both totals and margin) ───
    // Exclude pending web orders (not yet confirmed/delivered) from dashboard totals
    const periodSalesFiltered = (periodSalesRaw || []).filter((v: any) => !(v.estado === "pendiente" && v.tipo_comprobante === "Pedido Web"));
    const periodSales = periodSalesFiltered.filter((v) => !v.tipo_comprobante?.toLowerCase().startsWith("nota de crédito"));
    const periodNCs = periodSalesFiltered.filter((v) => v.tipo_comprobante?.toLowerCase().startsWith("nota de crédito"));
    const ncTotalAmount = periodNCs.reduce((a, v) => a + v.total, 0);
    const salesTotal = periodSales.reduce((a, v) => a + v.total, 0) - ncTotalAmount;
    setVentasPeriodo(salesTotal);
    setTicketsPeriodo(periodSales.length);

    // ─── Expenses ───
    setGastosPeriodo((periodExpenses || []).reduce((a, e) => a + Math.abs(e.monto), 0));

    // ─── Products: capital & low stock ───
    setCapitalMercaderia((prods || []).reduce((a, p: any) => a + p.stock * (p.costo > 0 ? p.costo : p.precio), 0));
    setLowStockProducts((prods || []).filter((p: any) => p.stock_minimo > 0 && p.stock <= p.stock_minimo).sort((a: any, b: any) => a.stock - b.stock).slice(0, 20) as any);

    // ─── Clients: cuentas a cobrar + saldo mismatch (single query, used for both) ───
    setCuentasCobrar((allClients || []).reduce((a, c) => a + ((c.saldo || 0) > 0 ? c.saldo : 0), 0));
    setCuentasPagar((provs || []).reduce((a, p) => a + (p.saldo > 0 ? p.saldo : 0), 0));

    // Saldo mismatch detection (reuses allClients and ccSums from group 1)
    if (allClients && allClients.length > 0) {
      const ccMap: Record<string, number> = {};
      for (const row of ccSums || []) {
        ccMap[row.cliente_id] = (ccMap[row.cliente_id] || 0) + (row.debe || 0) - (row.haber || 0);
      }
      const mismatches = allClients
        .map((c) => ({ id: c.id, nombre: c.nombre, saldo: c.saldo || 0, calculado: ccMap[c.id] || 0, diff: Math.round(((c.saldo || 0) - (ccMap[c.id] || 0)) * 100) / 100 }))
        .filter((c) => Math.abs(c.diff) > 0.5)
        .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
      setSaldoMismatches(mismatches);
    }

    // ─── Monthly chart: carga diferida ───
    // (se carga en segundo plano después de mostrar el dashboard)

    // ─── Ventas por categoria ───
    const catMap: Record<string, number> = {};
    (ventasCat || []).forEach((vi: any) => { catMap[vi.productos?.categorias?.nombre || "Sin categoria"] = (catMap[vi.productos?.categorias?.nombre || "Sin categoria"] || 0) + (vi.subtotal || 0); });
    setVentasPorCategoria(Object.entries(catMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value));

    // ─── Group 2: All queries that depend on periodSalesRaw — run in parallel ───
    const regularVentaIds = periodSales.map((v) => v.id);
    const mixtoIds = periodSales.filter((v) => v.forma_pago === "Mixto").map((v) => v.id);

    const [mixtoResult, marginResult, sinCostoResult] = await Promise.all([
      // Mixto payment breakdown
      mixtoIds.length > 0
        ? Promise.all([
            supabase.from("caja_movimientos").select("referencia_id, metodo_pago, monto").eq("tipo", "ingreso").eq("referencia_tipo", "venta").in("referencia_id", mixtoIds),
            supabase.from("cuenta_corriente").select("venta_id, debe").in("venta_id", mixtoIds),
          ])
        : Promise.resolve([{ data: [] }, { data: [] }] as any),
      // Margin calculation
      regularVentaIds.length > 0
        ? supabase.from("venta_items").select("cantidad, precio_unitario, descuento, costo_unitario").in("venta_id", regularVentaIds)
        : Promise.resolve({ data: [] }),
      // Items sin costo count
      regularVentaIds.length > 0
        ? supabase.from("venta_items").select("id", { count: "exact", head: true }).in("venta_id", regularVentaIds).or("costo_unitario.is.null,costo_unitario.eq.0")
        : Promise.resolve({ count: 0 }),
      // Pedidos online (already running)
      pedidosOnlinePromise,
    ]);

    // Process mixto breakdown
    const mixtoMovs = ((mixtoResult[0] as any)?.data || []) as { referencia_id: string; metodo_pago: string; monto: number }[];
    const mixtoCCData = ((mixtoResult[1] as any)?.data || []) as { venta_id: string; debe: number }[];
    const paymentMap: Record<string, number> = {};
    periodSales.forEach((v) => {
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

    // Process margin
    const marginItems = (marginResult as any)?.data || [];
    const gananciaTotal = marginItems.reduce((acc: number, item: any) => {
      const cantidad = Number(item.cantidad) || 0;
      const precioUnitario = Number(item.precio_unitario) || 0;
      const descPct = Number(item.descuento) || 0;
      const precioConDesc = precioUnitario * (1 - descPct / 100);
      const costoReal = (item.costo_unitario && item.costo_unitario > 0) ? item.costo_unitario : 0;
      return acc + (precioConDesc - costoReal) * cantidad;
    }, 0);
    setGananciaPeriodo(gananciaTotal);

    // Process items sin costo
    setItemsSinCosto((sinCostoResult as any)?.count || 0);
    } catch (err) {
      console.error("Dashboard fetch error:", err);
      showAdminToast("Error cargando el dashboard", "error");
    } finally {
      setLoading(false);
      // Cargar gráficos en segundo plano sin bloquear la UI
      const { start: chartStart, end: chartEnd } = getDateRange();
      fetchCharts(chartStart, chartEnd);
    }
  }, [getDateRange, fetchPedidosOnline]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);
  useEffect(() => { supabase.from("cuentas_bancarias").select("id, nombre, alias").eq("activo", true).order("nombre").then(({ data }) => setDeliveryCuentasBancarias(data || [])); }, []);

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
        // Browser push notification
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("Nuevo pedido online", {
            body: `#${v.numero} — $${Math.round(v.total).toLocaleString()}`,
            icon: "/icon.png",
          });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchPedidosOnline]);

  // ─── Print preview effect ───
  useEffect(() => {
    if (printSale) {
      setPrintPreviewOpen(true);
    }
  }, [printSale]);

  // ─── Pedido actions ───
  const handleMarkDelivered = async (venta: PedidoVenta) => {
    // Check how much is already paid in caja + cuenta corriente + NC refunds
    const [{ data: cajaMovs }, { data: ccMovs }, { data: ncVentas }] = await Promise.all([
      supabase.from("caja_movimientos").select("monto").eq("referencia_id", venta.id).eq("referencia_tipo", "venta").eq("tipo", "ingreso"),
      supabase.from("cuenta_corriente").select("debe").eq("venta_id", venta.id),
      supabase.from("ventas").select("total").eq("remito_origen_id", venta.id).ilike("tipo_comprobante", "Nota de Crédito%").neq("estado", "anulada"),
    ]);
    const pagadoCaja = (cajaMovs || []).reduce((s: number, m: any) => s + m.monto, 0);
    const pagadoCC = (ccMovs || []).reduce((s: number, c: any) => s + (c.debe || 0), 0);
    const ncTotal = (ncVentas || []).reduce((s: number, nc: any) => s + (nc.total || 0), 0);
    const pagado = pagadoCaja + pagadoCC + ncTotal;
    const pendiente = Math.max(0, venta.total - pagado);

    if (pendiente > 0 && !(venta as any).cliente_id) {
      setDeliveryConfirm({ open: true, venta, pendiente, type: "no_client" });
      return;
    }
    if (pendiente > 0) {
      // Pre-fill Mixto amounts from pedidos_tienda if available
      let initMixtoEf: number | undefined;
      let initMixtoTr: number | undefined;
      if (venta.forma_pago === "Mixto" && venta.numero) {
        const { data: pt } = await supabase.from("pedidos_tienda").select("monto_efectivo, monto_transferencia").eq("numero", venta.numero).maybeSingle();
        if (pt) { initMixtoEf = pt.monto_efectivo || undefined; initMixtoTr = pt.monto_transferencia || undefined; }
      }
      setDeliveryConfirm({ open: true, venta, pendiente, type: "unpaid", cobroMetodo: venta.forma_pago || undefined, cobroMixtoEf: initMixtoEf, cobroMixtoTr: initMixtoTr });
      return;
    }
    setDeliveryConfirm({ open: true, venta, pendiente: 0, type: "paid" });
  };

  const confirmDelivery = async () => {
    const { venta, pendiente, type, cobroMetodo, cobroMonto, cobroMixtoEf, cobroMixtoTr, cobroCuentaBancaria } = deliveryConfirm;
    if (!venta) return;
    try {
    setActionLoading(venta.id);
    setDeliveryConfirm({ open: false, venta: null, pendiente: 0, type: "paid" });

    // Register payment if unpaid
    if ((type === "unpaid" || type === "no_client") && pendiente > 0) {
      const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
      const hora = new Date().toLocaleTimeString("en-US", { hour12: false, timeZone: "America/Argentina/Buenos_Aires" });
      const clienteNombre = (venta as any).clientes?.nombre || "";
      const clienteId = (venta as any).cliente_id;
      const metodo = cobroMetodo || "Efectivo";
      const entries: any[] = [];

      // Calculate how much is actually being paid in cash/transfer
      let totalCobrado = 0;
      let surchargeAmount = 0;
      if (metodo === "Mixto") {
        totalCobrado = (cobroMixtoEf || 0) + (cobroMixtoTr || 0);
        if ((cobroMixtoEf || 0) > 0) entries.push({ fecha: hoy, hora, tipo: "ingreso", descripcion: `Cobro entrega #${venta.numero} (Efectivo)${clienteNombre ? ` — ${clienteNombre}` : ""}`, metodo_pago: "Efectivo", monto: cobroMixtoEf, referencia_id: venta.id, referencia_tipo: "venta" });
        if ((cobroMixtoTr || 0) > 0) {
          surchargeAmount = recargoTransferencia > 0 ? Math.round((cobroMixtoTr || 0) * (recargoTransferencia / 100)) : 0;
          entries.push({ fecha: hoy, hora, tipo: "ingreso", descripcion: `Cobro entrega #${venta.numero} (Transferencia${surchargeAmount > 0 ? ` +${recargoTransferencia}%` : ""})${clienteNombre ? ` — ${clienteNombre}` : ""}`, metodo_pago: "Transferencia", monto: (cobroMixtoTr || 0) + surchargeAmount, referencia_id: venta.id, referencia_tipo: "venta", ...(cobroCuentaBancaria ? { cuenta_bancaria: cobroCuentaBancaria } : {}) });
        }
      } else if (metodo === "Cuenta Corriente") {
        totalCobrado = 0; // everything goes to CC
      } else {
        // Efectivo or Transferencia — use cobroMonto if specified, otherwise full pendiente
        totalCobrado = cobroMonto ?? pendiente;
        if (totalCobrado > 0) {
          surchargeAmount = (metodo === "Transferencia" && recargoTransferencia > 0) ? Math.round(totalCobrado * (recargoTransferencia / 100)) : 0;
          const montoFinal = metodo === "Transferencia" ? totalCobrado + surchargeAmount : totalCobrado;
          entries.push({ fecha: hoy, hora, tipo: "ingreso", descripcion: `Cobro entrega #${venta.numero}${surchargeAmount > 0 ? ` (Transf +${recargoTransferencia}%)` : ""}${clienteNombre ? ` — ${clienteNombre}` : ""}`, metodo_pago: metodo, monto: montoFinal, referencia_id: venta.id, referencia_tipo: "venta", ...(metodo === "Transferencia" && cobroCuentaBancaria ? { cuenta_bancaria: cobroCuentaBancaria } : {}) });
        }
      }

      // Remainder goes to cuenta corriente
      const restanteCC = Math.max(0, Math.round((pendiente - totalCobrado) * 100) / 100);
      if (restanteCC > 0 && clienteId) {
        const { data: cl } = await supabase.from("clientes").select("saldo").eq("id", clienteId).single();
        const newSaldo = (cl?.saldo || 0) + restanteCC;
        await supabase.from("clientes").update({ saldo: newSaldo }).eq("id", clienteId);
        await supabase.from("cuenta_corriente").insert({ cliente_id: clienteId, fecha: hoy, comprobante: `Entrega #${venta.numero}`, descripcion: `Saldo pendiente entrega — ${clienteNombre}`, debe: restanteCC, haber: 0, saldo: newSaldo, forma_pago: metodo === "Cuenta Corriente" ? "Cuenta Corriente" : "Mixto", venta_id: venta.id });
      }

      if (entries.length > 0) await supabase.from("caja_movimientos").insert(entries);

      // Update forma_pago + monto_pagado + cuenta_transferencia_alias on the venta
      const ventaUpdate: Record<string, any> = { forma_pago: metodo };
      if (totalCobrado > 0) {
        ventaUpdate.monto_pagado = totalCobrado;
      }
      if ((metodo === "Transferencia" || metodo === "Mixto") && cobroCuentaBancaria) {
        ventaUpdate.cuenta_transferencia_alias = cobroCuentaBancaria;
      }
      await supabase.from("ventas").update(ventaUpdate).eq("id", venta.id);
    }

    await supabase.from("ventas").update({ entregado: true, estado: "entregado" }).eq("id", venta.id);
    await supabase.from("pedidos_tienda").update({ estado: "entregado" }).eq("numero", venta.numero);
    setPedidosOnline((prev) => prev.filter((p) => p.id !== venta.id));
    } catch (err) {
      console.error("Error confirming delivery:", err);
      showAdminToast("Error al confirmar entrega", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleMarkArmado = async (venta: PedidoVenta) => {
    setActionLoading(venta.id);
    const { error: e1 } = await supabase.from("pedidos_tienda").update({ estado: "armado" }).eq("numero", venta.numero);
    const { error: e2 } = await supabase.from("ventas").update({ estado: "armado" }).eq("id", venta.id);
    if (e1 || e2) {
      showAdminToast("Error al marcar como armado", "error");
    } else {
      setPedidoEstadoMap((prev) => ({ ...prev, [venta.numero]: "armado" }));
    }
    setActionLoading(null);
  };

  const handlePrintRemito = async (venta: PedidoVenta) => {
    const cliente = venta.clientes;

    // Enrich with pedidos_tienda data for online orders
    if (venta.origen === "tienda") {
      const { data: ptData } = await supabase.from("pedidos_tienda").select("direccion_texto, telefono, nombre_cliente").eq("numero", venta.numero).maybeSingle();
      if (ptData) {
        (venta as any)._direccion_texto = ptData.direccion_texto;
        (venta as any)._telefono = ptData.telefono;
      }
    }

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
    // For online Mixto orders: get original payment split from pedidos_tienda
    // (caja may only have the transfer portion — efectivo is collected on delivery)
    if (venta.forma_pago === "Mixto") {
      const { data: pedido } = await supabase.from("pedidos_tienda")
        .select("monto_efectivo, monto_transferencia, recargo_transferencia")
        .eq("numero", venta.numero)
        .single();
      if (pedido) {
        pagoEf = pedido.monto_efectivo || pagoEf;
        pagoTr = pedido.monto_transferencia || pagoTr;
      }
    } else if (pagoEf === 0 && pagoTr === 0 && pagoCC === 0) {
      // Fallback: if no caja_movimientos at all, try pedidos_tienda
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
      clienteDireccion: (() => {
        // Try pedidos_tienda for full address
        const ptDir = (venta as any)._direccion_texto;
        if (ptDir) return ptDir;
        const parts = [cliente?.domicilio, cliente?.localidad, cliente?.provincia].filter(Boolean);
        if (cliente?.codigo_postal) parts.push(`(${cliente.codigo_postal})`);
        return parts.join(", ") || null;
      })(),
      clienteTelefono: cliente?.telefono || (venta as any)._telefono || null,
      clienteCondicionIva: cliente?.situacion_iva || null,
      metodoEntrega: venta.metodo_entrega || null,
      vendedor: "Mariano Miguel",
      items: saleItems,
      fecha: new Date(venta.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }),
      saldoAnterior: saldoActual,
      saldoNuevo: saldoActual,
      pagoEfectivo: pagoEf || undefined,
      pagoTransferencia: pagoTr || undefined,
      pagoCuentaCorriente: pagoCC || undefined,
    };
    setPrintSale(sale);
    // Mark as printed
    markPedidoPrinted(venta.numero);
    setPrintedPedidos(getPrintedPedidos());
  };

  // ─── Filtered pedidos ───
  const today = todayARG();
  const dayTabs = buildDayTabs();
  const activeTab = selectedDayTab === "_today" ? today : selectedDayTab;
  const effectiveTab = dayTabs.find((t) => t.key === activeTab) ? activeTab : today;

  const pendientes = pedidosOnline.filter((p) => {
    const fe = pedidoEntregaMap[p.numero];
    // Retiro sin fecha → pendiente
    if (!fe && p.metodo_entrega === "retiro") return false; // shown in "Hoy" instead
    if (!fe) return true;
    return fe < today;
  });

  // Retiro orders without fecha_entrega count as "today"
  const getTabForPedido = (p: PedidoVenta) => {
    const fe = pedidoEntregaMap[p.numero];
    if (!fe && p.metodo_entrega === "retiro") return today;
    return fe || null;
  };

  const countByTab: Record<string, number> = {};
  for (const tab of dayTabs) {
    if (tab.key === "_pending") {
      countByTab[tab.key] = pendientes.length;
    } else {
      countByTab[tab.key] = pedidosOnline.filter((p) => getTabForPedido(p) === tab.key).length;
    }
  }

  let tabPedidos = effectiveTab === "_pending"
    ? pendientes
    : pedidosOnline.filter((p) => getTabForPedido(p) === effectiveTab);

  // Apply envio/retiro filter
  if (pedidoFilter === "envio") tabPedidos = tabPedidos.filter((p) => p.metodo_entrega === "envio");
  if (pedidoFilter === "retiro") tabPedidos = tabPedidos.filter((p) => p.metodo_entrega === "retiro");

  const totalPedidos = tabPedidos.reduce((s, p) => s + p.total - (ncPorPedido[p.id] || 0), 0);
  const countEnvio = pedidosOnline.filter((p) => p.metodo_entrega === "envio").length;
  const countRetiro = pedidosOnline.filter((p) => p.metodo_entrega === "retiro").length;

  const ganancia = gananciaPeriodo;
  const periodLabel = filterMode === "diario" ? "del dia" : filterMode === "mensual" ? "del mes" : "del periodo";

  // ─── Briefing computed values ───
  const pedidosPorArmar = pedidosOnline.filter((p) => {
    const estado = pedidoEstadoMap[p.numero] || "pendiente";
    return estado !== "armado" && estado !== "entregado";
  }).length;
  const entregasPendientes = pedidosOnline.filter((p) => p.metodo_entrega === "envio").length;
  const userName = currentUser?.nombre?.split(" ")[0] || turnoAbierto?.operador?.split(" ")[0] || "Admin";
  const cajaTimeOpen = turnoAbierto ? (() => {
    const [h, m] = (turnoAbierto.hora_apertura || "00:00").split(":").map(Number);
    const now = new Date();
    const argNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    const openedAt = new Date(argNow);
    openedAt.setHours(h, m, 0, 0);
    const diffMs = Math.max(0, argNow.getTime() - openedAt.getTime());
    const diffH = Math.floor(diffMs / 3600000);
    const diffM = Math.floor((diffMs % 3600000) / 60000);
    return diffH > 0 ? `${diffH}h ${diffM}m` : `${diffM}m`;
  })() : null;
  const greetingHour = new Date().getHours();
  const greeting = greetingHour < 12 ? "Buenos días" : greetingHour < 19 ? "Buenas tardes" : "Buenas noches";

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      {/* Header with inline filters */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">Resumen de actividad de tu negocio</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground hidden sm:block" />
          <div className="flex border rounded-lg overflow-hidden">
            {(["diario", "mensual", "rango"] as FilterMode[]).map((mode) => (
              <button key={mode} onClick={() => setFilterMode(mode)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${filterMode === mode ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted text-muted-foreground"}`}>
                {mode === "diario" ? "Diario" : mode === "mensual" ? "Mensual" : "Rango"}
              </button>
            ))}
          </div>
          {filterMode === "diario" && (
            <Input type="date" value={filterDate} onChange={(ev) => setFilterDate(ev.target.value)} className="h-8 w-[140px]" />
          )}
          {filterMode === "mensual" && (
            <Input type="month" value={filterMonth} onChange={(ev) => setFilterMonth(ev.target.value)} className="h-8 w-[140px]" />
          )}
          {filterMode === "rango" && (
            <>
              <Input type="date" value={filterFrom} onChange={(ev) => setFilterFrom(ev.target.value)} className="h-8 w-[130px]" />
              <Input type="date" value={filterTo} onChange={(ev) => setFilterTo(ev.target.value)} className="h-8 w-[130px]" />
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowWidgetSettings(!showWidgetSettings)} className="gap-1.5 h-8">
            <SlidersHorizontal className="w-4 h-4" /> Widgets
          </Button>
        </div>
      </div>

      {showWidgetSettings && (
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-sm font-medium mb-3">Widgets visibles</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {WIDGETS.map((w) => (
                <label key={w.key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={isWidgetVisible(w.key)} onChange={() => toggleWidget(w.key)} className="rounded" />
                  {w.label}
                </label>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Ventas Hoy (realtime) ─── */}
      <VentasHoyWidget />

      {/* ─── Morning Briefing ─── */}
      {isWidgetVisible("briefing") && (
        <div className="rounded-xl border border-primary/12 bg-gradient-to-r from-primary/5 to-emerald-500/5 p-4 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shrink-0">
            <Sun className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-semibold">{greeting}, {userName}</p>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              Tenés <strong className="text-foreground">{pedidosPorArmar} pedido{pedidosPorArmar !== 1 ? "s" : ""} online</strong> por armar
              {entregasPendientes > 0 && <>, <strong className="text-foreground">{entregasPendientes} entrega{entregasPendientes !== 1 ? "s" : ""} pendiente{entregasPendientes !== 1 ? "s" : ""}</strong></>}
              {cajaTimeOpen && <> y la caja lleva <strong className="text-foreground">{cajaTimeOpen}</strong> abierta</>}
              .
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            {pedidosPorArmar > 0 && (
              <Link href="/admin/ventas/listado" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-card text-xs font-medium hover:border-primary transition-colors">
                <PackageIcon className="w-3.5 h-3.5 text-amber-500" />
                <span className="font-bold text-primary">{pedidosPorArmar}</span> pedidos
              </Link>
            )}
            {entregasPendientes > 0 && (
              <Link href="/admin/ventas/hoja-ruta" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-card text-xs font-medium hover:border-primary transition-colors">
                <Truck className="w-3.5 h-3.5 text-emerald-500" />
                <span className="font-bold text-primary">{entregasPendientes}</span> entregas
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ─── Caja Status Banner ─── */}
      {isWidgetVisible("caja") && (
        <div className={`rounded-xl border p-3 sm:px-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 ${turnoAbierto ? "border-emerald-200/60 bg-emerald-50/50 dark:bg-emerald-950/20" : "border-amber-200 bg-amber-50 dark:bg-amber-950/20"}`}>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {turnoAbierto && <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />}
            <div>
              <p className={`text-[13px] font-semibold ${turnoAbierto ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>
                Caja {turnoAbierto ? "abierta" : "cerrada"}
              </p>
              {turnoAbierto && (
                <p className="text-[11px] text-muted-foreground">
                  Desde {turnoAbierto.hora_apertura?.slice(0, 5) || "—"} — Turno de {turnoAbierto.operador || "—"}
                </p>
              )}
            </div>
          </div>
          {turnoAbierto && (
            <div className="flex items-center gap-5 shrink-0">
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Efectivo</p>
                <p className="text-sm font-bold text-emerald-600">{formatCurrency(cajaTurnTotals.efectivo)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Transfer.</p>
                <p className="text-sm font-bold text-blue-600">{formatCurrency(cajaTurnTotals.transferencia)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p>
                <p className="text-sm font-bold">{formatCurrency(cajaTurnTotals.efectivo + cajaTurnTotals.transferencia)}</p>
              </div>
            </div>
          )}
          <Link href="/admin/caja">
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
              <Wallet className="w-3 h-3" /> Ver caja
            </Button>
          </Link>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {/* ─── Stats (4 cards) ─── */}
          {isWidgetVisible("stats") && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card><CardContent className="pt-5 pb-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Ventas {periodLabel}</p>
                  <p className="text-[22px] font-bold leading-none">{formatCurrency(ventasPeriodo)}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><DollarSign className="w-5 h-5 text-primary" /></div>
              </div>
            </CardContent></Card>
            <Card><CardContent className="pt-5 pb-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Ganancia</p>
                  <p className="text-[22px] font-bold leading-none">{formatCurrency(ganancia)}</p>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-medium ${ganancia >= 0 ? "text-emerald-600" : "text-red-500"}`}>{ventasPeriodo > 0 ? `${((ganancia / ventasPeriodo) * 100).toFixed(1)}%` : "—"}</span>
                    <span className="text-xs text-muted-foreground">Margen</span>
                  </div>
                </div>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${ganancia >= 0 ? "bg-emerald-500/10" : "bg-red-500/10"}`}>{ganancia >= 0 ? <TrendingUp className="w-5 h-5 text-emerald-500" /> : <TrendingDown className="w-5 h-5 text-red-500" />}</div>
              </div>
            </CardContent></Card>
            <Card><CardContent className="pt-5 pb-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Gastos</p>
                  <p className="text-[22px] font-bold leading-none">{formatCurrency(gastosPeriodo)}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center"><TrendingDown className="w-5 h-5 text-orange-500" /></div>
              </div>
            </CardContent></Card>
            <Card><CardContent className="pt-5 pb-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Tickets</p>
                  <p className="text-[22px] font-bold leading-none">{ticketsPeriodo}</p>
                  {ticketsPeriodo > 0 && <p className="text-xs text-muted-foreground">Prom: {formatCurrency(Math.round(ventasPeriodo / ticketsPeriodo))}</p>}
                </div>
                <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center"><Receipt className="w-5 h-5 text-violet-500" /></div>
              </div>
            </CardContent></Card>
          </div>
          )}

          {/* ─── Balance cards ─── */}
          {isWidgetVisible("balance") && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card><CardContent className="pt-5 pb-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Capital en mercadería</p>
                  <p className="text-[22px] font-bold leading-none">{formatCurrency(capitalMercaderia)}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><PackageIcon className="w-5 h-5 text-primary" /></div>
              </div>
            </CardContent></Card>
            <Card><CardContent className="pt-5 pb-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Cuentas a cobrar</p>
                  <p className="text-[22px] font-bold leading-none">{formatCurrency(cuentasCobrar)}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center"><Users className="w-5 h-5 text-emerald-500" /></div>
              </div>
            </CardContent></Card>
            <Card><CardContent className="pt-5 pb-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Cuentas a pagar</p>
                  <p className="text-[22px] font-bold leading-none">{formatCurrency(cuentasPagar)}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center"><CreditCard className="w-5 h-5 text-orange-500" /></div>
              </div>
            </CardContent></Card>
          </div>
          )}

          {/* ─── Warning: Items sin costo ─── */}
          {itemsSinCosto > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/70 dark:bg-amber-950/20 p-3 flex items-center gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <p className="text-[13px] text-amber-800 dark:text-amber-300">
                <strong>{itemsSinCosto} item{itemsSinCosto !== 1 ? "s" : ""}</strong> vendido{itemsSinCosto !== 1 ? "s" : ""} en este periodo no tienen costo unitario registrado. La ganancia mostrada puede estar inflada.{" "}
                <Link href="/admin/ventas/listado" className="underline font-semibold">Revisar ventas</Link>
              </p>
            </div>
          )}

          {/* ─── Charts ─── */}
          {isWidgetVisible("charts") && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-[15px]">Ventas vs Gastos</CardTitle>
                <span className="text-xs text-muted-foreground">Últimos 6 meses</span>
              </CardHeader>
              <CardContent>{chartsLoading ? (
                <div className="h-[250px] flex items-center justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : (<div className="h-[250px]" style={{ minWidth: 0 }}><ResponsiveContainer width="100%" height="100%" minWidth={0}><BarChart data={monthlyData} barGap={4}><CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.005 260)" /><XAxis dataKey="name" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v > 1000000 ? `${(v / 1000000).toFixed(0)}M` : v > 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)} /><Tooltip formatter={(value) => formatCurrency(Number(value))} contentStyle={{ borderRadius: "0.75rem", fontSize: "13px" }} /><Bar dataKey="ventas" name="Ventas" fill="oklch(0.55 0.2 264)" radius={[6, 6, 0, 0]} /><Bar dataKey="egresos" name="Egresos" fill="oklch(0.65 0.18 160)" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>)}</CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-[15px]">Formas de Pago</CardTitle></CardHeader>
              <CardContent>
                {chartsLoading ? (
                <div className="h-[180px] flex items-center justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : paymentBreakdown.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">Sin ventas en este periodo</p> : (
                  <>
                    <div className="h-[180px]" style={{ minWidth: 0 }}><ResponsiveContainer width="100%" height="100%" minWidth={0}><PieChart><Pie data={paymentBreakdown} innerRadius={50} outerRadius={75} dataKey="value" stroke="none">{paymentBreakdown.map((_, i) => (<Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />))}</Pie><Tooltip formatter={(value) => formatCurrency(Number(value))} contentStyle={{ borderRadius: "0.75rem", fontSize: "13px" }} /></PieChart></ResponsiveContainer></div>
                    <div className="space-y-2 mt-2">{paymentBreakdown.map((m, i) => (<div key={m.name} className="flex items-center justify-between text-[13px]"><div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-sm" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} /><span className="text-muted-foreground">{m.name}</span></div><span className="font-medium">{formatCurrency(m.value)}</span></div>))}</div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
          )}

          {/* ─── Pedidos Online ─── */}
          {isWidgetVisible("pedidos") && <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <CardTitle className="text-[15px] flex items-center gap-2">
                  Pedidos Online
                  {pedidosOnline.length > 0 && (
                    <Badge variant="secondary" className="text-xs">{pedidosOnline.length} pendiente{pedidosOnline.length !== 1 ? "s" : ""}</Badge>
                  )}
                </CardTitle>
                <div className="flex gap-2">
                  <div className="flex border rounded-lg overflow-hidden">
                    {([
                      { key: "todos" as const, label: "Todos" },
                      { key: "envio" as const, label: "Envío", icon: Truck },
                      { key: "retiro" as const, label: "Retiro", icon: Store },
                    ]).map((tab) => (
                      <button key={tab.key} onClick={() => setPedidoFilter(tab.key)}
                        className={`px-2.5 py-1 text-xs font-medium transition-colors flex items-center gap-1 ${
                          pedidoFilter === tab.key ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted text-muted-foreground"
                        }`}>
                        {tab.icon && <tab.icon className="w-3 h-3" />}
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </CardHeader>
            {/* Day tabs */}
            <div className="flex gap-0 overflow-x-auto border-b px-4" style={{ scrollbarWidth: "none" }}>
              {dayTabs.map((tab) => {
                const count = countByTab[tab.key] || 0;
                const isActive = effectiveTab === tab.key;
                return (
                  <button key={tab.key}
                    onClick={() => setSelectedDayTab(tab.key === today ? "_today" : tab.key)}
                    className={`flex items-center gap-1.5 px-3.5 py-2.5 text-[13px] font-medium border-b-2 transition-all shrink-0 ${
                      isActive
                        ? tab.isPending ? "text-red-600 border-red-500" : "text-primary border-primary"
                        : "text-muted-foreground border-transparent hover:text-foreground"
                    }`}>
                    {tab.isPending && <AlertTriangle className="w-3.5 h-3.5" />}
                    {tab.label}
                    {!tab.isPending && tab.sublabel && <span className="text-[11px] text-muted-foreground ml-0.5">({tab.sublabel})</span>}
                    {count > 0 && (
                      <span className={`text-[11px] font-bold rounded-full px-1.5 min-w-[18px] h-[18px] flex items-center justify-center ${
                        isActive
                          ? tab.isPending ? "bg-red-500 text-white" : "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}>{count}</span>
                    )}
                  </button>
                );
              })}
            </div>
            <CardContent className="pt-4 space-y-3">
              {tabPedidos.length === 0 ? (
                <div className="text-center py-10">
                  <ShoppingCart className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {pedidosOnline.length === 0 ? "No hay pedidos online pendientes" : "No hay pedidos con los filtros seleccionados"}
                  </p>
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="w-[28px]"></TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead className="hidden sm:table-cell">Pago</TableHead>
                        <TableHead className="hidden md:table-cell">Pedido</TableHead>
                        <TableHead className="hidden md:table-cell">Estado</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right w-[120px]"></TableHead>
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
                            <TableCell className="px-2">
                              {p.metodo_entrega === "envio" ? <Truck className="w-3.5 h-3.5 text-emerald-500" /> : <Store className="w-3.5 h-3.5 text-blue-500" />}
                            </TableCell>
                            <TableCell>
                              <div>
                                <span className="font-medium text-sm">{p.clientes?.nombre || "Sin cliente"}</span>
                                <span className="text-xs text-muted-foreground ml-1.5">#{p.numero}</span>
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
                              <span className="font-bold text-sm">{formatCurrency(p.total - (ncPorPedido[p.id] || 0))}</span>
                              {(ncPorPedido[p.id] || 0) > 0 && <span className="block text-[10px] text-amber-600">NC -{formatCurrency(ncPorPedido[p.id])}</span>}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-0.5">
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Ver detalle"
                                  onClick={async () => {
                                    setPedidoDetail(p);
                                    setPedidoDetailPagos([]);
                                    setPedidoDetailOpen(true);
                                    const { data: movs } = await supabase.from("caja_movimientos").select("metodo_pago, monto, tipo, cuenta_bancaria").eq("referencia_id", p.id).eq("referencia_tipo", "venta").eq("tipo", "ingreso");
                                    if (movs && movs.length > 0) {
                                      setPedidoDetailPagos(movs.map((m: any) => ({ metodo: m.metodo_pago, monto: Math.abs(m.monto), cuenta_bancaria: m.cuenta_bancaria })));
                                    } else {
                                      const pagos: { metodo: string; monto: number }[] = [];
                                      if ((p as any).monto_efectivo > 0) pagos.push({ metodo: "Efectivo", monto: (p as any).monto_efectivo });
                                      if ((p as any).monto_transferencia > 0) pagos.push({ metodo: "Transferencia", monto: (p as any).monto_transferencia });
                                      if (pagos.length === 0 && p.forma_pago) pagos.push({ metodo: p.forma_pago, monto: p.total });
                                      setPedidoDetailPagos(pagos);
                                    }
                                  }}>
                                  <Eye className="w-3.5 h-3.5" />
                                </Button>
                                <Button variant="ghost" size="sm" className={`h-7 w-7 p-0 ${printedPedidos.has(p.numero) ? "text-emerald-600" : ""}`}
                                  title={printedPedidos.has(p.numero) ? "Ya impreso — reimprimir" : "Imprimir remito"}
                                  onClick={() => handlePrintRemito(p)}>
                                  {printedPedidos.has(p.numero) ? <PrinterCheck className="w-3.5 h-3.5" /> : <Printer className="w-3.5 h-3.5" />}
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
              )}
            </CardContent>
          </Card>}

          {/* ─── 3-col grid: Stock bajo + Últimas ventas + Ventas por categoría ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Stock Bajo */}
            {isWidgetVisible("stockbajo") && lowStockProducts.length > 0 && (
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-[15px]">Stock Bajo</CardTitle>
                <Badge variant="destructive" className="text-xs">{lowStockProducts.length} productos</Badge>
              </CardHeader>
              <CardContent>
                <div className="space-y-0 max-h-[260px] overflow-y-auto">
                  {lowStockProducts.slice(0, 8).map((p) => {
                    const pct = p.stock_minimo > 0 ? Math.min((p.stock / p.stock_minimo) * 100, 100) : 0;
                    return (
                      <div key={p.id} className="flex items-center gap-2.5 py-2 text-[13px] border-b last:border-0">
                        <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden shrink-0">
                          <div className={`h-full rounded-full ${pct < 40 ? "bg-red-500" : "bg-amber-500"}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="flex-1 truncate font-medium">{p.nombre}</span>
                        <span className={`text-xs font-bold ${p.stock <= p.stock_minimo * 0.4 ? "text-red-600" : "text-amber-600"}`}>{p.stock} u.</span>
                        <span className="text-xs text-muted-foreground">mín. {p.stock_minimo}</span>
                      </div>
                    );
                  })}
                </div>
                {lowStockProducts.length > 8 && (
                  <Link href="/admin/stock" className="flex items-center justify-center gap-1.5 text-xs text-primary hover:underline mt-3 pt-3 border-t">
                    <PackageIcon className="w-3.5 h-3.5" /> Ver todos los productos con stock bajo
                  </Link>
                )}
              </CardContent>
            </Card>
            )}

            {/* Últimas Ventas */}
            {isWidgetVisible("ultimasventas") && ultimasVentas.length > 0 && (
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-[15px]">Últimas Ventas</CardTitle>
                <Link href="/admin/ventas/listado">
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground">Ver todas</Button>
                </Link>
              </CardHeader>
              <CardContent>
                <div className="space-y-0 max-h-[260px] overflow-y-auto">
                  {ultimasVentas.map((v) => (
                    <div key={v.id} className="flex items-center gap-2.5 py-2 text-[13px] border-b last:border-0">
                      <span className="text-xs text-muted-foreground w-10 shrink-0">{new Date(v.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })}</span>
                      <span className="flex-1 truncate font-medium">{v.cliente}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 shrink-0">{v.forma_pago}</Badge>
                      <span className="font-medium shrink-0 min-w-[70px] text-right">{formatCurrency(v.total)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            )}

            {/* Ventas por categoría */}
            {isWidgetVisible("categories") && ventasPorCategoria.length > 0 && (
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-[15px]">Ventas por Categoría</CardTitle>
                <span className="text-xs text-muted-foreground">{filterMode === "diario" ? "Hoy" : periodLabel}</span>
              </CardHeader>
              <CardContent>
                <div className="space-y-3.5">
                  {ventasPorCategoria.slice(0, 5).map((cat, i) => {
                    const totalCat = ventasPorCategoria.reduce((a, c) => a + c.value, 0);
                    const pct = totalCat > 0 ? (cat.value / totalCat) * 100 : 0;
                    return (
                      <div key={cat.name}>
                        <div className="flex justify-between text-[13px] mb-1">
                          <span className="font-medium">{cat.name}</span>
                          <span className="font-medium">{formatCurrency(cat.value)} <span className="text-xs text-muted-foreground">({pct.toFixed(0)}%)</span></span>
                        </div>
                        <div className="h-2 bg-muted rounded overflow-hidden">
                          <div className="h-full rounded transition-all duration-500" style={{ width: `${pct}%`, background: PIE_COLORS[i % PIE_COLORS.length] }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <Link href="/admin/reportes" className="flex items-center justify-center gap-1.5 text-xs text-primary hover:underline mt-3 pt-3 border-t">
                  <BarChart3 className="w-3.5 h-3.5" /> Ver resumen mensual completo
                </Link>
              </CardContent>
            </Card>
            )}
          </div>

          {/* ─── 2-col grid: Accesos Rápidos + Reportes ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h2 className="text-[15px] font-semibold mb-3">Accesos Rápidos</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Link href="/admin/ventas" className="flex flex-col gap-3 rounded-xl border bg-card p-4 hover:border-primary hover:shadow-sm transition-all">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center"><ShoppingCart className="w-5 h-5 text-emerald-500" /></div>
                  <div><p className="text-sm font-semibold">Nueva Venta</p><p className="text-xs text-muted-foreground">Ir al punto de venta</p></div>
                </Link>
                <Link href="/admin/clientes" className="flex flex-col gap-3 rounded-xl border bg-card p-4 hover:border-primary hover:shadow-sm transition-all">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center"><CreditCard className="w-5 h-5 text-blue-500" /></div>
                  <div><p className="text-sm font-semibold">Cobrar Deuda</p><p className="text-xs text-muted-foreground">Registrar cobranza</p></div>
                </Link>
                <Link href="/admin/compras" className="flex flex-col gap-3 rounded-xl border bg-card p-4 hover:border-primary hover:shadow-sm transition-all">
                  <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center"><Truck className="w-5 h-5 text-violet-500" /></div>
                  <div><p className="text-sm font-semibold">Cargar Compra</p><p className="text-xs text-muted-foreground">Registrar compra a proveedor</p></div>
                </Link>
                <Link href="/admin/productos" className="flex flex-col gap-3 rounded-xl border bg-card p-4 hover:border-primary hover:shadow-sm transition-all">
                  <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center"><PackageIcon className="w-5 h-5 text-amber-500" /></div>
                  <div><p className="text-sm font-semibold">Productos</p><p className="text-xs text-muted-foreground">Gestionar catálogo</p></div>
                </Link>
              </div>
            </div>
            <div>
              <h2 className="text-[15px] font-semibold mb-3">Reportes</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Link href="/admin/reportes" className="flex flex-col gap-3 rounded-xl border bg-card p-4 hover:border-primary hover:shadow-sm transition-all">
                  <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center"><BarChart3 className="w-5 h-5 text-primary-foreground" /></div>
                  <div><p className="text-sm font-semibold">Resumen Mensual</p><p className="text-xs text-muted-foreground">Ventas, gastos, ganancia</p></div>
                </Link>
                <Link href="/admin/clientes" className="flex flex-col gap-3 rounded-xl border bg-card p-4 hover:border-primary hover:shadow-sm transition-all">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500 flex items-center justify-center"><Trophy className="w-5 h-5 text-white" /></div>
                  <div><p className="text-sm font-semibold">Ranking Clientes</p><p className="text-xs text-muted-foreground">Top clientes por compras</p></div>
                </Link>
                <Link href="/admin/ventas/listado" className="flex flex-col gap-3 rounded-xl border bg-card p-4 hover:border-primary hover:shadow-sm transition-all">
                  <div className="w-10 h-10 rounded-lg bg-amber-500 flex items-center justify-center"><UserCheck className="w-5 h-5 text-white" /></div>
                  <div><p className="text-sm font-semibold">Por Vendedor</p><p className="text-xs text-muted-foreground">Performance y comisiones</p></div>
                </Link>
                <Link href="/admin/reportes" className="flex flex-col gap-3 rounded-xl border bg-card p-4 hover:border-primary hover:shadow-sm transition-all">
                  <div className="w-10 h-10 rounded-lg bg-violet-500 flex items-center justify-center"><FileText className="w-5 h-5 text-white" /></div>
                  <div><p className="text-sm font-semibold">Todos los Reportes</p><p className="text-xs text-muted-foreground">Ver reportes completos</p></div>
                </Link>
              </div>
            </div>
          </div>

          {/* ─── Saldos Descuadrados ─── */}
          {/* Detection uses CC table which is incomplete — use Recalcular in Clientes for accurate correction */}
          {isWidgetVisible("saldos") && saldoMismatches.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-semibold text-amber-800">Saldos a revisar</span>
                  <Badge className="text-xs bg-amber-100 text-amber-800">{saldoMismatches.length}</Badge>
                </div>
                <span className="text-[10px] text-amber-600">Usar Recalcular en Clientes → Resumen de Cuenta</span>
              </div>
              <div className="border rounded-lg overflow-hidden bg-white">
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Cliente</TableHead><TableHead>Saldo actual</TableHead><TableHead className="text-right"></TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {saldoMismatches.slice(0, 8).map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium text-sm">{c.nombre}</TableCell>
                        <TableCell className="text-sm">{formatCurrency(c.saldo)}</TableCell>
                        <TableCell className="text-right">
                          <span className="text-[10px] text-gray-400">Revisar en Clientes</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Pedido Detail Dialog — Vista simple */}
      <Dialog open={pedidoDetailOpen} onOpenChange={setPedidoDetailOpen}>
        <DialogContent className="max-w-md p-0 gap-0">
          {pedidoDetail && (() => {
            const cliente = pedidoDetail.clientes;
            const estado = pedidoEstadoMap[pedidoDetail.numero] || "pendiente";
            const isEnvio = pedidoDetail.metodo_entrega === "envio";
            const items = pedidoDetail.venta_items;
            const isPrinted = printedPedidos.has(pedidoDetail.numero);
            return (
              <>
                {/* Header */}
                <div className="px-5 pt-5 pb-3 border-b bg-muted/30">
                  <DialogHeader className="p-0 space-y-0">
                    <DialogTitle className="text-base font-semibold flex items-center gap-2">
                      <ShoppingCart className="w-4 h-4 text-primary" />
                      Pedido #{pedidoDetail.numero}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-xs text-muted-foreground">
                      {new Date(pedidoDetail.created_at).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Argentina/Buenos_Aires" })}
                    </span>
                    <Badge variant={estado === "armado" ? "default" : "outline"} className={`text-[10px] px-1.5 py-0 ${estado === "armado" ? "bg-violet-100 text-violet-700 hover:bg-violet-100" : ""}`}>
                      {estado.charAt(0).toUpperCase() + estado.slice(1)}
                    </Badge>
                    {isPrinted && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-200 text-emerald-600"><PrinterCheck className="w-3 h-3 mr-0.5" />Impreso</Badge>}
                  </div>
                </div>

                {/* Body */}
                <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
                  {/* Cliente */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="font-medium text-sm">{cliente?.nombre || "Consumidor Final"}</span>
                    </div>
                    {cliente?.telefono && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Phone className="w-3 h-3" />
                        {cliente.telefono}
                      </div>
                    )}
                    {(cliente?.domicilio || cliente?.localidad) && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3" />
                        {[cliente?.domicilio, cliente?.localidad].filter(Boolean).join(", ")}
                      </div>
                    )}
                  </div>

                  {/* Entrega */}
                  <div className="flex items-center gap-2 text-xs">
                    {isEnvio ? <Truck className="w-3.5 h-3.5 text-blue-500" /> : <Store className="w-3.5 h-3.5 text-amber-500" />}
                    <span className="font-medium">{isEnvio ? "Envío" : "Retiro en local"}</span>
                    {pedidoEntregaMap[pedidoDetail.numero] && (
                      <span className="text-muted-foreground ml-1">
                        — {new Date(pedidoEntregaMap[pedidoDetail.numero] + "T12:00:00").toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" })}
                      </span>
                    )}
                  </div>

                  {/* Items */}
                  <div className="border rounded-lg overflow-hidden">
                    <div className="divide-y">
                      {items.map((item, i) => {
                        const upp = item.unidades_por_presentacion || 1;
                        const qty = upp < 1 ? item.cantidad * upp : item.cantidad;
                        const desc = cleanItemDescription(item.descripcion, item.presentacion);
                        return (
                          <div key={i} className="flex items-center justify-between px-3 py-2 text-xs">
                            <div className="flex-1 min-w-0">
                              <span className="font-medium">{qty % 1 === 0 ? qty : qty.toFixed(1)}x</span>
                              <span className="ml-1.5 text-muted-foreground truncate">{desc}</span>
                            </div>
                            <span className="font-medium ml-2 shrink-0">{formatCurrency(item.subtotal)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Pago */}
                  <div className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 text-xs">
                      <Banknote className="w-3.5 h-3.5 text-muted-foreground" />
                      {pedidoDetailPagos.length > 0 ? (
                        <span>{pedidoDetailPagos.map((p) => `${p.metodo}: ${formatCurrency(p.monto)}`).join(" + ")}</span>
                      ) : (
                        <span>{pedidoDetail.forma_pago}</span>
                      )}
                    </div>
                    <span className="font-bold text-sm">{formatCurrency(pedidoDetail.total)}</span>
                  </div>

                  {/* Observacion */}
                  {pedidoDetail.observacion && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                      <strong>Nota:</strong> {pedidoDetail.observacion}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="px-5 py-3 border-t bg-muted/20 flex items-center justify-between gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs"
                    onClick={() => { setPedidoDetailOpen(false); router.push(`/admin/ventas/listado?buscar=${pedidoDetail.numero}`); }}>
                    <ExternalLink className="w-3.5 h-3.5" /> Ver en historial
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className={`gap-1.5 text-xs ${isPrinted ? "text-emerald-600 border-emerald-200" : ""}`}
                      onClick={() => { setPedidoDetailOpen(false); handlePrintRemito(pedidoDetail); }}>
                      {isPrinted ? <PrinterCheck className="w-3.5 h-3.5" /> : <Printer className="w-3.5 h-3.5" />}
                      {isPrinted ? "Reimprimir" : "Imprimir"}
                    </Button>
                    {pedidoDetail.metodo_entrega === "retiro" && estado !== "armado" && (
                      <Button variant="outline" size="sm" className="gap-1.5 text-xs text-violet-600 border-violet-200 hover:bg-violet-50"
                        disabled={actionLoading === pedidoDetail.id}
                        onClick={() => handleMarkArmado(pedidoDetail)}>
                        <PackageCheck className="w-3.5 h-3.5" /> Armado
                      </Button>
                    )}
                    <Button size="sm" className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700"
                      disabled={actionLoading === pedidoDetail.id}
                      onClick={() => { setPedidoDetailOpen(false); handleMarkDelivered(pedidoDetail); }}>
                      <CheckCircle className="w-3.5 h-3.5" /> Entregado
                    </Button>
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Delivery confirmation modal */}
      <Dialog open={deliveryConfirm.open} onOpenChange={(v) => !v && setDeliveryConfirm({ open: false, venta: null, pendiente: 0, type: "paid" })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {deliveryConfirm.type === "paid" ? (
                <><CheckCircle className="w-5 h-5 text-emerald-500" /> Confirmar entrega</>
              ) : deliveryConfirm.type === "no_client" ? (
                <><AlertTriangle className="w-5 h-5 text-red-500" /> No se puede entregar</>
              ) : (
                <><AlertTriangle className="w-5 h-5 text-amber-500" /> Saldo pendiente</>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {deliveryConfirm.type === "paid" && deliveryConfirm.venta && (
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4">
                <p className="text-sm text-emerald-800">
                  Pedido <span className="font-bold">#{deliveryConfirm.venta.numero}</span> de{" "}
                  <span className="font-bold">{(deliveryConfirm.venta as any).clientes?.nombre || "cliente"}</span> por{" "}
                  <span className="font-bold">{formatCurrency(deliveryConfirm.venta.total - (ncPorPedido[deliveryConfirm.venta.id] || 0))}</span>
                </p>
                {(ncPorPedido[deliveryConfirm.venta?.id] || 0) > 0 && <p className="text-xs text-amber-600 mt-1">Incluye NC -{formatCurrency(ncPorPedido[deliveryConfirm.venta.id])}</p>}
                <p className="text-xs text-emerald-600 mt-1">Pago completo — listo para entregar</p>
              </div>
            )}
            {(deliveryConfirm.type === "unpaid" || deliveryConfirm.type === "no_client") && deliveryConfirm.venta && (() => {
              const pend = deliveryConfirm.pendiente;
              const metodo = deliveryConfirm.cobroMetodo || "Efectivo";
              const mixEf = deliveryConfirm.cobroMixtoEf || 0;
              const mixTr = deliveryConfirm.cobroMixtoTr || 0;
              const montoIngresado = deliveryConfirm.cobroMonto;
              const setField = (field: string, val: any) => setDeliveryConfirm((prev) => ({ ...prev, [field]: val }));
              const hasClient = !!(deliveryConfirm.venta as any).cliente_id;
              // Calculate remainder to CC
              let totalCobrado = 0;
              if (metodo === "Mixto") totalCobrado = mixEf + mixTr;
              else if (metodo === "Cuenta Corriente") totalCobrado = 0;
              else totalCobrado = montoIngresado ?? pend;
              const restanteCC = Math.max(0, Math.round((pend - totalCobrado) * 100) / 100);
              const fmt = formatCurrency;
              return (
                <div className="space-y-3">
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                    <p className="text-sm text-amber-900">
                      <span className="font-bold">{(deliveryConfirm.venta as any).clientes?.nombre || "Cliente"}</span> debe{" "}
                      <span className="font-bold text-amber-700">{fmt(pend)}</span>
                    </p>
                  </div>
                  <p className="text-xs font-medium text-muted-foreground">Método de pago</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { key: "Efectivo", label: "Efect.", icon: DollarSign },
                      { key: "Transferencia", label: "Transf.", icon: ArrowLeftRight },
                      { key: "Mixto", label: "Mixto", icon: Shuffle },
                      ...(hasClient ? [{ key: "Cuenta Corriente", label: "Cta Cte", icon: BookOpen }] : []),
                    ].map(({ key, label, icon: Icon }) => (
                      <button key={key} onClick={() => setField("cobroMetodo", key)}
                        className={`flex flex-col items-center justify-center gap-0.5 rounded-lg border-2 p-1.5 transition-all text-[10px] font-medium ${metodo === key ? "border-emerald-500 bg-emerald-500/10 text-emerald-700" : "border-gray-200 bg-white hover:bg-gray-50 text-gray-500"}`}>
                        <Icon className="w-3.5 h-3.5" />{label}
                      </button>
                    ))}
                  </div>
                  {(metodo === "Efectivo" || metodo === "Transferencia") && (
                    <div>
                      <label className="text-[10px] text-gray-500">Monto cobrado</label>
                      <input type="number" value={montoIngresado ?? ""} placeholder={String(pend)} onChange={(e) => setField("cobroMonto", e.target.value === "" ? undefined : Number(e.target.value))} className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" max={pend} />
                    </div>
                  )}
                  {metodo === "Mixto" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-gray-500">Efectivo</label>
                        <input type="number" value={mixEf || ""} onChange={(e) => setField("cobroMixtoEf", Number(e.target.value))} className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500">Transferencia</label>
                        <input type="number" value={mixTr || ""} onChange={(e) => setField("cobroMixtoTr", Number(e.target.value))} className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
                      </div>
                    </div>
                  )}
                  {(metodo === "Transferencia" || metodo === "Mixto") && deliveryCuentasBancarias.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">Cuenta bancaria</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {deliveryCuentasBancarias.map((cb) => (
                          <button key={cb.id} onClick={() => setField("cobroCuentaBancaria", cb.nombre)}
                            className={`flex items-center gap-1.5 rounded-lg border-2 px-2 py-1.5 text-xs transition-all text-left ${deliveryConfirm.cobroCuentaBancaria === cb.nombre ? "border-emerald-500 bg-emerald-500/10 text-emerald-700" : "border-gray-200 bg-white hover:bg-gray-50 text-gray-500"}`}>
                            <Landmark className="w-3 h-3 shrink-0" />
                            <span className="truncate">{cb.alias || cb.nombre}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {recargoTransferencia > 0 && (metodo === "Transferencia" || metodo === "Mixto") && (() => {
                    const montoTransf = metodo === "Transferencia" ? (montoIngresado ?? pend) : mixTr;
                    const recargo = Math.round(montoTransf * (recargoTransferencia / 100));
                    if (recargo <= 0) return null;
                    return (
                      <div className="rounded-lg bg-violet-50 border border-violet-200 p-2.5">
                        <p className="text-xs text-violet-800">
                          Cliente debe transferir <span className="font-bold">{fmt(montoTransf + recargo)}</span>
                          <span className="text-violet-600"> (incluye {recargoTransferencia}% recargo: {fmt(recargo)})</span>
                        </p>
                      </div>
                    );
                  })()}
                  {metodo !== "Cuenta Corriente" && restanteCC > 0 && hasClient && (
                    <div className="rounded-lg bg-blue-50 border border-blue-200 p-2.5">
                      <p className="text-xs text-blue-800">
                        <BookOpen className="w-3 h-3 inline mr-1" />
                        Restante <span className="font-bold">{fmt(restanteCC)}</span> queda en cuenta corriente
                      </p>
                    </div>
                  )}
                  {metodo !== "Cuenta Corriente" && restanteCC > 0 && !hasClient && (
                    <div className="rounded-lg bg-red-50 border border-red-200 p-2.5">
                      <p className="text-xs text-red-800">
                        Sin cliente asociado — no se puede dejar saldo en cuenta corriente. Cobrá el total o asociá un cliente.
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDeliveryConfirm({ open: false, venta: null, pendiente: 0, type: "paid" })}>
                Cancelar
              </Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={confirmDelivery}>
                <CheckCircle className="w-4 h-4 mr-1.5" />
                {deliveryConfirm.type === "paid" ? "Marcar entregado" : deliveryConfirm.cobroMetodo === "Cuenta Corriente" ? "Dejar en Cta Cte y entregar" : "Cobrar y entregar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Print preview dialog */}
      {printSale && (
        <Suspense fallback={null}><PrintPreviewDialog
          open={printPreviewOpen}
          onClose={() => { setPrintPreviewOpen(false); setPrintSale(null); }}
          config={receiptConfig}
          sale={printSale}
          title={`Vista previa — ${printSale.tipoComprobante} N° ${printSale.numero}`}
        /></Suspense>
      )}

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
