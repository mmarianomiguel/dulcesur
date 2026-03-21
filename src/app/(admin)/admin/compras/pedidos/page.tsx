"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { todayARG } from "@/lib/formatters";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Plus,
  Search,
  Eye,
  DollarSign,
  Loader2,
  ClipboardList,
  Sparkles,
  Trash2,
  Save,
  Send,
  Package,
  ArrowLeft,
  X,
  Edit,
  Check,
  Calendar,
  AlertTriangle,
  Clock,
  CheckCircle2,
  TruckIcon,
  FileText,
} from "lucide-react";

/* ───────── types ───────── */

interface Proveedor {
  id: string;
  nombre: string;
  saldo?: number;
}

interface Categoria {
  id: string;
  nombre: string;
}

interface PedidoRow {
  id: string;
  proveedor_id: string | null;
  fecha: string;
  estado: string;
  costo_total_estimado: number;
  observacion: string | null;
  proveedores: { nombre: string } | null;
}

function pedidoDisplayNum(id: string): string {
  return "PED-" + id.slice(0, 6).toUpperCase();
}

interface PedidoItemRow {
  id: string;
  pedido_id: string;
  producto_id: string;
  codigo: string;
  descripcion: string;
  cantidad: number;
  faltante: number;
  cantidad_recibida: number;
  precio_unitario: number;
  subtotal: number;
}

