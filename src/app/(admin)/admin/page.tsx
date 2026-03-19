"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
  Eye,
  Store,
  CheckCircle,
  Printer,
  MapPin,
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

interface ClienteInfo {
  nombre: string;
  domicilio: string | null;
  localidad: string | null;
  telefono: string | null;
  saldo: number;
}

interface VentaItemRow {
  id: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  unidad_medida: string | null;
}

interface PedidoVenta {
  id: string;
  numero: string;
  fecha: string;
  forma_pago: string;
  total: number;
  estado: string;
  observacion: string | null;
  entregado: boolean;
  metodo_entrega: string | null;
  created_at: string;
  clientes: ClienteInfo | null;
  venta_items: VentaItemRow[];
}

interface EmpresaInfo {
  nombre: string | null;
  domicilio: string | null;
  telefono: string | null;
  cuit: string | null;
  situacion_iva: string | null;
}

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

  // ─── Pedidos Online state ───
  const [pedidosOnline, setPedidosOnline] = useState<PedidoVenta[]>([]);
  const [pedidoEntregaMap, setPedidoEntregaMap] = useState<Record<string, string>>({}); // numero -> fecha_entrega
  const [pedidoFilter, setPedidoFilter] = useState<"todos" | "envio" | "retiro">("todos");
  const [pedidoFechaFilter, setPedidoFechaFilter] = useState("");
  const [pedidoDetailOpen, setPedidoDetailOpen] = useState(false);
  const [pedidoDetail, setPedidoDetail] = useState<PedidoVenta | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [empresa, setEmpresa] = useState<EmpresaInfo | null>(null);
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

  // ─── Fetch pedidos online (separate from dashboard filters) ───
  const fetchPedidosOnline = useCallback(async () => {
    const { data: ventasOnline } = await supabase
      .from("ventas")
      .select("id, numero, fecha, forma_pago, total, estado, observacion, entregado, metodo_entrega, created_at, clientes(nombre, domicilio, localidad, telefono, saldo), venta_items(id, descripcion, cantidad, precio_unitario, subtotal, unidad_medida)")
      .eq("origen", "tienda")
      .eq("entregado", false)
      .neq("estado", "anulada")
      .order("created_at", { ascending: false });

    const rows = (ventasOnline || []) as unknown as PedidoVenta[];
    setPedidosOnline(rows);

    // Get delivery dates from pedidos_tienda
    const numeros = rows.map((v) => v.numero);
    if (numeros.length > 0) {
      const { data: pedidosTienda } = await supabase
        .from("pedidos_tienda")
        .select("numero, fecha_entrega")
        .in("numero", numeros);
      const map: Record<string, string> = {};
      (pedidosTienda || []).forEach((p: { numero: string; fecha_entrega: string | null }) => {
        if (p.fecha_entrega) map[p.numero] = p.fecha_entrega;
      });
      setPedidoEntregaMap(map);
    } else {
      setPedidoEntregaMap({});
    }
  }, []);

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

    // Ganancia
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
        const costoVenta = costoUnitario * unidadesPorPres;
        return acc + (precioUnitario - costoVenta) * cantidad;
      }, 0);
    }
    setGananciaPeriodo(gananciaTotal);

    // Capital en mercaderia
    const { data: prods } = await supabase.from("productos").select("stock, precio, costo").eq("activo", true).limit(10000);
    setCapitalMercaderia((prods || []).reduce((a, p) => a + p.stock * (p.costo || p.precio), 0));

    // Cuentas a cobrar
    const { data: cls } = await supabase.from("clientes").select("saldo").eq("activo", true);
    setCuentasCobrar((cls || []).reduce((a, c) => a + (c.saldo > 0 ? c.saldo : 0), 0));

    // Cuentas a pagar
    const { data: provs } = await supabase.from("proveedores").select("saldo").eq("activo", true);
    setCuentasPagar((provs || []).reduce((a, p) => a + (p.saldo > 0 ? p.saldo : 0), 0));

    // Monthly data (last 6 months)
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

    // Ventas por categoria
    const { data: ventasCat } = await supabase
      .from("venta_items")
      .select("subtotal, productos(categoria_id, categorias(nombre))")
      .gte("created_at", start + "T00:00:00")
      .lt("created_at", end + "T00:00:00");
    const catMap: Record<string, number> = {};
    (ventasCat || []).forEach((vi: any) => {
      const catName = vi.productos?.categorias?.nombre || "Sin categoria";
      catMap[catName] = (catMap[catName] || 0) + (vi.subtotal || 0);
    });
    setVentasPorCategoria(
      Object.entries(catMap)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
    );

    // Empresa info (for remito printing)
    const { data: empData } = await supabase.from("empresa").select("nombre, domicilio, telefono, cuit, situacion_iva").single();
    if (empData) setEmpresa(empData as EmpresaInfo);

    // Pedidos online
    await fetchPedidosOnline();

    setLoading(false);
  }, [getDateRange, fetchPedidosOnline]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ─── Pedido actions ───
  const handleMarkDelivered = async (venta: PedidoVenta) => {
    if (!confirm(`Marcar pedido #${venta.numero} como entregado?`)) return;
    setActionLoading(venta.id);
    await supabase.from("ventas").update({ entregado: true }).eq("id", venta.id);
    await supabase.from("pedidos_tienda").update({ estado: "entregado" }).eq("numero", venta.numero);
    setPedidosOnline((prev) => prev.filter((p) => p.id !== venta.id));
    setActionLoading(null);
  };

  const handlePrintRemito = (venta: PedidoVenta) => {
    const cliente = venta.clientes;
    const fechaEntrega = pedidoEntregaMap[venta.numero];
    const fechaEntregaStr = fechaEntrega
      ? new Date(fechaEntrega + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })
      : "—";

    const itemsHtml = venta.venta_items.map((item) => `
      <tr>
        <td style="padding:4px 6px;border-bottom:1px solid #eee">${item.cantidad}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #eee">${item.descripcion}</td>
        <td style="padding:4px 6px;text-align:center;border-bottom:1px solid #eee">${item.unidad_medida || "Un"}</td>
        <td style="padding:4px 6px;text-align:right;border-bottom:1px solid #eee">$${item.precio_unitario.toLocaleString("es-AR")}</td>
        <td style="padding:4px 6px;text-align:right;border-bottom:1px solid #eee">$${item.subtotal.toLocaleString("es-AR")}</td>
      </tr>
    `).join("");

    const html = `<!DOCTYPE html><html><head><title>Remito ${venta.numero}</title>
      <style>@page{size:A4;margin:10mm}body{font-family:Arial,sans-serif;font-size:11px;color:#000;margin:0;padding:8mm 10mm}
      @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>
      <div style="display:flex;border-bottom:2px solid #000;padding-bottom:6px;margin-bottom:8px">
        <div style="flex:1">
          <img src="https://www.dulcesur.com/assets/logotipo.png" alt="Logo" style="height:50px;margin-bottom:4px"/>
          <div style="font-size:9px;line-height:1.4">
            <div style="font-weight:bold">www.dulcesur.com</div>
            <div>${empresa?.domicilio || "Francisco Canaro 4012"} | Tel: ${empresa?.telefono || "116299-1571"}</div>
          </div>
        </div>
        <div style="width:50px;display:flex;flex-direction:column;align-items:center;border-left:2px solid #000;border-right:2px solid #000;padding:0 8px">
          <div style="font-size:28px;font-weight:bold;line-height:1">X</div>
          <div style="font-size:7px;text-align:center;line-height:1.2;margin-top:2px">Documento no valido como factura</div>
        </div>
        <div style="flex:1;padding-left:10px">
          <div style="font-size:14px;font-weight:bold;margin-bottom:4px">N° ${venta.numero}</div>
          <div style="font-size:9px;line-height:1.5">
            <div>Fecha: ${new Date(venta.fecha + "T12:00:00").toLocaleDateString("es-AR")}</div>
            <div>CUIT: ${empresa?.cuit || "20443387898"}</div>
            <div>Cond.IVA: ${empresa?.situacion_iva || "Monotributista Social"}</div>
          </div>
        </div>
      </div>
      <div style="border:1px solid #ccc;padding:6px 8px;margin-bottom:8px;font-size:10px;line-height:1.8">
        <div><b>Cliente:</b> ${cliente?.nombre || "Consumidor Final"} &nbsp;&nbsp; <b>Tel:</b> ${cliente?.telefono || "—"}</div>
        <div><b>Domicilio:</b> ${[cliente?.domicilio, cliente?.localidad].filter(Boolean).join(", ") || "—"}</div>
        <div><b>Forma de pago:</b> ${venta.forma_pago} &nbsp;&nbsp; <b>Entrega:</b> ${venta.metodo_entrega === "envio" ? "Envio a domicilio" : "Retiro en local"} &nbsp;&nbsp; <b>Fecha entrega:</b> ${fechaEntregaStr}</div>
        ${venta.observacion ? `<div><b>Obs:</b> ${venta.observacion}</div>` : ""}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:10px">
        <thead><tr style="border-bottom:1px solid #000;border-top:1px solid #000">
          <th style="text-align:left;padding:4px 6px">Cant.</th>
          <th style="text-align:left;padding:4px 6px">Producto</th>
          <th style="text-align:center;padding:4px 6px">U/Med</th>
          <th style="text-align:right;padding:4px 6px">Precio Un.</th>
          <th style="text-align:right;padding:4px 6px">Importe</th>
        </tr></thead>
        <tbody>${itemsHtml}</tbody>
      </table>
      <div style="border-top:2px solid #000;margin-top:20px;padding-top:8px;text-align:right;font-size:14px;font-weight:bold">
        Total: $${venta.total.toLocaleString("es-AR")}
      </div>
      ${cliente && cliente.saldo > 0 ? `<div style="margin-top:8px;text-align:right;font-size:11px;color:red;font-weight:bold">Saldo adeudado: $${cliente.saldo.toLocaleString("es-AR")}</div>` : ""}
    </body></html>`;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 200);
  };

  // ─── Filtered pedidos ───
  const filteredPedidos = pedidosOnline.filter((p) => {
    if (pedidoFilter === "envio" && p.metodo_entrega !== "envio") return false;
    if (pedidoFilter === "retiro" && p.metodo_entrega !== "retiro") return false;
    if (pedidoFechaFilter) {
      const fechaEntrega = pedidoEntregaMap[p.numero];
      if (!fechaEntrega || fechaEntrega !== pedidoFechaFilter) return false;
    }
    return true;
  });

  const totalPedidos = filteredPedidos.reduce((s, p) => s + p.total, 0);
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
        <Badge variant="outline" className="text-xs w-fit">DulceSur</Badge>
      </div>

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
          {/* Filters */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex border rounded-lg overflow-hidden">
              {([
                { key: "todos" as const, label: "Todos", count: pedidosOnline.length },
                { key: "envio" as const, label: "Envio", count: countEnvio },
                { key: "retiro" as const, label: "Retiro", count: countRetiro },
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
                  {tab.key === "envio" && <Truck className="w-3 h-3" />}
                  {tab.key === "retiro" && <Store className="w-3 h-3" />}
                  {tab.label}
                  {tab.count > 0 && (
                    <span className={`text-[10px] rounded-full px-1.5 font-bold ${
                      pedidoFilter === tab.key ? "bg-primary-foreground/20" : "bg-muted-foreground/20"
                    }`}>{tab.count}</span>
                  )}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground whitespace-nowrap">Fecha entrega:</span>
              <Input
                type="date"
                value={pedidoFechaFilter}
                onChange={(ev) => setPedidoFechaFilter(ev.target.value)}
                className="h-8 w-40 text-xs"
              />
              {pedidoFechaFilter && (
                <Button variant="ghost" size="sm" className="h-8 text-xs px-2" onClick={() => setPedidoFechaFilter("")}>
                  Limpiar
                </Button>
              )}
            </div>
          </div>

          {/* Pedidos list */}
          {filteredPedidos.length === 0 ? (
            <div className="text-center py-10">
              <ShoppingCart className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">
                {pedidosOnline.length === 0 ? "No hay pedidos online pendientes" : "No hay pedidos con los filtros seleccionados"}
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-sm px-1">
                <span className="text-muted-foreground">
                  {filteredPedidos.length} pedido{filteredPedidos.length !== 1 ? "s" : ""}
                </span>
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
                      <TableHead className="hidden md:table-cell">Entrega</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right w-[140px]">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
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
                      const fechaEntrega = pedidoEntregaMap[p.numero];
                      const fechaEntregaStr = fechaEntrega
                        ? new Date(fechaEntrega + "T12:00:00").toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" })
                        : "—";
                      const today = todayARG();
                      const isOverdue = fechaEntrega ? fechaEntrega < today : false;
                      const isToday = fechaEntrega === today;
                      const isLoading = actionLoading === p.id;

                      return (
                        <TableRow key={p.id} className={isOverdue ? "bg-red-50/50 dark:bg-red-950/10" : ""}>
                          <TableCell>
                            <div className={`w-8 h-8 rounded-md flex items-center justify-center ${
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
                          </TableCell>
                          <TableCell>
                            <div>
                              <span className="font-medium text-sm">{p.clientes?.nombre || "Sin cliente"}</span>
                              <span className="text-xs text-muted-foreground ml-2">#{p.numero}</span>
                            </div>
                            {p.clientes?.domicilio && p.metodo_entrega === "envio" && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                                <MapPin className="w-3 h-3 shrink-0" />
                                <span className="truncate max-w-[200px]">
                                  {[p.clientes.domicilio, p.clientes.localidad].filter(Boolean).join(", ")}
                                </span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <Badge variant="outline" className="text-[10px] font-normal">{p.forma_pago}</Badge>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="w-3 h-3" />
                              {dateStr} {timeStr}
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <span className={`text-xs font-medium ${
                              isOverdue ? "text-red-600" : isToday ? "text-primary font-semibold" : ""
                            }`}>
                              {isOverdue ? "Vencido - " : ""}{fechaEntregaStr}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="font-bold text-sm">{formatCurrency(p.total)}</span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                title="Ver detalle"
                                onClick={() => { setPedidoDetail(p); setPedidoDetailOpen(true); }}
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                title="Imprimir remito"
                                onClick={() => handlePrintRemito(p)}
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                title="Marcar entregado"
                                disabled={isLoading}
                                onClick={() => handleMarkDelivered(p)}
                              >
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
                  <p className="text-xs text-muted-foreground">Capital en mercaderia</p>
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
              <CardHeader><CardTitle className="text-base">Ventas y egresos — ultimos 6 meses</CardTitle></CardHeader>
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
                  <p className="text-sm text-muted-foreground text-center py-8">Sin ventas en este periodo</p>
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

          {/* Ventas por categoria */}
          <Card>
            <CardHeader><CardTitle className="text-base">Ventas por categoria — {periodLabel}</CardTitle></CardHeader>
            <CardContent>
              {ventasPorCategoria.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Sin datos en este periodo</p>
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
                  <span className="font-medium">{pedidoDetail.clientes?.nombre || "Sin cliente"}</span>
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
                  <span className="font-medium">{pedidoDetail.forma_pago}</span>
                </div>
                {pedidoDetail.clientes?.domicilio && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Direccion:</span>{" "}
                    <span className="font-medium">
                      {[pedidoDetail.clientes.domicilio, pedidoDetail.clientes.localidad].filter(Boolean).join(", ")}
                    </span>
                  </div>
                )}
                {pedidoDetail.clientes?.telefono && (
                  <div>
                    <span className="text-muted-foreground">Telefono:</span>{" "}
                    <span className="font-medium">{pedidoDetail.clientes.telefono}</span>
                  </div>
                )}
                {pedidoEntregaMap[pedidoDetail.numero] && (
                  <div>
                    <span className="text-muted-foreground">Fecha entrega:</span>{" "}
                    <span className="font-medium">
                      {new Date(pedidoEntregaMap[pedidoDetail.numero] + "T12:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })}
                    </span>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Pedido:</span>{" "}
                  <span className="font-medium">
                    {new Date(pedidoDetail.created_at).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" })}
                  </span>
                </div>
              </div>

              {pedidoDetail.observacion && (
                <div className="text-sm bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3 border border-amber-200 dark:border-amber-900/30">
                  <span className="text-muted-foreground font-medium">Observaciones:</span>{" "}
                  {pedidoDetail.observacion}
                </div>
              )}

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
                    {pedidoDetail.venta_items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <span className="font-medium text-sm">{item.descripcion}</span>
                        </TableCell>
                        <TableCell className="text-center">{item.cantidad}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.precio_unitario)}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(item.subtotal)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between pt-2 border-t">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => { setPedidoDetailOpen(false); handlePrintRemito(pedidoDetail); }}
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Imprimir Remito
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                    disabled={actionLoading === pedidoDetail.id}
                    onClick={() => { setPedidoDetailOpen(false); handleMarkDelivered(pedidoDetail); }}
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    Marcar Entregado
                  </Button>
                </div>
                <div className="text-lg font-bold">
                  Total: {formatCurrency(pedidoDetail.total)}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Hidden print container */}
      <div ref={printRef} className="hidden" />
    </div>
  );
}
