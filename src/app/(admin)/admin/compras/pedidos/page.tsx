"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
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
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Plus,
  Search,
  Eye,
  Receipt,
  DollarSign,
  Loader2,
  ClipboardList,
  Sparkles,
  Trash2,
  Save,
  Send,
  Package,
  ArrowLeft,
} from "lucide-react";

/* ───────── types ───────── */

interface Proveedor {
  id: string;
  nombre: string;
}

interface Categoria {
  id: string;
  nombre: string;
}

interface PedidoRow {
  id: string;
  numero?: string;
  proveedor_id: string | null;
  fecha: string;
  estado: string;
  costo_total_estimado: number;
  observacion: string | null;
  proveedores: { nombre: string } | null;
}

interface PedidoItemRow {
  id: string;
  pedido_id: string;
  producto_id: string;
  codigo: string;
  descripcion: string;
  cantidad: number;
  faltante: number;
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

function estadoBadgeVariant(estado: string): "default" | "secondary" | "destructive" | "outline" {
  switch (estado) {
    case "Borrador":
      return "secondary";
    case "Enviado":
      return "default";
    case "Recibido":
      return "outline";
    default:
      return "secondary";
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
  const [pedFilterMode, setPedFilterMode] = useState<"day" | "month" | "range" | "all">("all");
  const [pedFilterDay, setPedFilterDay] = useState(new Date().toISOString().split("T")[0]);
  const [pedFilterMonth, setPedFilterMonth] = useState(String(new Date().getMonth() + 1));
  const [pedFilterYear, setPedFilterYear] = useState(String(new Date().getFullYear()));
  const [pedFilterFrom, setPedFilterFrom] = useState(new Date().toISOString().split("T")[0]);
  const [pedFilterTo, setPedFilterTo] = useState(new Date().toISOString().split("T")[0]);

  // New / edit pedido state
  const [mode, setMode] = useState<"list" | "new" | "detail" | "generate">("list");
  const [selectedProveedorId, setSelectedProveedorId] = useState("");
  const [selectedCategoriaId, setSelectedCategoriaId] = useState("all");
  const [items, setItems] = useState<SuggestedItem[]>([]);
  const [observacion, setObservacion] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  // Detail / edit existing
  const [detailPedido, setDetailPedido] = useState<PedidoRow | null>(null);
  const [detailItems, setDetailItems] = useState<PedidoItemRow[]>([]);

  // Auto-generate state
  const [generating, setGenerating] = useState(false);
  const [generatedGroups, setGeneratedGroups] = useState<{
    proveedor_id: string;
    proveedor_nombre: string;
    items: SuggestedItem[];
    total: number;
    selected: boolean;
  }[]>([]);

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
      supabase.from("proveedores").select("id, nombre").eq("activo", true).order("nombre"),
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

      // Merge with existing items (don't duplicate)
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

  /* ── save pedido ── */

  const savePedido = async (estado: "Borrador" | "Enviado") => {
    if (!selectedProveedorId || items.length === 0) return;
    setSaving(true);
    setSaveError("");

    try {
      const { data: numData, error: numError } = await supabase.rpc("next_numero", { p_tipo: "pedido" });
      if (numError) console.warn("next_numero error:", numError);
      const numero = numData || "PED-0000";

      const { data: pedido, error } = await supabase
        .from("pedidos_proveedor")
        .insert({
          numero,
          proveedor_id: selectedProveedorId,
          fecha: new Date().toISOString().split("T")[0],
          estado,
          costo_total_estimado: totalEstimado,
          observacion: observacion || null,
        })
        .select("id")
        .single();

      if (error || !pedido) {
        console.error("Error saving pedido:", error);
        setSaveError(error?.message || "Error al guardar el pedido. Verifica que la tabla pedidos_proveedor exista en la base de datos.");
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
        precio_unitario: item.precio_unitario,
        subtotal: item.subtotal,
      }));

      const { error: itemsError } = await supabase.from("pedido_proveedor_items").insert(rows);
      if (itemsError) {
        console.error("Error saving pedido items:", itemsError);
      }

      resetForm();
      setMode("list");
      await fetchData();
      setSuccessMsg(
        estado === "Borrador"
          ? `Borrador ${numero} guardado correctamente`
          : `Pedido ${numero} confirmado correctamente`
      );
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err: any) {
      console.error("Error saving pedido:", err);
      setSaveError(err?.message || "Error inesperado al guardar el pedido.");
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

  /* ── open detail ── */

  const openDetail = async (pedido: PedidoRow) => {
    setDetailPedido(pedido);
    const { data } = await supabase
      .from("pedido_proveedor_items")
      .select("*")
      .eq("pedido_id", pedido.id)
      .order("created_at");
    setDetailItems((data as PedidoItemRow[]) || []);
    setMode("detail");
  };

  // Receive dialog state
  const [showReceiveDialog, setShowReceiveDialog] = useState(false);
  const [receiveSaving, setReceiveSaving] = useState(false);
  const [receiveError, setReceiveError] = useState("");
  const [receiveFormaPago, setReceiveFormaPago] = useState("Transferencia");
  const [receiveRegistrarCaja, setReceiveRegistrarCaja] = useState(true);
  const [receiveActualizarPrecios, setReceiveActualizarPrecios] = useState(true);

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

  /* ── receive pedido → create compra + update stock ── */

  const handleRecibirPedido = async () => {
    if (!detailPedido || detailItems.length === 0) return;
    setReceiveSaving(true);
    setReceiveError("");

    try {
      // 1. Get next compra number
      const { data: numData } = await supabase.rpc("next_numero", { p_tipo: "compra" });
      const numero = numData || "C-0000";
      const fecha = new Date().toISOString().split("T")[0];

      const total = detailItems.reduce((a, i) => a + i.subtotal, 0);

      // 2. Create compra
      const { data: compra, error: compraError } = await supabase
        .from("compras")
        .insert({
          numero,
          fecha,
          proveedor_id: detailPedido.proveedor_id,
          total,
          estado: "Confirmada",
          observacion: `Recepcion de pedido ${detailPedido.numero || ""}`,
        })
        .select("id")
        .single();

      if (compraError || !compra) {
        setReceiveError(compraError?.message || "Error al crear la compra");
        setReceiveSaving(false);
        return;
      }

      // 3. Create compra items
      const compraItems = detailItems.map((item) => ({
        compra_id: compra.id,
        producto_id: item.producto_id,
        codigo: item.codigo,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        subtotal: item.subtotal,
      }));
      await supabase.from("compra_items").insert(compraItems);

      // 4. Update stock for each product
      for (const item of detailItems) {
        if (!item.producto_id) continue;

        const { data: prodData } = await supabase
          .from("productos")
          .select("stock, costo, precio")
          .eq("id", item.producto_id)
          .single();

        const stockAntes = prodData?.stock ?? 0;
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
          cantidad_despues: newStock,
          cantidad: item.cantidad,
          referencia: `Compra #${numero} (Pedido ${detailPedido.numero || ""})`,
          descripcion: `Recepcion - ${item.descripcion}`,
          usuario: "Admin Sistema",
          orden_id: compra.id,
        });

        // Update cost and optionally price
        if (receiveActualizarPrecios && item.precio_unitario > 0) {
          const costoAnterior = prodData?.costo ?? 0;
          if (costoAnterior > 0 && item.precio_unitario !== costoAnterior) {
            const precioAnterior = prodData?.precio ?? 0;
            const marginRatio = precioAnterior > 0 ? precioAnterior / costoAnterior : 1;
            const newPrecio = Math.round(item.precio_unitario * marginRatio);
            await supabase
              .from("productos")
              .update({
                costo: item.precio_unitario,
                precio: newPrecio,
                fecha_actualizacion: fecha,
              })
              .eq("id", item.producto_id);
          } else {
            await supabase
              .from("productos")
              .update({ costo: item.precio_unitario, fecha_actualizacion: fecha })
              .eq("id", item.producto_id);
          }
        }
      }

      // 5. Register caja movement
      if (total > 0 && receiveRegistrarCaja && receiveFormaPago !== "Cuenta Corriente") {
        const provNombre = detailPedido.proveedores?.nombre || "Proveedor";
        await supabase.from("caja_movimientos").insert({
          fecha,
          hora: new Date().toTimeString().split(" ")[0],
          tipo: "egreso",
          descripcion: `Compra ${numero} - ${provNombre} (Pedido ${detailPedido.numero || ""})`,
          metodo_pago: receiveFormaPago,
          monto: -total,
        });
      }

      // 6. If cuenta corriente, update proveedor saldo
      if (receiveFormaPago === "Cuenta Corriente" && detailPedido.proveedor_id) {
        const { data: provData } = await supabase
          .from("proveedores")
          .select("saldo")
          .eq("id", detailPedido.proveedor_id)
          .single();
        const saldoActual = provData?.saldo ?? 0;
        await supabase
          .from("proveedores")
          .update({ saldo: saldoActual + total })
          .eq("id", detailPedido.proveedor_id);
      }

      // 7. Mark pedido as Recibido
      await supabase
        .from("pedidos_proveedor")
        .update({ estado: "Recibido" })
        .eq("id", detailPedido.id);

      setDetailPedido({ ...detailPedido, estado: "Recibido" });
      setShowReceiveDialog(false);
      setReceiveSaving(false);
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
        const maximo = p.stock_maximo ?? 0;

        // Include products with stock below minimum OR negative stock
        if (stock >= minimo && stock >= 0) continue;
        const ppList = p.producto_proveedores || [];
        if (ppList.length === 0) continue;

        // Prefer principal provider, otherwise use first
        const sorted = [...ppList].sort((a: any, b: any) => (b.es_principal ? 1 : 0) - (a.es_principal ? 1 : 0));
        const pp = sorted[0];

        const provId = pp.proveedor_id;
        const provName = pp.proveedores?.nombre || "Sin nombre";
        if (!groupMap[provId]) groupMap[provId] = { proveedor_nombre: provName, items: [] };
        if (groupMap[provId].items.some((i: SuggestedItem) => i.producto_id === p.id)) continue;

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
      const { data: numData } = await supabase.rpc("next_numero", { p_tipo: "pedido" });
      const numero = numData || "PED-0000";

      const { data: pedido, error } = await supabase
        .from("pedidos_proveedor")
        .insert({
          numero,
          proveedor_id: group.proveedor_id,
          fecha: new Date().toISOString().split("T")[0],
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

  /* ── stats ── */

  const totalPedidos = pedidos.length;
  const pendientes = pedidos.filter((p) => p.estado === "Borrador" || p.estado === "Enviado").length;
  const costoTotal = pedidos.reduce((a, p) => a + (p.costo_total_estimado || 0), 0);

  const filtered = pedidos.filter((p) => {
    const matchSearch =
      (p.numero || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.proveedores?.nombre || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchEstado = filterEstado === "all" || p.estado === filterEstado;
    return matchSearch && matchEstado;
  });

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

        {/* Provider & category selection */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Proveedor</Label>
                <Select value={selectedProveedorId} onValueChange={(v) => setSelectedProveedorId(v || "")}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar proveedor" /></SelectTrigger>
                  <SelectContent>
                    {proveedores.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Categoría (opcional)</Label>
                <Select value={selectedCategoriaId} onValueChange={(v) => setSelectedCategoriaId(v || "all")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {categorias.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleSugerirFaltantes}
                disabled={!selectedProveedorId || suggesting}
              >
                {suggesting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 mr-2" />
                )}
                Sugerir faltantes
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Items table */}
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
                      <th className="text-left py-3 px-4 font-medium">Código</th>
                      <th className="text-left py-3 px-4 font-medium">Producto</th>
                      <th className="text-center py-3 px-4 font-medium">Stock</th>
                      <th className="text-center py-3 px-4 font-medium">Mín</th>
                      <th className="text-center py-3 px-4 font-medium">Máx</th>
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
                          <Input
                            type="number"
                            min={1}
                            value={item.faltante}
                            onChange={(e) => updateItemField(idx, "faltante", Math.max(1, Number(e.target.value)))}
                            className="w-20 mx-auto text-center h-8"
                          />
                        </td>
                        <td className="py-2 px-4 text-right">
                          <Input
                            type="number"
                            min={0}
                            value={item.precio_unitario}
                            onChange={(e) => updateItemField(idx, "precio_unitario", Math.max(0, Number(e.target.value)))}
                            className="w-28 ml-auto text-right h-8"
                          />
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

        {/* Observations + actions */}
        {items.length > 0 && (
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Observaciones</Label>
                <Input
                  value={observacion}
                  onChange={(e) => setObservacion(e.target.value)}
                  placeholder="Notas adicionales para el pedido..."
                />
              </div>
              {saveError && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700">{saveError}</div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { resetForm(); setSaveError(""); setMode("list"); }}>
                  Cancelar
                </Button>
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
    return (
      <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => { setMode("list"); setDetailPedido(null); }}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
                Pedido {detailPedido.numero || ""}
              </h1>
              <Badge variant={estadoBadgeVariant(detailPedido.estado)} className="text-xs">
                {detailPedido.estado}
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm">
              {detailPedido.proveedores?.nombre || "Sin proveedor"} &middot;{" "}
              {new Date(detailPedido.fecha).toLocaleDateString("es-AR")}
            </p>
          </div>
        </div>

        {/* Status actions */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Proveedor:</span>{" "}
                  <span className="font-medium ml-1">{detailPedido.proveedores?.nombre || "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Fecha:</span>{" "}
                  <span className="font-medium ml-1">{new Date(detailPedido.fecha).toLocaleDateString("es-AR")}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Total estimado:</span>{" "}
                  <span className="font-medium ml-1">{formatCurrency(detailPedido.costo_total_estimado || 0)}</span>
                </div>
              </div>
              <div className="flex gap-2">
                {detailPedido.estado === "Borrador" && (
                  <Button size="sm" onClick={() => changeEstado("Enviado")}>
                    <Send className="w-4 h-4 mr-2" />Marcar Enviado
                  </Button>
                )}
                {detailPedido.estado === "Enviado" && (
                  <Button size="sm" onClick={() => setShowReceiveDialog(true)}>
                    <Package className="w-4 h-4 mr-2" />Recibir Mercaderia
                  </Button>
                )}
              </div>
            </div>
            {detailPedido.observacion && (
              <p className="text-sm text-muted-foreground mt-3 border-t pt-3">{detailPedido.observacion}</p>
            )}
          </CardContent>
        </Card>

        {/* Items */}
        <Card>
          <CardContent className="pt-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-3 px-4 font-medium">Código</th>
                    <th className="text-left py-3 px-4 font-medium">Descripción</th>
                    <th className="text-center py-3 px-4 font-medium">Cantidad</th>
                    <th className="text-right py-3 px-4 font-medium">Precio Unit.</th>
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
                <span className="text-sm font-bold">{formatCurrency(detailPedido.costo_total_estimado || 0)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Receive Pedido Dialog */}
        <Dialog open={showReceiveDialog} onOpenChange={setShowReceiveDialog}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Recibir Mercaderia</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Se creara una <strong>compra</strong> con los items del pedido, se actualizara el <strong>stock</strong> y los <strong>costos</strong> de cada producto.
              </p>

              {/* Summary */}
              <div className="rounded-lg border p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Proveedor</span>
                  <span className="font-medium">{detailPedido.proveedores?.nombre || "Sin proveedor"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pedido</span>
                  <span className="font-medium">{detailPedido.numero || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Productos</span>
                  <span className="font-medium">{detailItems.length} items ({detailItems.reduce((a, i) => a + i.cantidad, 0)} unidades)</span>
                </div>
                <div className="flex justify-between border-t pt-2 mt-2">
                  <span className="text-muted-foreground font-medium">Total</span>
                  <span className="font-bold text-lg">{formatCurrency(detailPedido.costo_total_estimado || 0)}</span>
                </div>
              </div>

              {/* Options */}
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Forma de pago</Label>
                  <Select value={receiveFormaPago} onValueChange={(v) => setReceiveFormaPago(v ?? "")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Efectivo">Efectivo</SelectItem>
                      <SelectItem value="Transferencia">Transferencia</SelectItem>
                      <SelectItem value="Cheque">Cheque</SelectItem>
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
              </div>

              {receiveError && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                  {receiveError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => { setShowReceiveDialog(false); setReceiveError(""); }}>
                  Cancelar
                </Button>
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
                {generatedGroups.length} proveedor(es) con productos faltantes - Total estimado: <span className="font-bold text-foreground">{formatCurrency(selectedTotal)}</span>
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setGeneratedGroups([]); setMode("list"); }}>
                  Cancelar
                </Button>
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
                      <input
                        type="checkbox"
                        checked={group.selected}
                        onChange={() => toggleGroupSelected(gIdx)}
                        className="w-4 h-4 rounded border-border"
                      />
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

      {/* Success message */}
      {successMsg && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
          {successMsg}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total pedidos</p>
              <p className="text-xl font-bold">{totalPedidos}</p>
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
              <p className="text-xl font-bold">{pendientes}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Costo total estimado</p>
              <p className="text-xl font-bold">{formatCurrency(costoTotal)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap items-end">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar pedido o proveedor..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
        </div>
        <Tabs value={filterEstado} onValueChange={setFilterEstado}>
          <TabsList>
            <TabsTrigger value="all">Todos</TabsTrigger>
            <TabsTrigger value="Borrador">Borrador</TabsTrigger>
            <TabsTrigger value="Enviado">Enviado</TabsTrigger>
            <TabsTrigger value="Recibido">Recibido</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-end gap-2">
          <Select value={pedFilterMode} onValueChange={(v) => setPedFilterMode((v ?? "all") as "day" | "month" | "range" | "all")}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="day">Día</SelectItem>
              <SelectItem value="month">Mensual</SelectItem>
              <SelectItem value="range">Entre fechas</SelectItem>
            </SelectContent>
          </Select>
          {pedFilterMode === "day" && (
            <Input type="date" value={pedFilterDay} onChange={(e) => setPedFilterDay(e.target.value)} className="w-40" />
          )}
          {pedFilterMode === "month" && (
            <>
              <Select value={pedFilterMonth} onValueChange={(v) => setPedFilterMonth(v ?? "1")}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"].map((m, i) => (
                    <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input type="number" value={pedFilterYear} onChange={(e) => setPedFilterYear(e.target.value)} className="w-20" />
            </>
          )}
          {pedFilterMode === "range" && (
            <>
              <div className="flex items-center gap-1">
                <Label className="text-xs text-muted-foreground">Desde</Label>
                <Input type="date" value={pedFilterFrom} onChange={(e) => setPedFilterFrom(e.target.value)} className="w-40" />
              </div>
              <div className="flex items-center gap-1">
                <Label className="text-xs text-muted-foreground">Hasta</Label>
                <Input type="date" value={pedFilterTo} onChange={(e) => setPedFilterTo(e.target.value)} className="w-40" />
              </div>
            </>
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
                    <th className="text-left py-3 px-4 font-medium">N°</th>
                    <th className="text-left py-3 px-4 font-medium">Fecha</th>
                    <th className="text-left py-3 px-4 font-medium">Proveedor</th>
                    <th className="text-right py-3 px-4 font-medium">Total estimado</th>
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
                      <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{p.numero || "—"}</td>
                      <td className="py-3 px-4 text-muted-foreground">{new Date(p.fecha).toLocaleDateString("es-AR")}</td>
                      <td className="py-3 px-4 font-medium">{p.proveedores?.nombre || "—"}</td>
                      <td className="py-3 px-4 text-right font-semibold">{formatCurrency(p.costo_total_estimado || 0)}</td>
                      <td className="py-3 px-4 text-center">
                        <Badge variant={estadoBadgeVariant(p.estado)} className="text-xs font-normal">
                          {p.estado}
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
