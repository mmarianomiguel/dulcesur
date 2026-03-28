"use client";

import { formatCurrency } from "@/lib/formatters";
import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { norm } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { showAdminToast } from "@/components/admin-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Search, Trash2, Loader2, Layers, X,
} from "lucide-react";

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

interface Producto {
  id: string;
  codigo: string;
  nombre: string;
  precio: number;
  costo: number;
  stock: number;
  es_combo: boolean;
}

interface ComboItem {
  id?: string;
  combo_id?: string;
  producto_id: string;
  cantidad: number;
  descuento: number;
  producto?: Producto;
}


function subtotalItem(item: ComboItem) {
  const precio = item.producto?.precio || 0;
  return precio * item.cantidad * (1 - item.descuento / 100);
}

export default function CombosPage() {
  const [combos, setCombos] = useState<Producto[]>([]);
  const [allProducts, setAllProducts] = useState<Producto[]>([]);
  const [comboItemsCache, setComboItemsCache] = useState<Record<string, ComboItem[]>>({});
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([]);
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [loading, setLoading] = useState(true);

  // Create/Edit
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCombo, setEditingCombo] = useState<Producto | null>(null);
  const [form, setForm] = useState({
    codigo: "", nombre: "", precio: 0, costo: 0,
    stock: 0, categoria_id: "", subcategoria_id: "", marca_id: "",
  });
  const [comboItems, setComboItems] = useState<ComboItem[]>([]);
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Detail
  const [detailCombo, setDetailCombo] = useState<Producto | null>(null);
  const [detailItems, setDetailItems] = useState<(ComboItem & { producto: Producto })[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: prods }, { data: cItems }, { data: cats }, { data: subs }, { data: mrcs }] = await Promise.all([
      supabase.from("productos").select("*").eq("activo", true).order("nombre").limit(10000),
      supabase.from("combo_items").select("*, productos!combo_items_producto_id_fkey(id, codigo, nombre, precio, costo, stock)"),
      supabase.from("categorias").select("*").order("nombre"),
      supabase.from("subcategorias").select("*").order("nombre"),
      supabase.from("marcas").select("*").order("nombre"),
    ]);
    const products = (prods || []) as Producto[];
    setAllProducts(products.filter((p) => !p.es_combo));
    setCombos(products.filter((p) => p.es_combo));
    setCategorias((cats || []) as Categoria[]);
    setSubcategorias((subs || []) as Subcategoria[]);
    setMarcas((mrcs || []) as Marca[]);

    const cache: Record<string, ComboItem[]> = {};
    for (const d of (cItems || []) as any[]) {
      const key = d.combo_id;
      if (!cache[key]) cache[key] = [];
      cache[key].push({ ...d, descuento: d.descuento ?? 0, producto: d.productos });
    }
    setComboItemsCache(cache);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openNew = () => {
    setEditingCombo(null);
    setForm({ codigo: "", nombre: "", precio: 0, costo: 0, stock: 0, categoria_id: "", subcategoria_id: "", marca_id: "" });
    setComboItems([]);
    setSelectedRow(null);
    setDialogOpen(true);
  };

  const openEdit = (combo: any) => {
    setEditingCombo(combo);
    setForm({
      codigo: combo.codigo,
      nombre: combo.nombre,
      precio: combo.precio,
      costo: combo.costo,
      stock: combo.stock ?? 0,
      categoria_id: combo.categoria_id || "",
      subcategoria_id: combo.subcategoria_id || "",
      marca_id: combo.marca_id || "",
    });
    setComboItems(comboItemsCache[combo.id] || []);
    setSelectedRow(null);
    setDialogOpen(true);
  };

  const addProduct = (p: Producto) => {
    const existing = comboItems.find((i) => i.producto_id === p.id);
    if (existing) {
      setComboItems(comboItems.map((i) =>
        i.producto_id === p.id ? { ...i, cantidad: i.cantidad + 1 } : i
      ));
    } else {
      setComboItems([...comboItems, { producto_id: p.id, cantidad: 1, descuento: 0, producto: p }]);
    }
    setSearchOpen(false);
    setProductSearch("");
  };

  const removeSelected = () => {
    if (!selectedRow) return;
    setComboItems(comboItems.filter((i) => i.producto_id !== selectedRow));
    setSelectedRow(null);
  };

  const updateItem = (prodId: string, field: "cantidad" | "descuento", value: number) => {
    if (field === "cantidad" && value < 1) {
      setComboItems(comboItems.filter((i) => i.producto_id !== prodId));
      setSelectedRow(null);
      return;
    }
    setComboItems(comboItems.map((i) =>
      i.producto_id === prodId ? { ...i, [field]: value } : i
    ));
  };

  const costoTotal = comboItems.reduce((a, i) => a + (i.producto?.costo || 0) * i.cantidad, 0);
  const precioTotal = comboItems.reduce((a, i) => a + subtotalItem(i), 0);
  // Stock del combo = mínimo de floor(stockProducto / cantidadEnCombo) por cada componente
  const comboStock = comboItems.length === 0 ? 0 : Math.min(
    ...comboItems.map((i) => Math.floor((i.producto?.stock || 0) / i.cantidad))
  );

  useEffect(() => {
    if (comboItems.length > 0) {
      setForm((prev) => ({ ...prev, costo: costoTotal }));
    }
  }, [costoTotal]);

  // Keyboard shortcut: Delete key removes selected row
  useEffect(() => {
    if (!dialogOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Delete" && selectedRow && document.activeElement?.tagName !== "INPUT") {
        removeSelected();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dialogOpen, selectedRow, comboItems]);

  const handleSave = async () => {
    // Validation
    const nombre = form.nombre.trim();
    if (!nombre) {
      showAdminToast("El nombre del combo es obligatorio", "error");
      return;
    }
    if (comboItems.length === 0) {
      showAdminToast("Un combo debe tener al menos un producto", "error");
      return;
    }
    if (form.precio <= 0) {
      showAdminToast("El precio debe ser mayor a 0", "error");
      return;
    }

    setSaving(true);
    try {
      // Generate unique code if empty or editing with same code conflict
      let codigo = form.codigo.trim();
      if (!codigo) {
        codigo = `COMBO-${Date.now()}`;
      }

      const payload: Record<string, unknown> = {
        codigo,
        nombre,
        precio: form.precio,
        costo: form.costo,
        stock: form.stock,
        es_combo: true,
        activo: true,
        unidad_medida: "UN",
      };
      if (form.categoria_id) payload.categoria_id = form.categoria_id;
      if (form.marca_id) payload.marca_id = form.marca_id;

      let comboId: string;

      if (editingCombo) {
        const { error } = await supabase.from("productos").update(payload).eq("id", editingCombo.id);
        if (error) {
          if (error.code === "23505") throw new Error(`El código "${codigo}" ya está en uso por otro producto.`);
          throw new Error(error.message);
        }
        comboId = editingCombo.id;
      } else {
        const { data, error } = await supabase.from("productos").insert(payload).select("id").single();
        if (error || !data) {
          if (error?.code === "23505") throw new Error(`El código "${codigo}" ya está en uso por otro producto. Usá un código diferente.`);
          throw new Error(error?.message || "Error al crear combo");
        }
        comboId = data.id;
      }

      await supabase.from("combo_items").delete().eq("combo_id", comboId);
      if (comboItems.length > 0) {
        const { error: itemsError } = await supabase.from("combo_items").insert(
          comboItems.map((i) => ({
            combo_id: comboId,
            producto_id: i.producto_id,
            cantidad: i.cantidad,
          }))
        );
        if (itemsError) throw new Error("Error en combo_items: " + itemsError.message);
      }

      setComboItemsCache((prev) => ({ ...prev, [comboId]: comboItems }));
      setDialogOpen(false);
      fetchData();
    } catch (err) {
      showAdminToast((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await supabase.from("combo_items").delete().eq("combo_id", id);
    await supabase.from("productos").update({ activo: false }).eq("id", id);
    fetchData();
  };

  const viewDetail = async (combo: Producto) => {
    setDetailCombo(combo);
    const { data } = await supabase
      .from("combo_items")
      .select("*, productos!combo_items_producto_id_fkey(id, codigo, nombre, precio, costo, stock)")
      .eq("combo_id", combo.id);
    setDetailItems((data || []).map((d: any) => ({ ...d, descuento: d.descuento ?? 0, producto: d.productos })));
  };

  const filteredSubs = subcategorias.filter(
    (s) => !form.categoria_id || s.categoria_id === form.categoria_id
  );

  const filteredSearch = allProducts.filter(
    (p) => norm(p.nombre).includes(norm(productSearch)) ||
           norm(p.codigo).includes(norm(productSearch))
  );

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Productos Combo</h1>
          <p className="text-muted-foreground text-sm">{combos.length} combos activos</p>
        </div>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />Nuevo Combo</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : combos.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Layers className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No hay combos creados</p>
          <Button className="mt-4" onClick={openNew}><Plus className="w-4 h-4 mr-2" />Crear primer combo</Button>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {combos.map((c) => (
            <Card key={c.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => viewDetail(c)}>
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{c.nombre}</p>
                    <p className="text-xs text-muted-foreground font-mono">{c.codigo}</p>
                  </div>
                  <Badge>Combo</Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Precio</span>
                  <span className="font-bold">{formatCurrency(c.precio)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Stock</span>
                  <span className={`font-medium ${(comboItemsCache[c.id] || []).length === 0 ? "text-muted-foreground" : (() => {
                    const items = comboItemsCache[c.id] || [];
                    const s = items.length === 0 ? 0 : Math.min(...items.map((i) => i.cantidad > 0 ? Math.floor((i.producto?.stock || 0) / i.cantidad) : 0));
                    return s > 0 ? "text-emerald-600" : "text-red-500";
                  })()}`}>
                    {(() => {
                      const items = comboItemsCache[c.id] || [];
                      if (items.length === 0) return "—";
                      return Math.min(...items.map((i) => i.cantidad > 0 ? Math.floor((i.producto?.stock || 0) / i.cantidad) : 0));
                    })()}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={(e) => { e.stopPropagation(); openEdit(c); }}>Editar</Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Detail popup */}
      {detailCombo && (
        <Dialog open={!!detailCombo} onOpenChange={() => setDetailCombo(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{detailCombo.nombre}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Precio combo</span>
                <span className="font-bold text-lg">{formatCurrency(detailCombo.precio)}</span>
              </div>
              <div className="border rounded-lg divide-y">
                {detailItems.map((item) => (
                  <div key={item.producto_id} className="flex items-center justify-between p-3">
                    <div>
                      <p className="text-sm font-medium">{item.producto?.nombre}</p>
                      <p className="text-xs text-muted-foreground">{formatCurrency(item.producto?.precio || 0)} c/u</p>
                    </div>
                    <div className="text-right">
                      <Badge variant="secondary">x{item.cantidad}</Badge>
                      <p className="text-xs text-muted-foreground mt-1">{formatCurrency(subtotalItem(item))}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-sm pt-2 border-t">
                <span className="text-muted-foreground">Precio individual total</span>
                <span>{formatCurrency(detailItems.reduce((a, i) => a + (i.producto?.precio || 0) * i.cantidad, 0))}</span>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col gap-0 p-0">
          {/* Header */}
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle>{editingCombo ? "Modificar Combo" : "Nuevo Combo"}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {/* Row 1: Código + Descripción */}
            <div className="grid grid-cols-[180px_1fr] gap-4 items-end">
              <div className="space-y-1">
                <Label className="text-xs">Código</Label>
                <Input
                  value={form.codigo}
                  onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                  placeholder="COMBO-001"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Descripción</Label>
                <Input
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  placeholder="Nombre del combo"
                />
              </div>
            </div>

            {/* Row 2: Categoría + Subcategoría + Marca */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Categoría</Label>
                <Select
                  value={form.categoria_id || "none"}
                  onValueChange={(v) => setForm({ ...form, categoria_id: !v || v === "none" ? "" : v, subcategoria_id: "" })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin categoría</SelectItem>
                    {categorias.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">SubCategoría</Label>
                <Select
                  value={form.subcategoria_id || "none"}
                  onValueChange={(v) => setForm({ ...form, subcategoria_id: !v || v === "none" ? "" : v })}
                  disabled={!form.categoria_id}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin subcategoría</SelectItem>
                    {filteredSubs.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Marca</Label>
                <Select
                  value={form.marca_id || "none"}
                  onValueChange={(v) => setForm({ ...form, marca_id: !v || v === "none" ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin marca</SelectItem>
                    {marcas.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Products table */}
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-xs w-32">Cód</th>
                    <th className="text-left px-3 py-2 font-medium text-xs">Descripción</th>
                    <th className="text-center px-3 py-2 font-medium text-xs w-20">Cant</th>
                    <th className="text-right px-3 py-2 font-medium text-xs w-28">Precio</th>
                    <th className="text-center px-3 py-2 font-medium text-xs w-20">%Desc.</th>
                    <th className="text-right px-3 py-2 font-medium text-xs w-28">Subtotal</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {comboItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-muted-foreground text-xs">
                        Agregá productos al combo
                      </td>
                    </tr>
                  ) : (
                    comboItems.map((item) => (
                      <tr
                        key={item.producto_id}
                        onClick={() => setSelectedRow(item.producto_id === selectedRow ? null : item.producto_id)}
                        className={`border-t cursor-pointer transition-colors ${
                          selectedRow === item.producto_id
                            ? "bg-blue-50 dark:bg-blue-950"
                            : "hover:bg-muted/50"
                        }`}
                      >
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                          {item.producto?.codigo}
                        </td>
                        <td className="px-3 py-2">{item.producto?.nombre}</td>
                        <td className="px-3 py-2 text-center">
                          <Input
                            type="number"
                            min={1}
                            value={item.cantidad}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => updateItem(item.producto_id, "cantidad", Number(e.target.value))}
                            className="h-7 w-16 text-center mx-auto"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          {formatCurrency(item.producto?.precio || 0)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={item.descuento}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => updateItem(item.producto_id, "descuento", Number(e.target.value))}
                            className="h-7 w-16 text-center mx-auto"
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-semibold">
                          {formatCurrency(subtotalItem(item))}
                        </td>
                        <td className="px-2 py-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); updateItem(item.producto_id, "cantidad", 0); }}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Costo + Precio manual overrides */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Costo (calculado)</Label>
                <Input
                  type="number"
                  value={form.costo}
                  onChange={(e) => setForm({ ...form, costo: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Precio de venta</Label>
                <Input
                  type="number"
                  value={form.precio}
                  onChange={(e) => setForm({ ...form, precio: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Margen</Label>
                <div className={`h-9 rounded-md border flex items-center justify-center text-sm font-semibold ${
                  form.precio > form.costo ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                }`}>
                  {form.costo > 0 ? `${(((form.precio - form.costo) / form.costo) * 100).toFixed(1)}%` : "—"}
                </div>
              </div>
            </div>
          </div>

          {/* Footer bar */}
          <div className="border-t px-6 py-3 flex items-center gap-4 bg-muted/30">
            <Button variant="outline" size="sm" onClick={() => setSearchOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" />Agregar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={removeSelected}
              disabled={!selectedRow}
            >
              Quitar
            </Button>

            <div className="flex items-center gap-2 ml-2">
              <Label className="text-xs whitespace-nowrap">Stock disponible</Label>
              <div className="h-8 w-20 rounded-md border bg-muted/50 flex items-center justify-center text-sm font-semibold">
                {comboItems.length > 0 ? comboStock : "—"}
              </div>
            </div>

            <div className="ml-auto flex items-center gap-6">
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Precio Venta</p>
                <p className="text-xl font-bold tabular-nums">
                  {formatCurrency(form.precio || precioTotal)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleSave}
                  disabled={!form.nombre.trim() || comboItems.length === 0 || saving}
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Guardar
                </Button>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Product search dialog */}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Agregar producto</DialogTitle></DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder="Buscar por nombre o código..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
          <div className="space-y-1 max-h-[300px] overflow-y-auto">
            {filteredSearch.slice(0, 20).map((p) => (
              <button
                key={p.id}
                onClick={() => addProduct(p)}
                className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors text-left"
              >
                <div>
                  <p className="text-sm font-medium">{p.nombre}</p>
                  <p className="text-xs text-muted-foreground font-mono">{p.codigo}</p>
                </div>
                <span className="text-sm font-semibold">{formatCurrency(p.precio)}</span>
              </button>
            ))}
            {filteredSearch.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-4">Sin resultados</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
