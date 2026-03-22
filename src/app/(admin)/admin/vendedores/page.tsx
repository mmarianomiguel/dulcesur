"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  UserCheck,
  Pencil,
  Loader2,
  Percent,
  ShieldX,
  Search,
} from "lucide-react";
import { showAdminToast } from "@/components/admin-toast";
import { formatCurrency } from "@/lib/formatters";

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

export default function VendedoresPage() {
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);

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

  // Sales summary per vendedor (current month)
  const [ventasSummary, setVentasSummary] = useState<Record<string, { total: number; comisionable: number }>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);

    // Fetch vendedores
    const { data: vendData } = await supabase
      .from("usuarios")
      .select("id, nombre, email, activo, comision_porcentaje")
      .eq("rol", "vendedor")
      .eq("activo", true)
      .order("nombre");
    setVendedores(vendData || []);

    // Fetch categorias
    const { data: catData } = await supabase
      .from("categorias")
      .select("id, nombre")
      .order("nombre");
    setCategorias(catData || []);

    // Fetch current month sales summary
    const now = new Date();
    const firstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const lastDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, "0")}`;

    const { data: ventasData } = await supabase
      .from("ventas")
      .select("id, vendedor_id, total")
      .eq("estado", "cerrada")
      .gte("fecha", firstDay)
      .lte("fecha", lastDay);

    // Get all exclusions for all vendedores
    const { data: allExcl } = await supabase
      .from("vendedor_categorias_excluidas")
      .select("vendedor_id, categoria_id");

    // Get venta_items with product category info for comisionable calculation
    const ventaIds = (ventasData || []).map((v) => v.id);
    let itemsByVenta: Record<string, { producto_id: string | null; subtotal: number }[]> = {};

    if (ventaIds.length > 0) {
      // Fetch in batches
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

    let productCategories: Record<string, string | null> = {};
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

    // Build exclusions map: vendedor_id -> Set<categoria_id>
    const exclMap: Record<string, Set<string>> = {};
    (allExcl || []).forEach((e: { vendedor_id: string; categoria_id: string }) => {
      if (!exclMap[e.vendedor_id]) exclMap[e.vendedor_id] = new Set();
      exclMap[e.vendedor_id].add(e.categoria_id);
    });

    // Calculate summary
    const summary: Record<string, { total: number; comisionable: number }> = {};
    for (const venta of ventasData || []) {
      const vid = venta.vendedor_id;
      if (!vid) continue;
      if (!summary[vid]) summary[vid] = { total: 0, comisionable: 0 };
      summary[vid].total += venta.total;

      const items = itemsByVenta[venta.id] || [];
      const vendExcl = exclMap[vid] || new Set<string>();
      let comisionable = 0;
      for (const item of items) {
        const catId = item.producto_id ? productCategories[item.producto_id] : null;
        if (catId && vendExcl.has(catId)) continue; // excluded
        comisionable += item.subtotal;
      }
      summary[vid].comisionable += comisionable;
    }
    setVentasSummary(summary);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
    showAdminToast(`Comisión de ${editVendedor.nombre} actualizada a ${val}%`);
    fetchData();
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

    // Delete all existing, reinsert
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
    fetchData();
  };

  const filteredCategorias = categorias.filter((c) =>
    c.nombre.toLowerCase().includes(catSearch.toLowerCase())
  );

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
              Comisiones y categorías excluidas por vendedor
            </p>
          </div>
        </div>
        <Badge variant="secondary">{vendedores.length} vendedores</Badge>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : vendedores.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <UserCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No hay vendedores activos</p>
              <p className="text-sm mt-1">Creá usuarios con rol &quot;vendedor&quot; en la sección Usuarios</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                      Vendedor
                    </th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground">
                      Comisión %
                    </th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                      Ventas del mes
                    </th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                      Comisionable
                    </th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                      Comisión estimada
                    </th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {vendedores.map((v) => {
                    const summary = ventasSummary[v.id] || { total: 0, comisionable: 0 };
                    const comisionEstimada = summary.comisionable * ((v.comision_porcentaje || 0) / 100);
                    return (
                      <tr
                        key={v.id}
                        className="border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                      >
                        <td className="py-3 px-4">
                          <div>
                            <p className="font-medium">{v.nombre}</p>
                            {v.email && (
                              <p className="text-xs text-muted-foreground">{v.email}</p>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Badge
                            variant={v.comision_porcentaje > 0 ? "default" : "secondary"}
                            className="font-mono"
                          >
                            {v.comision_porcentaje || 0}%
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-right font-medium">
                          {formatCurrency(summary.total)}
                        </td>
                        <td className="py-3 px-4 text-right text-muted-foreground">
                          {formatCurrency(summary.comisionable)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className="font-semibold text-emerald-600">
                            {formatCurrency(comisionEstimada)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1.5"
                              onClick={() => openEditComision(v)}
                            >
                              <Percent className="w-4 h-4" />
                              Comisión
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1.5"
                              onClick={() => openExclusions(v)}
                            >
                              <ShieldX className="w-4 h-4" />
                              Exclusiones
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info card */}
      {!loading && vendedores.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              La <strong>comisión estimada</strong> se calcula sobre el monto &quot;comisionable&quot; del mes actual
              (total de ventas menos los items de categorías excluidas para cada vendedor).
              Los datos se calculan sobre ventas con estado &quot;cerrada&quot;.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Edit Commission Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Percent className="w-5 h-5" />
              Comisión: {editVendedor?.nombre}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Porcentaje de comisión</Label>
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
                Este porcentaje se aplica sobre el monto comisionable (excluyendo categorías configuradas)
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

      {/* Exclusions Dialog */}
      <Dialog open={exclDialogOpen} onOpenChange={setExclDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldX className="w-5 h-5" />
              Categorías excluidas: {exclVendedor?.nombre}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Seleccioná las categorías que <strong>no</strong> deben contar para la comisión de este vendedor.
          </p>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar categoría..."
              value={catSearch}
              onChange={(e) => setCatSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <Separator />

          {/* Quick actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExclCategorias(new Set(categorias.map((c) => c.id)))}
            >
              Excluir todas
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExclCategorias(new Set())}
            >
              Limpiar
            </Button>
            <Badge variant="secondary" className="ml-auto self-center">
              {exclCategorias.size} excluida{exclCategorias.size !== 1 ? "s" : ""}
            </Badge>
          </div>

          {/* Categories list */}
          <div className="space-y-1 max-h-[40vh] overflow-y-auto">
            {filteredCategorias.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No se encontraron categorías
              </p>
            ) : (
              filteredCategorias.map((cat) => {
                const isExcluded = exclCategorias.has(cat.id);
                return (
                  <label
                    key={cat.id}
                    className={`flex items-center gap-3 py-2.5 px-3 rounded-lg cursor-pointer transition-colors ${
                      isExcluded
                        ? "bg-destructive/5 hover:bg-destructive/10"
                        : "hover:bg-muted/50"
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
                      <Badge variant="destructive" className="text-[10px]">
                        Excluida
                      </Badge>
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
    </div>
  );
}
