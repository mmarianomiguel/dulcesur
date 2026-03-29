"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { showAdminToast } from "@/components/admin-toast";
import { supabase } from "@/lib/supabase";
import { norm } from "@/lib/utils";
import { todayARG } from "@/lib/formatters";
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
interface CompraRow { id: string; fecha: string; total: number; forma_pago: string; proveedor_id: string | null; observacion: string | null; proveedores: { nombre: string } | null; }
interface CompraItemRow { compra_id: string; descripcion: string; cantidad: number; precio_unitario: number; subtotal: number; }
interface VentaItemDetail { venta_id: string; producto_id: string; descripcion: string; cantidad: number; precio_unitario: number; subtotal: number; unidades_por_presentacion: number; presentacion?: string; descuento?: number; costo_unitario?: number; productos: { costo: number; nombre: string; categoria_id: string | null; subcategoria_id: string | null } | null; }
interface ClienteOption { id: string; nombre: string; }

export default function ReportesPage() {
  const [tab, setTab] = useState("ventas");
  const [quickPeriod, setQuickPeriod] = useState<"today" | "week" | "month" | "custom">("today");
  const [desde, setDesde] = useState(() => todayARG());
  const [hasta, setHasta] = useState(() => todayARG());
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

  // Caja movimientos for Mixto splitting
  const [cajaMovimientos, setCajaMovimientos] = useState<{ referencia_id: string; referencia_tipo: string; metodo_pago: string; monto: number }[]>([]);

  // Compras report
  const [compras, setCompras] = useState<CompraRow[]>([]);
  const [compraItems, setCompraItems] = useState<CompraItemRow[]>([]);
  const [expandedCompras, setExpandedCompras] = useState<Set<string>>(new Set());

  // Stock report
  const [productos, setProductos] = useState<{ id: string; nombre: string; codigo: string; stock: number; precio: number; costo: number; categoria_id: string | null; subcategoria_id: string | null; marca_id: string | null; }[]>([]);
  const [categorias, setCategorias] = useState<{ id: string; nombre: string }[]>([]);
  const [subcategorias, setSubcategorias] = useState<{ id: string; nombre: string; categoria_id: string }[]>([]);
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

  // Compute effective date range based on quickPeriod or custom filters
  const effectiveDates = useMemo(() => {
    const today = todayARG();
    if (quickPeriod === "today") {
      return { desde: today, hasta: today };
    } else if (quickPeriod === "week") {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - diffToMonday);
      return { desde: monday.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }), hasta: today };
    } else if (quickPeriod === "month") {
      const d = new Date(); d.setDate(1);
      return { desde: d.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }), hasta: today };
    }
    // custom — always use the date pickers
    return { desde, hasta };
  }, [quickPeriod, ventaDateMode, desde, hasta]);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    const { desde: dEff, hasta: hEff } = effectiveDates;

    const [{ data: vts }, { data: cmps }, { data: prods }] = await Promise.all([
      supabase.from("ventas").select("id, fecha, total, forma_pago, tipo_comprobante, created_at, cliente_id, origen, estado, clientes(nombre)")
        .gte("fecha", dEff).lte("fecha", hEff)
        .not("tipo_comprobante", "ilike", "Nota de Crédito%")
        .neq("estado", "anulada")
        .order("created_at", { ascending: false }),
      supabase.from("compras").select("id, fecha, total, forma_pago, proveedor_id, observacion, proveedores(nombre)")
        .gte("fecha", dEff).lte("fecha", hEff)
        .order("fecha", { ascending: false }),
      supabase.from("productos").select("id, nombre, codigo, stock, precio, costo, categoria_id, subcategoria_id, marca_id").eq("activo", true).order("nombre").limit(10000),
    ]);

    setVentas((vts || []).map((v: any) => ({ ...v, clientes: Array.isArray(v.clientes) ? v.clientes[0] || null : v.clientes })) as VentaRow[]);
    const comprasList = (cmps || []).map((c: any) => ({ ...c, proveedores: Array.isArray(c.proveedores) ? c.proveedores[0] || null : c.proveedores })) as CompraRow[];
    setCompras(comprasList);

    // Fetch compra items
    if (comprasList.length > 0) {
      const cIds = comprasList.map((c) => c.id);
      const { data: cItems } = await supabase
        .from("compra_items")
        .select("compra_id, descripcion, cantidad, precio_unitario, subtotal")
        .in("compra_id", cIds);
      setCompraItems((cItems || []) as CompraItemRow[]);
    } else {
      setCompraItems([]);
    }
    setProductos(prods || []);

    // Fetch venta items for profit calc
    if (vts && vts.length > 0) {
      const ids = vts.map((v: any) => v.id);
      const [{ data: items }, { data: movs }] = await Promise.all([
        supabase
          .from("venta_items")
          .select("venta_id, producto_id, descripcion, cantidad, precio_unitario, descuento, subtotal, unidades_por_presentacion, presentacion, costo_unitario, productos(costo, nombre, categoria_id, subcategoria_id)")
          .in("venta_id", ids),
        supabase
          .from("caja_movimientos")
          .select("referencia_id, referencia_tipo, metodo_pago, monto")
          .eq("tipo", "ingreso")
          .eq("referencia_tipo", "venta")
          .in("referencia_id", ids),
      ]);
      setVentaItems((items || []) as any[]);
      setCajaMovimientos((movs || []) as any[]);
    } else {
      setVentaItems([]);
      setCajaMovimientos([]);
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
      supabase.from("subcategorias").select("id, nombre, categoria_id").order("nombre"),
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
    const q = norm(ventaClienteSearch);
    return clienteOptions.filter((c) => norm(c.nombre).includes(q));
  }, [clienteOptions, ventaClienteSearch]);

  // --- Derived ---
  const totalVentas = useMemo(() => ventas.reduce((a, v) => a + v.total, 0), [ventas]);
  const totalCompras = useMemo(() => compras.reduce((a, c) => a + c.total, 0), [compras]);
  const getUnidadesPres = (item: any) => {
    let u = Number(item.unidades_por_presentacion) || 1;
    const presTxt = ((item as any).presentacion || "").toLowerCase();
    if (presTxt.includes("medio") && u === 1) u = 0.5;
    // Fallback: if unidades_por_presentacion is 1 but presentacion says otherwise, extract from name
    if (u === 1 && presTxt && presTxt !== "unidad") {
      const match = presTxt.match(/x\s*(\d+)/);
      if (match) u = Number(match[1]);
    }
    return u;
  };
  // Helper: get frozen cost per item (uses only costo_unitario — never falls back to live product cost)
  const getItemCost = (item: any) => {
    return (item.costo_unitario && item.costo_unitario > 0) ? item.costo_unitario : 0;
  };
  const ganancia = useMemo(() => ventaItems.reduce((a, item: any) => {
    const costoPres = getItemCost(item);
    const ventaItem = Number(item.subtotal) || 0;
    return a + (ventaItem - costoPres * item.cantidad);
  }, 0), [ventaItems]);

  // Split Mixto into Efectivo + Transferencia + CC using caja_movimientos
  const ventasPorPago = useMemo(() => {
    const map: Record<string, number> = {};
    ventas.forEach((v) => {
      if (v.forma_pago === "Mixto") {
        const movs = cajaMovimientos.filter((m) => m.referencia_id === v.id && m.referencia_tipo === "venta");
        if (movs.length > 0) {
          movs.forEach((m) => {
            map[m.metodo_pago] = (map[m.metodo_pago] || 0) + m.monto;
          });
          const movsTotal = movs.reduce((a, m) => a + m.monto, 0);
          const ccPart = v.total - movsTotal;
          if (ccPart > 0) {
            map["Cuenta Corriente"] = (map["Cuenta Corriente"] || 0) + ccPart;
          }
        } else {
          // No caja data — fallback to Efectivo (not "Mixto")
          map["Efectivo"] = (map["Efectivo"] || 0) + v.total;
        }
      } else {
        map[v.forma_pago] = (map[v.forma_pago] || 0) + v.total;
      }
    });
    return map;
  }, [ventas, cajaMovimientos]);

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

  const compraItemsMap = useMemo(() => {
    const map: Record<string, CompraItemRow[]> = {};
    compraItems.forEach((item) => {
      if (!map[item.compra_id]) map[item.compra_id] = [];
      map[item.compra_id].push(item);
    });
    return map;
  }, [compraItems]);

  // --- Category / Subcategory breakdown ---
  const [catFilter, setCatFilter] = useState("");
  const [subcatFilter, setSubcatFilter] = useState("");
  const [catViewMode, setCatViewMode] = useState<"categoria" | "subcategoria">("categoria");
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

  interface CatProductRow { producto_id: string; nombre: string; unidades: number; venta: number; costo: number; ganancia: number; }
  interface CatRow { categoria_id: string; nombre: string; unidades: number; venta: number; costo: number; ganancia: number; margen: number; productos: CatProductRow[]; }

  // Helper to build breakdown by a grouping key
  const buildBreakdown = (groupBy: "categoria" | "subcategoria", filterCat: string, filterSubcat: string) => {
    const catNames: Record<string, string> = {};
    for (const c of categorias) catNames[c.id] = c.nombre;
    const subcatNames: Record<string, string> = {};
    for (const s of subcategorias) subcatNames[s.id] = s.nombre;

    const groupMap: Record<string, { nombre: string; productos: Record<string, CatProductRow> }> = {};

    for (const item of ventaItems as any[]) {
      // Apply filters
      const itemCatId = item.productos?.categoria_id || "__sin_categoria";
      const itemSubcatId = item.productos?.subcategoria_id || "__sin_subcategoria";
      if (filterCat && itemCatId !== filterCat) continue;
      if (filterSubcat && itemSubcatId !== filterSubcat) continue;

      let groupId: string;
      let groupName: string;
      if (groupBy === "subcategoria") {
        groupId = itemSubcatId;
        groupName = groupId === "__sin_subcategoria" ? "Sin subcategoría" : (subcatNames[groupId] || "Sin subcategoría");
      } else {
        groupId = itemCatId;
        groupName = groupId === "__sin_categoria" ? "Sin categoría" : (catNames[groupId] || "Sin categoría");
      }
      if (!groupMap[groupId]) groupMap[groupId] = { nombre: groupName, productos: {} };

      const prodId = item.producto_id || item.descripcion;
      const prodName = item.productos?.nombre || item.descripcion || "Producto";
      if (!groupMap[groupId].productos[prodId]) groupMap[groupId].productos[prodId] = { producto_id: prodId, nombre: prodName, unidades: 0, venta: 0, costo: 0, ganancia: 0 };

      const costoPres = getItemCost(item);
      const unidadesPres = getUnidadesPres(item);
      const cantidad = Number(item.cantidad) || 0;
      const ventaItem = Number(item.subtotal) || 0;

      const row = groupMap[groupId].productos[prodId];
      row.unidades += cantidad * unidadesPres;
      row.venta += ventaItem;
      row.costo += costoPres * cantidad;
      row.ganancia += ventaItem - costoPres * cantidad;
    }

    return Object.entries(groupMap).map(([gId, { nombre, productos }]) => {
      const prods = Object.values(productos).sort((a, b) => b.venta - a.venta);
      const totalVenta = prods.reduce((a, p) => a + p.venta, 0);
      const totalCosto = prods.reduce((a, p) => a + p.costo, 0);
      const totalGanancia = prods.reduce((a, p) => a + p.ganancia, 0);
      const totalUnidades = prods.reduce((a, p) => a + p.unidades, 0);
      return { categoria_id: gId, nombre, unidades: totalUnidades, venta: totalVenta, costo: totalCosto, ganancia: totalGanancia, margen: totalVenta > 0 ? (totalGanancia / totalVenta) * 100 : 0, productos: prods } as CatRow;
    }).sort((a, b) => b.venta - a.venta);
  };

  const catBreakdown = useMemo(() => buildBreakdown(catViewMode, catFilter, subcatFilter), [ventaItems, categorias, subcategorias, catViewMode, catFilter, subcatFilter]);

  const catTotals = useMemo(() => ({
    venta: catBreakdown.reduce((a, c) => a + c.venta, 0),
    costo: catBreakdown.reduce((a, c) => a + c.costo, 0),
    ganancia: catBreakdown.reduce((a, c) => a + c.ganancia, 0),
    unidades: catBreakdown.reduce((a, c) => a + c.unidades, 0),
  }), [catBreakdown]);

  // Filtered subcategorias based on selected category
  const filteredSubcats = useMemo(() => catFilter ? subcategorias.filter((s) => s.categoria_id === catFilter) : subcategorias, [subcategorias, catFilter]);

  const toggleExpandCompra = (id: string) => {
    setExpandedCompras((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Compras grouped by proveedor for summary
  const comprasPorProveedor = useMemo(() => {
    const map: Record<string, { nombre: string; total: number; qty: number }> = {};
    compras.forEach((c) => {
      const name = c.proveedores?.nombre || "Sin proveedor";
      if (!map[name]) map[name] = { nombre: name, total: 0, qty: 0 };
      map[name].total += c.total;
      map[name].qty += 1;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [compras]);

  // Profit for filtered ventas
  const filteredVentasTotal = useMemo(() => filteredVentas.reduce((a, v) => a + v.total, 0), [filteredVentas]);
  const filteredVentasGanancia = useMemo(() => {
    const filteredIds = new Set(filteredVentas.map((v) => v.id));
    return ventaItems.filter((item) => filteredIds.has(item.venta_id)).reduce((a, item: any) => {
      const costoPres = getItemCost(item);
      const ventaItem = Number(item.subtotal) || 0;
      return a + (ventaItem - costoPres * item.cantidad);
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
    const costoPres = getItemCost(item);
    const ventaItem = Number(item.subtotal) || 0;
    return ventaItem - costoPres * item.cantidad;
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
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <BarChart3 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Reportes</h1>
            <p className="text-sm text-muted-foreground">Análisis de ventas, compras y stock</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 rounded-lg border p-1">
            {([["today", "Hoy"], ["week", "Esta semana"], ["month", "Este mes"], ["custom", "Personalizado"]] as const).map(([key, label]) => (
              <button key={key} onClick={() => { setQuickPeriod(key); }} className={`px-3 py-1.5 text-sm rounded-md transition-colors ${quickPeriod === key ? "bg-foreground text-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {label}
              </button>
            ))}
          </div>
          {quickPeriod === "custom" && (
            <>
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-9 w-36" />
              <span className="text-muted-foreground text-sm">a</span>
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-9 w-36" />
            </>
          )}
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
          <TabsTrigger value="categorias">Por Categoría</TabsTrigger>
          <TabsTrigger value="compras">Compras</TabsTrigger>
          <TabsTrigger value="stock">Stock Valorizado</TabsTrigger>
          <TabsTrigger value="pagos">Por Forma de Pago</TabsTrigger>
        </TabsList>

        <TabsContent value="ventas" className="mt-4 space-y-4">
          {/* Ventas filters */}
          <div className="flex items-end gap-3 flex-wrap">
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
                        <td className="py-2 px-3">{new Date(v.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}</td>
                        <td className="py-2 px-3"><Badge variant="secondary" className="text-xs">{v.tipo_comprobante}</Badge></td>
                        <td className="py-2 px-3 text-muted-foreground">{v.clientes?.nombre || "—"}</td>
                        <td className="py-2 px-3"><Badge variant="outline" className="text-xs">{v.forma_pago}</Badge></td>
                        <td className="py-2 px-3 text-right font-semibold">{fc(v.total)}</td>
                        <td className={`py-2 px-3 text-right font-semibold ${ventaProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                          {fc(ventaProfit)}
                          <span className="block text-[10px] font-normal text-muted-foreground">
                            {v.total > 0 ? `${((ventaProfit / v.total) * 100).toFixed(1)}%` : "—"}
                          </span>
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
                                    const itemCost = getItemCost(item);
                                    const descPct = Number((item as any).descuento) || 0;
                                    const precioVenta = item.precio_unitario * (1 - descPct / 100);
                                    return (
                                      <tr key={idx} className="border-b border-muted/50 last:border-0">
                                        <td className="py-1.5 px-4 pl-12">
                                          {item.productos?.nombre || item.descripcion}
                                          {(item as any).presentacion && (item as any).presentacion !== "Unidad" && (
                                            <span className="ml-1.5 text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{(item as any).presentacion}</span>
                                          )}
                                          {descPct > 0 && <span className="ml-1 text-[10px] text-orange-600">(-{descPct}%)</span>}
                                        </td>
                                        <td className="py-1.5 px-3 text-center">{item.cantidad}</td>
                                        <td className="py-1.5 px-3 text-right">{fc(precioVenta)}</td>
                                        <td className="py-1.5 px-3 text-right text-muted-foreground">{fc(itemCost)}</td>
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

        <TabsContent value="categorias" className="mt-4 space-y-4">
          {/* View mode + Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Agrupar por</Label>
              <Select value={catViewMode} onValueChange={(v) => { setCatViewMode((v as any) || "categoria"); setSubcatFilter(""); setExpandedCats(new Set()); }}>
                <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="categoria">Categoría</SelectItem>
                  <SelectItem value="subcategoria">Subcategoría</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Categoría</Label>
              <Select value={catFilter || "todas"} onValueChange={(v) => { setCatFilter(v === "todas" ? "" : (v ?? "")); setSubcatFilter(""); }}>
                <SelectTrigger className="w-48 h-9"><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas las categorías</SelectItem>
                  {categorias.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                  <SelectItem value="__sin_categoria">Sin categoría</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {catViewMode === "subcategoria" && filteredSubcats.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Subcategoría</Label>
                <Select value={subcatFilter || "todas_sub"} onValueChange={(v) => setSubcatFilter(v === "todas_sub" ? "" : (v ?? ""))}>
                  <SelectTrigger className="w-48 h-9"><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas_sub">Todas las subcategorías</SelectItem>
                    {filteredSubcats.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
                    <SelectItem value="__sin_subcategoria">Sin subcategoría</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="ml-auto flex gap-4 text-sm pt-5">
              <span>{catBreakdown.length} {catViewMode === "subcategoria" ? "subcategoría" : "categoría"}{catBreakdown.length !== 1 ? "s" : ""}</span>
              <span className="text-muted-foreground">{Math.round(catTotals.unidades)} unidades vendidas</span>
            </div>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground">Venta total</p>
              <p className="text-lg font-bold">{fc(catTotals.venta)}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground">Costo total</p>
              <p className="text-lg font-bold">{fc(catTotals.costo)}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground">Ganancia</p>
              <p className="text-lg font-bold text-green-600">{fc(catTotals.ganancia)}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground">Margen promedio</p>
              <p className="text-lg font-bold">{catTotals.venta > 0 ? ((catTotals.ganancia / catTotals.venta) * 100).toFixed(1) : "0"}%</p>
            </CardContent></Card>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium w-8"></th>
                  <th className="text-left p-3 font-medium">{catViewMode === "subcategoria" ? "Subcategoría" : "Categoría"}</th>
                  <th className="text-right p-3 font-medium">Unidades</th>
                  <th className="text-right p-3 font-medium">Venta</th>
                  <th className="text-right p-3 font-medium">Costo</th>
                  <th className="text-right p-3 font-medium">Ganancia</th>
                  <th className="text-right p-3 font-medium">Margen</th>
                  <th className="text-right p-3 font-medium">% del total</th>
                </tr>
              </thead>
              <tbody>
                {catBreakdown.map((cat) => {
                  const isExpanded = expandedCats.has(cat.categoria_id);
                  return (
                    <React.Fragment key={cat.categoria_id}>
                      <tr
                        className="border-t hover:bg-muted/30 cursor-pointer transition-colors"
                        onClick={() => setExpandedCats((prev) => { const next = new Set(prev); if (next.has(cat.categoria_id)) next.delete(cat.categoria_id); else next.add(cat.categoria_id); return next; })}
                      >
                        <td className="p-3 text-muted-foreground">{isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</td>
                        <td className="p-3 font-medium">{cat.nombre}</td>
                        <td className="p-3 text-right tabular-nums">{Math.round(cat.unidades)}</td>
                        <td className="p-3 text-right tabular-nums">{fc(cat.venta)}</td>
                        <td className="p-3 text-right tabular-nums text-muted-foreground">{fc(cat.costo)}</td>
                        <td className={`p-3 text-right tabular-nums font-medium ${cat.ganancia >= 0 ? "text-green-600" : "text-red-600"}`}>{fc(cat.ganancia)}</td>
                        <td className="p-3 text-right tabular-nums">
                          <Badge variant={cat.margen >= 30 ? "default" : cat.margen >= 15 ? "secondary" : "destructive"} className="text-xs">
                            {cat.margen.toFixed(1)}%
                          </Badge>
                        </td>
                        <td className="p-3 text-right tabular-nums text-muted-foreground">{catTotals.venta > 0 ? ((cat.venta / catTotals.venta) * 100).toFixed(1) : "0"}%</td>
                      </tr>
                      {isExpanded && cat.productos.map((prod, idx) => (
                        <tr key={prod.producto_id + idx} className="bg-muted/20 border-t border-dashed">
                          <td className="p-2"></td>
                          <td className="p-2 pl-8 text-muted-foreground text-xs">{prod.nombre}</td>
                          <td className="p-2 text-right text-xs tabular-nums">{Math.round(prod.unidades)}</td>
                          <td className="p-2 text-right text-xs tabular-nums">{fc(prod.venta)}</td>
                          <td className="p-2 text-right text-xs tabular-nums text-muted-foreground">{fc(prod.costo)}</td>
                          <td className={`p-2 text-right text-xs tabular-nums ${prod.ganancia >= 0 ? "text-green-600" : "text-red-600"}`}>{fc(prod.ganancia)}</td>
                          <td className="p-2 text-right text-xs tabular-nums">{prod.venta > 0 ? ((prod.ganancia / prod.venta) * 100).toFixed(1) : "0"}%</td>
                          <td className="p-2 text-right text-xs tabular-nums text-muted-foreground">{cat.venta > 0 ? ((prod.venta / cat.venta) * 100).toFixed(1) : "0"}%</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
                {catBreakdown.length === 0 && (
                  <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No hay ventas en el período seleccionado</td></tr>
                )}
              </tbody>
              {catBreakdown.length > 0 && (
                <tfoot className="bg-muted/50 font-medium border-t-2">
                  <tr>
                    <td className="p-3"></td>
                    <td className="p-3">Total</td>
                    <td className="p-3 text-right tabular-nums">{Math.round(catTotals.unidades)}</td>
                    <td className="p-3 text-right tabular-nums">{fc(catTotals.venta)}</td>
                    <td className="p-3 text-right tabular-nums">{fc(catTotals.costo)}</td>
                    <td className="p-3 text-right tabular-nums text-green-600">{fc(catTotals.ganancia)}</td>
                    <td className="p-3 text-right tabular-nums">{catTotals.venta > 0 ? ((catTotals.ganancia / catTotals.venta) * 100).toFixed(1) : "0"}%</td>
                    <td className="p-3 text-right tabular-nums">100%</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </TabsContent>

        <TabsContent value="compras" className="mt-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex gap-4 text-sm">
              <span className="text-muted-foreground">{compras.length} compras</span>
              <span className="font-semibold">{fc(totalCompras)}</span>
              <span className="text-muted-foreground">{comprasPorProveedor.length} proveedores</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => exportCSV("compras", "Fecha,Proveedor,Forma Pago,Total", compras.map((c) => `${c.fecha},${c.proveedores?.nombre || "S/P"},${c.forma_pago},${c.total}`).join("\n"))}>
              <Download className="w-4 h-4 mr-1.5" />CSV
            </Button>
          </div>

          {/* Resumen por proveedor */}
          {comprasPorProveedor.length > 1 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {comprasPorProveedor.map((p) => (
                <Card key={p.nombre}>
                  <CardContent className="py-3 px-4">
                    <p className="text-xs text-muted-foreground truncate">{p.nombre}</p>
                    <p className="text-lg font-bold">{fc(p.total)}</p>
                    <p className="text-xs text-muted-foreground">{p.qty} compra{p.qty !== 1 ? "s" : ""}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div className="border rounded-lg overflow-hidden max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background z-10">
                <tr className="border-b bg-muted/50 text-muted-foreground">
                  <th className="w-8 py-2 px-2"></th>
                  <th className="text-left py-2 px-3 font-medium">Fecha</th>
                  <th className="text-left py-2 px-3 font-medium">Proveedor</th>
                  <th className="text-left py-2 px-3 font-medium">Detalle</th>
                  <th className="text-left py-2 px-3 font-medium">Forma Pago</th>
                  <th className="text-right py-2 px-3 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {compras.map((c) => {
                  const isExpanded = expandedCompras.has(c.id);
                  const items = compraItemsMap[c.id] || [];
                  return (
                    <React.Fragment key={c.id}>
                      <tr
                        className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                        onClick={() => toggleExpandCompra(c.id)}
                      >
                        <td className="py-2 px-2 text-muted-foreground">
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </td>
                        <td className="py-2 px-3">{new Date(c.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}</td>
                        <td className="py-2 px-3 font-medium">{c.proveedores?.nombre || <span className="text-muted-foreground">—</span>}</td>
                        <td className="py-2 px-3 text-muted-foreground text-xs">
                          {items.length > 0
                            ? `${items.length} producto${items.length !== 1 ? "s" : ""}`
                            : c.observacion || "—"}
                        </td>
                        <td className="py-2 px-3"><Badge variant="outline" className="text-xs">{c.forma_pago}</Badge></td>
                        <td className="py-2 px-3 text-right font-semibold">{fc(c.total)}</td>
                      </tr>
                      {isExpanded && items.length > 0 && (
                        <tr>
                          <td colSpan={6} className="p-0">
                            <div className="bg-muted/20 border-b">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-muted-foreground border-b border-muted">
                                    <th className="text-left py-1.5 px-4 pl-12 font-medium">Producto</th>
                                    <th className="text-center py-1.5 px-3 font-medium">Cant.</th>
                                    <th className="text-right py-1.5 px-3 font-medium">Precio Unit.</th>
                                    <th className="text-right py-1.5 px-3 font-medium">Subtotal</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {items.map((item, idx) => (
                                    <tr key={idx} className="border-b border-muted/50 last:border-0">
                                      <td className="py-1.5 px-4 pl-12">{item.descripcion}</td>
                                      <td className="py-1.5 px-3 text-center">{item.cantidad}</td>
                                      <td className="py-1.5 px-3 text-right">{fc(item.precio_unitario)}</td>
                                      <td className="py-1.5 px-3 text-right font-medium">{fc(item.subtotal)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr className="border-t border-muted font-semibold">
                                    <td colSpan={3} className="py-1.5 px-4 pl-12 text-right">Total:</td>
                                    <td className="py-1.5 px-3 text-right">{fc(c.total)}</td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                      {isExpanded && items.length === 0 && c.observacion && (
                        <tr>
                          <td colSpan={6} className="p-0">
                            <div className="bg-muted/20 border-b px-12 py-3 text-xs text-muted-foreground">
                              <span className="font-medium">Observación:</span> {c.observacion}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
              {compras.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 bg-muted/50 font-bold">
                    <td className="py-2 px-2"></td>
                    <td className="py-2 px-3">TOTAL</td>
                    <td colSpan={3}></td>
                    <td className="py-2 px-3 text-right">{fc(totalCompras)}</td>
                  </tr>
                </tfoot>
              )}
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
                    {categorias.filter((c) => norm(c.nombre).includes(norm(stockCatSearch))).map((c) => (
                      <button key={c.id} className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors"
                        onClick={() => { setStockFilterCat(c.id); setStockCatSearch(""); setStockCatOpen(false); setStockFilterSubcat(""); }}>
                        {c.nombre}
                      </button>
                    ))}
                    {categorias.filter((c) => norm(c.nombre).includes(norm(stockCatSearch))).length === 0 && (
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
                    {subcategorias.filter((s) => (!stockFilterCat || s.categoria_id === stockFilterCat) && norm(s.nombre).includes(norm(stockSubcatSearch))).map((s) => (
                      <button key={s.id} className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors"
                        onClick={() => { setStockFilterSubcat(s.id); setStockSubcatSearch(""); setStockSubcatOpen(false); }}>
                        {s.nombre}
                      </button>
                    ))}
                    {subcategorias.filter((s) => (!stockFilterCat || s.categoria_id === stockFilterCat) && norm(s.nombre).includes(norm(stockSubcatSearch))).length === 0 && (
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
                    {marcas.filter((m) => norm(m.nombre).includes(norm(stockMarcaSearch))).map((m) => (
                      <button key={m.id} className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors"
                        onClick={() => { setStockFilterMarca(m.id); setStockMarcaSearch(""); setStockMarcaOpen(false); }}>
                        {m.nombre}
                      </button>
                    ))}
                    {marcas.filter((m) => norm(m.nombre).includes(norm(stockMarcaSearch))).length === 0 && (
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
                    <Badge variant="secondary">{totalVentas > 0 ? ((monto / totalVentas) * 100).toFixed(1) : "0"}%</Badge>
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
