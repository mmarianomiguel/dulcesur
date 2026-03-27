"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { showAdminToast } from "@/components/admin-toast";
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
  TrendingUp,
  Printer,
  Download,
  Copy,
  MessageCircle,
} from "lucide-react";
import * as XLSX from "xlsx";
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
  actualizarPrecio: boolean;
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
  const [quickPeriod, setQuickPeriod] = useState<"today" | "week" | "month" | "custom">("today");
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
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void }>({ open: false, title: "", message: "", onConfirm: () => {} });
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

  // Post-purchase: modified prices dialog
  const [showPreciosDialog, setShowPreciosDialog] = useState(false);
  const [showVisibilidadDialog, setShowVisibilidadDialog] = useState(false);
  const [productosOcultos, setProductosOcultos] = useState<{ id: string; nombre: string }[]>([]);
  const [anularCompraDialog, setAnularCompraDialog] = useState(false);
  const [anulando, setAnulando] = useState(false);

  const handleAnularCompra = async () => {
    if (!detailCompra) return;
    setAnulando(true);
    try {
      const isPendiente = detailCompra.estado === "Pendiente";

      if (!isPendiente) {
        // Only revert stock/caja if the purchase was confirmed (stock was ingested)
        for (const item of detailItems) {
          if (!item.producto_id) continue;
          const { data: prod } = await supabase.from("productos").select("stock").eq("id", item.producto_id).single();
          if (!prod) continue;
          const unitsToRevert = item.cantidad;
          const newStock = Math.max(0, prod.stock - unitsToRevert);
          await supabase.from("productos").update({ stock: newStock }).eq("id", item.producto_id);
          await supabase.from("stock_movimientos").insert({
            producto_id: item.producto_id, tipo: "anulacion",
            cantidad_antes: prod.stock, cantidad_despues: newStock, cantidad: unitsToRevert,
            referencia: `Anulación Compra #${detailCompra.numero}`,
            descripcion: `Anulación compra - ${item.descripcion}`,
            usuario: currentUser?.nombre || "Admin", orden_id: detailCompra.id,
          });
        }
        const { data: cajaRows } = await supabase.from("caja_movimientos").select("*").eq("referencia_id", detailCompra.id).eq("referencia_tipo", "compra");
        for (const cm of cajaRows || []) {
          await supabase.from("caja_movimientos").insert({
            fecha: todayString(), hora: nowTimeARG(), tipo: "ingreso",
            descripcion: `Anulación Compra #${detailCompra.numero}`,
            metodo_pago: (cm as any).metodo_pago || "Efectivo",
            monto: Math.abs((cm as any).monto),
            referencia_id: detailCompra.id, referencia_tipo: "anulacion",
          });
        }
        if (detailCompra.proveedor_id && (detailCompra as any).forma_pago === "Cuenta Corriente") {
          const { data: prov } = await supabase.from("proveedores").select("saldo").eq("id", detailCompra.proveedor_id).single();
          if (prov) await supabase.from("proveedores").update({ saldo: Math.max(0, prov.saldo - detailCompra.total) }).eq("id", detailCompra.proveedor_id);
        }
      }

      // Delete items first, then the compra
      await supabase.from("compra_items").delete().eq("compra_id", detailCompra.id);
      await supabase.from("compras").delete().eq("id", detailCompra.id);
      setDetailCompra(null);
      setMode("list");
      fetchData();
      showAdminToast(isPendiente ? "Compra eliminada." : "Compra anulada y eliminada. Stock revertido.", "success");
    } catch (err: any) {
      showAdminToast("Error al anular: " + (err.message || "Error"), "error");
    }
    setAnulando(false);
    setAnularCompraDialog(false);
  };
  const [preciosModificados, setPreciosModificados] = useState<{ producto_id?: string; nombre: string; codigo: string; precioAnterior: number; precioNuevo: number; costoAnterior: number; costoNuevo: number }[]>([]);

  // Product search for adding items
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<ProductSearch[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const productSearchRef = useRef<HTMLInputElement>(null);

  // F1 product search dialog
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [searchHighlight, setSearchHighlight] = useState(0);

  useEffect(() => {
    if (mode !== "new") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F1") { e.preventDefault(); { setProductSearchOpen(true); searchProducts(""); setSearchHighlight(0); }; }
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

    // Apply date filter based on quickPeriod
    if (quickPeriod === "today") {
      comprasQuery = comprasQuery.eq("fecha", todayString());
    } else if (quickPeriod === "week") {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - diffToMonday);
      const mondayStr = monday.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
      comprasQuery = comprasQuery.gte("fecha", mondayStr).lte("fecha", todayString());
    } else if (quickPeriod === "month") {
      const now = new Date();
      const firstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      comprasQuery = comprasQuery.gte("fecha", firstDay).lte("fecha", todayString());
    } else if (purchaseFilterMode === "day") {
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
  }, [quickPeriod, purchaseFilterMode, purchaseFilterDay, purchaseFilterMonth, purchaseFilterYear, purchaseFilterFrom, purchaseFilterTo]);

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
    if (term.length < 1) {
      // Show recent/all products when empty
      setSearchingProducts(true);
      const { data } = await supabase.from("productos").select("id, codigo, nombre, stock, costo, precio, imagen_url").eq("activo", true).order("nombre").limit(15);
      setProductResults((data as ProductSearch[]) || []);
      setSearchingProducts(false);
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
        actualizarPrecio: true,
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

  const handleSave = async (asPendiente = false) => {
    if (items.length === 0) return;
    setSaving(true);
    setSaveError("");
    setShowConfirmDialog(false);

    const preciosActualizados: { producto_id?: string; nombre: string; codigo: string; precioAnterior: number; precioNuevo: number; costoAnterior: number; costoNuevo: number }[] = [];

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

      const pendingId = (window as any).__pendingCompraId as string | undefined;
      let compra: { id: string };

      if (pendingId) {
        // Update existing pending compra
        const { error } = await supabase
          .from("compras")
          .update({
            numero,
            fecha: fecha || todayString(),
            proveedor_id: selectedProveedorId || null,
            total: totalCompra,
            estado: asPendiente ? "Pendiente" : "Confirmada",
            forma_pago: formaPago,
            estado_pago: estadoPago,
            observacion: observacion || null,
          })
          .eq("id", pendingId);
        if (error) {
          setSaveError(error.message);
          setSaving(false);
          return;
        }
        // Delete old items
        await supabase.from("compra_items").delete().eq("compra_id", pendingId);
        compra = { id: pendingId };
        delete (window as any).__pendingCompraId;
      } else {
        // Create new compra
        const { data, error } = await supabase
          .from("compras")
          .insert({
            numero,
            fecha: fecha || todayString(),
            proveedor_id: selectedProveedorId || null,
            total: totalCompra,
            estado: asPendiente ? "Pendiente" : "Confirmada",
            forma_pago: formaPago,
            estado_pago: estadoPago,
            observacion: observacion || null,
          })
          .select("id")
          .single();

        if (error || !data) {
          console.error("Error creating compra:", error);
          setSaveError(
            error?.message || "Error al crear la compra. Revisa los datos."
          );
          setSaving(false);
          return;
        }
        compra = data;
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

      // If pending, skip stock/caja/price updates
      if (asPendiente) {
        logAudit({
          userName: currentUser?.nombre || "Admin Sistema",
          action: "CREATE",
          module: "compras",
          entityId: compra.id,
          after: { numero, total: totalCompra, forma_pago: formaPago, items: items.length, estado: "Pendiente" },
        });
        setSaving(false);
        resetForm();
        setMode("list");
        fetchData();
        showAdminToast("Compra guardada como pendiente", "success");
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
        if (item.costo_unitario !== item.costo_original) {
          if (item.actualizarPrecio && item.costo_original > 0) {
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
            preciosActualizados.push({
              producto_id: item.producto_id,
              nombre: item.nombre,
              codigo: item.codigo,
              precioAnterior: item.precio_original,
              precioNuevo: newPrecio,
              costoAnterior: item.costo_original,
              costoNuevo: item.costo_unitario,
            });
          } else {
            await supabase
              .from("productos")
              .update({
                costo: item.costo_unitario,
                fecha_actualizacion: todayString(),
              })
              .eq("id", item.producto_id);
          }
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

      // Check for hidden products that now have stock
      const itemIds = items.map((i) => i.producto_id);
      // Check hidden products (direct + combos that use these products as components)
      const { data: ocultos } = await supabase
        .from("productos")
        .select("id, nombre")
        .in("id", itemIds)
        .eq("visibilidad", "oculto");

      // Also find hidden combos that contain any of the purchased products
      const { data: comboLinks } = await supabase
        .from("combo_items")
        .select("combo_id")
        .in("producto_id", itemIds);
      const comboIds = [...new Set((comboLinks || []).map((c: any) => c.combo_id))];
      let ocultosAll = [...(ocultos || [])];
      if (comboIds.length > 0) {
        const { data: combosOcultos } = await supabase
          .from("productos")
          .select("id, nombre, es_combo")
          .in("id", comboIds)
          .eq("visibilidad", "oculto");
        if (combosOcultos) {
          for (const c of combosOcultos) {
            if (!ocultosAll.some((o) => o.id === c.id)) ocultosAll.push(c);
          }
        }
      }
      if (ocultosAll.length > 0) {
        setProductosOcultos(ocultosAll);
        setShowVisibilidadDialog(true);
      }

      setSaving(false);

      resetForm();
      setMode("list");
      fetchData();

      if (preciosActualizados.length > 0) {
        setPreciosModificados(preciosActualizados);
        setShowPreciosDialog(true);
      }
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
    delete (window as any).__pendingCompraId;
  };

  /* ── open detail ── */

  const openDetail = async (compra: CompraRow) => {
    // If pending, open in edit mode (same as new compra form but pre-filled)
    if (compra.estado === "Pendiente") {
      const { data } = await supabase
        .from("compra_items")
        .select("id, compra_id, producto_id, codigo, descripcion, cantidad, precio_unitario, subtotal")
        .eq("compra_id", compra.id)
        .order("created_at");
      const compraItems = (data || []) as CompraItemRow[];

      // Load product data for each item
      const loadedItems: CompraItem[] = [];
      for (const ci of compraItems) {
        const { data: prod } = await supabase.from("productos").select("id, nombre, codigo, precio, costo, stock, imagen_url").eq("id", ci.producto_id).single();
        loadedItems.push({
          producto_id: ci.producto_id,
          nombre: ci.descripcion,
          codigo: ci.codigo || prod?.codigo || "",
          cantidad: ci.cantidad,
          costo_unitario: ci.precio_unitario,
          costo_original: prod?.costo || ci.precio_unitario,
          precio_original: prod?.precio || 0,
          subtotal: ci.subtotal,
          actualizarPrecio: false,
          imagen_url: prod?.imagen_url || null,
          stock_actual: prod?.stock || 0,
          cajas: 0,
          sueltas: ci.cantidad,
          unidades_por_caja: 1,
        });
      }

      setSelectedProveedorId(compra.proveedor_id || "");
      setItems(loadedItems);
      setNumeroCompra(compra.numero);
      setFormaPago(compra.forma_pago || "Efectivo");
      setObservacion(compra.observacion || "");
      setFecha(compra.fecha);
      // Store the pending compra ID so we can update instead of creating new
      (window as any).__pendingCompraId = compra.id;
      setMode("new");
      return;
    }

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
          <Button variant="outline" onClick={() => { setProductSearchOpen(true); searchProducts(""); setSearchHighlight(0); }} className="gap-1.5">
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
                onChange={(e) => { handleProductSearch(e.target.value); setSearchHighlight(0); }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setSearchHighlight((h) => {
                      const next = Math.min(h + 1, productResults.length - 1);
                      document.querySelector(`[data-search-idx="${next}"]`)?.scrollIntoView({ block: "nearest" });
                      return next;
                    });
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setSearchHighlight((h) => {
                      const next = Math.max(h - 1, 0);
                      document.querySelector(`[data-search-idx="${next}"]`)?.scrollIntoView({ block: "nearest" });
                      return next;
                    });
                  } else if (e.key === "Enter" && productResults[searchHighlight]) {
                    e.preventDefault();
                    addProduct(productResults[searchHighlight]);
                  }
                }}
                className="pl-9 h-11"
                autoFocus
              />
              {searchingProducts && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
              )}
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {productResults.map((p, pIdx) => {
                const alreadyAdded = items.some((i) => i.producto_id === p.id);
                const isHighlighted = pIdx === searchHighlight;
                const pres = searchPresentaciones[p.id] || [];
                const boxPres = pres.find((pr) => pr.cantidad > 1);
                const boxLabel = boxPres?.nombre || null;
                return (
                  <div
                    key={p.id}
                    data-search-idx={pIdx}
                    className={`rounded-xl border p-3 transition-colors ${alreadyAdded ? "opacity-40 bg-muted" : isHighlighted ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "hover:border-primary/30 hover:bg-primary/5"}`}
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
              <>
                {/* Price update controls */}
                {items.some((i) => i.costo_unitario !== i.costo_original && i.costo_original > 0) && (
                  <div className="flex items-center justify-between px-3 py-2 bg-blue-50 rounded-lg mb-3">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-medium text-blue-800">
                        {items.filter((i) => i.costo_unitario !== i.costo_original && i.actualizarPrecio).length} de{" "}
                        {items.filter((i) => i.costo_unitario !== i.costo_original).length} productos actualizarán precio
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-blue-700" onClick={() => setItems((prev) => prev.map((i) => i.costo_unitario !== i.costo_original ? { ...i, actualizarPrecio: true } : i))}>
                        Marcar todos
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-blue-700" onClick={() => setItems((prev) => prev.map((i) => i.costo_unitario !== i.costo_original ? { ...i, actualizarPrecio: false } : i))}>
                        Desmarcar todos
                      </Button>
                    </div>
                  </div>
                )}
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
                      <th className="text-right py-3 px-3 font-medium">Costo Caja</th>
                      <th className="text-right py-3 px-3 font-medium">Subtotal</th>
                      <th className="text-center py-3 px-3 font-medium">Mod.</th>
                      <th className="text-center py-3 px-2 font-medium">Actualizar PVP</th>
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
                              className="w-24 ml-auto text-right h-8"
                            />
                          </td>
                          <td className="py-2 px-3 text-right">
                            {item.unidades_por_caja > 0 ? (
                              <span className="text-sm font-medium text-muted-foreground">{formatCurrency(item.costo_unitario * item.unidades_por_caja)}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right font-semibold">{formatCurrency(item.subtotal)}</td>
                          <td className="py-2 px-3 text-center">
                            {costoChanged ? (
                              <Badge variant="default" className="text-xs">Si</Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-center">
                            {costoChanged && item.costo_original > 0 ? (
                              <div className="flex flex-col items-center gap-0.5">
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={item.actualizarPrecio}
                                    onChange={(e) => {
                                      setItems((prev) => prev.map((it, i) => i === idx ? { ...it, actualizarPrecio: e.target.checked } : it));
                                    }}
                                    className="w-3.5 h-3.5 rounded border-gray-300 accent-primary"
                                  />
                                  <span className="text-[10px] text-muted-foreground">
                                    {item.actualizarPrecio ? (
                                      <>{formatCurrency(item.precio_original)} <span className="text-primary font-semibold">→ {formatCurrency(item.costo_original > 0 ? Math.round(item.costo_unitario * (item.precio_original / item.costo_original)) : item.precio_original)}</span></>
                                    ) : (
                                      <span>Mantener {formatCurrency(item.precio_original)}</span>
                                    )}
                                  </span>
                                </label>
                              </div>
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
              </>
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

              {/* Price changes summary */}
              {items.some((i) => i.costo_unitario !== i.costo_original) && (() => {
                const modified = items.filter((i) => i.costo_unitario !== i.costo_original);
                const willUpdate = modified.filter((i) => i.actualizarPrecio && i.costo_original > 0);
                const willKeep = modified.filter((i) => !i.actualizarPrecio || i.costo_original <= 0);
                return (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1.5">
                    <p className="text-sm font-semibold text-amber-900">Precios de venta</p>
                    {willUpdate.length > 0 && (
                      <p className="text-xs text-amber-700">
                        <span className="font-semibold text-primary">{willUpdate.length}</span> producto(s) actualizarán precio (manteniendo margen)
                      </p>
                    )}
                    {willKeep.length > 0 && (
                      <p className="text-xs text-amber-700">
                        <span className="font-semibold">{willKeep.length}</span> producto(s) mantendrán su precio actual
                      </p>
                    )}
                    <p className="text-[10px] text-amber-600">Podés cambiar esto desde la columna &quot;Actualizar PVP&quot; en la tabla</p>
                  </div>
                );
              })()}

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
                <Button variant="secondary" onClick={() => handleSave(true)} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Guardar pendiente
                </Button>
                <Button onClick={() => handleSave(false)} disabled={saving} size="lg">
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Confirmar e ingresar — {formatCurrency(totalCompra)}
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
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
              const productIds = detailItems.map((i) => i.producto_id).filter(Boolean);
              if (productIds.length === 0) return;
              window.open(`/admin/productos/lista-precios?ids=${productIds.join(",")}`, "_blank");
            }}>
              <Printer className="w-3.5 h-3.5" />
              Carteles de precio
            </Button>
            {detailCompra.estado === "Pendiente" && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
                const provNombre = detailCompra.proveedores?.nombre || "Proveedor";
                const lines = detailItems.map((i: any) => `• ${i.descripcion} x${i.cantidad}`);
                const text = `Hola ${provNombre}, te paso el pedido:\n\n${lines.join("\n")}\n\nGracias!`;
                navigator.clipboard.writeText(text);
                showAdminToast("Pedido copiado al portapapeles", "success");
              }}>
                <Copy className="w-3.5 h-3.5" />
                Copiar pedido
              </Button>
            )}
            {detailCompra.estado === "Pendiente" && (
              <Button variant="outline" size="sm" className="gap-1.5 text-green-600 border-green-200 hover:bg-green-50" onClick={() => {
                const provNombre = detailCompra.proveedores?.nombre || "Proveedor";
                const lines = detailItems.map((i: any) => `• ${i.descripcion} x${i.cantidad}`);
                const text = `Hola ${provNombre}, te paso el pedido:\n\n${lines.join("\n")}\n\nGracias!`;
                const encoded = encodeURIComponent(text);
                window.open(`https://wa.me/?text=${encoded}`, "_blank");
              }}>
                <MessageCircle className="w-3.5 h-3.5" />
                WhatsApp
              </Button>
            )}
            {detailCompra.estado === "Pendiente" && (
              <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => {
                setConfirmDialog({
                  open: true,
                  title: "Confirmar ingreso",
                  message: "¿Confirmar ingreso al stock? Se actualizará stock, caja y precios.",
                  onConfirm: async () => {
                setSaving(true);
                try {
                  // Execute stock, caja, price updates for pending purchase
                  for (const item of detailItems) {
                    const { data: prodData } = await supabase.from("productos").select("stock").eq("id", item.producto_id).single();
                    const stockAntes = prodData?.stock ?? 0;
                    const newStock = stockAntes + item.cantidad;
                    await supabase.from("productos").update({ stock: newStock }).eq("id", item.producto_id);
                    await supabase.from("stock_movimientos").insert({
                      producto_id: item.producto_id,
                      tipo: "compra",
                      cantidad_antes: stockAntes,
                      cantidad_despues: newStock,
                      cantidad: item.cantidad,
                      referencia: `Compra #${detailCompra.numero}`,
                      descripcion: `Compra - ${item.descripcion}`,
                      usuario: currentUser?.nombre || "Admin Sistema",
                      orden_id: detailCompra.id,
                    });
                  }
                  // Register caja
                  if (detailCompra.total > 0 && detailCompra.forma_pago !== "Cuenta Corriente") {
                    await supabase.from("caja_movimientos").insert({
                      fecha: detailCompra.fecha,
                      hora: new Date().toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit" }),
                      tipo: "egreso",
                      descripcion: `Compra ${detailCompra.numero} - ${detailCompra.proveedores?.nombre || "Proveedor"}`,
                      metodo_pago: detailCompra.forma_pago,
                      monto: -detailCompra.total,
                    });
                  }
                  // Update estado
                  await supabase.from("compras").update({ estado: "Confirmada" }).eq("id", detailCompra.id);
                  setDetailCompra({ ...detailCompra, estado: "Confirmada" } as any);
                  showAdminToast("Compra ingresada al stock", "success");
                  // Check hidden products
                  const itemIds = detailItems.map((i: any) => i.producto_id).filter(Boolean);
                  const { data: ocultos } = await supabase.from("productos").select("id, nombre").in("id", itemIds).eq("visibilidad", "oculto");
                  if (ocultos && ocultos.length > 0) {
                    setProductosOcultos(ocultos);
                    setShowVisibilidadDialog(true);
                  }
                } catch (err) { showAdminToast("Error al confirmar ingreso", "error"); }
                setSaving(false);
                  },
                });
              }}>
                <Package className="w-3.5 h-3.5" />
                Confirmar ingreso al stock
              </Button>
            )}
            {detailCompra.estado !== "Anulada" && (
              <Button variant="outline" size="sm" className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50" onClick={() => setAnularCompraDialog(true)}>
                <X className="w-3.5 h-3.5" />
                Anular compra
              </Button>
            )}
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-2xl font-bold">{formatCurrency(detailCompra.total)}</p>
            </div>
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

        {/* Anular compra confirmation modal */}
        <Dialog open={anularCompraDialog} onOpenChange={setAnularCompraDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <AlertCircle className="w-5 h-5" />
                Anular compra
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg bg-red-50 border border-red-200 p-4 space-y-2">
                <p className="text-sm text-red-900">
                  ¿Anular compra <span className="font-bold">#{detailCompra?.numero}</span> por <span className="font-bold">{formatCurrency(detailCompra?.total || 0)}</span>?
                </p>
                <p className="text-xs text-red-700">{detailCompra?.estado === "Pendiente" ? "La compra no fue ingresada al stock. Solo se anulará el registro." : "Se revertirá todo el stock y los movimientos de caja asociados."}</p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setAnularCompraDialog(false)} disabled={anulando}>Cancelar</Button>
                <Button variant="destructive" onClick={handleAnularCompra} disabled={anulando} className="gap-1.5">
                  {anulando ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                  {anulando ? "Anulando..." : "Confirmar anulación"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Prices dialog (also needed in detail view) */}
        <Dialog open={showPreciosDialog} onOpenChange={setShowPreciosDialog}>
          <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                Precios ({preciosModificados.length} productos)
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border divide-y max-h-60 overflow-y-auto">
                {preciosModificados.map((p, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2.5 text-sm">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{p.nombre}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{p.codigo}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-primary">{formatCurrency(p.precioNuevo)}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t">
                <Button variant="outline" className="flex-1 gap-2" onClick={() => {
                  // Get product IDs and open Lista de Precios page with pre-selection
                  const ids = preciosModificados.map((p) => {
                    // Find product ID by codigo
                    return p.codigo; // Will search by code in the page
                  }).filter(Boolean);
                  // Use the detail items to get real product IDs
                  const productIds = detailItems?.map((i: any) => i.producto_id).filter(Boolean) || [];
                  if (productIds.length > 0) {
                    window.open(`/admin/productos/lista-precios?ids=${productIds.join(",")}`, "_blank");
                  } else {
                    showAdminToast("No se encontraron productos", "error");
                  }
                }}>
                  <Printer className="w-4 h-4" />
                  Imprimir carteles
                </Button>
              </div>
              <div className="flex justify-end">
                <Button onClick={() => setShowPreciosDialog(false)}>Cerrar</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
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
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex-1 max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Buscar por numero o proveedor..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
            </div>
            <div className="flex items-center gap-1 rounded-lg border p-1">
              {([["today", "Hoy"], ["week", "Esta semana"], ["month", "Este mes"], ["custom", "Personalizado"]] as const).map(([key, label]) => (
                <button key={key} onClick={() => setQuickPeriod(key)} className={`px-3 py-1.5 text-sm rounded-md transition-colors ${quickPeriod === key ? "bg-foreground text-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                  {label}
                </button>
              ))}
            </div>
            {quickPeriod === "custom" && (
              <div className="flex items-center gap-2">
                <Select value={purchaseFilterMode} onValueChange={(v) => setPurchaseFilterMode((v ?? "day") as any)}>
                  <SelectTrigger className="w-28">
                    {purchaseFilterMode === "day" ? "Día" : purchaseFilterMode === "month" ? "Mes" : purchaseFilterMode === "range" ? "Rango" : "Todos"}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">Día</SelectItem>
                    <SelectItem value="month">Mes</SelectItem>
                    <SelectItem value="range">Rango</SelectItem>
                    <SelectItem value="all">Todos</SelectItem>
                  </SelectContent>
                </Select>
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
                    <Input type="date" value={purchaseFilterFrom} onChange={(e) => setPurchaseFilterFrom(e.target.value)} className="w-40" />
                    <span className="text-muted-foreground text-sm">a</span>
                    <Input type="date" value={purchaseFilterTo} onChange={(e) => setPurchaseFilterTo(e.target.value)} className="w-40" />
                  </>
                )}
              </div>
            )}
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
                    <th className="text-center py-3 px-4 font-medium">Estado</th>
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
                          variant={p.estado === "Confirmada" ? "default" : p.estado === "Pendiente" ? "secondary" : "destructive"}
                          className="text-xs font-normal"
                        >
                          {p.estado || "---"}
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

      {/* Prices dialog - accessible from any mode */}
      <Dialog open={showPreciosDialog} onOpenChange={setShowPreciosDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Precios ({preciosModificados.length} productos)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Productos con precios actualizados:
            </p>
            <div className="rounded-lg border divide-y max-h-60 overflow-y-auto">
              {preciosModificados.map((p, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2.5 text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{p.nombre}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{p.codigo}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      {p.precioAnterior > 0 && <p className="text-xs text-muted-foreground line-through">{formatCurrency(p.precioAnterior)}</p>}
                      <p className="font-bold text-primary">{formatCurrency(p.precioNuevo)}</p>
                    </div>
                    {p.precioAnterior > 0 && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${p.precioNuevo > p.precioAnterior ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"}`}>
                        {p.precioNuevo > p.precioAnterior ? "+" : ""}{Math.round(((p.precioNuevo - p.precioAnterior) / p.precioAnterior) * 100)}%
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t">
              <Button variant="outline" className="flex-1 gap-2" onClick={() => {
                const ids = preciosModificados.map((p) => p.producto_id).filter(Boolean);
                if (ids.length > 0) {
                  window.open(`/admin/productos/lista-precios?ids=${ids.join(",")}`, "_blank");
                }
              }}>
                <Printer className="w-4 h-4" />
                Imprimir carteles de precio
              </Button>
              <Button variant="outline" className="flex-1 gap-2" onClick={async () => {
                // Load extra product data (marca, categoria, subcategoria)
                const ids = preciosModificados.map((p) => p.producto_id).filter(Boolean);
                let extraMap: Record<string, { marca: string; categoria: string; subcategoria: string }> = {};
                if (ids.length > 0) {
                  const { data: prods } = await supabase.from("productos").select("id, categorias(nombre), marcas(nombre), subcategoria_id").in("id", ids);
                  const subIds = (prods || []).map((p: any) => p.subcategoria_id).filter(Boolean);
                  let subMap: Record<string, string> = {};
                  if (subIds.length > 0) {
                    const { data: subs } = await supabase.from("subcategorias").select("id, nombre").in("id", subIds);
                    (subs || []).forEach((s: any) => { subMap[s.id] = s.nombre; });
                  }
                  (prods || []).forEach((p: any) => {
                    extraMap[p.id] = {
                      marca: p.marcas?.nombre || "—",
                      categoria: p.categorias?.nombre || "—",
                      subcategoria: p.subcategoria_id ? (subMap[p.subcategoria_id] || "—") : "—",
                    };
                  });
                }

                const { jsPDF } = require("jspdf");
                const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
                const pw = pdf.internal.pageSize.getWidth();
                const margin = 10;
                let y = 18;
                const fmtCur = (v: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(v);

                // Header
                pdf.setFontSize(14);
                pdf.setFont("helvetica", "bold");
                pdf.text("Lista de Precios Actualizados", margin, y);
                y += 5;
                pdf.setFontSize(8);
                pdf.setFont("helvetica", "normal");
                pdf.setTextColor(120);
                pdf.text(`Fecha: ${new Date().toLocaleDateString("es-AR")} — ${preciosModificados.length} productos`, margin, y);
                pdf.setTextColor(0);
                y += 7;

                // Table header
                pdf.setFillColor(240, 240, 240);
                pdf.rect(margin, y - 4, pw - margin * 2, 6, "F");
                pdf.setFontSize(7);
                pdf.setFont("helvetica", "bold");
                pdf.text("Código", margin + 2, y);
                pdf.text("Producto", margin + 32, y);
                pdf.text("Marca", margin + 100, y);
                pdf.text("Categoría", margin + 130, y);
                pdf.text("Subcat.", margin + 160, y);
                pdf.text("Anterior", pw - margin - 55, y, { align: "right" });
                pdf.text("Nuevo", pw - margin - 25, y, { align: "right" });
                pdf.text("Var.", pw - margin, y, { align: "right" });
                y += 5;

                // Rows
                pdf.setFont("helvetica", "normal");
                for (const p of preciosModificados) {
                  if (y > 195) { pdf.addPage(); y = 15; }
                  const extra = extraMap[p.producto_id || ""] || { marca: "—", categoria: "—", subcategoria: "—" };
                  pdf.setFontSize(7);
                  pdf.text((p.codigo || "—").substring(0, 16), margin + 2, y);
                  pdf.text(p.nombre.substring(0, 35), margin + 32, y);
                  pdf.setTextColor(100);
                  pdf.text(extra.marca.substring(0, 15), margin + 100, y);
                  pdf.text(extra.categoria.substring(0, 15), margin + 130, y);
                  pdf.text(extra.subcategoria.substring(0, 15), margin + 160, y);
                  pdf.setTextColor(0);
                  if (p.precioAnterior > 0) {
                    pdf.setTextColor(150);
                    pdf.text(fmtCur(p.precioAnterior), pw - margin - 55, y, { align: "right" });
                    pdf.setTextColor(0);
                  }
                  pdf.setFont("helvetica", "bold");
                  pdf.text(fmtCur(p.precioNuevo), pw - margin - 25, y, { align: "right" });
                  pdf.setFont("helvetica", "normal");
                  if (p.precioAnterior > 0) {
                    const pct = Math.round(((p.precioNuevo - p.precioAnterior) / p.precioAnterior) * 100);
                    pdf.setTextColor(pct > 0 ? 220 : 0, pct > 0 ? 50 : 150, pct > 0 ? 50 : 0);
                    pdf.text(`${pct > 0 ? "+" : ""}${pct}%`, pw - margin, y, { align: "right" });
                    pdf.setTextColor(0);
                  }
                  y += 4.5;
                  pdf.setDrawColor(230);
                  pdf.line(margin, y - 2, pw - margin, y - 2);
                }

                pdf.save(`Precios_Actualizados_${todayString()}.pdf`);
                showAdminToast("PDF generado", "success");
              }}>
                <Download className="w-4 h-4" />
                Lista de precios (PDF)
              </Button>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setShowPreciosDialog(false)}>Cerrar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: productos ocultos que ahora tienen stock */}
      <Dialog open={showVisibilidadDialog} onOpenChange={setShowVisibilidadDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">Mostrar productos en la tienda</DialogTitle>
          </DialogHeader>
          {(() => {
            const [selected, setSelected] = [
              productosOcultos.filter((p) => (p as any)._selected !== false),
              (id: string, val: boolean) => setProductosOcultos((prev) => prev.map((p) => p.id === id ? { ...p, _selected: val } as any : p)),
            ];
            const allSelected = productosOcultos.every((p) => (p as any)._selected !== false);
            const noneSelected = productosOcultos.every((p) => (p as any)._selected === false);
            const selectedIds = productosOcultos.filter((p) => (p as any)._selected !== false).map((p) => p.id);
            const productos = productosOcultos.filter((p) => !(p as any).es_combo);
            const combos = productosOcultos.filter((p) => (p as any).es_combo);

            return (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Estos productos están ocultos pero ahora tienen stock. Seleccioná cuáles querés mostrar en la tienda.
                </p>

                {/* Select all / none */}
                <div className="flex items-center gap-3 text-xs">
                  <button className="text-primary hover:underline font-medium" onClick={() => setProductosOcultos((prev) => prev.map((p) => ({ ...p, _selected: true } as any)))}>
                    Seleccionar todos
                  </button>
                  <span className="text-muted-foreground">·</span>
                  <button className="text-muted-foreground hover:underline" onClick={() => setProductosOcultos((prev) => prev.map((p) => ({ ...p, _selected: false } as any)))}>
                    Ninguno
                  </button>
                  <span className="ml-auto text-muted-foreground">{selectedIds.length} de {productosOcultos.length}</span>
                </div>

                <div className="max-h-60 overflow-y-auto space-y-3">
                  {/* Productos */}
                  {productos.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Productos ({productos.length})</p>
                      {productos.map((p) => {
                        const checked = (p as any)._selected !== false;
                        return (
                          <label key={p.id} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition ${checked ? "bg-emerald-50 border-emerald-300" : "bg-gray-50 border-gray-200 opacity-60"}`}>
                            <input type="checkbox" checked={checked} onChange={(e) => setSelected(p.id, e.target.checked)} className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                            <span className="text-sm font-medium">{p.nombre}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {/* Combos */}
                  {combos.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Combos ({combos.length})</p>
                      {combos.map((p) => {
                        const checked = (p as any)._selected !== false;
                        return (
                          <label key={p.id} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition ${checked ? "bg-violet-50 border-violet-300" : "bg-gray-50 border-gray-200 opacity-60"}`}>
                            <input type="checkbox" checked={checked} onChange={(e) => setSelected(p.id, e.target.checked)} className="rounded border-gray-300 text-violet-600 focus:ring-violet-500" />
                            <span className="text-sm font-medium">{p.nombre}</span>
                            <span className="ml-auto text-[10px] font-medium text-violet-500 bg-violet-100 px-1.5 py-0.5 rounded">COMBO</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" onClick={() => { setShowVisibilidadDialog(false); setProductosOcultos([]); }}>
                    Dejar ocultos
                  </Button>
                  <Button
                    disabled={noneSelected}
                    className="bg-emerald-600 hover:bg-emerald-700"
                    onClick={async () => {
                      if (selectedIds.length === 0) return;
                      await supabase.from("productos").update({ visibilidad: "visible" }).in("id", selectedIds);
                      setShowVisibilidadDialog(false);
                      setProductosOcultos([]);
                      showAdminToast(`${selectedIds.length} producto${selectedIds.length > 1 ? "s" : ""} visible${selectedIds.length > 1 ? "s" : ""} en la tienda`, "success");
                    }}
                  >
                    <Eye className="w-4 h-4 mr-1.5" />
                    Mostrar {selectedIds.length > 0 ? `(${selectedIds.length})` : ""}
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Confirm Dialog */}
      <Dialog open={confirmDialog.open} onOpenChange={(o) => setConfirmDialog(prev => ({ ...prev, open: o }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{confirmDialog.title}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{confirmDialog.message}</p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}>Cancelar</Button>
            <Button onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(prev => ({ ...prev, open: false })); }}>Confirmar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
