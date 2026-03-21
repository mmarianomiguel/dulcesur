"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart3, TrendingUp, TrendingDown, DollarSign, Package, ShoppingCart,
  Loader2, Download, Calendar, Filter, ChevronDown, ChevronRight, Search, X,
} from "lucide-react";

function fc(v: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(v);
}

interface VentaRow { id: string; fecha: string; total: number; forma_pago: string; tipo_comprobante: string; created_at: string; cliente_id: string | null; origen: string | null; clientes: { nombre: string } | null; }
interface CompraRow { id: string; fecha: string; total: number; forma_pago: string; }
interface VentaItemDetail { venta_id: string; producto_id: string; descripcion: string; cantidad: number; precio_unitario: number; subtotal: number; unidades_por_presentacion: number; productos: { costo: number; nombre: string } | null; }
interface ClienteOption { id: string; nombre: string; }

export default function ReportesPage() {
  const [tab, setTab] = useState("ventas");
  const [desde, setDesde] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [hasta, setHasta] = useState(() => new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(false);

  // Ventas report
  const [ventas, setVentas] = useState<VentaRow[]>([]);
  const [ventaItems, setVentaItems] = useState<VentaItemDetail[]>([]);

  // Ventas filters
  const [ventaDateMode, setVentaDateMode] = useState<"dia" | "mensual" | "entre_fechas">("mensual");
  const [ventaTipo, setVentaTipo] = useState("todos");
  const [ventaClienteId, setVentaClienteId] = useState("");
  const [ventaClienteSearch, setVentaClienteSearch] = useState("");
  const [clienteOptions, setClienteOptions] = useState<ClienteOption[]>([]);
  const [showClienteDropdown, setShowClienteDropdown] = useState(false);
  const clienteDropdownRef = useRef<HTMLDivElement>(null);

  // Expanded sale rows
  const [expandedVentas, setExpandedVentas] = useState<Set<string>>(new Set());

  // Compras report
  const [compras, setCompras] = useState<CompraRow[]>([]);

  // Stock report
  const [productos, setProductos] = useState<{ id: string; nombre: string; codigo: string; stock: number; precio: number; costo: number; categoria_id: string | null; subcategoria_id: string | null; marca_id: string | null; }[]>([]);
  const [categorias, setCategorias] = useState<{ id: string; nombre: string }[]>([]);
  const [subcategorias, setSubcategorias] = useState<{ id: string; nombre: string }[]>([]);
  const [marcas, setMarcas] = useState<{ id: string; nombre: string }[]>([]);
  const [stockFilterCat, setStockFilterCat] = useState("");
  const [stockFilterSubcat, setStockFilterSubcat] = useState("");
  const [stockFilterMarca, setStockFilterMarca] = useState("");
  // Searchable dropdown states for stock filters
  const [stockCatSearch, setStockCatSearch] = useState("");
  const [stockCatOpen, setStockCatOpen] = useState(false);
  const [stockSubcatSearch, setStockSubcatSearch] = useState("");
  const [stockSubcatOpen, setStockSubcatOpen] = useState(false);
  const [stockMarcaSearch, setStockMarcaSearch] = useState("");
  const [stockMarcaOpen, setStockMarcaOpen] = useState(false);
  const stockCatRef = useRef<HTMLDivElement>(null);
  const stockSubcatRef = useRef<HTMLDivElement>(null);
  const stockMarcaRef = useRef<HTMLDivElement>(null);

  // Compute effective date range based on ventaDateMode
  const effectiveDates = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    if (ventaDateMode === "dia") {
      return { desde: today, hasta: today };
    } else if (ventaDateMode === "mensual") {
      const d = new Date(); d.setDate(1);
      return { desde: d.toISOString().split("T")[0], hasta: today };
    }
    return { desde, hasta };
  }, [ventaDateMode, desde, hasta]);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    const { desde: dEff, hasta: hEff } = effectiveDates;

    const [{ data: vts }, { data: cmps }, { data: prods }] = await Promise.all([
      supabase.from("ventas").select("id, fecha, total, forma_pago, tipo_comprobante, created_at, cliente_id, origen, estado, clientes(nombre)")
        .gte("fecha", dEff).lte("fecha", hEff)
        .not("tipo_comprobante", "ilike", "Nota de Crédito%")
        .neq("estado", "anulada")
        .order("fecha", { ascending: false }),
      supabase.from("compras").select("id, fecha, total, forma_pago")
        .gte("fecha", dEff).lte("fecha", hEff)
        .order("fecha", { ascending: false }),
      supabase.from("productos").select("id, nombre, codigo, stock, precio, costo, categoria_id, subcategoria_id, marca_id").eq("activo", true).order("nombre").limit(10000),
    ]);

    setVentas((vts || []).map((v: any) => ({ ...v, clientes: Array.isArray(v.clientes) ? v.clientes[0] || null : v.clientes })) as VentaRow[]);
    setCompras((cmps || []) as CompraRow[]);
    setProductos(prods || []);

    // Fetch venta items for profit calc
    if (vts && vts.length > 0) {
      const ids = vts.map((v: any) => v.id);
      const { data: items } = await supabase
        .from("venta_items")
        .select("venta_id, producto_id, descripcion, cantidad, precio_unitario, descuento, subtotal, unidades_por_presentacion, presentacion, productos(costo, nombre)")
        .in("venta_id", ids);
      setVentaItems((items || []) as any[]);
    } else {
      setVentaItems([]);
    }

    setLoading(false);
  }, [effectiveDates]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  // Fetch clientes for filter dropdown
  useEffect(() => {
    supabase.from("clientes").select("id, nombre").eq("activo", true).order("nombre").then(({ data }) => {
      setClienteOptions(data || []);
    });
  }, []);

  useEffect(() => {
    Promise.all([
      supabase.from("categorias").select("id, nombre").order("nombre"),
      supabase.from("subcategorias").select("id, nombre").order("nombre"),
      supabase.from("marcas").select("id, nombre").order("nombre"),
    ]).then(([{ data: cats }, { data: subcats }, { data: mrs }]) => {
      setCategorias(cats || []);
      setSubcategorias(subcats || []);
      setMarcas(mrs || []);
    });
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (clienteDropdownRef.current && !clienteDropdownRef.current.contains(e.target as Node)) setShowClienteDropdown(false);
      if (stockCatRef.current && !stockCatRef.current.contains(e.target as Node)) setStockCatOpen(false);
      if (stockSubcatRef.current && !stockSubcatRef.current.contains(e.target as Node)) setStockSubcatOpen(false);
      if (stockMarcaRef.current && !stockMarcaRef.current.contains(e.target as Node)) setStockMarcaOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // --- Filtered ventas ---
  const filteredVentas = useMemo(() => {
    return ventas.filter((v) => {
      // Type filter
      if (ventaTipo === "pedido_web" && v.origen !== "tienda") return false;
      if (ventaTipo === "remito_x" && v.tipo_comprobante !== "Remito X") return false;
      // Client filter
      if (ventaClienteId && v.cliente_id !== ventaClienteId) return false;
      return true;
    });
  }, [ventas, ventaTipo, ventaClienteId]);

  // Filtered client options for searchable dropdown
  const filteredClienteOptions = useMemo(() => {
    if (!ventaClienteSearch) return clienteOptions;
    const q = ventaClienteSearch.toLowerCase();
    return clienteOptions.filter((c) => c.nombre.toLowerCase().includes(q));
  }, [clienteOptions, ventaClienteSearch]);

  // --- Derived ---
  const totalVentas = useMemo(() => ventas.reduce((a, v) => a + v.total, 0), [ventas]);
  const totalCompras = useMemo(() => compras.reduce((a, c) => a + c.total, 0), [compras]);
  const getUnidadesPres = (item: any) => {
    let u = Number(item.unidades_por_presentacion) || 1;
    const presTxt = ((item as any).presentacion || "").toLowerCase();
    if (presTxt.includes("medio") && u === 1) u = 0.5;
    return u;
  };
  const ganancia = useMemo(() => ventaItems.reduce((a, item: any) => {
    const costoU = item.productos?.costo || 0;
    const unidadesPres = getUnidadesPres(item);
    const descPct = Number(item.descuento) || 0;
    const precioVenta = item.precio_unitario * (1 - descPct / 100);
    return a + (precioVenta - costoU * unidadesPres) * item.cantidad;
  }, 0), [ventaItems]);

  const ventasPorPago = useMemo(() => {
    const map: Record<string, number> = {};
    ventas.forEach((v) => { map[v.forma_pago] = (map[v.forma_pago] || 0) + v.total; });
    return map;
  }, [ventas]);

  const ventasPorDia = useMemo(() => {
    const map: Record<string, number> = {};
    ventas.forEach((v) => { map[v.fecha] = (map[v.fecha] || 0) + v.total; });
    return map;
  }, [ventas]);

  const filteredProductos = useMemo(() => productos.filter((p) => {
    if (stockFilterCat && p.categoria_id !== stockFilterCat) return false;
    if (stockFilterSubcat && p.subcategoria_id !== stockFilterSubcat) return false;
    if (stockFilterMarca && p.marca_id !== stockFilterMarca) return false;
    return true;
  }), [productos, stockFilterCat, stockFilterSubcat, stockFilterMarca]);
  const stockCosto = useMemo(() => filteredProductos.reduce((a, p) => a + p.stock * p.costo, 0), [filteredProductos]);
  const stockVenta = useMemo(() => filteredProductos.reduce((a, p) => a + p.stock * p.precio, 0), [filteredProductos]);
  const sinStock = useMemo(() => productos.filter((p) => p.stock <= 0).length, [productos]);

  // Items grouped by venta_id for expansion
  const ventaItemsMap = useMemo(() => {
    const map: Record<string, VentaItemDetail[]> = {};
    ventaItems.forEach((item) => {
      if (!map[item.venta_id]) map[item.venta_id] = [];
      map[item.venta_id].push(item);
    });
    return map;
  }, [ventaItems]);

  // Profit for filtered ventas
  const filteredVentasTotal = useMemo(() => filteredVentas.reduce((a, v) => a + v.total, 0), [filteredVentas]);
  const filteredVentasGanancia = useMemo(() => {
    const filteredIds = new Set(filteredVentas.map((v) => v.id));
    return ventaItems.filter((item) => filteredIds.has(item.venta_id)).reduce((a, item: any) => {
      const costoU = item.productos?.costo || 0;
      const unidadesPres = getUnidadesPres(item);
      const descPct = Number(item.descuento) || 0;
      const precioVenta = item.precio_unitario * (1 - descPct / 100);
      return a + (precioVenta - costoU * unidadesPres) * item.cantidad;
    }, 0);
  }, [filteredVentas, ventaItems]);

  const toggleExpand = (id: string) => {
    setExpandedVentas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const calcItemProfit = (item: VentaItemDetail) => {
    const costoU = item.productos?.costo || 0;
    let unidadesPres = Number(item.unidades_por_presentacion) || 1;
    const presTxt = ((item as any).presentacion || "").toLowerCase();
    if (presTxt.includes("medio") && unidadesPres === 1) unidadesPres = 0.5;
    const descPct = Number((item as any).descuento) || 0;
    const precioVenta = item.precio_unitario * (1 - descPct / 100);
    return (precioVenta - costoU * unidadesPres) * item.cantidad;
  };

  const calcVentaProfit = (ventaId: string) => {
    const items = ventaItemsMap[ventaId] || [];
    return items.reduce((a, item) => a + calcItemProfit(item), 0);
  };

  const exportCSV = (name: string, header: string, rows: string) => {
    const blob = new Blob([header + "\n" + rows], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name}_${effectiveDates.desde}_${effectiveDates.hasta}.csv`;
    a.click();
  };

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Reportes</h1>
          <p className="text-muted-foreground text-sm">Analisis de ventas, compras y stock</p>
        </div>
        <div className="flex items-center gap-2">
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-9 w-36" />
          <span className="text-muted-foreground text-sm">a</span>
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-9 w-36" />
          <Button size="sm" onClick={fetchReports} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Filter className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card><CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">Ventas</p>
          <p className="text-xl font-bold">{fc(totalVentas)}</p>
          <p className="text-xs text-muted-foreground">{ventas.length} operaciones</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">Compras</p>
          <p className="text-xl font-bold">{fc(totalCompras)}</p>
          <p className="text-xs text-muted-foreground">{compras.length} operaciones</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">Ganancia</p>
          <p className={`text-xl font-bold ${ganancia >= 0 ? "text-emerald-600" : "text-red-500"}`}>{fc(ganancia)}</p>
          <p className="text-xs text-muted-foreground">{totalVentas > 0 ? `${((ganancia / totalVentas) * 100).toFixed(1)}% margen` : "—"}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">Stock (costo)</p>
          <p className="text-xl font-bold">{fc(stockCosto)}</p>
          <p className="text-xs text-muted-foreground">{productos.length} productos</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">Stock (venta)</p>
          <p className="text-xl font-bold">{fc(stockVenta)}</p>
          <p className="text-xs text-red-500">{sinStock} sin stock</p>
        </CardContent></Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="ventas">Ventas</TabsTrigger>
          <TabsTrigger value="compras">Compras</TabsTrigger>
          <TabsTrigger value="stock">Stock Valorizado</TabsTrigger>
          <TabsTrigger value="pagos">Por Forma de Pago</TabsTrigger>
        </TabsList>

        <TabsContent value="ventas" className="mt-4 space-y-4">
          {/* Ventas filters */}
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Periodo</Label>
              <Select value={ventaDateMode} onValueChange={(v) => setVentaDateMode(v as any)}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Período" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dia">Hoy</SelectItem>
                  <SelectItem value="mensual">Mensual</SelectItem>
                  <SelectItem value="entre_fechas">Entre fechas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {ventaDateMode === "entre_fechas" && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Desde</Label>
                  <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-9 w-36" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Hasta</Label>
                  <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-9 w-36" />
                </div>
              </>
            )}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Tipo</Label>
              <Select value={ventaTipo} onValueChange={(v) => setVentaTipo(v || "todos")}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="pedido_web">Pedido Web</SelectItem>
                  <SelectItem value="remito_x">Remito X</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 relative" ref={clienteDropdownRef}>
              <Label className="text-xs text-muted-foreground">Cliente</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Todos los clientes"
                  value={ventaClienteSearch}
                  onChange={(e) => {
                    setVentaClienteSearch(e.target.value);
                    setShowClienteDropdown(true);
                    if (!e.target.value) setVentaClienteId("");
                  }}
                  onFocus={() => setShowClienteDropdown(true)}
                  className="h-9 w-52 pl-8"
                />
                {ventaClienteId && (
                  <button
                    onClick={() => { setVentaClienteId(""); setVentaClienteSearch(""); }}
                    className="absolute right-2 top-2 text-muted-foreground hover:text-foreground text-xs"
                  >
                    x
                  </button>
                )}
              </div>
              {showClienteDropdown && (
                <div className="absolute z-50 top-full mt-1 w-52 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto">
                  <div
                    className="px-3 py-1.5 text-sm hover:bg-muted cursor-pointer text-muted-foreground"
                    onClick={() => { setVentaClienteId(""); setVentaClienteSearch(""); setShowClienteDropdown(false); }}
                  >
                    Todos los clientes
                  </div>
                  {filteredClienteOptions.map((c) => (
                    <div
                      key={c.id}
                      className={`px-3 py-1.5 text-sm hover:bg-muted cursor-pointer ${ventaClienteId === c.id ? "bg-muted font-medium" : ""}`}
                      onClick={() => { setVentaClienteId(c.id); setVentaClienteSearch(c.nombre); setShowClienteDropdown(false); }}
                    >
                      {c.nombre}
                    </div>
                  ))}
                  {filteredClienteOptions.length === 0 && (
                    <div className="px-3 py-1.5 text-sm text-muted-foreground">Sin resultados</div>
                  )}
                </div>
              )}
            </div>
            <Button size="sm" onClick={fetchReports} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Filter className="w-4 h-4" />}
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportCSV("ventas", "Fecha,Tipo,Cliente,Forma Pago,Total,Ganancia", filteredVentas.map((v) => `${v.fecha},${v.tipo_comprobante},${v.clientes?.nombre || "S/C"},${v.forma_pago},${v.total},${calcVentaProfit(v.id).toFixed(2)}`).join("\n"))}>
              <Download className="w-4 h-4 mr-1.5" />CSV
            </Button>
          </div>

          {/* Filtered summary */}
          <div className="flex gap-4 text-sm">
            <span className="text-muted-foreground">{filteredVentas.length} ventas</span>
            <span className="font-semibold">{fc(filteredVentasTotal)}</span>
            <span className={`font-semibold ${filteredVentasGanancia >= 0 ? "text-emerald-600" : "text-red-500"}`}>
              Ganancia: {fc(filteredVentasGanancia)}
            </span>
          </div>

          <div className="border rounded-lg overflow-hidden max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background z-10">
                <tr className="border-b bg-muted/50 text-muted-foreground">
                  <th className="w-8 py-2 px-2"></th>
                  <th className="text-left py-2 px-3 font-medium">Fecha</th>
                  <th className="text-left py-2 px-3 font-medium">Tipo</th>
                  <th className="text-left py-2 px-3 font-medium">Cliente</th>
                  <th className="text-left py-2 px-3 font-medium">Forma Pago</th>
                  <th className="text-right py-2 px-3 font-medium">Total</th>
                  <th className="text-right py-2 px-3 font-medium">Ganancia</th>
                </tr>
              </thead>
              <tbody>
                {filteredVentas.map((v) => {
                  const isExpanded = expandedVentas.has(v.id);
                  const items = ventaItemsMap[v.id] || [];
                  const ventaProfit = calcVentaProfit(v.id);
                  return (
                    <React.Fragment key={v.id}>
                      <tr
                        className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                        onClick={() => toggleExpand(v.id)}
                      >
                        <td className="py-2 px-2 text-muted-foreground">
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </td>
                        <td className="py-2 px-3">{new Date(v.fecha + "T12:00:00").toLocaleDateString("es-AR")}</td>
                        <td className="py-2 px-3"><Badge variant="secondary" className="text-xs">{v.tipo_comprobante}</Badge></td>
                        <td className="py-2 px-3 text-muted-foreground">{v.clientes?.nombre || "—"}</td>
                        <td className="py-2 px-3"><Badge variant="outline" className="text-xs">{v.forma_pago}</Badge></td>
                        <td className="py-2 px-3 text-right font-semibold">{fc(v.total)}</td>
                        <td className={`py-2 px-3 text-right font-semibold ${ventaProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                          {fc(ventaProfit)}
                        </td>
                      </tr>
                      {isExpanded && items.length > 0 && (
                        <tr>
                          <td colSpan={7} className="p-0">
                            <div className="bg-muted/20 border-b">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-muted-foreground border-b border-muted">
                                    <th className="text-left py-1.5 px-4 pl-12 font-medium">Producto</th>
                                    <th className="text-center py-1.5 px-3 font-medium">Cant.</th>
                                    <th className="text-right py-1.5 px-3 font-medium">Precio Venta</th>
                                    <th className="text-right py-1.5 px-3 font-medium">Costo</th>
                                    <th className="text-right py-1.5 px-3 font-medium">Subtotal</th>
                                    <th className="text-right py-1.5 px-3 font-medium">Ganancia</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {items.map((item, idx) => {
                                    const itemProfit = calcItemProfit(item);
                                    const costoU = item.productos?.costo || 0;
                                    const unidadesPres = getUnidadesPres(item);
                                    const descPct = Number((item as any).descuento) || 0;
                                    const precioVenta = item.precio_unitario * (1 - descPct / 100);
                                    return (
                                      <tr key={idx} className="border-b border-muted/50 last:border-0">
                                        <td className="py-1.5 px-4 pl-12">
                                          {item.productos?.nombre || item.descripcion}
                                          {descPct > 0 && <span className="ml-1 text-[10px] text-orange-600">(-{descPct}%)</span>}
                                        </td>
                                        <td className="py-1.5 px-3 text-center">{item.cantidad}</td>
                                        <td className="py-1.5 px-3 text-right">{fc(precioVenta)}</td>
                                        <td className="py-1.5 px-3 text-right text-muted-foreground">{fc(costoU * unidadesPres)}</td>
                                        <td className="py-1.5 px-3 text-right">{fc(item.subtotal)}</td>
                                        <td className={`py-1.5 px-3 text-right font-medium ${itemProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                          {fc(itemProfit)}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                                <tfoot>
                                  <tr className="border-t border-muted font-semibold">
                                    <td colSpan={4} className="py-1.5 px-4 pl-12 text-right">Total ganancia:</td>
                                    <td className="py-1.5 px-3 text-right">{fc(v.total)}</td>
                                    <td className={`py-1.5 px-3 text-right ${ventaProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                      {fc(ventaProfit)}
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="compras" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => exportCSV("compras", "Fecha,Forma Pago,Total", compras.map((c) => `${c.fecha},${c.forma_pago},${c.total}`).join("\n"))}>
              <Download className="w-4 h-4 mr-1.5" />CSV
            </Button>
          </div>
          <div className="border rounded-lg overflow-hidden max-h-[500px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b bg-muted/50 text-muted-foreground">
                  <th className="text-left py-2 px-3 font-medium">Fecha</th>
                  <th className="text-left py-2 px-3 font-medium">Forma Pago</th>
                  <th className="text-right py-2 px-3 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {compras.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-2 px-3">{new Date(c.fecha + "T12:00:00").toLocaleDateString("es-AR")}</td>
                    <td className="py-2 px-3"><Badge variant="outline" className="text-xs">{c.forma_pago}</Badge></td>
                    <td className="py-2 px-3 text-right font-semibold">{fc(c.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="stock" className="mt-4 space-y-4">
          <div className="flex items-end gap-3 flex-wrap overflow-visible">
            <div ref={stockCatRef} className="relative">
              <Label className="uppercase text-xs text-muted-foreground font-semibold tracking-wide mb-1.5 block">Categoria</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar categoria..."
                  value={stockFilterCat ? (categorias.find((c) => c.id === stockFilterCat)?.nombre ?? stockCatSearch) : stockCatSearch}
                  onChange={(e) => { setStockCatSearch(e.target.value); setStockFilterCat(""); setStockFilterSubcat(""); setStockCatOpen(true); }}
                  onFocus={() => setStockCatOpen(true)}
                  className="pl-9 w-44"
                />
                {stockFilterCat && (
                  <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => { setStockFilterCat(""); setStockCatSearch(""); setStockFilterSubcat(""); }}>
                    <X className="w-4 h-4" />
                  </button>
                )}
                {stockCatOpen && !stockFilterCat && (
                  <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
                    <button className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors" onClick={() => { setStockFilterCat(""); setStockCatSearch(""); setStockCatOpen(false); }}>Todas</button>
                    {categorias.filter((c) => c.nombre.toLowerCase().includes(stockCatSearch.toLowerCase())).map((c) => (
                      <button key={c.id} className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors"
                        onClick={() => { setStockFilterCat(c.id); setStockCatSearch(""); setStockCatOpen(false); setStockFilterSubcat(""); }}>
                        {c.nombre}
                      </button>
                    ))}
                    {categorias.filter((c) => c.nombre.toLowerCase().includes(stockCatSearch.toLowerCase())).length === 0 && (
                      <p className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</p>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div ref={stockSubcatRef} className="relative">
              <Label className="uppercase text-xs text-muted-foreground font-semibold tracking-wide mb-1.5 block">Subcategoria</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar subcategoria..."
                  value={stockFilterSubcat ? (subcategorias.find((s) => s.id === stockFilterSubcat)?.nombre ?? stockSubcatSearch) : stockSubcatSearch}
                  onChange={(e) => { setStockSubcatSearch(e.target.value); setStockFilterSubcat(""); setStockSubcatOpen(true); }}
                  onFocus={() => setStockSubcatOpen(true)}
                  className="pl-9 w-44"
                />
                {stockFilterSubcat && (
                  <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => { setStockFilterSubcat(""); setStockSubcatSearch(""); }}>
                    <X className="w-4 h-4" />
                  </button>
                )}
                {stockSubcatOpen && !stockFilterSubcat && (
                  <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
                    <button className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors" onClick={() => { setStockFilterSubcat(""); setStockSubcatSearch(""); setStockSubcatOpen(false); }}>Todas</button>
                    {subcategorias.filter((s) => s.nombre.toLowerCase().includes(stockSubcatSearch.toLowerCase())).map((s) => (
                      <button key={s.id} className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors"
                        onClick={() => { setStockFilterSubcat(s.id); setStockSubcatSearch(""); setStockSubcatOpen(false); }}>
                        {s.nombre}
                      </button>
                    ))}
                    {subcategorias.filter((s) => s.nombre.toLowerCase().includes(stockSubcatSearch.toLowerCase())).length === 0 && (
                      <p className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</p>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div ref={stockMarcaRef} className="relative">
              <Label className="uppercase text-xs text-muted-foreground font-semibold tracking-wide mb-1.5 block">Marca</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar marca..."
                  value={stockFilterMarca ? (marcas.find((m) => m.id === stockFilterMarca)?.nombre ?? stockMarcaSearch) : stockMarcaSearch}
                  onChange={(e) => { setStockMarcaSearch(e.target.value); setStockFilterMarca(""); setStockMarcaOpen(true); }}
                  onFocus={() => setStockMarcaOpen(true)}
                  className="pl-9 w-44"
                />
                {stockFilterMarca && (
                  <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => { setStockFilterMarca(""); setStockMarcaSearch(""); }}>
                    <X className="w-4 h-4" />
                  </button>
                )}
                {stockMarcaOpen && !stockFilterMarca && (
                  <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
                    <button className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors" onClick={() => { setStockFilterMarca(""); setStockMarcaSearch(""); setStockMarcaOpen(false); }}>Todas</button>
                    {marcas.filter((m) => m.nombre.toLowerCase().includes(stockMarcaSearch.toLowerCase())).map((m) => (
                      <button key={m.id} className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors"
                        onClick={() => { setStockFilterMarca(m.id); setStockMarcaSearch(""); setStockMarcaOpen(false); }}>
                        {m.nombre}
                      </button>
                    ))}
                    {marcas.filter((m) => m.nombre.toLowerCase().includes(stockMarcaSearch.toLowerCase())).length === 0 && (
                      <p className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</p>
                    )}
                  </div>
                )}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => exportCSV("stock", "Codigo,Nombre,Stock,Costo,Precio,Valor Costo,Valor Venta", filteredProductos.map((p) => `${p.codigo},${p.nombre},${p.stock},${p.costo},${p.precio},${p.stock * p.costo},${p.stock * p.precio}`).join("\n"))}>
              <Download className="w-4 h-4 mr-1.5" />CSV
            </Button>
          </div>
          <div className="border rounded-lg overflow-hidden max-h-[500px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b bg-muted/50 text-muted-foreground">
                  <th className="text-left py-2 px-3 font-medium">Producto</th>
                  <th className="text-center py-2 px-3 font-medium">Stock</th>
                  <th className="text-right py-2 px-3 font-medium">Costo</th>
                  <th className="text-right py-2 px-3 font-medium">Precio</th>
                  <th className="text-right py-2 px-3 font-medium">Valor Costo</th>
                  <th className="text-right py-2 px-3 font-medium">Valor Venta</th>
                </tr>
              </thead>
              <tbody>
                {filteredProductos.map((p) => (
                  <tr key={p.id} className={`border-b last:border-0 hover:bg-muted/30 ${p.stock <= 0 ? "opacity-40" : ""}`}>
                    <td className="py-2 px-3">
                      <p className="font-medium">{p.nombre}</p>
                      <p className="text-xs text-muted-foreground font-mono">{p.codigo}</p>
                    </td>
                    <td className="py-2 px-3 text-center">{p.stock}</td>
                    <td className="py-2 px-3 text-right">{fc(p.costo)}</td>
                    <td className="py-2 px-3 text-right">{fc(p.precio)}</td>
                    <td className="py-2 px-3 text-right font-medium">{fc(p.stock * p.costo)}</td>
                    <td className="py-2 px-3 text-right font-semibold text-emerald-600">{fc(p.stock * p.precio)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 bg-muted/50 font-bold">
                  <td className="py-2 px-3">TOTAL</td>
                  <td className="py-2 px-3 text-center">{filteredProductos.reduce((a, p) => a + p.stock, 0)}</td>
                  <td colSpan={2}></td>
                  <td className="py-2 px-3 text-right">{fc(stockCosto)}</td>
                  <td className="py-2 px-3 text-right text-emerald-600">{fc(stockVenta)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="pagos" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(ventasPorPago).sort((a, b) => b[1] - a[1]).map(([metodo, monto]) => (
              <Card key={metodo}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">{metodo}</p>
                      <p className="text-xl font-bold">{fc(monto)}</p>
                    </div>
                    <Badge variant="secondary">{((monto / totalVentas) * 100).toFixed(1)}%</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{ventas.filter((v) => v.forma_pago === metodo).length} operaciones</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
