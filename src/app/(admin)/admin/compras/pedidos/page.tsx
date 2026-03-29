"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { norm } from "@/lib/utils";
import { showAdminToast } from "@/components/admin-toast";
import { todayARG, nowTimeARG, currentMonthPadded, formatCurrency } from "@/lib/formatters";
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
  Copy,
  MessageCircle,
} from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";

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

interface Subcategoria {
  id: string;
  nombre: string;
  categoria_id: string;
}

interface SuggestedItem {
  producto_id: string;
  codigo: string;
  nombre: string;
  stock: number;
  stock_minimo: number;
  stock_maximo: number;
  faltante: number;
  unidades_por_caja: number;
  cajas: number;
  precio_unitario: number;
  subtotal: number;
}

/* ───────── helpers ───────── */

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
  const currentUser = useCurrentUser();
  // List state
  const [pedidos, setPedidos] = useState<PedidoRow[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterEstado, setFilterEstado] = useState("all");
  const [pedFilterMode, setPedFilterMode] = useState<"day" | "month" | "range" | "all">("range");
  const [pedFilterDay, setPedFilterDay] = useState(todayARG());
  const [pedFilterMonth, setPedFilterMonth] = useState(currentMonthPadded());
  const [pedFilterYear, setPedFilterYear] = useState(String(new Date().getFullYear()));
  const [pedFilterFrom, setPedFilterFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [pedFilterTo, setPedFilterTo] = useState(todayARG());

  // New / edit pedido state
  const [mode, setMode] = useState<"list" | "new" | "detail" | "generate" | "edit">("list");
  const [selectedProveedorId, setSelectedProveedorId] = useState("");
  const [selectedCategoriaId, setSelectedCategoriaId] = useState("all");
  const [selectedSubcategoriaId, setSelectedSubcategoriaId] = useState("all");
  const [pedirHasta, setPedirHasta] = useState<"minimo" | "maximo">("maximo");

  // Searchable dropdown states
  const [provSearch, setProvSearch] = useState("");
  const [provOpen, setProvOpen] = useState(false);
  const [catSearch, setCatSearch] = useState("");
  const [catOpen, setCatOpen] = useState(false);
  const [subcatSearch, setSubcatSearch] = useState("");
  const [subcatOpen, setSubcatOpen] = useState(false);
  const provRef = useRef<HTMLDivElement>(null);
  const catRef = useRef<HTMLDivElement>(null);
  const subcatRef = useRef<HTMLDivElement>(null);
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

    const [{ data: ped }, { data: prov }, { data: cats }, { data: subcats }] = await Promise.all([
      pedQuery,
      supabase.from("proveedores").select("id, nombre, saldo").eq("activo", true).order("nombre"),
      supabase.from("categorias").select("id, nombre").order("nombre"),
      supabase.from("subcategorias").select("id, nombre, categoria_id").order("nombre"),
    ]);
    setPedidos((ped as PedidoRow[]) || []);
    setProveedores((prov as Proveedor[]) || []);
    setCategorias((cats as Categoria[]) || []);
    setSubcategorias((subcats as Subcategoria[]) || []);
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
      if (subcatRef.current && !subcatRef.current.contains(e.target as Node)) setSubcatOpen(false);
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
      .select("id, codigo, nombre, stock, stock_minimo, stock_maximo, costo, categoria_id, subcategoria_id, producto_proveedores!inner(proveedor_id, precio_proveedor, cantidad_minima_pedido), presentaciones(nombre, cantidad)")
      .eq("activo", true)
      .eq("producto_proveedores.proveedor_id", selectedProveedorId);

    if (selectedCategoriaId !== "all") {
      query = query.eq("categoria_id", selectedCategoriaId);
    }
    if (selectedSubcategoriaId !== "all") {
      query = query.eq("subcategoria_id", selectedSubcategoriaId);
    }

    const { data } = await query;

    if (data) {
      const suggested: SuggestedItem[] = (data as any[])
        .filter((p) => {
          const stock = p.stock ?? 0;
          const minimo = p.stock_minimo ?? 0;
          const maximo = p.stock_maximo ?? 0;
          if (pedirHasta === "maximo") {
            return (maximo > 0 && stock < maximo) || (minimo > 0 && stock < minimo) || stock < 0;
          }
          return stock < minimo || stock < 0;
        })
        .map((p) => {
          const pp = (p.producto_proveedores || [])[0];
          const stock = p.stock ?? 0;
          const maximo = p.stock_maximo ?? 0;
          const minimo = p.stock_minimo ?? 0;
          let faltante: number;
          if (pedirHasta === "maximo" && maximo > 0) {
            faltante = Math.max(pp?.cantidad_minima_pedido || 1, maximo - stock);
          } else if (minimo > 0) {
            faltante = Math.max(pp?.cantidad_minima_pedido || 1, minimo - stock);
          } else if (stock < 0) {
            faltante = Math.abs(stock);
          } else {
            faltante = pp?.cantidad_minima_pedido || 1;
          }
          // Round up to full boxes if product has a Caja presentation
          const cajaPres = (p.presentaciones || []).find((pr: any) => pr.nombre?.toLowerCase().startsWith("caja") && pr.cantidad > 1);
          const unidadesPorCaja = cajaPres ? cajaPres.cantidad : 0;
          if (unidadesPorCaja > 0) {
            faltante = Math.ceil(faltante / unidadesPorCaja) * unidadesPorCaja;
          }
          const cajas = unidadesPorCaja > 0 ? Math.round(faltante / unidadesPorCaja) : 0;
          const precio = pp?.precio_proveedor || p.costo || 0;
          return {
            producto_id: p.id,
            codigo: p.codigo || "",
            nombre: p.nombre,
            stock: p.stock || 0,
            stock_minimo: p.stock_minimo || 0,
            stock_maximo: p.stock_maximo || 0,
            faltante,
            unidades_por_caja: unidadesPorCaja,
            cajas,
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
      if (field === "faltante" && updated[index].unidades_por_caja > 0) {
        updated[index].cajas = Math.round(value / updated[index].unidades_por_caja * 10) / 10;
      }
      return updated;
    });
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const totalEstimado = items.reduce((a, i) => a + i.subtotal, 0);

  /* ── helper: create compra pendiente from pedido ── */

  const crearCompraPendiente = async (
    pedidoId: string,
    proveedorId: string,
    itemsData: { producto_id: string; codigo: string; descripcion: string; cantidad: number; precio_unitario: number; subtotal: number }[],
    totalEstimadoVal: number,
  ) => {
    const { data: numData } = await supabase.rpc("next_numero", { p_tipo: "compra" });
    const numero = numData || "C-0000";
    const fecha = todayARG();
    const pedDisplay = pedidoDisplayNum(pedidoId);

    const { data: compra, error: compraError } = await supabase
      .from("compras")
      .insert({
        numero,
        fecha,
        proveedor_id: proveedorId,
        total: totalEstimadoVal,
        estado: "Pendiente",
        forma_pago: "Efectivo",
        estado_pago: "Pendiente",
        observacion: `Generado desde pedido ${pedDisplay}`,
      })
      .select("id")
      .single();

    if (compraError || !compra) {
      console.error("Error creando compra pendiente:", compraError?.message);
      return;
    }

    const compraItems = itemsData.map((item) => ({
      compra_id: compra.id,
      producto_id: item.producto_id,
      codigo: item.codigo,
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
      subtotal: item.subtotal,
    }));
    await supabase.from("compra_items").insert(compraItems);
  };

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

      // Si se confirma (Enviado), crear compra pendiente
      if (estado === "Enviado") {
        const compraItemsData = items.map((item) => ({
          producto_id: item.producto_id,
          codigo: item.codigo,
          descripcion: item.nombre,
          cantidad: item.faltante,
          precio_unitario: item.precio_unitario,
          subtotal: item.subtotal,
        }));
        await crearCompraPendiente(pedido.id, selectedProveedorId, compraItemsData, totalEstimado);
      }

      resetForm();
      setMode("list");
      await fetchData();
      setSuccessMsg(
        estado === "Borrador"
          ? `Borrador ${pedidoDisplayNum(pedido.id)} guardado`
          : `Pedido ${pedidoDisplayNum(pedido.id)} guardado y registrado como compra pendiente`
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
    setSelectedSubcategoriaId("all");
    setItems([]);
    setObservacion("");
  };

  /* ── delete pedido ── */

  const handleDeletePedido = async (pedido: PedidoRow) => {
    setDeleting(true);
    try {
      // Also delete associated pending compra if exists
      const pedDisplay = pedidoDisplayNum(pedido.id);
      const { data: pendingCompra } = await supabase
        .from("compras")
        .select("id")
        .eq("estado", "Pendiente")
        .ilike("observacion", `%${pedDisplay}%`)
        .maybeSingle();
      if (pendingCompra) {
        await supabase.from("compra_items").delete().eq("compra_id", pendingCompra.id);
        await supabase.from("compras").delete().eq("id", pendingCompra.id);
      }
      await supabase.from("pedido_proveedor_items").delete().eq("pedido_id", pedido.id);
      await supabase.from("pedidos_proveedor").delete().eq("id", pedido.id);
      setDeleteConfirm({ open: false, pedido: null });
      // Remove from local state immediately
      setPedidos((prev) => prev.filter((p) => p.id !== pedido.id));
      if (mode === "detail") {
        setMode("list");
        setDetailPedido(null);
        setDetailItems([]);
      }
      showAdminToast(`Pedido ${pedidoDisplayNum(pedido.id)} eliminado`, "success");
    } catch (err: any) {
      console.error("Error deleting pedido:", err);
    } finally {
      setDeleting(false);
      setDeleteConfirm({ open: false, pedido: null });
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

    // Si se marca como Enviado, crear compra pendiente
    if (newEstado === "Enviado" && detailPedido.proveedor_id) {
      const compraItemsData = detailItems.map((item) => ({
        producto_id: item.producto_id,
        codigo: item.codigo,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        subtotal: item.subtotal,
      }));
      const total = detailItems.reduce((a, i) => a + i.subtotal, 0);
      await crearCompraPendiente(detailPedido.id, detailPedido.proveedor_id, compraItemsData, total);
      showAdminToast("Pedido guardado y registrado como compra pendiente", "success");
    }

    setDetailPedido({ ...detailPedido, estado: newEstado });
    fetchData();
  };

  /* ── open receive dialog ── */


  /* ── auto-generate pedidos ── */

  const handleGenerarPedidos = async () => {
    setGenerating(true);
    setMode("generate");

    const { data } = await supabase
      .from("productos")
      .select("id, codigo, nombre, stock, stock_minimo, stock_maximo, costo, producto_proveedores(proveedor_id, precio_proveedor, cantidad_minima_pedido, es_principal, proveedores(nombre)), presentaciones(nombre, cantidad)")
      .eq("activo", true);

    if (data) {
      const groupMap: Record<string, { proveedor_nombre: string; items: SuggestedItem[] }> = {};

      for (const p of data as any[]) {
        const stock = p.stock ?? 0;
        const minimo = p.stock_minimo ?? 0;
        const maximo = p.stock_maximo ?? 0;

        // Filter based on pedirHasta mode
        if (pedirHasta === "maximo") {
          if (!((maximo > 0 && stock < maximo) || (minimo > 0 && stock < minimo) || stock < 0)) continue;
        } else {
          if (stock >= minimo && stock >= 0) continue;
        }

        const ppList = p.producto_proveedores || [];
        if (ppList.length === 0) continue;

        const sorted = [...ppList].sort((a: any, b: any) => (b.es_principal ? 1 : 0) - (a.es_principal ? 1 : 0));
        const pp = sorted[0];

        const provId = pp.proveedor_id;
        const provName = pp.proveedores?.nombre || "Sin nombre";
        if (!groupMap[provId]) groupMap[provId] = { proveedor_nombre: provName, items: [] };
        if (groupMap[provId].items.some((i: SuggestedItem) => i.producto_id === p.id)) continue;

        let faltante: number;
        if (pedirHasta === "maximo" && maximo > 0) {
          faltante = Math.max(pp.cantidad_minima_pedido || 1, maximo - stock);
        } else if (minimo > 0) {
          faltante = Math.max(pp.cantidad_minima_pedido || 1, minimo - stock);
        } else if (stock < 0) {
          faltante = Math.abs(stock);
        } else {
          faltante = pp.cantidad_minima_pedido || 1;
        }
        const cajaPres = (p.presentaciones || []).find((pr: any) => pr.nombre?.toLowerCase().startsWith("caja") && pr.cantidad > 1);
        const unidadesPorCaja = cajaPres ? cajaPres.cantidad : 0;
        if (unidadesPorCaja > 0) {
          faltante = Math.ceil(faltante / unidadesPorCaja) * unidadesPorCaja;
        }
        const cajas = unidadesPorCaja > 0 ? Math.round(faltante / unidadesPorCaja) : 0;
        const precio = pp.precio_proveedor || p.costo || 0;
        groupMap[provId].items.push({
          producto_id: p.id,
          codigo: p.codigo || "",
          nombre: p.nombre,
          stock,
          stock_minimo: minimo,
          stock_maximo: maximo,
          faltante,
          unidades_por_caja: unidadesPorCaja,
          cajas,
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
      norm(pedidoDisplayNum(p.id)).includes(norm(searchTerm)) ||
      norm(p.proveedores?.nombre || "").includes(norm(searchTerm));
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
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
                      {proveedores.filter((p) => norm(p.nombre).includes(norm(provSearch))).map((p) => (
                        <button key={p.id} className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors"
                          onClick={() => { setSelectedProveedorId(p.id); setProvSearch(""); setProvOpen(false); }}>
                          {p.nombre}
                        </button>
                      ))}
                      {proveedores.filter((p) => norm(p.nombre).includes(norm(provSearch))).length === 0 && (
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
                    onChange={(e) => { setCatSearch(e.target.value); setSelectedCategoriaId("all"); setSelectedSubcategoriaId("all"); setCatOpen(true); }}
                    onFocus={() => setCatOpen(true)}
                    className="pl-9"
                  />
                  {selectedCategoriaId !== "all" && (
                    <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => { setSelectedCategoriaId("all"); setSelectedSubcategoriaId("all"); setCatSearch(""); }}>
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  {catOpen && selectedCategoriaId === "all" && (
                    <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
                      <button className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors" onClick={() => { setSelectedCategoriaId("all"); setCatSearch(""); setCatOpen(false); }}>Todas</button>
                      {categorias.filter((c) => norm(c.nombre).includes(norm(catSearch))).map((c) => (
                        <button key={c.id} className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors"
                          onClick={() => { setSelectedCategoriaId(c.id); setSelectedSubcategoriaId("all"); setCatSearch(""); setCatOpen(false); }}>
                          {c.nombre}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div ref={subcatRef}>
                <Label className="uppercase text-xs text-muted-foreground font-semibold tracking-wide mb-1.5 block">Subcategoria (opcional)</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar subcategoria..."
                    value={selectedSubcategoriaId !== "all" ? (subcategorias.find((s) => s.id === selectedSubcategoriaId)?.nombre ?? subcatSearch) : subcatSearch}
                    onChange={(e) => { setSubcatSearch(e.target.value); setSelectedSubcategoriaId("all"); setSubcatOpen(true); }}
                    onFocus={() => setSubcatOpen(true)}
                    className="pl-9"
                  />
                  {selectedSubcategoriaId !== "all" && (
                    <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => { setSelectedSubcategoriaId("all"); setSubcatSearch(""); }}>
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  {subcatOpen && selectedSubcategoriaId === "all" && (
                    <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
                      <button className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors" onClick={() => { setSelectedSubcategoriaId("all"); setSubcatSearch(""); setSubcatOpen(false); }}>Todas</button>
                      {subcategorias
                        .filter((s) => selectedCategoriaId === "all" || s.categoria_id === selectedCategoriaId)
                        .filter((s) => norm(s.nombre).includes(norm(subcatSearch)))
                        .map((s) => (
                          <button key={s.id} className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors"
                            onClick={() => { setSelectedSubcategoriaId(s.id); setSubcatSearch(""); setSubcatOpen(false); }}>
                            {s.nombre}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center rounded-lg border overflow-hidden text-sm">
                  <button className={`px-3 py-2 ${pedirHasta === "maximo" ? "bg-primary text-white" : "bg-white hover:bg-gray-50"}`} onClick={() => setPedirHasta("maximo")}>Hasta máx</button>
                  <button className={`px-3 py-2 ${pedirHasta === "minimo" ? "bg-primary text-white" : "bg-white hover:bg-gray-50"}`} onClick={() => setPedirHasta("minimo")}>Hasta mín</button>
                </div>
                <Button onClick={handleSugerirFaltantes} disabled={!selectedProveedorId || suggesting}>
                  {suggesting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                  Sugerir
                </Button>
              </div>
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
                      <th className="text-center py-3 px-4 font-medium">Cajas</th>
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
                        <td className="py-2 px-4 text-center text-muted-foreground">
                          {item.unidades_por_caja > 0 ? (
                            <span className="font-medium">{item.cajas} <span className="text-xs text-muted-foreground">({item.unidades_por_caja} un.)</span></span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
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
    const canReceive = detailPedido.estado === "Borrador" || detailPedido.estado === "Enviado" || isParcial;
    const canEdit = detailPedido.estado === "Borrador";
    const canDelete = detailPedido.estado === "Borrador" || detailPedido.estado === "Enviado";
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
              {new Date(detailPedido.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}
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
            <Button size="sm" variant="outline" onClick={() => {
              const provNombre = detailPedido.proveedores?.nombre || "Proveedor";
              const lines = detailItems.map((i) => `• ${i.cantidad} - ${i.descripcion || "Producto"}`);
              const text = `Hola ${provNombre}, te paso el pedido:\n\n${lines.join("\n")}\n\nGracias!`;
              navigator.clipboard.writeText(text);
              showAdminToast("Pedido copiado al portapapeles", "success");
            }}>
              <Copy className="w-4 h-4 mr-1.5" />Copiar
            </Button>
            <Button size="sm" variant="outline" className="text-green-600 border-green-200 hover:bg-green-50" onClick={() => {
              const provNombre = detailPedido.proveedores?.nombre || "Proveedor";
              const lines = detailItems.map((i) => `• ${i.cantidad} - ${i.descripcion || "Producto"}`);
              const text = `Hola ${provNombre}, te paso el pedido:\n\n${lines.join("\n")}\n\nGracias!`;
              window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
            }}>
              <MessageCircle className="w-4 h-4 mr-1.5" />WhatsApp
            </Button>
            {canReceive && (
              <Button size="sm" onClick={() => {
                // Save pedido data to localStorage for compras page to pick up
                const pedidoData = {
                  pedido_id: detailPedido.id,
                  pedido_numero: detailPedido.id.slice(0, 8).toUpperCase(),
                  proveedor_id: detailPedido.proveedor_id,
                  observacion: detailPedido.observacion || "",
                  items: detailItems.map((item) => ({
                    producto_id: item.producto_id,
                    codigo: item.codigo,
                    descripcion: item.descripcion,
                    cantidad: item.cantidad - (item.cantidad_recibida || 0),
                    precio_unitario: item.precio_unitario,
                  })).filter((i) => i.cantidad > 0),
                };
                localStorage.setItem("pedido_to_compra", JSON.stringify(pedidoData));
                window.location.href = "/admin/compras";
              }}>
                <Package className="w-4 h-4 mr-1.5" />Registrar compra
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
            <p className="text-sm font-semibold mt-0.5">{new Date(detailPedido.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}</p>
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
                          <th className="text-center py-2 px-3 font-medium text-xs">Cajas</th>
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
                            <td className="py-2 px-3 text-center text-sm text-muted-foreground">
                              {item.unidades_por_caja > 0 ? (
                                <span className="font-medium">{item.cajas} <span className="text-xs">({item.unidades_por_caja} un.)</span></span>
                              ) : "—"}
                            </td>
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
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border overflow-hidden text-sm">
            <button className={`px-3 py-2 ${pedirHasta === "maximo" ? "bg-primary text-white" : "bg-white hover:bg-gray-50"}`} onClick={() => setPedirHasta("maximo")}>Hasta máx</button>
            <button className={`px-3 py-2 ${pedirHasta === "minimo" ? "bg-primary text-white" : "bg-white hover:bg-gray-50"}`} onClick={() => setPedirHasta("minimo")}>Hasta mín</button>
          </div>
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
                          {new Date(p.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}
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
                            {(p.estado === "Borrador" || p.estado === "Enviado") && (
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
