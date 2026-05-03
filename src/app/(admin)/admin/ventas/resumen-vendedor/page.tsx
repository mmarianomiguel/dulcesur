"use client";

import { showAdminToast } from "@/components/admin-toast";
import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Trophy,
  Download,
  Loader2,
  Users,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface Vendedor {
  id: string;
  nombre: string;
}

interface VentaRow {
  id: string;
  numero: string;
  tipo_comprobante: string;
  fecha: string;
  cliente_id: string;
  vendedor_id: string;
  forma_pago: string;
  total: number;
  estado: string;
  clientes: { id: string; nombre: string } | null;
  usuarios: { id: string; nombre: string } | null;
}

interface VendedorSummary {
  id: string;
  nombre: string;
  cantidadVentas: number;
  totalVendido: number;
  ticketPromedio: number;
  porcentajeTotal: number;
}

function getDefaultDateRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split("T")[0];
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .split("T")[0];
  return { from, to };
}

export default function ResumenVendedorPage() {
  const defaultRange = getDefaultDateRange();
  const [ventas, setVentas] = useState<VentaRow[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [fechaDesde, setFechaDesde] = useState(defaultRange.from);
  const [fechaHasta, setFechaHasta] = useState(defaultRange.to);
  const [selectedVendedor, setSelectedVendedor] = useState("todos");

  // Detail dialog
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailVendedor, setDetailVendedor] = useState<VendedorSummary | null>(
    null
  );

  const fetchVendedores = useCallback(async () => {
    const { data } = await supabase
      .from("usuarios")
      .select("id, nombre")
      .eq("rol", "vendedor")
      .eq("activo", true)
      .order("nombre");
    if (data) setVendedores(data);
  }, []);

  const fetchVentas = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("ventas")
      .select("*, clientes(id, nombre), usuarios(id, nombre)")
      .eq("estado", "cerrada")
      .gte("fecha", fechaDesde)
      .lte("fecha", fechaHasta);

    if (selectedVendedor !== "todos") {
      query = query.eq("vendedor_id", selectedVendedor);
    }

    const { data } = await query.order("fecha", { ascending: false });
    setVentas(data || []);
    setLoading(false);
  }, [fechaDesde, fechaHasta, selectedVendedor]);

  useEffect(() => {
    fetchVendedores();
  }, [fetchVendedores]);

  useEffect(() => {
    fetchVentas();
  }, [fetchVentas]);

  // Compute summaries
  const summaries = useMemo<VendedorSummary[]>(() => {
    const map = new Map<
      string,
      { nombre: string; total: number; count: number }
    >();
    for (const v of ventas) {
      const vid = v.vendedor_id;
      const nombre = v.usuarios?.nombre || "Sin vendedor";
      const existing = map.get(vid);
      if (existing) {
        existing.total += v.total;
        existing.count += 1;
      } else {
        map.set(vid, { nombre, total: v.total, count: 1 });
      }
    }
    const grandTotal = ventas.reduce((s, v) => s + v.total, 0);
    return Array.from(map.entries())
      .map(([id, d]) => ({
        id,
        nombre: d.nombre,
        cantidadVentas: d.count,
        totalVendido: d.total,
        ticketPromedio: d.count > 0 ? d.total / d.count : 0,
        porcentajeTotal: grandTotal > 0 ? (d.total / grandTotal) * 100 : 0,
      }))
      .sort((a, b) => b.totalVendido - a.totalVendido);
  }, [ventas]);

  const totalVendido = useMemo(
    () => ventas.reduce((s, v) => s + v.total, 0),
    [ventas]
  );
  const cantidadVentas = ventas.length;
  const ticketPromedio =
    cantidadVentas > 0 ? totalVendido / cantidadVentas : 0;
  const mejorVendedor = summaries.length > 0 ? summaries[0] : null;

  const chartData = useMemo(
    () =>
      summaries.map((s) => ({
        nombre: s.nombre,
        total: s.totalVendido,
      })),
    [summaries]
  );

  // Detail: ventas for selected vendedor
  const detailVentas = useMemo(() => {
    if (!detailVendedor) return [];
    return ventas.filter((v) => v.vendedor_id === detailVendedor.id);
  }, [ventas, detailVendedor]);

  function openDetail(summary: VendedorSummary) {
    setDetailVendedor(summary);
    setDetailOpen(true);
  }

  function exportCSV() {
    const header =
      "Vendedor,Cantidad Ventas,Total Vendido,Ticket Promedio,% del Total\n";
    const rows = summaries
      .map(
        (s) =>
          `"${s.nombre}",${s.cantidadVentas},${s.totalVendido.toFixed(2)},${s.ticketPromedio.toFixed(2)},${s.porcentajeTotal.toFixed(1)}`
      )
      .join("\n");
    const blob = new Blob([header + rows], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `resumen-vendedores-${fechaDesde}-${fechaHasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Resumen por Vendedor</h1>
            <p className="text-sm text-muted-foreground">Rendimiento de ventas por vendedor</p>
          </div>
        </div>
        <Button onClick={exportCSV} variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Desde</Label>
              <DateInput
                value={fechaDesde}
                onChange={setFechaDesde}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Hasta</Label>
              <DateInput
                value={fechaHasta}
                onChange={setFechaHasta}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Vendedor</Label>
              <Select
                value={selectedVendedor}
                onValueChange={(v) => setSelectedVendedor(v ?? "todos")}
              >
                <SelectTrigger className="h-9 rounded-full bg-muted/60 border-none px-3 gap-2 text-sm hover:bg-muted/80 transition-colors min-w-[180px]">
                  <Users className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="font-medium">
                    {selectedVendedor === "todos" ? "Todos" : (vendedores.find(v => v.id === selectedVendedor)?.nombre ?? "Todos")}
                  </span>
                </SelectTrigger>
                <SelectContent className="w-auto min-w-[180px] p-1">
                  <SelectItem value="todos">Todos</SelectItem>
                  {vendedores.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Vendido
                </CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-xl sm:text-2xl font-bold truncate">
                  {formatCurrency(totalVendido)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  Cantidad de Ventas
                </CardTitle>
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-xl sm:text-2xl font-bold">{cantidadVentas}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  Ticket Promedio
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(ticketPromedio)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  Mejor Vendedor
                </CardTitle>
                <Trophy className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-xl sm:text-2xl font-bold truncate">
                  {mejorVendedor?.nombre || "-"}
                </div>
                {mejorVendedor && (
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(mejorVendedor.totalVendido)}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Bar Chart */}
          {chartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Ventas por Vendedor</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="nombre"
                        tick={{ fontSize: 12 }}
                        interval={0}
                        angle={-25}
                        textAnchor="end"
                        height={80}
                      />
                      <YAxis
                        tickFormatter={(v) => formatCurrency(v)}
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip
                        formatter={(value) => formatCurrency(Number(value))}
                      />
                      <Bar
                        dataKey="total"
                        fill="hsl(var(--primary))"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Summary Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Resumen por Vendedor
              </CardTitle>
            </CardHeader>
            <CardContent>
              {summaries.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No hay ventas en el periodo seleccionado
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-3 font-medium">Vendedor</th>
                        <th className="pb-3 font-medium text-center">
                          Cant. Ventas
                        </th>
                        <th className="pb-3 font-medium text-right">
                          Total Vendido
                        </th>
                        <th className="pb-3 font-medium text-right">
                          Ticket Promedio
                        </th>
                        <th className="pb-3 font-medium text-right">
                          % del Total
                        </th>
                        <th className="pb-3 font-medium text-center">
                          Acciones
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {summaries.map((s) => (
                        <tr
                          key={s.id}
                          className="border-b hover:bg-muted/50 cursor-pointer"
                          onClick={() => openDetail(s)}
                        >
                          <td className="py-3 font-medium">{s.nombre}</td>
                          <td className="py-3 text-center">
                            <Badge variant="secondary">
                              {s.cantidadVentas}
                            </Badge>
                          </td>
                          <td className="py-3 text-right">
                            {formatCurrency(s.totalVendido)}
                          </td>
                          <td className="py-3 text-right">
                            {formatCurrency(s.ticketPromedio)}
                          </td>
                          <td className="py-3 text-right">
                            {s.porcentajeTotal.toFixed(1)}%
                          </td>
                          <td className="py-3 text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                openDetail(s);
                              }}
                            >
                              Ver detalle
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Detail Dialog */}
          <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  Ventas de {detailVendedor?.nombre || ""}
                </DialogTitle>
              </DialogHeader>
              {detailVendedor && (
                <div className="space-y-4 min-w-0">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">
                        Total Vendido
                      </p>
                      <p className="text-lg font-bold">
                        {formatCurrency(detailVendedor.totalVendido)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">
                        Cantidad
                      </p>
                      <p className="text-lg font-bold">
                        {detailVendedor.cantidadVentas}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">
                        Ticket Promedio
                      </p>
                      <p className="text-lg font-bold">
                        {formatCurrency(detailVendedor.ticketPromedio)}
                      </p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="pb-2 font-medium">Numero</th>
                          <th className="pb-2 font-medium">Fecha</th>
                          <th className="pb-2 font-medium">Cliente</th>
                          <th className="pb-2 font-medium">Tipo</th>
                          <th className="pb-2 font-medium">Forma Pago</th>
                          <th className="pb-2 font-medium text-right">
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailVentas.map((v) => (
                          <tr key={v.id} className="border-b">
                            <td className="py-2">{v.numero}</td>
                            <td className="py-2">
                              {new Date(v.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                            </td>
                            <td className="py-2">
                              {v.clientes?.nombre || "-"}
                            </td>
                            <td className="py-2">
                              <Badge variant="outline">
                                {v.tipo_comprobante}
                              </Badge>
                            </td>
                            <td className="py-2">{v.forma_pago}</td>
                            <td className="py-2 text-right font-medium">
                              {formatCurrency(v.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
