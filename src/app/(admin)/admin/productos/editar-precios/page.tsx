"use client";

import { formatCurrency, todayARG } from "@/lib/formatters";
import { showAdminToast } from "@/components/admin-toast";
import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

interface Descuento {
  id: string;
  nombre: string;
  porcentaje: number;
  tipo_descuento: "porcentaje" | "precio_fijo";
  precio_fijo: number | null;
  aplica_a: string;
  productos_ids: string[];
  categorias_ids: string[];
  subcategorias_ids: string[];
  marcas_ids: string[];
  productos_excluidos_ids: string[];
  clientes_ids: string[];
  activo: boolean;
  fecha_inicio: string;
  fecha_fin: string | null;
}
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  Printer,
} from "lucide-react";


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
  costo: number;
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
  fecha_actualizacion: string | null;
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
    ? options.filter((o) => norm(o.label).includes(norm(search)))
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
  const [descuentos, setDescuentos] = useState<Descuento[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Filters
  const [marcaFilter, setMarcaFilter] = useState("all");
  const [categoriaFilter, setCategoriaFilter] = useState("all");
  const [subcategoriaFilter, setSubcategoriaFilter] = useState("all");
  const [estadoFilter, setEstadoFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState<"nombre" | "modificacion">("nombre");
  const [searchFilter, setSearchFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [searchInput, setSearchInput] = useState("");

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Inline editing: track changes { [productoId]: { precio?, costo?, margen? } }
  const [priceChanges, setPriceChanges] = useState<Record<string, number>>({});
  const [costoChanges, setCostoChanges] = useState<Record<string, number>>({});
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<"precio" | "costo" | "margen">("precio");
  const [editingValue, setEditingValue] = useState("");

  // Dialogs
  const [massEditOpen, setMassEditOpen] = useState(false);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [roundMultiple, setRoundMultiple] = useState<5 | 10>(10);
  const [roundMode, setRoundMode] = useState<"nearest" | "up" | "down">("nearest");
  const [roundPreview, setRoundPreview] = useState<{ id: string; nombre: string; precioActual: number; precioNuevo: number }[]>([]);
  const [roundOpen, setRoundOpen] = useState(false);
  const [postSaveDialog, setPostSaveDialog] = useState(false);
  const [savedProductNames, setSavedProductNames] = useState<{ id: string; nombre: string; codigo: string; precio: number }[]>([]);

  const calcRound = (price: number, mult: number, mode: string) => {
    if (mode === "up") return Math.ceil(price / mult) * mult;
    if (mode === "down") return Math.floor(price / mult) * mult;
    return Math.round(price / mult) * mult;
  };

  const generateRoundPreview = () => {
    const targetProducts = selectedIds.size > 0
      ? productos.filter((p) => selectedIds.has(p.id))
      : filteredProductos;
    const preview = targetProducts.map((p) => {
      const nuevo = calcRound(p.precio, roundMultiple, roundMode);
      if (nuevo === p.precio) return null;
      return { id: p.id, nombre: p.nombre, precioActual: p.precio, precioNuevo: nuevo };
    }).filter(Boolean) as any[];
    setRoundPreview(preview);
  };

  // Auto-generate round preview when dialog opens or settings change
  useEffect(() => {
    if (!roundOpen) return;
    generateRoundPreview();
  }, [roundOpen, roundMultiple, roundMode]);

  const applyRounding = async () => {
    if (roundPreview.length === 0) return;
    setSaving(true);
    for (const item of roundPreview) {
      const prod = productos.find((p) => p.id === item.id);
      if (!prod) continue;
      const updateData: Record<string, unknown> = { precio: item.precioNuevo, fecha_actualizacion: new Date().toISOString(), precio_anterior: item.precioActual };
      await supabase.from("productos").update(updateData).eq("id", item.id);
      await supabase.from("precio_historial").insert({
        producto_id: item.id, precio_anterior: item.precioActual, precio_nuevo: item.precioNuevo,
        costo_anterior: prod.costo, costo_nuevo: prod.costo, usuario: "Admin (Redondeo)",
      });
      // Update presentaciones
      const presRows = presentaciones.filter((pr) => pr.producto_id === item.id);
      for (const pres of presRows) {
        if (pres.cantidad === 1) {
          await supabase.from("presentaciones").update({ precio: item.precioNuevo }).eq("id", pres.id);
        } else if (pres.cantidad > 1 && item.precioActual > 0) {
          const ratio = item.precioNuevo / item.precioActual;
          const newPresPrecio = calcRound(Math.round(pres.precio * ratio), roundMultiple, roundMode);
          await supabase.from("presentaciones").update({ precio: newPresPrecio }).eq("id", pres.id);
        }
      }
    }
    setSaving(false);
    setRoundOpen(false);

    const savedInfo = roundPreview.map((item) => {
      const prod = productos.find((p) => p.id === item.id);
      return { id: item.id, nombre: prod?.nombre || "", codigo: prod?.codigo || "", precio: item.precioNuevo };
    });
    if (savedInfo.length > 0) setSavedProductNames(savedInfo);

    // Update local state instead of reloading
    setProductos((prev) => prev.map((p) => {
      const rp = roundPreview.find((r) => r.id === p.id);
      return rp ? { ...p, precio: rp.precioNuevo } : p;
    }));

    setRoundPreview([]);
    setPostSaveDialog(true);
  };

  // Rounding within mass edit modal
  const [roundInModal, setRoundInModal] = useState(false);
  const [roundInModalMultiple, setRoundInModalMultiple] = useState<5 | 10>(10);
  const [roundInModalMode, setRoundInModalMode] = useState<"nearest" | "up" | "down">("nearest");

  // (search state is now internal to SearchableSelect)

  // Mass edit state
  const [massTarget, setMassTarget] = useState<"venta" | "costo" | "margen" | "fijar_venta" | "fijar_costo">("costo");
  const [massType, setMassType] = useState<"percentage" | "fixed">("percentage");
  const [massOperation, setMassOperation] = useState<"increase" | "decrease">("increase");
  const [massAmount, setMassAmount] = useState("");

  // Load data (paginated to avoid 1000 row limit)
  useEffect(() => {
    async function fetchAll(table: string, selectStr: string, filters?: (q: any) => any) {
      const PAGE = 1000;
      let all: any[] = [];
      let from = 0;
      while (true) {
        let q = supabase.from(table).select(selectStr);
        if (filters) q = filters(q);
        const { data } = await q.range(from, from + PAGE - 1);
        const rows = (data as any[]) || [];
        all = all.concat(rows);
        if (rows.length < PAGE) break;
        from += PAGE;
      }
      return all;
    }
    async function load() {
      setLoading(true);
      const today = todayARG();
      const [prods, marcaRes, catRes, subcatRes, presData, descRes] = await Promise.all([
        fetchAll("productos", "id, nombre, codigo, stock, precio, costo, activo, categoria_id, subcategoria_id, marca_id, fecha_actualizacion", (q: any) => q.eq("activo", true).order("nombre")),
        supabase.from("marcas").select("*").order("nombre"),
        supabase.from("categorias").select("*").order("nombre"),
        supabase.from("subcategorias").select("*").order("nombre"),
        fetchAll("presentaciones", "id, producto_id, nombre, cantidad, precio, costo"),
        supabase.from("descuentos").select("*").eq("activo", true).lte("fecha_inicio", today),
      ]);
      setProductos(prods);
      setMarcas(marcaRes.data ?? []);
      setCategorias(catRes.data ?? []);
      setSubcategorias(subcatRes.data ?? []);
      setPresentaciones(presData);
      setDescuentos((descRes.data ?? []).filter((d: Descuento) => !d.fecha_fin || d.fecha_fin >= today));
      setLoading(false);
    }
    load();
  }, []);

  // Filtered subcategorias by selected category
  const filteredSubcategorias = useMemo(() => {
    if (categoriaFilter === "all") return subcategorias;
    return subcategorias.filter((s) => s.categoria_id === categoriaFilter);
  }, [subcategorias, categoriaFilter]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setSearchFilter(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Reset subcategory filter when category changes
  useEffect(() => {
    setSubcategoriaFilter("all");
  }, [categoriaFilter]);

  // Filtered products
  const filteredProductos = useMemo(() => {
    const result = productos.filter((p) => {
      if (searchFilter && !norm(p.nombre).includes(norm(searchFilter)) && !norm(p.codigo).includes(norm(searchFilter))) return false;
      if (marcaFilter !== "all" && p.marca_id !== marcaFilter) return false;
      if (categoriaFilter !== "all" && p.categoria_id !== categoriaFilter) return false;
      if (subcategoriaFilter !== "all" && p.subcategoria_id !== subcategoriaFilter) return false;
      if (estadoFilter === "stock" && p.stock <= 0) return false;
      if (estadoFilter === "sinstock" && p.stock > 0) return false;
      return true;
    });
    if (sortOrder === "modificacion") {
      result.sort((a, b) => {
        const fa = a.fecha_actualizacion ? new Date(a.fecha_actualizacion).getTime() : 0;
        const fb = b.fecha_actualizacion ? new Date(b.fecha_actualizacion).getTime() : 0;
        return fb - fa;
      });
    }
    return result;
  }, [productos, searchFilter, marcaFilter, categoriaFilter, subcategoriaFilter, estadoFilter, sortOrder]);

  // Pagination
  const [page, setPage] = useState(1);
  const itemsPerPage = 50;
  const totalPages = Math.max(1, Math.ceil(filteredProductos.length / itemsPerPage));
  const paginatedProductos = useMemo(() => filteredProductos.slice((page - 1) * itemsPerPage, page * itemsPerPage), [filteredProductos, page]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [searchFilter, marcaFilter, categoriaFilter, subcategoriaFilter, estadoFilter, sortOrder]);

  // Get caja price for a product (matches "Caja", "Caja (x24)", "Caja x12", etc.)
  const getCajaPrice = useCallback(
    (productoId: string) => {
      const pres = presentaciones.find(
        (p) => p.producto_id === productoId && p.nombre.toLowerCase().startsWith("caja")
      );
      if (!pres) return null;
      // If there are pending price changes, project the caja price proportionally
      const prod = productos.find((pr) => pr.id === productoId);
      const newPrecio = priceChanges[productoId];
      if (prod && newPrecio !== undefined && prod.precio > 0 && newPrecio !== prod.precio) {
        return Math.round(pres.precio * (newPrecio / prod.precio));
      }
      return pres.precio;
    },
    [presentaciones, productos, priceChanges]
  );

  // Get active discount for a product
  const getProductDiscount = useCallback((p: ProductoRow) => {
    for (const d of descuentos) {
      // Check exclusions first
      if (d.productos_excluidos_ids?.includes(p.id)) continue;
      // Check if applies
      if (d.aplica_a === "todos") return d;
      if (d.aplica_a === "productos" && d.productos_ids?.includes(p.id)) return d;
      if (d.aplica_a === "categorias" && p.categoria_id && d.categorias_ids?.includes(p.categoria_id)) return d;
      if (d.aplica_a === "subcategorias" && p.subcategoria_id && d.subcategorias_ids?.includes(p.subcategoria_id)) return d;
      if (d.aplica_a === "marcas" && p.marca_id && d.marcas_ids?.includes(p.marca_id)) return d;
    }
    return null;
  }, [descuentos]);

  // Helper: get caja units for a product
  const getCajaUnits = useCallback((productoId: string): number => {
    const pres = presentaciones.find(
      p => p.producto_id === productoId && p.nombre.toLowerCase().startsWith("caja")
    );
    return pres?.cantidad || 0;
  }, [presentaciones]);

  // Helper: final price applying modal rounding if active
  const finalPriceForPreview = useCallback((newPrecio: number): number => {
    const base = Math.round(newPrecio);
    if (!roundInModal) return base;
    return calcRound(base, roundInModalMultiple, roundInModalMode);
  }, [roundInModal, roundInModalMultiple, roundInModalMode]);

  // Helper: range string "min – max" or single value
  const rngStr = (values: number[], fmt: (v: number) => string): string => {
    const min = Math.min(...values);
    const max = Math.max(...values);
    return min === max ? fmt(min) : `${fmt(min)} – ${fmt(max)}`;
  };

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
  const startEditing = (id: string, field: "precio" | "costo" | "margen", currentValue: number) => {
    setEditingCell(id);
    setEditingField(field);
    if (field === "precio") {
      setEditingValue(String(priceChanges[id] ?? currentValue));
    } else if (field === "costo") {
      setEditingValue(String(costoChanges[id] ?? currentValue));
    } else {
      setEditingValue(String(Math.round(currentValue * 10) / 10));
    }
  };

  const confirmEdit = (id: string) => {
    const val = parseFloat(editingValue);
    if (isNaN(val) || val < 0) { setEditingCell(null); return; }
    const prod = productos.find((p) => p.id === id);
    if (!prod) { setEditingCell(null); return; }

    if (editingField === "precio") {
      setPriceChanges((prev) => ({ ...prev, [id]: Math.round(val) }));
    } else if (editingField === "costo") {
      // Update costo and recalculate precio maintaining current margin
      const currentCosto = costoChanges[id] ?? prod.costo ?? 0;
      const currentPrecio = priceChanges[id] ?? prod.precio;
      setCostoChanges((prev) => ({ ...prev, [id]: Math.round(val * 100) / 100 }));
      // Only recalculate precio if there was a previous costo to derive margin from
      if (currentCosto > 0) {
        const margin = (currentPrecio - currentCosto) / currentCosto;
        const newPrecio = Math.round(val * (1 + margin));
        setPriceChanges((prev) => ({ ...prev, [id]: newPrecio }));
      }
      // If costo was 0, keep current precio unchanged
    } else if (editingField === "margen") {
      // Set margin and recalculate precio from costo
      const costo = costoChanges[id] ?? prod.costo ?? 0;
      if (costo > 0) {
        const newPrecio = Math.round(costo * (1 + val / 100));
        setPriceChanges((prev) => ({ ...prev, [id]: newPrecio }));
      }
    }
    setEditingCell(null);
  };

  const cancelEdit = () => {
    setEditingCell(null);
  };

  // Save changes
  const hasChanges = Object.keys(priceChanges).length > 0 || Object.keys(costoChanges).length > 0;

  // Warn before leaving with unsaved changes
  useEffect(() => {
    if (!hasChanges) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasChanges]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const allIds = new Set([...Object.keys(priceChanges), ...Object.keys(costoChanges)]);
      const updates: PromiseLike<any>[] = [];

      for (const id of allIds) {
        const updateData: Record<string, unknown> = {};
        if (priceChanges[id] !== undefined) {
          const prod = productos.find((p) => p.id === id);
          updateData.precio = priceChanges[id];
          if (prod) updateData.precio_anterior = prod.precio;
        }
        if (costoChanges[id] !== undefined) updateData.costo = costoChanges[id];
        updateData.fecha_actualizacion = new Date().toISOString();
        updates.push(supabase.from("productos").update(updateData).eq("id", id).then());

        // Update presentation prices and costs proportionally
        {
          const prod = productos.find((p) => p.id === id);
          const prodPres = presentaciones.filter((p) => p.producto_id === id);
          const oldPrecio = prod?.precio || 0;
          const newPrecio = priceChanges[id] ?? oldPrecio;
          const oldCosto = prod?.costo || 0;
          const newCosto = costoChanges[id] ?? oldCosto;
          for (const pres of prodPres) {
            const presUpdate: Record<string, unknown> = {};
            if (newPrecio !== oldPrecio) {
              presUpdate.precio = oldPrecio > 0
                ? Math.round(pres.precio * (newPrecio / oldPrecio))
                : (pres.cantidad > 0 ? Math.round(newPrecio * pres.cantidad) : newPrecio);
            }
            if (newCosto !== oldCosto) {
              presUpdate.costo = oldCosto > 0
                ? Math.round(pres.costo * (newCosto / oldCosto))
                : (pres.cantidad > 0 ? Math.round(newCosto * pres.cantidad) : newCosto);
            }
            if (Object.keys(presUpdate).length > 0) {
              updates.push(supabase.from("presentaciones").update(presUpdate).eq("id", pres.id).then());
            }
          }
        }
      }

      await Promise.all(updates);

      // Update combos that contain edited products
      const editedIds = [...allIds];
      if (editedIds.length > 0) {
        const { data: affectedComboItems } = await supabase
          .from("combo_items")
          .select("combo_id, producto_id, cantidad")
          .in("producto_id", editedIds);
        if (affectedComboItems && affectedComboItems.length > 0) {
          const comboIds = [...new Set(affectedComboItems.map((ci) => ci.combo_id))];
          for (const comboId of comboIds) {
            const combo = productos.find((p) => p.id === comboId);
            const { data: allItems } = await supabase
              .from("combo_items")
              .select("producto_id, cantidad")
              .eq("combo_id", comboId);
            if (allItems && combo) {
              const newComboCosto = allItems.reduce((sum, ci) => {
                const editedCosto = costoChanges[ci.producto_id];
                const prod = productos.find((p) => p.id === ci.producto_id);
                const compCosto = editedCosto ?? prod?.costo ?? 0;
                return sum + compCosto * ci.cantidad;
              }, 0);
              const newComboPrecio = allItems.reduce((sum, ci) => {
                const editedPrecio = priceChanges[ci.producto_id];
                const prod = productos.find((p) => p.id === ci.producto_id);
                const compPrecio = editedPrecio ?? prod?.precio ?? 0;
                return sum + compPrecio * ci.cantidad;
              }, 0);
              await supabase.from("productos").update({
                costo: Math.round(newComboCosto),
                precio: Math.round(newComboPrecio),
                precio_anterior: combo.precio,
                fecha_actualizacion: new Date().toISOString(),
              }).eq("id", comboId);
              // Update local state for combo
              setProductos((prev) => prev.map((p) =>
                p.id === comboId ? { ...p, costo: Math.round(newComboCosto), precio: Math.round(newComboPrecio) } : p
              ));
            }
          }
        }
      }

      // Log to precio_historial
      const historyInserts = [];
      for (const id of allIds) {
        const prod = productos.find((p) => p.id === id);
        if (!prod) continue;
        const newPrecio = priceChanges[id] ?? prod.precio;
        const newCosto = costoChanges[id] ?? prod.costo;
        if (newPrecio !== prod.precio || newCosto !== prod.costo) {
          historyInserts.push({
            producto_id: id,
            precio_anterior: prod.precio,
            precio_nuevo: newPrecio,
            costo_anterior: prod.costo,
            costo_nuevo: newCosto,
            usuario: "Admin",
          });
        }
      }
      if (historyInserts.length > 0) {
        try { await supabase.from("precio_historial").insert(historyInserts); } catch { console.error("Error guardando historial de precios"); }
      }

      // Update local state
      setProductos((prev) =>
        prev.map((p) => {
          const newP = { ...p };
          if (priceChanges[p.id] !== undefined) newP.precio = priceChanges[p.id];
          if (costoChanges[p.id] !== undefined) newP.costo = costoChanges[p.id];
          return newP;
        })
      );
      // Update presentaciones local state
      setPresentaciones((prev) =>
        prev.map((pres) => {
          const prod = productos.find((p) => p.id === pres.producto_id);
          if (!prod) return pres;
          let updated = { ...pres };
          if (priceChanges[prod.id] !== undefined) {
            const oldPrecio = prod.precio || 0;
            const newPrecio = priceChanges[prod.id];
            if (oldPrecio > 0 && newPrecio !== oldPrecio) {
              updated.precio = Math.round(pres.precio * (newPrecio / oldPrecio));
            }
          }
          if (costoChanges[prod.id] !== undefined) {
            const oldCosto = prod.costo || 0;
            const newCosto = costoChanges[prod.id];
            if (oldCosto > 0 && newCosto !== oldCosto) {
              updated.costo = Math.round(pres.costo * (newCosto / oldCosto));
            }
          }
          return updated;
        })
      );
      // Collect saved product info for post-save dialog
      const savedInfo: { id: string; nombre: string; codigo: string; precio: number }[] = [];
      for (const id of allIds) {
        const prod = productos.find((p) => p.id === id);
        if (prod) {
          savedInfo.push({
            id: prod.id,
            nombre: prod.nombre,
            codigo: prod.codigo,
            precio: priceChanges[id] ?? prod.precio,
          });
        }
      }

      setPriceChanges({});
      setCostoChanges({});

      // Show post-save dialog
      if (savedInfo.length > 0) {
        setSavedProductNames(savedInfo);
        setPostSaveDialog(true);
      }
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
    if (isNaN(amount) || amount < 0) return [];
    if (amount === 0 && !["margen", "fijar_venta", "fijar_costo"].includes(massTarget)) return [];

    return selectedProducts.map((p) => {
      const currentCosto = costoChanges[p.id] ?? (p.costo || 0);
      const currentPrecio = priceChanges[p.id] ?? p.precio;

      if (massTarget === "fijar_venta") {
        const newPrecio = Math.max(0, Math.round(amount));
        const diff = newPrecio - currentPrecio;
        const diffPercent = currentPrecio > 0 ? ((newPrecio - currentPrecio) / currentPrecio) * 100 : 0;
        return { id: p.id, nombre: p.nombre, currentCosto, newCosto: currentCosto, currentPrecio, newPrecio, diff, diffPercent };
      }

      if (massTarget === "fijar_costo") {
        const newCosto = Math.max(0, Math.round(amount * 100) / 100);
        const diff = newCosto - currentCosto;
        const diffPercent = currentCosto > 0 ? ((newCosto - currentCosto) / currentCosto) * 100 : 0;
        return { id: p.id, nombre: p.nombre, currentCosto, newCosto, currentPrecio, newPrecio: currentPrecio, diff, diffPercent };
      }

      if (massTarget === "margen") {
        // Set fixed margin: precio = costo * (1 + amount/100)
        const newPrecio = currentCosto > 0 ? currentCosto * (1 + amount / 100) : currentPrecio;
        const diff = newPrecio - currentPrecio;
        const diffPercent = currentPrecio > 0 ? ((newPrecio - currentPrecio) / currentPrecio) * 100 : 0;
        return {
          id: p.id, nombre: p.nombre,
          currentCosto, newCosto: currentCosto,
          currentPrecio, newPrecio, diff, diffPercent,
        };
      }

      if (massTarget === "venta") {
        // Modify precio directly, keep costo unchanged
        let newPrecio: number;
        if (massType === "percentage") {
          const factor = massOperation === "increase" ? 1 + amount / 100 : 1 - amount / 100;
          newPrecio = currentPrecio * factor;
        } else {
          newPrecio = massOperation === "increase" ? currentPrecio + amount : currentPrecio - amount;
        }
        newPrecio = Math.max(0, newPrecio);

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
        newCosto = Math.max(0, Math.round(newCosto * 100) / 100);

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
        newPrecio = Math.max(0, newPrecio);

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
      // Compute final prices with optional rounding
      const getFinalPrecio = (exactPrecio: number) => {
        const base = Math.round(exactPrecio);
        return roundInModal ? calcRound(base, roundInModalMultiple, roundInModalMode) : base;
      };

      for (const item of massEditPreview) {
        const prod = productos.find((p) => p.id === item.id);
        const finalPrecio = getFinalPrecio(item.newPrecio);
        const updateData: Record<string, unknown> = {};
        if (finalPrecio !== (prod?.precio ?? 0)) {
          updateData.precio = finalPrecio;
          updateData.fecha_actualizacion = new Date().toISOString();
          if (prod) updateData.precio_anterior = prod.precio;
        }
        if (massTarget === "costo" || massTarget === "fijar_costo") updateData.costo = item.newCosto;
        if (Object.keys(updateData).length > 0) {
          await supabase.from("productos").update(updateData).eq("id", item.id);
        }

        // Update presentation prices and costs proportionally
        const oldPrecio = prod?.precio ?? 0;
        const oldCosto = prod?.costo ?? 0;
        const prodPres = presentaciones.filter((pr) => pr.producto_id === item.id);
        for (const pres of prodPres) {
          const presUpdate: Record<string, unknown> = {};
          if (finalPrecio !== oldPrecio) {
            presUpdate.precio = oldPrecio > 0
              ? Math.round(pres.precio * (finalPrecio / oldPrecio))
              : (pres.cantidad > 0 ? Math.round(finalPrecio * pres.cantidad) : finalPrecio);
          }
          if (item.newCosto !== oldCosto) {
            presUpdate.costo = oldCosto > 0
              ? Math.round(pres.costo * (item.newCosto / oldCosto))
              : (pres.cantidad > 0 ? Math.round(item.newCosto * pres.cantidad) : item.newCosto);
          }
          if (Object.keys(presUpdate).length > 0) {
            await supabase.from("presentaciones").update(presUpdate).eq("id", pres.id);
          }
        }
      }

      // Update combos that contain edited products
      const editedProductIds = massEditPreview.map((item) => item.id);
      if (editedProductIds.length > 0) {
        const { data: affectedComboItems } = await supabase
          .from("combo_items")
          .select("combo_id, producto_id, cantidad")
          .in("producto_id", editedProductIds);
        if (affectedComboItems && affectedComboItems.length > 0) {
          const comboIds = [...new Set(affectedComboItems.map((ci) => ci.combo_id))];
          // Build a map of new prices/costs from the mass edit
          const newPriceMap: Record<string, number> = {};
          const newCostoMap: Record<string, number> = {};
          for (const item of massEditPreview) {
            newPriceMap[item.id] = getFinalPrecio(item.newPrecio);
            newCostoMap[item.id] = item.newCosto;
          }
          for (const comboId of comboIds) {
            const combo = productos.find((p) => p.id === comboId);
            const { data: allItems } = await supabase
              .from("combo_items")
              .select("producto_id, cantidad")
              .eq("combo_id", comboId);
            if (allItems && combo) {
              const newComboCosto = allItems.reduce((sum, ci) => {
                const compCosto = newCostoMap[ci.producto_id] ?? productos.find((p) => p.id === ci.producto_id)?.costo ?? 0;
                return sum + compCosto * ci.cantidad;
              }, 0);
              const newComboPrecio = allItems.reduce((sum, ci) => {
                const compPrecio = newPriceMap[ci.producto_id] ?? productos.find((p) => p.id === ci.producto_id)?.precio ?? 0;
                return sum + compPrecio * ci.cantidad;
              }, 0);
              await supabase.from("productos").update({
                costo: Math.round(newComboCosto),
                precio: Math.round(newComboPrecio),
                precio_anterior: combo.precio,
                fecha_actualizacion: new Date().toISOString(),
              }).eq("id", comboId);
            }
          }
        }
      }

      // Log to precio_historial
      const historyInserts = massEditPreview
        .filter((item) => {
          const prod = productos.find((p) => p.id === item.id);
          return prod && (getFinalPrecio(item.newPrecio) !== prod.precio || item.newCosto !== prod.costo);
        })
        .map((item) => {
          const prod = productos.find((p) => p.id === item.id)!;
          return {
            producto_id: item.id,
            precio_anterior: prod.precio,
            precio_nuevo: getFinalPrecio(item.newPrecio),
            costo_anterior: prod.costo,
            costo_nuevo: item.newCosto,
            usuario: "Admin",
          };
        });
      if (historyInserts.length > 0) {
        try { await supabase.from("precio_historial").insert(historyInserts); } catch { console.error("Error guardando historial de precios"); }
      }

      // Update local state
      setProductos((prev) =>
        prev.map((p) => {
          const preview = massEditPreview.find((i) => i.id === p.id);
          if (preview) {
            const fp = getFinalPrecio(preview.newPrecio);
            return (massTarget === "costo" || massTarget === "fijar_costo")
              ? { ...p, costo: preview.newCosto, precio: fp }
              : { ...p, precio: fp };
          }
          return p;
        })
      );
      setPresentaciones((prev) =>
        prev.map((pres) => {
          const prod = productos.find((p) => p.id === pres.producto_id);
          const preview = massEditPreview.find((i) => i.id === pres.producto_id);
          if (!prod || !preview) return pres;
          const fp = getFinalPrecio(preview.newPrecio);
          let updated = { ...pres };
          if (prod.precio > 0 && fp !== prod.precio) {
            updated.precio = Math.round(pres.precio * (fp / prod.precio));
          }
          if (prod.costo > 0 && preview.newCosto !== prod.costo) {
            updated.costo = Math.round(pres.costo * (preview.newCosto / prod.costo));
          }
          return updated;
        })
      );

      // Remove applied changes
      const cleanedP = { ...priceChanges };
      const cleanedC = { ...costoChanges };
      for (const item of massEditPreview) {
        delete cleanedP[item.id];
        delete cleanedC[item.id];
      }
      setPriceChanges(cleanedP);
      setCostoChanges(cleanedC);

      setMassEditOpen(false);
      setMassAmount("");

      const savedInfo = massEditPreview.map((item) => {
        const prod = productos.find((p) => p.id === item.id);
        return { id: item.id, nombre: prod?.nombre || item.nombre, codigo: prod?.codigo || "", precio: getFinalPrecio(item.newPrecio) };
      });
      if (savedInfo.length > 0) {
        setSavedProductNames(savedInfo);
        setPostSaveDialog(true);
      }
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
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/admin/productos")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="hidden sm:flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <DollarSign className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Editar Precios</h1>
            <p className="text-sm text-muted-foreground">
              Edición rápida de precios de productos
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
          <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-4">
            <div className="flex-1 space-y-1.5">
              <span className="text-xs text-muted-foreground font-semibold tracking-wide">BUSCAR</span>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Buscar por nombre o código..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="pl-9" />
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
                {/* Ordenar */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground font-semibold tracking-wide uppercase">Ordenar por</Label>
                  <select
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as "nombre" | "modificacion")}
                    className="flex w-full rounded-lg border border-input bg-transparent py-2 px-2.5 text-sm h-8"
                  >
                    <option value="nombre">Nombre A-Z</option>
                    <option value="modificacion">Últ. modificación</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Products card */}
      <Card>
        <CardContent className="p-4">
          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <p className="text-sm text-muted-foreground">
              {filteredProductos.length} productos
              {hasChanges && (
                <span className="ml-2 text-orange-600 font-medium">
                  ({new Set([...Object.keys(priceChanges), ...Object.keys(costoChanges)]).size} modificados)
                </span>
              )}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              {selectedIds.size > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const inverted = new Set(filteredProductos.filter((p) => !selectedIds.has(p.id)).map((p) => p.id));
                    setSelectedIds(inverted);
                  }}
                >
                  Invertir selección
                </Button>
              )}
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
                  setMassTarget("costo" as any);
                  setMassType("percentage");
                  setMassOperation("increase");
                }}
              >
                <Pencil className="w-4 h-4 mr-1.5" />
                Edición Masiva
                {selectedIds.size > 0 && (
                  <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-xs">
                    {selectedIds.size}
                  </Badge>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setRoundOpen(true);
                  setRoundPreview([]);
                }}
              >
                🔄 Redondear Precios
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
          ) : (<>
            {/* Mobile card list */}
            <div className="sm:hidden divide-y">
              {paginatedProductos.map((p) => {
                const currentPrice = priceChanges[p.id] ?? p.precio;
                const currentCosto = costoChanges[p.id] ?? p.costo ?? 0;
                const isChanged = priceChanges[p.id] !== undefined || costoChanges[p.id] !== undefined;
                const cajaPrice = getCajaPrice(p.id);
                const margen = currentCosto > 0 ? ((currentPrice - currentCosto) / currentCosto) * 100 : 0;
                const disc = getProductDiscount(p);
                return (
                  <div key={p.id} className={`py-3 px-4 space-y-2 ${isChanged ? "bg-orange-50 dark:bg-orange-950/20" : ""}`}>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleOne(p.id)} className="rounded border-input shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{p.nombre}</p>
                        <p className="text-xs text-muted-foreground font-mono">{p.codigo}</p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">Stock: {p.stock}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground block">Costo</span>
                        <button onClick={() => startEditing(p.id, "costo", currentCosto)} className="font-medium hover:bg-muted px-1 py-0.5 rounded">
                          {currentCosto > 0 ? formatCurrency(currentCosto, true) : "—"}
                        </button>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Precio</span>
                        <button onClick={() => startEditing(p.id, "precio", currentPrice)} className="font-medium hover:bg-muted px-1 py-0.5 rounded">
                          {formatCurrency(currentPrice)}
                        </button>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Margen</span>
                        <span className="font-medium">{currentCosto > 0 ? `${margen.toFixed(1)}%` : "—"}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      {cajaPrice !== null && <span className="text-muted-foreground">Caja: {formatCurrency(cajaPrice)}</span>}
                      {disc && (
                        <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-[10px]">
                          {disc.tipo_descuento === "precio_fijo" && disc.precio_fijo != null ? formatCurrency(disc.precio_fijo) : `-${disc.porcentaje}%`}
                        </Badge>
                      )}
                      {isChanged && <span className="text-orange-500 font-medium">Modificado</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Desktop table */}
            <div className="hidden sm:block">
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
                  <TableHead className="text-right">Costo</TableHead>
                  <TableHead className="text-right">Margen %</TableHead>
                  <TableHead className="text-right">Precio Unidad</TableHead>
                  <TableHead className="text-right">Precio Caja</TableHead>
                  <TableHead className="text-center">Descuento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedProductos.map((p) => {
                  const isEditingThis = editingCell === p.id;
                  const currentPrice = priceChanges[p.id] ?? p.precio;
                  const currentCosto = costoChanges[p.id] ?? p.costo ?? 0;
                  const isChanged = priceChanges[p.id] !== undefined || costoChanges[p.id] !== undefined;
                  const cajaPrice = getCajaPrice(p.id);
                  const margen = currentCosto > 0 ? ((currentPrice - currentCosto) / currentCosto) * 100 : 0;
                  const cajaPres = presentaciones.find(
                    (pr) => pr.producto_id === p.id && pr.nombre.toLowerCase().startsWith("caja")
                  );

                  const renderEditableCell = (field: "precio" | "costo" | "margen", value: number, displayValue: string) => {
                    if (isEditingThis && editingField === field) {
                      return (
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-muted-foreground text-sm">{field === "margen" ? "%" : "$"}</span>
                          <Input
                            autoFocus
                            type="number"
                            step={field === "margen" ? "0.1" : field === "costo" ? "0.01" : "1"}
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") confirmEdit(p.id);
                              if (e.key === "Escape") cancelEdit();
                            }}
                            className="w-24 h-8 text-right"
                          />
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => confirmEdit(p.id)}>
                            <Check className="w-3.5 h-3.5 text-green-600" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelEdit}>
                            <X className="w-3.5 h-3.5 text-red-500" />
                          </Button>
                        </div>
                      );
                    }
                    return (
                      <button
                        onClick={() => startEditing(p.id, field, value)}
                        className="inline-flex items-center gap-1 tabular-nums hover:bg-muted px-2 py-1 rounded cursor-pointer transition-colors"
                      >
                        {displayValue}
                        {isChanged && field !== "margen" && priceChanges[p.id] !== undefined && (
                          <span className="text-orange-500 text-xs ml-0.5">*</span>
                        )}
                      </button>
                    );
                  };

                  return (
                    <React.Fragment key={p.id}>
                      <TableRow className={isChanged ? "bg-orange-50 dark:bg-orange-950/20" : ""}>
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
                          {renderEditableCell("costo", currentCosto, currentCosto > 0 ? formatCurrency(currentCosto, true) : "—")}
                        </TableCell>
                        <TableCell className="text-right">
                          {currentCosto > 0 ? renderEditableCell("margen", margen, `${margen.toFixed(1)}%`) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          {renderEditableCell("precio", currentPrice, formatCurrency(currentPrice))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">—</TableCell>
                        <TableCell className="text-center">
                          {(() => {
                            const disc = getProductDiscount(p);
                            if (!disc) return <span className="text-muted-foreground">—</span>;
                            return (
                              <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-xs">
                                {disc.tipo_descuento === "precio_fijo" && disc.precio_fijo != null ? formatCurrency(disc.precio_fijo) : `-${disc.porcentaje}%`}
                                {disc.clientes_ids?.length > 0 && " 👤"}
                              </Badge>
                            );
                          })()}
                        </TableCell>
                      </TableRow>
                      {/* Sub-row: Unidad */}
                      <TableRow className="bg-muted/30 border-t border-dashed">
                        <TableCell className="py-1" />
                        <TableCell colSpan={2} className="py-1">
                          <div className="flex items-center gap-1.5 pl-4">
                            <span className="text-muted-foreground text-xs">{cajaPres ? "├─" : "└─"}</span>
                            <Badge className="bg-blue-50 text-blue-700 hover:bg-blue-50 text-[10px] px-1.5 py-0">Unidad ×1</Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground py-1 tabular-nums">
                          {currentCosto > 0 ? formatCurrency(currentCosto, true) : "—"}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground py-1 tabular-nums">
                          {currentCosto > 0 ? `${margen.toFixed(1)}%` : "—"}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground py-1 tabular-nums">
                          {formatCurrency(currentPrice)}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground py-1">—</TableCell>
                        <TableCell className="py-1" />
                      </TableRow>
                      {/* Sub-row: Caja (if exists) */}
                      {cajaPres && (
                        <TableRow className="bg-muted/30 border-t border-dashed">
                          <TableCell className="py-1" />
                          <TableCell colSpan={2} className="py-1">
                            <div className="flex items-center gap-1.5 pl-4">
                              <span className="text-muted-foreground text-xs">└─</span>
                              <Badge className="bg-green-50 text-green-700 hover:bg-green-50 text-[10px] px-1.5 py-0">Caja ×{cajaPres.cantidad}</Badge>
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground py-1 tabular-nums">
                            {formatCurrency(currentCosto * cajaPres.cantidad, true)}
                          </TableCell>
                          <TableCell className="py-1" />
                          <TableCell className="text-right text-xs text-muted-foreground py-1 tabular-nums">
                            {formatCurrency(currentPrice * cajaPres.cantidad)}
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground py-1 tabular-nums">
                            {cajaPrice !== null ? formatCurrency(cajaPrice) : formatCurrency(currentPrice * cajaPres.cantidad)}
                          </TableCell>
                          <TableCell className="py-1" />
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
                {filteredProductos.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                      <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      No se encontraron productos
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <span className="text-xs text-muted-foreground">
                  {(page - 1) * itemsPerPage + 1}–{Math.min(page * itemsPerPage, filteredProductos.length)} de {filteredProductos.length} productos
                </span>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button>
                  <span className="text-sm text-muted-foreground px-2">Pág. {page} de {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Siguiente</Button>
                </div>
              </div>
            )}
          </>)}
        </CardContent>
      </Card>

      {/* Mass Edit Dialog */}
      <Dialog open={massEditOpen} onOpenChange={setMassEditOpen}>
        <DialogContent className="max-w-4xl p-0 gap-0 overflow-hidden">
          {/* Header */}
          <div className="flex items-start justify-between px-6 pt-5 pb-4">
            <div>
              <DialogTitle className="text-base font-semibold">Edición masiva de precios</DialogTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                {selectedIds.size} producto{selectedIds.size !== 1 ? "s" : ""} seleccionado{selectedIds.size !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          {/* Body: two columns */}
          <div className="flex border-t overflow-hidden" style={{ maxHeight: "calc(85vh - 140px)" }}>
            {/* Left column — config */}
            <div className="w-48 min-w-48 flex-shrink-0 border-r overflow-y-auto p-3 space-y-3">
              {/* Aplicar sobre */}
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1.5">Aplicar sobre</p>
                {([
                  { val: "costo" as const, label: "Precio de costo" },
                  { val: "venta" as const, label: "Precio de venta" },
                  { val: "margen" as const, label: "Setear Margen %" },
                ]).map((opt) => (
                  <button
                    key={opt.val}
                    onClick={() => setMassTarget(opt.val)}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs border transition-all text-left ${
                      massTarget === opt.val
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-transparent text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    <div className={`w-3 h-3 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                      massTarget === opt.val ? "border-primary" : "border-muted-foreground"
                    }`}>
                      {massTarget === opt.val && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                    </div>
                    {opt.label}
                  </button>
                ))}
                <div className="h-px bg-border my-1" />
                {([
                  { val: "fijar_venta" as const, label: "Fijar Precio Venta" },
                  { val: "fijar_costo" as const, label: "Fijar Precio Costo" },
                ]).map((opt) => (
                  <button
                    key={opt.val}
                    onClick={() => setMassTarget(opt.val)}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs border transition-all text-left ${
                      massTarget === opt.val
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-transparent text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    <div className={`w-3 h-3 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                      massTarget === opt.val ? "border-primary" : "border-muted-foreground"
                    }`}>
                      {massTarget === opt.val && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                    </div>
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Tipo de cambio */}
              {!["margen", "fijar_venta", "fijar_costo"].includes(massTarget) && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1.5">Tipo</p>
                  <div className="flex gap-1">
                    {([
                      { val: "percentage" as const, label: "Porcentaje" },
                      { val: "fixed" as const, label: "Monto fijo" },
                    ] as const).map((opt) => (
                      <button
                        key={opt.val}
                        onClick={() => setMassType(opt.val)}
                        className={`px-2.5 py-1 rounded-full text-xs border transition-all ${
                          massType === opt.val
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border text-muted-foreground hover:border-primary/50"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Operacion */}
              {!["margen", "fijar_venta", "fijar_costo"].includes(massTarget) && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1.5">Operación</p>
                  <div className="flex gap-1">
                    {([
                      { val: "increase" as const, label: "Aumentar" },
                      { val: "decrease" as const, label: "Disminuir" },
                    ]).map((opt) => (
                      <button
                        key={opt.val}
                        onClick={() => setMassOperation(opt.val)}
                        className={`px-2.5 py-1 rounded-full text-xs border transition-all ${
                          massOperation === opt.val
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border text-muted-foreground hover:border-primary/50"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Amount input */}
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1.5">
                  {massTarget === "margen" ? "Margen" : massTarget === "fijar_venta" ? "Precio venta" : massTarget === "fijar_costo" ? "Precio costo" : "Valor"}
                </p>
                <div className="flex items-center">
                  <span className="px-2.5 py-1.5 bg-muted border border-r-0 border-input rounded-l-md text-sm text-muted-foreground">
                    {massTarget === "margen" ? "%" : ["fijar_venta", "fijar_costo"].includes(massTarget) ? "$" : massType === "percentage" ? "%" : "$"}
                  </span>
                  <Input
                    type="number"
                    step="0.01"
                    value={massAmount}
                    onChange={(e) => setMassAmount(e.target.value)}
                    className="rounded-l-none w-24 text-right font-mono"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Rounding toggle */}
              <div className="space-y-2 pt-2 border-t mt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Switch
                    checked={roundInModal}
                    onCheckedChange={setRoundInModal}
                    className="scale-75"
                  />
                  <span className="text-xs text-muted-foreground">Redondear al aplicar</span>
                </label>
                {roundInModal && (
                  <div className="space-y-2 pl-1">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Múltiplo</p>
                      <div className="flex gap-1">
                        {([5, 10] as const).map((m) => (
                          <button
                            key={m}
                            onClick={() => setRoundInModalMultiple(m)}
                            className={`px-2.5 py-1 rounded-full text-xs border transition-all ${
                              roundInModalMultiple === m
                                ? "bg-primary text-primary-foreground border-primary"
                                : "border-border text-muted-foreground"
                            }`}
                          >
                            ${m}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Dirección</p>
                      <div className="flex flex-col gap-1">
                        {([
                          { val: "nearest" as const, label: "Más cercano" },
                          { val: "up" as const, label: "Hacia arriba" },
                          { val: "down" as const, label: "Hacia abajo" },
                        ]).map((opt) => (
                          <button
                            key={opt.val}
                            onClick={() => setRoundInModalMode(opt.val)}
                            className={`px-2.5 py-1 rounded-full text-xs border transition-all text-left ${
                              roundInModalMode === opt.val
                                ? "bg-primary text-primary-foreground border-primary"
                                : "border-border text-muted-foreground"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right column — preview */}
            <div className="flex-1 overflow-hidden flex flex-col p-3">
              {/* Preview table */}
              <div className="overflow-y-auto flex-1">
                {massEditPreview.length > 0 ? (
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-background border-b">
                      <tr className="text-muted-foreground">
                        <th className="text-left py-1.5 px-1.5 font-medium">Producto</th>
                        <th className="text-right py-1.5 px-1.5 font-medium whitespace-nowrap">Costo ant.</th>
                        <th className="text-center py-1.5 w-4"></th>
                        <th className="text-right py-1.5 px-1.5 font-medium whitespace-nowrap">Costo nvo.</th>
                        <th className="text-right py-1.5 px-1.5 font-medium">Precio</th>
                        <th className="text-right py-1.5 px-1.5 font-medium">Margen</th>
                        <th className="text-right py-1.5 px-1.5 font-medium">Dif.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {massEditPreview.map((item) => {
                        const final_ = finalPriceForPreview(item.newPrecio);
                        const diff = final_ - item.currentPrecio;
                        const newMargen = item.newCosto > 0 ? ((final_ - item.newCosto) / item.newCosto) * 100 : 0;
                        return (
                          <tr key={item.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="py-1 px-1.5 whitespace-nowrap">
                              {item.nombre}
                            </td>
                            <td className="py-1 px-1.5 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                              {formatCurrency(item.currentCosto, true)}
                            </td>
                            <td className="py-1 text-center text-muted-foreground">→</td>
                            <td className="py-1 px-1.5 text-right tabular-nums font-medium whitespace-nowrap">
                              {formatCurrency(item.newCosto, true)}
                            </td>
                            <td className="py-1 px-1.5 text-right tabular-nums font-medium whitespace-nowrap">
                              {formatCurrency(final_)}
                            </td>
                            <td className="py-1 px-1.5 text-right tabular-nums text-muted-foreground">
                              {newMargen > 0 ? `${newMargen.toFixed(1)}%` : "—"}
                            </td>
                            <td className={`py-1 px-1.5 text-right tabular-nums whitespace-nowrap ${diff >= 0 ? "text-green-600" : "text-red-500"}`}>
                              {diff >= 0 ? "+" : ""}{formatCurrency(Math.abs(diff))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                    <p>Ingresá un valor para ver la vista previa</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t">
            <span className="text-xs text-muted-foreground">
              {roundInModal && massEditPreview.length > 0 && (() => {
                const n = massEditPreview.filter(
                  i => Math.round(i.newPrecio) !== finalPriceForPreview(i.newPrecio)
                ).length;
                return n > 0
                  ? `${n} precio${n !== 1 ? "s" : ""} redondeado${n !== 1 ? "s" : ""} a múltiplo de $${roundInModalMultiple}`
                  : "Sin diferencia por redondeo";
              })()}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setMassEditOpen(false)}>Cancelar</Button>
              <Button
                onClick={() => applyMassEdit()}
                disabled={massEditPreview.length === 0 || saving}
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Aplicar cambios
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rounding Dialog */}
      <Dialog open={roundOpen} onOpenChange={setRoundOpen}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Redondear Precios</DialogTitle>
            <DialogDescription>
              {selectedIds.size > 0 ? `${selectedIds.size} productos seleccionados` : "Todos los productos"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Multiple */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Redondear a múltiplo de</Label>
              <div className="flex gap-2">
                {([5, 10] as const).map((m) => (
                  <button key={m} onClick={() => setRoundMultiple(m)}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border transition-all ${roundMultiple === m ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted border-border"}`}
                  >${m}</button>
                ))}
              </div>
            </div>

            {/* Mode */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Dirección del redondeo</Label>
              <div className="flex gap-2">
                {([
                  { val: "nearest" as const, label: "Más cercano", desc: "$1.946 → $1.945" },
                  { val: "up" as const, label: "Hacia arriba", desc: "$1.941 → $1.945" },
                  { val: "down" as const, label: "Hacia abajo", desc: "$1.949 → $1.945" },
                ]).map((opt) => (
                  <button key={opt.val} onClick={() => setRoundMode(opt.val)}
                    className={`flex-1 py-2.5 px-2 rounded-lg text-center border transition-all ${roundMode === opt.val ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted border-border"}`}
                  >
                    <div className="text-sm font-semibold">{opt.label}</div>
                    <div className={`text-[10px] mt-0.5 ${roundMode === opt.val ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Preview (auto-generated) */}
            {roundPreview.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">{roundPreview.length} precios a modificar</Label>
                <div className="border rounded-lg overflow-auto max-h-56">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead className="text-right">Actual</TableHead>
                        <TableHead className="text-center w-8"></TableHead>
                        <TableHead className="text-right">Nuevo</TableHead>
                        <TableHead className="text-right">Dif.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {roundPreview.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="text-sm">{item.nombre}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{formatCurrency(item.precioActual)}</TableCell>
                          <TableCell className="text-center text-muted-foreground">→</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{formatCurrency(item.precioNuevo)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            <span className={item.precioNuevo > item.precioActual ? "text-red-500" : "text-green-500"}>
                              {item.precioNuevo > item.precioActual ? "+" : ""}{formatCurrency(item.precioNuevo - item.precioActual)}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
            {roundPreview.length === 0 && roundOpen && (
              <p className="text-center text-sm text-muted-foreground py-4">No hay precios que necesiten redondeo con la configuración actual</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoundOpen(false)}>Cancelar</Button>
            <Button onClick={applyRounding} disabled={roundPreview.length === 0 || saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Aplicar redondeo ({roundPreview.length})
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

      {/* Post-save dialog - print price tags */}
      <Dialog open={postSaveDialog} onOpenChange={setPostSaveDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="w-5 h-5 text-green-600" />
              Precios actualizados
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Se actualizaron <strong className="text-foreground">{savedProductNames.length} productos</strong> correctamente.
            </p>
            <div className="max-h-40 overflow-y-auto border rounded-lg divide-y">
              {savedProductNames.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-3 py-1.5 text-sm">
                  <span className="truncate mr-2">{p.nombre}</span>
                  <span className="font-semibold tabular-nums whitespace-nowrap">{formatCurrency(p.precio)}</span>
                </div>
              ))}
            </div>
            <p className="text-sm font-medium">¿Querés imprimir los nuevos carteles de precios?</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPostSaveDialog(false)}>
              No, gracias
            </Button>
            <Button variant="outline" onClick={() => {
              setPostSaveDialog(false);
              setSelectedIds(new Set(savedProductNames.map((p) => p.id)));
              setRoundOpen(true);
            }}>
              Redondear precios
            </Button>
            <Button onClick={() => {
              const ids = savedProductNames.map((p) => p.id).join(",");
              setPostSaveDialog(false);
              window.location.href = `/admin/productos/lista-precios?ids=${ids}`;
            }}>
              <Printer className="w-4 h-4 mr-2" />
              Imprimir carteles
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