interface SuggestedItem {
  producto_id: string;
  codigo: string;
  nombre: string;
  stock: number;
  stock_minimo: number;
  stock_maximo: number;
  faltante: number;
  precio_unitario: number;
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

function estadoConfig(estado: string) {
  switch (estado) {
    case "Borrador":
      return { color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300", icon: FileText };
    case "Enviado":
      return { color: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300", icon: TruckIcon };
    case "Recibido":
      return { color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300", icon: CheckCircle2 };
    case "Recibido Parcial":
      return { color: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300", icon: Clock };
    default:
      return { color: "bg-gray-100 text-gray-700", icon: FileText };
  }
}

/* ───────── component ───────── */

export default function PedidosProveedorPage() {
  // List state
  const [pedidos, setPedidos] = useState<PedidoRow[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterEstado, setFilterEstado] = useState("all");
  const [pedFilterMode, setPedFilterMode] = useState<"day" | "month" | "range" | "all">("month");
  const [pedFilterDay, setPedFilterDay] = useState(todayARG());
  const [pedFilterMonth, setPedFilterMonth] = useState(String(new Date().getMonth() + 1));
  const [pedFilterYear, setPedFilterYear] = useState(String(new Date().getFullYear()));
  const [pedFilterFrom, setPedFilterFrom] = useState(todayARG());
  const [pedFilterTo, setPedFilterTo] = useState(todayARG());

  // New / edit pedido state
  const [mode, setMode] = useState<"list" | "new" | "detail" | "generate" | "edit">("list");
  const [selectedProveedorId, setSelectedProveedorId] = useState("");
  const [selectedCategoriaId, setSelectedCategoriaId] = useState("all");

  // Searchable dropdown states
  const [provSearch, setProvSearch] = useState("");
  const [provOpen, setProvOpen] = useState(false);
  const [catSearch, setCatSearch] = useState("");
  const [catOpen, setCatOpen] = useState(false);
  const provRef = useRef<HTMLDivElement>(null);
  const catRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<SuggestedItem[]>([]);
  const [observacion, setObservacion] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  // Detail / edit existing
  const [detailPedido, setDetailPedido] = useState<PedidoRow | null>(null);
  const [detailItems, setDetailItems] = useState<PedidoItemRow[]>([]);
  const [editingDetail, setEditingDetail] = useState(false);

  // Auto-generate state
  const [generating, setGenerating] = useState(false);
  const [generatedGroups, setGeneratedGroups] = useState<{
    proveedor_id: string;
    proveedor_nombre: string;
    items: SuggestedItem[];
    total: number;
    selected: boolean;
  }[]>([]);

  // Receive dialog state
  const [showReceiveDialog, setShowReceiveDialog] = useState(false);
  const [receiveSaving, setReceiveSaving] = useState(false);
  const [receiveError, setReceiveError] = useState("");
  const [receiveFormaPago, setReceiveFormaPago] = useState("Transferencia");
  const [receiveRegistrarCaja, setReceiveRegistrarCaja] = useState(true);
  const [receiveActualizarPrecios, setReceiveActualizarPrecios] = useState(true);
  const [receiveItems, setReceiveItems] = useState<{ id: string; cantidad_pedida: number; cantidad_recibida_prev: number; cantidad_recibir: number; descripcion: string; codigo: string; precio_unitario: number }[]>([]);

  // Delete state
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; pedido: PedidoRow | null }>({ open: false, pedido: null });
  const [deleting, setDeleting] = useState(false);

  /* ── fetch list ── */

  const fetchData = useCallback(async () => {
    setLoading(true);
    let pedQuery = supabase
      .from("pedidos_proveedor")
      .select("*, proveedores(nombre)")
      .order("fecha", { ascending: false });

    if (pedFilterMode === "day") {
      pedQuery = pedQuery.eq("fecha", pedFilterDay);
    } else if (pedFilterMode === "month") {
      const m = pedFilterMonth.padStart(2, "0");
      const start = `${pedFilterYear}-${m}-01`;
      const nextMonth = Number(pedFilterMonth) === 12 ? 1 : Number(pedFilterMonth) + 1;
      const nextYear = Number(pedFilterMonth) === 12 ? Number(pedFilterYear) + 1 : Number(pedFilterYear);
      const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
      pedQuery = pedQuery.gte("fecha", start).lt("fecha", end);
    } else if (pedFilterMode === "range" && pedFilterFrom && pedFilterTo) {
      pedQuery = pedQuery.gte("fecha", pedFilterFrom).lte("fecha", pedFilterTo);
    }

    const [{ data: ped }, { data: prov }, { data: cats }] = await Promise.all([
      pedQuery,
      supabase.from("proveedores").select("id, nombre, saldo").eq("activo", true).order("nombre"),
      supabase.from("categorias").select("id, nombre").order("nombre"),
    ]);
    setPedidos((ped as PedidoRow[]) || []);
    setProveedores((prov as Proveedor[]) || []);
    setCategorias((cats as Categoria[]) || []);
    setLoading(false);
  }, [pedFilterMode, pedFilterDay, pedFilterMonth, pedFilterYear, pedFilterFrom, pedFilterTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Click outside handler
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (provRef.current && !provRef.current.contains(e.target as Node)) setProvOpen(false);
      if (catRef.current && !catRef.current.contains(e.target as Node)) setCatOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /* ── suggest faltantes ── */

  const handleSugerirFaltantes = async () => {
    if (!selectedProveedorId) return;
    setSuggesting(true);

    let query = supabase
      .from("productos")
      .select("id, codigo, nombre, stock, stock_minimo, stock_maximo, costo, categoria_id, producto_proveedores!inner(proveedor_id, precio_proveedor, cantidad_minima_pedido)")
      .eq("activo", true)
      .eq("producto_proveedores.proveedor_id", selectedProveedorId);

    if (selectedCategoriaId !== "all") {
      query = query.eq("categoria_id", selectedCategoriaId);
    }

    const { data } = await query;

    if (data) {
      const suggested: SuggestedItem[] = (data as any[])
        .filter((p) => (p.stock ?? 0) < (p.stock_minimo ?? 0) || (p.stock ?? 0) < 0)
        .map((p) => {
          const pp = (p.producto_proveedores || [])[0];
          const stock = p.stock ?? 0;
          const maximo = p.stock_maximo ?? 0;
          const minimo = p.stock_minimo ?? 0;
          let faltante: number;
          if (maximo > 0) {
            faltante = Math.max(pp?.cantidad_minima_pedido || 1, maximo - stock);
          } else if (stock < 0) {
            faltante = Math.abs(stock);
          } else {
            faltante = Math.max(pp?.cantidad_minima_pedido || 1, minimo > 0 ? minimo * 2 - stock : 1);
          }
          const precio = pp?.precio_proveedor || p.costo || 0;
          return {
            producto_id: p.id,
            codigo: p.codigo || "",
            nombre: p.nombre,
            stock: p.stock || 0,
            stock_minimo: p.stock_minimo || 0,
            stock_maximo: p.stock_maximo || 0,
            faltante,
            precio_unitario: precio,
            subtotal: faltante * precio,
          };
        });

      const existingIds = new Set(items.map((i) => i.producto_id));
      const merged = [...items, ...suggested.filter((s) => !existingIds.has(s.producto_id))];
      setItems(merged);
    }
    setSuggesting(false);
  };

  /* ── item editing ── */

  const updateItemField = (index: number, field: "faltante" | "precio_unitario", value: number) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      updated[index].subtotal = updated[index].faltante * updated[index].precio_unitario;
      return updated;
    });
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const totalEstimado = items.reduce((a, i) => a + i.subtotal, 0);

  /* ── save pedido (new or edit) ── */

  const savePedido = async (estado: "Borrador" | "Enviado") => {
    if (!selectedProveedorId || items.length === 0) return;
    setSaving(true);
    setSaveError("");

    try {
      const { data: pedido, error } = await supabase
        .from("pedidos_proveedor")
        .insert({
          proveedor_id: selectedProveedorId,
          fecha: todayARG(),
          estado,
          costo_total_estimado: totalEstimado,
          observacion: observacion || null,
        })
        .select("id")
        .single();

      if (error || !pedido) {
        setSaveError(error?.message || "Error al guardar el pedido.");
        setSaving(false);
        return;
      }

      const rows = items.map((item) => ({
        pedido_id: pedido.id,
        producto_id: item.producto_id,
        codigo: item.codigo,
        descripcion: item.nombre,
        cantidad: item.faltante,
        faltante: item.faltante,
        cantidad_recibida: 0,
        precio_unitario: item.precio_unitario,
        subtotal: item.subtotal,
      }));

      await supabase.from("pedido_proveedor_items").insert(rows);

      resetForm();
      setMode("list");
      await fetchData();
      setSuccessMsg(
        estado === "Borrador"
          ? `Borrador ${pedidoDisplayNum(pedido.id)} guardado`
          : `Pedido ${pedidoDisplayNum(pedido.id)} confirmado`
      );
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err: any) {
      setSaveError(err?.message || "Error inesperado.");
    } finally {
      setSaving(false);
    }
  };

  /* ── update existing borrador ── */

  const saveEditedBorrador = async () => {
    if (!detailPedido || detailItems.length === 0) return;
    setSaving(true);
    setSaveError("");

    try {
      const total = detailItems.reduce((a, i) => a + i.subtotal, 0);
      await supabase
        .from("pedidos_proveedor")
        .update({ costo_total_estimado: total, observacion: observacion || null })
        .eq("id", detailPedido.id);

      await supabase.from("pedido_proveedor_items").delete().eq("pedido_id", detailPedido.id);

      const rows = detailItems.map((item) => ({
        pedido_id: detailPedido.id,
        producto_id: item.producto_id,
        codigo: item.codigo,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        faltante: item.faltante,
        cantidad_recibida: item.cantidad_recibida || 0,
        precio_unitario: item.precio_unitario,
        subtotal: item.subtotal,
      }));
      await supabase.from("pedido_proveedor_items").insert(rows);

      setDetailPedido({ ...detailPedido, costo_total_estimado: total });
      setEditingDetail(false);
      setSuccessMsg("Borrador actualizado");
      setTimeout(() => setSuccessMsg(""), 3000);
      fetchData();
    } catch (err: any) {
      setSaveError(err?.message || "Error al actualizar.");
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setSelectedProveedorId("");
    setSelectedCategoriaId("all");
    setItems([]);
    setObservacion("");
  };

  /* ── delete pedido ── */

  const handleDeletePedido = async (pedido: PedidoRow) => {
    setDeleting(true);
    try {
      await supabase.from("pedido_proveedor_items").delete().eq("pedido_id", pedido.id);
      await supabase.from("pedidos_proveedor").delete().eq("id", pedido.id);
      setDeleteConfirm({ open: false, pedido: null });
      if (mode === "detail") {
        setMode("list");
        setDetailPedido(null);
      }
      await fetchData();
      setSuccessMsg(`Pedido ${pedidoDisplayNum(pedido.id)} eliminado`);
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err: any) {
      console.error("Error deleting pedido:", err);
    } finally {
      setDeleting(false);
    }
  };

  /* ── open detail ── */

  const openDetail = async (pedido: PedidoRow) => {
    setDetailPedido(pedido);
    setEditingDetail(false);
    setObservacion(pedido.observacion || "");
    const { data } = await supabase
      .from("pedido_proveedor_items")
      .select("*")
      .eq("pedido_id", pedido.id)
      .order("created_at");
    const items = ((data || []) as any[]).map((item) => ({
      ...item,
      cantidad_recibida: item.cantidad_recibida ?? 0,
    }));
    setDetailItems(items as PedidoItemRow[]);
    setMode("detail");
  };

  /* ── change status ── */

  const changeEstado = async (newEstado: string) => {
    if (!detailPedido) return;
    await supabase
      .from("pedidos_proveedor")
      .update({ estado: newEstado })
      .eq("id", detailPedido.id);
    setDetailPedido({ ...detailPedido, estado: newEstado });
    fetchData();
  };

  /* ── open receive dialog ── */

  const openReceiveDialog = () => {
    if (!detailPedido) return;
    setReceiveError("");
    const rItems = detailItems
      .filter((item) => {
        const pendiente = item.cantidad - (item.cantidad_recibida || 0);
        return pendiente > 0;
      })
      .map((item) => ({
        id: item.id,
        cantidad_pedida: item.cantidad,
        cantidad_recibida_prev: item.cantidad_recibida || 0,
        cantidad_recibir: item.cantidad - (item.cantidad_recibida || 0),
        descripcion: item.descripcion,
        codigo: item.codigo,
        precio_unitario: item.precio_unitario,
      }));
    setReceiveItems(rItems);
    setShowReceiveDialog(true);
  };

  /* ── receive pedido → create compra + update stock (partial support) ── */

  const handleRecibirPedido = async () => {
    if (!detailPedido || receiveItems.length === 0) return;
    setReceiveSaving(true);
    setReceiveError("");

    try {
      const itemsToReceive = receiveItems.filter((i) => i.cantidad_recibir > 0);
      if (itemsToReceive.length === 0) {
        setReceiveError("Debes ingresar al menos 1 producto a recibir");
        setReceiveSaving(false);
        return;
      }

      const { data: numData } = await supabase.rpc("next_numero", { p_tipo: "compra" });
      const numero = numData || "C-0000";
      const fecha = todayARG();

      const total = itemsToReceive.reduce((a, i) => a + i.cantidad_recibir * i.precio_unitario, 0);
      const estadoPago = receiveFormaPago === "Cuenta Corriente" ? "Pendiente" : "Pagada";

      const { data: compra, error: compraError } = await supabase
        .from("compras")
        .insert({
          numero,
          fecha,
          proveedor_id: detailPedido.proveedor_id,
          total,
          estado: "Confirmada",
          forma_pago: receiveFormaPago,
          estado_pago: estadoPago,
          observacion: `Recepcion de pedido ${pedidoDisplayNum(detailPedido.id)}`,
        })
        .select("id")
        .single();

      if (compraError || !compra) {
        setReceiveError(compraError?.message || "Error al crear la compra");
        setReceiveSaving(false);
        return;
      }

      const compraItems = itemsToReceive.map((item) => ({
        compra_id: compra.id,
        producto_id: detailItems.find((di) => di.id === item.id)?.producto_id,
        codigo: item.codigo,
        descripcion: item.descripcion,
        cantidad: item.cantidad_recibir,
        precio_unitario: item.precio_unitario,
        subtotal: item.cantidad_recibir * item.precio_unitario,
      }));
      await supabase.from("compra_items").insert(compraItems);

      for (const item of itemsToReceive) {
        const detailItem = detailItems.find((di) => di.id === item.id);
        if (!detailItem?.producto_id) continue;

        const { data: prodData } = await supabase
          .from("productos")
          .select("stock, costo, precio")
          .eq("id", detailItem.producto_id)
          .single();

        const stockAntes = prodData?.stock ?? 0;
        const newStock = stockAntes + item.cantidad_recibir;

        await supabase
          .from("productos")
          .update({ stock: newStock })
          .eq("id", detailItem.producto_id);

        await supabase.from("stock_movimientos").insert({
          producto_id: detailItem.producto_id,
          tipo: "compra",
          cantidad_antes: stockAntes,
          cantidad_despues: newStock,
          cantidad: item.cantidad_recibir,
          referencia: `Compra #${numero} (Pedido ${pedidoDisplayNum(detailPedido.id)})`,
          descripcion: `Recepcion - ${item.descripcion}`,
          usuario: "Admin Sistema",
          orden_id: compra.id,
        });

        if (receiveActualizarPrecios && item.precio_unitario > 0) {
          const costoAnterior = prodData?.costo ?? 0;
          if (costoAnterior > 0 && item.precio_unitario !== costoAnterior) {
            const precioAnterior = prodData?.precio ?? 0;
            const marginRatio = precioAnterior > 0 ? precioAnterior / costoAnterior : 1;
            const newPrecio = Math.round(item.precio_unitario * marginRatio);
            await supabase
              .from("productos")
              .update({ costo: item.precio_unitario, precio: newPrecio, fecha_actualizacion: fecha })
              .eq("id", detailItem.producto_id);
          } else {
            await supabase
              .from("productos")
              .update({ costo: item.precio_unitario, fecha_actualizacion: fecha })
              .eq("id", detailItem.producto_id);
          }
        }
      }

      for (const item of itemsToReceive) {
        const newRecibida = item.cantidad_recibida_prev + item.cantidad_recibir;
        await supabase
          .from("pedido_proveedor_items")
          .update({ cantidad_recibida: newRecibida })
          .eq("id", item.id);
      }

      if (total > 0 && receiveRegistrarCaja && receiveFormaPago !== "Cuenta Corriente") {
        const provNombre = detailPedido.proveedores?.nombre || "Proveedor";
        await supabase.from("caja_movimientos").insert({
          fecha,
          hora: new Date().toTimeString().split(" ")[0],
          tipo: "egreso",
          descripcion: `Compra ${numero} - ${provNombre} (Pedido ${pedidoDisplayNum(detailPedido.id)})`,
          metodo_pago: receiveFormaPago,
          monto: -total,
        });
      }

      if (receiveFormaPago === "Cuenta Corriente" && detailPedido.proveedor_id) {
        const { data: provData } = await supabase
          .from("proveedores")
          .select("saldo, nombre")
          .eq("id", detailPedido.proveedor_id)
          .single();
        const saldoActual = provData?.saldo ?? 0;
        const newSaldo = saldoActual + total;
        await supabase.from("proveedores").update({ saldo: newSaldo }).eq("id", detailPedido.proveedor_id);

        await supabase.from("cuenta_corriente_proveedor").insert({
          proveedor_id: detailPedido.proveedor_id,
          fecha,
          tipo: "compra",
          descripcion: `Compra ${numero} - ${provData?.nombre || "Proveedor"} (Recepcion pedido)`,
          monto: total,
          saldo_resultante: newSaldo,
          referencia_id: compra.id,
          referencia_tipo: "compra",
        });
      }

      const { data: updatedItems } = await supabase
        .from("pedido_proveedor_items")
        .select("cantidad, cantidad_recibida")
        .eq("pedido_id", detailPedido.id);

      const allReceived = (updatedItems || []).every(
        (i: any) => (i.cantidad_recibida ?? 0) >= i.cantidad
      );

      const newEstado = allReceived ? "Recibido" : "Recibido Parcial";
      await supabase
        .from("pedidos_proveedor")
        .update({ estado: newEstado })
        .eq("id", detailPedido.id);

      setDetailPedido({ ...detailPedido, estado: newEstado });
      setShowReceiveDialog(false);
      setReceiveSaving(false);

      const { data: refreshedItems } = await supabase
        .from("pedido_proveedor_items")
        .select("*")
        .eq("pedido_id", detailPedido.id)
        .order("created_at");
      setDetailItems(((refreshedItems || []) as any[]).map((i) => ({ ...i, cantidad_recibida: i.cantidad_recibida ?? 0 })));

      fetchData();
    } catch (err: any) {
      setReceiveError(err?.message || "Error inesperado");
      setReceiveSaving(false);
    }
  };

  /* ── auto-generate pedidos ── */

  const handleGenerarPedidos = async () => {
    setGenerating(true);
    setMode("generate");

    const { data } = await supabase
      .from("productos")
      .select("id, codigo, nombre, stock, stock_minimo, stock_maximo, costo, producto_proveedores(proveedor_id, precio_proveedor, cantidad_minima_pedido, es_principal, proveedores(nombre))")
      .eq("activo", true);

    if (data) {
      const groupMap: Record<string, { proveedor_nombre: string; items: SuggestedItem[] }> = {};

      for (const p of data as any[]) {
        const stock = p.stock ?? 0;
        const minimo = p.stock_minimo ?? 0;

        if (stock >= minimo && stock >= 0) continue;
        const ppList = p.producto_proveedores || [];
        if (ppList.length === 0) continue;

        const sorted = [...ppList].sort((a: any, b: any) => (b.es_principal ? 1 : 0) - (a.es_principal ? 1 : 0));
        const pp = sorted[0];

        const provId = pp.proveedor_id;
        const provName = pp.proveedores?.nombre || "Sin nombre";
        if (!groupMap[provId]) groupMap[provId] = { proveedor_nombre: provName, items: [] };
        if (groupMap[provId].items.some((i: SuggestedItem) => i.producto_id === p.id)) continue;

        const maximo = p.stock_maximo ?? 0;
        let faltante: number;
        if (maximo > 0) {
          faltante = Math.max(pp.cantidad_minima_pedido || 1, maximo - stock);
        } else if (stock < 0) {
          faltante = Math.abs(stock);
        } else {
          faltante = Math.max(pp.cantidad_minima_pedido || 1, minimo > 0 ? minimo * 2 - stock : 1);
        }
        const precio = pp.precio_proveedor || p.costo || 0;
        groupMap[provId].items.push({
          producto_id: p.id,
          codigo: p.codigo || "",
          nombre: p.nombre,
          stock,
          stock_minimo: minimo,
          stock_maximo: maximo,
          faltante,
          precio_unitario: precio,
          subtotal: faltante * precio,
        });
      }

      const groups = Object.entries(groupMap).map(([provId, g]) => ({
        proveedor_id: provId,
        proveedor_nombre: g.proveedor_nombre,
        items: g.items,
        total: g.items.reduce((a, i) => a + i.subtotal, 0),
        selected: true,
      }));
      groups.sort((a, b) => a.proveedor_nombre.localeCompare(b.proveedor_nombre));
      setGeneratedGroups(groups);
    }
    setGenerating(false);
  };

  const toggleGroupSelected = (index: number) => {
    setGeneratedGroups((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], selected: !updated[index].selected };
      return updated;
    });
  };

  const confirmGeneratedPedidos = async () => {
    const selected = generatedGroups.filter((g) => g.selected && g.items.length > 0);
    if (selected.length === 0) return;
    setSaving(true);

    for (const group of selected) {
      const { data: pedido, error } = await supabase
        .from("pedidos_proveedor")
        .insert({
          proveedor_id: group.proveedor_id,
          fecha: todayARG(),
          estado: "Borrador",
          costo_total_estimado: group.total,
          observacion: "Generado automaticamente por stock minimo",
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
        cantidad_recibida: 0,
        precio_unitario: item.precio_unitario,
        subtotal: item.subtotal,
      }));
      await supabase.from("pedido_proveedor_items").insert(rows);
    }

    setSaving(false);
    setGeneratedGroups([]);
    setMode("list");
    fetchData();
  };

  /* ── detail item editing (for borradores) ── */

  const updateDetailItemField = (index: number, field: "cantidad" | "precio_unitario", value: number) => {
    setDetailItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      if (field === "cantidad") {
        updated[index].faltante = value;
      }
      updated[index].subtotal = updated[index].cantidad * updated[index].precio_unitario;
      return updated;
    });
  };

