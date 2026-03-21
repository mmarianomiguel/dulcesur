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
  Search,
  Loader2,
  Eye,
  Truck,
  Store,
  ShoppingCart,
  Package,
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Clock,
  Plus,
  X,
  Trash2,
  Save,
  CheckCircle,
  AlertTriangle,
  Globe,
} from "lucide-react";

interface PedidoItem {
  id?: number;
  pedido_id?: number;
  producto_id: string;
  nombre: string;
  presentacion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  unidades_por_presentacion: number;
}

interface Pedido {
  id: number;
  numero: string;
  created_at: string;
  estado: string;
  nombre_cliente: string;
  email: string;
  telefono: string;
  metodo_entrega: string;
  direccion_texto: string | null;
  fecha_entrega: string | null;
  metodo_pago: string;
  subtotal: number;
  costo_envio: number;
  total: number;
  observacion: string | null;
  cliente_auth_id: string | null;
  items: PedidoItem[];
}

interface ProductoSearch {
  id: string;
  codigo: string;
  nombre: string;
  precio: number;
  unidad_medida?: string;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(value);

const estadoBadge: Record<string, { bg: string; text: string; label: string }> = {
  pendiente: { bg: "bg-amber-50 border-amber-200", text: "text-amber-700", label: "Pendiente" },
  armado: { bg: "bg-violet-50 border-violet-200", text: "text-violet-700", label: "Armado" },
  confirmado: { bg: "bg-blue-50 border-blue-200", text: "text-blue-700", label: "Confirmado" },
  entregado: { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", label: "Entregado" },
  cancelado: { bg: "bg-red-50 border-red-200", text: "text-red-700", label: "Cancelado" },
};

export default function PedidosOnlinePage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterEstado, setFilterEstado] = useState("todos");
  const [filterEntrega, setFilterEntrega] = useState("todos");
  const [search, setSearch] = useState("");

