"use client";

import { showAdminToast } from "@/components/admin-toast";
import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { norm } from "@/lib/utils";
import { todayARG, currentMonthPadded, formatCurrency } from "@/lib/formatters";
import type { Cliente, Producto, Venta } from "@/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
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
  costo_unitario: number;
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
  const [ncFilterMode, setNcFilterMode] = useState<"day" | "month" | "range" | "all">("range");
  const [ncFilterDay, setNcFilterDay] = useState(todayARG());
  const [ncFilterMonth, setNcFilterMonth] = useState(currentMonthPadded());
  const [ncFilterYear, setNcFilterYear] = useState(String(new Date().getFullYear()));
  const [ncFilterFrom, setNcFilterFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [ncFilterTo, setNcFilterTo] = useState(todayARG());

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
  const [origenAvailable, setOrigenAvailable] = useState<LineItem[]>([]);
  const [origenRemainingUnits, setOrigenRemainingUnits] = useState<Record<string, number>>({});
  const [origenPickerOpen, setOrigenPickerOpen] = useState(false);
  const [origenPickerSearch, setOrigenPickerSearch] = useState("");
  const [origenPickerQtys, setOrigenPickerQtys] = useState<Record<string, number>>({});
  const [origenUnidadesQtys, setOrigenUnidadesQtys] = useState<Record<string, number>>({});
  const [origenSelectOpen, setOrigenSelectOpen] = useState(false);
  const [origenSelectSearch, setOrigenSelectSearch] = useState("");
  const [origenFilterFrom, setOrigenFilterFrom] = useState("");
  const [origenFilterTo, setOrigenFilterTo] = useState("");
  const [previewVenta, setPreviewVenta] = useState<Venta | null>(null);
  const [previewItems, setPreviewItems] = useState<any[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
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
    const [{ data: cls }, { data: prods }, { data: allPres }] = await Promise.all([
      supabase.from("clientes").select("*").eq("activo", true).order("nombre"),
      supabase.from("productos").select("*").eq("activo", true).order("nombre").limit(10000),
      supabase.from("presentaciones").select("producto_id, sku").limit(10000),
    ]);
    setClients(cls || []);
    setProducts(prods || []);
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
    const onFocus = () => fetchFormData();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchNotas, fetchFormData]);


  // CF cannot use Cuenta Corriente — reset método si se va a CF estando en CC
  useEffect(() => {
    if (!clientId && metodoDev === "Cuenta Corriente") setMetodoDev("Efectivo");
  }, [clientId, metodoDev]);

  // When client changes (or CF is selected), fetch matching ventas for origen
  useEffect(() => {
    setOrigenId("");
    (async () => {
      let q = supabase
        .from("ventas")
        .select("*")
        .not("tipo_comprobante", "ilike", "Nota de Crédito%")
        .not("tipo_comprobante", "ilike", "Nota de Débito%")
        .order("fecha", { ascending: false })
        .limit(origenFilterFrom || origenFilterTo ? 500 : 50);
      q = clientId ? q.eq("cliente_id", clientId) : q.is("cliente_id", null);
      if (origenFilterFrom) q = q.gte("fecha", origenFilterFrom);
      if (origenFilterTo) q = q.lte("fecha", origenFilterTo);
      const { data } = await q;
      setClientVentas(data || []);
    })();
  }, [clientId, origenFilterFrom, origenFilterTo]);

  // When origin comprobante changes, load its items
  useEffect(() => {
    if (!origenId || origenId === "none") return;
    (async () => {
      const { data: origItems } = await supabase
        .from("venta_items")
        .select("producto_id, codigo, descripcion, cantidad, unidad_medida, precio_unitario, subtotal, presentacion, unidades_por_presentacion, costo_unitario")
        .eq("venta_id", origenId);

      if (!origItems || origItems.length === 0) return;

      const { data: existingNCs } = await supabase
        .from("ventas")
        .select("id")
        .eq("remito_origen_id", origenId)
        .ilike("tipo_comprobante", "Nota de Crédito%");

      // Acumular ya devuelto en UNIDADES por producto, para soportar mezcla cajas/sueltas entre NCs
      const returnedUnitsByProd: Record<string, number> = {};
      if (existingNCs && existingNCs.length > 0) {
        const ncIds = existingNCs.map((nc: any) => nc.id);
        const { data: ncItems } = await supabase
          .from("venta_items")
          .select("producto_id, cantidad, unidades_por_presentacion")
          .in("venta_id", ncIds);
        if (ncItems) {
          for (const ni of ncItems as any[]) {
            const pid = ni.producto_id || "";
            if (!pid) continue;
            const upp = ni.unidades_por_presentacion || 1;
            returnedUnitsByProd[pid] = (returnedUnitsByProd[pid] || 0) + (ni.cantidad || 0) * upp;
          }
        }
      }

      const loaded: LineItem[] = [];
      const remainingUnitsByLine: Record<string, number> = {};
      for (const item of origItems) {
        const upp = item.unidades_por_presentacion || 1;
        const originalUnits = (item.cantidad || 0) * upp;
        const pid = item.producto_id || "";
        const returnedUnits = pid ? (returnedUnitsByProd[pid] || 0) : 0;
        const remainingUnits = originalUnits - returnedUnits;
        if (remainingUnits <= 0) continue;
        // Descontar las unidades que vamos a "ocupar" para que dos líneas del mismo producto no compitan
        if (pid) returnedUnitsByProd[pid] = (returnedUnitsByProd[pid] || 0) + remainingUnits;
        const id = crypto.randomUUID();
        const cajasMax = Math.floor(remainingUnits / upp);
        loaded.push({
          id,
          producto_id: item.producto_id,
          code: item.codigo || "-",
          description: item.descripcion,
          qty: cajasMax > 0 ? 1 : 0,
          maxQty: cajasMax,
          unit: item.unidad_medida || "UN",
          price: item.precio_unitario,
          subtotal: cajasMax > 0 ? item.precio_unitario : 0,
          presentacion: item.presentacion || "Unidad",
          unidades_por_presentacion: upp,
          alreadyReturned: false,
          costo_unitario: (item as any).costo_unitario || 0,
        });
        remainingUnitsByLine[id] = remainingUnits;
      }
      setOrigenAvailable(loaded);
      setOrigenRemainingUnits(remainingUnitsByLine);
      setOrigenUnidadesQtys({});
      setItems([]);

      // Suggest payment method from origin sale
      const origenVenta = clientVentas.find((v) => v.id === origenId);
      if (origenVenta && (origenVenta.cliente_id || "") !== clientId) {
        showAdminToast("El comprobante seleccionado pertenece a otro cliente", "error");
        return;
      }
      if (origenVenta?.forma_pago && origenVenta.forma_pago !== "Mixto") {
        setMetodoDev(origenVenta.forma_pago as MetodoDev);
      }
      // When origin is Mixto, don't set a default — the dropdown stays visible for user to choose
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

  const filteredClients = clients.filter((c) => {
    const q = norm(clientSearch);
    if (!q) return true;
    return (
      norm(c.nombre).includes(q) ||
      norm(c.cuit || "").includes(q) ||
      norm(c.telefono || "").includes(q)
    );
  });

  const filteredProducts = products.filter(
    (p) =>
      norm(p.nombre).includes(norm(productSearch)) ||
      norm(p.codigo).includes(norm(productSearch)) ||
      (presMap[p.id] || []).some((pr) => norm(pr.codigo || "").includes(norm(productSearch)))
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
        costo_unitario: product.costo || 0,
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
      costo_unitario: 0,
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
    const validItems = items.filter((i) => i.qty > 0 && i.subtotal > 0);
    if (validItems.length === 0) { showAdminToast("Agregá al menos un item con cantidad mayor a 0", "error"); setSaving(false); return; }
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
        cliente_id: clientId || null,
        vendedor_id: origenId ? (clientVentas.find((v) => v.id === origenId)?.vendedor_id || null) : null,
        forma_pago: metodoDev,
        subtotal: total,
        descuento_porcentaje: 0,
        recargo_porcentaje: 0,
        total,
        estado: "cerrada",
        entregado: origenId ? (() => {
          const origen = clientVentas.find((v) => v.id === origenId);
          if (!origen) return true;
          if ((origen as any).estado === "anulada") return false;
          return origen.entregado ?? true;
        })() : true,
        observacion: observacion || null,
        remito_origen_id: origenId && origenId !== "none" ? origenId : null,
      })
      .select()
      .single();

    if (!venta) { setSaving(false); return; }

    // Insert items (only those with qty > 0)
    await supabase.from("venta_items").insert(
      validItems.map((i) => ({
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
        costo_unitario: i.costo_unitario || 0,
      }))
    );

    // Re-add stock (only items being returned)
    for (const item of validItems) {
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
          // Use atomic RPC to prevent race conditions
          const { data: stockResult } = await supabase.rpc("atomic_update_stock", {
            p_producto_id: comp.id,
            p_change: unitsToReturn,
          });
          await supabase.from("stock_movimientos").insert({
            producto_id: comp.id,
            tipo: "devolucion",
            cantidad_antes: stockResult?.stock_antes ?? comp.stock,
            cantidad_despues: stockResult?.stock_despues ?? (comp.stock + unitsToReturn),
            cantidad: unitsToReturn,
            referencia: `NC ${numero}`,
            descripcion: `Devolución combo ${item.description} - ${comp.nombre}`,
            usuario: currentUser?.nombre || "Admin Sistema",
            orden_id: venta.id,
          });
        }
      } else {
        let upp = item.unidades_por_presentacion || 1;
        if (upp === 1 && item.presentacion && item.presentacion !== "Unidad") {
          const match = item.presentacion.toLowerCase().match(/x\s*(\d+)/);
          if (match) upp = Number(match[1]);
        }
        const unitsToReturn = item.qty * upp;

        // Atomic stock update via RPC
        const { data: stockResult } = await supabase.rpc("atomic_update_stock", {
          p_producto_id: item.producto_id,
          p_change: unitsToReturn,
        });
        await supabase.from("stock_movimientos").insert({
          producto_id: item.producto_id,
          tipo: "devolucion",
          cantidad_antes: stockResult?.stock_antes ?? 0,
          cantidad_despues: stockResult?.stock_despues ?? 0,
          cantidad: unitsToReturn,
          referencia: `NC ${numero}`,
          descripcion: `Devolución - ${item.description}`,
          usuario: currentUser?.nombre || "Admin Sistema",
          orden_id: venta.id,
        });
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
      // Efectivo/Transferencia: la plata se devuelve físicamente, NO se toca el saldo CC
    }
    // ── Cuenta corriente: solo si el método es Cuenta Corriente ──
    if (metodoDev === "Cuenta Corriente" && clientId) {
      // Atomic saldo update via RPC (negative = reduce debt)
      const { data: nuevoSaldo } = await supabase.rpc("atomic_update_client_saldo", {
        p_client_id: clientId,
        p_change: -total,
      });
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
    }

    // Actualizar total + montos de la venta origen para que queden consistentes con la NC
    if (origenId && origenId !== "none") {
      const { data: ventaOrigenFull } = await supabase
        .from("ventas")
        .select("total, subtotal, recargo_porcentaje, descuento_porcentaje, monto_pagado, monto_efectivo, monto_transferencia, monto_cuenta_corriente")
        .eq("id", origenId)
        .single();

      if (ventaOrigenFull) {
        const subtotalBase = ventaOrigenFull.subtotal || ventaOrigenFull.total;
        const descPct = ventaOrigenFull.descuento_porcentaje || 0;
        const recPct = ventaOrigenFull.recargo_porcentaje || 0;

        const descMonto = Math.round(subtotalBase * descPct / 100);
        const subtotalConDesc = subtotalBase - descMonto;
        const baseNeta = subtotalConDesc - total;

        const recargo = recPct > 0 && baseNeta > 0
          ? Math.round(baseNeta * recPct / 100)
          : 0;

        const nuevoTotal = Math.max(0, baseNeta + recargo);

        // Ajustar campos de método según cómo se devolvió la plata.
        // Mantiene la invariante: monto_efectivo + monto_transferencia + monto_cuenta_corriente ≈ total
        const ncAmount = total;
        const updateOrigen: Record<string, any> = { total: nuevoTotal };
        const ef = Number(ventaOrigenFull.monto_efectivo || 0);
        const tr = Number(ventaOrigenFull.monto_transferencia || 0);
        const cc = Number(ventaOrigenFull.monto_cuenta_corriente || 0);
        const pag = Number(ventaOrigenFull.monto_pagado || 0);

        if (metodoDev === "Efectivo") {
          // Cliente recibió efectivo de vuelta → reduce el efvo cobrado
          updateOrigen.monto_efectivo = Math.max(0, ef - ncAmount);
          updateOrigen.monto_pagado = Math.max(0, pag - ncAmount);
        } else if (metodoDev === "Transferencia") {
          updateOrigen.monto_transferencia = Math.max(0, tr - ncAmount);
          updateOrigen.monto_pagado = Math.max(0, pag - ncAmount);
        } else if (metodoDev === "Cuenta Corriente") {
          // La deuda CC del cliente se reduce — pero el monto_cuenta_corriente
          // de esta venta refleja deuda generada por ESTA venta. Reducirla.
          updateOrigen.monto_cuenta_corriente = Math.max(0, cc - ncAmount);
          // monto_pagado NO se reduce (no se devolvió plata, solo se redujo la deuda)
        }

        await supabase
          .from("ventas")
          .update(updateOrigen)
          .eq("id", origenId);
      }
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
      const { data: freshSaldoCli } = await supabase.from("clientes").select("saldo").eq("id", clientId).single();
      const nuevoSaldo = (freshSaldoCli?.saldo ?? 0);
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
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Monto total NC</p><p className="text-2xl font-bold text-red-600">-{formatCurrency(totalNC)}</p></CardContent></Card>
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
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Período">
                          {ncFilterMode === "all" ? "Todos" : ncFilterMode === "day" ? "Día" : ncFilterMode === "month" ? "Mensual" : "Entre fechas"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="day">Día</SelectItem>
                        <SelectItem value="month">Mensual</SelectItem>
                        <SelectItem value="range">Entre fechas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {ncFilterMode === "day" && (
                    <DateInput value={ncFilterDay} onChange={setNcFilterDay} className="w-40" />
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
                        <DateInput value={ncFilterFrom} onChange={setNcFilterFrom} className="w-40" />
                      </div>
                      <div className="flex items-center gap-1">
                        <Label className="text-xs">Hasta</Label>
                        <DateInput value={ncFilterTo} onChange={setNcFilterTo} className="w-40" />
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
                      <tr className="bg-muted/40 border-b text-muted-foreground">
                        <th className="text-left py-2.5 px-4 font-medium text-xs uppercase tracking-wide">Número</th>
                        <th className="text-left py-2.5 px-4 font-medium text-xs uppercase tracking-wide">Fecha</th>
                        <th className="text-left py-2.5 px-4 font-medium text-xs uppercase tracking-wide">Tipo</th>
                        <th className="text-left py-2.5 px-4 font-medium text-xs uppercase tracking-wide">Cliente</th>
                        <th className="text-left py-2.5 px-4 font-medium text-xs uppercase tracking-wide">Devolución vía</th>
                        <th className="text-right py-2.5 px-4 font-medium text-xs uppercase tracking-wide">Total</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredNotas.map((n) => (
                        <tr
                          key={n.id}
                          className="border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                          onClick={() => openDetail(n)}
                        >
                          <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{n.numero}</td>
                          <td className="py-3 px-4 text-sm text-muted-foreground">
                            {new Date(n.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })}
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant="secondary" className="text-xs">
                              {(n.tipo_comprobante || "").replace("Nota de Crédito", "NC")}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 font-medium">{n.clientes?.nombre || "Consumidor Final"}</td>
                          <td className="py-3 px-4">
                            <Badge variant="outline" className={`text-xs font-medium ${
                              n.forma_pago === "Efectivo"
                                ? "bg-green-50 border-green-200 text-green-700"
                                : n.forma_pago === "Transferencia"
                                ? "bg-blue-50 border-blue-200 text-blue-700"
                                : n.forma_pago === "Cuenta Corriente"
                                ? "bg-violet-50 border-violet-200 text-violet-700"
                                : "bg-gray-50 border-gray-200 text-gray-600"
                            }`}>
                              {n.forma_pago === "Cuenta Corriente" ? "Cta. Corriente" : n.forma_pago || "-"}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-right font-semibold text-red-600 font-mono text-sm">
                            -{formatCurrency(n.total)}
                          </td>
                          <td className="py-3 px-4">
                            <button className="w-7 h-7 flex items-center justify-center rounded-md border border-border hover:bg-muted transition-colors">
                              <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                            </button>
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
                          {selectedClient ? selectedClient.nombre : "Consumidor Final"}
                        </Button>
                        {clientId && (
                          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => { setClientId(""); setClientSearch(""); setOrigenId(""); setItems([]); setOrigenAvailable([]); setOrigenRemainingUnits({}); setOrigenUnidadesQtys({}); }}>
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                      <Dialog open={clientOpen} onOpenChange={setClientOpen}>
                        <DialogContent className="max-w-md">
                          <DialogHeader><DialogTitle>Seleccionar Cliente</DialogTitle></DialogHeader>
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input placeholder="Buscar por nombre, CUIT o teléfono..." value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} className="pl-9" autoFocus />
                          </div>
                          <div className="max-h-[400px] overflow-y-auto space-y-1">
                            <button
                              className={`w-full text-left px-3 py-2.5 rounded-md border-2 transition-colors ${!clientId ? "border-emerald-500 bg-emerald-50" : "border-transparent hover:bg-muted"}`}
                              onClick={() => { setClientId(""); setClientSearch(""); setClientOpen(false); }}
                            >
                              <div className="font-medium text-sm">Consumidor Final</div>
                              <div className="text-xs text-muted-foreground mt-0.5">Sin datos de cliente</div>
                            </button>
                            {filteredClients.slice(0, 30).map((c) => (
                              <button key={c.id} className="w-full text-left px-3 py-2.5 hover:bg-muted rounded-md border transition-colors"
                                onClick={() => { setClientId(c.id); setClientSearch(""); setClientOpen(false); }}>
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="font-medium text-sm truncate">{c.nombre}</div>
                                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                                      {c.telefono && <span>{c.telefono}</span>}
                                      {c.cuit && <><span>·</span><span>CUIT: {c.cuit}</span></>}
                                    </div>
                                  </div>
                                  {c.saldo !== undefined && c.saldo !== 0 && (
                                    <span className={`text-xs font-semibold shrink-0 ${c.saldo > 0 ? "text-red-500" : "text-emerald-600"}`}>
                                      {formatCurrency(c.saldo)}
                                    </span>
                                  )}
                                </div>
                              </button>
                            ))}
                            {filteredClients.length === 0 && <p className="px-3 py-6 text-sm text-muted-foreground text-center">Sin resultados</p>}
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Comprobante de origen (opcional)</Label>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="flex-1 justify-start text-sm font-normal truncate"
                          onClick={() => setOrigenSelectOpen(true)}
                        >
                          <Search className="w-4 h-4 mr-2 text-muted-foreground shrink-0" />
                          {origenId && origenId !== "none" ? (() => {
                            const v = clientVentas.find((cv) => cv.id === origenId);
                            if (!v) return "Sin referencia";
                            const fecha = v.fecha ? new Date(v.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "";
                            return <span className="truncate">{fecha && `${fecha} · `}{v.tipo_comprobante} {v.numero} — {formatCurrency(v.total)}</span>;
                          })() : "Sin referencia"}
                        </Button>
                        {origenId && (
                          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => { setOrigenId(""); setItems([]); setOrigenAvailable([]); setOrigenRemainingUnits({}); setOrigenUnidadesQtys({}); }}>
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                      <Dialog open={origenSelectOpen} onOpenChange={(o) => { setOrigenSelectOpen(o); if (!o) setOrigenSelectSearch(""); }}>
                        <DialogContent className="max-w-xl">
                          <DialogHeader><DialogTitle>Seleccionar comprobante de origen</DialogTitle></DialogHeader>
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input placeholder="Buscar por número, tipo o forma de pago..." value={origenSelectSearch} onChange={(e) => setOrigenSelectSearch(e.target.value)} className="pl-9" autoFocus />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Desde</Label>
                              <DateInput value={origenFilterFrom} onChange={setOrigenFilterFrom} className="text-sm" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Hasta</Label>
                              <DateInput value={origenFilterTo} onChange={setOrigenFilterTo} className="text-sm" />
                            </div>
                          </div>
                          {(origenFilterFrom || origenFilterTo) && (
                            <button
                              className="text-xs text-muted-foreground hover:text-foreground self-start"
                              onClick={() => { setOrigenFilterFrom(""); setOrigenFilterTo(""); }}
                            >
                              Limpiar fechas
                            </button>
                          )}
                          <p className="text-xs text-muted-foreground -mt-1">Tip: click derecho sobre un comprobante para ver sus productos.</p>
                          <div className="max-h-[400px] overflow-y-auto space-y-1">
                            <button
                              className="w-full text-left px-3 py-2 hover:bg-muted rounded-md text-sm italic text-muted-foreground border border-dashed"
                              onClick={() => { setOrigenId(""); setItems([]); setOrigenAvailable([]); setOrigenSelectOpen(false); }}
                            >
                              Sin referencia (NC manual)
                            </button>
                            {(() => {
                              const q = norm(origenSelectSearch);
                              const list = q ? clientVentas.filter((v) =>
                                norm(v.numero || "").includes(q) ||
                                norm(v.tipo_comprobante || "").includes(q) ||
                                norm(v.forma_pago || "").includes(q)
                              ) : clientVentas;
                              if (list.length === 0) return <p className="px-3 py-6 text-sm text-muted-foreground text-center">Sin resultados</p>;
                              return list.map((v) => {
                                const fecha = v.fecha ? new Date(v.fecha + "T12:00:00").toLocaleDateString("es-AR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
                                const hora = v.created_at ? new Date(v.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
                                return (
                                  <button
                                    key={v.id}
                                    className="w-full text-left px-3 py-2.5 hover:bg-muted rounded-md border transition-colors"
                                    onClick={() => { setOrigenId(v.id); setItems([]); setOrigenAvailable([]); setOrigenSelectOpen(false); }}
                                    onContextMenu={async (e) => {
                                      e.preventDefault();
                                      setPreviewVenta(v);
                                      setPreviewItems([]);
                                      setPreviewLoading(true);
                                      const { data } = await supabase
                                        .from("venta_items")
                                        .select("descripcion, cantidad, presentacion, precio_unitario, subtotal")
                                        .eq("venta_id", v.id)
                                        .order("id");
                                      setPreviewItems(data || []);
                                      setPreviewLoading(false);
                                    }}
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="font-medium text-sm truncate">{v.tipo_comprobante} {v.numero}</div>
                                        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                                          <span>{fecha}{hora && ` · ${hora}`}</span>
                                          <span>·</span>
                                          <span>{v.forma_pago}</span>
                                        </div>
                                      </div>
                                      <span className="font-semibold text-sm shrink-0">{formatCurrency(v.total)}</span>
                                    </div>
                                  </button>
                                );
                              });
                            })()}
                          </div>
                        </DialogContent>
                      </Dialog>

                      <Dialog open={!!previewVenta} onOpenChange={(o) => { if (!o) { setPreviewVenta(null); setPreviewItems([]); } }}>
                        <DialogContent className="max-w-lg">
                          <DialogHeader>
                            <DialogTitle>
                              {previewVenta ? `${previewVenta.tipo_comprobante} ${previewVenta.numero}` : "Detalle"}
                            </DialogTitle>
                          </DialogHeader>
                          {previewVenta && (
                            <div className="text-xs text-muted-foreground flex gap-3 flex-wrap">
                              <span>
                                {previewVenta.fecha ? new Date(previewVenta.fecha + "T12:00:00").toLocaleDateString("es-AR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }) : "—"}
                                {previewVenta.created_at && ` · ${new Date(previewVenta.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false })}`}
                              </span>
                              <span>·</span>
                              <span>{previewVenta.forma_pago}</span>
                              <span>·</span>
                              <span className="font-semibold text-foreground">{formatCurrency(previewVenta.total)}</span>
                            </div>
                          )}
                          <div className="max-h-[400px] overflow-y-auto">
                            {previewLoading ? (
                              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                            ) : previewItems.length === 0 ? (
                              <p className="text-sm text-muted-foreground text-center py-6">Sin items</p>
                            ) : (
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-xs text-muted-foreground border-b">
                                    <th className="text-left py-2">Producto</th>
                                    <th className="text-right py-2">Cant.</th>
                                    <th className="text-right py-2">P.Unit.</th>
                                    <th className="text-right py-2">Subtotal</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {previewItems.map((it, idx) => (
                                    <tr key={idx} className="border-b last:border-0">
                                      <td className="py-2">
                                        <div>{it.descripcion}</div>
                                        {it.presentacion && it.presentacion !== "Unidad" && (
                                          <div className="text-xs text-muted-foreground">{it.presentacion}</div>
                                        )}
                                      </td>
                                      <td className="py-2 text-right">{it.cantidad}</td>
                                      <td className="py-2 text-right">{formatCurrency(it.precio_unitario || 0)}</td>
                                      <td className="py-2 text-right font-medium">{formatCurrency(it.subtotal || 0)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                          {previewVenta && (
                            <div className="flex gap-2 pt-2 border-t">
                              <Button
                                variant="default"
                                className="flex-1"
                                onClick={() => {
                                  if (!previewVenta) return;
                                  setOrigenId(previewVenta.id);
                                  setItems([]);
                                  setOrigenAvailable([]);
                                  setOrigenRemainingUnits({});
                                  setOrigenUnidadesQtys({});
                                  setPreviewVenta(null);
                                  setPreviewItems([]);
                                  setOrigenSelectOpen(false);
                                }}
                              >
                                Usar este comprobante
                              </Button>
                              <Button variant="outline" onClick={() => { setPreviewVenta(null); setPreviewItems([]); }}>
                                Cerrar
                              </Button>
                            </div>
                          )}
                        </DialogContent>
                      </Dialog>
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
                    <div className="flex gap-2 flex-wrap">
                      <Button variant="outline" size="sm" onClick={() => setFreeText(true)}>
                        <FileText className="w-4 h-4 mr-2" />Texto libre
                      </Button>
                      {origenId && origenId !== "none" && origenAvailable.length > 0 && (
                        <Button variant="outline" size="sm" onClick={() => setOrigenPickerOpen(true)}>
                          <Plus className="w-4 h-4 mr-2" />Del comprobante ({origenAvailable.length})
                        </Button>
                      )}
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
                      {METODOS_DEV.filter(m => clientId || m.value !== "Cuenta Corriente").map(({ value, label, icon: Icon }) => (
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
                disabled={items.length === 0 || saving}>
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
                  <p className="font-bold text-xs">{ncDetail.nc.clientes?.nombre || "Consumidor Final"}</p>
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
                        {ncDetail.items.filter((item: any) => item.cantidad > 0 && item.subtotal > 0).map((item: any) => (
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

      {/* Origen items picker */}
      <Dialog open={origenPickerOpen} onOpenChange={(o) => { setOrigenPickerOpen(o); if (!o) { setOrigenPickerSearch(""); setOrigenPickerQtys({}); setOrigenUnidadesQtys({}); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Agregar items del comprobante</DialogTitle></DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar por nombre o código..." value={origenPickerSearch} onChange={(e) => setOrigenPickerSearch(e.target.value)} className="pl-9" autoFocus />
          </div>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {origenAvailable.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Todos los items ya fueron agregados</p>
            ) : (() => {
              const q = norm(origenPickerSearch);
              const filtered = q ? origenAvailable.filter((it) => norm(it.description).includes(q) || norm(it.code || "").includes(q)) : origenAvailable;
              if (filtered.length === 0) return <p className="text-sm text-muted-foreground text-center py-8">Sin resultados</p>;
              return filtered.map((it) => {
                const currentQty = origenPickerQtys[it.id] ?? (it.maxQty > 0 ? 1 : 0);
                const upp = it.unidades_por_presentacion || 1;
                const remainingUnits = origenRemainingUnits[it.id] ?? (it.maxQty * upp);
                const unitPrice = upp > 0 ? it.price / upp : it.price;
                const currentUnidades = origenUnidadesQtys[it.id] ?? (remainingUnits > 0 ? 1 : 0);
                const consumeLine = (consumedUnits: number) => {
                  const newRemaining = Math.max(0, remainingUnits - consumedUnits);
                  if (newRemaining <= 0) {
                    setOrigenAvailable((prev) => prev.filter((x) => x.id !== it.id));
                    setOrigenRemainingUnits((prev) => { const { [it.id]: _omit, ...rest } = prev; return rest; });
                    setOrigenPickerQtys((prev) => { const { [it.id]: _omit, ...rest } = prev; return rest; });
                    setOrigenUnidadesQtys((prev) => { const { [it.id]: _omit, ...rest } = prev; return rest; });
                  } else {
                    const newCajasMax = Math.floor(newRemaining / upp);
                    setOrigenAvailable((prev) => prev.map((x) => x.id === it.id ? { ...x, maxQty: newCajasMax } : x));
                    setOrigenRemainingUnits((prev) => ({ ...prev, [it.id]: newRemaining }));
                    setOrigenPickerQtys((prev) => ({ ...prev, [it.id]: newCajasMax > 0 ? Math.min(prev[it.id] ?? 1, newCajasMax) : 0 }));
                    setOrigenUnidadesQtys((prev) => ({ ...prev, [it.id]: Math.min(prev[it.id] ?? 1, newRemaining) }));
                  }
                };
                return (
                  <div key={it.id} className="w-full rounded-xl border p-3 hover:border-primary/30 space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{it.description}</div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                          <span className="font-mono">{it.code}</span>
                          <span>·</span>
                          <span>{it.presentacion}</span>
                          <span>·</span>
                          <span className="font-semibold text-foreground">{formatCurrency(it.price)}</span>
                          <span>·</span>
                          <span>Restan: <strong>{it.maxQty}</strong> {upp > 1 ? `(${remainingUnits} u.)` : ""}</span>
                        </div>
                      </div>
                    </div>
                    {it.maxQty > 0 && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">{upp > 1 ? `Devolver ${it.presentacion}:` : "Cantidad:"}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="outline" size="icon" className="h-8 w-8"
                            onClick={() => setOrigenPickerQtys((prev) => ({ ...prev, [it.id]: Math.max(1, (prev[it.id] ?? 1) - 1) }))}>−</Button>
                          <Input type="number" value={currentQty}
                            onChange={(e) => { const v = Number(e.target.value) || 1; setOrigenPickerQtys((prev) => ({ ...prev, [it.id]: Math.min(Math.max(1, v), it.maxQty) })); }}
                            className="w-14 h-8 text-center" min={1} max={it.maxQty} />
                          <Button variant="outline" size="icon" className="h-8 w-8"
                            onClick={() => setOrigenPickerQtys((prev) => ({ ...prev, [it.id]: Math.min(it.maxQty, (prev[it.id] ?? 1) + 1) }))}>+</Button>
                          <Button size="sm" className="h-8 ml-1"
                            onClick={() => {
                              const qty = Math.min(Math.max(1, currentQty), it.maxQty);
                              setItems((prev) => [...prev, { ...it, id: crypto.randomUUID(), qty, subtotal: it.price * qty }]);
                              consumeLine(qty * upp);
                            }}>
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                    {upp > 1 && remainingUnits > 0 && (
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-dashed">
                        <span className="text-xs text-muted-foreground">Devolver unidades sueltas <span className="text-[10px]">({formatCurrency(unitPrice)} c/u)</span>:</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="outline" size="icon" className="h-8 w-8"
                            onClick={() => setOrigenUnidadesQtys((prev) => ({ ...prev, [it.id]: Math.max(1, (prev[it.id] ?? 1) - 1) }))}>−</Button>
                          <Input type="number" value={currentUnidades}
                            onChange={(e) => { const v = Number(e.target.value) || 1; setOrigenUnidadesQtys((prev) => ({ ...prev, [it.id]: Math.min(Math.max(1, v), remainingUnits) })); }}
                            className="w-14 h-8 text-center" min={1} max={remainingUnits} />
                          <Button variant="outline" size="icon" className="h-8 w-8"
                            onClick={() => setOrigenUnidadesQtys((prev) => ({ ...prev, [it.id]: Math.min(remainingUnits, (prev[it.id] ?? 1) + 1) }))}>+</Button>
                          <Button size="sm" variant="secondary" className="h-8 ml-1"
                            onClick={() => {
                              const n = Math.min(Math.max(1, currentUnidades), remainingUnits);
                              setItems((prev) => [...prev, {
                                id: crypto.randomUUID(),
                                producto_id: it.producto_id,
                                code: it.code,
                                description: `${it.description} (sueltas)`,
                                qty: n,
                                maxQty: n,
                                unit: "UN",
                                price: unitPrice,
                                subtotal: unitPrice * n,
                                presentacion: "Unidad",
                                unidades_por_presentacion: 1,
                                alreadyReturned: false,
                                costo_unitario: it.costo_unitario / upp,
                              }]);
                              consumeLine(n);
                            }}>
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
          <div className="flex justify-between gap-2 pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const newItems = origenAvailable
                  .filter((it) => it.maxQty > 0)
                  .map((it) => {
                    const qty = Math.min(Math.max(1, origenPickerQtys[it.id] ?? 1), it.maxQty);
                    return { ...it, id: crypto.randomUUID(), qty, subtotal: it.price * qty };
                  });
                setItems((prev) => [...prev, ...newItems]);
                setOrigenAvailable([]);
                setOrigenRemainingUnits({});
                setOrigenPickerQtys({});
                setOrigenUnidadesQtys({});
                setOrigenPickerOpen(false);
              }}
              disabled={origenAvailable.length === 0}
            >
              Agregar todos
            </Button>
            <Button variant="outline" size="sm" onClick={() => setOrigenPickerOpen(false)}>Cerrar</Button>
          </div>
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
