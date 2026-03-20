"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { LoadingSpinner } from "@/components/loading-spinner";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency } from "@/lib/formatters";

/* ───────── types ───────── */

interface ReposicionItem {
  producto_id: string;
  codigo: string;
  nombre: string;
  imagen_url: string | null;
  categoria: string;
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
}

interface Categoria {
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
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategoria, setFilterCategoria] = useState("all");
  const [filterProveedor, setFilterProveedor] = useState("all");
  const [filterNivel, setFilterNivel] = useState<"all" | "critico" | "bajo">("all");
  const [sortBy, setSortBy] = useState<"nivel" | "nombre" | "faltante">("nivel");

  // Generate pedido dialog
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState<{ ok: boolean; message: string } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);

    const [{ data: productos }, { data: cats }, { data: provs }] = await Promise.all([
      supabase
        .from("productos")
        .select("id, codigo, nombre, imagen_url, stock, stock_minimo, stock_maximo, costo, categoria_id, categorias(nombre), producto_proveedores(proveedor_id, precio_proveedor, cantidad_minima_pedido, es_principal, proveedores(nombre))")
        .eq("activo", true)
        .order("nombre"),
      supabase.from("categorias").select("id, nombre").order("nombre"),
      supabase.from("proveedores").select("id, nombre").eq("activo", true).order("nombre"),
    ]);

    setCategorias((cats as Categoria[]) || []);
    setProveedores((provs as Proveedor[]) || []);

    if (productos) {
      const mapped: ReposicionItem[] = (productos as any[]).map((p) => {
        const stock = p.stock ?? 0;
        const minimo = p.stock_minimo ?? 0;
        const maximo = p.stock_maximo ?? 0;

        // Get principal provider or first one
        const ppList = p.producto_proveedores || [];
        const pp = ppList.find((x: any) => x.es_principal) || ppList[0] || null;

        // Determine level: critico if stock <= 0 or stock < minimo (when minimo > 0), bajo if close
        let nivel: "critico" | "bajo" | "ok";
        if (stock <= 0) {
          nivel = "critico";
        } else if (minimo > 0 && stock <= minimo) {
          nivel = "bajo";
        } else if (stock < 0) {
          nivel = "critico";
        } else {
          nivel = "ok";
        }

        // Calculate how many to order:
        // If stock_maximo is set, order up to max. Otherwise use a sensible default.
        let faltante: number;
        if (maximo > 0) {
          faltante = Math.max(1, maximo - stock);
        } else if (stock < 0) {
          // Negative stock: at minimum bring to 0
          faltante = Math.abs(stock);
        } else if (minimo > 0 && stock <= minimo) {
          // Below minimum but no max set: order at least minimo * 2
          faltante = Math.max(1, minimo * 2 - stock);
        } else {
          faltante = 0;
        }

        return {
          producto_id: p.id,
          codigo: p.codigo || "",
          nombre: p.nombre,
          imagen_url: p.imagen_url || null,
          categoria: p.categorias?.nombre || "Sin categoria",
          stock,
          stock_minimo: minimo,
          stock_maximo: maximo,
          costo: p.costo || 0,
          proveedor_id: pp?.proveedor_id || null,
          proveedor_nombre: pp?.proveedores?.nombre || null,
          precio_proveedor: pp?.precio_proveedor || null,
          cantidad_minima_pedido: pp?.cantidad_minima_pedido || 1,
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
      result = result.filter((i) => i.categoria === filterCategoria);
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
  }, [items, search, filterCategoria, filterProveedor, filterNivel, sortBy]);

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
        const { data: numData } = await supabase.rpc("next_numero", { p_tipo: "pedido" });
        const numero = numData || "PED-0000";

        const totalEstimado = group.items.reduce((a, i) => {
          const precio = i.precio_proveedor || i.costo;
          return a + i.faltante * precio;
        }, 0);

        const { data: pedido, error } = await supabase
          .from("pedidos_proveedor")
          .insert({
            numero,
            proveedor_id: provId,
            fecha: new Date().toISOString().split("T")[0],
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
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap items-end">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre o codigo..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterNivel} onValueChange={(v) => setFilterNivel((v || "all") as any)}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Nivel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="critico">Criticos</SelectItem>
                <SelectItem value="bajo">Stock bajo</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterCategoria} onValueChange={(v) => setFilterCategoria(v || "all")}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorias</SelectItem>
                {categorias.map((c) => (
                  <SelectItem key={c.id} value={c.nombre}>{c.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterProveedor} onValueChange={(v) => setFilterProveedor(v || "all")}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Proveedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los proveedores</SelectItem>
                <SelectItem value="sin_proveedor">Sin proveedor</SelectItem>
                {proveedores.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <p className="text-xs text-muted-foreground mt-2">
            Ordenado por: {sortBy === "nivel" ? "Urgencia" : sortBy === "faltante" ? "Cantidad faltante" : "Nombre"}
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
                    <th className="text-center py-3 px-4 font-medium">Stock</th>
                    <th className="text-center py-3 px-4 font-medium">Min</th>
                    <th className="text-center py-3 px-4 font-medium">Max</th>
                    <th className="text-center py-3 px-4 font-medium">A pedir</th>
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
                        <td className="py-2.5 px-4 text-center">
                          <span className={item.nivel === "critico" ? "text-red-500 font-bold" : "text-amber-600 font-semibold"}>
                            {item.stock}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-center text-muted-foreground">{item.stock_minimo}</td>
                        <td className="py-2.5 px-4 text-center text-muted-foreground">{item.stock_maximo}</td>
                        <td className="py-2.5 px-4 text-center font-semibold">{item.faltante}</td>
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
