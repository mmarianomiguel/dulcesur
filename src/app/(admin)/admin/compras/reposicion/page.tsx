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
  Save,
  Filter,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { LoadingSpinner } from "@/components/loading-spinner";
import { EmptyState } from "@/components/empty-state";

/* ───────── types ───────── */

interface ReposicionItem {
  producto_id: string;
  codigo: string;
  nombre: string;
  imagen_url: string | null;
  categoria_id: string | null;
  categoria: string;
  subcategoria_id: string | null;
  subcategoria: string;
  marca_id: string | null;
  marca: string;
  stock: number;
  stock_minimo: number;
  stock_maximo: number;
  costo: number;
  proveedor_id: string | null;
  proveedor_nombre: string | null;
  precio_proveedor: number | null;
  cantidad_minima_pedido: number;
  nivel: "critico" | "bajo" | "ok";
  faltante: number;
  velDiaria: number;
  diasStock: number | null;
}

interface Categoria {
  id: string;
  nombre: string;
}

interface Subcategoria {
  id: string;
  nombre: string;
  categoria_id: string;
}

interface Marca {
  id: string;
  nombre: string;
}

interface Proveedor {
  id: string;
  nombre: string;
}

/* ───────── component ───────── */

export default function ReposicionPage() {
  const [items, setItems] = useState<ReposicionItem[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([]);
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
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
    setProveedores((provs as Proveedor[]) || []);

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

  const criticos = items.filter((i) => i.nivel === "critico").length;
  const bajos = items.filter((i) => i.nivel === "bajo").length;
  const sinProveedor = items.filter((i) => i.nivel !== "ok" && !i.proveedor_id).length;
  const costoReposicion = filtered.reduce((a, i) => {
    const precio = i.precio_proveedor || i.costo;
    return a + i.faltante * precio;
  }, 0);

  /* ── generate pedidos ── */

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
      const groups: Record<string, { nombre: string; items: ReposicionItem[] }> = {};
      for (const item of itemsConProveedor) {
        if (!item.proveedor_id) continue;
        if (!groups[item.proveedor_id]) {
          groups[item.proveedor_id] = { nombre: item.proveedor_nombre || "", items: [] };
        }
        groups[item.proveedor_id].items.push(item);
      }

      let pedidosCreados = 0;

      for (const [provId, group] of Object.entries(groups)) {
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
            observacion: "Generado desde Dashboard de Reposicion",
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
        message: `Se crearon ${pedidosCreados} pedido(s) como borrador para ${Object.keys(groups).length} proveedor(es).`,
      });
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
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <PageHeader
        title="Reposicion de Stock"
        description="Productos con stock por debajo del minimo configurado"
        actions={
          <Button onClick={() => setShowGenerateDialog(true)} disabled={filtered.length === 0}>
            <Sparkles className="w-4 h-4 mr-2" />
            Generar Pedidos
          </Button>
        }
      />

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
          value={sinProveedor}
          subtitle="No se pueden pedir"
          icon={Package}
          iconColor="text-gray-500"
          iconBg="bg-gray-500/10"
        />
        <StatCard
          title="Costo reposicion"
          value={formatCurrency(costoReposicion)}
          subtitle={`${filtered.length} productos`}
          icon={ShoppingCart}
          iconColor="text-primary"
          iconBg="bg-primary/10"
        />
      </div>

      {/* Filters */}
      <Card className="overflow-visible">
        <CardContent className="pt-6 space-y-4 overflow-visible">
          <div className="flex items-center gap-3">
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
            <div className="flex-shrink-0 self-end flex gap-2">
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

      {/* Table */}
      <Card>
        <CardContent className="pt-0">
          {loading ? (
            <LoadingSpinner />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Todo el stock esta en orden"
              description="No hay productos por debajo del minimo configurado"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-3 px-4 font-medium">Estado</th>
                    <th className="text-left py-3 px-4 font-medium">Codigo</th>
                    <th className="text-left py-3 px-4 font-medium">Producto</th>
                    <th className="text-left py-3 px-4 font-medium">Categoria</th>
                    <th className="text-left py-3 px-4 font-medium hidden lg:table-cell">Marca</th>
                    <th className="text-center py-3 px-4 font-medium">Stock</th>
                    <th className="text-center py-3 px-4 font-medium">Min</th>
                    <th className="text-center py-3 px-4 font-medium">Max</th>
                    <th className="text-center py-3 px-4 font-medium">A pedir</th>
                    <th className="text-center py-3 px-4 font-medium hidden xl:table-cell">Vel/día</th>
                    <th className="text-center py-3 px-4 font-medium hidden xl:table-cell">Días Stock</th>
                    <th className="text-left py-3 px-4 font-medium">Proveedor</th>
                    <th className="text-right py-3 px-4 font-medium">Costo unit.</th>
                    <th className="text-right py-3 px-4 font-medium">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => {
                    const precio = item.precio_proveedor || item.costo;
                    return (
                      <tr
                        key={item.producto_id}
                        className="border-b last:border-0 hover:bg-muted/50 transition-colors"
                      >
                        <td className="py-2.5 px-4">
                          {item.nivel === "critico" ? (
                            <Badge variant="destructive" className="text-[10px] font-medium">SIN STOCK</Badge>
                          ) : (
                            <Badge className="text-[10px] font-medium bg-amber-500/15 text-amber-600 border-amber-500/30 hover:bg-amber-500/20">BAJO</Badge>
                          )}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-xs text-muted-foreground">{item.codigo}</td>
                        <td className="py-2.5 px-4 font-medium">{item.nombre}</td>
                        <td className="py-2.5 px-4">
                          <Badge variant="secondary" className="text-[10px] font-normal">{item.categoria}</Badge>
                        </td>
                        <td className="py-2.5 px-4 hidden lg:table-cell text-muted-foreground">{item.marca || "\u2014"}</td>
                        <td className="py-2.5 px-4 text-center">
                          <span className={item.nivel === "critico" ? "text-red-500 font-bold" : "text-amber-600 font-semibold"}>
                            {item.stock}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-center text-muted-foreground">{item.stock_minimo}</td>
                        <td className="py-2.5 px-4 text-center text-muted-foreground">{item.stock_maximo}</td>
                        <td className="py-2.5 px-4 text-center font-semibold">{item.faltante}</td>
                        <td className="py-2.5 px-4 text-center hidden xl:table-cell text-muted-foreground">
                          {item.velDiaria > 0 ? item.velDiaria : "—"}
                        </td>
                        <td className={`py-2.5 px-4 text-center hidden xl:table-cell font-medium ${item.diasStock !== null && item.diasStock <= 7 ? "text-red-600" : "text-muted-foreground"}`}>
                          {item.diasStock !== null ? `${item.diasStock}d` : "—"}
                        </td>
                        <td className="py-2.5 px-4">
                          {item.proveedor_nombre ? (
                            <span className="text-sm">{item.proveedor_nombre}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">Sin asignar</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          {item.precio_proveedor ? (
                            <span>{formatCurrency(item.precio_proveedor)}</span>
                          ) : (
                            <span className="text-muted-foreground">{formatCurrency(item.costo)}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right font-semibold">
                          {formatCurrency(item.faltante * precio)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Footer total */}
              <div className="flex items-center justify-between border-t bg-muted/30 rounded-b-lg px-4 py-3">
                <span className="text-xs text-muted-foreground">
                  {filtered.length} producto(s) necesitan reposicion
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Total estimado:</span>
                  <span className="text-lg font-bold">{formatCurrency(costoReposicion)}</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

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
                    <span className="font-bold">{formatCurrency(costoReposicion)}</span>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setShowGenerateDialog(false)}>Cancelar</Button>
                  <Button onClick={handleGeneratePedidos} disabled={generating}>
                    {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
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
                    <Button onClick={() => window.location.href = "/admin/compras/pedidos"}>
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
