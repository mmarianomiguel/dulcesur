"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
  ArrowLeft,
  Eye,
  EyeOff,
  Pencil,
  Save,
  Search,
  Check,
  X,
  Loader2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  Filter,
} from "lucide-react";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
  }).format(value);
}

interface Marca {
  id: string;
  nombre: string;
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

interface Presentacion {
  id: string;
  producto_id: string;
  nombre: string;
  cantidad: number;
  precio: number;
}

interface ProductoRow {
  id: string;
  nombre: string;
  codigo: string;
  stock: number;
  precio: number;
  costo: number;
  activo: boolean;
  categoria_id: string | null;
  subcategoria_id: string | null;
  marca_id: string | null;
}

function SearchableSelect({
  label,
  value,
  onChange,
  allLabel,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  allLabel: string;
  options: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedLabel = value === "all" ? allLabel : options.find((o) => o.value === value)?.label ?? allLabel;

  const filtered = search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 10);
    } else {
      setSearch("");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="space-y-1.5 relative" ref={containerRef}>
      <Label className="text-xs text-muted-foreground font-semibold tracking-wide uppercase">{label}</Label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap h-8 text-left hover:bg-accent/50 transition-colors"
      >
        <span className="truncate">{selectedLabel}</span>
        <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-lg border bg-popover shadow-md max-h-64 overflow-hidden flex flex-col">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar..."
                className="w-full pl-7 pr-2 py-1.5 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>
          <div className="overflow-y-auto p-1">
            {!search && (
              <button
                type="button"
                onClick={() => { onChange("all"); setOpen(false); }}
                className={`w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-accent ${value === "all" ? "bg-accent font-medium" : ""}`}
              >
                {allLabel}
              </button>
            )}
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={`w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-accent ${value === o.value ? "bg-accent font-medium" : ""}`}
              >
                {o.label}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-2 py-3 text-sm text-muted-foreground text-center">Sin resultados</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function EditarPreciosPage() {
  const router = useRouter();

  // Data
  const [productos, setProductos] = useState<ProductoRow[]>([]);
  const [presentaciones, setPresentaciones] = useState<Presentacion[]>([]);
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Filters
  const [marcaFilter, setMarcaFilter] = useState("all");
  const [categoriaFilter, setCategoriaFilter] = useState("all");
  const [subcategoriaFilter, setSubcategoriaFilter] = useState("all");
  const [estadoFilter, setEstadoFilter] = useState("all");
  const [searchFilter, setSearchFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Inline editing: track changes { [productoId]: newPrecio }
  const [priceChanges, setPriceChanges] = useState<Record<string, number>>({});
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");

  // Dialogs
  const [massEditOpen, setMassEditOpen] = useState(false);
  const [visibilityOpen, setVisibilityOpen] = useState(false);

  // Confirmation dialog for mass edit
  const [confirmMassEditOpen, setConfirmMassEditOpen] = useState(false);

  // (search state is now internal to SearchableSelect)

  // Mass edit state
  const [massTarget, setMassTarget] = useState<"venta" | "costo">("costo");
  const [massType, setMassType] = useState<"percentage" | "fixed">("percentage");
  const [massOperation, setMassOperation] = useState<"increase" | "decrease">("increase");
  const [massAmount, setMassAmount] = useState("");

  // Load data
  useEffect(() => {
    async function load() {
      setLoading(true);
      const [prodRes, marcaRes, catRes, subcatRes, presRes] = await Promise.all([
        supabase
          .from("productos")
          .select("id, nombre, codigo, stock, precio, costo, activo, categoria_id, subcategoria_id, marca_id")
          .eq("activo", true)
          .order("nombre"),
        supabase.from("marcas").select("*").order("nombre"),
        supabase.from("categorias").select("*").order("nombre"),
        supabase.from("subcategorias").select("*").order("nombre"),
        supabase.from("presentaciones").select("id, producto_id, nombre, cantidad, precio"),
      ]);
      setProductos(prodRes.data ?? []);
      setMarcas(marcaRes.data ?? []);
      setCategorias(catRes.data ?? []);
      setSubcategorias(subcatRes.data ?? []);
      setPresentaciones(presRes.data ?? []);
      setLoading(false);
    }
    load();
  }, []);

  // Filtered subcategorias by selected category
  const filteredSubcategorias = useMemo(() => {
    if (categoriaFilter === "all") return subcategorias;
    return subcategorias.filter((s) => s.categoria_id === categoriaFilter);
  }, [subcategorias, categoriaFilter]);

  // Reset subcategory filter when category changes
  useEffect(() => {
    setSubcategoriaFilter("all");
  }, [categoriaFilter]);

  // Filtered products
  const filteredProductos = useMemo(() => {
    return productos.filter((p) => {
      if (searchFilter && !p.nombre.toLowerCase().includes(searchFilter.toLowerCase()) && !p.codigo.toLowerCase().includes(searchFilter.toLowerCase())) return false;
      if (marcaFilter !== "all" && p.marca_id !== marcaFilter) return false;
      if (categoriaFilter !== "all" && p.categoria_id !== categoriaFilter) return false;
      if (subcategoriaFilter !== "all" && p.subcategoria_id !== subcategoriaFilter) return false;
      if (estadoFilter === "stock" && p.stock <= 0) return false;
      if (estadoFilter === "sinstock" && p.stock > 0) return false;
      return true;
    });
  }, [productos, searchFilter, marcaFilter, categoriaFilter, subcategoriaFilter, estadoFilter]);

  // Get caja price for a product
  const getCajaPrice = useCallback(
    (productoId: string) => {
      const pres = presentaciones.find(
        (p) => p.producto_id === productoId && p.nombre.toLowerCase() === "caja"
      );
      return pres?.precio ?? null;
    },
    [presentaciones]
  );

  // Selection helpers
  const allFilteredSelected =
    filteredProductos.length > 0 &&
    filteredProductos.every((p) => selectedIds.has(p.id));

  const toggleAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProductos.map((p) => p.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Inline edit handlers
  const startEditing = (id: string, currentPrice: number) => {
    setEditingCell(id);
    const changedPrice = priceChanges[id];
    setEditingValue(String(changedPrice ?? currentPrice));
  };

  const confirmEdit = (id: string) => {
    const val = parseFloat(editingValue);
    if (!isNaN(val) && val >= 0) {
      setPriceChanges((prev) => ({ ...prev, [id]: val }));
    }
    setEditingCell(null);
  };

  const cancelEdit = () => {
    setEditingCell(null);
  };

  // Save changes
  const hasChanges = Object.keys(priceChanges).length > 0;

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = Object.entries(priceChanges).map(([id, precio]) =>
        supabase.from("productos").update({ precio }).eq("id", id)
      );
      await Promise.all(updates);
      // Update local state
      setProductos((prev) =>
        prev.map((p) =>
          priceChanges[p.id] !== undefined ? { ...p, precio: priceChanges[p.id] } : p
        )
      );
      setPriceChanges({});
    } catch (err) {
      console.error("Error saving prices:", err);
    } finally {
      setSaving(false);
    }
  };

  // Mass edit preview
  const selectedProducts = useMemo(
    () => productos.filter((p) => selectedIds.has(p.id)),
    [productos, selectedIds]
  );

  const massEditPreview = useMemo(() => {
    const amount = parseFloat(massAmount);
    if (isNaN(amount) || amount <= 0) return [];

    return selectedProducts.map((p) => {
      const currentCosto = p.costo || 0;
      const currentPrecio = priceChanges[p.id] ?? p.precio;

      if (massTarget === "venta") {
        // Modify precio directly, keep costo unchanged
        let newPrecio: number;
        if (massType === "percentage") {
          const factor = massOperation === "increase" ? 1 + amount / 100 : 1 - amount / 100;
          newPrecio = currentPrecio * factor;
        } else {
          newPrecio = massOperation === "increase" ? currentPrecio + amount : currentPrecio - amount;
        }
        newPrecio = Math.max(0, Math.round(newPrecio));

        const diff = newPrecio - currentPrecio;
        const diffPercent = currentPrecio > 0 ? ((newPrecio - currentPrecio) / currentPrecio) * 100 : 0;

        return {
          id: p.id,
          nombre: p.nombre,
          currentCosto,
          newCosto: currentCosto,
          currentPrecio,
          newPrecio,
          diff,
          diffPercent,
        };
      } else {
        // Modify costo, recalculate precio maintaining margin %
        // margin = (precio - costo) / costo * 100
        let marginPercent = 0;
        if (currentCosto > 0) {
          marginPercent = ((currentPrecio - currentCosto) / currentCosto) * 100;
        }

        let newCosto: number;
        if (massType === "percentage") {
          const factor = massOperation === "increase" ? 1 + amount / 100 : 1 - amount / 100;
          newCosto = currentCosto * factor;
        } else {
          newCosto = massOperation === "increase" ? currentCosto + amount : currentCosto - amount;
        }
        newCosto = Math.max(0, Math.round(newCosto));

        let newPrecio: number;
        if (currentCosto > 0) {
          newPrecio = newCosto * (1 + marginPercent / 100);
        } else {
          // No costo, apply change to precio directly as fallback
          if (massType === "percentage") {
            const factor = massOperation === "increase" ? 1 + amount / 100 : 1 - amount / 100;
            newPrecio = currentPrecio * factor;
          } else {
            newPrecio = massOperation === "increase" ? currentPrecio + amount : currentPrecio - amount;
          }
        }
        newPrecio = Math.max(0, Math.round(newPrecio));

        const diff = newPrecio - currentPrecio;
        const diffPercent = currentPrecio > 0 ? ((newPrecio - currentPrecio) / currentPrecio) * 100 : 0;

        return {
          id: p.id,
          nombre: p.nombre,
          currentCosto,
          newCosto,
          currentPrecio,
          newPrecio,
          diff,
          diffPercent,
        };
      }
    });
  }, [selectedProducts, massTarget, massType, massOperation, massAmount, priceChanges]);

  const applyMassEdit = async () => {
    setSaving(true);
    try {
      const updates: PromiseLike<unknown>[] = [];
      const newPriceChanges = { ...priceChanges };

      for (const item of massEditPreview) {
        const updateData = massTarget === "costo"
          ? { costo: item.newCosto, precio: item.newPrecio }
          : { precio: item.newPrecio };
        updates.push(
          supabase
            .from("productos")
            .update(updateData)
            .eq("id", item.id)
            .then()
        );
        newPriceChanges[item.id] = item.newPrecio;
      }

      await Promise.all(updates);

      // Update local state
      setProductos((prev) =>
        prev.map((p) => {
          const preview = massEditPreview.find((i) => i.id === p.id);
          if (preview) {
            return massTarget === "costo"
              ? { ...p, costo: preview.newCosto, precio: preview.newPrecio }
              : { ...p, precio: preview.newPrecio };
          }
          return p;
        })
      );

      // Remove applied changes from priceChanges since they're saved
      const cleaned = { ...priceChanges };
      for (const item of massEditPreview) {
        delete cleaned[item.id];
      }
      setPriceChanges(cleaned);

      setMassEditOpen(false);
      setMassAmount("");
    } catch (err) {
      console.error("Error applying mass edit:", err);
    } finally {
      setSaving(false);
    }
  };

  // Visibility toggle
  const handleVisibilityToggle = async (makeActive: boolean) => {
    setSaving(true);
    try {
      const updates = Array.from(selectedIds).map((id) =>
        supabase.from("productos").update({ activo: makeActive }).eq("id", id)
      );
      await Promise.all(updates);
      setProductos((prev) =>
        prev.map((p) => (selectedIds.has(p.id) ? { ...p, activo: makeActive } : p))
      );
      setVisibilityOpen(false);
      setSelectedIds(new Set());
    } catch (err) {
      console.error("Error toggling visibility:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push("/admin/productos")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Editar Precios</h1>
            <p className="text-sm text-muted-foreground">
              Edici&oacute;n r&aacute;pida de precios de productos
            </p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={!hasChanges || saving}>
          {saving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Guardar cambios
        </Button>
      </div>

      {/* Filter bar */}
      <Card className="overflow-visible">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-end gap-4">
            <div className="flex-1 max-w-md space-y-1.5">
              <span className="text-xs text-muted-foreground font-semibold tracking-wide">BUSCAR</span>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Buscar por nombre o código..." value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)} className="pl-9" />
              </div>
            </div>
            <Button variant={showFilters ? "default" : "outline"} className={showFilters ? "bg-blue-600 hover:bg-blue-700 text-white" : "text-blue-600 border-blue-600 hover:bg-blue-50"} onClick={() => setShowFilters(!showFilters)}>
              <Filter className="w-4 h-4 mr-2" />Filtros
            </Button>
          </div>
          {showFilters && (
            <div className="border-t pt-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Categoría */}
                <SearchableSelect
                  label="Categoría"
                  value={categoriaFilter}
                  onChange={setCategoriaFilter}
                  allLabel="Todas las categorías"
                  options={categorias.map((c) => ({ value: c.id, label: c.nombre }))}
                />
                {/* Subcategoría */}
                <SearchableSelect
                  label="Subcategoría"
                  value={subcategoriaFilter}
                  onChange={setSubcategoriaFilter}
                  allLabel="Todas las subcategorías"
                  options={filteredSubcategorias.map((s) => ({ value: s.id, label: s.nombre }))}
                />
                {/* Marca */}
                <SearchableSelect
                  label="Marca"
                  value={marcaFilter}
                  onChange={setMarcaFilter}
                  allLabel="Todas las marcas"
                  options={marcas.map((m) => ({ value: m.id, label: m.nombre }))}
                />
                {/* Estado */}
                <SearchableSelect
                  label="Estado"
                  value={estadoFilter}
                  onChange={setEstadoFilter}
                  allLabel="Todos"
                  options={[
                    { value: "stock", label: "En stock" },
                    { value: "sinstock", label: "Sin stock" },
                  ]}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Products card */}
      <Card>
        <CardContent className="p-4">
          {/* Action buttons */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">
              {filteredProductos.length} productos
              {hasChanges && (
                <span className="ml-2 text-orange-600 font-medium">
                  ({Object.keys(priceChanges).length} modificados)
                </span>
              )}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={selectedIds.size === 0}
                onClick={() => setVisibilityOpen(true)}
              >
                <Eye className="w-4 h-4 mr-1.5" />
                Cambiar Visibilidad
                {selectedIds.size > 0 && (
                  <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-xs">
                    {selectedIds.size}
                  </Badge>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={selectedIds.size === 0}
                onClick={() => {
                  setMassEditOpen(true);
                  setMassAmount("");
                  setMassTarget("costo");
                  setMassType("percentage");
                  setMassOperation("increase");
                }}
              >
                <Pencil className="w-4 h-4 mr-1.5" />
                Edici&oacute;n Masiva
                {selectedIds.size > 0 && (
                  <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-xs">
                    {selectedIds.size}
                  </Badge>
                )}
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleAll}
                      className="rounded border-input"
                    />
                  </TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Precio Unidad</TableHead>
                  <TableHead className="text-right">Precio Caja</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProductos.map((p) => {
                  const isEditing = editingCell === p.id;
                  const currentPrice = priceChanges[p.id] ?? p.precio;
                  const isChanged = priceChanges[p.id] !== undefined;
                  const cajaPrice = getCajaPrice(p.id);

                  return (
                    <TableRow key={p.id} className={isChanged ? "bg-orange-50 dark:bg-orange-950/20" : ""}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(p.id)}
                          onChange={() => toggleOne(p.id)}
                          className="rounded border-input"
                        />
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{p.nombre}</p>
                          <p className="text-xs text-muted-foreground font-mono">{p.codigo}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{p.stock}</TableCell>
                      <TableCell className="text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-muted-foreground text-sm">$</span>
                            <Input
                              autoFocus
                              type="number"
                              value={editingValue}
                              onChange={(e) => setEditingValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") confirmEdit(p.id);
                                if (e.key === "Escape") cancelEdit();
                              }}
                              className="w-28 h-8 text-right"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => confirmEdit(p.id)}
                            >
                              <Check className="w-3.5 h-3.5 text-green-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={cancelEdit}
                            >
                              <X className="w-3.5 h-3.5 text-red-500" />
                            </Button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEditing(p.id, p.precio)}
                            className="inline-flex items-center gap-1 tabular-nums hover:bg-muted px-2 py-1 rounded cursor-pointer transition-colors"
                          >
                            {formatCurrency(currentPrice)}
                            {isChanged && (
                              <span className="text-orange-500 text-xs ml-1">*</span>
                            )}
                          </button>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {cajaPrice !== null ? formatCurrency(cajaPrice) : "-"}
                      </TableCell>
                      <TableCell>
                        {p.stock > 0 ? (
                          <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            En stock
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                            Sin stock
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredProductos.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      No se encontraron productos
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Mass Edit Dialog */}
      <Dialog open={massEditOpen} onOpenChange={setMassEditOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edici&oacute;n Masiva de Precios</DialogTitle>
            <DialogDescription>
              Aplicar cambio a {selectedIds.size} productos seleccionados
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Aplicar sobre */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Aplicar sobre</Label>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="massTarget"
                    checked={massTarget === "costo"}
                    onChange={() => setMassTarget("costo")}
                    className="accent-primary"
                  />
                  <span className="text-sm">Precio de Costo</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="massTarget"
                    checked={massTarget === "venta"}
                    onChange={() => setMassTarget("venta")}
                    className="accent-primary"
                  />
                  <span className="text-sm">Precio de Venta</span>
                </label>
              </div>
            </div>

            {/* Tipo de cambio */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Tipo de cambio</Label>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="massType"
                    checked={massType === "percentage"}
                    onChange={() => setMassType("percentage")}
                    className="accent-primary"
                  />
                  <span className="text-sm">% Porcentaje</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="massType"
                    checked={massType === "fixed"}
                    onChange={() => setMassType("fixed")}
                    className="accent-primary"
                  />
                  <span className="text-sm">$ Monto fijo</span>
                </label>
              </div>
            </div>

            {/* Operacion */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Operaci&oacute;n</Label>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="massOp"
                    checked={massOperation === "increase"}
                    onChange={() => setMassOperation("increase")}
                    className="accent-primary"
                  />
                  <TrendingUp className="w-4 h-4 text-green-600" />
                  <span className="text-sm">Aumentar</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="massOp"
                    checked={massOperation === "decrease"}
                    onChange={() => setMassOperation("decrease")}
                    className="accent-primary"
                  />
                  <TrendingDown className="w-4 h-4 text-red-500" />
                  <span className="text-sm">Disminuir</span>
                </label>
              </div>
            </div>

            {/* Amount input */}
            <div>
              <Label className="text-sm font-medium mb-2 block">
                {massType === "percentage" ? "Porcentaje" : "Monto"}
              </Label>
              <div className="relative w-48">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  {massType === "percentage" ? "%" : "$"}
                </span>
                <Input
                  type="number"
                  value={massAmount}
                  onChange={(e) => setMassAmount(e.target.value)}
                  placeholder="0"
                  className="pl-8"
                />
              </div>
            </div>

            {/* Preview table */}
            {massEditPreview.length > 0 && (
              <div>
                <Label className="text-sm font-medium mb-2 block">Vista previa</Label>
                <div className="border rounded-lg overflow-auto max-h-64">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        {massTarget === "costo" && (
                          <>
                            <TableHead className="text-right">Costo Actual</TableHead>
                            <TableHead className="text-center w-10"></TableHead>
                            <TableHead className="text-right">Costo Nuevo</TableHead>
                          </>
                        )}
                        <TableHead className="text-right">Precio Actual</TableHead>
                        <TableHead className="text-center w-10"></TableHead>
                        <TableHead className="text-right">Precio Nuevo</TableHead>
                        <TableHead className="text-right">Diferencia</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {massEditPreview.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="text-sm font-medium">{item.nombre}</TableCell>
                          {massTarget === "costo" && (
                            <>
                              <TableCell className="text-right tabular-nums">
                                {formatCurrency(item.currentCosto)}
                              </TableCell>
                              <TableCell className="text-center text-muted-foreground">&rarr;</TableCell>
                              <TableCell className="text-right tabular-nums font-medium">
                                {formatCurrency(item.newCosto)}
                              </TableCell>
                            </>
                          )}
                          <TableCell className="text-right tabular-nums">
                            {formatCurrency(item.currentPrecio)}
                          </TableCell>
                          <TableCell className="text-center text-muted-foreground">&rarr;</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
                            {formatCurrency(item.newPrecio)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {item.diff >= 0 ? (
                              <span className="text-green-600">
                                +{formatCurrency(item.diff)} (+{item.diffPercent.toFixed(1)}%)
                              </span>
                            ) : (
                              <span className="text-red-500">
                                {formatCurrency(item.diff)} ({item.diffPercent.toFixed(1)}%)
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMassEditOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => setConfirmMassEditOpen(true)}
              disabled={massEditPreview.length === 0 || saving}
            >
              Aplicar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog for Mass Edit */}
      <Dialog open={confirmMassEditOpen} onOpenChange={setConfirmMassEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar cambios</DialogTitle>
            <DialogDescription>
              &iquest;Est&aacute;s seguro de aplicar estos cambios a {massEditPreview.length} productos?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmMassEditOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                setConfirmMassEditOpen(false);
                await applyMassEdit();
              }}
              disabled={saving}
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Visibility Dialog */}
      <Dialog open={visibilityOpen} onOpenChange={setVisibilityOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cambiar Visibilidad</DialogTitle>
            <DialogDescription>
              Cambiar el estado de {selectedIds.size} productos seleccionados
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-2">
            <Button
              variant="outline"
              className="justify-start gap-3 h-12"
              onClick={() => handleVisibilityToggle(true)}
              disabled={saving}
            >
              <Eye className="w-5 h-5 text-green-600" />
              <div className="text-left">
                <p className="font-medium text-sm">Activar productos</p>
                <p className="text-xs text-muted-foreground">Hacer visibles en el sistema</p>
              </div>
            </Button>
            <Button
              variant="outline"
              className="justify-start gap-3 h-12"
              onClick={() => handleVisibilityToggle(false)}
              disabled={saving}
            >
              <EyeOff className="w-5 h-5 text-red-500" />
              <div className="text-left">
                <p className="font-medium text-sm">Desactivar productos</p>
                <p className="text-xs text-muted-foreground">Ocultar del sistema</p>
              </div>
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setVisibilityOpen(false)}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
