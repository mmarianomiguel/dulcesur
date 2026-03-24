"use client";

import { formatCurrency } from "@/lib/formatters";
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

  const applyRounding = async () => {
    if (roundPreview.length === 0) return;
    setSaving(true);
    for (const item of roundPreview) {
      const prod = productos.find((p) => p.id === item.id);
      if (!prod) continue;
      await supabase.from("productos").update({ precio: item.precioNuevo }).eq("id", item.id);
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
    setRoundPreview([]);
    // Reload page to refresh data
    window.location.reload();
  };

  // Confirmation dialog for mass edit
  const [confirmMassEditOpen, setConfirmMassEditOpen] = useState(false);

  // (search state is now internal to SearchableSelect)

  // Mass edit state
  const [massTarget, setMassTarget] = useState<"venta" | "costo" | "margen">("costo");
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
      const [prods, marcaRes, catRes, subcatRes, presData] = await Promise.all([
        fetchAll("productos", "id, nombre, codigo, stock, precio, costo, activo, categoria_id, subcategoria_id, marca_id", (q: any) => q.eq("activo", true).order("nombre")),
        supabase.from("marcas").select("*").order("nombre"),
        supabase.from("categorias").select("*").order("nombre"),
        supabase.from("subcategorias").select("*").order("nombre"),
        fetchAll("presentaciones", "id, producto_id, nombre, cantidad, precio"),
      ]);
      setProductos(prods);
      setMarcas(marcaRes.data ?? []);
      setCategorias(catRes.data ?? []);
      setSubcategorias(subcatRes.data ?? []);
      setPresentaciones(presData);
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

  // Pagination
  const [page, setPage] = useState(1);
  const itemsPerPage = 50;
  const totalPages = Math.max(1, Math.ceil(filteredProductos.length / itemsPerPage));
  const paginatedProductos = useMemo(() => filteredProductos.slice((page - 1) * itemsPerPage, page * itemsPerPage), [filteredProductos, page]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [searchFilter, marcaFilter, categoriaFilter, subcategoriaFilter, estadoFilter]);

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
      const margin = currentCosto > 0 ? (currentPrecio - currentCosto) / currentCosto : 0;
      const newPrecio = Math.round(val * (1 + margin));
      setCostoChanges((prev) => ({ ...prev, [id]: Math.round(val) }));
      setPriceChanges((prev) => ({ ...prev, [id]: newPrecio }));
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

  const handleSave = async () => {
    setSaving(true);
    try {
      const allIds = new Set([...Object.keys(priceChanges), ...Object.keys(costoChanges)]);
      const updates: PromiseLike<any>[] = [];

      for (const id of allIds) {
        const updateData: Record<string, number> = {};
        if (priceChanges[id] !== undefined) updateData.precio = priceChanges[id];
        if (costoChanges[id] !== undefined) updateData.costo = costoChanges[id];
        updates.push(supabase.from("productos").update(updateData).eq("id", id).then());

        // Update presentation prices proportionally when precio changes
        if (priceChanges[id] !== undefined) {
          const prod = productos.find((p) => p.id === id);
          const oldPrecio = prod?.precio || 0;
          const newPrecio = priceChanges[id];
          if (oldPrecio > 0 && newPrecio !== oldPrecio) {
            const ratio = newPrecio / oldPrecio;
            const prodPres = presentaciones.filter((p) => p.producto_id === id);
            for (const pres of prodPres) {
              const newPresPrecio = Math.round(pres.precio * ratio);
              updates.push(supabase.from("presentaciones").update({ precio: newPresPrecio }).eq("id", pres.id).then());
            }
          }
        }
      }

      await Promise.all(updates);

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
        try { await supabase.from("precio_historial").insert(historyInserts); } catch {}
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
          if (prod && priceChanges[prod.id] !== undefined) {
            const oldPrecio = prod.precio || 0;
            const newPrecio = priceChanges[prod.id];
            if (oldPrecio > 0 && newPrecio !== oldPrecio) {
              return { ...pres, precio: Math.round(pres.precio * (newPrecio / oldPrecio)) };
            }
          }
          return pres;
        })
      );
      setPriceChanges({});
      setCostoChanges({});
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
    if (amount === 0 && massTarget !== "margen") return [];

    return selectedProducts.map((p) => {
      const currentCosto = costoChanges[p.id] ?? (p.costo || 0);
      const currentPrecio = priceChanges[p.id] ?? p.precio;

      if (massTarget === "margen") {
        // Set fixed margin: precio = costo * (1 + amount/100)
        const newPrecio = currentCosto > 0 ? Math.round(currentCosto * (1 + amount / 100)) : currentPrecio;
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

      for (const item of massEditPreview) {
        const updateData: Record<string, number> = { precio: item.newPrecio };
        if (massTarget === "costo") updateData.costo = item.newCosto;
        updates.push(supabase.from("productos").update(updateData).eq("id", item.id).then());

        // Update presentation prices proportionally
        const prod = productos.find((p) => p.id === item.id);
        if (prod && prod.precio > 0 && item.newPrecio !== prod.precio) {
          const ratio = item.newPrecio / prod.precio;
          const prodPres = presentaciones.filter((pr) => pr.producto_id === item.id);
          for (const pres of prodPres) {
            updates.push(supabase.from("presentaciones").update({ precio: Math.round(pres.precio * ratio) }).eq("id", pres.id).then());
          }
        }
      }

      await Promise.all(updates);

      // Log to precio_historial
      const historyInserts = massEditPreview
        .filter((item) => {
          const prod = productos.find((p) => p.id === item.id);
          return prod && (item.newPrecio !== prod.precio || item.newCosto !== prod.costo);
        })
        .map((item) => {
          const prod = productos.find((p) => p.id === item.id)!;
          return {
            producto_id: item.id,
            precio_anterior: prod.precio,
            precio_nuevo: item.newPrecio,
            costo_anterior: prod.costo,
            costo_nuevo: item.newCosto,
            usuario: "Admin",
          };
        });
      if (historyInserts.length > 0) {
        try { await supabase.from("precio_historial").insert(historyInserts); } catch {}
      }

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
      setPresentaciones((prev) =>
        prev.map((pres) => {
          const prod = productos.find((p) => p.id === pres.producto_id);
          const preview = massEditPreview.find((i) => i.id === pres.producto_id);
          if (prod && preview && prod.precio > 0 && preview.newPrecio !== prod.precio) {
            return { ...pres, precio: Math.round(pres.precio * (preview.newPrecio / prod.precio)) };
          }
          return pres;
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/admin/productos")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
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
                  setMassTarget("costo" as any);
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

                  const renderEditableCell = (field: "precio" | "costo" | "margen", value: number, displayValue: string) => {
                    if (isEditingThis && editingField === field) {
                      return (
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-muted-foreground text-sm">{field === "margen" ? "%" : "$"}</span>
                          <Input
                            autoFocus
                            type="number"
                            step={field === "margen" ? "0.1" : "1"}
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
                        {renderEditableCell("costo", currentCosto, currentCosto > 0 ? formatCurrency(currentCosto, true) : "—")}
                      </TableCell>
                      <TableCell className="text-right">
                        {currentCosto > 0 ? renderEditableCell("margen", margen, `${margen.toFixed(1)}%`) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        {renderEditableCell("precio", currentPrice, formatCurrency(currentPrice))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {cajaPrice !== null ? formatCurrency(cajaPrice) : "-"}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredProductos.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      No se encontraron productos
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
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
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="massTarget"
                    checked={massTarget === "margen"}
                    onChange={() => setMassTarget("margen")}
                    className="accent-primary"
                  />
                  <span className="text-sm">Setear Margen %</span>
                </label>
              </div>
            </div>

            {/* Tipo de cambio */}
            {massTarget !== "margen" && <div>
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

            }
            {/* Operacion */}
            {massTarget !== "margen" && <div>
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
            </div>}

            {/* Amount input */}
            <div>
              <Label className="text-sm font-medium mb-2 block">
                {massTarget === "margen" ? "Margen %" : massType === "percentage" ? "Porcentaje" : "Monto"}
              </Label>
              <div className="relative w-48">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  {massTarget === "margen" ? "%" : massType === "percentage" ? "%" : "$"}
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

            <Button variant="outline" className="w-full" onClick={generateRoundPreview}>
              Ver preview de cambios
            </Button>

            {/* Preview */}
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
              <p className="text-center text-sm text-muted-foreground py-4">Hacé click en &quot;Ver preview&quot; para ver qué precios cambiarían</p>
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
    </div>
  );
}