  const removeDetailItem = (index: number) => {
    setDetailItems((prev) => prev.filter((_, i) => i !== index));
  };

  /* ── stats ── */

  const borradores = pedidos.filter((p) => p.estado === "Borrador").length;
  const enviados = pedidos.filter((p) => p.estado === "Enviado" || p.estado === "Recibido Parcial").length;
  const recibidos = pedidos.filter((p) => p.estado === "Recibido").length;
  const costoTotal = pedidos.reduce((a, p) => a + (p.costo_total_estimado || 0), 0);

  const filtered = pedidos.filter((p) => {
    const matchSearch =
      pedidoDisplayNum(p.id).toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.proveedores?.nombre || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchEstado = filterEstado === "all" || p.estado === filterEstado;
    return matchSearch && matchEstado;
  });

  const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

  /* ═══════════════════ RENDER ═══════════════════ */

  // ── NEW PEDIDO FORM ──
  if (mode === "new") {
    return (
      <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => { resetForm(); setMode("list"); }}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Nuevo Pedido a Proveedor</h1>
            <p className="text-muted-foreground text-sm">Selecciona proveedor y genera la lista de productos faltantes</p>
          </div>
        </div>

        <Card className="overflow-visible">
          <CardContent className="pt-6 overflow-visible">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div ref={provRef}>
                <Label className="uppercase text-xs text-muted-foreground font-semibold tracking-wide mb-1.5 block">Proveedor</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar proveedor..."
                    value={selectedProveedorId ? (proveedores.find((p) => p.id === selectedProveedorId)?.nombre ?? provSearch) : provSearch}
                    onChange={(e) => { setProvSearch(e.target.value); setSelectedProveedorId(""); setProvOpen(true); }}
                    onFocus={() => setProvOpen(true)}
                    className="pl-9"
                  />
                  {selectedProveedorId && (
                    <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => { setSelectedProveedorId(""); setProvSearch(""); }}>
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  {provOpen && !selectedProveedorId && (
                    <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
                      {proveedores.filter((p) => p.nombre.toLowerCase().includes(provSearch.toLowerCase())).map((p) => (
                        <button key={p.id} className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors"
                          onClick={() => { setSelectedProveedorId(p.id); setProvSearch(""); setProvOpen(false); }}>
                          {p.nombre}
                        </button>
                      ))}
                      {proveedores.filter((p) => p.nombre.toLowerCase().includes(provSearch.toLowerCase())).length === 0 && (
                        <p className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div ref={catRef}>
                <Label className="uppercase text-xs text-muted-foreground font-semibold tracking-wide mb-1.5 block">Categoria (opcional)</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar categoria..."
                    value={selectedCategoriaId !== "all" ? (categorias.find((c) => c.id === selectedCategoriaId)?.nombre ?? catSearch) : catSearch}
                    onChange={(e) => { setCatSearch(e.target.value); setSelectedCategoriaId("all"); setCatOpen(true); }}
                    onFocus={() => setCatOpen(true)}
                    className="pl-9"
                  />
                  {selectedCategoriaId !== "all" && (
                    <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => { setSelectedCategoriaId("all"); setCatSearch(""); }}>
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  {catOpen && selectedCategoriaId === "all" && (
                    <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
                      <button className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors" onClick={() => { setSelectedCategoriaId("all"); setCatSearch(""); setCatOpen(false); }}>Todas</button>
                      {categorias.filter((c) => c.nombre.toLowerCase().includes(catSearch.toLowerCase())).map((c) => (
                        <button key={c.id} className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors"
                          onClick={() => { setSelectedCategoriaId(c.id); setCatSearch(""); setCatOpen(false); }}>
                          {c.nombre}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <Button onClick={handleSugerirFaltantes} disabled={!selectedProveedorId || suggesting}>
                {suggesting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                Sugerir faltantes
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-0">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Package className="w-10 h-10 mb-3 opacity-40" />
                <p className="text-sm">No hay productos en el pedido</p>
                <p className="text-xs mt-1">Selecciona un proveedor y presiona &quot;Sugerir faltantes&quot;</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-3 px-4 font-medium">Codigo</th>
                      <th className="text-left py-3 px-4 font-medium">Producto</th>
                      <th className="text-center py-3 px-4 font-medium">Stock</th>
                      <th className="text-center py-3 px-4 font-medium">Min</th>
                      <th className="text-center py-3 px-4 font-medium">Max</th>
                      <th className="text-center py-3 px-4 font-medium">Cantidad</th>
                      <th className="text-right py-3 px-4 font-medium">Precio Unit.</th>
                      <th className="text-right py-3 px-4 font-medium">Subtotal</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={item.producto_id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                        <td className="py-2 px-4 font-mono text-xs text-muted-foreground">{item.codigo}</td>
                        <td className="py-2 px-4 font-medium">{item.nombre}</td>
                        <td className="py-2 px-4 text-center text-muted-foreground">{item.stock}</td>
                        <td className="py-2 px-4 text-center text-muted-foreground">{item.stock_minimo}</td>
                        <td className="py-2 px-4 text-center text-muted-foreground">{item.stock_maximo}</td>
                        <td className="py-2 px-4 text-center">
                          <Input type="number" min={1} value={item.faltante}
                            onChange={(e) => updateItemField(idx, "faltante", Math.max(1, Number(e.target.value)))}
                            className="w-20 mx-auto text-center h-8" />
                        </td>
                        <td className="py-2 px-4 text-right">
                          <Input type="number" min={0} value={item.precio_unitario}
                            onChange={(e) => updateItemField(idx, "precio_unitario", Math.max(0, Number(e.target.value)))}
                            className="w-28 ml-auto text-right h-8" />
                        </td>
                        <td className="py-2 px-4 text-right font-semibold">{formatCurrency(item.subtotal)}</td>
                        <td className="py-2 px-2">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-500" onClick={() => removeItem(idx)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex justify-end border-t pt-3 mt-1 px-4">
                  <span className="text-sm text-muted-foreground mr-4">Total estimado:</span>
                  <span className="text-sm font-bold">{formatCurrency(totalEstimado)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {items.length > 0 && (
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Observaciones</Label>
                <Input value={observacion} onChange={(e) => setObservacion(e.target.value)} placeholder="Notas adicionales para el pedido..." />
              </div>
              {saveError && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700">{saveError}</div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { resetForm(); setSaveError(""); setMode("list"); }}>Cancelar</Button>
                <Button variant="secondary" onClick={() => savePedido("Borrador")} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Guardar Borrador
                </Button>
                <Button onClick={() => savePedido("Enviado")} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                  Confirmar Pedido
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // ── DETAIL VIEW ──
  if (mode === "detail" && detailPedido) {
    const isParcial = detailPedido.estado === "Recibido Parcial";
    const canReceive = detailPedido.estado === "Enviado" || isParcial;
    const canEdit = detailPedido.estado === "Borrador";
    const canDelete = detailPedido.estado === "Borrador";
    const detailTotal = detailItems.reduce((a, i) => a + i.subtotal, 0);
    const cfg = estadoConfig(detailPedido.estado);
    const EstadoIcon = cfg.icon;

    return (
      <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" className="mt-1" onClick={() => { setMode("list"); setDetailPedido(null); setEditingDetail(false); }}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
                {pedidoDisplayNum(detailPedido.id)}
              </h1>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
                <EstadoIcon className="w-3.5 h-3.5" />
                {detailPedido.estado}
              </span>
            </div>
            <p className="text-muted-foreground text-sm mt-0.5">
              {detailPedido.proveedores?.nombre || "Sin proveedor"} &middot;{" "}
              {new Date(detailPedido.fecha + "T12:00:00").toLocaleDateString("es-AR")}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            {canEdit && !editingDetail && (
              <>
                <Button size="sm" variant="outline" onClick={() => setEditingDetail(true)}>
                  <Edit className="w-4 h-4 mr-1.5" />Editar
                </Button>
                <Button size="sm" onClick={() => changeEstado("Enviado")}>
                  <Send className="w-4 h-4 mr-1.5" />Marcar Enviado
                </Button>
              </>
            )}
            {canEdit && editingDetail && (
              <>
                <Button size="sm" variant="outline" onClick={() => setEditingDetail(false)}>Cancelar</Button>
                <Button size="sm" onClick={saveEditedBorrador} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
                  Guardar
                </Button>
              </>
            )}
            {canReceive && (
              <Button size="sm" onClick={openReceiveDialog}>
                <Package className="w-4 h-4 mr-1.5" />Recibir Mercaderia
              </Button>
            )}
            {canDelete && !editingDetail && (
              <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200" onClick={() => setDeleteConfirm({ open: true, pedido: detailPedido })}>
                <Trash2 className="w-4 h-4 mr-1.5" />Eliminar
              </Button>
            )}
          </div>
        </div>

        {successMsg && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
            {successMsg}
          </div>
        )}

        {/* Info row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border bg-card px-4 py-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Proveedor</p>
            <p className="text-sm font-semibold mt-0.5">{detailPedido.proveedores?.nombre || "\u2014"}</p>
          </div>
          <div className="rounded-xl border bg-card px-4 py-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Fecha</p>
            <p className="text-sm font-semibold mt-0.5">{new Date(detailPedido.fecha + "T12:00:00").toLocaleDateString("es-AR")}</p>
          </div>
          <div className="rounded-xl border bg-card px-4 py-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Items</p>
            <p className="text-sm font-semibold mt-0.5">{detailItems.length} productos</p>
          </div>
          <div className="rounded-xl border bg-card px-4 py-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Total estimado</p>
            <p className="text-sm font-semibold mt-0.5 text-emerald-600">{formatCurrency(detailTotal)}</p>
          </div>
        </div>

        {detailPedido.observacion && !editingDetail && (
          <div className="rounded-xl border bg-muted/30 px-4 py-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Observaciones</p>
            <p className="text-sm">{detailPedido.observacion}</p>
          </div>
        )}
        {editingDetail && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Observaciones</Label>
            <Input value={observacion} onChange={(e) => setObservacion(e.target.value)} placeholder="Notas..." />
          </div>
        )}

        {/* Items table */}
        <Card>
          <CardContent className="pt-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-3 px-4 font-medium">Codigo</th>
                    <th className="text-left py-3 px-4 font-medium">Descripcion</th>
                    <th className="text-center py-3 px-4 font-medium">Pedido</th>
                    {(isParcial || detailPedido.estado === "Recibido") && (
                      <th className="text-center py-3 px-4 font-medium">Recibido</th>
                    )}
                    {(isParcial || detailPedido.estado === "Recibido") && (
                      <th className="text-center py-3 px-4 font-medium">Pendiente</th>
                    )}
                    <th className="text-right py-3 px-4 font-medium">Precio Unit.</th>
                    <th className="text-right py-3 px-4 font-medium">Subtotal</th>
                    {editingDetail && <th className="w-10"></th>}
                  </tr>
                </thead>
                <tbody>
                  {detailItems.map((item, idx) => {
                    const pendiente = item.cantidad - (item.cantidad_recibida || 0);
                    return (
                      <tr key={item.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                        <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{item.codigo}</td>
                        <td className="py-3 px-4 font-medium">{item.descripcion}</td>
                        <td className="py-3 px-4 text-center">
                          {editingDetail ? (
                            <Input type="number" min={1} value={item.cantidad}
                              onChange={(e) => updateDetailItemField(idx, "cantidad", Math.max(1, Number(e.target.value)))}
                              className="w-20 mx-auto text-center h-8" />
                          ) : (
                            item.cantidad
                          )}
                        </td>
                        {(isParcial || detailPedido.estado === "Recibido") && (
                          <td className="py-3 px-4 text-center">
                            <span className="text-emerald-600 font-medium">{item.cantidad_recibida || 0}</span>
                          </td>
                        )}
                        {(isParcial || detailPedido.estado === "Recibido") && (
                          <td className="py-3 px-4 text-center">
                            {pendiente > 0 ? (
                              <span className="text-amber-600 font-medium">{pendiente}</span>
                            ) : (
                              <Check className="w-4 h-4 text-emerald-500 mx-auto" />
                            )}
                          </td>
                        )}
                        <td className="py-3 px-4 text-right">
                          {editingDetail ? (
                            <Input type="number" min={0} value={item.precio_unitario}
                              onChange={(e) => updateDetailItemField(idx, "precio_unitario", Math.max(0, Number(e.target.value)))}
                              className="w-28 ml-auto text-right h-8" />
                          ) : (
                            formatCurrency(item.precio_unitario)
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-semibold">{formatCurrency(item.subtotal)}</td>
                        {editingDetail && (
                          <td className="py-3 px-2">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-500" onClick={() => removeDetailItem(idx)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="flex justify-end border-t pt-3 mt-1 px-4">
                <span className="text-sm text-muted-foreground mr-4">Total:</span>
                <span className="text-sm font-bold">{formatCurrency(detailTotal)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Receive Pedido Dialog */}
        <Dialog open={showReceiveDialog} onOpenChange={setShowReceiveDialog}>
          <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Recibir Mercaderia {isParcial && "(Recepcion adicional)"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Ingresa la cantidad recibida de cada producto. Los items no recibidos quedaran pendientes.
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-2 px-3 font-medium">Producto</th>
                      <th className="text-center py-2 px-3 font-medium">Pedido</th>
                      <th className="text-center py-2 px-3 font-medium">Ya recibido</th>
                      <th className="text-center py-2 px-3 font-medium">Pendiente</th>
                      <th className="text-center py-2 px-3 font-medium">Recibir ahora</th>
                      <th className="text-right py-2 px-3 font-medium">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receiveItems.map((item, idx) => {
                      const pendiente = item.cantidad_pedida - item.cantidad_recibida_prev;
                      return (
                        <tr key={item.id} className="border-b last:border-0">
                          <td className="py-2 px-3">
                            <span className="font-mono text-xs text-muted-foreground mr-2">{item.codigo}</span>
                            <span className="text-sm">{item.descripcion}</span>
                          </td>
                          <td className="py-2 px-3 text-center text-muted-foreground">{item.cantidad_pedida}</td>
                          <td className="py-2 px-3 text-center text-muted-foreground">{item.cantidad_recibida_prev}</td>
                          <td className="py-2 px-3 text-center text-amber-600 font-medium">{pendiente}</td>
                          <td className="py-2 px-3 text-center">
                            <Input
                              type="number"
                              min={0}
                              max={pendiente}
                              value={item.cantidad_recibir}
                              onChange={(e) => {
                                const val = Math.min(Math.max(0, Number(e.target.value)), pendiente);
                                setReceiveItems((prev) => {
                                  const updated = [...prev];
                                  updated[idx] = { ...updated[idx], cantidad_recibir: val };
                                  return updated;
                                });
                              }}
                              className="w-20 mx-auto text-center h-8"
                            />
                          </td>
                          <td className="py-2 px-3 text-right font-medium">
                            {formatCurrency(item.cantidad_recibir * item.precio_unitario)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="flex justify-end border-t pt-3 mt-1 px-3">
                  <span className="text-sm text-muted-foreground mr-4">Total a recibir:</span>
                  <span className="text-sm font-bold">
                    {formatCurrency(receiveItems.reduce((a, i) => a + i.cantidad_recibir * i.precio_unitario, 0))}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Forma de pago</Label>
                  <Select value={receiveFormaPago} onValueChange={(v) => setReceiveFormaPago(v ?? "")}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar forma de pago" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Efectivo">Efectivo</SelectItem>
                      <SelectItem value="Transferencia">Transferencia</SelectItem>
                      <SelectItem value="Cuenta Corriente">Cuenta Corriente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={receiveActualizarPrecios} onChange={(e) => setReceiveActualizarPrecios(e.target.checked)} className="rounded" />
                  <span className="text-sm">Actualizar costos y precios de venta (mantener margen)</span>
                </label>

                {(receiveFormaPago === "Efectivo" || receiveFormaPago === "Transferencia") && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={receiveRegistrarCaja} onChange={(e) => setReceiveRegistrarCaja(e.target.checked)} className="rounded" />
                    <span className="text-sm">Registrar movimiento en caja diaria</span>
                  </label>
                )}

                {receiveFormaPago === "Cuenta Corriente" && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Se agregara al saldo del proveedor como deuda pendiente
                  </p>
                )}
              </div>

              {receiveError && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                  {receiveError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => { setShowReceiveDialog(false); setReceiveError(""); }}>Cancelar</Button>
                <Button onClick={handleRecibirPedido} disabled={receiveSaving}>
                  {receiveSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Package className="w-4 h-4 mr-2" />}
                  Confirmar Recepcion
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ── GENERATE VIEW ──
  if (mode === "generate") {
    const selectedCount = generatedGroups.filter((g) => g.selected).length;
    const selectedTotal = generatedGroups.filter((g) => g.selected).reduce((a, g) => a + g.total, 0);

    return (
      <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => { setGeneratedGroups([]); setMode("list"); }}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Generar Pedidos Automaticos</h1>
            <p className="text-muted-foreground text-sm">Productos con stock por debajo del minimo, agrupados por proveedor</p>
          </div>
        </div>

        {generating ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : generatedGroups.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Package className="w-10 h-10 mb-3 opacity-40" />
                <p className="text-sm">No hay productos con stock bajo el minimo que tengan proveedores asignados</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {generatedGroups.length} proveedor(es) - Total estimado: <span className="font-bold text-foreground">{formatCurrency(selectedTotal)}</span>
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setGeneratedGroups([]); setMode("list"); }}>Cancelar</Button>
                <Button onClick={confirmGeneratedPedidos} disabled={saving || selectedCount === 0}>
                  {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Crear {selectedCount} Pedido(s) como Borrador
                </Button>
              </div>
            </div>

            {generatedGroups.map((group, gIdx) => (
              <Card key={group.proveedor_id} className={!group.selected ? "opacity-50" : ""}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <input type="checkbox" checked={group.selected} onChange={() => toggleGroupSelected(gIdx)} className="w-4 h-4 rounded border-border" />
                      <div>
                        <p className="font-semibold">{group.proveedor_nombre}</p>
                        <p className="text-xs text-muted-foreground">{group.items.length} producto(s) - Total: {formatCurrency(group.total)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="text-left py-2 px-3 font-medium text-xs">Codigo</th>
                          <th className="text-left py-2 px-3 font-medium text-xs">Producto</th>
                          <th className="text-center py-2 px-3 font-medium text-xs">Stock</th>
                          <th className="text-center py-2 px-3 font-medium text-xs">Min</th>
                          <th className="text-center py-2 px-3 font-medium text-xs">Max</th>
                          <th className="text-center py-2 px-3 font-medium text-xs">A pedir</th>
                          <th className="text-right py-2 px-3 font-medium text-xs">Costo Unit.</th>
                          <th className="text-right py-2 px-3 font-medium text-xs">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map((item) => (
                          <tr key={item.producto_id} className="border-b last:border-0">
                            <td className="py-2 px-3 font-mono text-xs text-muted-foreground">{item.codigo}</td>
                            <td className="py-2 px-3 text-sm">{item.nombre}</td>
                            <td className="py-2 px-3 text-center text-sm text-muted-foreground">{item.stock}</td>
                            <td className="py-2 px-3 text-center text-sm text-muted-foreground">{item.stock_minimo}</td>
                            <td className="py-2 px-3 text-center text-sm text-muted-foreground">{item.stock_maximo}</td>
                            <td className="py-2 px-3 text-center text-sm font-medium">{item.faltante}</td>
                            <td className="py-2 px-3 text-right text-sm">{formatCurrency(item.precio_unitario)}</td>
                            <td className="py-2 px-3 text-right text-sm font-semibold">{formatCurrency(item.subtotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ))}
          </>
        )}
      </div>
    );
  }

  // ── LIST VIEW ──
  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Pedidos a Proveedores</h1>
          <p className="text-muted-foreground text-sm">Gestiona tus pedidos de compra</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleGenerarPedidos}>
            <Sparkles className="w-4 h-4 mr-2" />Generar Pedidos
          </Button>
          <Button onClick={() => setMode("new")}>
            <Plus className="w-4 h-4 mr-2" />Nuevo Pedido
          </Button>
        </div>
      </div>

      {successMsg && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
          {successMsg}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          onClick={() => setFilterEstado(filterEstado === "Borrador" ? "all" : "Borrador")}
          className={`rounded-xl border px-4 py-3 text-left transition-all hover:shadow-sm ${filterEstado === "Borrador" ? "ring-2 ring-slate-400 bg-slate-50 dark:bg-slate-900" : "bg-card"}`}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <FileText className="w-4.5 h-4.5 text-slate-600 dark:text-slate-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Borradores</p>
              <p className="text-lg font-bold">{borradores}</p>
            </div>
          </div>
        </button>
        <button
          onClick={() => setFilterEstado(filterEstado === "Enviado" ? "all" : "Enviado")}
          className={`rounded-xl border px-4 py-3 text-left transition-all hover:shadow-sm ${filterEstado === "Enviado" ? "ring-2 ring-blue-400 bg-blue-50 dark:bg-blue-950" : "bg-card"}`}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
              <TruckIcon className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Enviados</p>
              <p className="text-lg font-bold">{enviados}</p>
            </div>
          </div>
        </button>
        <button
          onClick={() => setFilterEstado(filterEstado === "Recibido" ? "all" : "Recibido")}
          className={`rounded-xl border px-4 py-3 text-left transition-all hover:shadow-sm ${filterEstado === "Recibido" ? "ring-2 ring-emerald-400 bg-emerald-50 dark:bg-emerald-950" : "bg-card"}`}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
              <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Recibidos</p>
              <p className="text-lg font-bold">{recibidos}</p>
            </div>
          </div>
        </button>
        <div className="rounded-xl border bg-card px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center">
              <DollarSign className="w-4.5 h-4.5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Costo total</p>
              <p className="text-lg font-bold">{formatCurrency(costoTotal)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar pedido o proveedor..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 h-9" />
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <div className="flex items-center rounded-lg border bg-card overflow-hidden">
            {(["all", "day", "month", "range"] as const).map((m) => {
              const labels = { all: "Todo", day: "Dia", month: "Mes", range: "Rango" };
              return (
                <button
                  key={m}
                  onClick={() => setPedFilterMode(m)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${pedFilterMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                >
                  {labels[m]}
                </button>
              );
            })}
          </div>

          {pedFilterMode === "day" && (
            <Input type="date" value={pedFilterDay} onChange={(e) => setPedFilterDay(e.target.value)} className="w-40 h-9" />
          )}
          {pedFilterMode === "month" && (
            <div className="flex items-center gap-1.5">
              <Select value={pedFilterMonth} onValueChange={(v) => setPedFilterMonth(v ?? "1")}>
                <SelectTrigger className="w-24 h-9 text-xs"><SelectValue placeholder="Mes" /></SelectTrigger>
                <SelectContent>
                  {meses.map((m, i) => (
                    <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input type="number" value={pedFilterYear} onChange={(e) => setPedFilterYear(e.target.value)} className="w-20 h-9 text-xs" />
            </div>
          )}
          {pedFilterMode === "range" && (
            <div className="flex items-center gap-1.5">
              <Input type="date" value={pedFilterFrom} onChange={(e) => setPedFilterFrom(e.target.value)} className="w-36 h-9" />
              <span className="text-xs text-muted-foreground">a</span>
              <Input type="date" value={pedFilterTo} onChange={(e) => setPedFilterTo(e.target.value)} className="w-36 h-9" />
            </div>
          )}

          {filterEstado !== "all" && (
            <Button variant="ghost" size="sm" className="h-9 text-xs text-muted-foreground" onClick={() => setFilterEstado("all")}>
              <X className="w-3.5 h-3.5 mr-1" />Limpiar filtro
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="pt-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <ClipboardList className="w-10 h-10 mb-3 opacity-40" />
              <p className="text-sm">No se encontraron pedidos</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-3 px-4 font-medium">Pedido</th>
                    <th className="text-left py-3 px-4 font-medium">Fecha</th>
                    <th className="text-left py-3 px-4 font-medium">Proveedor</th>
                    <th className="text-right py-3 px-4 font-medium">Total estimado</th>
                    <th className="text-center py-3 px-4 font-medium">Estado</th>
                    <th className="text-right py-3 px-4 font-medium w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const cfg = estadoConfig(p.estado);
                    const Icon = cfg.icon;
                    return (
                      <tr
                        key={p.id}
                        className="border-b last:border-0 hover:bg-muted/50 transition-colors cursor-pointer group"
                        onClick={() => openDetail(p)}
                      >
                        <td className="py-3 px-4">
                          <span className="font-mono text-xs font-medium">{pedidoDisplayNum(p.id)}</span>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">
                          {new Date(p.fecha + "T12:00:00").toLocaleDateString("es-AR")}
                        </td>
                        <td className="py-3 px-4 font-medium">{p.proveedores?.nombre || "\u2014"}</td>
                        <td className="py-3 px-4 text-right font-semibold">{formatCurrency(p.costo_total_estimado || 0)}</td>
                        <td className="py-3 px-4 text-center">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium ${cfg.color}`}>
                            <Icon className="w-3 h-3" />
                            {p.estado}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {p.estado === "Borrador" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ open: true, pedido: p }); }}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openDetail(p); }}>
                              <Eye className="w-3.5 h-3.5" />
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirm.open} onOpenChange={(open) => !open && setDeleteConfirm({ open: false, pedido: null })}>
        <DialogContent className="max-w-sm">
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-red-500" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold">Eliminar pedido</p>
              <p className="text-sm text-muted-foreground mt-2">
                Estas seguro de eliminar el pedido <strong>{deleteConfirm.pedido ? pedidoDisplayNum(deleteConfirm.pedido.id) : ""}</strong>?
              </p>
              <p className="text-xs text-muted-foreground mt-1">Esta accion no se puede deshacer.</p>
            </div>
            <div className="flex gap-2 w-full">
              <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirm({ open: false, pedido: null })}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => deleteConfirm.pedido && handleDeletePedido(deleteConfirm.pedido)}
                disabled={deleting}
              >
                {deleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                Eliminar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