  // Detail/Edit dialog
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedPedido, setSelectedPedido] = useState<Pedido | null>(null);
  const [editItems, setEditItems] = useState<PedidoItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Add product search
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<ProductoSearch[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);

  // Compute unidades_por_presentacion from presentation name
  const getUPP = (presentacion: string): number => {
    const lower = (presentacion || "").toLowerCase();
    if (lower.includes("medio")) return 0.5;
    const boxMatch = presentacion.match(/[Cc]aja\s*\(?x?(\d+)\)?/);
    if (boxMatch) return Number(boxMatch[1]);
    return 1;
  };

  const fetchPedidos = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("pedidos_tienda")
      .select("*")
      .order("created_at", { ascending: false });

    if (!data) { setLoading(false); return; }

    // Fetch items for all pedidos
    const ids = data.map((p: any) => p.id);
    const { data: allItems } = await supabase
      .from("pedido_tienda_items")
      .select("*")
      .in("pedido_id", ids);

    // Also fetch venta_items to get unidades_por_presentacion
    const numeros = data.map((p: any) => p.numero);
    const { data: ventas } = await supabase
      .from("ventas")
      .select("id, numero")
      .in("numero", numeros);
    const ventaIdMap: Record<string, string> = {};
    for (const v of ventas || []) ventaIdMap[v.numero] = v.id;
    const ventaIds = Object.values(ventaIdMap);

    let uppByProducto: Record<string, number> = {};
    if (ventaIds.length > 0) {
      const { data: vitems } = await supabase
        .from("venta_items")
        .select("producto_id, presentacion, unidades_por_presentacion")
        .in("venta_id", ventaIds);
      for (const vi of vitems || []) {
        if (vi.producto_id && vi.unidades_por_presentacion) {
          const key = `${vi.producto_id}_${vi.presentacion || ""}`;
          uppByProducto[key] = vi.unidades_por_presentacion;
        }
      }
    }

    const itemsByPedido: Record<number, PedidoItem[]> = {};
    (allItems || []).forEach((item: any) => {
      if (!itemsByPedido[item.pedido_id]) itemsByPedido[item.pedido_id] = [];
      // Try to get UPP from venta_items, fallback to computing from presentation name
      const key = `${item.producto_id}_${item.presentacion || ""}`;
      const upp = uppByProducto[key] || getUPP(item.presentacion || "");
      itemsByPedido[item.pedido_id].push({ ...item, unidades_por_presentacion: upp });
    });

    setPedidos(data.map((p: any) => ({ ...p, items: itemsByPedido[p.id] || [] })));
    setLoading(false);
  }, []);

  useEffect(() => { fetchPedidos(); }, [fetchPedidos]);

  // Filter pedidos
  const filtered = pedidos.filter((p) => {
    if (filterEstado !== "todos" && p.estado !== filterEstado) return false;
    if (filterEntrega !== "todos" && p.metodo_entrega !== filterEntrega) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!p.numero.toLowerCase().includes(q) && !p.nombre_cliente.toLowerCase().includes(q) && !p.email?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Open detail
  const openDetail = (pedido: Pedido) => {
    setSelectedPedido(pedido);
    setEditItems(pedido.items.map((i) => ({ ...i })));
    setHasChanges(false);
    setDetailOpen(true);
  };

  // Update item quantity
  const updateItemQty = (index: number, qty: number) => {
    if (qty <= 0) return;
    setEditItems((prev) => prev.map((item, i) =>
      i === index ? { ...item, cantidad: qty, subtotal: qty * item.precio_unitario } : item
    ));
    setHasChanges(true);
  };

  // Remove item
  const removeItem = (index: number) => {
    if (editItems.length <= 1) return; // Don't allow empty pedido
    setEditItems((prev) => prev.filter((_, i) => i !== index));
    setHasChanges(true);
  };

  // Search products to add
  const searchProducts = async (query: string) => {
    setProductSearch(query);
    if (query.length < 2) { setProductResults([]); return; }
    setSearchingProducts(true);
    const { data } = await supabase
      .from("productos")
      .select("id, codigo, nombre, precio, unidad_medida")
      .eq("activo", true)
      .or(`nombre.ilike.%${query}%,codigo.ilike.%${query}%`)
      .limit(10);
    setProductResults((data || []) as ProductoSearch[]);
    setSearchingProducts(false);
  };

  // Add product to pedido
  const addProduct = (product: ProductoSearch) => {
    // Check if already exists
    const existing = editItems.findIndex((i) => i.producto_id === product.id);
    if (existing >= 0) {
      updateItemQty(existing, editItems[existing].cantidad + 1);
    } else {
      setEditItems((prev) => [...prev, {
        producto_id: product.id,
        nombre: product.nombre,
        presentacion: product.unidad_medida || "Unidad",
        cantidad: 1,
        precio_unitario: product.precio,
        subtotal: product.precio,
        unidades_por_presentacion: 1,
      }]);
      setHasChanges(true);
    }
    setAddProductOpen(false);
    setProductSearch("");
    setProductResults([]);
  };

  // Save changes
  const handleSave = async () => {
    if (!selectedPedido) return;
    setSaving(true);
    const errores: string[] = [];

    try {
      const originalItems = selectedPedido.items;

      // Calculate stock differences per product (in UNITS, accounting for unidades_por_presentacion)
      const stockDiffs: Record<string, number> = {};
      for (const orig of originalItems) {
        const upp = orig.unidades_por_presentacion || 1;
        stockDiffs[orig.producto_id] = (stockDiffs[orig.producto_id] || 0) + (orig.cantidad * upp);
      }
      for (const item of editItems) {
        const upp = item.unidades_por_presentacion || 1;
        stockDiffs[item.producto_id] = (stockDiffs[item.producto_id] || 0) - (item.cantidad * upp);
      }
      // stockDiffs > 0 means units freed → return stock
      // stockDiffs < 0 means units consumed → decrement stock

      // Apply stock adjustments
      for (const [productoId, diff] of Object.entries(stockDiffs)) {
        if (Math.abs(diff) < 0.001) continue;
        const { data: prod, error: prodErr } = await supabase.from("productos").select("stock").eq("id", productoId).single();
        if (prodErr || !prod) { errores.push(`Producto ${productoId} no encontrado`); continue; }
        const stockAntes = prod.stock;
        const stockDespues = stockAntes + diff;
        const { error: updErr } = await supabase.from("productos").update({ stock: stockDespues }).eq("id", productoId);
        if (updErr) { errores.push(`Error stock: ${updErr.message}`); continue; }
        await supabase.from("stock_movimientos").insert({
          producto_id: productoId,
          tipo: diff > 0 ? "Ajuste" : "Venta",
          cantidad: diff,
          cantidad_antes: stockAntes,
          cantidad_despues: stockDespues,
          referencia: `Edición Pedido Web #${selectedPedido.numero}`,
          descripcion: diff > 0 ? "Devolución por edición de pedido" : "Agregado por edición de pedido",
          usuario: "Admin Sistema",
        });
      }

      // Delete existing items
      const { error: delErr } = await supabase.from("pedido_tienda_items").delete().eq("pedido_id", selectedPedido.id);
      if (delErr) throw new Error(`Error eliminando items: ${delErr.message}`);

      // Insert updated items
      const newItems = editItems.map((item) => ({
        pedido_id: selectedPedido.id,
        producto_id: item.producto_id,
        nombre: item.nombre,
        presentacion: item.presentacion,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        subtotal: item.precio_unitario * item.cantidad,
      }));

      const { error: insErr } = await supabase.from("pedido_tienda_items").insert(newItems);
      if (insErr) throw new Error(`Error insertando items: ${insErr.message}`);

      // Update pedido total
      const nuevoSubtotal = editItems.reduce((sum, i) => sum + i.precio_unitario * i.cantidad, 0);
      const nuevoTotal = nuevoSubtotal + (selectedPedido.costo_envio || 0);

      const { error: pedErr } = await supabase.from("pedidos_tienda").update({
        subtotal: nuevoSubtotal,
        total: nuevoTotal,
      }).eq("id", selectedPedido.id);
      if (pedErr) throw new Error(`Error actualizando pedido: ${pedErr.message}`);

      // Sync linked venta + venta_items + caja + CC
      const { data: venta } = await supabase
        .from("ventas")
        .select("id, total, cliente_id, forma_pago")
        .eq("numero", selectedPedido.numero)
        .maybeSingle();

      if (venta) {
        const totalAnterior = venta.total || 0;
        const diferencia = nuevoTotal - totalAnterior;

        const { error: ventaErr } = await supabase.from("ventas").update({
          subtotal: nuevoSubtotal,
          total: nuevoTotal,
        }).eq("id", venta.id);
        if (ventaErr) errores.push(`Error sync venta: ${ventaErr.message}`);

        await supabase.from("venta_items").delete().eq("venta_id", venta.id);
        const { error: viErr } = await supabase.from("venta_items").insert(
          editItems.map((item) => ({
            venta_id: venta.id,
            producto_id: item.producto_id,
            descripcion: `${item.nombre} (${item.presentacion})`,
            cantidad: item.cantidad,
            precio_unitario: item.precio_unitario,
            subtotal: item.precio_unitario * item.cantidad,
            unidad_medida: "Un",
            presentacion: item.presentacion,
            unidades_por_presentacion: item.unidades_por_presentacion || 1,
          }))
        );
        if (viErr) errores.push(`Error sync venta_items: ${viErr.message}`);

        // Adjust caja + CC if total changed
        if (Math.abs(diferencia) > 0.01) {
          const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
          const hora = new Date().toTimeString().split(" ")[0];

          const { data: cajaRows } = await supabase
            .from("caja_movimientos")
            .select("metodo_pago, cuenta_bancaria")
            .eq("referencia_id", venta.id)
            .eq("referencia_tipo", "venta")
            .limit(1);
          const metodoPago = cajaRows?.[0]?.metodo_pago || venta.forma_pago || "Efectivo";
          const cuentaBancaria = cajaRows?.[0]?.cuenta_bancaria || null;

          const { error: cajaErr } = await supabase.from("caja_movimientos").insert({
            fecha: hoy, hora,
            tipo: diferencia > 0 ? "ingreso" : "egreso",
            descripcion: `Ajuste por edición Pedido Web #${selectedPedido.numero} (${diferencia > 0 ? "+" : ""}${formatCurrency(diferencia)})`,
            metodo_pago: metodoPago,
            monto: Math.abs(diferencia),
            referencia_id: venta.id,
            referencia_tipo: diferencia > 0 ? "venta" : "ajuste_edicion",
            cuenta_bancaria: cuentaBancaria,
          });
          if (cajaErr) errores.push(`Error caja: ${cajaErr.message}`);

          if (venta.cliente_id) {
            const { data: ccRows } = await supabase
              .from("cuenta_corriente")
              .select("id")
              .eq("venta_id", venta.id)
              .limit(1);
            if (ccRows && ccRows.length > 0) {
              const { data: clienteData } = await supabase.from("clientes").select("saldo").eq("id", venta.cliente_id).single();
              const saldoActual = clienteData?.saldo || 0;
              const nuevoSaldo = saldoActual + diferencia;
              await supabase.from("cuenta_corriente").insert({
                cliente_id: venta.cliente_id,
                fecha: hoy,
                comprobante: `Edición Pedido Web #${selectedPedido.numero}`,
                descripcion: `Ajuste por edición de pedido`,
                debe: diferencia > 0 ? diferencia : 0,
                haber: diferencia < 0 ? Math.abs(diferencia) : 0,
                saldo: nuevoSaldo,
                forma_pago: "Ajuste",
                venta_id: venta.id,
              });
              await supabase.from("clientes").update({ saldo: nuevoSaldo }).eq("id", venta.cliente_id);
            }
          }
        }
      }

      if (errores.length > 0) {
        alert("Guardado con advertencias:\n" + errores.join("\n"));
      }
      setHasChanges(false);
      fetchPedidos();
      setDetailOpen(false);
    } catch (err: any) {
      alert("Error al guardar: " + (err.message || "Error desconocido"));
    } finally {
      setSaving(false);
    }
  };

  // Update estado — sync to linked venta, return stock on cancel
  const handleEstadoChange = async (pedido: Pedido, nuevoEstado: string) => {
    const estadoAnterior = pedido.estado;

    await supabase.from("pedidos_tienda").update({ estado: nuevoEstado }).eq("id", pedido.id);

    // Sync estado to linked venta (ventas uses "anulada" instead of "cancelado")
    const ventaEstado = nuevoEstado === "cancelado" ? "anulada" : nuevoEstado;
    const ventaUpdate: Record<string, unknown> = { estado: ventaEstado };
    if (nuevoEstado === "entregado") ventaUpdate.entregado = true;
    if (nuevoEstado === "cancelado") {
      ventaUpdate.entregado = false;
      ventaUpdate.observacion = `ANULADA (Cancelación desde Pedidos Online)`;
    }
    await supabase.from("ventas").update(ventaUpdate).eq("numero", pedido.numero);

    // Return stock when cancelling (only if wasn't already cancelled)
    if (nuevoEstado === "cancelado" && estadoAnterior !== "cancelado") {
      for (const item of pedido.items) {
        if (!item.producto_id) continue;
        const upp = item.unidades_por_presentacion || 1;
        const unitsToRestore = item.cantidad * upp;
        const { data: prod } = await supabase.from("productos").select("stock").eq("id", item.producto_id).single();
        if (!prod) continue;
        const stockAntes = prod.stock;
        const stockDespues = stockAntes + unitsToRestore;
        await supabase.from("productos").update({ stock: stockDespues }).eq("id", item.producto_id);
        await supabase.from("stock_movimientos").insert({
          producto_id: item.producto_id,
          tipo: "anulacion",
          cantidad: unitsToRestore,
          cantidad_antes: stockAntes,
          cantidad_despues: stockDespues,
          referencia: `Cancelación Pedido Web #${pedido.numero}`,
          descripcion: `Devolución stock - ${item.nombre} (${item.presentacion})`,
          usuario: "Admin Sistema",
        });
      }
    }

    // Re-decrement stock if un-cancelling (restoring a previously cancelled pedido)
    if (estadoAnterior === "cancelado" && nuevoEstado !== "cancelado") {
      for (const item of pedido.items) {
        if (!item.producto_id) continue;
        const upp = item.unidades_por_presentacion || 1;
        const unitsToDecrement = item.cantidad * upp;
        const { data: prod } = await supabase.from("productos").select("stock").eq("id", item.producto_id).single();
        if (!prod) continue;
        const stockAntes = prod.stock;
        const stockDespues = stockAntes - unitsToDecrement;
        await supabase.from("productos").update({ stock: stockDespues }).eq("id", item.producto_id);
        await supabase.from("stock_movimientos").insert({
          producto_id: item.producto_id,
          tipo: "Venta",
          cantidad: -unitsToDecrement,
          cantidad_antes: stockAntes,
          cantidad_despues: stockDespues,
          referencia: `Reactivación Pedido Web #${pedido.numero}`,
          descripcion: `Descuento stock - ${item.nombre} (${item.presentacion})`,
          usuario: "Admin Sistema",
        });
      }
    }

    fetchPedidos();
  };

  // Stats
  const pendientes = pedidos.filter((p) => p.estado === "pendiente").length;
  const armados = pedidos.filter((p) => p.estado === "armado").length;
  const totalPendiente = pedidos.filter((p) => p.estado === "pendiente" || p.estado === "armado").reduce((s, p) => s + p.total, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Pedidos Online</h1>
          <p className="text-sm text-muted-foreground">{pedidos.length} pedidos en total</p>
        </div>
        <div className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-primary" />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Pendientes</p>
            <p className="text-2xl font-bold text-amber-600">{pendientes}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Armados</p>
            <p className="text-2xl font-bold text-violet-600">{armados}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total por entregar</p>
            <p className="text-2xl font-bold">{formatCurrency(totalPendiente)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total pedidos</p>
            <p className="text-2xl font-bold">{pedidos.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por numero, cliente o email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <Select value={filterEstado} onValueChange={(v) => setFilterEstado(v || "todos")}>
              <SelectTrigger className="w-40 h-9">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los estados</SelectItem>
                <SelectItem value="pendiente">Pendiente</SelectItem>
                <SelectItem value="armado">Armado</SelectItem>
                <SelectItem value="confirmado">Confirmado</SelectItem>
                <SelectItem value="entregado">Entregado</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterEntrega} onValueChange={(v) => setFilterEntrega(v || "todos")}>
              <SelectTrigger className="w-40 h-9">
                <SelectValue placeholder="Entrega" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas</SelectItem>
                <SelectItem value="envio">Envio</SelectItem>
                <SelectItem value="retiro_local">Retiro en local</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Pedidos list */}
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="text-center py-16">
              <ShoppingCart className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No hay pedidos con los filtros seleccionados</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground">Pedido</th>
                    <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground">Cliente</th>
                    <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground">Entrega</th>
                    <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground">Fecha entrega</th>
                    <th className="text-center px-4 py-3 font-medium text-xs text-muted-foreground">Items</th>
                    <th className="text-right px-4 py-3 font-medium text-xs text-muted-foreground">Total</th>
                    <th className="text-center px-4 py-3 font-medium text-xs text-muted-foreground">Estado</th>
                    <th className="text-center px-4 py-3 font-medium text-xs text-muted-foreground">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((pedido) => {
                    const est = estadoBadge[pedido.estado] || estadoBadge.pendiente;
                    return (
                      <tr key={pedido.id} className="border-b hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-semibold">#{pedido.numero}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(pedido.created_at).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium">{pedido.nombre_cliente}</p>
                          <p className="text-[10px] text-muted-foreground">{pedido.email}</p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {pedido.metodo_entrega === "envio" ? (
                              <><Truck className="w-3.5 h-3.5 text-blue-500" /><span className="text-xs">Envio</span></>
                            ) : (
                              <><Store className="w-3.5 h-3.5 text-green-500" /><span className="text-xs">Retiro</span></>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {pedido.fecha_entrega ? new Date(pedido.fecha_entrega + "T12:00:00").toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" }) : "---"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant="secondary" className="text-xs">{pedido.items.length}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">{formatCurrency(pedido.total)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-semibold border ${est.bg} ${est.text}`}>
                            {est.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => openDetail(pedido)}>
                            <Eye className="w-3.5 h-3.5" />
                            Ver / Editar
                          </Button>
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

      {/* Detail / Edit Dialog */}
      <Dialog open={detailOpen} onOpenChange={(open) => {
        if (!open && hasChanges) {
          if (!confirm("Tenés cambios sin guardar. ¿Cerrar de todas formas?")) return;
        }
        setDetailOpen(open);
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
          {selectedPedido && (
            <>
              {/* Header */}
              <div className="px-6 py-4 border-b bg-muted/30">
                <DialogHeader className="p-0 space-y-0">
                  <DialogTitle className="text-lg font-semibold flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5 text-primary" />
                    Pedido #{selectedPedido.numero}
                  </DialogTitle>
                </DialogHeader>
                <p className="text-xs text-muted-foreground mt-1">
                  Creado el {new Date(selectedPedido.created_at).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {/* Client info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                      <User className="w-4 h-4" /> Cliente
                    </h3>
                    <div className="bg-muted/30 rounded-lg p-3 space-y-1.5 text-sm">
                      <p className="font-medium">{selectedPedido.nombre_cliente}</p>
                      {selectedPedido.email && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Mail className="w-3 h-3" />{selectedPedido.email}</p>}
                      {selectedPedido.telefono && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Phone className="w-3 h-3" />{selectedPedido.telefono}</p>}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                      <Truck className="w-4 h-4" /> Entrega
                    </h3>
                    <div className="bg-muted/30 rounded-lg p-3 space-y-1.5 text-sm">
                      <p className="flex items-center gap-1.5">
                        {selectedPedido.metodo_entrega === "envio" ? (
                          <><Truck className="w-3.5 h-3.5 text-blue-500" /> Envio a domicilio</>
                        ) : (
                          <><Store className="w-3.5 h-3.5 text-green-500" /> Retiro en local</>
                        )}
                      </p>
                      {selectedPedido.direccion_texto && (
                        <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><MapPin className="w-3 h-3 mt-0.5 shrink-0" />{selectedPedido.direccion_texto}</p>
                      )}
                      {selectedPedido.fecha_entrega && (
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          {new Date(selectedPedido.fecha_entrega + "T12:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">Pago: {selectedPedido.metodo_pago}</p>
                    </div>
                  </div>
                </div>

                {selectedPedido.observacion && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                    <p className="font-medium text-amber-800 text-xs mb-1">Observacion del cliente:</p>
                    <p className="text-amber-700">{selectedPedido.observacion}</p>
                  </div>
                )}

                {/* Estado */}
                <div className="flex items-center gap-3">
                  <Label className="text-sm font-medium">Estado:</Label>
                  <Select
                    value={selectedPedido.estado}
                    onValueChange={(v) => {
                      if (!v) return;
                      handleEstadoChange(selectedPedido, v);
                      setSelectedPedido({ ...selectedPedido, estado: v });
                    }}
                  >
                    <SelectTrigger className="w-44 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pendiente">Pendiente</SelectItem>
                      <SelectItem value="armado">Armado</SelectItem>
                      <SelectItem value="confirmado">Confirmado</SelectItem>
                      <SelectItem value="entregado">Entregado</SelectItem>
                      <SelectItem value="cancelado">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Items table */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                      <Package className="w-4 h-4" /> Productos ({editItems.length})
                    </h3>
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setAddProductOpen(true)}>
                      <Plus className="w-3 h-3" /> Agregar producto
                    </Button>
                  </div>

                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Producto</th>
                          <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground w-24">Presentacion</th>
                          <th className="text-center px-3 py-2 font-medium text-xs text-muted-foreground w-20">Cant.</th>
                          <th className="text-right px-3 py-2 font-medium text-xs text-muted-foreground w-24">Precio</th>
                          <th className="text-right px-3 py-2 font-medium text-xs text-muted-foreground w-24">Subtotal</th>
                          <th className="w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {editItems.map((item, idx) => (
                          <tr key={idx} className="border-b last:border-0">
                            <td className="px-3 py-2 font-medium">{item.nombre}</td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">{item.presentacion}</td>
                            <td className="px-3 py-2 text-center">
                              <Input
                                type="number"
                                min={1}
                                value={item.cantidad}
                                onChange={(e) => updateItemQty(idx, Number(e.target.value))}
                                className="h-7 w-16 text-center mx-auto"
                              />
                            </td>
                            <td className="px-3 py-2 text-right">{formatCurrency(item.precio_unitario)}</td>
                            <td className="px-3 py-2 text-right font-semibold">{formatCurrency(item.precio_unitario * item.cantidad)}</td>
                            <td className="px-2 py-2">
                              <button
                                onClick={() => removeItem(idx)}
                                className="text-muted-foreground hover:text-destructive disabled:opacity-30"
                                disabled={editItems.length <= 1}
                                title="Quitar producto"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Totals */}
                  <div className="mt-3 space-y-1 text-sm text-right">
                    <p className="text-muted-foreground">Subtotal: <span className="font-medium text-foreground">{formatCurrency(editItems.reduce((s, i) => s + i.precio_unitario * i.cantidad, 0))}</span></p>
                    {(selectedPedido.costo_envio || 0) > 0 && (
                      <p className="text-muted-foreground">Envio: <span className="font-medium text-foreground">{formatCurrency(selectedPedido.costo_envio)}</span></p>
                    )}
                    <p className="text-base font-bold">Total: {formatCurrency(editItems.reduce((s, i) => s + i.precio_unitario * i.cantidad, 0) + (selectedPedido.costo_envio || 0))}</p>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-3 border-t bg-muted/30">
                <div>
                  {hasChanges && (
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Cambios sin guardar
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => {
                    if (hasChanges && !confirm("Tenés cambios sin guardar. ¿Cerrar de todas formas?")) return;
                    setDetailOpen(false);
                  }}>
                    Cerrar
                  </Button>
                  {hasChanges && (
                    <Button onClick={handleSave} disabled={saving}>
                      {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                      Guardar cambios
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Product Dialog */}
      <Dialog open={addProductOpen} onOpenChange={setAddProductOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Plus className="w-4 h-4" /> Agregar producto al pedido
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre o codigo..."
                value={productSearch}
                onChange={(e) => searchProducts(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>
            {searchingProducts && <div className="text-center py-4"><Loader2 className="w-4 h-4 animate-spin mx-auto" /></div>}
            {productResults.length > 0 && (
              <div className="border rounded-lg max-h-60 overflow-y-auto">
                {productResults.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addProduct(p)}
                    className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors border-b last:border-0 flex items-center justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium">{p.nombre}</p>
                      <p className="text-xs text-muted-foreground">{p.codigo}</p>
                    </div>
                    <span className="text-sm font-semibold">{formatCurrency(p.precio)}</span>
                  </button>
                ))}
              </div>
            )}
            {productSearch.length >= 2 && !searchingProducts && productResults.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No se encontraron productos</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
