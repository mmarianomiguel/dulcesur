"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { todayARG, formatCurrency } from "@/lib/formatters";
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
  AlertTriangle,
  Package,
  Search,
  ShoppingCart,
  Sparkles,
  Loader2,
  XCircle,
  CheckCircle2,
  ArrowUpDown,
  Filter,
  X,
  ArrowRight,
} from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { LoadingSpinner } from "@/components/loading-spinner";
import { EmptyState } from "@/components/empty-state";
import { showAdminToast } from "@/components/admin-toast";
import type { ReposicionItem, Categoria, Subcategoria, Marca, ActiveTab } from "./types";

/* ───────── props ───────── */

interface StockCriticoProps {
  onHacerPedido: (proveedorId: string, items: ReposicionItem[]) => void;
  onGenerarTodos: () => void;
  setActiveTab: (tab: ActiveTab) => void;
}

/* ───────── proveedor group type ───────── */

interface ProveedorGroup {
  proveedorId: string | null;
  proveedorNombre: string;
  items: ReposicionItem[];
  costoEstimado: number;
}

/* ───────── component ───────── */

export default function StockCritico({ onHacerPedido, onGenerarTodos, setActiveTab }: StockCriticoProps) {
  const [items, setItems] = useState<ReposicionItem[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([]);
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [proveedores, setProveedores] = useState<{ id: string; nombre: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategoria, setFilterCategoria] = useState("all");
  const [filterSubcategoria, setFilterSubcategoria] = useState("all");
  const [filterMarca, setFilterMarca] = useState("all");
  const [filterProveedor, setFilterProveedor] = useState("all");
  const [filterNivel, setFilterNivel] = useState<"all" | "critico" | "bajo">("all");
  const [sortBy, setSortBy] = useState<"nivel" | "nombre" | "faltante">("nivel");
  const [showFilters, setShowFilters] = useState(false);

  // Searchable dropdown states
  const [catSearch, setCatSearch] = useState("");
  const [catOpen, setCatOpen] = useState(false);
  const [subcatSearch, setSubcatSearch] = useState("");
  const [subcatOpen, setSubcatOpen] = useState(false);
  const [marcaSearch, setMarcaSearch] = useState("");
  const [marcaOpen, setMarcaOpen] = useState(false);
  const [provSearch, setProvSearch] = useState("");
  const [provOpen, setProvOpen] = useState(false);
  const catRef = useRef<HTMLDivElement>(null);
  const subcatRef = useRef<HTMLDivElement>(null);
  const marcaRef = useRef<HTMLDivElement>(null);
  const provRef = useRef<HTMLDivElement>(null);

  // Generate pedido dialog
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Click outside handler for dropdowns
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (catRef.current && !catRef.current.contains(e.target as Node)) setCatOpen(false);
      if (subcatRef.current && !subcatRef.current.contains(e.target as Node)) setSubcatOpen(false);
      if (marcaRef.current && !marcaRef.current.contains(e.target as Node)) setMarcaOpen(false);
      if (provRef.current && !provRef.current.contains(e.target as Node)) setProvOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /* ── data fetching ── */

  const fetchData = useCallback(async () => {
    setLoading(true);

    const [{ data: productos }, { data: cats }, { data: subcats }, { data: mrs }, { data: provs }] = await Promise.all([
      supabase
        .from("productos")
        .select("id, codigo, nombre, imagen_url, stock, stock_minimo, stock_maximo, costo, categoria_id, subcategoria_id, marca_id, categorias(nombre), subcategorias(nombre), marcas(nombre), producto_proveedores(proveedor_id, precio_proveedor, cantidad_minima_pedido, es_principal, proveedores(nombre))")
        .eq("activo", true)
        .order("nombre"),
      supabase.from("categorias").select("id, nombre").order("nombre"),
      supabase.from("subcategorias").select("id, nombre, categoria_id").order("nombre"),
      supabase.from("marcas").select("id, nombre").order("nombre"),
      supabase.from("proveedores").select("id, nombre").eq("activo", true).order("nombre"),
    ]);

    setCategorias((cats as Categoria[]) || []);
    setSubcategorias((subcats as Subcategoria[]) || []);
    setMarcas((mrs as Marca[]) || []);
    setProveedores((provs as { id: string; nombre: string }[]) || []);

    // Fetch sales velocity (last 30 days)
    const hace30 = new Date();
    hace30.setDate(hace30.getDate() - 30);
    const desde30 = hace30.toISOString().slice(0, 10);
    const { data: ventaIds30 } = await supabase.from("ventas").select("id").gte("fecha", desde30).neq("estado", "anulada");
    const velMap: Record<string, number> = {};
    if (ventaIds30 && ventaIds30.length > 0) {
      const ids = ventaIds30.map((v: any) => v.id);
      // Batch in chunks of 200
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const { data: vitems } = await supabase.from("venta_items").select("producto_id, cantidad").in("venta_id", chunk);
        if (vitems) {
          for (const item of vitems as any[]) {
            velMap[item.producto_id] = (velMap[item.producto_id] || 0) + Number(item.cantidad);
          }
        }
      }
    }

    if (productos) {
      const mapped: ReposicionItem[] = (productos as any[]).map((p) => {
        const stock = p.stock ?? 0;
        const minimo = p.stock_minimo ?? 0;
        const maximo = p.stock_maximo ?? 0;

        // Get principal provider or first one
        const ppList = p.producto_proveedores || [];
        const pp = ppList.find((x: any) => x.es_principal) || ppList[0] || null;

        // Determine level
        let nivel: "critico" | "bajo" | "ok";
        if (stock <= 0) {
          nivel = "critico";
        } else if (minimo > 0 && stock <= minimo) {
          nivel = "bajo";
        } else {
          nivel = "ok";
        }

        // Calculate how many to order
        let faltante: number;
        if (maximo > 0) {
          faltante = Math.max(1, maximo - stock);
        } else if (stock < 0) {
          faltante = Math.abs(stock);
        } else if (minimo > 0 && stock <= minimo) {
          faltante = Math.max(1, minimo * 2 - stock);
        } else {
          faltante = 0;
        }

        return {
          producto_id: p.id,
          codigo: p.codigo || "",
          nombre: p.nombre,
          imagen_url: p.imagen_url || null,
          categoria_id: p.categoria_id || null,
          categoria: p.categorias?.nombre || "Sin categoria",
          subcategoria_id: p.subcategoria_id || null,
          subcategoria: (p.subcategorias as any)?.nombre || "",
          marca_id: p.marca_id || null,
          marca: p.marcas?.nombre || "",
          stock,
          stock_minimo: minimo,
          stock_maximo: maximo,
          costo: p.costo || 0,
          proveedor_id: pp?.proveedor_id || null,
          proveedor_nombre: pp?.proveedores?.nombre || null,
          precio_proveedor: pp?.precio_proveedor || null,
          cantidad_minima_pedido: pp?.cantidad_minima_pedido || 1,
          velDiaria: Math.round(((velMap[p.id] || 0) / 30) * 10) / 10,
          diasStock: (velMap[p.id] || 0) > 0 && stock > 0 ? Math.round(stock / ((velMap[p.id] || 1) / 30)) : (velMap[p.id] || 0) > 0 ? 0 : null,
          nivel,
          faltante,
        };
      });

      setItems(mapped);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ── filtered subcategorias by selected category ── */

  const filteredSubcategorias = useMemo(
    () => subcategorias.filter((s) => filterCategoria === "all" || s.categoria_id === filterCategoria),
    [subcategorias, filterCategoria]
  );

  /* ── filtered & sorted ── */

  const filtered = useMemo(() => {
    let result = items.filter((i) => i.nivel !== "ok");

    if (search) {
      const term = search.toLowerCase();
      result = result.filter(
        (i) =>
          i.nombre.toLowerCase().includes(term) ||
          i.codigo.toLowerCase().includes(term)
      );
    }

    if (filterCategoria !== "all") {
      result = result.filter((i) => i.categoria_id === filterCategoria);
    }

    if (filterSubcategoria !== "all") {
      result = result.filter((i) => i.subcategoria_id === filterSubcategoria);
    }

    if (filterMarca !== "all") {
      result = result.filter((i) => i.marca_id === filterMarca);
    }

    if (filterProveedor !== "all") {
      if (filterProveedor === "sin_proveedor") {
        result = result.filter((i) => !i.proveedor_id);
      } else {
        result = result.filter((i) => i.proveedor_id === filterProveedor);
      }
    }

    if (filterNivel !== "all") {
      result = result.filter((i) => i.nivel === filterNivel);
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === "nivel") {
        const order = { critico: 0, bajo: 1, ok: 2 };
        return order[a.nivel] - order[b.nivel] || a.nombre.localeCompare(b.nombre);
      }
      if (sortBy === "faltante") return b.faltante - a.faltante;
      return a.nombre.localeCompare(b.nombre);
    });

    return result;
  }, [items, search, filterCategoria, filterSubcategoria, filterMarca, filterProveedor, filterNivel, sortBy]);

  /* ── stats ── */

  const stockItems = items;
  const criticos = stockItems.filter((i) => i.nivel === "critico").length;
  const bajos = stockItems.filter((i) => i.nivel === "bajo").length;
  const sinProveedorCount = stockItems.filter((i) => i.nivel !== "ok" && !i.proveedor_id).length;
  const costoTotal = stockItems
    .filter((i) => i.nivel !== "ok")
    .reduce((a, i) => a + i.faltante * (i.precio_proveedor || i.costo), 0);

  /* ── grouped by proveedor ── */

  const groups = useMemo(() => {
    const map: Record<string, ProveedorGroup> = {};

    for (const item of filtered) {
      const key = item.proveedor_id || "__sin_proveedor__";
      if (!map[key]) {
        map[key] = {
          proveedorId: item.proveedor_id,
          proveedorNombre: item.proveedor_nombre || "Sin proveedor asignado",
          items: [],
          costoEstimado: 0,
        };
      }
      map[key].items.push(item);
      map[key].costoEstimado += item.faltante * (item.precio_proveedor || item.costo);
    }

    // Sort: proveedores with names first, "sin proveedor" at the end
    const entries = Object.values(map);
    entries.sort((a, b) => {
      if (!a.proveedorId && b.proveedorId) return 1;
      if (a.proveedorId && !b.proveedorId) return -1;
      return a.proveedorNombre.localeCompare(b.proveedorNombre);
    });

    return entries;
  }, [filtered]);

  /* ── generate pedidos (all groups) ── */

  const handleGeneratePedidos = async () => {
    setGenerating(true);
    setGenerateResult(null);

    try {
      const itemsConProveedor = filtered.filter((i) => i.proveedor_id);
      if (itemsConProveedor.length === 0) {
        setGenerateResult({ ok: false, message: "No hay productos con proveedor asignado para generar pedidos." });
        setGenerating(false);
        return;
      }

      // Group by provider
      const provGroups: Record<string, { nombre: string; items: ReposicionItem[] }> = {};
      for (const item of itemsConProveedor) {
        if (!item.proveedor_id) continue;
        if (!provGroups[item.proveedor_id]) {
          provGroups[item.proveedor_id] = { nombre: item.proveedor_nombre || "", items: [] };
        }
        provGroups[item.proveedor_id].items.push(item);
      }

      let pedidosCreados = 0;

      for (const [provId, group] of Object.entries(provGroups)) {
        const totalEstimado = group.items.reduce((a, i) => {
          const precio = i.precio_proveedor || i.costo;
          return a + i.faltante * precio;
        }, 0);

        const { data: pedido, error } = await supabase
          .from("pedidos_proveedor")
          .insert({
            proveedor_id: provId,
            fecha: todayARG(),
            estado: "Borrador",
            costo_total_estimado: totalEstimado,
            observacion: "Generado desde Stock Critico",
          })
          .select("id")
          .single();

        if (error || !pedido) continue;

        const rows = group.items.map((item) => ({
          pedido_id: pedido.id,
          producto_id: item.producto_id,
          codigo: item.codigo,
          descripcion: item.nombre,
          cantidad: item.faltante,
          faltante: item.faltante,
          precio_unitario: item.precio_proveedor || item.costo,
          subtotal: item.faltante * (item.precio_proveedor || item.costo),
        }));

        await supabase.from("pedido_proveedor_items").insert(rows);
        pedidosCreados++;
      }

      setGenerateResult({
        ok: true,
        message: `Se crearon ${pedidosCreados} pedido(s) como borrador para ${Object.keys(provGroups).length} proveedor(es).`,
      });

      if (pedidosCreados > 0) {
        onGenerarTodos();
      }
    } catch (err: any) {
      setGenerateResult({ ok: false, message: err?.message || "Error inesperado" });
    } finally {
      setGenerating(false);
    }
  };

  // Count active filters
  const activeFilterCount = [filterCategoria, filterSubcategoria, filterMarca, filterProveedor].filter((f) => f !== "all").length;

  /* ═══════════════════ RENDER ═══════════════════ */

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          title="Criticos"
          value={criticos}
          subtitle="Sin stock"
          icon={XCircle}
          iconColor="text-red-500"
          iconBg="bg-red-500/10"
        />
        <StatCard
          title="Stock bajo"
          value={bajos}
          subtitle="Bajo minimo"
          icon={AlertTriangle}
          iconColor="text-amber-500"
          iconBg="bg-amber-500/10"
        />
        <StatCard
          title="Sin proveedor"
          value={sinProveedorCount}
          subtitle="No se pueden pedir"
          icon={Package}
          iconColor="text-gray-500"
          iconBg="bg-gray-500/10"
        />
        <StatCard
          title="Costo reposicion"
          value={formatCurrency(costoTotal)}
          subtitle={`${stockItems.filter((i) => i.nivel !== "ok").length} productos`}
          icon={ShoppingCart}
          iconColor="text-primary"
          iconBg="bg-primary/10"
        />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex-1">
              <Label className="uppercase text-xs text-muted-foreground font-semibold tracking-wide mb-1.5 block">Buscar</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por codigo o descripcion..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="flex-shrink-0 self-end flex gap-2 flex-wrap">
              <Select value={filterNivel} onValueChange={(v) => setFilterNivel((v || "all") as any)}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Urgencia" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="critico">Criticos</SelectItem>
                  <SelectItem value="bajo">Stock bajo</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="w-4 h-4" />
                Filtros
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-1 text-[10px] h-5 px-1.5">{activeFilterCount}</Badge>
                )}
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                title="Cambiar orden"
                onClick={() => setSortBy((prev) => prev === "nivel" ? "faltante" : prev === "faltante" ? "nombre" : "nivel")}
              >
                <ArrowUpDown className="w-4 h-4" />
              </Button>
              <Button onClick={() => setShowGenerateDialog(true)} disabled={filtered.length === 0}>
                <Sparkles className="w-4 h-4 mr-2" />
                Generar todos
              </Button>
            </div>
          </div>

          {showFilters && (
            <>
              <Separator />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {/* Categoria searchable */}
                <div ref={catRef}>
                  <Label className="uppercase text-xs text-muted-foreground font-semibold tracking-wide mb-1.5 block">Categoria</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar categoria..."
                      value={filterCategoria !== "all" ? (categorias.find((c) => c.id === filterCategoria)?.nombre ?? catSearch) : catSearch}
                      onChange={(e) => { setCatSearch(e.target.value); setFilterCategoria("all"); setFilterSubcategoria("all"); setCatOpen(true); }}
                      onFocus={() => setCatOpen(true)}
                      className="pl-9"
                    />
                    {filterCategoria !== "all" && (
                      <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => { setFilterCategoria("all"); setCatSearch(""); setFilterSubcategoria("all"); }}>
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    {catOpen && filterCategoria === "all" && (
                      <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
                        <button className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors" onClick={() => { setFilterCategoria("all"); setCatSearch(""); setCatOpen(false); }}>Todas</button>
                        {categorias.filter((c) => c.nombre.toLowerCase().includes(catSearch.toLowerCase())).map((c) => (
                          <button key={c.id} className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors"
                            onClick={() => { setFilterCategoria(c.id); setCatSearch(""); setCatOpen(false); setFilterSubcategoria("all"); }}>
                            {c.nombre}
                          </button>
                        ))}
                        {categorias.filter((c) => c.nombre.toLowerCase().includes(catSearch.toLowerCase())).length === 0 && (
                          <p className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Subcategoria searchable */}
                <div ref={subcatRef}>
                  <Label className="uppercase text-xs text-muted-foreground font-semibold tracking-wide mb-1.5 block">Subcategoria</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar subcategoria..."
                      value={filterSubcategoria !== "all" ? (filteredSubcategorias.find((s) => s.id === filterSubcategoria)?.nombre ?? subcatSearch) : subcatSearch}
                      onChange={(e) => { setSubcatSearch(e.target.value); setFilterSubcategoria("all"); setSubcatOpen(true); }}
                      onFocus={() => setSubcatOpen(true)}
                      className="pl-9"
                    />
                    {filterSubcategoria !== "all" && (
                      <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => { setFilterSubcategoria("all"); setSubcatSearch(""); }}>
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    {subcatOpen && filterSubcategoria === "all" && (
                      <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
                        <button className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors" onClick={() => { setFilterSubcategoria("all"); setSubcatSearch(""); setSubcatOpen(false); }}>Todas</button>
                        {filteredSubcategorias.filter((s) => s.nombre.toLowerCase().includes(subcatSearch.toLowerCase())).map((s) => (
                          <button key={s.id} className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors"
                            onClick={() => { setFilterSubcategoria(s.id); setSubcatSearch(""); setSubcatOpen(false); }}>
                            {s.nombre}
                          </button>
                        ))}
                        {filteredSubcategorias.filter((s) => s.nombre.toLowerCase().includes(subcatSearch.toLowerCase())).length === 0 && (
                          <p className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Marca searchable */}
                <div ref={marcaRef}>
                  <Label className="uppercase text-xs text-muted-foreground font-semibold tracking-wide mb-1.5 block">Marca</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar marca..."
                      value={filterMarca !== "all" ? (marcas.find((m) => m.id === filterMarca)?.nombre ?? marcaSearch) : marcaSearch}
                      onChange={(e) => { setMarcaSearch(e.target.value); setFilterMarca("all"); setMarcaOpen(true); }}
                      onFocus={() => setMarcaOpen(true)}
                      className="pl-9"
                    />
                    {filterMarca !== "all" && (
                      <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => { setFilterMarca("all"); setMarcaSearch(""); }}>
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    {marcaOpen && filterMarca === "all" && (
                      <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
                        <button className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors" onClick={() => { setFilterMarca("all"); setMarcaSearch(""); setMarcaOpen(false); }}>Todas</button>
                        {marcas.filter((m) => m.nombre.toLowerCase().includes(marcaSearch.toLowerCase())).map((m) => (
                          <button key={m.id} className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors"
                            onClick={() => { setFilterMarca(m.id); setMarcaSearch(""); setMarcaOpen(false); }}>
                            {m.nombre}
                          </button>
                        ))}
                        {marcas.filter((m) => m.nombre.toLowerCase().includes(marcaSearch.toLowerCase())).length === 0 && (
                          <p className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Proveedor searchable */}
                <div ref={provRef}>
                  <Label className="uppercase text-xs text-muted-foreground font-semibold tracking-wide mb-1.5 block">Proveedor</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar proveedor..."
                      value={filterProveedor !== "all" ? (filterProveedor === "sin_proveedor" ? "Sin proveedor" : (proveedores.find((p) => p.id === filterProveedor)?.nombre ?? provSearch)) : provSearch}
                      onChange={(e) => { setProvSearch(e.target.value); setFilterProveedor("all"); setProvOpen(true); }}
                      onFocus={() => setProvOpen(true)}
                      className="pl-9"
                    />
                    {filterProveedor !== "all" && (
                      <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => { setFilterProveedor("all"); setProvSearch(""); }}>
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    {provOpen && filterProveedor === "all" && (
                      <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
                        <button className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors" onClick={() => { setFilterProveedor("all"); setProvSearch(""); setProvOpen(false); }}>Todos</button>
                        <button className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors italic text-muted-foreground" onClick={() => { setFilterProveedor("sin_proveedor"); setProvSearch(""); setProvOpen(false); }}>Sin proveedor</button>
                        {proveedores.filter((p) => p.nombre.toLowerCase().includes(provSearch.toLowerCase())).map((p) => (
                          <button key={p.id} className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors"
                            onClick={() => { setFilterProveedor(p.id); setProvSearch(""); setProvOpen(false); }}>
                            {p.nombre}
                          </button>
                        ))}
                        {proveedores.filter((p) => p.nombre.toLowerCase().includes(provSearch.toLowerCase())).length === 0 && (
                          <p className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          <p className="text-xs text-muted-foreground">
            Ordenado por: {sortBy === "nivel" ? "Urgencia" : sortBy === "faltante" ? "Cantidad faltante" : "Nombre"}
            {" "}&middot;{" "}{filtered.length} producto(s)
          </p>
        </CardContent>
      </Card>

      {/* Grouped by proveedor */}
      {loading ? (
        <LoadingSpinner />
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={CheckCircle2}
              title="Todo el stock esta en orden"
              description="No hay productos por debajo del minimo configurado"
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const isSinProveedor = !group.proveedorId;

            return (
              <Card key={group.proveedorId || "__sin_proveedor__"} className={isSinProveedor ? "border-dashed opacity-80" : ""}>
                <CardContent className="pt-6 space-y-4">
                  {/* Group header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 flex-shrink-0">
                        {isSinProveedor ? (
                          <Package className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ShoppingCart className="w-4 h-4 text-primary" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h3 className={`font-semibold truncate ${isSinProveedor ? "text-muted-foreground italic" : ""}`}>
                          {group.proveedorNombre}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {group.items.length} producto{group.items.length !== 1 ? "s" : ""}
                          {" "}&middot;{" "}{formatCurrency(group.costoEstimado)} est.
                        </p>
                      </div>
                    </div>
                    {!isSinProveedor && (
                      <Button
                        size="sm"
                        className="gap-2 flex-shrink-0"
                        onClick={() => onHacerPedido(group.proveedorId!, group.items)}
                      >
                        Hacer pedido
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  <Separator />

                  {/* Products in group */}
                  <div className="space-y-3">
                    {group.items.map((item) => {
                      const stockPct = item.stock_maximo > 0
                        ? Math.min(100, Math.max(0, (item.stock / item.stock_maximo) * 100))
                        : item.stock_minimo > 0
                        ? Math.min(100, Math.max(0, (item.stock / item.stock_minimo) * 100))
                        : 0;

                      const barColor = item.nivel === "critico" ? "bg-red-500" : "bg-amber-400";

                      return (
                        <div key={item.producto_id} className="rounded-lg border bg-muted/30 p-3 space-y-2">
                          {/* Row 1: Name + code + badge */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              {item.nivel === "critico" ? (
                                <Badge variant="destructive" className="text-[10px] font-medium flex-shrink-0">SIN STOCK</Badge>
                              ) : (
                                <Badge className="text-[10px] font-medium flex-shrink-0 bg-amber-500/15 text-amber-600 border-amber-500/30 hover:bg-amber-500/20">BAJO</Badge>
                              )}
                              <span className="font-medium text-sm truncate">{item.nombre}</span>
                            </div>
                            <span className="font-mono text-xs text-muted-foreground flex-shrink-0">{item.codigo}</span>
                          </div>

                          {/* Row 2: Stock bar */}
                          <div className="flex items-center gap-3">
                            <span className={`text-sm font-bold w-12 text-right flex-shrink-0 ${item.nivel === "critico" ? "text-red-500" : "text-amber-600"}`}>
                              {item.stock}
                            </span>
                            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${stockPct}%` }} />
                            </div>
                            <span className="text-xs text-muted-foreground flex-shrink-0 w-24 text-right">
                              Min: {item.stock_minimo} / Max: {item.stock_maximo}
                            </span>
                          </div>

                          {/* Row 3: Velocity, days, order qty */}
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            {item.velDiaria > 0 && (
                              <span>Vel: {item.velDiaria}/dia</span>
                            )}
                            {item.diasStock !== null && (
                              <span className={item.diasStock <= 7 ? "text-red-600 font-medium" : ""}>
                                {item.diasStock} dias
                              </span>
                            )}
                            {item.velDiaria === 0 && item.diasStock === null && (
                              <span>Sin ventas recientes</span>
                            )}
                            <span className="ml-auto font-semibold text-foreground text-sm">
                              Pedir {item.faltante} un.
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Footer total */}
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {filtered.length} producto(s) en {groups.length} grupo(s) necesitan reposicion
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Total estimado:</span>
                  <span className="text-lg font-bold">
                    {formatCurrency(filtered.reduce((a, i) => a + i.faltante * (i.precio_proveedor || i.costo), 0))}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Generate Pedidos Dialog */}
      <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Generar Pedidos Automaticos</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!generateResult ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Se crearan pedidos en estado <strong>Borrador</strong> agrupados por proveedor para los{" "}
                  <strong>{filtered.filter((i) => i.proveedor_id).length}</strong> productos con proveedor asignado.
                </p>

                {filtered.some((i) => !i.proveedor_id) && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="w-4 h-4 inline mr-2" />
                    {filtered.filter((i) => !i.proveedor_id).length} producto(s) no tienen proveedor y no se incluiran.
                  </div>
                )}

                <div className="rounded-lg border p-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Productos</span>
                    <span className="font-medium">{filtered.filter((i) => i.proveedor_id).length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Proveedores</span>
                    <span className="font-medium">
                      {new Set(filtered.filter((i) => i.proveedor_id).map((i) => i.proveedor_id)).size}
                    </span>
                  </div>
                  <div className="flex justify-between border-t pt-1 mt-1">
                    <span className="text-muted-foreground font-medium">Costo total estimado</span>
                    <span className="font-bold">
                      {formatCurrency(filtered.filter((i) => i.proveedor_id).reduce((a, i) => a + i.faltante * (i.precio_proveedor || i.costo), 0))}
                    </span>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setShowGenerateDialog(false)}>Cancelar</Button>
                  <Button onClick={handleGeneratePedidos} disabled={generating}>
                    {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                    Generar Pedidos
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className={`rounded-lg border p-4 text-sm flex items-start gap-3 ${
                  generateResult.ok
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400"
                }`}>
                  {generateResult.ok ? (
                    <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  )}
                  <p>{generateResult.message}</p>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => { setShowGenerateDialog(false); setGenerateResult(null); }}>
                    Cerrar
                  </Button>
                  {generateResult.ok && (
                    <Button onClick={() => { setShowGenerateDialog(false); setGenerateResult(null); setActiveTab("pedidos"); }}>
                      Ver Pedidos
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
