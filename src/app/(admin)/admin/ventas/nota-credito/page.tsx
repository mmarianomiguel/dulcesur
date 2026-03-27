"use client";

import { showAdminToast } from "@/components/admin-toast";
import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { todayARG, currentMonthPadded } from "@/lib/formatters";
import type { Cliente, Producto, Venta } from "@/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Plus,
  Search,
  FileText,
  X,
  Loader2,
  FileMinus,
  RotateCcw,
  Banknote,
  ArrowRightLeft,
  Wallet,
  Eye,
  Package,
} from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";

interface LineItem {
  id: string;
  producto_id: string | null;
  code: string;
  description: string;
  qty: number;
  maxQty: number;
  unit: string;
  price: number;
  subtotal: number;
  presentacion: string;
  unidades_por_presentacion: number;
  alreadyReturned: boolean;
}

interface NotaCreditoRow extends Venta {
  clientes?: { nombre: string } | null;
}

interface NCDetail {
  nc: NotaCreditoRow;
  items: any[];
  movimientos: any[];
}

type MetodoDev = "Efectivo" | "Transferencia" | "Cuenta Corriente";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
  }).format(value);
}

function getTipoFactura(cliente: Cliente | undefined): string {
  if (!cliente || !cliente.tipo_factura) return "B";
  return cliente.tipo_factura;
}

const METODOS_DEV: { value: MetodoDev; label: string; icon: React.ElementType }[] = [
  { value: "Efectivo", label: "Efectivo", icon: Banknote },
  { value: "Transferencia", label: "Transferencia", icon: ArrowRightLeft },
  { value: "Cuenta Corriente", label: "Descontar de Cta. Cte.", icon: Wallet },
];

