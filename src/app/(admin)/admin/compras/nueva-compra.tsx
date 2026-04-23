"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { showAdminToast } from "@/components/admin-toast";
import { todayARG, nowTimeARG, formatCurrency } from "@/lib/formatters";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
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
  Pencil,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { logAudit } from "@/lib/audit";

import type { CompraItem, CompraRow, Proveedor, ProductSearch } from "./types";
import { calcSubtotal } from "./types";

/* ───────── helpers ───────── */

function todayString() {
  return todayARG();
}

/* ───────── Props ───────── */

interface NuevaCompraProps {
  providers: Proveedor[];
  currentUser: { nombre: string } | null;
  // Pre-loaded state (when coming from pedido or pending compra)
  initialItems?: CompraItem[];
  initialProveedorId?: string;
  initialObservacion?: string;
  pendingCompraId?: string | null;
  pedidoOrigenId?: string | null;
  // Callbacks
  onBack: () => void;
  onSaved: () => void;
  onPedidoIngresado?: (pedidoId: string) => void;
}

/* ───────── component ───────── */

export default function NuevaCompra({
  providers,
  currentUser,
  initialItems,
  initialProveedorId,
  initialObservacion,
  pendingCompraId: pendingCompraIdProp,
  pedidoOrigenId,
  onBack,
  onSaved,
  onPedidoIngresado,
}: NuevaCompraProps) {
  /* ── Compra form state ── */
  const [items, setItems] = useState<CompraItem[]>(initialItems || []);
  const [selectedProveedorId, setSelectedProveedorId] = useState(initialProveedorId || "");
  const [compraProvSearch, setCompraProvSearch] = useState("");
  const [compraProvOpen, setCompraProvOpen] = useState(false);
  const compraProvRef = useRef<HTMLDivElement>(null);
  const [observacion, setObservacion] = useState(initialObservacion || "");
  const [fecha, setFecha] = useState(todayString());
  const [numeroCompra, setNumeroCompra] = useState("");
  const [formaPago, setFormaPago] = useState("Transferencia");
  const [tipoComprobante, setTipoComprobante] = useState("Factura A");
  const [numeroComprobante, setNumeroComprobante] = useState("");
  const [descuento, setDescuento] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  /* ── PVP inline expandible ── */
  const [pvpExpandedIdx, setPvpExpandedIdx] = useState<number | null>(null);

  /* ── Redondeo (always visible) ── */
  const [redondeo, setRedondeo] = useState<0 | 10 | 50 | 100>(0);

  /* ── Registrar en caja ── */
  const [registrarEnCaja, setRegistrarEnCaja] = useState(true);

  /* ── Cuentas bancarias ── */
  const [cuentasBancarias, setCuentasBancarias] = useState<any[]>([]);
  const [confirmCuentaBancariaId, setConfirmCuentaBancariaId] = useState("");

  /* ── Confirmation dialog ── */
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  /* ── Post-save dialogs ── */
  const [showPreciosDialog, setShowPreciosDialog] = useState(false);
  const [preciosModificados, setPreciosModificados] = useState<
    { producto_id?: string; nombre: string; codigo: string; precioAnterior: number; precioNuevo: number; costoAnterior: number; costoNuevo: number }[]
  >([]);
  const [showVisibilidadDialog, setShowVisibilidadDialog] = useState(false);
  const [productosOcultos, setProductosOcultos] = useState<{ id: string; nombre: string }[]>([]);

  /* ── Product search ── */
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<ProductSearch[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const productSearchRef = useRef<HTMLInputElement>(null);
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [searchHighlight, setSearchHighlight] = useState(0);
  const [searchPresIdx, setSearchPresIdx] = useState(-1);
  const [searchPresentaciones, setSearchPresentaciones] = useState<
    Record<string, { nombre: string; cantidad: number; costo: number; precio: number }[]>
  >({});

  /* ── Keyboard navigation for items table ── */
  const [selectedItemIdx, setSelectedItemIdx] = useState<number | null>(null);
  const itemsTableRef = useRef<HTMLTableElement>(null);

  /* ── Pending compra id (for updating instead of creating) ── */
  const [pendingCompraId, setPendingCompraId] = useState<string | null>(pendingCompraIdProp || null);

  /* ═══════════════════ EFFECTS ═══════════════════ */

  // Load cuentas bancarias
  useEffect(() => {
    supabase
      .from("cuentas_bancarias")
      .select("id, nombre, alias, tipo_cuenta")
      .eq("activo", true)
      .then(({ data }) => {
        setCuentasBancarias(data || []);
      });
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F1") {
        e.preventDefault();
        setProductSearchOpen(true);
        searchProducts("");
        setSearchHighlight(0);
        return;
      }

      // Don't intercept if typing in an input/textarea/select
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (productSearchOpen) return;

      const len = items.length;
      if (len === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedItemIdx((prev) => {
          const next = prev === null ? 0 : Math.min(prev + 1, len - 1);
          setTimeout(() => {
            const rows = document.querySelectorAll("[data-compra-item]");
            rows[next]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
          }, 0);
          return next;
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedItemIdx((prev) => {
          const next = prev === null ? 0 : Math.max(prev - 1, 0);
          setTimeout(() => {
            const rows = document.querySelectorAll("[data-compra-item]");
            rows[next]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
          }, 0);
          return next;
        });
      } else if (e.key === "ArrowRight" || e.key === "+") {
        e.preventDefault();
        if (selectedItemIdx === null || selectedItemIdx >= len) return;
        setItems((prev) =>
          prev.map((it, i) => {
            if (i !== selectedItemIdx) return it;
            if (it.unidades_por_caja > 0) {
              const newCajas = it.cajas + 1;
              const newTotal = newCajas * it.unidades_por_caja + it.sueltas;
              return {
                ...it,
                cajas: newCajas,
                cantidad: newTotal,
                subtotal: calcSubtotal(it.costo_unitario, newTotal, it.descuento),
              };
            }
            const newQty = it.cantidad + 1;
            return {
              ...it,
              cantidad: newQty,
              sueltas: newQty,
              subtotal: calcSubtotal(it.costo_unitario, newQty, it.descuento),
            };
          })
        );
      } else if (e.key === "ArrowLeft" || e.key === "-") {
        e.preventDefault();
        if (selectedItemIdx === null || selectedItemIdx >= len) return;
        setItems((prev) =>
          prev.map((it, i) => {
            if (i !== selectedItemIdx) return it;
            if (it.unidades_por_caja > 0) {
              const newCajas = Math.max(0, it.cajas - 1);
              const newTotal = newCajas * it.unidades_por_caja + it.sueltas;
              return {
                ...it,
                cajas: newCajas,
                cantidad: newTotal,
                subtotal: calcSubtotal(it.costo_unitario, newTotal, it.descuento),
              };
            }
            const newQty = Math.max(1, it.cantidad - 1);
            return {
              ...it,
              cantidad: newQty,
              sueltas: newQty,
              subtotal: calcSubtotal(it.costo_unitario, newQty, it.descuento),
            };
          })
        );
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (selectedItemIdx !== null && selectedItemIdx < len) {
          removeItem(selectedItemIdx);
          setSelectedItemIdx((prev) =>
            prev !== null && prev >= len - 1 ? Math.max(0, len - 2) : prev
          );
        }
      } else if (e.key === "Escape") {
        setSelectedItemIdx(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [items.length, selectedItemIdx, productSearchOpen]);

  // Click outside handler for searchable dropdowns
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (compraProvRef.current && !compraProvRef.current.contains(e.target as Node))
        setCompraProvOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Load presentaciones when search results change
  useEffect(() => {
    if (productResults.length === 0) return;
    const ids = productResults.map((p) => p.id);
    supabase
      .from("presentaciones")
      .select("producto_id, nombre, cantidad, costo, precio")
      .in("producto_id", ids)
      .then(({ data }) => {
        const map: Record<string, any[]> = {};
        (data || []).forEach((pr: any) => {
          if (!map[pr.producto_id]) map[pr.producto_id] = [];
          map[pr.producto_id].push(pr);
        });
        setSearchPresentaciones(map);
      });
  }, [productResults]);

  // Refresh search results when tab regains focus
  useEffect(() => {
    const onFocus = () => {
      if (productSearchOpen) searchProducts(productSearch);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [productSearchOpen, productSearch]);

  /* ═══════════════════ HELPERS ═══════════════════ */

  const roundPrice = useCallback(
    (price: number) => {
      if (redondeo === 0) return Math.round(price);
      return Math.round(price / redondeo) * redondeo;
    },
    [redondeo]
  );

  const getNuevoPrecio = useCallback(
    (item: CompraItem): number => {
      if (item.precio_nuevo_custom) return item.precio_nuevo_custom;
      if (item.costo_original > 0)
        return roundPrice(item.costo_unitario * (item.precio_original / item.costo_original));
      return item.precio_original;
    },
    [roundPrice]
  );

  const getMargenCustom = useCallback(
    (item: CompraItem): number => {
      const precio = item.precio_nuevo_custom || getNuevoPrecio(item);
      return item.costo_unitario > 0
        ? Math.round(((precio - item.costo_unitario) / item.costo_unitario) * 1000) / 10
        : 0;
    },
    [getNuevoPrecio]
  );

  /* ── Product search ── */

  const searchProducts = useCallback(async (term: string) => {
    if (term.length < 1) {
      setSearchingProducts(true);
      const { data } = await supabase
        .from("productos")
        .select("id, codigo, nombre, stock, costo, precio, imagen_url")
        .eq("activo", true)
        .order("nombre")
        .limit(15);
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

    // Fallback: search by presentacion SKU
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

  /* ── Add product to items ── */

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
        costo_original: costoUnit,
        precio_original: product.precio,
        descuento: 0,
        subtotal: calcSubtotal(costoUnit, cantidad, 0),
        actualizarPrecio: true,
      },
    ]);
    // Scroll to the newly added item after render
    setTimeout(() => {
      const rows = document.querySelectorAll("[data-compra-item]");
      if (rows.length > 0) rows[rows.length - 1].scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 50);
    setProductSearch("");
    setProductResults([]);
    setProductSearchOpen(false);
    setSelectedItemIdx(items.length); // select the newly added item
  };

  /* ── Item editing ── */

  const updateItemField = (
    index: number,
    field: "cantidad" | "costo_unitario" | "descuento",
    value: number
  ) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      updated[index].subtotal = calcSubtotal(
        updated[index].costo_unitario,
        updated[index].cantidad,
        updated[index].descuento
      );
      return updated;
    });
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
    // Close PVP expanded if it was this item
    if (pvpExpandedIdx === index) setPvpExpandedIdx(null);
    else if (pvpExpandedIdx !== null && pvpExpandedIdx > index) setPvpExpandedIdx(pvpExpandedIdx - 1);
  };

  /* ── Computed values ── */

  const subtotalCompra = useMemo(() => items.reduce((a, i) => a + i.subtotal, 0), [items]);
  const totalCompra = useMemo(
    () => (descuento > 0 ? Math.round(subtotalCompra * (1 - descuento / 100) * 100) / 100 : subtotalCompra),
    [subtotalCompra, descuento]
  );
  const totalUnidades = useMemo(() => items.reduce((a, i) => a + i.cantidad, 0), [items]);

  const itemsWithPriceChange = useMemo(
    () => items.filter((i) => i.costo_unitario !== i.costo_original && i.costo_original > 0),
    [items]
  );
  const itemsWillUpdatePvp = useMemo(
    () => itemsWithPriceChange.filter((i) => i.actualizarPrecio),
    [itemsWithPriceChange]
  );

  /* ═══════════════════ SAVE ═══════════════════ */

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

    const preciosActualizados: typeof preciosModificados = [];

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
      const montoPagado = asPendiente ? 0 : formaPago === "Cuenta Corriente" ? 0 : totalCompra;

      const pendingId = pendingCompraId;
      let compra: { id: string };

      if (pendingId) {
        // Update existing pending compra
        const { error } = await supabase
          .from("compras")
          .update({
            numero,
            fecha: fecha || todayString(),
            proveedor_id: selectedProveedorId || null,
            subtotal: subtotalCompra,
            descuento_porcentaje: descuento || 0,
            total: totalCompra,
            estado: asPendiente ? "Pendiente" : "Confirmada",
            forma_pago: formaPago,
            estado_pago: estadoPago,
            monto_pagado: montoPagado,
            tipo_comprobante: tipoComprobante || null,
            numero_comprobante: numeroComprobante.trim() || null,
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
        setPendingCompraId(null);
      } else {
        // Create new compra
        const { data, error } = await supabase
          .from("compras")
          .insert({
            numero,
            fecha: fecha || todayString(),
            proveedor_id: selectedProveedorId || null,
            subtotal: subtotalCompra,
            descuento_porcentaje: descuento || 0,
            total: totalCompra,
            estado: asPendiente ? "Pendiente" : "Confirmada",
            forma_pago: formaPago,
            estado_pago: estadoPago,
            monto_pagado: montoPagado,
            tipo_comprobante: tipoComprobante || null,
            numero_comprobante: numeroComprobante.trim() || null,
            observacion: observacion || null,
          })
          .select("id")
          .single();

        if (error || !data) {
          console.error("Error creating compra:", error);
          setSaveError(error?.message || "Error al crear la compra. Revisa los datos.");
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
      const { error: itemsError } = await supabase.from("compra_items").insert(rows);

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
          after: {
            numero,
            total: totalCompra,
            forma_pago: formaPago,
            items: items.length,
            estado: "Pendiente",
          },
        });
        setSaving(false);
        onSaved();
        showAdminToast("Compra guardada como pendiente", "success");
        return;
      }

      // Update stock and costs for each product using Promise.all
      await Promise.all(
        items.map(async (item) => {
          // Atomic stock update via RPC (positive = add stock from purchase)
          const { data: stockResult } = await supabase.rpc("atomic_update_stock", {
            p_producto_id: item.producto_id,
            p_change: item.cantidad,
          });

          // Log stock movement
          await supabase.from("stock_movimientos").insert({
            producto_id: item.producto_id,
            tipo: "compra",
            cantidad_antes: stockResult?.stock_antes ?? 0,
            cantidad_despues: stockResult?.stock_despues ?? 0,
            cantidad: item.cantidad,
            referencia: `Compra #${numero}`,
            descripcion: `Compra - ${item.nombre}`,
            usuario: currentUser?.nombre || "Admin Sistema",
            orden_id: compra.id,
          });

          // Update cost and price ONLY if user explicitly opted in via "Actualizar precio".
          // Si solo cambia el costo de esta compra pero no se activa actualizar, el costo del producto maestro se mantiene intacto.
          if (item.costo_unitario !== item.costo_original && item.actualizarPrecio) {
            if (item.costo_original > 0) {
              const marginRatio = item.precio_original / item.costo_original;
              const newPrecio = item.precio_nuevo_custom || roundPrice(item.costo_unitario * marginRatio);
              await supabase
                .from("productos")
                .update({
                  costo: item.costo_unitario,
                  precio: newPrecio,
                  precio_anterior: item.precio_original,
                  fecha_actualizacion: todayString(),
                })
                .eq("id", item.producto_id);

              // Also update presentation prices proportionally
              if (item.precio_original > 0) {
                const priceRatio = newPrecio / item.precio_original;
                const { data: prods } = await supabase
                  .from("presentaciones")
                  .select("id, precio, costo, cantidad")
                  .eq("producto_id", item.producto_id);
                await Promise.all(
                  (prods || []).map(async (pres: any) => {
                    const newPresPrecio = roundPrice(pres.precio * priceRatio);
                    const newPresCosto =
                      pres.costo > 0 ? Math.round(item.costo_unitario * pres.cantidad) : 0;
                    const { error: presErr } = await supabase
                      .from("presentaciones")
                      .update({ precio: newPresPrecio, costo: newPresCosto })
                      .eq("id", pres.id);
                    if (presErr) {
                      console.error("Error updating presentation:", pres.id, presErr);
                      showAdminToast(
                        `Error actualizando presentacion de ${item.nombre}: ${presErr.message}`,
                        "error"
                      );
                    }
                  })
                );
              }

              preciosActualizados.push({
                producto_id: item.producto_id,
                nombre: item.nombre,
                codigo: item.codigo,
                precioAnterior: item.precio_original,
                precioNuevo: newPrecio,
                costoAnterior: item.costo_original,
                costoNuevo: item.costo_unitario,
              });
            }
          }
        })
      );

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
          referencia_id: compra.id,
          referencia_tipo: "compra",
          ...(formaPago === "Transferencia" && confirmCuentaBancariaId
            ? { cuenta_bancaria: confirmCuentaBancariaId }
            : {}),
        });
      }

      // If cuenta corriente, update proveedor saldo + create CC entry
      if (formaPago === "Cuenta Corriente" && selectedProveedorId) {
        const prov = providers.find((p) => p.id === selectedProveedorId);
        if (prov) {
          // Atomic saldo update via RPC (positive = increase debt)
          const { data: finalSaldo } = await supabase.rpc("atomic_update_proveedor_saldo", {
            p_proveedor_id: selectedProveedorId,
            p_change: totalCompra,
          });

          // Register in cuenta_corriente_proveedor
          await supabase.from("cuenta_corriente_proveedor").insert({
            proveedor_id: selectedProveedorId,
            fecha: fecha || todayString(),
            tipo: "compra",
            descripcion: `Compra ${numero} - ${prov.nombre}`,
            monto: totalCompra,
            saldo_resultante: finalSaldo,
            referencia_id: compra.id,
            referencia_tipo: "compra",
          });
        }
      }

      // If this compra came from a pedido, mark it as Ingresado
      if (pedidoOrigenId) {
        await supabase
          .from("pedidos_proveedor")
          .update({ estado: "Ingresado" })
          .eq("id", pedidoOrigenId);
        onPedidoIngresado?.(pedidoOrigenId);
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

      if (preciosActualizados.length > 0) {
        setPreciosModificados(preciosActualizados);
        setShowPreciosDialog(true);
      } else if (ocultosAll.length === 0) {
        // Only call onSaved if no post-save dialogs to show
        onSaved();
      }

      showAdminToast(
        `Compra ${numero} confirmada. ${items.length} productos ingresados al stock.`,
        "success"
      );
    } catch (err) {
      console.error("Unexpected error:", err);
      setSaveError("Error inesperado al guardar la compra.");
      setSaving(false);
    }
  };

  /* ── Delete pending compra ── */

  const handleDeletePending = async () => {
    if (!pendingCompraId) return;
    try {
      await supabase.from("compra_items").delete().eq("compra_id", pendingCompraId);
      await supabase.from("compras").delete().eq("id", pendingCompraId);
      setPendingCompraId(null);
      onSaved();
      showAdminToast("Compra pendiente eliminada", "success");
    } catch (err: any) {
      showAdminToast("Error al eliminar: " + (err.message || "Error"), "error");
    }
  };

  /* ── Make hidden products visible ── */

  const handleMakeVisible = async (productIds: string[]) => {
    if (productIds.length === 0) return;
    await supabase.from("productos").update({ visibilidad: "visible" }).in("id", productIds);
    showAdminToast(`${productIds.length} producto(s) ahora visibles en la tienda`, "success");
    setShowVisibilidadDialog(false);
    setProductosOcultos([]);
    // If precios dialog is not open, go back
    if (!showPreciosDialog) onSaved();
  };

  /* ═══════════════════ RENDER ═══════════════════ */

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
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
            <p className="text-2xl font-bold text-primary">{formatCurrency(totalCompra)}</p>
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
                  value={
                    selectedProveedorId
                      ? providers.find((p) => p.id === selectedProveedorId)?.nombre ?? compraProvSearch
                      : compraProvSearch
                  }
                  onChange={(e) => {
                    setCompraProvSearch(e.target.value);
                    setSelectedProveedorId("");
                    setCompraProvOpen(true);
                  }}
                  onFocus={() => setCompraProvOpen(true)}
                  className="pl-9"
                />
                {selectedProveedorId && (
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setSelectedProveedorId("");
                      setCompraProvSearch("");
                    }}
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                {compraProvOpen && !selectedProveedorId && (
                  <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
                    {providers
                      .filter((p) =>
                        p.nombre.toLowerCase().includes(compraProvSearch.toLowerCase())
                      )
                      .map((p) => (
                        <button
                          key={p.id}
                          className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors"
                          onClick={() => {
                            setSelectedProveedorId(p.id);
                            setCompraProvSearch("");
                            setCompraProvOpen(false);
                          }}
                        >
                          {p.nombre}
                        </button>
                      ))}
                    {providers.filter((p) =>
                      p.nombre.toLowerCase().includes(compraProvSearch.toLowerCase())
                    ).length === 0 && (
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
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
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

          {/* Tipo comprobante + Numero comprobante + Descuento row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5" />
                Tipo de comprobante
              </Label>
              <Select
                value={tipoComprobante}
                onValueChange={(v) => setTipoComprobante(v ?? "Factura A")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar tipo" />
                </SelectTrigger>
                <SelectContent>
                  {["Factura A", "Factura B", "Factura C", "Remito", "Sin comprobante"].map(
                    (t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5" />
                N de comprobante
                <span className="text-[10px] opacity-60">(opcional)</span>
              </Label>
              <Input
                value={numeroComprobante}
                onChange={(e) => setNumeroComprobante(e.target.value)}
                placeholder="Ej: 0001-00012345"
              />
            </div>
            {/* Descuento global in card */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5" />
                Descuento global
              </Label>
              <div className="relative">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={descuento || ""}
                  onChange={(e) =>
                    setDescuento(Math.min(100, Math.max(0, Number(e.target.value) || 0)))
                  }
                  placeholder="0"
                  className="pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  %
                </span>
              </div>
            </div>
          </div>

          {/* Observaciones row */}
          <div className="mt-4 space-y-2">
            <Label className="text-xs text-muted-foreground">Observaciones</Label>
            <Input
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              placeholder="Notas adicionales..."
            />
          </div>
        </CardContent>
      </Card>

      {/* Add product button + Redondeo always visible */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setProductSearchOpen(true);
              searchProducts("");
              setSearchHighlight(0);
            }}
            className="gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Agregar producto{" "}
            <kbd className="ml-1 border rounded px-1 py-0.5 text-[10px] bg-background">F1</kbd>
          </Button>
          <Button
            variant="outline"
            onClick={() => window.open("/admin/productos?crear=true", "_blank")}
            className="gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Crear producto nuevo
          </Button>
        </div>

        {/* Redondeo always visible */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Redondear PVP:</span>
          {([0, 10, 50, 100] as const).map((v) => (
            <button
              key={v}
              onClick={() => setRedondeo(v)}
              className={`px-2 py-1 rounded-md text-xs font-medium border transition-all ${
                redondeo === v
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              {v === 0 ? "No" : `$${v}`}
            </button>
          ))}
        </div>
      </div>

      {/* Product search dialog */}
      <Dialog open={productSearchOpen} onOpenChange={setProductSearchOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Agregar producto a la compra</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              ref={productSearchRef}
              placeholder="Buscar por nombre o codigo..."
              value={productSearch}
              onChange={(e) => {
                handleProductSearch(e.target.value);
                setSearchHighlight(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setSearchHighlight((h) => {
                    const next = Math.min(h + 1, productResults.length - 1);
                    document
                      .querySelector(`[data-search-idx="${next}"]`)
                      ?.scrollIntoView({ block: "nearest" });
                    return next;
                  });
                  setSearchPresIdx(-1);
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setSearchHighlight((h) => {
                    const next = Math.max(h - 1, 0);
                    document
                      .querySelector(`[data-search-idx="${next}"]`)
                      ?.scrollIntoView({ block: "nearest" });
                    return next;
                  });
                  setSearchPresIdx(-1);
                } else if (e.key === "ArrowRight") {
                  e.preventDefault();
                  const p = productResults[searchHighlight];
                  if (p) {
                    const boxPres = (searchPresentaciones[p.id] || []).find(
                      (pr) => pr.cantidad > 1
                    );
                    if (boxPres) setSearchPresIdx((h) => Math.min(h + 1, 0));
                  }
                } else if (e.key === "ArrowLeft") {
                  e.preventDefault();
                  setSearchPresIdx((h) => Math.max(h - 1, -1));
                } else if (e.key === "Enter" && productResults[searchHighlight]) {
                  e.preventDefault();
                  const p = productResults[searchHighlight];
                  const boxPres = (searchPresentaciones[p.id] || []).find(
                    (pr) => pr.cantidad > 1
                  );
                  if (searchPresIdx >= 0 && boxPres) {
                    addProduct(
                      p,
                      boxPres.cantidad,
                      boxPres.costo > 0 ? Math.round(boxPres.costo / boxPres.cantidad) : p.costo
                    );
                  } else {
                    addProduct(p);
                  }
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
                  className={`rounded-xl border p-3 transition-colors ${
                    alreadyAdded
                      ? "opacity-40 bg-muted"
                      : isHighlighted
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "hover:border-primary/30 hover:bg-primary/5"
                  }`}
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
                        <span>
                          Stock:{" "}
                          <strong className={p.stock <= 0 ? "text-red-500" : ""}>{p.stock}</strong>
                        </span>
                        <span>·</span>
                        <span>Costo: {formatCurrency(p.costo)}</span>
                      </div>
                    </div>
                    {alreadyAdded && (
                      <Badge variant="secondary" className="text-[10px] flex-shrink-0">
                        Ya agregado
                      </Badge>
                    )}
                  </div>
                  {!alreadyAdded && (
                    <div className="flex gap-2 mt-2.5 pl-14">
                      <Button
                        size="sm"
                        variant={isHighlighted && searchPresIdx === -1 ? "default" : "outline"}
                        className={`h-8 text-xs flex-1 ${
                          isHighlighted && searchPresIdx === -1 ? "ring-2 ring-primary" : ""
                        }`}
                        onClick={() => addProduct(p)}
                      >
                        + Unidad
                      </Button>
                      {boxPres && (
                        <Button
                          size="sm"
                          className={`h-8 text-xs flex-1 ${
                            isHighlighted && searchPresIdx === 0 ? "ring-2 ring-primary" : ""
                          }`}
                          onClick={() =>
                            addProduct(
                              p,
                              boxPres.cantidad,
                              boxPres.costo > 0
                                ? Math.round(boxPres.costo / boxPres.cantidad)
                                : p.costo
                            )
                          }
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
              <p className="text-center py-4 text-sm text-muted-foreground">
                Sin resultados para &quot;{productSearch}&quot;
              </p>
            )}
            {/* Create product */}
            <button
              onClick={() => window.open("/admin/productos?crear=true", "_blank")}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-muted-foreground/20 text-sm text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors mt-2"
            >
              <Plus className="w-4 h-4" /> Crear producto nuevo
            </button>
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
                Presiona{" "}
                <kbd className="border rounded px-1 py-0.5 text-[10px] bg-muted">F1</kbd> o el
                boton Agregar para agregar productos
              </p>
            </div>
          ) : (
            <>
              {/* ── Mobile items cards ── */}
              <div className="sm:hidden divide-y">
                {items.map((item, idx) => {
                  const costoChanged = item.costo_unitario !== item.costo_original;
                  return (
                    <div key={item.producto_id} data-compra-item className="py-3 px-4 space-y-2">
                      {/* Product header */}
                      <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded bg-muted flex items-center justify-center overflow-hidden shrink-0">
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
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{item.nombre}</p>
                          <p className="text-xs text-muted-foreground font-mono">{item.codigo}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-red-500 shrink-0"
                          onClick={() => removeItem(idx)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      {/* Inputs row */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {item.unidades_por_caja > 0 && (
                          <div>
                            <label className="text-muted-foreground mb-1 block">Cajas</label>
                            <Input
                              type="number"
                              min={0}
                              value={item.cajas}
                              onChange={(e) => {
                                const newCajas = Math.max(0, Number(e.target.value));
                                const newTotal = newCajas * item.unidades_por_caja + item.sueltas;
                                setItems((prev) =>
                                  prev.map((it, i) =>
                                    i === idx
                                      ? {
                                          ...it,
                                          cajas: newCajas,
                                          cantidad: newTotal,
                                          subtotal: calcSubtotal(
                                            it.costo_unitario,
                                            newTotal,
                                            it.descuento
                                          ),
                                        }
                                      : it
                                  )
                                );
                              }}
                              className="h-8 text-center"
                            />
                          </div>
                        )}
                        <div>
                          <label className="text-muted-foreground mb-1 block">
                            {item.unidades_por_caja > 0 ? "Sueltas" : "Cantidad"}
                          </label>
                          <Input
                            type="number"
                            min={0}
                            value={item.unidades_por_caja > 0 ? item.sueltas : item.cantidad}
                            onChange={(e) => {
                              const val = Math.max(0, Number(e.target.value));
                              if (item.unidades_por_caja > 0) {
                                const newTotal = item.cajas * item.unidades_por_caja + val;
                                setItems((prev) =>
                                  prev.map((it, i) =>
                                    i === idx
                                      ? {
                                          ...it,
                                          sueltas: val,
                                          cantidad: newTotal,
                                          subtotal: calcSubtotal(
                                            it.costo_unitario,
                                            newTotal,
                                            it.descuento
                                          ),
                                        }
                                      : it
                                  )
                                );
                              } else {
                                setItems((prev) =>
                                  prev.map((it, i) =>
                                    i === idx
                                      ? {
                                          ...it,
                                          cantidad: Math.max(1, val),
                                          sueltas: val,
                                          subtotal: calcSubtotal(
                                            it.costo_unitario,
                                            Math.max(1, val),
                                            it.descuento
                                          ),
                                        }
                                      : it
                                  )
                                );
                              }
                            }}
                            className="h-8 text-center"
                          />
                        </div>
                        <div>
                          <label className="text-muted-foreground mb-1 block">Costo unit.</label>
                          <MoneyInput
                            min={0}
                            value={item.costo_unitario}
                            onValueChange={(val) => updateItemField(idx, "costo_unitario", val)}
                            className="h-8 text-right"
                          />
                        </div>
                        <div>
                          <label className="text-muted-foreground mb-1 block">Dto%</label>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={item.descuento || ""}
                            placeholder="0"
                            onChange={(e) =>
                              updateItemField(
                                idx,
                                "descuento",
                                Math.min(100, Math.max(0, Number(e.target.value) || 0))
                              )
                            }
                            className="h-8 text-center"
                          />
                        </div>
                      </div>
                      {/* Summary row */}
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          Total:{" "}
                          <span className="font-semibold text-foreground">{item.cantidad} un.</span>
                        </span>
                        <span>
                          Subtotal:{" "}
                          <span className="font-semibold text-foreground">
                            {formatCurrency(item.subtotal)}
                          </span>
                        </span>
                      </div>
                      {/* PVP inline expandible (mobile) */}
                      {costoChanged && item.costo_original > 0 && (
                        <div className="mt-1.5">
                          <button
                            onClick={() =>
                              setPvpExpandedIdx(pvpExpandedIdx === idx ? null : idx)
                            }
                            className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-md font-medium transition-colors ${
                              item.actualizarPrecio
                                ? "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"
                                : "bg-muted text-muted-foreground border border-border hover:bg-muted/80"
                            }`}
                          >
                            {item.actualizarPrecio ? (
                              <>
                                PVP {formatCurrency(item.precio_original)} →{" "}
                                {formatCurrency(getNuevoPrecio(item))}{" "}
                                <span className="opacity-60">▾</span>
                              </>
                            ) : (
                              <>
                                PVP sin cambio <span className="opacity-60">▾</span>
                              </>
                            )}
                          </button>
                          {pvpExpandedIdx === idx && (
                            <PvpExpandedPanel
                              item={item}
                              idx={idx}
                              getNuevoPrecio={getNuevoPrecio}
                              getMargenCustom={getMargenCustom}
                              roundPrice={roundPrice}
                              formatCurrency={formatCurrency}
                              setItems={setItems}
                              setPvpExpandedIdx={setPvpExpandedIdx}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* ── Desktop items table ── */}
              <div className="hidden sm:block overflow-x-auto">
                <table ref={itemsTableRef} className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-3 px-2 font-medium w-10"></th>
                      <th className="text-left py-3 px-2 font-medium">Codigo</th>
                      <th className="text-left py-3 px-2 font-medium">Producto</th>
                      <th className="text-center py-3 px-2 font-medium">Stock</th>
                      <th className="text-center py-3 px-2 font-medium">Cajas</th>
                      <th className="text-center py-3 px-2 font-medium">Sueltas</th>
                      <th className="text-center py-3 px-2 font-medium">Total un.</th>
                      <th className="text-right py-3 px-2 font-medium">Costo Unit.</th>
                      <th className="text-right py-3 px-2 font-medium">Costo Caja</th>
                      <th className="text-center py-3 px-2 font-medium">Dto%</th>
                      <th className="text-right py-3 px-2 font-medium">Subtotal</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => {
                      const costoChanged = item.costo_unitario !== item.costo_original;
                      const isSelected = selectedItemIdx === idx;
                      return (
                        <tr
                          key={item.producto_id}
                          data-compra-item
                          className={`border-b last:border-0 transition-colors cursor-pointer ${
                            isSelected
                              ? "bg-primary/10 ring-1 ring-primary/30"
                              : "hover:bg-muted/50"
                          }`}
                          onClick={() => setSelectedItemIdx(idx)}
                        >
                          <td className="py-2.5 px-2">
                            <div className="w-9 h-9 rounded bg-muted flex items-center justify-center overflow-hidden">
                              {item.imagen_url ? (
                                <img
                                  src={item.imagen_url}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <ImageIcon className="w-4 h-4 text-muted-foreground/40" />
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-2 font-mono text-xs text-muted-foreground">
                            {item.codigo}
                          </td>
                          <td className="py-2.5 px-2">
                            <div className="font-medium">{item.nombre}</div>
                            {/* PVP inline expandible badge */}
                            {costoChanged && item.costo_original > 0 && (
                              <div className="mt-1.5">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPvpExpandedIdx(pvpExpandedIdx === idx ? null : idx);
                                  }}
                                  className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-md font-medium transition-colors ${
                                    item.actualizarPrecio
                                      ? "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"
                                      : "bg-muted text-muted-foreground border border-border hover:bg-muted/80"
                                  }`}
                                >
                                  {item.actualizarPrecio ? (
                                    <>
                                      PVP {formatCurrency(item.precio_original)} →{" "}
                                      {formatCurrency(getNuevoPrecio(item))}{" "}
                                      <span className="opacity-60">▾</span>
                                    </>
                                  ) : (
                                    <>
                                      PVP sin cambio <span className="opacity-60">▾</span>
                                    </>
                                  )}
                                </button>
                                {pvpExpandedIdx === idx && (
                                  <PvpExpandedPanel
                                    item={item}
                                    idx={idx}
                                    getNuevoPrecio={getNuevoPrecio}
                                    getMargenCustom={getMargenCustom}
                                    roundPrice={roundPrice}
                                    formatCurrency={formatCurrency}
                                    setItems={setItems}
                                    setPvpExpandedIdx={setPvpExpandedIdx}
                                  />
                                )}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            <Badge
                              variant={item.stock_actual <= 0 ? "destructive" : "secondary"}
                              className="text-xs font-normal"
                            >
                              {item.stock_actual}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            {item.unidades_por_caja > 0 ? (
                              <Input
                                type="number"
                                min={0}
                                value={item.cajas}
                                onChange={(e) => {
                                  const newCajas = Math.max(0, Number(e.target.value));
                                  const newTotal =
                                    newCajas * item.unidades_por_caja + item.sueltas;
                                  setItems((prev) =>
                                    prev.map((it, i) =>
                                      i === idx
                                        ? {
                                            ...it,
                                            cajas: newCajas,
                                            cantidad: newTotal,
                                            subtotal: calcSubtotal(
                                              it.costo_unitario,
                                              newTotal,
                                              it.descuento
                                            ),
                                          }
                                        : it
                                    )
                                  );
                                }}
                                className="w-16 mx-auto text-center h-9"
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            <Input
                              type="number"
                              min={0}
                              value={
                                item.unidades_por_caja > 0 ? item.sueltas : item.cantidad
                              }
                              onChange={(e) => {
                                const val = Math.max(0, Number(e.target.value));
                                if (item.unidades_por_caja > 0) {
                                  const newTotal =
                                    item.cajas * item.unidades_por_caja + val;
                                  setItems((prev) =>
                                    prev.map((it, i) =>
                                      i === idx
                                        ? {
                                            ...it,
                                            sueltas: val,
                                            cantidad: newTotal,
                                            subtotal: calcSubtotal(
                                              it.costo_unitario,
                                              newTotal,
                                              it.descuento
                                            ),
                                          }
                                        : it
                                    )
                                  );
                                } else {
                                  setItems((prev) =>
                                    prev.map((it, i) =>
                                      i === idx
                                        ? {
                                            ...it,
                                            cantidad: Math.max(1, val),
                                            sueltas: val,
                                            subtotal: calcSubtotal(
                                              it.costo_unitario,
                                              Math.max(1, val),
                                              it.descuento
                                            ),
                                          }
                                        : it
                                    )
                                  );
                                }
                              }}
                              className="w-16 mx-auto text-center h-9"
                            />
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            <span className="text-sm font-semibold">{item.cantidad}</span>
                            {item.unidades_por_caja > 0 && (
                              <span className="text-[10px] text-muted-foreground block">
                                {item.cajas}×{item.unidades_por_caja}+{item.sueltas}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-right">
                            <MoneyInput
                              min={0}
                              value={item.costo_unitario}
                              onValueChange={(val) =>
                                updateItemField(idx, "costo_unitario", val)
                              }
                              className="w-24 ml-auto text-right h-9"
                            />
                          </td>
                          <td className="py-2.5 px-2 text-right">
                            {item.unidades_por_caja > 0 ? (
                              <span className="text-sm font-medium text-muted-foreground">
                                {formatCurrency(item.costo_unitario * item.unidades_por_caja)}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              value={item.descuento || ""}
                              onChange={(e) =>
                                updateItemField(
                                  idx,
                                  "descuento",
                                  Math.min(100, Math.max(0, Number(e.target.value) || 0))
                                )
                              }
                              placeholder="0"
                              className="w-14 mx-auto text-center h-9"
                            />
                          </td>
                          <td className="py-2.5 px-2 text-right font-semibold">
                            {formatCurrency(item.subtotal)}
                          </td>
                          <td className="py-2.5 px-2">
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
                        {items.length} producto(s) | {totalUnidades} unidad(es)
                      </span>
                      {items.length > 0 && (
                        <span className="hidden sm:inline text-muted-foreground/60">
                          <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">↑↓</kbd>{" "}
                          navegar
                          <kbd className="ml-1.5 px-1 py-0.5 bg-muted rounded text-[10px]">
                            ←→
                          </kbd>{" "}
                          cantidad
                          <kbd className="ml-1.5 px-1 py-0.5 bg-muted rounded text-[10px]">
                            Del
                          </kbd>{" "}
                          eliminar
                        </span>
                      )}
                      {items.filter((i) => i.costo_unitario !== i.costo_original).length > 0 && (
                        <span className="text-amber-600 dark:text-amber-400">
                          {items.filter((i) => i.costo_unitario !== i.costo_original).length} con
                          costo modificado
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {descuento > 0 && (
                        <div className="text-right text-xs text-muted-foreground">
                          <span className="line-through">{formatCurrency(subtotalCompra)}</span>
                          <span className="ml-1 text-red-500">-{descuento}%</span>
                        </div>
                      )}
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
            {pendingCompraId && (
              <Button
                variant="outline"
                className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
                onClick={handleDeletePending}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Eliminar
              </Button>
            )}
            <Button variant="outline" onClick={onBack}>
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

      {/* ═══════════════════ CONFIRMATION DIALOG ═══════════════════ */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg">Confirmar Compra</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            {/* Quick summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/50 p-3">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                  Proveedor
                </span>
                <p className="font-medium text-sm mt-0.5">
                  {providers.find((p) => p.id === selectedProveedorId)?.nombre || "Sin proveedor"}
                </p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                  Productos
                </span>
                <p className="font-medium text-sm mt-0.5">
                  {items.length} items · {totalUnidades} unidades
                </p>
              </div>
            </div>

            {/* Price changes that WILL happen (compact) */}
            {itemsWillUpdatePvp.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                <p className="text-xs font-semibold text-amber-900">
                  Precios que se actualizaran ({itemsWillUpdatePvp.length})
                </p>
                <div className="max-h-32 overflow-y-auto space-y-1.5">
                  {itemsWillUpdatePvp.map((item) => {
                    const nuevoPrecio = getNuevoPrecio(item);
                    const margen = getMargenCustom(item);
                    return (
                      <div
                        key={item.producto_id}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="truncate flex-1 mr-2 text-amber-800">{item.nombre}</span>
                        <span className="flex items-center gap-1.5 flex-shrink-0 text-amber-700">
                          <span className="line-through opacity-60">
                            {formatCurrency(item.precio_original)}
                          </span>
                          <span>→</span>
                          <span className="font-semibold">{formatCurrency(nuevoPrecio)}</span>
                          <span className="text-[10px] opacity-70">({margen}%)</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
                {itemsWithPriceChange.length > itemsWillUpdatePvp.length && (
                  <p className="text-[10px] text-amber-600">
                    {itemsWithPriceChange.length - itemsWillUpdatePvp.length} producto(s)
                    mantendran su precio actual
                  </p>
                )}
              </div>
            )}

            {/* Total */}
            <div className="space-y-1 px-1">
              {descuento > 0 && (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Subtotal</span>
                    <span className="text-sm tabular-nums">{formatCurrency(subtotalCompra)}</span>
                  </div>
                  <div className="flex justify-between items-center text-red-500">
                    <span className="text-sm">Descuento ({descuento}%)</span>
                    <span className="text-sm tabular-nums">
                      -{formatCurrency(subtotalCompra - totalCompra)}
                    </span>
                  </div>
                </>
              )}
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold">Total compra</span>
                <span className="text-xl font-bold">{formatCurrency(totalCompra)}</span>
              </div>
            </div>

            {/* Payment section */}
            <div className="space-y-3 border-t pt-4">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Forma de pago
              </span>
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
                  <Select
                    value={confirmCuentaBancariaId || ""}
                    onValueChange={(v) => setConfirmCuentaBancariaId(v || "")}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Seleccionar cuenta" />
                    </SelectTrigger>
                    <SelectContent>
                      {cuentasBancarias.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nombre} {c.alias ? `(${c.alias})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {(formaPago === "Efectivo" || formaPago === "Transferencia") && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={registrarEnCaja}
                    onChange={(e) => setRegistrarEnCaja(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm">Registrar movimiento en caja diaria</span>
                </label>
              )}

              {formaPago === "Cuenta Corriente" && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2.5 border border-amber-200">
                  Se cargara {formatCurrency(totalCompra)} al saldo del proveedor como deuda
                  pendiente
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
                Cancelar
              </Button>
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

      {/* ═══════════════════ POST-SAVE DIALOGS ═══════════════════ */}

      {/* Precios modificados dialog */}
      <Dialog
        open={showPreciosDialog}
        onOpenChange={(open) => {
          setShowPreciosDialog(open);
          if (!open && !showVisibilidadDialog) onSaved();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Precios actualizados
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Se actualizaron los precios de {preciosModificados.length} producto(s):
            </p>
            <div className="max-h-60 overflow-y-auto space-y-2">
              {preciosModificados.map((pm) => {
                const margen =
                  pm.costoNuevo > 0
                    ? Math.round(((pm.precioNuevo - pm.costoNuevo) / pm.costoNuevo) * 100)
                    : 0;
                return (
                  <div
                    key={pm.producto_id || pm.codigo}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex-1 min-w-0 mr-3">
                      <p className="font-medium text-sm truncate">{pm.nombre}</p>
                      <p className="text-xs text-muted-foreground font-mono">{pm.codigo}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="flex items-center gap-1.5 text-sm">
                        <span className="text-muted-foreground line-through">
                          {formatCurrency(pm.precioAnterior)}
                        </span>
                        <span>→</span>
                        <span className="font-bold text-primary">
                          {formatCurrency(pm.precioNuevo)}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">Margen: {margen}%</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between items-center pt-2 border-t">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  const productIds = preciosModificados
                    .map((p) => p.producto_id)
                    .filter(Boolean);
                  if (productIds.length > 0) {
                    window.open(
                      `/admin/productos/lista-precios?ids=${productIds.join(",")}`,
                      "_blank"
                    );
                  }
                }}
              >
                <Printer className="w-3.5 h-3.5" />
                Imprimir carteles
              </Button>
              <Button
                onClick={() => {
                  setShowPreciosDialog(false);
                  if (!showVisibilidadDialog) onSaved();
                }}
              >
                Entendido
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Hidden products visibility dialog */}
      <Dialog
        open={showVisibilidadDialog}
        onOpenChange={(open) => {
          setShowVisibilidadDialog(open);
          if (!open && !showPreciosDialog) onSaved();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-amber-500" />
              Productos ocultos con stock
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Los siguientes productos estan ocultos en la tienda pero ahora tienen stock. ¿Hacerlos
              visibles?
            </p>
            <div className="space-y-2">
              {productosOcultos.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <span className="text-sm font-medium">{p.nombre}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => handleMakeVisible([p.id])}
                  >
                    <Eye className="w-3 h-3 mr-1" />
                    Hacer visible
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex justify-between pt-2 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setShowVisibilidadDialog(false);
                  if (!showPreciosDialog) onSaved();
                }}
              >
                Ignorar
              </Button>
              <Button
                onClick={() => handleMakeVisible(productosOcultos.map((p) => p.id))}
              >
                Hacer todos visibles
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ═══════════════════ PVP EXPANDED PANEL ═══════════════════ */

function PvpExpandedPanel({
  item,
  idx,
  getNuevoPrecio,
  getMargenCustom,
  roundPrice,
  formatCurrency: fmtCurrency,
  setItems,
  setPvpExpandedIdx,
}: {
  item: CompraItem;
  idx: number;
  getNuevoPrecio: (item: CompraItem) => number;
  getMargenCustom: (item: CompraItem) => number;
  roundPrice: (price: number) => number;
  formatCurrency: (v: number, short?: boolean) => string;
  setItems: React.Dispatch<React.SetStateAction<CompraItem[]>>;
  setPvpExpandedIdx: React.Dispatch<React.SetStateAction<number | null>>;
}) {
  const nuevoPrecio = getNuevoPrecio(item);
  const margenActual = getMargenCustom(item);

  // Local state for custom PVP editing
  const [customPvp, setCustomPvp] = useState(item.precio_nuevo_custom || nuevoPrecio);
  const [customMargen, setCustomMargen] = useState(margenActual);

  // Sync custom margin when PVP changes
  const updatePvp = (price: number) => {
    setCustomPvp(price);
    if (item.costo_unitario > 0) {
      setCustomMargen(
        Math.round(((price - item.costo_unitario) / item.costo_unitario) * 1000) / 10
      );
    }
  };

  // Sync custom PVP when margin changes
  const updateMargen = (margin: number) => {
    setCustomMargen(margin);
    const price = roundPrice(item.costo_unitario * (1 + margin / 100));
    setCustomPvp(price);
  };

  const costoDiff = item.costo_unitario - item.costo_original;
  const costoPct =
    item.costo_original > 0
      ? Math.round((costoDiff / item.costo_original) * 100)
      : 0;

  const proporcionalPrice =
    item.costo_original > 0
      ? roundPrice(item.costo_unitario * (item.precio_original / item.costo_original))
      : item.precio_original;

  return (
    <div
      className="mt-1.5 p-2.5 rounded-lg bg-amber-50 border border-amber-200 space-y-2"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Cost change info */}
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-amber-700">
          Costo: <span className="line-through opacity-60">{fmtCurrency(item.costo_original)}</span>{" "}
          → <span className="font-semibold">{fmtCurrency(item.costo_unitario)}</span>
        </span>
        <span
          className={`font-semibold px-1.5 py-0.5 rounded ${
            costoDiff > 0 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
          }`}
        >
          {costoDiff > 0 ? "+" : ""}
          {costoPct}%
        </span>
      </div>

      {/* Nuevo PVP input */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <label className="text-[10px] text-amber-700 mb-0.5 block">Nuevo PVP</label>
          <MoneyInput
            value={customPvp}
            onValueChange={updatePvp}
            className="h-8 text-sm font-semibold"
          />
        </div>
        <div className="w-20">
          <label className="text-[10px] text-amber-700 mb-0.5 block">Margen %</label>
          <Input
            type="number"
            step="0.1"
            value={customMargen}
            onChange={(e) => updateMargen(Number(e.target.value) || 0)}
            className="h-8 text-sm text-center"
          />
        </div>
      </div>

      {/* Links */}
      <div className="flex items-center justify-between gap-2 text-[10px]">
        {customPvp !== proporcionalPrice && (
          <button
            onClick={() => {
              updatePvp(proporcionalPrice);
            }}
            className="text-primary hover:underline"
          >
            Usar proporcional: {fmtCurrency(proporcionalPrice)}
          </button>
        )}
        <button
          onClick={() => {
            setItems((prev) =>
              prev.map((it, i) =>
                i === idx ? { ...it, actualizarPrecio: false, precio_nuevo_custom: undefined } : it
              )
            );
            setPvpExpandedIdx(null);
          }}
          className="text-muted-foreground hover:underline ml-auto"
        >
          Mantener actual ({fmtCurrency(item.precio_original)})
        </button>
      </div>

      {/* Confirm button */}
      <Button
        size="sm"
        className="w-full h-7 text-xs"
        onClick={() => {
          setItems((prev) =>
            prev.map((it, i) =>
              i === idx
                ? {
                    ...it,
                    actualizarPrecio: true,
                    precio_nuevo_custom: customPvp !== proporcionalPrice ? customPvp : undefined,
                  }
                : it
            )
          );
          setPvpExpandedIdx(null);
        }}
      >
        Actualizar a {fmtCurrency(customPvp)}
      </Button>
    </div>
  );
}
