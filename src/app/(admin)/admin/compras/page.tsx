"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import type { Proveedor } from "@/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Search,
  Eye,
  Receipt,
  DollarSign,
  Loader2,
  Trash2,
  ArrowLeft,
  Package,
  Save,
  CalendarDays,
  Hash,
  CreditCard,
  AlertCircle,
  ImageIcon,
} from "lucide-react";

/* ───────── types ───────── */

interface CompraRow {
  id: string;
  numero: string;
  fecha: string;
  proveedor_id: string | null;
  total: number;
  estado: string;
  observacion: string | null;
  proveedores: { nombre: string } | null;
}

interface CompraItemRow {
  id: string;
  compra_id: string;
  producto_id: string;
  codigo: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

interface ProductSearch {
  id: string;
  codigo: string;
  nombre: string;
  stock: number;
  costo: number;
  precio: number;
  imagen_url: string | null;
}

interface CompraItem {
  producto_id: string;
  codigo: string;
  nombre: string;
  imagen_url: string | null;
  stock_actual: number;
  cantidad: number;
  costo_unitario: number;
  costo_original: number;
  precio_original: number;
  subtotal: number;
}

/* ───────── helpers ───────── */

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
  }).format(value);
}

function todayString() {
  return new Date().toISOString().split("T")[0];
}

/* ───────── component ───────── */

