"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Receipt,
  Users,
  Package,
  CreditCard,
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(value);
}

function todayARG() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
}

const PIE_COLORS = ["oklch(0.55 0.2 264)", "oklch(0.65 0.18 160)", "oklch(0.7 0.15 50)", "oklch(0.6 0.2 300)"];

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
  const [paymentBreakdown, setPaymentBreakdown] = useState<{ name: string; value: number }[]>([]);
  const [monthlyData, setMonthlyData] = useState<{ name: string; ventas: number; egresos: number }[]>([]);
  const [ventasPorCategoria, setVentasPorCategoria] = useState<{ name: string; value: number }[]>([]);

  // Web orders
  interface PedidoItemWeb {
    id: string;
    nombre: string;
    cantidad: number;
    precio_unitario: number;
    subtotal: number;
    presentacion: string | null;
  }
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
    direccion: string | null;
    localidad: string | null;
    telefono: string | null;
    observaciones: string | null;
  }
  const [allPedidosWeb, setAllPedidosWeb] = useState<PedidoWeb[]>([]);
  const [selectedDayTab, setSelectedDayTab] = useState<string>("_today");
  const [pedidoDetailOpen, setPedidoDetailOpen] = useState(false);
  const [pedidoDetail, setPedidoDetail] = useState<PedidoWeb | null>(null);
  const [pedidoItems, setPedidoItems] = useState<PedidoItemWeb[]>([]);
  const [pedidoItemsLoading, setPedidoItemsLoading] = useState(false);

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
    const { data: prods } = await supabase.from("productos").select("stock, precio, costo").eq("activo", true).limit(10000);
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
      .select("id, numero, nombre_cliente, metodo_entrega, metodo_pago, total, fecha_entrega, created_at, estado, direccion, localidad, telefono, observaciones")
      .in("estado", ["pendiente", "confirmado"])
      .order("created_at", { ascending: false });

    const pedidos = (allPedidos as PedidoWeb[]) || [];
    setAllPedidosWeb(pedidos);

    setLoading(false);
  }, [getDateRange]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleViewPedido = async (pedido: PedidoWeb) => {
    setPedidoDetail(pedido);
    setPedidoDetailOpen(true);
    setPedidoItemsLoading(true);
    const { data } = await supabase
      .from("pedido_tienda_items")
      .select("id, nombre, cantidad, precio_unitario, subtotal, presentacion")
      .eq("pedido_id", pedido.id);
    setPedidoItems((data as PedidoItemWeb[]) || []);
    setPedidoItemsLoading(false);
  };

  const ganancia = gananciaPeriodo;

  const periodLabel = filterMode === "diario" ? "del día" : filterMode === "mensual" ? "del mes" : "del período";

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Dashboard</h1>
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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

          {/* Pedidos Online — por día de entrega */}
          {(() => {
            const today = todayARG();

            // Build day tabs: pendientes + today + next 5 days
            const dayTabs: { key: string; label: string; sublabel: string; isToday?: boolean; isPending?: boolean }[] = [];

            // Pending (overdue) orders
            const pendientes = allPedidosWeb.filter((p) => {
              if (!p.fecha_entrega) return true; // sin fecha = pendiente
              return p.fecha_entrega < today;
            });
            dayTabs.push({ key: "_pending", label: "Pendientes", sublabel: `${pendientes.length}`, isPending: true });

            // Today + next 5 days
            for (let i = 0; i <= 5; i++) {
              const d = new Date(today + "T12:00:00");
              d.setDate(d.getDate() + i);
              const dateStr = d.toISOString().split("T")[0];
              const dayName = d.toLocaleDateString("es-AR", { weekday: "short", timeZone: "America/Argentina/Buenos_Aires" });
              const dayNum = d.toLocaleDateString("es-AR", { day: "numeric", month: "short", timeZone: "America/Argentina/Buenos_Aires" });
              dayTabs.push({
                key: dateStr,
                label: i === 0 ? "Hoy" : i === 1 ? "Mañana" : dayName.charAt(0).toUpperCase() + dayName.slice(1),
                sublabel: dayNum,
                isToday: i === 0,
              });
            }

            // Count orders per tab
            const countByTab: Record<string, number> = {};
            for (const tab of dayTabs) {
              if (tab.key === "_pending") {
                countByTab[tab.key] = pendientes.length;
              } else {
                countByTab[tab.key] = allPedidosWeb.filter((p) => p.fecha_entrega === tab.key).length;
              }
            }

            // Resolve selected tab — default to today
            const activeTab = selectedDayTab === "_today" ? today : selectedDayTab;
            const effectiveTab = dayTabs.find((t) => t.key === activeTab) ? activeTab : today;

            // Filter orders for active tab
            const filteredPedidos = effectiveTab === "_pending"
              ? pendientes
              : allPedidosWeb.filter((p) => p.fecha_entrega === effectiveTab);

            const tabTotal = filteredPedidos.reduce((s, p) => s + p.total, 0);

            return (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <ShoppingCart className="w-4 h-4 text-primary" />
                      Pedidos Online
                      {allPedidosWeb.length > 0 && (
                        <Badge variant="secondary" className="text-xs">{allPedidosWeb.length} total</Badge>
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
                            isActive
                              ? tab.isPending ? "text-red-700 dark:text-red-400" : "text-primary"
                              : "text-muted-foreground"
                          }`}>
                            {tab.label}
                          </span>
                          <span className={`text-[10px] ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                            {tab.isPending ? (
                              count > 0 ? <AlertTriangle className="w-3 h-3 text-red-500 inline" /> : "—"
                            ) : tab.sublabel}
                          </span>
                          {count > 0 && (
                            <span className={`mt-0.5 text-[10px] font-bold rounded-full px-1.5 ${
                              isActive
                                ? tab.isPending
                                  ? "bg-red-500 text-white"
                                  : "bg-primary text-primary-foreground"
                                : "bg-muted-foreground/20 text-muted-foreground"
                            }`}>
                              {count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Orders for selected day */}
                  {filteredPedidos.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-muted-foreground">
                        {effectiveTab === "_pending"
                          ? "No hay pedidos pendientes de días anteriores"
                          : "No hay pedidos para este día"}
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between text-sm px-1">
                        <span className="text-muted-foreground">
                          {filteredPedidos.length} pedido{filteredPedidos.length !== 1 ? "s" : ""}
                        </span>
                        <span className="font-bold">{formatCurrency(tabTotal)}</span>
                      </div>
                      <div className="space-y-2">
                        {filteredPedidos.map((p) => {
                          const createdDate = new Date(p.created_at);
                          const dateStr = createdDate.toLocaleDateString("es-AR", {
                            day: "2-digit", month: "2-digit",
                            timeZone: "America/Argentina/Buenos_Aires",
                          });
                          const timeStr = createdDate.toLocaleTimeString("es-AR", {
                            hour: "2-digit", minute: "2-digit",
                            timeZone: "America/Argentina/Buenos_Aires",
                          });
                          const isOverdue = effectiveTab === "_pending";

                          return (
                            <div
                              key={p.id}
                              className={`rounded-lg border px-4 py-3 transition-colors hover:bg-muted/30 cursor-pointer ${
                                isOverdue ? "border-red-200 dark:border-red-900/30" : ""
                              }`}
                              onClick={() => handleViewPedido(p)}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                  <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${
                                    p.metodo_entrega === "envio"
                                      ? "bg-blue-100 dark:bg-blue-900/30"
                                      : "bg-emerald-100 dark:bg-emerald-900/30"
                                  }`}>
                                    {p.metodo_entrega === "envio" ? (
                                      <Truck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                                    ) : (
                                      <Store className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-sm truncate">{p.nombre_cliente}</span>
                                      <span className="font-mono text-xs text-muted-foreground">#{p.numero}</span>
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                                      <span className="flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        Pedido {dateStr} {timeStr}
                                      </span>
                                      {isOverdue && p.fecha_entrega && (
                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-red-300 text-red-600">
                                          Entrega era {new Date(p.fecha_entrega + "T12:00:00").toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" })}
                                        </Badge>
                                      )}
                                      {p.estado === "confirmado" && (
                                        <Badge className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400">
                                          Confirmado
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <span className="font-bold text-sm shrink-0">{formatCurrency(p.total)}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })()}
        </>
      )}

      {/* Pedido Detail Dialog */}
      <Dialog open={pedidoDetailOpen} onOpenChange={setPedidoDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              Pedido #{pedidoDetail?.numero}
            </DialogTitle>
          </DialogHeader>
          {pedidoDetail && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3 text-sm bg-muted/50 rounded-lg p-4">
                <div>
                  <span className="text-muted-foreground">Cliente:</span>{" "}
                  <span className="font-medium">{pedidoDetail.nombre_cliente}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Estado:</span>{" "}
                  <Badge variant="secondary" className="text-xs ml-1">{pedidoDetail.estado}</Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Entrega:</span>{" "}
                  <span className="font-medium">{pedidoDetail.metodo_entrega === "envio" ? "Envio a domicilio" : "Retiro en local"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Pago:</span>{" "}
                  <span className="font-medium">{pedidoDetail.metodo_pago || "---"}</span>
                </div>
                {pedidoDetail.direccion && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Direccion:</span>{" "}
                    <span className="font-medium">
                      {[pedidoDetail.direccion, pedidoDetail.localidad].filter(Boolean).join(", ")}
                    </span>
                  </div>
                )}
                {pedidoDetail.telefono && (
                  <div>
                    <span className="text-muted-foreground">Telefono:</span>{" "}
                    <span className="font-medium">{pedidoDetail.telefono}</span>
                  </div>
                )}
                {pedidoDetail.fecha_entrega && (
                  <div>
                    <span className="text-muted-foreground">Fecha entrega:</span>{" "}
                    <span className="font-medium">
                      {new Date(pedidoDetail.fecha_entrega + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                    </span>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Creado:</span>{" "}
                  <span className="font-medium">
                    {new Date(pedidoDetail.created_at).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" })}
                  </span>
                </div>
              </div>

              {pedidoDetail.observaciones && (
                <div className="text-sm bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3 border border-amber-200 dark:border-amber-900/30">
                  <span className="text-muted-foreground font-medium">Observaciones:</span>{" "}
                  {pedidoDetail.observaciones}
                </div>
              )}

              {pedidoItemsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead className="text-center">Cant.</TableHead>
                        <TableHead className="text-right">Precio Unit.</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pedidoItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <span className="font-medium text-sm">{item.nombre}</span>
                            {item.presentacion && item.presentacion !== "unidad" && (
                              <span className="text-xs text-muted-foreground ml-1">({item.presentacion})</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">{item.cantidad}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.precio_unitario)}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(item.subtotal)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="flex justify-end pt-2 border-t">
                <div className="text-lg font-bold">
                  Total: {formatCurrency(pedidoDetail.total)}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