export default function NotaCreditoPage() {
  const currentUser = useCurrentUser();
  const [tab, setTab] = useState("listado");

  // List state
  const [notas, setNotas] = useState<NotaCreditoRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [ncDetail, setNcDetail] = useState<NCDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [listSearch, setListSearch] = useState("");
  const [ncFilterMode, setNcFilterMode] = useState<"day" | "month" | "range" | "all">("day");
  const [ncFilterDay, setNcFilterDay] = useState(todayARG());
  const [ncFilterMonth, setNcFilterMonth] = useState(currentMonthPadded());
  const [ncFilterYear, setNcFilterYear] = useState(String(new Date().getFullYear()));
  const [ncFilterFrom, setNcFilterFrom] = useState("");
  const [ncFilterTo, setNcFilterTo] = useState("");

  // Form state
  const [clients, setClients] = useState<Cliente[]>([]);
  const [products, setProducts] = useState<Producto[]>([]);
  const [presMap, setPresMap] = useState<Record<string, { codigo: string }[]>>({});
  const [clientId, setClientId] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [clientOpen, setClientOpen] = useState(false);
  const [origenId, setOrigenId] = useState("");
  const [clientVentas, setClientVentas] = useState<Venta[]>([]);
  const [items, setItems] = useState<LineItem[]>([]);
  const [observacion, setObservacion] = useState("");
  const [metodoDev, setMetodoDev] = useState<MetodoDev>("Efectivo");
  const [saving, setSaving] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [freeText, setFreeText] = useState(false);
  const [freeDesc, setFreeDesc] = useState("");
  const [freePrice, setFreePrice] = useState(0);
  const [freeQty, setFreeQty] = useState(1);
  const [successMsg, setSuccessMsg] = useState("");

  const fetchNotas = useCallback(async () => {
    setLoadingList(true);
    let query = supabase
      .from("ventas")
      .select("*, clientes(nombre)")
      .ilike("tipo_comprobante", "Nota de Crédito%")
      .order("fecha", { ascending: false })
      .limit(200);

    if (ncFilterMode === "day") {
      query = query.eq("fecha", ncFilterDay);
    } else if (ncFilterMode === "month") {
      const m = ncFilterMonth.padStart(2, "0");
      const start = `${ncFilterYear}-${m}-01`;
      const nextMonth = Number(ncFilterMonth) === 12 ? 1 : Number(ncFilterMonth) + 1;
      const nextYear = Number(ncFilterMonth) === 12 ? Number(ncFilterYear) + 1 : Number(ncFilterYear);
      const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
      query = query.gte("fecha", start).lt("fecha", end);
    } else if (ncFilterMode === "range" && ncFilterFrom && ncFilterTo) {
      query = query.gte("fecha", ncFilterFrom).lte("fecha", ncFilterTo);
    }

    const { data } = await query;
    setNotas((data as NotaCreditoRow[]) || []);
    setLoadingList(false);
  }, [ncFilterMode, ncFilterDay, ncFilterMonth, ncFilterYear, ncFilterFrom, ncFilterTo]);

  const fetchFormData = useCallback(async () => {
    const [{ data: cls }, { data: prods }] = await Promise.all([
      supabase.from("clientes").select("*").eq("activo", true).order("nombre"),
      supabase.from("productos").select("*").eq("activo", true).order("nombre").limit(10000),
    ]);
    setClients(cls || []);
    setProducts(prods || []);
    const { data: allPres } = await supabase.from("presentaciones").select("producto_id, sku");
    if (allPres) {
      const map: Record<string, { codigo: string }[]> = {};
      for (const pr of allPres) {
        if (!map[pr.producto_id]) map[pr.producto_id] = [];
        map[pr.producto_id].push({ codigo: pr.sku || "" });
      }
      setPresMap(map);
    }
  }, []);

  useEffect(() => {
    fetchNotas();
    fetchFormData();
  }, [fetchNotas, fetchFormData]);


  // When client changes, fetch their ventas for origen
  useEffect(() => {
    if (!clientId) {
      setClientVentas([]);
      setOrigenId("");
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("ventas")
        .select("*")
        .eq("cliente_id", clientId)
        .not("tipo_comprobante", "ilike", "Nota de Crédito%")
        .not("tipo_comprobante", "ilike", "Nota de Débito%")
        .order("fecha", { ascending: false })
        .limit(50);
      setClientVentas(data || []);
    })();
  }, [clientId]);

  // When origin comprobante changes, load its items
  useEffect(() => {
    if (!origenId || origenId === "none") return;
    (async () => {
      const { data: origItems } = await supabase
        .from("venta_items")
        .select("producto_id, codigo, descripcion, cantidad, unidad_medida, precio_unitario, subtotal, presentacion, unidades_por_presentacion")
        .eq("venta_id", origenId);

      if (!origItems || origItems.length === 0) return;

      const { data: existingNCs } = await supabase
        .from("ventas")
        .select("id")
        .eq("remito_origen_id", origenId)
        .ilike("tipo_comprobante", "Nota de Crédito%");

      const returnedMap: Record<string, number> = {};
      if (existingNCs && existingNCs.length > 0) {
        const ncIds = existingNCs.map((nc: any) => nc.id);
        const { data: ncItems } = await supabase
          .from("venta_items")
          .select("producto_id, descripcion, cantidad")
          .in("venta_id", ncIds);
        if (ncItems) {
          for (const ni of ncItems) {
            const key = `${ni.producto_id || ""}|${ni.descripcion}`;
            returnedMap[key] = (returnedMap[key] || 0) + (ni.cantidad || 0);
          }
        }
      }

      const loaded: LineItem[] = [];
      for (const item of origItems) {
        const key = `${item.producto_id || ""}|${item.descripcion}`;
        const alreadyReturnedQty = returnedMap[key] || 0;
        const remaining = (item.cantidad || 0) - alreadyReturnedQty;
        if (remaining <= 0) continue;
        loaded.push({
          id: crypto.randomUUID(),
          producto_id: item.producto_id,
          code: item.codigo || "-",
          description: item.descripcion,
          qty: 0,
          maxQty: remaining,
          unit: item.unidad_medida || "UN",
          price: item.precio_unitario,
          subtotal: 0,
          presentacion: item.presentacion || "Unidad",
          unidades_por_presentacion: item.unidades_por_presentacion || 1,
          alreadyReturned: false,
        });
      }
      setItems(loaded);

      // Suggest payment method from origin sale
      const origenVenta = clientVentas.find((v) => v.id === origenId);
      if (origenVenta?.forma_pago && origenVenta.forma_pago !== "Mixto") {
        setMetodoDev(origenVenta.forma_pago as MetodoDev);
      }
    })();
  }, [origenId]);

  // Open NC detail
  const openDetail = async (nc: NotaCreditoRow) => {
    setLoadingDetail(true);
    setNcDetail({ nc, items: [], movimientos: [] });
    const [{ data: ncItems }, { data: movs }] = await Promise.all([
      supabase.from("venta_items").select("*").eq("venta_id", nc.id).order("id"),
      supabase.from("caja_movimientos").select("*").eq("referencia_id", nc.id).order("created_at"),
    ]);
    setNcDetail({ nc, items: ncItems || [], movimientos: movs || [] });
    setLoadingDetail(false);
  };

  const selectedClient = clients.find((c) => c.id === clientId);

  const filteredClients = clients.filter(
    (c) => c.nombre.toLowerCase().includes(clientSearch.toLowerCase())
  );

  const filteredProducts = products.filter(
    (p) =>
      p.nombre.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.codigo.toLowerCase().includes(productSearch.toLowerCase()) ||
      (presMap[p.id] || []).some((pr) => (pr.codigo || "").toLowerCase().includes(productSearch.toLowerCase()))
  );

  const addItem = (product: Producto) => {
    const existing = items.find((i) => i.producto_id === product.id);
    if (existing) {
      setItems(items.map((i) =>
        i.id === existing.id ? { ...i, qty: i.qty + 1, subtotal: i.price * (i.qty + 1) } : i
      ));
    } else {
      setItems([...items, {
        id: crypto.randomUUID(),
        producto_id: product.id,
        code: product.codigo,
        description: product.nombre,
        qty: 1,
        maxQty: 9999,
        unit: product.unidad_medida,
        price: product.precio,
        subtotal: product.precio,
        presentacion: "Unidad",
        unidades_por_presentacion: 1,
        alreadyReturned: false,
      }]);
    }
    setSearchOpen(false);
    setProductSearch("");
  };

  const addFreeItem = () => {
    if (!freeDesc.trim() || freePrice <= 0) return;
    setItems([...items, {
      id: crypto.randomUUID(),
      producto_id: null,
      code: "-",
      description: freeDesc,
      qty: freeQty,
      maxQty: 9999,
      unit: "UN",
      price: freePrice,
      subtotal: freePrice * freeQty,
      presentacion: "Unidad",
      unidades_por_presentacion: 1,
      alreadyReturned: false,
    }]);
    setFreeDesc("");
    setFreePrice(0);
    setFreeQty(1);
    setFreeText(false);
  };

  const removeItem = (id: string) => setItems(items.filter((i) => i.id !== id));

  const updateQty = (id: string, qty: number) => {
    if (qty < 1) return;
    setItems(items.map((i) => {
      if (i.id !== id) return i;
      const clampedQty = Math.min(qty, i.maxQty);
      return { ...i, qty: clampedQty, subtotal: i.price * clampedQty };
    }));
  };

  const updatePrice = (id: string, price: number) => {
    setItems(items.map((i) => i.id === id ? { ...i, price, subtotal: price * i.qty } : i));
  };

  const total = items.reduce((acc, i) => acc + i.subtotal, 0);

  const handleSave = async () => {
    if (!clientId || items.length === 0) return;
    setSaving(true);

    const letra = getTipoFactura(selectedClient);
    const tipoComprobante = `Nota de Crédito ${letra}`;

    const { data: numData } = await supabase.rpc("next_numero", { p_tipo: "nota_credito" });
    const numero = numData || "00001-00000000";

    const hoy = todayARG();
    const hora = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });

    const { data: venta } = await supabase
      .from("ventas")
      .insert({
        numero,
        tipo_comprobante: tipoComprobante,
        fecha: hoy,
        cliente_id: clientId,
        vendedor_id: origenId ? (clientVentas.find((v) => v.id === origenId)?.vendedor_id || null) : null,
        forma_pago: metodoDev,
        subtotal: total,
        descuento_porcentaje: 0,
        recargo_porcentaje: 0,
        total,
        estado: "cerrada",
        entregado: true,
        observacion: observacion || null,
        remito_origen_id: origenId && origenId !== "none" ? origenId : null,
      })
      .select()
      .single();

    if (!venta) { setSaving(false); return; }

    // Insert items
    await supabase.from("venta_items").insert(
      items.map((i) => ({
        venta_id: venta.id,
        producto_id: i.producto_id,
        codigo: i.code,
        descripcion: i.description,
        cantidad: i.qty,
        unidad_medida: i.unit,
        precio_unitario: i.price,
        descuento: 0,
        subtotal: i.subtotal,
        presentacion: i.presentacion,
        unidades_por_presentacion: i.unidades_por_presentacion,
      }))
    );

    // Re-add stock
    for (const item of items) {
      if (!item.producto_id) continue;
      const prod = products.find((p) => p.id === item.producto_id);
      if (!prod) continue;

      if ((prod as any).es_combo) {
        // For combos: restore each component's stock
        const { data: ciData } = await supabase
          .from("combo_items")
          .select("cantidad, productos!combo_items_producto_id_fkey(id, nombre, stock)")
          .eq("combo_id", item.producto_id);
        for (const ci of (ciData || []) as any[]) {
          const comp = ci.productos;
          if (!comp) continue;
          const unitsToReturn = item.qty * ci.cantidad;
          const newStock = comp.stock + unitsToReturn;
          await supabase.from("productos").update({ stock: newStock }).eq("id", comp.id);
          await supabase.from("stock_movimientos").insert({
            producto_id: comp.id,
            tipo: "devolucion",
            cantidad_antes: comp.stock,
            cantidad_despues: newStock,
            cantidad: unitsToReturn,
            referencia: `NC ${numero}`,
            descripcion: `Devolución combo ${item.description} - ${comp.nombre}`,
            usuario: currentUser?.nombre || "Admin Sistema",
            orden_id: venta.id,
          });
          // Update local cache so subsequent iterations see updated stock
          comp.stock = newStock;
        }
      } else {
        let upp = item.unidades_por_presentacion || 1;
        if (upp === 1 && item.presentacion && item.presentacion !== "Unidad") {
          const match = item.presentacion.toLowerCase().match(/x\s*(\d+)/);
          if (match) upp = Number(match[1]);
        }
        const unitsToReturn = item.qty * upp;
        const newStock = prod.stock + unitsToReturn;
        await supabase.from("productos").update({ stock: newStock }).eq("id", item.producto_id);
        await supabase.from("stock_movimientos").insert({
          producto_id: item.producto_id,
          tipo: "devolucion",
          cantidad_antes: prod.stock,
          cantidad_despues: newStock,
          cantidad: unitsToReturn,
          referencia: `NC ${numero}`,
          descripcion: `Devolución - ${item.description}`,
          usuario: currentUser?.nombre || "Admin Sistema",
          orden_id: venta.id,
        });
        prod.stock = newStock;
      }
    }

    // ── Impacto en caja según método de devolución ──
    if (metodoDev === "Efectivo" || metodoDev === "Transferencia") {
      // Cancelacion de caja: reversed income (not a real expense)
      await supabase.from("caja_movimientos").insert({
        fecha: hoy,
        hora,
        tipo: "cancelacion",
        descripcion: `Cancelación NC #${numero} — ${selectedClient?.nombre || ""}`,
        metodo_pago: metodoDev,
        monto: total,
        referencia_id: venta.id,
        referencia_tipo: "nota_credito",
      });
    }
    // ── Cuenta corriente: solo si el método es Cuenta Corriente ──
    if (metodoDev === "Cuenta Corriente" && clientId) {
      const { data: freshCliente } = await supabase.from("clientes").select("saldo").eq("id", clientId).single();
      const nuevoSaldo = (freshCliente?.saldo ?? selectedClient?.saldo ?? 0) - total;
      await supabase.from("cuenta_corriente").insert({
        cliente_id: clientId,
        fecha: hoy,
        comprobante: `NC ${numero}`,
        descripcion: `Nota de Crédito ${numero} — devolución a cuenta corriente`,
        debe: 0,
        haber: total,
        saldo: nuevoSaldo,
        forma_pago: "Cuenta Corriente",
        venta_id: venta.id,
      });
      await supabase.from("clientes").update({ saldo: nuevoSaldo }).eq("id", clientId);
    }

    // Reset form
    setItems([]);
    setObservacion("");
    setOrigenId("");
    setClientId("");
    setClientSearch("");
    setMetodoDev("Efectivo");
    setTab("listado");
    fetchNotas();
    fetchFormData();

    let saldoMsg = "";
    if (metodoDev === "Cuenta Corriente" && clientId) {
      const nuevoSaldo = (selectedClient?.saldo || 0) - total;
      saldoMsg = nuevoSaldo < 0
        ? ` — Saldo a favor: ${formatCurrency(Math.abs(nuevoSaldo))}`
        : nuevoSaldo > 0
        ? ` — Deuda restante: ${formatCurrency(nuevoSaldo)}`
        : " — Deuda saldada";
    }
    setSuccessMsg(`NC ${numero} emitida por ${formatCurrency(total)} via ${metodoDev}${saldoMsg}`);

    setSaving(false);
  };

  const totalNC = notas.reduce((acc, n) => acc + n.total, 0);
  const countMes = notas.filter((n) => n.fecha >= new Date().toISOString().slice(0, 7)).length;
  const filteredNotas = notas.filter((n) =>
    !listSearch || (n.clientes?.nombre || "").toLowerCase().includes(listSearch.toLowerCase()) || (n.numero || "").includes(listSearch)
  );

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Notas de Crédito</h1>
            <p className="text-sm text-muted-foreground">Crear y consultar notas de crédito</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Total NC emitidas</p><p className="text-2xl font-bold">{notas.length}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Monto total NC</p><p className="text-2xl font-bold">{formatCurrency(totalNC)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">NC este mes</p><p className="text-2xl font-bold">{countMes}</p></CardContent></Card>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v ?? "listado")}>
        <TabsList>
          <TabsTrigger value="listado">Listado</TabsTrigger>
          <TabsTrigger value="nueva">Nueva Nota de Crédito</TabsTrigger>
        </TabsList>

        {/* ── LISTADO ── */}
        <TabsContent value="listado" className="space-y-4">
          <Card>
            <CardContent className="pt-6 pb-4 space-y-4">
              <div className="flex items-end gap-4 flex-wrap">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por cliente o número..."
                    value={listSearch}
                    onChange={(e) => setListSearch(e.target.value)}
                    className="pl-9"
                  />
                  {listSearch && (
                    <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setListSearch("")}>
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="flex items-end gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Período</Label>
                    <Select value={ncFilterMode} onValueChange={(v) => setNcFilterMode((v ?? "day") as "day" | "month" | "range" | "all")}>
                      <SelectTrigger className="w-36"><SelectValue placeholder="Período" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="day">Día</SelectItem>
                        <SelectItem value="month">Mensual</SelectItem>
                        <SelectItem value="range">Entre fechas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {ncFilterMode === "day" && (
                    <Input type="date" value={ncFilterDay} onChange={(e) => setNcFilterDay(e.target.value)} className="w-40" />
                  )}
                  {ncFilterMode === "month" && (
                    <>
                      <Select value={ncFilterMonth} onValueChange={(v) => setNcFilterMonth(v ?? "1")}>
                        <SelectTrigger className="w-32"><SelectValue placeholder="Mes" /></SelectTrigger>
                        <SelectContent>
                          {["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"].map((m, i) => (
                            <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input type="number" value={ncFilterYear} onChange={(e) => setNcFilterYear(e.target.value)} className="w-20" />
                    </>
                  )}
                  {ncFilterMode === "range" && (
                    <>
                      <div className="flex items-center gap-1">
                        <Label className="text-xs">Desde</Label>
                        <Input type="date" value={ncFilterFrom} onChange={(e) => setNcFilterFrom(e.target.value)} className="w-40" />
                      </div>
                      <div className="flex items-center gap-1">
                        <Label className="text-xs">Hasta</Label>
                        <Input type="date" value={ncFilterTo} onChange={(e) => setNcFilterTo(e.target.value)} className="w-40" />
                      </div>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              {loadingList ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredNotas.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">{listSearch ? "Sin resultados para la búsqueda" : "No hay notas de crédito"}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-2 px-3 font-medium">Número</th>
                        <th className="text-left py-2 px-3 font-medium">Fecha</th>
                        <th className="text-left py-2 px-3 font-medium">Tipo</th>
                        <th className="text-left py-2 px-3 font-medium">Cliente</th>
                        <th className="text-left py-2 px-3 font-medium">Devolución vía</th>
                        <th className="text-right py-2 px-3 font-medium">Total</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredNotas.map((n) => (
                        <tr
                          key={n.id}
                          className="border-b last:border-0 hover:bg-muted/50 cursor-pointer"
                          onClick={() => openDetail(n)}
                        >
                          <td className="py-2 px-3 font-mono text-xs">{n.numero}</td>
                          <td className="py-2 px-3">{n.fecha}</td>
                          <td className="py-2 px-3">
                            <Badge variant="secondary" className="text-xs">{n.tipo_comprobante}</Badge>
                          </td>
                          <td className="py-2 px-3">{n.clientes?.nombre || "-"}</td>
                          <td className="py-2 px-3">
                            <Badge variant="outline" className="text-xs">{n.forma_pago || "-"}</Badge>
                          </td>
                          <td className="py-2 px-3 text-right font-semibold text-red-500">
                            -{formatCurrency(n.total)}
                          </td>
                          <td className="py-2 px-3">
                            <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── NUEVA NC ── */}
        <TabsContent value="nueva" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              {/* Client & Origin */}
              <Card>
                <CardContent className="pt-6">
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Cliente</Label>
                      <div className="flex gap-2">
                        <Button variant="outline" className="flex-1 justify-start text-sm font-normal" onClick={() => setClientOpen(true)}>
                          <Search className="w-4 h-4 mr-2 text-muted-foreground" />
                          {selectedClient ? selectedClient.nombre : "Buscar cliente..."}
                        </Button>
                        {clientId && (
                          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => { setClientId(""); setClientSearch(""); setOrigenId(""); setItems([]); }}>
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                      <Dialog open={clientOpen} onOpenChange={setClientOpen}>
                        <DialogContent className="max-w-md">
                          <DialogHeader><DialogTitle>Seleccionar Cliente</DialogTitle></DialogHeader>
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input placeholder="Buscar por nombre..." value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} className="pl-9" autoFocus />
                          </div>
                          <div className="max-h-[300px] overflow-y-auto space-y-0.5">
                            {filteredClients.slice(0, 30).map((c) => (
                              <button key={c.id} className="w-full text-left px-3 py-2.5 hover:bg-muted rounded-md text-sm transition-colors"
                                onClick={() => { setClientId(c.id); setClientSearch(""); setClientOpen(false); }}>
                                <span className="font-medium">{c.nombre}</span>
                                {c.telefono && <span className="text-xs text-muted-foreground ml-2">{c.telefono}</span>}
                              </button>
                            ))}
                            {filteredClients.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground text-center">Sin resultados</p>}
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Comprobante de origen (opcional)</Label>
                      <Select value={origenId || "none"} onValueChange={(v) => { setOrigenId(v === "none" ? "" : (v || "")); setItems([]); }}>
                        <SelectTrigger className="w-full truncate">
                          {origenId && origenId !== "none" ? (() => { const v = clientVentas.find((cv) => cv.id === origenId); return v ? `${v.tipo_comprobante} ${v.numero} — ${formatCurrency(v.total)}` : "Sin referencia"; })() : "Sin referencia"}
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin referencia</SelectItem>
                          {clientVentas.map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.tipo_comprobante} {v.numero} — {formatCurrency(v.total)} ({v.forma_pago})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {selectedClient && (
                    <div className="mt-3 flex gap-3 text-xs text-muted-foreground">
                      <span>CUIT: {selectedClient.cuit || "-"}</span>
                      <span>IVA: {selectedClient.situacion_iva}</span>
                      <span>Factura: {selectedClient.tipo_factura || "B"}</span>
                      <span className={selectedClient.saldo > 0 ? "text-red-500" : selectedClient.saldo < 0 ? "text-emerald-500" : ""}>
                        Saldo: {formatCurrency(selectedClient.saldo)}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Items */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Items a devolver</CardTitle>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setFreeText(true)}>
                        <FileText className="w-4 h-4 mr-2" />Texto libre
                      </Button>
                      {(!origenId || origenId === "none") && (
                        <Button size="sm" onClick={() => setSearchOpen(true)}>
                          <Plus className="w-4 h-4 mr-2" />Agregar producto
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {items.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <RotateCcw className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">No hay items cargados</p>
                      <p className="text-xs mt-1">
                        {origenId && origenId !== "none"
                          ? "Todos los productos de este comprobante ya fueron devueltos"
                          : "Seleccione un comprobante o agregue productos manualmente"}
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-muted-foreground">
                            <th className="text-left py-2 px-3 font-medium w-24">Código</th>
                            <th className="text-left py-2 px-3 font-medium">Descripción</th>
                            <th className="text-center py-2 px-3 font-medium w-20">Cant</th>
                            <th className="text-right py-2 px-3 font-medium w-28">Precio</th>
                            <th className="text-right py-2 px-3 font-medium w-28">Subtotal</th>
                            <th className="w-10"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((item) => (
                            <tr key={item.id} className="border-b last:border-0">
                              <td className="py-2 px-3 font-mono text-xs text-muted-foreground">{item.code}</td>
                              <td className="py-2 px-3 font-medium">{item.description}</td>
                              <td className="py-2 px-3">
                                <Input type="number" value={item.qty}
                                  onChange={(e) => updateQty(item.id, Number(e.target.value))}
                                  className="w-16 text-center h-8 mx-auto" min={1} max={item.maxQty} />
                              </td>
                              <td className="py-2 px-3">
                                <Input type="number" value={item.price}
                                  onChange={(e) => updatePrice(item.id, Number(e.target.value))}
                                  className="w-24 text-right h-8 ml-auto" min={0} />
                              </td>
                              <td className="py-2 px-3 text-right font-semibold">{formatCurrency(item.subtotal)}</td>
                              <td className="py-2 px-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                  onClick={() => removeItem(item.id)}>
                                  <X className="w-3.5 h-3.5" />
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

              {/* Observacion */}
              <Card>
                <CardContent className="pt-6 space-y-2">
                  <Label className="text-xs text-muted-foreground">Motivo / Observación</Label>
                  <Textarea value={observacion} onChange={(e) => setObservacion(e.target.value)}
                    placeholder="Motivo de la nota de crédito..." rows={3} />
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Resumen NC</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tipo</span>
                    <Badge variant="secondary">NC {getTipoFactura(selectedClient)}</Badge>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Items</span>
                    <span>{items.length}</span>
                  </div>

                  {/* Método de devolución */}
                  <div className="space-y-2 pt-2 border-t">
                    <Label className="text-xs font-semibold">Método de devolución</Label>
                    <div className="space-y-2">
                      {METODOS_DEV.map(({ value, label, icon: Icon }) => (
                        <button
                          key={value}
                          onClick={() => setMetodoDev(value)}
                          className={`w-full flex items-center gap-3 p-3 rounded-lg border text-sm transition-colors ${
                            metodoDev === value
                              ? "border-primary bg-primary/5 text-primary font-medium"
                              : "border-border hover:bg-muted"
                          }`}
                        >
                          <Icon className="w-4 h-4 shrink-0" />
                          <span className="text-left">{label}</span>
                          {metodoDev === value && (
                            <span className="ml-auto w-2 h-2 rounded-full bg-primary" />
                          )}
                        </button>
                      ))}
                    </div>

                    {/* Explain impact */}
                    <p className="text-xs text-muted-foreground mt-1">
                      {metodoDev === "Cuenta Corriente"
                        ? "Se acreditará en la cuenta corriente del cliente. Sin movimiento de caja."
                        : `Se registrará un egreso de caja en ${metodoDev} por el monto devuelto.`}
                    </p>
                  </div>

                  {selectedClient && (
                    <div className="flex justify-between text-sm pt-2 border-t">
                      <span className="text-muted-foreground">Saldo actual</span>
                      <span className={selectedClient.saldo > 0 ? "text-red-500 font-medium" : selectedClient.saldo < 0 ? "text-emerald-500 font-medium" : ""}>
                        {formatCurrency(selectedClient.saldo)}
                      </span>
                    </div>
                  )}
                  {selectedClient && total > 0 && metodoDev === "Cuenta Corriente" && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Saldo después NC</span>
                      {(() => {
                        const nuevoSaldo = (selectedClient.saldo || 0) - total;
                        return (
                          <span className={nuevoSaldo < 0 ? "text-emerald-500 font-semibold" : nuevoSaldo > 0 ? "text-red-500 font-medium" : "text-muted-foreground"}>
                            {formatCurrency(nuevoSaldo)}
                            {nuevoSaldo < 0 && <span className="text-xs ml-1">(a favor)</span>}
                          </span>
                        );
                      })()}
                    </div>
                  )}
                  {selectedClient && total > 0 && metodoDev !== "Cuenta Corriente" && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Saldo después NC</span>
                      <span className={selectedClient.saldo < 0 ? "text-emerald-500 font-semibold" : selectedClient.saldo > 0 ? "text-red-500 font-medium" : "text-muted-foreground"}>
                        {formatCurrency(selectedClient.saldo || 0)}
                        <span className="text-xs ml-1 text-muted-foreground">(sin cambios)</span>
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-3 border-t">
                    <span className="font-semibold">Total a devolver</span>
                    <span className="text-2xl font-bold text-red-500">{formatCurrency(total)}</span>
                  </div>
                </CardContent>
              </Card>

              <Button className="w-full" size="lg" onClick={handleSave}
                disabled={!clientId || items.length === 0 || saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileMinus className="w-4 h-4 mr-2" />}
                Emitir Nota de Crédito
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── NC Detail Dialog ── */}
      <Dialog open={!!ncDetail} onOpenChange={(o) => !o && setNcDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileMinus className="w-5 h-5" />
              {ncDetail?.nc.tipo_comprobante} — {ncDetail?.nc.numero}
            </DialogTitle>
          </DialogHeader>

          {ncDetail && (
            <div className="space-y-4">
              {/* Info */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Fecha</p>
                  <p className="font-bold">{ncDetail.nc.fecha}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Cliente</p>
                  <p className="font-bold text-xs">{ncDetail.nc.clientes?.nombre || "-"}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Devolución vía</p>
                  <Badge variant="outline" className="mt-1">{ncDetail.nc.forma_pago}</Badge>
                </div>
                <div className="rounded-lg border p-3 bg-red-50 dark:bg-red-950/20">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="font-bold text-red-600">-{formatCurrency(ncDetail.nc.total)}</p>
                </div>
              </div>

              {ncDetail.nc.observacion && (
                <div className="rounded-lg border p-3 bg-muted/30">
                  <p className="text-xs text-muted-foreground mb-1">Observación</p>
                  <p className="text-sm">{ncDetail.nc.observacion}</p>
                </div>
              )}

              {/* Items */}
              <div>
                <h4 className="text-sm font-semibold mb-2">Productos devueltos</h4>
                {loadingDetail ? (
                  <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin" /></div>
                ) : ncDetail.items.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin items</p>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left py-2 px-3">Código</th>
                          <th className="text-left py-2 px-3">Descripción</th>
                          <th className="text-center py-2 px-3">Cant</th>
                          <th className="text-right py-2 px-3">Precio</th>
                          <th className="text-right py-2 px-3">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ncDetail.items.map((item: any) => (
                          <tr key={item.id} className="border-b last:border-0">
                            <td className="py-2 px-3 font-mono text-muted-foreground">{item.codigo || "-"}</td>
                            <td className="py-2 px-3">{item.descripcion}</td>
                            <td className="py-2 px-3 text-center">{item.cantidad}</td>
                            <td className="py-2 px-3 text-right">{formatCurrency(item.precio_unitario)}</td>
                            <td className="py-2 px-3 text-right font-semibold">{formatCurrency(item.subtotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t bg-muted/30">
                          <td colSpan={4} className="py-2 px-3 text-right font-semibold">Total devuelto</td>
                          <td className="py-2 px-3 text-right font-bold text-red-600">-{formatCurrency(ncDetail.nc.total)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              {/* Movimientos de caja */}
              <div>
                <h4 className="text-sm font-semibold mb-2">Movimientos de caja</h4>
                {loadingDetail ? (
                  <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin" /></div>
                ) : ncDetail.movimientos.length === 0 ? (
                  <div className="rounded-lg border p-3 bg-muted/30">
                    <p className="text-xs text-muted-foreground">
                      Sin movimientos de caja — la devolución se acreditó en cuenta corriente del cliente.
                    </p>
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left py-2 px-3">Hora</th>
                          <th className="text-left py-2 px-3">Descripción</th>
                          <th className="text-left py-2 px-3">Método</th>
                          <th className="text-right py-2 px-3">Monto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ncDetail.movimientos.map((m: any) => (
                          <tr key={m.id} className="border-b last:border-0">
                            <td className="py-2 px-3 text-muted-foreground">{m.hora?.substring(0, 5)}</td>
                            <td className="py-2 px-3">{m.descripcion}</td>
                            <td className="py-2 px-3">
                              <Badge variant="outline" className="text-[10px]">{m.metodo_pago}</Badge>
                            </td>
                            <td className="py-2 px-3 text-right font-semibold text-red-500">
                              -{formatCurrency(Math.abs(m.monto))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Product search */}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Buscar producto</DialogTitle></DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar..." value={productSearch} onChange={(e) => setProductSearch(e.target.value)} className="pl-9" autoFocus />
          </div>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {filteredProducts.slice(0, 20).map((p) => (
              <button key={p.id} onClick={() => addItem(p)}
                className="w-full rounded-xl border p-3 transition-colors hover:border-primary/30 hover:bg-primary/5 text-left flex items-center gap-3">
                <div className="w-11 h-11 rounded-lg bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                  {(p as any).imagen_url ? (
                    <img src={(p as any).imagen_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Package className="w-5 h-5 text-muted-foreground/30" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{p.nombre}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <span className="font-mono">{p.codigo}</span>
                    <span>·</span>
                    <span>Stock: <strong className={p.stock <= 0 ? "text-red-500" : ""}>{p.stock}</strong></span>
                    <span>·</span>
                    <span className="font-semibold text-foreground">{formatCurrency(p.precio)}</span>
                  </div>
                </div>
              </button>
            ))}
            {filteredProducts.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No se encontraron productos</p>}
          </div>
        </DialogContent>
      </Dialog>

      {/* Free text */}
      <Dialog open={freeText} onOpenChange={setFreeText}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Agregar concepto libre</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Input value={freeDesc} onChange={(e) => setFreeDesc(e.target.value)} placeholder="Descripción" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cantidad</Label>
                <Input type="number" value={freeQty} onChange={(e) => setFreeQty(Number(e.target.value))} min={1} />
              </div>
              <div className="space-y-2">
                <Label>Precio unitario</Label>
                <Input type="number" value={freePrice} onChange={(e) => setFreePrice(Number(e.target.value))} min={0} />
              </div>
            </div>
            <Button className="w-full" onClick={addFreeItem}>Agregar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Success */}
      <Dialog open={!!successMsg} onOpenChange={(open) => !open && setSuccessMsg("")}>
        <DialogContent className="max-w-sm text-center">
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <svg className="w-7 h-7 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <p className="text-sm">{successMsg}</p>
            <Button className="w-full" onClick={() => setSuccessMsg("")}>Aceptar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
