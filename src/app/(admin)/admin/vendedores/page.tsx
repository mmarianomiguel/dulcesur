"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  UserCheck,
  Loader2,
  Percent,
  ShieldX,
  Search,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  DollarSign,
  TrendingUp,
  Users,
} from "lucide-react";
import { showAdminToast } from "@/components/admin-toast";
import { formatCurrency, todayARG, currentMonthPadded } from "@/lib/formatters";

interface Vendedor {
  id: string;
  nombre: string;
  email: string | null;
  activo: boolean;
  comision_porcentaje: number;
}

interface Categoria {
  id: string;
  nombre: string;
}

interface Exclusion {
  categoria_id: string;
}

interface VendedorSummary {
  total: number;
  comisionable: number;
  excluidoPorCategoria: Record<string, number>;
}

interface VentaDetalle {
  id: string;
  fecha: string;
  hora: string;
  nro_comprobante: string | null;
  cliente_nombre: string | null;
  total: number;
  comision: number;
}

type QuickPeriod = "today" | "week" | "month" | "custom";

export default function VendedoresPage() {
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);

  // Quick period selector
  const [quickPeriod, setQuickPeriod] = useState<QuickPeriod>("today");

  // Date filter (for custom mode)
  const [filterMode, setFilterMode] = useState<"day" | "month" | "range">("day");
  const [filterDay, setFilterDay] = useState(todayARG());
  const [filterMonth, setFilterMonth] = useState(currentMonthPadded());
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()));
  const [filterFrom, setFilterFrom] = useState(todayARG());
  const [filterTo, setFilterTo] = useState(todayARG());

  // Detail view
  const [selectedVendedor, setSelectedVendedor] = useState<Vendedor | null>(null);
  const [ventasDetalle, setVentasDetalle] = useState<VentaDetalle[]>([]);
  const [loadingDetalle, setLoadingDetalle] = useState(false);

  // Expanded category detail in detail view
  const [showCatBreakdown, setShowCatBreakdown] = useState(false);

  // Edit commission dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editVendedor, setEditVendedor] = useState<Vendedor | null>(null);
  const [editComision, setEditComision] = useState("");
  const [saving, setSaving] = useState(false);

  // Exclusions dialog
  const [exclDialogOpen, setExclDialogOpen] = useState(false);
  const [exclVendedor, setExclVendedor] = useState<Vendedor | null>(null);
  const [exclCategorias, setExclCategorias] = useState<Set<string>>(new Set());
  const [savingExcl, setSavingExcl] = useState(false);
  const [catSearch, setCatSearch] = useState("");

  // Sales summary per vendedor
  const [ventasSummary, setVentasSummary] = useState<Record<string, VendedorSummary>>({});

  // Compute date range from quick period or custom filter
  const dateRange = useMemo(() => {
    if (quickPeriod === "today") {
      const today = todayARG();
      return { from: today, to: today };
    }
    if (quickPeriod === "week") {
      const now = new Date();
      // Get Monday of current week
      const dayOfWeek = now.getDay();
      const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - diffToMonday);
      const mondayStr = monday.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
      const todayStr = todayARG();
      return { from: mondayStr, to: todayStr };
    }
    if (quickPeriod === "month") {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth() + 1;
      const firstDay = `${y}-${String(m).padStart(2, "0")}-01`;
      const todayStr = todayARG();
      return { from: firstDay, to: todayStr };
    }
    // custom
    if (filterMode === "day") {
      return { from: filterDay, to: filterDay };
    }
    if (filterMode === "month") {
      const y = parseInt(filterYear);
      const m = parseInt(filterMonth);
      const firstDay = `${y}-${String(m).padStart(2, "0")}-01`;
      const lastDay = `${y}-${String(m).padStart(2, "0")}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
      return { from: firstDay, to: lastDay };
    }
    return { from: filterFrom, to: filterTo };
  }, [quickPeriod, filterMode, filterDay, filterMonth, filterYear, filterFrom, filterTo]);

  // Category name map
  const catMap = useMemo(() => {
    const m: Record<string, string> = {};
    categorias.forEach((c) => { m[c.id] = c.nombre; });
    return m;
  }, [categorias]);

  const fetchBase = useCallback(async () => {
    const { data: vendData } = await supabase
      .from("usuarios")
      .select("id, nombre, email, activo, comision_porcentaje")
      .eq("rol", "vendedor")
      .eq("activo", true)
      .order("nombre");
    setVendedores(vendData || []);

    const { data: catData } = await supabase
      .from("categorias")
      .select("id, nombre")
      .order("nombre");
    setCategorias(catData || []);
  }, []);

  const fetchSales = useCallback(async () => {
    setLoading(true);

    const { data: ventasData } = await supabase
      .from("ventas")
      .select("id, vendedor_id, total")
      .neq("estado", "anulada")
      .gte("fecha", dateRange.from)
      .lte("fecha", dateRange.to);

    // Get all exclusions
    const { data: allExcl } = await supabase
      .from("vendedor_categorias_excluidas")
      .select("vendedor_id, categoria_id");

    // Get venta_items
    const ventaIds = (ventasData || []).map((v) => v.id);
    const itemsByVenta: Record<string, { producto_id: string | null; subtotal: number }[]> = {};

    if (ventaIds.length > 0) {
      const batchSize = 200;
      const allItems: { venta_id: string; producto_id: string | null; subtotal: number }[] = [];
      for (let i = 0; i < ventaIds.length; i += batchSize) {
        const batch = ventaIds.slice(i, i + batchSize);
        const { data: items } = await supabase
          .from("venta_items")
          .select("venta_id, producto_id, subtotal")
          .in("venta_id", batch);
        if (items) allItems.push(...items);
      }
      for (const item of allItems) {
        if (!itemsByVenta[item.venta_id]) itemsByVenta[item.venta_id] = [];
        itemsByVenta[item.venta_id].push(item);
      }
    }

    // Get product categories
    const allProductIds = new Set<string>();
    Object.values(itemsByVenta).flat().forEach((i) => {
      if (i.producto_id) allProductIds.add(i.producto_id);
    });

    const productCategories: Record<string, string | null> = {};
    if (allProductIds.size > 0) {
      const prodIds = Array.from(allProductIds);
      const batchSize = 200;
      for (let i = 0; i < prodIds.length; i += batchSize) {
        const batch = prodIds.slice(i, i + batchSize);
        const { data: prods } = await supabase
          .from("productos")
          .select("id, categoria_id")
          .in("id", batch);
        if (prods) {
          for (const p of prods) {
            productCategories[p.id] = p.categoria_id;
          }
        }
      }
    }

    // Build exclusions map
    const exclMap: Record<string, Set<string>> = {};
    (allExcl || []).forEach((e: { vendedor_id: string; categoria_id: string }) => {
      if (!exclMap[e.vendedor_id]) exclMap[e.vendedor_id] = new Set();
      exclMap[e.vendedor_id].add(e.categoria_id);
    });

    // Calculate summary with category breakdown
    const summary: Record<string, VendedorSummary> = {};
    for (const venta of ventasData || []) {
      const vid = venta.vendedor_id;
      if (!vid) continue;
      if (!summary[vid]) summary[vid] = { total: 0, comisionable: 0, excluidoPorCategoria: {} };
      summary[vid].total += venta.total;

      const items = itemsByVenta[venta.id] || [];
      const vendExcl = exclMap[vid] || new Set<string>();
      let comisionable = 0;
      for (const item of items) {
        const catId = item.producto_id ? productCategories[item.producto_id] : null;
        if (catId && vendExcl.has(catId)) {
          summary[vid].excluidoPorCategoria[catId] = (summary[vid].excluidoPorCategoria[catId] || 0) + item.subtotal;
          continue;
        }
        comisionable += item.subtotal;
      }
      summary[vid].comisionable += comisionable;
    }
    setVentasSummary(summary);
    setLoading(false);
  }, [dateRange]);

  // Fetch individual sales for detail view
  const fetchVentasDetalle = useCallback(async (vendedorId: string, comisionPct: number) => {
    setLoadingDetalle(true);
    setVentasDetalle([]);

    const { data: ventasData } = await supabase
      .from("ventas")
      .select("id, fecha, hora, nro_comprobante, cliente_id, total, vendedor_id")
      .neq("estado", "anulada")
      .eq("vendedor_id", vendedorId)
      .gte("fecha", dateRange.from)
      .lte("fecha", dateRange.to)
      .order("fecha", { ascending: false })
      .order("hora", { ascending: false });

    if (!ventasData || ventasData.length === 0) {
      setVentasDetalle([]);
      setLoadingDetalle(false);
      return;
    }

    // Get client names
    const clienteIds = [...new Set(ventasData.map((v) => v.cliente_id).filter(Boolean))];
    const clienteMap: Record<string, string> = {};
    if (clienteIds.length > 0) {
      const batchSize = 200;
      for (let i = 0; i < clienteIds.length; i += batchSize) {
        const batch = clienteIds.slice(i, i + batchSize);
        const { data: clientes } = await supabase
          .from("clientes")
          .select("id, nombre")
          .in("id", batch);
        if (clientes) {
          for (const c of clientes) {
            clienteMap[c.id] = c.nombre;
          }
        }
      }
    }

    // Get exclusions for this vendedor
    const { data: exclData } = await supabase
      .from("vendedor_categorias_excluidas")
      .select("categoria_id")
      .eq("vendedor_id", vendedorId);
    const vendExcl = new Set<string>((exclData || []).map((e: Exclusion) => e.categoria_id));

    // Get items for these ventas to calculate per-venta commission
    const ventaIds = ventasData.map((v) => v.id);
    const itemsByVenta: Record<string, { producto_id: string | null; subtotal: number }[]> = {};
    if (ventaIds.length > 0) {
      const batchSize = 200;
      const allItems: { venta_id: string; producto_id: string | null; subtotal: number }[] = [];
      for (let i = 0; i < ventaIds.length; i += batchSize) {
        const batch = ventaIds.slice(i, i + batchSize);
        const { data: items } = await supabase
          .from("venta_items")
          .select("venta_id, producto_id, subtotal")
          .in("venta_id", batch);
        if (items) allItems.push(...items);
      }
      for (const item of allItems) {
        if (!itemsByVenta[item.venta_id]) itemsByVenta[item.venta_id] = [];
        itemsByVenta[item.venta_id].push(item);
      }
    }

    // Get product categories
    const allProductIds = new Set<string>();
    Object.values(itemsByVenta).flat().forEach((i) => {
      if (i.producto_id) allProductIds.add(i.producto_id);
    });
    const productCategories: Record<string, string | null> = {};
    if (allProductIds.size > 0) {
      const prodIds = Array.from(allProductIds);
      const batchSize = 200;
      for (let i = 0; i < prodIds.length; i += batchSize) {
        const batch = prodIds.slice(i, i + batchSize);
        const { data: prods } = await supabase
          .from("productos")
          .select("id, categoria_id")
          .in("id", batch);
        if (prods) {
          for (const p of prods) {
            productCategories[p.id] = p.categoria_id;
          }
        }
      }
    }

    const detalle: VentaDetalle[] = ventasData.map((v) => {
      const items = itemsByVenta[v.id] || [];
      let comisionable = 0;
      for (const item of items) {
        const catId = item.producto_id ? productCategories[item.producto_id] : null;
        if (catId && vendExcl.has(catId)) continue;
        comisionable += item.subtotal;
      }
      const comision = comisionable * (comisionPct / 100);

      return {
        id: v.id,
        fecha: v.fecha,
        hora: v.hora || "",
        nro_comprobante: v.nro_comprobante,
        cliente_nombre: v.cliente_id ? (clienteMap[v.cliente_id] || "Cliente") : "Consumidor final",
        total: v.total,
        comision,
      };
    });

    setVentasDetalle(detalle);
    setLoadingDetalle(false);
  }, [dateRange]);

  useEffect(() => {
    fetchBase();
  }, [fetchBase]);

  useEffect(() => {
    if (categorias.length > 0) fetchSales();
  }, [fetchSales, categorias.length]);

  // When selected vendedor changes or dateRange changes, refetch detail
  useEffect(() => {
    if (selectedVendedor) {
      fetchVentasDetalle(selectedVendedor.id, selectedVendedor.comision_porcentaje || 0);
    }
  }, [selectedVendedor, fetchVentasDetalle]);

  // --- Edit commission ---
  const openEditComision = (v: Vendedor) => {
    setEditVendedor(v);
    setEditComision(String(v.comision_porcentaje || 0));
    setEditDialogOpen(true);
  };

  const handleSaveComision = async () => {
    if (!editVendedor) return;
    setSaving(true);
    const val = parseFloat(editComision) || 0;
    await supabase
      .from("usuarios")
      .update({ comision_porcentaje: val })
      .eq("id", editVendedor.id);
    setSaving(false);
    setEditDialogOpen(false);
    showAdminToast(`Comision de ${editVendedor.nombre} actualizada a ${val}%`);
    fetchBase();
  };

  // --- Edit exclusions ---
  const openExclusions = async (v: Vendedor) => {
    setExclVendedor(v);
    setCatSearch("");
    const { data } = await supabase
      .from("vendedor_categorias_excluidas")
      .select("categoria_id")
      .eq("vendedor_id", v.id);
    const set = new Set<string>();
    (data || []).forEach((e: Exclusion) => set.add(e.categoria_id));
    setExclCategorias(set);
    setExclDialogOpen(true);
  };

  const toggleExclusion = (catId: string) => {
    setExclCategorias((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  const handleSaveExclusions = async () => {
    if (!exclVendedor) return;
    setSavingExcl(true);
    await supabase
      .from("vendedor_categorias_excluidas")
      .delete()
      .eq("vendedor_id", exclVendedor.id);

    if (exclCategorias.size > 0) {
      const rows = Array.from(exclCategorias).map((catId) => ({
        vendedor_id: exclVendedor.id,
        categoria_id: catId,
      }));
      await supabase.from("vendedor_categorias_excluidas").insert(rows);
    }

    setSavingExcl(false);
    setExclDialogOpen(false);
    showAdminToast(`Exclusiones de ${exclVendedor.nombre} actualizadas`);
    fetchSales();
  };

  const filteredCategorias = categorias.filter((c) =>
    c.nombre.toLowerCase().includes(catSearch.toLowerCase())
  );

  // Period label for summary
  const periodLabel = useMemo(() => {
    if (quickPeriod === "today") return "Hoy";
    if (quickPeriod === "week") return "Esta semana";
    if (quickPeriod === "month") return "Este mes";
    if (filterMode === "day") return filterDay;
    if (filterMode === "month") return `${String(filterMonth).padStart(2, "0")}/${filterYear}`;
    return `${filterFrom} a ${filterTo}`;
  }, [quickPeriod, filterMode, filterDay, filterMonth, filterYear, filterFrom, filterTo]);

  // Totals across all vendedores
  const globalTotals = useMemo(() => {
    const totalVentas = Object.values(ventasSummary).reduce((a, s) => a + s.total, 0);
    const totalComisionable = Object.values(ventasSummary).reduce((a, s) => a + s.comisionable, 0);
    const totalExcluido = Object.values(ventasSummary).reduce((a, s) => {
      return a + Object.values(s.excluidoPorCategoria).reduce((x, y) => x + y, 0);
    }, 0);
    const totalComisiones = vendedores.reduce((acc, v) => {
      const s = ventasSummary[v.id];
      if (!s) return acc;
      return acc + s.comisionable * ((v.comision_porcentaje || 0) / 100);
    }, 0);
    return { totalVentas, totalComisionable, totalExcluido, totalComisiones };
  }, [ventasSummary, vendedores]);

  // Handle card click
  const handleCardClick = (v: Vendedor) => {
    setSelectedVendedor(v);
    setShowCatBreakdown(false);
  };

  const handleBackToGrid = () => {
    setSelectedVendedor(null);
    setVentasDetalle([]);
  };

  // Format time for display
  const formatHora = (hora: string) => {
    if (!hora) return "-";
    return hora.substring(0, 5); // HH:MM
  };

  // ========================
  // RENDER: DETAIL VIEW
  // ========================
  if (selectedVendedor) {
    const v = selectedVendedor;
    const s = ventasSummary[v.id] || { total: 0, comisionable: 0, excluidoPorCategoria: {} };
    const totalExcluido = Object.values(s.excluidoPorCategoria).reduce((a, b) => a + b, 0);
    const comisionEstimada = s.comisionable * ((v.comision_porcentaje || 0) / 100);

    return (
      <div className="p-3 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-4 sm:space-y-6">
        {/* Back button + header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleBackToGrid} className="gap-1.5">
            <ArrowLeft className="w-4 h-4" />
            Volver
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
              <span className="text-lg font-bold text-primary">
                {v.nombre.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)}
              </span>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">{v.nombre}</h1>
              {v.email && <p className="text-sm text-muted-foreground">{v.email}</p>}
            </div>
            <Badge variant="default" className="font-mono text-sm ml-2">
              {v.comision_porcentaje || 0}%
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openEditComision(v)}>
              <Percent className="w-4 h-4" />
              % Comision
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openExclusions(v)}>
              <ShieldX className="w-4 h-4" />
              Exclusiones
            </Button>
          </div>
        </div>

        {/* Period indicator */}
        <p className="text-sm text-muted-foreground">
          Periodo: <span className="font-medium text-foreground">{periodLabel}</span>
        </p>

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground mb-1">Ventas totales</p>
              <p className="text-lg font-bold">{formatCurrency(s.total)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground mb-1">Excluido</p>
                {totalExcluido > 0 && (
                  <button
                    onClick={() => setShowCatBreakdown(!showCatBreakdown)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    {showCatBreakdown ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
              <p className="text-lg font-bold text-destructive">
                {totalExcluido > 0 ? `-${formatCurrency(totalExcluido)}` : formatCurrency(0)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground mb-1">Comisionable</p>
              <p className="text-lg font-bold">{formatCurrency(s.comisionable)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground mb-1">Comision</p>
              <p className="text-lg font-bold text-emerald-600">{formatCurrency(comisionEstimada)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Category breakdown (expandable) */}
        {showCatBreakdown && totalExcluido > 0 && (
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
                Desglose de categorias excluidas
              </p>
              <div className="space-y-1.5">
                {Object.entries(s.excluidoPorCategoria)
                  .sort((a, b) => b[1] - a[1])
                  .map(([catId, monto]) => (
                    <div key={catId} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{catMap[catId] || catId}</span>
                      <span className="font-medium text-destructive">-{formatCurrency(monto)}</span>
                    </div>
                  ))}
                <Separator className="my-1.5" />
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span>Total excluido</span>
                  <span className="text-destructive">-{formatCurrency(totalExcluido)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Sales table */}
        <Card>
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b">
              <h3 className="font-semibold text-sm">Ventas del periodo</h3>
              <p className="text-xs text-muted-foreground">{ventasDetalle.length} ventas</p>
            </div>
            {loadingDetalle ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : ventasDetalle.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <DollarSign className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Sin ventas en este periodo</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Fecha</th>
                      <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Hora</th>
                      <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Comprobante</th>
                      <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Cliente</th>
                      <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">Total</th>
                      <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">Comision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ventasDetalle.map((venta) => (
                      <tr key={venta.id} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 px-4 text-muted-foreground">{venta.fecha}</td>
                        <td className="py-2.5 px-4 text-muted-foreground">{formatHora(venta.hora)}</td>
                        <td className="py-2.5 px-4 font-mono text-xs">{venta.nro_comprobante || "-"}</td>
                        <td className="py-2.5 px-4">{venta.cliente_nombre}</td>
                        <td className="py-2.5 px-4 text-right font-medium">{formatCurrency(venta.total)}</td>
                        <td className="py-2.5 px-4 text-right font-semibold text-emerald-600">{formatCurrency(venta.comision)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/30 font-semibold">
                      <td colSpan={4} className="py-2.5 px-4 text-right">Totales</td>
                      <td className="py-2.5 px-4 text-right">{formatCurrency(ventasDetalle.reduce((a, v) => a + v.total, 0))}</td>
                      <td className="py-2.5 px-4 text-right text-emerald-600">{formatCurrency(ventasDetalle.reduce((a, v) => a + v.comision, 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Dialogs (same as grid view) */}
        {renderEditDialog()}
        {renderExclDialog()}
      </div>
    );
  }

  // ========================
  // RENDER HELPERS (Dialogs)
  // ========================
  function renderEditDialog() {
    return (
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Percent className="w-5 h-5" />
              Comision: {editVendedor?.nombre}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Porcentaje de comision</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  max="100"
                  value={editComision}
                  onChange={(e) => setEditComision(e.target.value)}
                  placeholder="0"
                  className="font-mono"
                />
                <span className="text-lg font-medium text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Se aplica sobre el monto comisionable (excluyendo categorias configuradas)
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveComision} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Guardar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  function renderExclDialog() {
    return (
      <Dialog open={exclDialogOpen} onOpenChange={setExclDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldX className="w-5 h-5" />
              Categorias excluidas: {exclVendedor?.nombre}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Selecciona las categorias que <strong>no</strong> deben contar para la comision de este vendedor.
          </p>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar categoria..."
              value={catSearch}
              onChange={(e) => setCatSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <Separator />

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setExclCategorias(new Set(categorias.map((c) => c.id)))}>
              Excluir todas
            </Button>
            <Button variant="outline" size="sm" onClick={() => setExclCategorias(new Set())}>
              Limpiar
            </Button>
            <Badge variant="secondary" className="ml-auto self-center">
              {exclCategorias.size} excluida{exclCategorias.size !== 1 ? "s" : ""}
            </Badge>
          </div>

          <div className="space-y-1 max-h-[40vh] overflow-y-auto">
            {filteredCategorias.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No se encontraron categorias</p>
            ) : (
              filteredCategorias.map((cat) => {
                const isExcluded = exclCategorias.has(cat.id);
                return (
                  <label
                    key={cat.id}
                    className={`flex items-center gap-3 py-2.5 px-3 rounded-lg cursor-pointer transition-colors ${
                      isExcluded ? "bg-destructive/5 hover:bg-destructive/10" : "hover:bg-muted/50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isExcluded}
                      onChange={() => toggleExclusion(cat.id)}
                      className="rounded border-border h-4 w-4 accent-primary"
                    />
                    <span className="text-sm flex-1">{cat.nombre}</span>
                    {isExcluded && (
                      <Badge variant="destructive" className="text-[10px]">Excluida</Badge>
                    )}
                  </label>
                );
              })
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setExclDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveExclusions} disabled={savingExcl}>
              {savingExcl && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Guardar Exclusiones
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ========================
  // RENDER: MAIN GRID VIEW
  // ========================
  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <UserCheck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Vendedores</h1>
            <p className="text-sm text-muted-foreground">
              Comisiones y rendimiento por vendedor
            </p>
          </div>
        </div>
        <Badge variant="secondary">{vendedores.length} vendedores</Badge>
      </div>

      {/* Period Selector */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-end gap-3">
            {/* Quick period tabs */}
            <div className="flex items-center rounded-lg border bg-muted/50 p-0.5">
              {([
                { key: "today" as QuickPeriod, label: "Hoy" },
                { key: "week" as QuickPeriod, label: "Esta semana" },
                { key: "month" as QuickPeriod, label: "Este mes" },
                { key: "custom" as QuickPeriod, label: "Personalizado" },
              ]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setQuickPeriod(key)}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    quickPeriod === key
                      ? "bg-background shadow-sm font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Custom date controls */}
            {quickPeriod === "custom" && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Tipo</Label>
                  <Select value={filterMode} onValueChange={(v) => setFilterMode((v ?? "day") as "day" | "month" | "range")}>
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="day">Dia</SelectItem>
                      <SelectItem value="month">Mes</SelectItem>
                      <SelectItem value="range">Rango</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {filterMode === "day" && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Fecha</Label>
                    <Input
                      type="date"
                      value={filterDay}
                      onChange={(e) => setFilterDay(e.target.value)}
                      className="w-40"
                    />
                  </div>
                )}

                {filterMode === "month" && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Mes</Label>
                      <Select value={filterMonth} onValueChange={(v) => setFilterMonth(v ?? "1")}>
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[
                            "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
                            "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
                          ].map((name, i) => (
                            <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Ano</Label>
                      <Select value={filterYear} onValueChange={(v) => setFilterYear(v ?? String(new Date().getFullYear()))}>
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map((y) => (
                            <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                {filterMode === "range" && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Desde</Label>
                      <Input
                        type="date"
                        value={filterFrom}
                        onChange={(e) => setFilterFrom(e.target.value)}
                        className="w-40"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Hasta</Label>
                      <Input
                        type="date"
                        value={filterTo}
                        onChange={(e) => setFilterTo(e.target.value)}
                        className="w-40"
                      />
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Vendedores Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : vendedores.length === 0 ? (
        <Card>
          <CardContent className="py-16">
            <div className="text-center text-muted-foreground">
              <UserCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No hay vendedores activos</p>
              <p className="text-sm mt-1">Crea usuarios con rol &quot;vendedor&quot; en la seccion Usuarios</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {vendedores.map((v) => {
            const s = ventasSummary[v.id] || { total: 0, comisionable: 0, excluidoPorCategoria: {} };
            const comisionEstimada = s.comisionable * ((v.comision_porcentaje || 0) / 100);

            return (
              <Card
                key={v.id}
                className="cursor-pointer hover:shadow-md hover:border-primary/30 transition-all group"
                onClick={() => handleCardClick(v)}
              >
                <CardContent className="pt-5 pb-5">
                  {/* Top: Name + Badge */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 group-hover:bg-primary/15 transition-colors">
                        <span className="text-sm font-bold text-primary">
                          {v.nombre.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-base truncate">{v.nombre}</p>
                        {v.email && (
                          <p className="text-xs text-muted-foreground truncate">{v.email}</p>
                        )}
                      </div>
                    </div>
                    <Badge
                      variant={v.comision_porcentaje > 0 ? "default" : "secondary"}
                      className="font-mono text-xs flex-shrink-0 ml-2"
                    >
                      {v.comision_porcentaje || 0}%
                    </Badge>
                  </div>

                  <Separator className="mb-3" />

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-0.5">Ventas</p>
                      <p className="font-semibold text-sm">{formatCurrency(s.total)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-0.5">Comision</p>
                      <p className="font-semibold text-sm text-emerald-600">{formatCurrency(comisionEstimada)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Global Summary */}
      {!loading && vendedores.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Total ventas</p>
              </div>
              <p className="text-lg font-bold">{formatCurrency(globalTotals.totalVentas)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <ShieldX className="w-4 h-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Total excluido</p>
              </div>
              <p className="text-lg font-bold text-destructive">
                {globalTotals.totalExcluido > 0 ? `-${formatCurrency(globalTotals.totalExcluido)}` : formatCurrency(0)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Total comisionable</p>
              </div>
              <p className="text-lg font-bold">{formatCurrency(globalTotals.totalComisionable)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Total comisiones</p>
              </div>
              <p className="text-lg font-bold text-emerald-600">{formatCurrency(globalTotals.totalComisiones)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Dialogs */}
      {renderEditDialog()}
      {renderExclDialog()}
    </div>
  );
}