export default function ComprasPage() {
  const [purchases, setPurchases] = useState<CompraRow[]>([]);
  const [providers, setProviders] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [purchaseFilterMode, setPurchaseFilterMode] = useState<"day" | "month" | "range" | "all">("day");
  const [purchaseFilterDay, setPurchaseFilterDay] = useState(todayString());
  const [purchaseFilterMonth, setPurchaseFilterMonth] = useState(String(new Date().getMonth() + 1));
  const [purchaseFilterYear, setPurchaseFilterYear] = useState(String(new Date().getFullYear()));
  const [purchaseFilterFrom, setPurchaseFilterFrom] = useState(todayString());
  const [purchaseFilterTo, setPurchaseFilterTo] = useState(todayString());

  // New compra state
  const [mode, setMode] = useState<"list" | "new" | "detail">("list");
  const [selectedProveedorId, setSelectedProveedorId] = useState("");
  const [items, setItems] = useState<CompraItem[]>([]);
  const [observacion, setObservacion] = useState("");
  const [fecha, setFecha] = useState(todayString());
  const [numeroCompra, setNumeroCompra] = useState("");
  const [formaPago, setFormaPago] = useState("Transferencia");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Confirmation dialog state
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [actualizarPrecios, setActualizarPrecios] = useState(true);

  // Product search for adding items
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<ProductSearch[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const productSearchRef = useRef<HTMLInputElement>(null);

  // F1 product search dialog
  const [productSearchOpen, setProductSearchOpen] = useState(false);

  useEffect(() => {
    if (mode !== "new") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F1") { e.preventDefault(); setProductSearchOpen(true); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mode]);

  // Registrar en caja state
  const [registrarEnCaja, setRegistrarEnCaja] = useState(true);

  // Detail view
  const [detailCompra, setDetailCompra] = useState<CompraRow | null>(null);
  const [detailItems, setDetailItems] = useState<CompraItemRow[]>([]);

  /* ── fetch list ── */

  const fetchData = useCallback(async () => {
    setLoading(true);
    let comprasQuery = supabase
      .from("compras")
      .select("id, numero, fecha, proveedor_id, total, estado, observacion, proveedores(nombre)")
      .order("fecha", { ascending: false });

    if (purchaseFilterMode === "day") {
      comprasQuery = comprasQuery.eq("fecha", purchaseFilterDay);
    } else if (purchaseFilterMode === "month") {
      const m = purchaseFilterMonth.padStart(2, "0");
      const start = `${purchaseFilterYear}-${m}-01`;
      const nextMonth = Number(purchaseFilterMonth) === 12 ? 1 : Number(purchaseFilterMonth) + 1;
      const nextYear = Number(purchaseFilterMonth) === 12 ? Number(purchaseFilterYear) + 1 : Number(purchaseFilterYear);
      const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
      comprasQuery = comprasQuery.gte("fecha", start).lt("fecha", end);
    } else if (purchaseFilterMode === "range" && purchaseFilterFrom && purchaseFilterTo) {
      comprasQuery = comprasQuery.gte("fecha", purchaseFilterFrom).lte("fecha", purchaseFilterTo);
    }

    const [{ data: c }, { data: p }] = await Promise.all([
      comprasQuery,
      supabase
        .from("proveedores")
        .select("id, nombre")
        .eq("activo", true)
        .order("nombre"),
    ]);
    setPurchases((c as unknown as CompraRow[]) || []);
    setProviders((p || []) as unknown as Proveedor[]);
    setLoading(false);
  }, [purchaseFilterMode, purchaseFilterDay, purchaseFilterMonth, purchaseFilterYear, purchaseFilterFrom, purchaseFilterTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ── product search ── */

  const searchProducts = useCallback(async (term: string) => {
    if (term.length < 2) {
      setProductResults([]);
      return;
    }
    setSearchingProducts(true);
    const { data } = await supabase
      .from("productos")
      .select("id, codigo, nombre, stock, costo, precio, imagen_url")
      .eq("activo", true)
      .or(`nombre.ilike.%${term}%,codigo.ilike.%${term}%`)
      .limit(10);
    let results = (data as ProductSearch[]) || [];
    // Also search by presentacion codes
    if (results.length === 0) {
      const { data: presMat } = await supabase
        .from("presentaciones")
        .select("producto_id")
        .ilike("sku", `%${term}%`)
        .limit(5);
      if (presMat && presMat.length > 0) {
        const prodIds = [...new Set(presMat.map((p: any) => p.producto_id))];
        const { data: prods } = await supabase
          .from("productos")
          .select("id, codigo, nombre, stock, costo, precio, imagen_url")
          .in("id", prodIds);
        results = (prods as ProductSearch[]) || [];
      }
    }
    setProductResults(results);
    setSearchingProducts(false);
  }, []);

  const handleProductSearch = (term: string) => {
    setProductSearch(term);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => searchProducts(term), 300);
  };

  /* ── add product to items ── */

  const addProduct = (product: ProductSearch) => {
    if (items.some((i) => i.producto_id === product.id)) return;
    setItems((prev) => [
      ...prev,
      {
        producto_id: product.id,
        codigo: product.codigo,
        nombre: product.nombre,
        imagen_url: product.imagen_url,
        stock_actual: product.stock,
        cantidad: 1,
        costo_unitario: product.costo,
        costo_original: product.costo,
        precio_original: product.precio,
        subtotal: product.costo,
      },
    ]);
    setProductSearch("");
    setProductResults([]);
    setProductSearchOpen(false);
  };

  /* ── item editing ── */

  const updateItemField = (
    index: number,
    field: "cantidad" | "costo_unitario",
    value: number
  ) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      updated[index].subtotal =
        updated[index].cantidad * updated[index].costo_unitario;
      return updated;
    });
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const totalCompra = items.reduce((a, i) => a + i.subtotal, 0);
  const totalUnidades = items.reduce((a, i) => a + i.cantidad, 0);

  /* ── save compra ── */

  const openConfirmDialog = () => {
    if (items.length === 0) return;
    setSaveError("");
    setShowConfirmDialog(true);
  };

  const handleSave = async () => {
    if (items.length === 0) return;
    setSaving(true);
    setSaveError("");
    setShowConfirmDialog(false);

    try {
      // Use manual numero if provided, otherwise auto-generate
      let numero = numeroCompra.trim();
      if (!numero) {
        const { data: numData } = await supabase.rpc("next_numero", {
          p_tipo: "compra",
        });
        numero = numData || "C-0000";
      }

      const { data: compra, error } = await supabase
        .from("compras")
        .insert({
          numero,
          fecha: fecha || todayString(),
          proveedor_id: selectedProveedorId || null,
          total: totalCompra,
          estado: "Confirmada",
          observacion: observacion || null,
        })
        .select("id")
        .single();

      if (error || !compra) {
        console.error("Error creating compra:", error);
        setSaveError(
          error?.message || "Error al crear la compra. Revisa los datos."
        );
        setSaving(false);
        return;
      }

      // Save compra items
      const rows = items.map((item) => ({
        compra_id: compra.id,
        producto_id: item.producto_id,
        codigo: item.codigo,
        descripcion: item.nombre,
        cantidad: item.cantidad,
        precio_unitario: item.costo_unitario,
        subtotal: item.subtotal,
      }));
      const { error: itemsError } = await supabase
        .from("compra_items")
        .insert(rows);

      if (itemsError) {
        console.error("Error inserting items:", itemsError);
        setSaveError("Error al guardar los items: " + itemsError.message);
        setSaving(false);
        return;
      }

      // Update stock and costs for each product
      for (const item of items) {
        // Get current stock before update
        const { data: prodData } = await supabase
          .from("productos")
          .select("stock")
          .eq("id", item.producto_id)
          .single();
        const stockAntes = prodData?.stock ?? 0;

        // Update stock: add quantity
        const newStock = stockAntes + item.cantidad;
        await supabase
          .from("productos")
          .update({ stock: newStock })
          .eq("id", item.producto_id);

        // Log stock movement
        await supabase.from("stock_movimientos").insert({
          producto_id: item.producto_id,
          tipo: "compra",
          cantidad_antes: stockAntes,
          cantidad_despues: stockAntes + item.cantidad,
          cantidad: item.cantidad,
          referencia: `Compra #${numero}`,
          descripcion: `Compra - ${item.nombre}`,
          usuario: "Admin Sistema",
          orden_id: compra.id,
        });

        // If costo was modified and user wants to update prices
        if (
          item.costo_unitario !== item.costo_original &&
          item.costo_original > 0
        ) {
          if (actualizarPrecios) {
            const marginRatio = item.precio_original / item.costo_original;
            const newPrecio = Math.round(item.costo_unitario * marginRatio);
            await supabase
              .from("productos")
              .update({
                costo: item.costo_unitario,
                precio: newPrecio,
                fecha_actualizacion: todayString(),
              })
              .eq("id", item.producto_id);
          } else {
            await supabase
              .from("productos")
              .update({
                costo: item.costo_unitario,
                fecha_actualizacion: todayString(),
              })
              .eq("id", item.producto_id);
          }
        } else if (item.costo_unitario !== item.costo_original) {
          await supabase
            .from("productos")
            .update({
              costo: item.costo_unitario,
              fecha_actualizacion: todayString(),
            })
            .eq("id", item.producto_id);
        }
      }

      // Register caja movement only if requested and not cuenta corriente
      if (totalCompra > 0 && registrarEnCaja && formaPago !== "Cuenta Corriente") {
        const prov = providers.find((p) => p.id === selectedProveedorId);
        await supabase.from("caja_movimientos").insert({
          fecha: fecha || todayString(),
          hora: new Date().toTimeString().split(" ")[0],
          tipo: "egreso",
          descripcion: `Compra ${numero} - ${prov?.nombre || "Proveedor"}`,
          metodo_pago: formaPago,
          monto: -totalCompra,
        });
      }

      // If cuenta corriente, update proveedor saldo
      if (formaPago === "Cuenta Corriente" && selectedProveedorId) {
        const prov = providers.find((p) => p.id === selectedProveedorId);
        if (prov) {
          await supabase.from("proveedores").update({ saldo: (prov.saldo || 0) + totalCompra }).eq("id", selectedProveedorId);
        }
      }

      setSaving(false);
      resetForm();
      setMode("list");
      fetchData();
    } catch (err) {
      console.error("Unexpected error:", err);
      setSaveError("Error inesperado al guardar la compra.");
      setSaving(false);
    }
  };

  const resetForm = () => {
    setSelectedProveedorId("");
    setItems([]);
    setObservacion("");
    setProductSearch("");
    setProductResults([]);
    setFecha(todayString());
    setNumeroCompra("");
    setFormaPago("Transferencia");
    setSaveError("");
  };

  /* ── open detail ── */

  const openDetail = async (compra: CompraRow) => {
    setDetailCompra(compra);
    const { data } = await supabase
      .from("compra_items")
      .select("id, codigo, descripcion, cantidad, precio_unitario, subtotal")
      .eq("compra_id", compra.id)
      .order("created_at");
    setDetailItems((data as CompraItemRow[]) || []);
    setMode("detail");
  };

  /* ── stats ── */

  const totalMonth = useMemo(() => purchases.reduce((a, p) => a + p.total, 0), [purchases]);
  const pending = useMemo(() => purchases.filter((p) => p.estado === "Pendiente").length, [purchases]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return purchases.filter(
      (p) =>
        p.numero.toLowerCase().includes(term) ||
        (p.proveedores?.nombre || "").toLowerCase().includes(term)
    );
  }, [purchases, search]);

  /* ═══════════════════ RENDER ═══════════════════ */

  // ── NEW COMPRA FORM ──
  if (mode === "new") {
    return (
      <div className="p-6 lg:p-8 space-y-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              resetForm();
              setMode("list");
            }}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">
              Ingreso de Mercaderia
            </h1>
            <p className="text-muted-foreground text-sm">
              Registrar compra e ingresar productos al stock
            </p>
          </div>
          {items.length > 0 && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Total compra</p>
              <p className="text-2xl font-bold text-primary">
                {formatCurrency(totalCompra)}
              </p>
            </div>
          )}
        </div>

        {/* Error banner */}
        {saveError && (
          <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-400">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <p>{saveError}</p>
          </div>
        )}

        {/* Compra details card */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Proveedor */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5" />
                  Proveedor
                </Label>
                <Select
                  value={selectedProveedorId}
                  onValueChange={(v) => setSelectedProveedorId(v ?? "")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar proveedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Fecha */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5" />
                  Fecha
                </Label>
                <Input
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                />
              </div>

              {/* Numero de compra */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5" />
                  N de compra
                  <span className="text-[10px] opacity-60">(opcional)</span>
                </Label>
                <Input
                  value={numeroCompra}
                  onChange={(e) => setNumeroCompra(e.target.value)}
                  placeholder="Auto-generado"
                />
              </div>

            </div>

            {/* Observaciones row */}
            <div className="mt-4 space-y-2">
              <Label className="text-xs text-muted-foreground">
                Observaciones
              </Label>
              <Input
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                placeholder="Notas adicionales..."
              />
            </div>
          </CardContent>
        </Card>

        {/* Add product button */}
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setProductSearchOpen(true)} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            Agregar producto <kbd className="ml-1 border rounded px-1 py-0.5 text-[10px] bg-background">F1</kbd>
          </Button>
        </div>

        {/* Product search dialog */}
        <Dialog open={productSearchOpen} onOpenChange={setProductSearchOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Agregar producto</DialogTitle></DialogHeader>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                ref={productSearchRef}
                placeholder="Buscar por nombre o codigo..."
                value={productSearch}
                onChange={(e) => handleProductSearch(e.target.value)}
                className="pl-9"
                autoFocus
              />
              {searchingProducts && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
              )}
            </div>
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {productResults.map((p) => {
                const alreadyAdded = items.some((i) => i.producto_id === p.id);
                return (
                  <button
                    key={p.id}
                    className={`w-full text-left p-2.5 rounded-lg hover:bg-muted transition-colors text-sm flex items-center gap-3 ${alreadyAdded ? "opacity-40 cursor-not-allowed" : ""}`}
                    onClick={() => !alreadyAdded && addProduct(p)}
                    disabled={alreadyAdded}
                  >
                    <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                      {p.imagen_url ? (
                        <img src={p.imagen_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="w-4 h-4 text-muted-foreground/40" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{p.codigo}</span>
                        <span className="font-medium truncate">{p.nombre}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Stock: {p.stock} | Costo: {formatCurrency(p.costo)} | Precio: {formatCurrency(p.precio)}
                      </div>
                    </div>
                    {alreadyAdded && <Badge variant="secondary" className="text-[10px]">Agregado</Badge>}
                  </button>
                );
              })}
              {productSearch.length >= 2 && productResults.length === 0 && !searchingProducts && (
                <p className="text-center py-6 text-sm text-muted-foreground">Sin resultados</p>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Items table */}
        <Card>
          <CardContent className="pt-0">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Package className="w-10 h-10 mb-3 opacity-40" />
                <p className="text-sm">No hay productos en la compra</p>
                <p className="text-xs mt-1">
                  Presiona <kbd className="border rounded px-1 py-0.5 text-[10px] bg-muted">F1</kbd> o el boton Agregar para agregar productos
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-3 px-2 font-medium w-10"></th>
                      <th className="text-left py-3 px-3 font-medium">
                        Codigo
                      </th>
                      <th className="text-left py-3 px-3 font-medium">
                        Producto
                      </th>
                      <th className="text-center py-3 px-3 font-medium">
                        Stock actual
                      </th>
                      <th className="text-center py-3 px-3 font-medium">
                        Cantidad
                      </th>
                      <th className="text-right py-3 px-3 font-medium">
                        Costo Unit.
                      </th>
                      <th className="text-right py-3 px-3 font-medium">
                        Subtotal
                      </th>
                      <th className="text-center py-3 px-3 font-medium">
                        Costo mod.
                      </th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => {
                      const costoChanged =
                        item.costo_unitario !== item.costo_original;
                      return (
                        <tr
                          key={item.producto_id}
                          className="border-b last:border-0 hover:bg-muted/50 transition-colors"
                        >
                          {/* Thumbnail */}
                          <td className="py-2 px-2">
                            <div className="w-8 h-8 rounded bg-muted flex items-center justify-center overflow-hidden">
                              {item.imagen_url ? (
                                <img
                                  src={item.imagen_url}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <ImageIcon className="w-3.5 h-3.5 text-muted-foreground/40" />
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-3 font-mono text-xs text-muted-foreground">
                            {item.codigo}
                          </td>
                          <td className="py-2 px-3 font-medium">
                            {item.nombre}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <Badge
                              variant={
                                item.stock_actual <= 0
                                  ? "destructive"
                                  : "secondary"
                              }
                              className="text-xs font-normal"
                            >
                              {item.stock_actual}
                            </Badge>
                          </td>
                          <td className="py-2 px-3 text-center">
                            <Input
                              type="number"
                              min={1}
                              value={item.cantidad}
                              onChange={(e) =>
                                updateItemField(
                                  idx,
                                  "cantidad",
                                  Math.max(1, Number(e.target.value))
                                )
                              }
                              className="w-20 mx-auto text-center h-8"
                            />
                          </td>
                          <td className="py-2 px-3 text-right">
                            <Input
                              type="number"
                              min={0}
                              value={item.costo_unitario}
                              onChange={(e) =>
                                updateItemField(
                                  idx,
                                  "costo_unitario",
                                  Math.max(0, Number(e.target.value))
                                )
                              }
                              className="w-28 ml-auto text-right h-8"
                            />
                          </td>
                          <td className="py-2 px-3 text-right font-semibold">
                            {formatCurrency(item.subtotal)}
                          </td>
                          <td className="py-2 px-3 text-center">
                            {costoChanged ? (
                              <Badge variant="default" className="text-xs">
                                Si
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                -
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-red-500"
                              onClick={() => removeItem(idx)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Summary footer */}
                <div className="border-t bg-muted/30 rounded-b-lg">
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex gap-6 text-xs text-muted-foreground">
                      <span>
                        {items.length} producto(s) |{" "}
                        {totalUnidades} unidad(es)
                      </span>
                      {items.filter(
                        (i) => i.costo_unitario !== i.costo_original
                      ).length > 0 && (
                        <span className="text-amber-600 dark:text-amber-400">
                          {
                            items.filter(
                              (i) => i.costo_unitario !== i.costo_original
                            ).length
                          }{" "}
                          con costo modificado
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        Total:
                      </span>
                      <span className="text-lg font-bold">
                        {formatCurrency(totalCompra)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        {items.length > 0 && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Al confirmar se actualizara el stock y se registrara el movimiento
              de caja.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  resetForm();
                  setMode("list");
                }}
              >
                Cancelar
              </Button>
              <Button onClick={openConfirmDialog} disabled={saving} size="lg">
                {saving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Confirmar Compra
              </Button>
            </div>
          </div>
        )}

        {/* Confirmation dialog */}
        <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Confirmar Compra</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Summary */}
              <div className="rounded-lg border p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Proveedor</span>
                  <span className="font-medium">
                    {providers.find((p) => p.id === selectedProveedorId)
                      ?.nombre || "Sin proveedor"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fecha</span>
                  <span className="font-medium">
                    {new Date(fecha + "T12:00:00").toLocaleDateString("es-AR")}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Productos</span>
                  <span className="font-medium">
                    {items.length} ({totalUnidades} unidades)
                  </span>
                </div>
                <div className="flex justify-between border-t pt-2 mt-2">
                  <span className="text-muted-foreground font-medium">
                    Total
                  </span>
                  <span className="font-bold text-lg">
                    {formatCurrency(totalCompra)}
                  </span>
                </div>
              </div>

              {/* Update prices checkbox */}
              {items.some((i) => i.costo_unitario !== i.costo_original) && (
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={actualizarPrecios}
                    onChange={(e) => setActualizarPrecios(e.target.checked)}
                    className="w-4 h-4 rounded border-border mt-0.5"
                  />
                  <span className="text-sm">
                    Actualizar precios de venta manteniendo el margen de
                    ganancia
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      {
                        items.filter(
                          (i) => i.costo_unitario !== i.costo_original
                        ).length
                      }{" "}
                      producto(s) con costo modificado
                    </span>
                  </span>
                </label>
              )}

              {/* Forma de pago */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Forma de pago</Label>
                <Select value={formaPago} onValueChange={(v) => setFormaPago(v ?? "")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Efectivo">Efectivo</SelectItem>
                    <SelectItem value="Transferencia">Transferencia</SelectItem>
                    <SelectItem value="Cheque">Cheque</SelectItem>
                    <SelectItem value="Cuenta Corriente">Cuenta Corriente</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Registrar en caja */}
              {(formaPago === "Efectivo" || formaPago === "Transferencia") && (
                <label className="flex items-center gap-2 cursor-pointer py-2">
                  <input type="checkbox" checked={registrarEnCaja} onChange={(e) => setRegistrarEnCaja(e.target.checked)} className="rounded" />
                  <span className="text-sm">Registrar movimiento en caja diaria</span>
                </label>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setShowConfirmDialog(false)}
                >
                  Cancelar
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Confirmar compra
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ── DETAIL VIEW ──
  if (mode === "detail" && detailCompra) {
    return (
      <div className="p-6 lg:p-8 space-y-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setMode("list");
              setDetailCompra(null);
            }}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">
                Compra {detailCompra.numero}
              </h1>
              <Badge
                variant={
                  detailCompra.estado === "Confirmada" ? "default" : "secondary"
                }
                className="text-xs"
              >
                {detailCompra.estado}
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm">
              {detailCompra.proveedores?.nombre || "Sin proveedor"} &middot;{" "}
              {new Date(detailCompra.fecha).toLocaleDateString("es-AR")}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-bold">
              {formatCurrency(detailCompra.total)}
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-xs text-muted-foreground block">
                  Proveedor
                </span>
                <span className="font-medium">
                  {detailCompra.proveedores?.nombre || "---"}
                </span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">
                  Fecha
                </span>
                <span className="font-medium">
                  {new Date(detailCompra.fecha).toLocaleDateString("es-AR")}
                </span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">
                  Estado
                </span>
                <Badge
                  variant={
                    detailCompra.estado === "Confirmada"
                      ? "default"
                      : "secondary"
                  }
                  className="text-xs mt-0.5"
                >
                  {detailCompra.estado}
                </Badge>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">
                  Total
                </span>
                <span className="font-bold">
                  {formatCurrency(detailCompra.total)}
                </span>
              </div>
            </div>
            {detailCompra.observacion && (
              <p className="text-sm text-muted-foreground mt-3 border-t pt-3">
                {detailCompra.observacion}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-3 px-4 font-medium">Codigo</th>
                    <th className="text-left py-3 px-4 font-medium">
                      Descripcion
                    </th>
                    <th className="text-center py-3 px-4 font-medium">
                      Cantidad
                    </th>
                    <th className="text-right py-3 px-4 font-medium">
                      Costo Unit.
                    </th>
                    <th className="text-right py-3 px-4 font-medium">
                      Subtotal
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {detailItems.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b last:border-0 hover:bg-muted/50 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono text-xs text-muted-foreground">
                        {item.codigo}
                      </td>
                      <td className="py-3 px-4 font-medium">
                        {item.descripcion}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {item.cantidad}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {formatCurrency(item.precio_unitario)}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold">
                        {formatCurrency(item.subtotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-end border-t pt-3 mt-1 px-4">
                <span className="text-sm text-muted-foreground mr-4">
                  Total:
                </span>
                <span className="text-sm font-bold">
                  {formatCurrency(detailCompra.total)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── LIST VIEW ──
  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Compras</h1>
          <p className="text-muted-foreground text-sm">
            Registro de compras a proveedores e ingreso de mercaderia
          </p>
        </div>
        <Button onClick={() => setMode("new")}>
          <Plus className="w-4 h-4 mr-2" />
          Nueva Compra
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Compras totales</p>
              <p className="text-xl font-bold">{purchases.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-xl font-bold">{formatCurrency(totalMonth)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pendientes</p>
              <p className="text-xl font-bold">{pending}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-end gap-4 flex-wrap">
            <div className="flex-1 max-w-md space-y-1.5">
              <span className="text-xs text-muted-foreground font-semibold tracking-wide">BUSCAR</span>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Buscar por numero o proveedor..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
            </div>
            <div className="flex items-end gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Período</Label>
                <Select value={purchaseFilterMode} onValueChange={(v) => setPurchaseFilterMode((v ?? "day") as "day" | "month" | "range" | "all")}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="day">Día</SelectItem>
                    <SelectItem value="month">Mensual</SelectItem>
                    <SelectItem value="range">Entre fechas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {purchaseFilterMode === "day" && (
                <Input type="date" value={purchaseFilterDay} onChange={(e) => setPurchaseFilterDay(e.target.value)} className="w-40" />
              )}
              {purchaseFilterMode === "month" && (
                <>
                  <Select value={purchaseFilterMonth} onValueChange={(v) => setPurchaseFilterMonth(v ?? "1")}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"].map((m, i) => (
                        <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input type="number" value={purchaseFilterYear} onChange={(e) => setPurchaseFilterYear(e.target.value)} className="w-20" />
                </>
              )}
              {purchaseFilterMode === "range" && (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Desde</Label>
                    <Input type="date" value={purchaseFilterFrom} onChange={(e) => setPurchaseFilterFrom(e.target.value)} className="w-40" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Hasta</Label>
                    <Input type="date" value={purchaseFilterTo} onChange={(e) => setPurchaseFilterTo(e.target.value)} className="w-40" />
                  </div>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Receipt className="w-10 h-10 mb-3 opacity-40" />
              <p className="text-sm">No se encontraron compras</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-3 px-4 font-medium">N</th>
                    <th className="text-left py-3 px-4 font-medium">Fecha</th>
                    <th className="text-left py-3 px-4 font-medium">
                      Proveedor
                    </th>
                    <th className="text-right py-3 px-4 font-medium">Total</th>
                    <th className="text-center py-3 px-4 font-medium">
                      Estado
                    </th>
                    <th className="text-right py-3 px-4 font-medium w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b last:border-0 hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => openDetail(p)}
                    >
                      <td className="py-3 px-4 font-mono text-xs text-muted-foreground">
                        {p.numero}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {new Date(p.fecha).toLocaleDateString("es-AR")}
                      </td>
                      <td className="py-3 px-4 font-medium">
                        {p.proveedores?.nombre || "---"}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold">
                        {formatCurrency(p.total)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge
                          variant={
                            p.estado === "Confirmada" ? "default" : "secondary"
                          }
                          className="text-xs font-normal"
                        >
                          {p.estado}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDetail(p);
                          }}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
