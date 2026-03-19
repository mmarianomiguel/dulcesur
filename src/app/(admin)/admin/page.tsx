"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Receipt,
  Users,
  Package,
  CreditCard,
  Banknote,
  Loader2,
  Calendar,
  ShoppingCart,
  Truck,
  Clock,
  AlertTriangle,
  Eye,
  Store,
} from "lucide-react";
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(value);
}

function todayARG() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
}

const PIE_COLORS = ["oklch(0.55 0.2 264)", "oklch(0.65 0.18 160)", "oklch(0.7 0.15 50)", "oklch(0.6 0.2 300)"];

interface VentaRow {
  id: string;
  numero: string;
  total: number;
  forma_pago: string;
  tipo_comprobante: string;
  fecha: string;
  created_at: string;
  clientes: { nombre: string } | null;
}

type FilterMode = "diario" | "mensual" | "rango";

export default function DashboardPage() {
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
  const [recentSales, setRecentSales] = useState<VentaRow[]>([]);
  const [salesFilterMode, setSalesFilterMode] = useState<FilterMode>("diario");
  const [salesFilterDate, setSalesFilterDate] = useState(todayARG());
  const [salesFilterMonth, setSalesFilterMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [salesFilterFrom, setSalesFilterFrom] = useState(todayARG());
  const [salesFilterTo, setSalesFilterTo] = useState(todayARG());
  const [salesFilterComprobante, setSalesFilterComprobante] = useState("all");
  const [salesLoading, setSalesLoading] = useState(false);
  const [paymentBreakdown, setPaymentBreakdown] = useState<{ name: string; value: number }[]>([]);
  const [monthlyData, setMonthlyData] = useState<{ name: string; ventas: number; egresos: number }[]>([]);
  const [ventasPorCategoria, setVentasPorCategoria] = useState<{ name: string; value: number }[]>([]);

  // Web orders
  interface PedidoWeb {
    id: string;
    numero: string;
    nombre_cliente: string;
    metodo_entrega: string;
    metodo_pago: string;
    total: number;
    fecha_entrega: string | null;
    created_at: string;
    estado: string;
  }
  const [pedidosHoy, setPedidosHoy] = useState<PedidoWeb[]>([]);
  const [pedidosProgramados, setPedidosProgramados] = useState<PedidoWeb[]>([]);
  const [pedidosVencidos, setPedidosVencidos] = useState<PedidoWeb[]>([]);
  const [pedidosTab, setPedidosTab] = useState<"hoy" | "programados" | "pendientes">("hoy");

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
    // rango
    const next = new Date(filterTo + "T12:00:00");
    next.setDate(next.getDate() + 1);
    return { start: filterFrom, end: next.toISOString().split("T")[0] };
  }, [filterMode, filterDate, filterMonth, filterFrom, filterTo]);

  const getFilterLabel = () => {
    if (filterMode === "diario") {
      return new Date(filterDate + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
    }
    if (filterMode === "mensual") {
      const [y, m] = filterMonth.split("-").map(Number);
      const d = new Date(y, m - 1, 1);
      return d.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
    }
    const from = new Date(filterFrom + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" });
    const to = new Date(filterTo + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
    return `${from} — ${to}`;
  };

  const getSalesDateRange = useCallback((): { start: string; end: string } => {
    if (salesFilterMode === "diario") {
      const next = new Date(salesFilterDate + "T12:00:00");
      next.setDate(next.getDate() + 1);
      return { start: salesFilterDate, end: next.toISOString().split("T")[0] };
    }
    if (salesFilterMode === "mensual") {
      const [y, m] = salesFilterMonth.split("-").map(Number);
      const start = `${y}-${String(m).padStart(2, "0")}-01`;
      const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
      return { start, end };
    }
    const next = new Date(salesFilterTo + "T12:00:00");
    next.setDate(next.getDate() + 1);
    return { start: salesFilterFrom, end: next.toISOString().split("T")[0] };
  }, [salesFilterMode, salesFilterDate, salesFilterMonth, salesFilterFrom, salesFilterTo]);

  const fetchSales = useCallback(async () => {
    setSalesLoading(true);
    const { start, end } = getSalesDateRange();
    let query = supabase
      .from("ventas")
      .select("id, numero, total, forma_pago, tipo_comprobante, fecha, created_at, clientes(nombre)")
      .gte("fecha", start)
      .lt("fecha", end)
      .order("created_at", { ascending: false })
      .limit(50);
    if (salesFilterComprobante !== "all") {
      query = query.eq("tipo_comprobante", salesFilterComprobante);
    }
    const { data } = await query;
    setRecentSales((data as unknown as VentaRow[]) || []);
    setSalesLoading(false);
  }, [getSalesDateRange, salesFilterComprobante]);

  useEffect(() => { fetchSales(); }, [fetchSales]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const { start, end } = getDateRange();

    // Period sales
    const { data: periodSales } = await supabase
      .from("ventas")
      .select("total, forma_pago")
      .gte("fecha", start)
      .lt("fecha", end);
    const salesTotal = (periodSales || []).reduce((a, v) => a + v.total, 0);
    setVentasPeriodo(salesTotal);
    setTicketsPeriodo((periodSales || []).length);

    // Payment breakdown
    const paymentMap: Record<string, number> = {};
    (periodSales || []).forEach((v) => {
      paymentMap[v.forma_pago] = (paymentMap[v.forma_pago] || 0) + v.total;
    });
    setPaymentBreakdown(Object.entries(paymentMap).map(([name, value]) => ({ name, value })));

    // Period expenses
    const { data: periodExpenses } = await supabase
      .from("caja_movimientos")
      .select("monto")
      .gte("fecha", start)
      .lt("fecha", end)
      .eq("tipo", "egreso");
    setGastosPeriodo((periodExpenses || []).reduce((a, e) => a + Math.abs(e.monto), 0));

    // Ganancia = sum of (precio_unitario - costo) * cantidad for sold items in period
    const { data: ventaIds } = await supabase
      .from("ventas")
      .select("id")
      .gte("fecha", start)
      .lt("fecha", end);
    let gananciaTotal = 0;
    if (ventaIds && ventaIds.length > 0) {
      const ids = ventaIds.map((v) => v.id);
      const { data: items } = await supabase
        .from("venta_items")
        .select("cantidad, precio_unitario, unidades_por_presentacion, productos(costo)")
        .in("venta_id", ids);
      gananciaTotal = (items || []).reduce((acc, item: any) => {
        const costoUnitario = item.productos?.costo || 0;
        const cantidad = Number(item.cantidad) || 0;
        const precioUnitario = Number(item.precio_unitario) || 0;
        const unidadesPorPres = Number(item.unidades_por_presentacion) || 1;
        // For boxes: cost = unit cost × units per presentation
        const costoVenta = costoUnitario * unidadesPorPres;
        return acc + (precioUnitario - costoVenta) * cantidad;
      }, 0);
    }
    setGananciaPeriodo(gananciaTotal);

    // Capital en mercadería (always current)
    const { data: prods } = await supabase.from("productos").select("stock, precio, costo").eq("activo", true);
    setCapitalMercaderia((prods || []).reduce((a, p) => a + p.stock * (p.costo || p.precio), 0));

    // Cuentas a cobrar (always current)
    const { data: cls } = await supabase.from("clientes").select("saldo").eq("activo", true);
    setCuentasCobrar((cls || []).reduce((a, c) => a + (c.saldo > 0 ? c.saldo : 0), 0));

    // Cuentas a pagar (always current)
    const { data: provs } = await supabase.from("proveedores").select("saldo").eq("activo", true);
    setCuentasPagar((provs || []).reduce((a, p) => a + (p.saldo > 0 ? p.saldo : 0), 0));

    // Monthly data (last 6 months - always shown)
    const months: { name: string; ventas: number; egresos: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const mStart = `${year}-${String(month).padStart(2, "0")}-01`;
      const mEnd = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;

      const { data: mv } = await supabase.from("ventas").select("total").gte("fecha", mStart).lt("fecha", mEnd);
      const { data: me } = await supabase.from("caja_movimientos").select("monto").eq("tipo", "egreso").gte("fecha", mStart).lt("fecha", mEnd);

      months.push({
        name: d.toLocaleDateString("es-AR", { month: "short" }),
        ventas: (mv || []).reduce((a, v) => a + v.total, 0),
        egresos: (me || []).reduce((a, e) => a + Math.abs(e.monto), 0),
      });
    }
    setMonthlyData(months);

    // Ventas por categoría (within period)
    const { data: ventasCat } = await supabase
      .from("venta_items")
      .select("subtotal, productos(categoria_id, categorias(nombre))")
      .gte("created_at", start + "T00:00:00")
      .lt("created_at", end + "T00:00:00");
    const catMap: Record<string, number> = {};
    (ventasCat || []).forEach((vi: any) => {
      const catName = vi.productos?.categorias?.nombre || "Sin categoría";
      catMap[catName] = (catMap[catName] || 0) + (vi.subtotal || 0);
    });
    setVentasPorCategoria(
      Object.entries(catMap)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
    );

    // Web orders - fetch all pending/confirmado orders
    const today = todayARG();
    const { data: allPedidos } = await supabase
      .from("pedidos_tienda")
      .select("id, numero, nombre_cliente, metodo_entrega, metodo_pago, total, fecha_entrega, created_at, estado")
      .in("estado", ["pendiente", "confirmado"])
      .order("created_at", { ascending: true });

    const pedidos = (allPedidos as PedidoWeb[]) || [];
    setPedidosHoy(pedidos.filter((p) => p.fecha_entrega === today));
    setPedidosProgramados(pedidos.filter((p) => p.fecha_entrega && p.fecha_entrega > today));
    setPedidosVencidos(pedidos.filter((p) => p.fecha_entrega && p.fecha_entrega < today));

    setLoading(false);
  }, [getDateRange]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const ganancia = gananciaPeriodo;

  const periodLabel = filterMode === "diario" ? "del día" : filterMode === "mensual" ? "del mes" : "del período";

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">Resumen de actividad — {getFilterLabel()}</p>
        </div>
        <Badge variant="outline" className="text-xs w-fit">DulceSur</Badge>
      </div>

      {/* ─── Date filter ─── */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Resumen de Actividad</span>
            </div>

            {/* Mode tabs */}
            <div className="flex border rounded-lg overflow-hidden">
              {(["diario", "mensual", "rango"] as FilterMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setFilterMode(mode)}
                  className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                    filterMode === mode
                      ? "bg-primary text-primary-foreground"
                      : "bg-background hover:bg-muted text-muted-foreground"
                  }`}
                >
                  {mode === "diario" ? "Diario" : mode === "mensual" ? "Mensual" : "Entre Fechas"}
                </button>
              ))}
            </div>

            {/* Date inputs */}
            <div className="flex items-center gap-2 flex-1">
              {filterMode === "diario" && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">Filtrar por día</span>
                  <Input
                    type="date"
                    value={filterDate}
                    onChange={(ev) => setFilterDate(ev.target.value)}
                    className="h-9 w-44"
                  />
                </div>
              )}
              {filterMode === "mensual" && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">Mes</span>
                  <Input
                    type="month"
                    value={filterMonth}
                    onChange={(ev) => setFilterMonth(ev.target.value)}
                    className="h-9 w-44"
                  />
                </div>
              )}
              {filterMode === "rango" && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">Desde</span>
                  <Input
                    type="date"
                    value={filterFrom}
                    onChange={(ev) => setFilterFrom(ev.target.value)}
                    className="h-9 w-40"
                  />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">Hasta</span>
                  <Input
                    type="date"
                    value={filterTo}
                    onChange={(ev) => setFilterTo(ev.target.value)}
                    className="h-9 w-40"
                  />
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Ventas {periodLabel}</p>
                    <p className="text-2xl font-bold mt-1">{formatCurrency(ventasPeriodo)}</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><DollarSign className="w-5 h-5 text-primary" /></div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Ganancia</p>
                    <div className="flex items-baseline gap-2 mt-1">
                      <p className="text-2xl font-bold">{formatCurrency(ganancia)}</p>
                      <span className={`text-sm font-semibold ${ganancia >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {ventasPeriodo > 0 ? `${((ganancia / ventasPeriodo) * 100).toFixed(1)}%` : "—"}
                      </span>
                    </div>
                  </div>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${ganancia >= 0 ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
                    {ganancia >= 0 ? <TrendingUp className="w-5 h-5 text-emerald-500" /> : <TrendingDown className="w-5 h-5 text-red-500" />}
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Gastos</p>
                    <p className="text-2xl font-bold mt-1">{formatCurrency(gastosPeriodo)}</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center"><TrendingDown className="w-5 h-5 text-orange-500" /></div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Tickets</p>
                    <p className="text-2xl font-bold mt-1">{ticketsPeriodo}</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center"><Receipt className="w-5 h-5 text-violet-500" /></div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Balance cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-primary/5 border-primary/10">
              <CardContent className="pt-6 flex items-center gap-4">
                <Package className="w-8 h-8 text-primary/60" />
                <div>
                  <p className="text-xs text-muted-foreground">Capital en mercadería</p>
                  <p className="text-lg font-semibold">{formatCurrency(capitalMercaderia)}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-emerald-500/5 border-emerald-500/10">
              <CardContent className="pt-6 flex items-center gap-4">
                <Users className="w-8 h-8 text-emerald-500/60" />
                <div>
                  <p className="text-xs text-muted-foreground">Cuentas a cobrar</p>
                  <p className="text-lg font-semibold">{formatCurrency(cuentasCobrar)}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-orange-500/5 border-orange-500/10">
              <CardContent className="pt-6 flex items-center gap-4">
                <CreditCard className="w-8 h-8 text-orange-500/60" />
                <div>
                  <p className="text-xs text-muted-foreground">Cuentas a pagar</p>
                  <p className="text-lg font-semibold">{formatCurrency(cuentasPagar)}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Pedidos web pendientes - Tabbed section */}
          {(pedidosHoy.length > 0 || pedidosProgramados.length > 0 || pedidosVencidos.length > 0) && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-primary" />
                    Pedidos Web
                  </CardTitle>
                  <div className="flex border rounded-lg overflow-hidden">
                    {([
                      { key: "hoy" as const, label: "Hoy", count: pedidosHoy.length },
                      { key: "programados" as const, label: "Programados", count: pedidosProgramados.length },
                      { key: "pendientes" as const, label: "Pendientes", count: pedidosVencidos.length },
                    ]).map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setPedidosTab(tab.key)}
                        className={`px-4 py-1.5 text-sm font-medium transition-colors flex items-center gap-1.5 ${
                          pedidosTab === tab.key
                            ? "bg-primary text-primary-foreground"
                            : "bg-background hover:bg-muted text-muted-foreground"
                        }`}
                      >
                        {tab.label}
                        {tab.count > 0 && (
                          <span className={`text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center ${
                            pedidosTab === tab.key
                              ? "bg-primary-foreground/20 text-primary-foreground"
                              : tab.key === "pendientes" && tab.count > 0
                                ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                : "bg-muted text-muted-foreground"
                          }`}>
                            {tab.count}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {(() => {
                  const currentList =
                    pedidosTab === "hoy" ? pedidosHoy :
                    pedidosTab === "programados" ? pedidosProgramados :
                    pedidosVencidos;

                  if (currentList.length === 0) {
                    return (
                      <div className="text-center py-10 text-muted-foreground">
                        <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        <p className="text-sm">
                          {pedidosTab === "hoy" && "No hay pedidos para hoy"}
                          {pedidosTab === "programados" && "No hay pedidos programados"}
                          {pedidosTab === "pendientes" && "No hay pedidos vencidos"}
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="grid gap-3">
                      {currentList.map((p) => {
                        const isOverdue = pedidosTab === "pendientes";
                        const createdDate = new Date(p.created_at);
                        const timeStr = createdDate.toLocaleTimeString("es-AR", {
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: "America/Argentina/Buenos_Aires",
                        });

                        return (
                          <div
                            key={p.id}
                            className={`rounded-lg border p-4 transition-colors hover:bg-muted/30 ${
                              isOverdue ? "border-red-200 bg-red-50/50 dark:border-red-900/30 dark:bg-red-950/20" : ""
                            }`}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="flex items-start gap-3 flex-1 min-w-0">
                                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                                  isOverdue
                                    ? "bg-red-100 dark:bg-red-900/30"
                                    : p.metodo_entrega === "envio"
                                      ? "bg-blue-100 dark:bg-blue-900/30"
                                      : "bg-emerald-100 dark:bg-emerald-900/30"
                                }`}>
                                  {isOverdue ? (
                                    <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
                                  ) : p.metodo_entrega === "envio" ? (
                                    <Truck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                  ) : (
                                    <Store className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-semibold text-sm">#{p.numero}</span>
                                    <span className="font-medium text-sm truncate">{p.nombre_cliente}</span>
                                  </div>
                                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    <Badge variant="outline" className="text-xs">
                                      {p.metodo_entrega === "envio" ? "Envio" : "Retiro en local"}
                                    </Badge>
                                    <Badge variant="secondary" className="text-xs">
                                      {p.metodo_pago || "—"}
                                    </Badge>
                                    {p.estado === "confirmado" && (
                                      <Badge className="text-xs bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400">
                                        Confirmado
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-4 sm:gap-6 shrink-0">
                                <div className="text-right">
                                  <p className="font-bold text-sm">{formatCurrency(p.total)}</p>
                                  <div className="flex items-center gap-1 justify-end mt-0.5">
                                    <Calendar className="w-3 h-3 text-muted-foreground" />
                                    <span className={`text-xs ${isOverdue ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground"}`}>
                                      {p.fecha_entrega
                                        ? new Date(p.fecha_entrega + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })
                                        : "Sin fecha"}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1 justify-end mt-0.5">
                                    <Clock className="w-3 h-3 text-muted-foreground" />
                                    <span className="text-xs text-muted-foreground">{timeStr}</span>
                                  </div>
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs gap-1"
                                  onClick={() => window.open(`/admin/ventas/listado?pedido=${p.id}`, "_self")}
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  Ver pedido
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle className="text-base">Ventas y egresos — últimos 6 meses</CardTitle></CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyData} barGap={4}>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.005 260)" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v > 1000000 ? `${(v / 1000000).toFixed(0)}M` : v > 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)} />
                      <Tooltip formatter={(value) => formatCurrency(Number(value))} contentStyle={{ borderRadius: "0.75rem", fontSize: "13px" }} />
                      <Bar dataKey="ventas" name="Ventas" fill="oklch(0.55 0.2 264)" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="egresos" name="Egresos" fill="oklch(0.7 0.15 50)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Formas de pago ({periodLabel})</CardTitle></CardHeader>
              <CardContent>
                {paymentBreakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Sin ventas en este período</p>
                ) : (
                  <>
                    <div className="h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={paymentBreakdown} innerRadius={55} outerRadius={80} dataKey="value" stroke="none">
                            {paymentBreakdown.map((_, i) => (<Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />))}
                          </Pie>
                          <Tooltip formatter={(value) => formatCurrency(Number(value))} contentStyle={{ borderRadius: "0.75rem", fontSize: "13px" }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-2 mt-2">
                      {paymentBreakdown.map((m, i) => (
                        <div key={m.name} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                            <span className="text-muted-foreground">{m.name}</span>
                          </div>
                          <span className="font-medium">{formatCurrency(m.value)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Ventas por categoría */}
          <Card>
            <CardHeader><CardTitle className="text-base">Ventas por categoría — {periodLabel}</CardTitle></CardHeader>
            <CardContent>
              {ventasPorCategoria.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Sin datos en este período</p>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={ventasPorCategoria} layout="vertical" barSize={20}>
                        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.005 260)" />
                        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => v > 1000000 ? `${(v / 1000000).toFixed(0)}M` : v > 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={120} />
                        <Tooltip formatter={(value) => formatCurrency(Number(value))} contentStyle={{ borderRadius: "0.75rem", fontSize: "13px" }} />
                        <Bar dataKey="value" name="Ventas" fill="oklch(0.55 0.2 264)" radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2">
                    {ventasPorCategoria.map((cat, i) => {
                      const totalCat = ventasPorCategoria.reduce((a, c) => a + c.value, 0);
                      const pct = totalCat > 0 ? ((cat.value / totalCat) * 100).toFixed(1) : "0";
                      return (
                        <div key={cat.name} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                            <span>{cat.name}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-muted-foreground text-xs">{pct}%</span>
                            <span className="font-medium">{formatCurrency(cat.value)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent sales with own filters */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Últimas ventas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Sales filters */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 pb-3 border-b">
                {/* Mode tabs */}
                <div className="flex border rounded-lg overflow-hidden">
                  {(["diario", "mensual", "rango"] as FilterMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setSalesFilterMode(mode)}
                      className={`px-3 py-1 text-xs font-medium transition-colors ${
                        salesFilterMode === mode
                          ? "bg-primary text-primary-foreground"
                          : "bg-background hover:bg-muted text-muted-foreground"
                      }`}
                    >
                      {mode === "diario" ? "Diario" : mode === "mensual" ? "Mensual" : "Entre Fechas"}
                    </button>
                  ))}
                </div>

                {/* Date inputs */}
                {salesFilterMode === "diario" && (
                  <Input type="date" value={salesFilterDate} onChange={(ev) => setSalesFilterDate(ev.target.value)} className="h-8 w-40 text-xs" />
                )}
                {salesFilterMode === "mensual" && (
                  <Input type="month" value={salesFilterMonth} onChange={(ev) => setSalesFilterMonth(ev.target.value)} className="h-8 w-40 text-xs" />
                )}
                {salesFilterMode === "rango" && (
                  <div className="flex items-center gap-1.5">
                    <Input type="date" value={salesFilterFrom} onChange={(ev) => setSalesFilterFrom(ev.target.value)} className="h-8 w-36 text-xs" />
                    <span className="text-xs text-muted-foreground">—</span>
                    <Input type="date" value={salesFilterTo} onChange={(ev) => setSalesFilterTo(ev.target.value)} className="h-8 w-36 text-xs" />
                  </div>
                )}

                {/* Tipo comprobante filter */}
                <Select value={salesFilterComprobante} onValueChange={(v) => setSalesFilterComprobante(v ?? "all")}>
                  <SelectTrigger className="h-8 w-44 text-xs">
                    <SelectValue placeholder="Tipo comprobante" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los tipos</SelectItem>
                    <SelectItem value="Remito X">Remito X</SelectItem>
                    <SelectItem value="Factura B">Factura B</SelectItem>
                    <SelectItem value="Factura C">Factura C</SelectItem>
                    <SelectItem value="Nota de Crédito B">Nota de Crédito B</SelectItem>
                    <SelectItem value="Nota de Crédito C">Nota de Crédito C</SelectItem>
                    <SelectItem value="Nota de Débito B">Nota de Débito B</SelectItem>
                    <SelectItem value="Nota de Débito C">Nota de Débito C</SelectItem>
                  </SelectContent>
                </Select>

                {/* Count */}
                <span className="text-xs text-muted-foreground ml-auto">
                  {salesLoading ? "Cargando..." : `${recentSales.length} resultado${recentSales.length !== 1 ? "s" : ""}`}
                </span>
              </div>

              {/* Table */}
              {salesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : recentSales.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No hay ventas en este período</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-3 px-4 font-medium">Fecha</th>
                        <th className="text-left py-3 px-4 font-medium">N°</th>
                        <th className="text-left py-3 px-4 font-medium">Tipo</th>
                        <th className="text-left py-3 px-4 font-medium">Cliente</th>
                        <th className="text-left py-3 px-4 font-medium">Forma de pago</th>
                        <th className="text-right py-3 px-4 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentSales.map((sale) => (
                        <tr key={sale.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                          <td className="py-3 px-4 text-xs text-muted-foreground">
                            {new Date(sale.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-muted-foreground">#{sale.numero}</td>
                          <td className="py-3 px-4">
                            <Badge variant="outline" className="font-normal text-xs">{sale.tipo_comprobante}</Badge>
                          </td>
                          <td className="py-3 px-4 font-medium">{sale.clientes?.nombre || "—"}</td>
                          <td className="py-3 px-4">
                            <Badge variant="secondary" className="font-normal text-xs">
                              {sale.forma_pago === "Efectivo" && <Banknote className="w-3 h-3 mr-1" />}
                              {sale.forma_pago === "Tarjeta" && <CreditCard className="w-3 h-3 mr-1" />}
                              {sale.forma_pago}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-right font-semibold">{formatCurrency(sale.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Sales total */}
              {recentSales.length > 0 && !salesLoading && (
                <div className="flex justify-end pt-2 border-t">
                  <p className="text-sm">
                    <span className="text-muted-foreground">Total: </span>
                    <span className="font-bold">{formatCurrency(recentSales.reduce((a, s) => a + s.total, 0))}</span>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
