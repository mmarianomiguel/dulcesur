"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { todayARG, nowTimeARG, currentMonthPadded } from "@/lib/formatters";
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
  AlertCircle,
  ImageIcon,
  X,
} from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { logAudit } from "@/lib/audit";

/* ───────── types ───────── */

interface CompraRow {
  id: string;
  numero: string;
  fecha: string;
  proveedor_id: string | null;
  total: number;
  estado: string;
  forma_pago: string | null;
  estado_pago: string | null;
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
  cajas: number;
  sueltas: number;
  unidades_por_caja: number;
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
  return todayARG();
}

/* ───────── component ───────── */

export default function ComprasPage() {
  const currentUser = useCurrentUser();
  const [purchases, setPurchases] = useState<CompraRow[]>([]);
  const [providers, setProviders] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [purchaseFilterMode, setPurchaseFilterMode] = useState<"day" | "month" | "range" | "all">("day");
  const [purchaseFilterDay, setPurchaseFilterDay] = useState(todayString());
  const [purchaseFilterMonth, setPurchaseFilterMonth] = useState(currentMonthPadded());
  const [purchaseFilterYear, setPurchaseFilterYear] = useState(String(new Date().getFullYear()));
  const [purchaseFilterFrom, setPurchaseFilterFrom] = useState(todayString());
  const [purchaseFilterTo, setPurchaseFilterTo] = useState(todayString());

  // New compra state
  const [mode, setMode] = useState<"list" | "new" | "detail">("list");
  const [selectedProveedorId, setSelectedProveedorId] = useState("");
  const [compraProvSearch, setCompraProvSearch] = useState("");
  const [compraProvOpen, setCompraProvOpen] = useState(false);
  const compraProvRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<CompraItem[]>([]);
  const [observacion, setObservacion] = useState("");
  const [fecha, setFecha] = useState(todayString());
  const [numeroCompra, setNumeroCompra] = useState("");
  const [formaPago, setFormaPago] = useState("Transferencia");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [confirmCuentaBancariaId, setConfirmCuentaBancariaId] = useState("");
  const [cuentasBancarias, setCuentasBancarias] = useState<any[]>([]);

  // Load cuentas bancarias
  useEffect(() => {
    supabase.from("cuentas_bancarias").select("id, nombre, alias, tipo_cuenta").eq("activo", true).then(({ data }) => {
      setCuentasBancarias(data || []);
    });
  }, []);

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
      .select("id, numero, fecha, proveedor_id, total, estado, forma_pago, estado_pago, observacion, proveedores(nombre)")
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
        .select("id, nombre, saldo")
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

  // Click outside handler for searchable dropdowns
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (compraProvRef.current && !compraProvRef.current.contains(e.target as Node)) setCompraProvOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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
  const [searchPresentaciones, setSearchPresentaciones] = useState<Record<string, { nombre: string; cantidad: number; costo: number; precio: number }[]>>({});

  const addProduct = (product: ProductSearch, presQty?: number, presCosto?: number) => {
    if (items.some((i) => i.producto_id === product.id)) return;
    const unidadesPorCaja = presQty || 0;
    const cajas = unidadesPorCaja > 0 ? 1 : 0;
    const sueltas = unidadesPorCaja > 0 ? 0 : 1;
    const cantidad = unidadesPorCaja > 0 ? cajas * unidadesPorCaja + sueltas : 1;
    const costoUnit = presCosto || product.costo;
    setItems((prev) => [
      ...prev,
      {
        producto_id: product.id,
        codigo: product.codigo,
        nombre: product.nombre,
        imagen_url: product.imagen_url,
        stock_actual: product.stock,
        cantidad,
        cajas,
        sueltas,
        unidades_por_caja: unidadesPorCaja,
        costo_unitario: costoUnit,
        costo_original: product.costo,
        precio_original: product.precio,
        subtotal: costoUnit * cantidad,
      },
    ]);
    setProductSearch("");
    setProductResults([]);
    setProductSearchOpen(false);
  };

  // Load presentaciones when search results change
  useEffect(() => {
    if (productResults.length === 0) return;
    const ids = productResults.map((p) => p.id);
    supabase.from("presentaciones").select("producto_id, nombre, cantidad, costo, precio").in("producto_id", ids).then(({ data }) => {
      const map: Record<string, any[]> = {};
      (data || []).forEach((pr: any) => {
        if (!map[pr.producto_id]) map[pr.producto_id] = [];
        map[pr.producto_id].push(pr);
      });
      setSearchPresentaciones(map);
    });
  }, [productResults]);

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
      let numero = numeroCompra.trim();
      if (!numero) {
        const { data: numData } = await supabase.rpc("next_numero", {
          p_tipo: "compra",
        });
        numero = numData || "C-0000";
      }

      // Determine estado_pago based on forma de pago
      const estadoPago = formaPago === "Cuenta Corriente" ? "Pendiente" : "Pagada";

      const { data: compra, error } = await supabase
        .from("compras")
        .insert({
          numero,
          fecha: fecha || todayString(),
          proveedor_id: selectedProveedorId || null,
          total: totalCompra,
          estado: "Confirmada",
          forma_pago: formaPago,
          estado_pago: estadoPago,
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

      // Update stock and costs for each product (atomic read+write to prevent race conditions)
      for (const item of items) {
        // Read current stock
        const { data: prodData } = await supabase
          .from("productos")
          .select("stock")
          .eq("id", item.producto_id)
          .single();
        const stockAntes = prodData?.stock ?? 0;
        const newStock = stockAntes + item.cantidad;

        // Atomic update: only update if stock hasn't changed since we read it
        const { data: updData, error: updErr } = await supabase
          .from("productos")
          .update({ stock: newStock })
          .eq("id", item.producto_id)
          .eq("stock", stockAntes)
          .select("id");

        if (updErr || !updData || updData.length === 0) {
          // Retry once with fresh read if concurrent update detected
          const { data: freshProd } = await supabase.from("productos").select("stock").eq("id", item.producto_id).single();
          const freshStock = freshProd?.stock ?? 0;
          await supabase.from("productos").update({ stock: freshStock + item.cantidad }).eq("id", item.producto_id);
        }

        // Re-read for accurate log
        const { data: afterProd } = await supabase.from("productos").select("stock").eq("id", item.producto_id).single();
        const stockDespues = afterProd?.stock ?? newStock;

        // Log stock movement
        await supabase.from("stock_movimientos").insert({
          producto_id: item.producto_id,
          tipo: "compra",
          cantidad_antes: stockAntes,
          cantidad_despues: stockDespues,
          cantidad: item.cantidad,
          referencia: `Compra #${numero}`,
          descripcion: `Compra - ${item.nombre}`,
          usuario: currentUser?.nombre || "Admin Sistema",
          orden_id: compra.id,
        });

        // Update cost and price if modified
        if (item.costo_unitario !== item.costo_original && item.costo_original > 0) {
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

      // Register caja movement if paid and requested
      if (totalCompra > 0 && formaPago !== "Cuenta Corriente" && registrarEnCaja) {
        const prov = providers.find((p) => p.id === selectedProveedorId);
        await supabase.from("caja_movimientos").insert({
          fecha: fecha || todayString(),
          hora: nowTimeARG(),
          tipo: "egreso",
          descripcion: `Compra ${numero} - ${prov?.nombre || "Proveedor"}`,
          metodo_pago: formaPago,
          monto: -totalCompra,
        });
      }

      // If cuenta corriente, update proveedor saldo + create CC entry
      if (formaPago === "Cuenta Corriente" && selectedProveedorId) {
        const prov = providers.find((p) => p.id === selectedProveedorId);
        if (prov) {
          const newSaldo = (prov.saldo || 0) + totalCompra;
          await supabase.from("proveedores").update({ saldo: newSaldo }).eq("id", selectedProveedorId);

          // Register in cuenta_corriente_proveedor
          await supabase.from("cuenta_corriente_proveedor").insert({
            proveedor_id: selectedProveedorId,
            fecha: fecha || todayString(),
            tipo: "compra",
            descripcion: `Compra ${numero} - ${prov.nombre}`,
            monto: totalCompra,
            saldo_resultante: newSaldo,
            referencia_id: compra.id,
            referencia_tipo: "compra",
          });
        }
      }

      logAudit({
        userName: currentUser?.nombre || "Admin Sistema",
        action: "CREATE",
        module: "compras",
        entityId: compra.id,
        after: { numero, total: totalCompra, forma_pago: formaPago, items: items.length },
      });

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
      .select("id, compra_id, producto_id, codigo, descripcion, cantidad, precio_unitario, subtotal")
      .eq("compra_id", compra.id)
      .order("created_at");
    setDetailItems((data as CompraItemRow[]) || []);
    setMode("detail");
  };

  /* ── stats ── */

  const totalMonth = useMemo(() => purchases.reduce((a, p) => a + p.total, 0), [purchases]);
  const pendientePago = useMemo(() => purchases.filter((p) => p.estado_pago === "Pendiente").length, [purchases]);

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
      <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 max-w-6xl mx-auto">
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
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
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
        <Card className="overflow-visible">
          <CardContent className="pt-6 overflow-visible">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Proveedor */}
              <div className="space-y-2">
                <Label className="uppercase text-xs text-muted-foreground font-semibold tracking-wide flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5" />
                  Proveedor
                </Label>
                <div ref={compraProvRef} className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar proveedor..."
                    value={selectedProveedorId ? (providers.find((p) => p.id === selectedProveedorId)?.nombre ?? compraProvSearch) : compraProvSearch}
                    onChange={(e) => { setCompraProvSearch(e.target.value); setSelectedProveedorId(""); setCompraProvOpen(true); }}
                    onFocus={() => setCompraProvOpen(true)}
                    className="pl-9"
                  />
                  {selectedProveedorId && (
                    <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => { setSelectedProveedorId(""); setCompraProvSearch(""); }}>
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  {compraProvOpen && !selectedProveedorId && (
                    <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
                      {providers.filter((p) => p.nombre.toLowerCase().includes(compraProvSearch.toLowerCase())).map((p) => (
                        <button key={p.id} className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors"
                          onClick={() => { setSelectedProveedorId(p.id); setCompraProvSearch(""); setCompraProvOpen(false); }}>
                          {p.nombre}
                        </button>
                      ))}
                      {providers.filter((p) => p.nombre.toLowerCase().includes(compraProvSearch.toLowerCase())).length === 0 && (
                        <p className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</p>
                      )}
                    </div>
                  )}
                </div>
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
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Agregar producto a la compra</DialogTitle></DialogHeader>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                ref={productSearchRef}
                placeholder="Buscar por nombre o código..."
                value={productSearch}
                onChange={(e) => handleProductSearch(e.target.value)}
                className="pl-9 h-11"
                autoFocus
              />
              {searchingProducts && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
              )}
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {productResults.map((p) => {
                const alreadyAdded = items.some((i) => i.producto_id === p.id);
                const pres = searchPresentaciones[p.id] || [];
                const boxPres = pres.find((pr) => pr.cantidad > 1);
                const boxLabel = boxPres ? (boxPres.nombre?.toLowerCase().includes("medio") ? "Medio Cartón" : `Caja x${boxPres.cantidad}`) : null;
                return (
                  <div
                    key={p.id}
                    className={`rounded-xl border p-3 transition-colors ${alreadyAdded ? "opacity-40 bg-muted" : "hover:border-primary/30 hover:bg-primary/5"}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-lg bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                        {p.imagen_url ? (
                          <img src={p.imagen_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <ImageIcon className="w-5 h-5 text-muted-foreground/30" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{p.nombre}</div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span className="font-mono">{p.codigo}</span>
                          <span>·</span>
                          <span>Stock: <strong className={p.stock <= 0 ? "text-red-500" : ""}>{p.stock}</strong></span>
                          <span>·</span>
                          <span>Costo: {formatCurrency(p.costo)}</span>
                        </div>
                      </div>
                      {alreadyAdded && <Badge variant="secondary" className="text-[10px] flex-shrink-0">Ya agregado</Badge>}
                    </div>
                    {!alreadyAdded && (
                      <div className="flex gap-2 mt-2.5 pl-14">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs flex-1"
                          onClick={() => addProduct(p)}
                        >
                          + Unidad
                        </Button>
                        {boxPres && (
                          <Button
                            size="sm"
                            className="h-8 text-xs flex-1"
                            onClick={() => addProduct(p, boxPres.cantidad, boxPres.costo > 0 ? Math.round(boxPres.costo / boxPres.cantidad) : p.costo)}
                          >
                            + {boxLabel} ({boxPres.cantidad} un.)
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {productSearch.length >= 2 && productResults.length === 0 && !searchingProducts && (
                <p className="text-center py-8 text-sm text-muted-foreground">Sin resultados para &quot;{productSearch}&quot;</p>
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
                      <th className="text-left py-3 px-3 font-medium">Codigo</th>
                      <th className="text-left py-3 px-3 font-medium">Producto</th>
                      <th className="text-center py-3 px-3 font-medium">Stock</th>
                      <th className="text-center py-3 px-3 font-medium">Cajas</th>
                      <th className="text-center py-3 px-3 font-medium">Sueltas</th>
                      <th className="text-center py-3 px-3 font-medium">Total un.</th>
                      <th className="text-right py-3 px-3 font-medium">Costo Unit.</th>
                      <th className="text-right py-3 px-3 font-medium">Subtotal</th>
                      <th className="text-center py-3 px-3 font-medium">Mod.</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => {
                      const costoChanged = item.costo_unitario !== item.costo_original;
                      return (
                        <tr key={item.producto_id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                          <td className="py-2 px-2">
                            <div className="w-8 h-8 rounded bg-muted flex items-center justify-center overflow-hidden">
                              {item.imagen_url ? (
                                <img src={item.imagen_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <ImageIcon className="w-3.5 h-3.5 text-muted-foreground/40" />
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-3 font-mono text-xs text-muted-foreground">{item.codigo}</td>
                          <td className="py-2 px-3 font-medium">{item.nombre}</td>
                          <td className="py-2 px-3 text-center">
                            <Badge variant={item.stock_actual <= 0 ? "destructive" : "secondary"} className="text-xs font-normal">
                              {item.stock_actual}
                            </Badge>
                          </td>
                          <td className="py-2 px-3 text-center">
                            {item.unidades_por_caja > 0 ? (
                              <Input
                                type="number"
                                min={0}
                                value={item.cajas}
                                onChange={(e) => {
                                  const newCajas = Math.max(0, Number(e.target.value));
                                  const newTotal = newCajas * item.unidades_por_caja + item.sueltas;
                                  setItems((prev) => prev.map((it, i) => i === idx ? { ...it, cajas: newCajas, cantidad: newTotal, subtotal: it.costo_unitario * newTotal } : it));
                                }}
                                className="w-16 mx-auto text-center h-8"
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <Input
                              type="number"
                              min={0}
                              value={item.unidades_por_caja > 0 ? item.sueltas : item.cantidad}
                              onChange={(e) => {
                                const val = Math.max(0, Number(e.target.value));
                                if (item.unidades_por_caja > 0) {
                                  const newTotal = item.cajas * item.unidades_por_caja + val;
                                  setItems((prev) => prev.map((it, i) => i === idx ? { ...it, sueltas: val, cantidad: newTotal, subtotal: it.costo_unitario * newTotal } : it));
                                } else {
                                  setItems((prev) => prev.map((it, i) => i === idx ? { ...it, cantidad: Math.max(1, val), sueltas: val, subtotal: it.costo_unitario * Math.max(1, val) } : it));
                                }
                              }}
                              className="w-16 mx-auto text-center h-8"
                            />
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className="text-sm font-semibold">{item.cantidad}</span>
                            {item.unidades_por_caja > 0 && (
                              <span className="text-[10px] text-muted-foreground block">{item.cajas}×{item.unidades_por_caja}+{item.sueltas}</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <Input
                              type="number"
                              min={0}
                              value={item.costo_unitario}
                              onChange={(e) => updateItemField(idx, "costo_unitario", Math.max(0, Number(e.target.value)))}
                              className="w-28 ml-auto text-right h-8"
                            />
                          </td>
                          <td className="py-2 px-3 text-right font-semibold">{formatCurrency(item.subtotal)}</td>
                          <td className="py-2 px-3 text-center">
                            {costoChanged ? (
                              <Badge variant="default" className="text-xs">Si</Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="py-2 px-2">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-500" onClick={() => removeItem(idx)}>
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
                      <span>{items.length} producto(s) | {totalUnidades} unidad(es)</span>
                      {items.filter((i) => i.costo_unitario !== i.costo_original).length > 0 && (
                        <span className="text-amber-600 dark:text-amber-400">
                          {items.filter((i) => i.costo_unitario !== i.costo_original).length} con costo modificado
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Total:</span>
                      <span className="text-lg font-bold">{formatCurrency(totalCompra)}</span>
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
              Al confirmar se actualizara el stock y se registrara el movimiento de caja.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { resetForm(); setMode("list"); }}>Cancelar</Button>
              <Button onClick={openConfirmDialog} disabled={saving} size="lg">
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Confirmar Compra
              </Button>
            </div>
          </div>
        )}

        {/* Confirmation dialog */}
        <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg">Confirmar Compra</DialogTitle>
            </DialogHeader>
            <div className="space-y-5">
              {/* Header info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-muted/50 p-3">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Proveedor</span>
                  <p className="font-medium text-sm mt-0.5">{providers.find((p) => p.id === selectedProveedorId)?.nombre || "Sin proveedor"}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Fecha</span>
                  <p className="font-medium text-sm mt-0.5">{new Date(fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}</p>
                </div>
              </div>

              {/* Items detail */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Detalle ({items.length} productos · {totalUnidades} unidades)</span>
                <div className="rounded-lg border divide-y max-h-40 overflow-y-auto">
                  {items.map((item) => {
                    const costoChanged = item.costo_unitario !== item.costo_original;
                    const pctChange = item.costo_original > 0 ? Math.round(((item.costo_unitario - item.costo_original) / item.costo_original) * 100) : 0;
                    return (
                      <div key={item.producto_id} className="flex items-center justify-between px-3 py-2 text-sm">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="truncate">{item.nombre}</span>
                          <span className="text-xs text-muted-foreground flex-shrink-0">×{item.cantidad}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {costoChanged && (
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${pctChange > 0 ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"}`}>
                              {pctChange > 0 ? "+" : ""}{pctChange}%
                            </span>
                          )}
                          <span className="font-medium tabular-nums">{formatCurrency(item.subtotal)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between items-center px-1 pt-1">
                  <span className="text-sm font-semibold">Total compra</span>
                  <span className="text-xl font-bold">{formatCurrency(totalCompra)}</span>
                </div>
              </div>

              {/* Price changes */}
              {items.some((i) => i.costo_unitario !== i.costo_original) && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={actualizarPrecios}
                      onChange={(e) => setActualizarPrecios(e.target.checked)}
                      className="w-4 h-4 rounded border-border mt-0.5 accent-amber-600"
                    />
                    <span className="text-sm text-amber-900">
                      <strong>Actualizar precios de venta</strong> manteniendo el margen
                      <span className="block text-xs text-amber-700 mt-0.5">
                        {items.filter((i) => i.costo_unitario !== i.costo_original).length} producto(s) con costo modificado
                      </span>
                    </span>
                  </label>
                </div>
              )}

              {/* Payment section */}
              <div className="space-y-3 border-t pt-4">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Forma de pago</span>
                <div className="grid grid-cols-3 gap-2">
                  {["Efectivo", "Transferencia", "Cuenta Corriente"].map((fp) => (
                    <button
                      key={fp}
                      onClick={() => setFormaPago(fp)}
                      className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition-all ${
                        formaPago === fp
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "bg-background hover:bg-muted border-border"
                      }`}
                    >
                      {fp === "Cuenta Corriente" ? "Cta. Cte." : fp}
                    </button>
                  ))}
                </div>

                {formaPago === "Transferencia" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Cuenta bancaria destino</Label>
                    <Select value={confirmCuentaBancariaId || ""} onValueChange={(v) => setConfirmCuentaBancariaId(v || "")}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Seleccionar cuenta" /></SelectTrigger>
                      <SelectContent>
                        {cuentasBancarias.map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>{c.nombre} {c.alias ? `(${c.alias})` : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {(formaPago === "Efectivo" || formaPago === "Transferencia") && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={registrarEnCaja} onChange={(e) => setRegistrarEnCaja(e.target.checked)} className="rounded" />
                    <span className="text-sm">Registrar movimiento en caja diaria</span>
                  </label>
                )}

                {formaPago === "Cuenta Corriente" && (
                  <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2.5 border border-amber-200">
                    Se cargará {formatCurrency(totalCompra)} al saldo del proveedor como deuda pendiente
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>Cancelar</Button>
                <Button onClick={handleSave} disabled={saving} size="lg">
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Confirmar compra — {formatCurrency(totalCompra)}
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
      <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => { setMode("list"); setDetailCompra(null); }}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Compra {detailCompra.numero}</h1>
              <Badge variant={detailCompra.estado === "Confirmada" ? "default" : "secondary"} className="text-xs">
                {detailCompra.estado}
              </Badge>
              {detailCompra.estado_pago && (
                <Badge variant={detailCompra.estado_pago === "Pagada" ? "outline" : "destructive"} className="text-xs">
                  {detailCompra.estado_pago}
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground text-sm">
              {detailCompra.proveedores?.nombre || "Sin proveedor"} &middot;{" "}
              {new Date(detailCompra.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-bold">{formatCurrency(detailCompra.total)}</p>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
              <div>
                <span className="text-xs text-muted-foreground block">Proveedor</span>
                <span className="font-medium">{detailCompra.proveedores?.nombre || "---"}</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">Fecha</span>
                <span className="font-medium">{new Date(detailCompra.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">Forma de pago</span>
                <span className="font-medium">{detailCompra.forma_pago || "---"}</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">Estado pago</span>
                <Badge variant={detailCompra.estado_pago === "Pagada" ? "outline" : "destructive"} className="text-xs mt-0.5">
                  {detailCompra.estado_pago || "---"}
                </Badge>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">Total</span>
                <span className="font-bold">{formatCurrency(detailCompra.total)}</span>
              </div>
            </div>
            {detailCompra.observacion && (
              <p className="text-sm text-muted-foreground mt-3 border-t pt-3">{detailCompra.observacion}</p>
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
                    <th className="text-left py-3 px-4 font-medium">Descripcion</th>
                    <th className="text-center py-3 px-4 font-medium">Cantidad</th>
                    <th className="text-right py-3 px-4 font-medium">Costo Unit.</th>
                    <th className="text-right py-3 px-4 font-medium">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {detailItems.map((item) => (
                    <tr key={item.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                      <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{item.codigo}</td>
                      <td className="py-3 px-4 font-medium">{item.descripcion}</td>
                      <td className="py-3 px-4 text-center">{item.cantidad}</td>
                      <td className="py-3 px-4 text-right">{formatCurrency(item.precio_unitario)}</td>
                      <td className="py-3 px-4 text-right font-semibold">{formatCurrency(item.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-end border-t pt-3 mt-1 px-4">
                <span className="text-sm text-muted-foreground mr-4">Total:</span>
                <span className="text-sm font-bold">{formatCurrency(detailCompra.total)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── LIST VIEW ──
  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <Package className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Compras</h1>
            <p className="text-sm text-muted-foreground">
              Registro de compras a proveedores e ingreso de mercaderia
            </p>
          </div>
        </div>
        <Button onClick={() => setMode("new")}>
          <Plus className="w-4 h-4 mr-2" />
          Nueva Compra
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
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
              <p className="text-xs text-muted-foreground">Pendientes de pago</p>
              <p className="text-xl font-bold">{pendientePago}</p>
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
                <Label className="text-xs text-muted-foreground">Periodo</Label>
                <Select value={purchaseFilterMode} onValueChange={(v) => setPurchaseFilterMode((v ?? "day") as "day" | "month" | "range" | "all")}>
                  <SelectTrigger className="w-32"><SelectValue placeholder="Período" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="day">Dia</SelectItem>
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
                    <SelectTrigger className="w-32"><SelectValue placeholder="Mes" /></SelectTrigger>
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
                    <th className="text-left py-3 px-4 font-medium">Proveedor</th>
                    <th className="text-left py-3 px-4 font-medium">Forma pago</th>
                    <th className="text-right py-3 px-4 font-medium">Total</th>
                    <th className="text-center py-3 px-4 font-medium">Pago</th>
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
                      <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{p.numero}</td>
                      <td className="py-3 px-4 text-muted-foreground">{new Date(p.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}</td>
                      <td className="py-3 px-4 font-medium">{p.proveedores?.nombre || "---"}</td>
                      <td className="py-3 px-4 text-muted-foreground text-xs">{p.forma_pago || "---"}</td>
                      <td className="py-3 px-4 text-right font-semibold">{formatCurrency(p.total)}</td>
                      <td className="py-3 px-4 text-center">
                        <Badge
                          variant={p.estado_pago === "Pagada" ? "outline" : p.estado_pago === "Pendiente" ? "destructive" : "secondary"}
                          className="text-xs font-normal"
                        >
                          {p.estado_pago || "---"}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openDetail(p); }}>
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
