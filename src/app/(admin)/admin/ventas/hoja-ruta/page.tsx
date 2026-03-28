"use client";

import { nowTimeARG, formatCurrency } from "@/lib/formatters";
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
import Link from "next/link";
import { VentaDetailDialog } from "@/components/venta-detail-dialog";
import {
  Truck,
  Package,
  Eye,
  RefreshCw,
  Calendar,
  DollarSign,
  CheckCircle,
  Clock,
  MapPin,
  Phone,
  Loader2,
  ArrowUp,
  ArrowDown,
  Globe,
  MessageCircle,
  Navigation,
  ChevronDown,
  ChevronUp,
  Map,
  List,
  Route,
  AlertCircle,
} from "lucide-react";

interface ClienteInfo {
  id: string;
  nombre: string;
  domicilio: string | null;
  localidad: string | null;
  telefono: string | null;
  saldo: number;
}

interface VentaRow {
  id: string;
  numero: string;
  tipo_comprobante: string;
  fecha: string;
  forma_pago: string;
  total: number;
  estado: string;
  observacion: string | null;
  entregado: boolean;
  cliente_id: string | null;
  origen: string | null;
  metodo_entrega: string | null;
  clientes: ClienteInfo | null;
  venta_items: VentaItemRow[];
}

interface CuentaBancaria {
  id: string;
  nombre: string;
}

interface VentaItemRow {
  id: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  unidad_medida: string | null;
}


function getArgentinaToday() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

export default function HojaDeRutaPage() {
  const [selectedDate, setSelectedDate] = useState(getArgentinaToday());
  const [ventas, setVentas] = useState<VentaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailVenta, setDetailVenta] = useState<VentaRow | null>(null);
  const [detailPagos, setDetailPagos] = useState<{ metodo: string; monto: number; cuenta_bancaria?: string | null }[]>([]);
  const [dlvConfirm, setDlvConfirm] = useState<{ open: boolean; id: string; pendiente: number; type: "paid" | "unpaid" | "no_client" }>({ open: false, id: "", pendiente: 0, type: "paid" });
  const [orden, setOrden] = useState<Record<string, number>>({});
  const [filterEntrega] = useState<"todos" | "envio" | "retiro">("todos");
  const [search, setSearch] = useState("");
  const [showAllPending, setShowAllPending] = useState(true);

  // Historial de entregas
  const [activeTab, setActiveTab] = useState<"pendientes" | "historial">("pendientes");
  const [historialLoading, setHistorialLoading] = useState(false);
  const [historialVentas, setHistorialVentas] = useState<VentaRow[]>([]);
  const [historialPagos, setHistorialPagos] = useState<Record<string, { monto: number; metodo: string }[]>>({});
  const [historialDateFrom, setHistorialDateFrom] = useState(getArgentinaToday());
  const [historialDateTo, setHistorialDateTo] = useState(getArgentinaToday());
  const [historialSearch, setHistorialSearch] = useState("");


  // Route view
  const [viewMode, setViewMode] = useState<"list" | "ruta">("list");
  const [currentStop, setCurrentStop] = useState(0);

  // Track how much was actually paid per order (from caja_movimientos)
  const [pagadoPorVenta, setPagadoPorVenta] = useState<Record<string, number>>({});

  const fetchVentas = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("ventas")
      .select(
        "id, numero, tipo_comprobante, fecha, forma_pago, total, estado, observacion, entregado, cliente_id, origen, metodo_entrega, clientes(id, nombre, domicilio, localidad, telefono, saldo), venta_items(id, descripcion, cantidad, precio_unitario, subtotal, unidad_medida)"
      )
      .eq("entregado", false)
      .in("metodo_entrega", ["envio", "envio_a_domicilio", "envio a domicilio"])
      .neq("estado", "anulada")
      .not("tipo_comprobante", "ilike", "Nota de Crédito%")
      .not("tipo_comprobante", "ilike", "NC%")
      .not("cliente_id", "is", null)
      .order("created_at", { ascending: false });

    // If not showing all pending, filter by selected date only
    if (!showAllPending) {
      query = query.eq("fecha", selectedDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    const rows = (data || []) as unknown as VentaRow[];
    setVentas(rows);

    // Fetch payments per order from caja_movimientos + NC refunds
    if (rows.length > 0) {
      const ventaIds = rows.map((v) => v.id);
      const [{ data: movs }, { data: ncVentas }] = await Promise.all([
        supabase
          .from("caja_movimientos")
          .select("referencia_id, monto")
          .eq("tipo", "ingreso")
          .eq("referencia_tipo", "venta")
          .in("referencia_id", ventaIds),
        // Find NCs linked to these sales (NC has remito_origen_id pointing to original)
        supabase
          .from("ventas")
          .select("remito_origen_id, total")
          .in("remito_origen_id", ventaIds)
          .ilike("tipo_comprobante", "Nota de Crédito%")
          .neq("estado", "anulada"),
      ]);

      const pagadoMap: Record<string, number> = {};
      (movs || []).forEach((m: { referencia_id: string; monto: number }) => {
        pagadoMap[m.referencia_id] = (pagadoMap[m.referencia_id] || 0) + m.monto;
      });
      // Add NC refund amounts as "paid" (they reduce what the client owes)
      (ncVentas || []).forEach((nc: any) => {
        if (nc.remito_origen_id) {
          pagadoMap[nc.remito_origen_id] = (pagadoMap[nc.remito_origen_id] || 0) + (nc.total || 0);
        }
      });
      setPagadoPorVenta(pagadoMap);
    } else {
      setPagadoPorVenta({});
    }

    // Initialize order sequence
    const newOrden: Record<string, number> = {};
    rows.forEach((v, i) => {
      newOrden[v.id] = orden[v.id] ?? i + 1;
    });
    setOrden(newOrden);

    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, showAllPending]);

  useEffect(() => {
    fetchVentas();
  }, [fetchVentas]);

  const fetchHistorial = useCallback(async () => {
    setHistorialLoading(true);
    const nextDay = new Date(historialDateTo + "T12:00:00");
    nextDay.setDate(nextDay.getDate() + 1);
    const endDate = nextDay.toISOString().split("T")[0];

    const { data, error } = await supabase
      .from("ventas")
      .select(
        "id, numero, tipo_comprobante, fecha, forma_pago, total, estado, observacion, entregado, cliente_id, origen, metodo_entrega, clientes(id, nombre, domicilio, localidad, telefono, saldo), venta_items(id, descripcion, cantidad, precio_unitario, subtotal, unidad_medida)"
      )
      .eq("entregado", true)
      .gte("fecha", historialDateFrom)
      .lt("fecha", endDate)
      .neq("estado", "anulada")
      .not("tipo_comprobante", "ilike", "Nota de Crédito%")
      .not("tipo_comprobante", "ilike", "NC%")
      .order("fecha", { ascending: false });

    const rows = (data || []) as unknown as VentaRow[];
    setHistorialVentas(rows);

    // Fetch payments for these orders + NC refunds
    if (rows.length > 0) {
      const ventaIds = rows.map((v) => v.id);
      const [{ data: movs }, { data: ncVentas }] = await Promise.all([
        supabase
          .from("caja_movimientos")
          .select("referencia_id, monto, metodo_pago")
          .eq("tipo", "ingreso")
          .eq("referencia_tipo", "venta")
          .in("referencia_id", ventaIds),
        supabase
          .from("ventas")
          .select("remito_origen_id, total")
          .in("remito_origen_id", ventaIds)
          .ilike("tipo_comprobante", "Nota de Crédito%")
          .neq("estado", "anulada"),
      ]);

      const pagosMap: Record<string, { monto: number; metodo: string }[]> = {};
      (movs || []).forEach((m: { referencia_id: string; monto: number; metodo_pago: string }) => {
        if (!pagosMap[m.referencia_id]) pagosMap[m.referencia_id] = [];
        pagosMap[m.referencia_id].push({ monto: m.monto, metodo: m.metodo_pago });
      });
      // Add NC refunds as payments
      (ncVentas || []).forEach((nc: any) => {
        if (nc.remito_origen_id && nc.total > 0) {
          if (!pagosMap[nc.remito_origen_id]) pagosMap[nc.remito_origen_id] = [];
          pagosMap[nc.remito_origen_id].push({ monto: nc.total, metodo: "Nota de Crédito" });
        }
      });
      setHistorialPagos(pagosMap);
    } else {
      setHistorialPagos({});
    }

    setHistorialLoading(false);
  }, [historialDateFrom, historialDateTo]);

  useEffect(() => {
    if (activeTab === "historial") {
      fetchHistorial();
    }
  }, [activeTab, fetchHistorial]);

  const filteredHistorial = historialVentas.filter((v) => {
    if (historialSearch) {
      const s = historialSearch.toLowerCase();
      if (!v.numero.toLowerCase().includes(s) && !(v.clientes?.nombre || "").toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const historialTotalVentas = filteredHistorial.reduce((s, v) => s + v.total, 0);
  const historialTotalCobrado = filteredHistorial.reduce((s, v) => {
    const pagos = historialPagos[v.id] || [];
    return s + pagos.filter(p => !p.metodo.includes("Nota de Cr")).reduce((a, p) => a + p.monto, 0);
  }, 0);
  const historialTotalNC = filteredHistorial.reduce((s, v) => {
    const pagos = historialPagos[v.id] || [];
    return s + pagos.filter(p => p.metodo.includes("Nota de Cr")).reduce((a, p) => a + p.monto, 0);
  }, 0);

  // Group historial by day
  const historialByDay = (() => {
    const map: Record<string, VentaRow[]> = {};
    for (const v of filteredHistorial) {
      const day = v.fecha;
      if (!map[day]) map[day] = [];
      map[day].push(v);
    }
    // Sort days descending
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
  })();

  const handleMarkDelivered = async (id: string) => {
    const venta = ventas.find((v) => v.id === id);
    if (!venta) return;

    const pagado = pagadoPorVenta[id] || 0;
    const pendiente = Math.max(0, venta.total - pagado);

    if (pendiente > 0 && !venta.cliente_id) {
      setDlvConfirm({ open: true, id, pendiente, type: "no_client" });
      return;
    }
    if (pendiente > 0) {
      setDlvConfirm({ open: true, id, pendiente, type: "unpaid" });
      return;
    }
    setDlvConfirm({ open: true, id, pendiente: 0, type: "paid" });
  };

  const executeDlvConfirm = async () => {
    const { id, pendiente, type } = dlvConfirm;
    const venta = ventas.find((v) => v.id === id);
    if (!venta || type === "no_client") {
      setDlvConfirm({ open: false, id: "", pendiente: 0, type: "paid" });
      return;
    }
    setDlvConfirm({ open: false, id: "", pendiente: 0, type: "paid" });

    if (type === "unpaid" && pendiente > 0 && venta.cliente_id) {
      // Check if cuenta_corriente entry already exists for this venta (e.g. from partial payment)
      const { data: existingCC } = await supabase
        .from("cuenta_corriente")
        .select("id")
        .eq("venta_id", venta.id)
        .gt("debe", 0)
        .limit(1);

      if (!existingCC || existingCC.length === 0) {
        const { data: freshCli } = await supabase.from("clientes").select("saldo").eq("id", venta.cliente_id).single();
        const saldoActual = freshCli?.saldo ?? venta.clientes?.saldo ?? 0;
        const nuevoSaldo = saldoActual + pendiente;
        await supabase.from("clientes").update({ saldo: nuevoSaldo }).eq("id", venta.cliente_id);
        await supabase.from("cuenta_corriente").insert({
          cliente_id: venta.cliente_id,
          fecha: new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }),
          comprobante: `Entrega #${venta.numero}`,
          descripcion: `Saldo pendiente de entrega`,
          debe: pendiente,
          haber: 0,
          saldo: nuevoSaldo,
          forma_pago: venta.forma_pago || "Efectivo",
          venta_id: venta.id,
        });
      }
    }

    const { error } = await supabase
      .from("ventas")
      .update({ entregado: true, estado: "entregado" })
      .eq("id", id);
    if (error) {
      console.error(error);
      return;
    }
    // Sync estado to linked pedido_tienda (so client sees "entregado")
    if (venta.numero) {
      const { error: syncErr } = await supabase.from("pedidos_tienda").update({ estado: "entregado" }).eq("numero", venta.numero);
      if (syncErr) console.error("Error syncing pedido_tienda:", syncErr);
    }
    setVentas((prev) => prev.filter((v) => v.id !== id));
  };

  const handleViewDetail = async (venta: VentaRow) => {
    setDetailVenta(venta);
    setDetailPagos([]);
    setDetailOpen(true);
    const [{ data: movs }, { data: ncVentas }] = await Promise.all([
      supabase.from("caja_movimientos").select("metodo_pago, monto, tipo, cuenta_bancaria").eq("referencia_id", venta.id).eq("referencia_tipo", "venta").eq("tipo", "ingreso"),
      supabase.from("ventas").select("id, total").eq("remito_origen_id", venta.id).ilike("tipo_comprobante", "Nota de Crédito%").neq("estado", "anulada"),
    ]);
    const pagos: { metodo: string; monto: number; cuenta_bancaria?: string | null }[] = [];
    if (movs && movs.length > 0) {
      pagos.push(...movs.map((m: any) => ({ metodo: m.metodo_pago, monto: Math.abs(m.monto), cuenta_bancaria: m.cuenta_bancaria })));
    } else if (venta.forma_pago) {
      pagos.push({ metodo: venta.forma_pago, monto: venta.total });
    }
    // Add NC refunds as settled amount
    const ncTotal = (ncVentas || []).reduce((s: number, nc: any) => s + (nc.total || 0), 0);
    if (ncTotal > 0) {
      pagos.push({ metodo: "Nota de Crédito (devolución)", monto: ncTotal });
    }
    setDetailPagos(pagos);
  };

  // Payment dialog state
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payVenta, setPayVenta] = useState<VentaRow | null>(null);
  const [payMetodo, setPayMetodo] = useState<"Efectivo" | "Transferencia" | "Mixto">("Efectivo");
  const [payMonto, setPayMonto] = useState(0);
  const [payEfectivo, setPayEfectivo] = useState(0);
  const [payTransferencia, setPayTransferencia] = useState(0);
  const [payCuentaBancariaId, setPayCuentaBancariaId] = useState("");
  const [paySaving, setPaySaving] = useState(false);
  const [cuentasBancarias, setCuentasBancarias] = useState<CuentaBancaria[]>([]);

  // Load bank accounts from DB (fallback to localStorage)
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("cuentas_bancarias").select("id, nombre, alias, cbu_cvu, tipo_cuenta, titular").eq("activo", true).order("nombre");
      if (data && data.length > 0) {
        setCuentasBancarias(data as CuentaBancaria[]);
      } else {
        try {
          const stored = localStorage.getItem("cuentas_bancarias");
          if (stored) setCuentasBancarias(JSON.parse(stored));
        } catch {}
      }
    })();
  }, []);

  const openPayDialog = (v: VentaRow) => {
    const pagado = pagadoPorVenta[v.id] || 0;
    const debe = Math.max(0, v.total - pagado);
    setPayVenta(v);
    // Default to the payment method the client selected
    const metodoOriginal = v.forma_pago === "Transferencia" ? "Transferencia" : v.forma_pago === "Mixto" ? "Mixto" : "Efectivo";
    setPayMetodo(metodoOriginal);
    setPayMonto(debe);
    setPayEfectivo(metodoOriginal === "Mixto" ? Math.floor(debe / 2) : debe);
    setPayTransferencia(metodoOriginal === "Mixto" ? debe - Math.floor(debe / 2) : 0);
    setPayCuentaBancariaId("");
    setPayDialogOpen(true);
  };

  const handleRegistrarPago = async () => {
    if (!payVenta) return;
    const pagado = pagadoPorVenta[payVenta.id] || 0;
    const debe = Math.max(0, payVenta.total - pagado);

    // Calculate total being paid
    let totalPagando = 0;
    if (payMetodo === "Mixto") {
      totalPagando = payEfectivo + payTransferencia;
    } else {
      totalPagando = payMonto;
    }
    if (totalPagando <= 0) return;

    setPaySaving(true);
    const hoy = getArgentinaToday();
    const hora = nowTimeARG();
    const montoReal = Math.min(totalPagando, debe);
    const saldoPendiente = debe - montoReal;
    const cuentaSeleccionada = payCuentaBancariaId ? cuentasBancarias.find((c) => c.id === payCuentaBancariaId) : null;

    // Register payment(s) in caja
    if (payMetodo === "Mixto") {
      if (payEfectivo > 0) {
        await supabase.from("caja_movimientos").insert({
          fecha: hoy, hora, tipo: "ingreso",
          descripcion: `Cobro entrega #${payVenta.numero} (Efectivo) — ${payVenta.clientes?.nombre || ""}`,
          metodo_pago: "Efectivo",
          monto: Math.min(payEfectivo, debe),
          referencia_id: payVenta.id, referencia_tipo: "venta",
        });
      }
      if (payTransferencia > 0) {
        await supabase.from("caja_movimientos").insert({
          fecha: hoy, hora, tipo: "ingreso",
          descripcion: `Cobro entrega #${payVenta.numero} (Transferencia) — ${payVenta.clientes?.nombre || ""}${cuentaSeleccionada ? ` → ${cuentaSeleccionada.nombre}` : ""}`,
          metodo_pago: "Transferencia",
          monto: Math.min(payTransferencia, debe - Math.min(payEfectivo, debe)),
          referencia_id: payVenta.id, referencia_tipo: "venta",
          ...(cuentaSeleccionada ? { cuenta_bancaria: cuentaSeleccionada.nombre } : {}),
        });
      }
    } else {
      await supabase.from("caja_movimientos").insert({
        fecha: hoy, hora, tipo: "ingreso",
        descripcion: `Cobro entrega #${payVenta.numero} (${payMetodo}) — ${payVenta.clientes?.nombre || ""}${payMetodo === "Transferencia" && cuentaSeleccionada ? ` → ${cuentaSeleccionada.nombre}` : ""}`,
        metodo_pago: payMetodo,
        monto: montoReal,
        referencia_id: payVenta.id, referencia_tipo: "venta",
        ...(payMetodo === "Transferencia" && cuentaSeleccionada ? { cuenta_bancaria: cuentaSeleccionada.nombre } : {}),
      });
    }

    // If there's a pending balance, add to client's cuenta corriente
    if (saldoPendiente > 0 && payVenta.cliente_id) {
      const { data: freshCli } = await supabase.from("clientes").select("saldo").eq("id", payVenta.cliente_id).single();
      const clientSaldo = freshCli?.saldo ?? payVenta.clientes?.saldo ?? 0;
      const newSaldo = clientSaldo + saldoPendiente;
      await supabase.from("cuenta_corriente").insert({
        cliente_id: payVenta.cliente_id,
        fecha: hoy,
        comprobante: `Saldo pendiente #${payVenta.numero}`,
        descripcion: `Saldo pendiente de entrega — ${payVenta.numero}`,
        debe: saldoPendiente,
        haber: 0,
        saldo: newSaldo,
        forma_pago: "Cuenta Corriente",
        venta_id: payVenta.id,
      });
      await supabase.from("clientes").update({ saldo: newSaldo }).eq("id", payVenta.cliente_id);
    }

    // Update venta forma_pago to reflect actual payment
    await supabase.from("ventas").update({ forma_pago: payMetodo }).eq("id", payVenta.id);

    // Auto-mark as delivered if full amount was paid
    if (saldoPendiente <= 0) {
      await supabase.from("ventas").update({ entregado: true, estado: "entregado" }).eq("id", payVenta.id);
      await supabase.from("pedidos_tienda").update({ estado: "entregado" }).eq("numero", payVenta.numero);
    }

    setPaySaving(false);
    setPayDialogOpen(false);
    fetchVentas();
  };

  const handleOrdenChange = (id: string, value: string) => {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num > 0) {
      setOrden((prev) => ({ ...prev, [id]: num }));
    }
  };

  const moveOrder = (id: string, direction: "up" | "down") => {
    setOrden((prev) => {
      const currentVal = prev[id] ?? 1;
      const newVal = direction === "up" ? Math.max(1, currentVal - 1) : currentVal + 1;
      return { ...prev, [id]: newVal };
    });
  };

  // Filter and sort ventas
  const filteredVentas = ventas.filter((v) => {
    if (filterEntrega === "envio" && v.metodo_entrega !== "envio") return false;
    if (filterEntrega === "retiro" && v.metodo_entrega !== "retiro" && v.metodo_entrega !== "retiro_local" && v.metodo_entrega !== null) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!v.numero.toLowerCase().includes(s) && !(v.clientes?.nombre || "").toLowerCase().includes(s)) return false;
    }
    return true;
  });
  const sortedVentas = [...filteredVentas].sort((a, b) => {
    // If both have custom order, use it; otherwise sort by most recent first (array already sorted desc from query)
    const oa = orden[a.id];
    const ob = orden[b.id];
    if (oa !== undefined && ob !== undefined) return oa - ob;
    return 0; // preserve query order (most recent first)
  });

  // Stats (from filtered)
  const totalPedidos = filteredVentas.length;
  const valorTotal = filteredVentas.reduce((s, v) => s + v.total, 0);
  const totalYaPagado = filteredVentas.reduce((s, v) => s + (pagadoPorVenta[v.id] || 0), 0);
  const totalACobrar = Math.max(0, valorTotal - totalYaPagado);


  const navTabs = [
    { name: "Todas las Ventas", href: "/admin/ventas/listado" },
    { name: "Entregas y Ruta", href: "/admin/ventas/hoja-ruta" },
  ];

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      {/* Nav Tabs */}
      <div className="bg-muted rounded-xl p-1 inline-flex">
        {navTabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-lg px-6 py-2.5 text-sm transition-all ${
              tab.href === "/admin/ventas/hoja-ruta"
                ? "bg-background shadow-sm font-semibold text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.name}
          </Link>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <Truck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Entregas y Hoja de Ruta</h1>
            <p className="text-sm text-muted-foreground">Gestiona entregas pendientes, cobros y hoja de ruta</p>
          </div>
        </div>
      </div>

      {/* Pendientes / Historial tabs */}
      <div className="flex items-center justify-between">
        <div className="bg-muted rounded-lg p-1 inline-flex">
          <button
            onClick={() => setActiveTab("pendientes")}
            className={`rounded-md px-5 py-2 text-sm transition-all ${
              activeTab === "pendientes" ? "bg-background shadow-sm font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Package className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
            Entregas Pendientes
          </button>
          <button
            onClick={() => setActiveTab("historial")}
            className={`rounded-md px-5 py-2 text-sm transition-all ${
              activeTab === "historial" ? "bg-white shadow-sm font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Clock className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
            Historial de Entregas
          </button>
        </div>
        {activeTab === "pendientes" && (
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={showAllPending}
                onChange={(e) => setShowAllPending(e.target.checked)}
                className="rounded border-border"
              />
              Todas las pendientes
            </label>
            {!showAllPending && (
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-muted-foreground" />
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-44"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {activeTab === "historial" && (
        <>
          {/* Historial filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Desde</span>
              <Input
                type="date"
                value={historialDateFrom}
                onChange={(e) => setHistorialDateFrom(e.target.value)}
                className="w-40 h-9"
              />
              <span className="text-sm text-muted-foreground">Hasta</span>
              <Input
                type="date"
                value={historialDateTo}
                onChange={(e) => setHistorialDateTo(e.target.value)}
                className="w-40 h-9"
              />
            </div>
            <div className="relative flex-1 max-w-xs">
              <input
                type="text"
                placeholder="Buscar por N° o cliente..."
                value={historialSearch}
                onChange={(e) => setHistorialSearch(e.target.value)}
                className="w-full h-9 pl-3 pr-3 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* Historial stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <CheckCircle className="w-4 h-4" />
                  Entregas Realizadas
                </div>
                <div className="text-2xl font-bold">{filteredHistorial.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <DollarSign className="w-4 h-4" />
                  Total Ventas
                </div>
                <div className="text-2xl font-bold">{formatCurrency(historialTotalVentas)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-green-500 text-sm mb-1">
                  <CheckCircle className="w-4 h-4" />
                  Total Cobrado
                </div>
                <div className="text-2xl font-bold text-green-600">{formatCurrency(historialTotalCobrado)}</div>
                {historialTotalNC > 0 && (
                  <p className="text-xs text-amber-600 mt-1">NC devoluciones: -{formatCurrency(historialTotalNC)}</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Historial grouped by day */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Historial de Entregas</h2>
            <Button variant="outline" size="sm" onClick={fetchHistorial} disabled={historialLoading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${historialLoading ? "animate-spin" : ""}`} />
              Actualizar
            </Button>
          </div>

          {historialLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredHistorial.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="font-medium text-muted-foreground">No hay entregas en este periodo</p>
              <p className="text-sm mt-1">Selecciona otro rango de fechas</p>
            </div>
          ) : (
            <div className="space-y-4">
              {historialByDay.map(([day, dayVentas]) => {
                const dayTotal = dayVentas.reduce((s, v) => s + v.total, 0);
                const dayCobrado = dayVentas.reduce((s, v) => {
                  const pagos = historialPagos[v.id] || [];
                  return s + pagos.filter(p => !p.metodo.includes("Nota de Cr")).reduce((a, p) => a + p.monto, 0);
                }, 0);
                const dayPendiente = dayTotal - dayCobrado;
                const dayLabel = new Date(day + "T12:00:00").toLocaleDateString("es-AR", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                });
                const clientesDeudores = dayVentas.filter((v) => {
                  const pagos = historialPagos[v.id] || [];
                  const cobrado = pagos.reduce((a, p) => a + p.monto, 0);
                  const ncAmount = pagos.filter(p => p.metodo.includes("Nota de Cr")).reduce((a, p) => a + p.monto, 0);
                  return v.total - cobrado > 0 && (v.total - cobrado - ncAmount) !== 0;
                });

                return (
                  <Card key={day}>
                    <CardContent className="p-4">
                      {/* Day header with summary */}
                      <div className="flex items-center justify-between mb-3 pb-3 border-b">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="font-semibold text-foreground capitalize">{dayLabel}</p>
                            <p className="text-xs text-muted-foreground">{dayVentas.length} entrega{dayVentas.length !== 1 ? "s" : ""}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6 text-sm">
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Total</p>
                            <p className="font-bold text-foreground">{formatCurrency(dayTotal)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Cobrado</p>
                            <p className="font-bold text-green-600">{formatCurrency(dayCobrado)}</p>
                          </div>
                          {dayPendiente > 0 && (
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">Pendiente</p>
                              <p className="font-bold text-orange-600">{formatCurrency(dayPendiente)}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Deudores warning */}
                      {clientesDeudores.length > 0 && (
                        <div className="mb-3 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg text-xs text-orange-700">
                          <span className="font-semibold">Saldo pendiente:</span>{" "}
                          {clientesDeudores.map((v) => {
                            const pagos = historialPagos[v.id] || [];
                            const cobrado = pagos.reduce((a, p) => a + p.monto, 0);
                            return `${v.clientes?.nombre || "Sin cliente"} (${formatCurrency(v.total - cobrado)})`;
                          }).join(", ")}
                        </div>
                      )}

                      {/* Day orders table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left text-muted-foreground">
                              <th className="pb-2 px-3">Nro. Venta</th>
                              <th className="pb-2 px-3">Cliente</th>
                              <th className="pb-2 px-3">Entrega</th>
                              <th className="pb-2 px-3 text-right">Total</th>
                              <th className="pb-2 px-3 text-right">Cobrado</th>
                              <th className="pb-2 px-3">Metodo Pago</th>
                              <th className="pb-2 px-3 text-right">Acciones</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dayVentas.map((venta) => {
                              const pagos = historialPagos[venta.id] || [];
                              const cobradoReal = pagos.filter(p => !p.metodo.includes("Nota de Cr")).reduce((a, p) => a + p.monto, 0);
                              const ncMonto = pagos.filter(p => p.metodo.includes("Nota de Cr")).reduce((a, p) => a + p.monto, 0);
                              const totalCobrado = cobradoReal + ncMonto;
                              const metodos = [...new Set(pagos.filter(p => !p.metodo.includes("Nota de Cr")).map((p) => p.metodo))].join(", ") || venta.forma_pago;
                              const debe = venta.total - totalCobrado;

                              return (
                                <tr key={venta.id} className="border-b last:border-b-0 hover:bg-muted/50 transition-colors">
                                  <td className="py-2.5 px-3">
                                    <div className="font-mono text-xs font-semibold text-foreground">{venta.numero}</div>
                                    <span className="text-xs text-muted-foreground">{venta.tipo_comprobante}</span>
                                  </td>
                                  <td className="py-2.5 px-3 font-medium text-foreground">
                                    {venta.clientes?.nombre ?? "Sin cliente"}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <Badge variant={venta.metodo_entrega === "envio" ? "default" : "secondary"} className={`text-xs ${venta.metodo_entrega === "envio" ? "bg-blue-100 text-blue-700 hover:bg-blue-100" : "bg-muted text-muted-foreground hover:bg-muted"}`}>
                                      {venta.metodo_entrega === "envio" ? "Envio" : "Retiro"}
                                    </Badge>
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-semibold text-foreground">
                                    {formatCurrency(venta.total)}
                                  </td>
                                  <td className={`py-2.5 px-3 text-right font-medium ${debe > 0 ? "text-orange-600" : "text-green-600"}`}>
                                    {cobradoReal > 0 ? formatCurrency(cobradoReal) : "$0"}
                                    {ncMonto > 0 && <span className="block text-xs text-amber-600">NC -{formatCurrency(ncMonto)}</span>}
                                    {debe > 0 && <span className="block text-xs text-orange-500">Debe {formatCurrency(debe)}</span>}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <Badge variant="secondary" className="text-xs">{metodos || "---"}</Badge>
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <div className="flex items-center justify-end">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => handleViewDetail(venta)}
                                        title="Ver detalle"
                                      >
                                        <Eye className="w-4 h-4 text-muted-foreground" />
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {activeTab === "pendientes" && (<>
      {/* Search */}
      <div className="flex items-center gap-3">
        <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 text-sm px-3 py-1">
          <Truck className="w-4 h-4 mr-1.5" />
          Solo envios a domicilio
        </Badge>
        <div className="relative flex-1 max-w-xs">
          <input
            type="text"
            placeholder="Buscar por N° o cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 pl-3 pr-3 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Package className="w-4 h-4" />
              Total Entregas
            </div>
            <div className="text-2xl font-bold">{totalPedidos}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Pendientes de entrega
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <DollarSign className="w-4 h-4" />
              Valor Total
            </div>
            <div className="text-2xl font-bold">
              {formatCurrency(valorTotal)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Suma de todas las entregas
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-orange-500 text-sm mb-1">
              <Clock className="w-4 h-4" />
              A Cobrar
            </div>
            <div className="text-2xl font-bold text-orange-600">
              {formatCurrency(totalACobrar)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Saldo pendiente de clientes
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-green-500 text-sm mb-1">
              <CheckCircle className="w-4 h-4" />
              Ya Pagado
            </div>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(totalYaPagado)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Cobrado previamente
            </div>
          </CardContent>
        </Card>
      </div>

      {/* View toggle + Route button */}
      {sortedVentas.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="bg-muted rounded-lg p-1 inline-flex">
            <button
              onClick={() => setViewMode("list")}
              className={`rounded-md px-4 py-2 text-sm transition-all flex items-center gap-1.5 ${
                viewMode === "list" ? "bg-white shadow-sm font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <List className="w-4 h-4" />
              Lista
            </button>
            <button
              onClick={() => { setViewMode("ruta"); setCurrentStop(0); }}
              className={`rounded-md px-4 py-2 text-sm transition-all flex items-center gap-1.5 ${
                viewMode === "ruta" ? "bg-white shadow-sm font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Route className="w-4 h-4" />
              Mapa de Ruta
            </button>
          </div>
          <a
            href={(() => {
              const addresses = sortedVentas
                .map((v) => [v.clientes?.domicilio, v.clientes?.localidad].filter(Boolean).join(", "))
                .filter(Boolean);
              if (addresses.length === 0) return "#";
              if (addresses.length === 1) return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addresses[0])}`;
              const origin = encodeURIComponent(addresses[0]);
              const destination = encodeURIComponent(addresses[addresses.length - 1]);
              const waypoints = addresses.slice(1, -1).map(encodeURIComponent).join("|");
              return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypoints ? `&waypoints=${waypoints}` : ""}`;
            })()}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors ml-auto"
          >
            <Navigation className="w-4 h-4" />
            Ruta Completa en Maps
          </a>
        </div>
      )}

      {/* Route View */}
      {viewMode === "ruta" && sortedVentas.length > 0 && (
        <div className="space-y-4">
          {/* Current stop card */}
          {(() => {
            const venta = sortedVentas[currentStop];
            if (!venta) return null;
            const pagado = pagadoPorVenta[venta.id] || 0;
            const debe = Math.max(0, venta.total - pagado);
            const direccion = [venta.clientes?.domicilio, venta.clientes?.localidad].filter(Boolean).join(", ");
            const mapsUrl = direccion ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}` : null;
            const tel = venta.clientes?.telefono?.replace(/\D/g, "") || "";
            const whatsappUrl = tel ? `https://wa.me/54${tel.startsWith("0") ? tel.slice(1) : tel}` : null;

            return (
              <Card className="border-2 border-blue-300 bg-blue-50/30">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2 text-blue-700 text-sm font-semibold">
                    <Navigation className="w-4 h-4" />
                    Siguiente Parada — {currentStop + 1} de {sortedVentas.length}
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xl font-bold text-foreground">{venta.clientes?.nombre ?? "Sin cliente"}</p>
                      {direccion && (
                        <p className="flex items-start gap-1.5 text-sm text-muted-foreground mt-1">
                          <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
                          {direccion}
                        </p>
                      )}
                      {venta.clientes?.telefono && (
                        <p className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
                          <Phone className="w-4 h-4 shrink-0" />
                          {venta.clientes.telefono}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-2xl font-bold text-foreground">{formatCurrency(venta.total)}</p>
                      <Badge variant="secondary" className={debe > 0 ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}>
                        {debe > 0 ? `Debe ${formatCurrency(debe)}` : "Pagado"}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {mapsUrl && (
                      <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
                        <Navigation className="w-4 h-4" />
                        Navegar
                      </a>
                    )}
                    {whatsappUrl && (
                      <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors">
                        <MessageCircle className="w-4 h-4" />
                        WhatsApp
                      </a>
                    )}
                    {venta.clientes?.telefono && (
                      <a href={`tel:${venta.clientes.telefono}`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-muted text-foreground text-sm font-medium hover:bg-muted transition-colors">
                        <Phone className="w-4 h-4" />
                        Llamar
                      </a>
                    )}
                    {debe > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-10 text-sm text-emerald-600 border-emerald-300 hover:bg-emerald-50"
                        onClick={() => openPayDialog(venta)}
                      >
                        <DollarSign className="w-4 h-4 mr-1" />
                        Cobrar
                      </Button>
                    )}
                    <Button
                      size="sm"
                      className="h-10 text-sm bg-green-600 hover:bg-green-700 text-white"
                      onClick={async () => {
                        await handleMarkDelivered(venta.id);
                        // Move to next stop (stays at same index since array shifts)
                        setCurrentStop((prev) => Math.min(prev, sortedVentas.length - 2));
                      }}
                    >
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Entregado
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {/* All stops list */}
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Paradas ({sortedVentas.length})
              </h3>
              <div className="space-y-1">
                {sortedVentas.map((venta, idx) => {
                  const pagado = pagadoPorVenta[venta.id] || 0;
                  const debe = Math.max(0, venta.total - pagado);
                  const direccion = [venta.clientes?.domicilio, venta.clientes?.localidad].filter(Boolean).join(", ");
                  const isActive = idx === currentStop;

                  return (
                    <button
                      key={venta.id}
                      onClick={() => setCurrentStop(idx)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                        isActive ? "bg-blue-50 border border-blue-200" : "hover:bg-muted/50"
                      }`}
                    >
                      <span className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold shrink-0 ${
                        isActive ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground"
                      }`}>
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`font-medium truncate ${isActive ? "text-blue-900" : "text-foreground"}`}>
                          {venta.clientes?.nombre ?? "Sin cliente"}
                        </p>
                        {direccion && (
                          <p className="text-xs text-muted-foreground truncate">{direccion}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-foreground">{formatCurrency(venta.total)}</p>
                        <span className={`text-xs ${debe > 0 ? "text-orange-600" : "text-green-600"}`}>
                          {debe > 0 ? `Debe ${formatCurrency(debe)}` : "Pagado"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Orders Table */}
      {viewMode === "list" && (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Entregas del Dia
              </h2>
              <span className="inline-block mt-1 text-sm text-green-600 font-medium">
                {totalPedidos} entrega{totalPedidos !== 1 ? "s" : ""} pendiente
                {totalPedidos !== 1 ? "s" : ""}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchVentas}
              disabled={loading}
            >
              <RefreshCw
                className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`}
              />
              Actualizar
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : ventas.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Truck className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="font-medium text-muted-foreground">
                No hay entregas pendientes
              </p>
              <p className="text-sm mt-1">
                Selecciona otra fecha o espera nuevas ventas
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedVentas.map((venta, idx) => {
                const pagado = pagadoPorVenta[venta.id] || 0;
                const debe = Math.max(0, venta.total - pagado);
                const estaPago = debe <= 0;
                const direccion = [venta.clientes?.domicilio, venta.clientes?.localidad].filter(Boolean).join(", ");
                const mapsUrl = direccion ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}` : null;
                const tel = venta.clientes?.telefono?.replace(/\D/g, "") || "";
                const whatsappUrl = tel ? `https://wa.me/54${tel.startsWith("0") ? tel.slice(1) : tel}` : null;

                return (
                  <Card key={venta.id} className={`overflow-hidden ${estaPago ? "border-green-200" : "border-orange-200"}`}>
                    <CardContent className="p-0">
                      {/* Header row */}
                      <div className="flex items-center justify-between px-4 py-2.5 bg-muted/50 border-b">
                        <div className="flex items-center gap-2">
                          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-muted text-xs font-bold text-muted-foreground">
                            {orden[venta.id] ?? idx + 1}
                          </span>
                          <div>
                            <span className="font-mono text-xs font-semibold text-foreground">{venta.numero}</span>
                            <span className="text-xs text-muted-foreground ml-2">{venta.tipo_comprobante}</span>
                          </div>
                          {venta.origen === "tienda" && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-pink-300 text-pink-600 bg-pink-50">Web</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className={estaPago ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}>
                            {estaPago ? "Pagado" : `Debe ${formatCurrency(debe)}`}
                          </Badge>
                          {/* Order arrows - desktop */}
                          <div className="hidden sm:flex flex-col">
                            <button onClick={() => moveOrder(venta.id, "up")} className="text-muted-foreground hover:text-foreground p-0.5"><ArrowUp className="w-3 h-3" /></button>
                            <button onClick={() => moveOrder(venta.id, "down")} className="text-muted-foreground hover:text-foreground p-0.5"><ArrowDown className="w-3 h-3" /></button>
                          </div>
                        </div>
                      </div>

                      {/* Client info */}
                      <div className="px-4 py-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-foreground truncate text-base">{venta.clientes?.nombre ?? "Sin cliente"}</p>
                            {direccion && (
                              <p className="flex items-start gap-1.5 text-sm text-muted-foreground mt-0.5">
                                <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                <span>{direccion}</span>
                              </p>
                            )}
                            {venta.clientes?.telefono && (
                              <p className="flex items-center gap-1.5 text-sm text-muted-foreground mt-0.5">
                                <Phone className="w-3.5 h-3.5 shrink-0" />
                                {venta.clientes.telefono}
                              </p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-lg font-bold text-foreground">{formatCurrency(venta.total)}</p>
                            <p className="text-xs text-muted-foreground">{venta.forma_pago}</p>
                            <p className="text-xs text-muted-foreground">{venta.fecha}</p>
                          </div>
                        </div>

                        {/* Quick contact buttons */}
                        <div className="flex items-center gap-2 pt-1">
                          {venta.clientes?.telefono && (
                            <a href={`tel:${venta.clientes.telefono}`} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100 transition-colors">
                              <Phone className="w-3.5 h-3.5" />
                              Llamar
                            </a>
                          )}
                          {whatsappUrl && (
                            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-50 text-green-700 text-xs font-medium hover:bg-green-100 transition-colors">
                              <MessageCircle className="w-3.5 h-3.5" />
                              WhatsApp
                            </a>
                          )}
                          {mapsUrl && (
                            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-purple-50 text-purple-700 text-xs font-medium hover:bg-purple-100 transition-colors">
                              <Navigation className="w-3.5 h-3.5" />
                              Cómo llegar
                            </a>
                          )}
                          <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground ml-auto" onClick={() => handleViewDetail(venta)}>
                            <Eye className="w-3.5 h-3.5 mr-1" />
                            Ver items
                          </Button>
                        </div>
                      </div>

                      {/* Action bar */}
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/50 border-t">
                        {debe > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 sm:flex-none h-9 text-sm text-emerald-600 border-emerald-300 hover:bg-emerald-50"
                            onClick={() => openPayDialog(venta)}
                          >
                            <DollarSign className="w-4 h-4 mr-1.5" />
                            Cobrar
                          </Button>
                        )}
                        <Button
                          size="sm"
                          className="flex-1 sm:flex-none h-9 text-sm bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => handleMarkDelivered(venta.id)}
                        >
                          <CheckCircle className="w-4 h-4 mr-1.5" />
                          Marcar Entregado
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      )}

      </>)}

      {/* Detail Dialog */}
      <VentaDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        data={detailVenta ? {
          numero: detailVenta.numero,
          created_at: detailVenta.fecha,
          fecha: detailVenta.fecha,
          estado: detailVenta.estado,
          tipo_comprobante: detailVenta.tipo_comprobante,
          forma_pago: detailVenta.forma_pago,
          metodo_entrega: detailVenta.metodo_entrega || undefined,
          total: detailVenta.total,
          observacion: detailVenta.observacion,
          entregado: detailVenta.entregado,
          nombre_cliente: detailVenta.clientes?.nombre || "Sin cliente",
          telefono: detailVenta.clientes?.telefono || undefined,
          domicilio: [detailVenta.clientes?.domicilio, detailVenta.clientes?.localidad].filter(Boolean).join(", ") || undefined,
          origen: detailVenta.origen === "tienda" ? "pedidos" : "historial",
        } : null}
        items={detailVenta?.venta_items?.map((item) => ({
          id: item.id,
          descripcion: item.descripcion,
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario,
          subtotal: item.subtotal,
          unidad_medida: item.unidad_medida,
        })) || []}
        pagos={detailPagos}
      />

      {/* Delivery Confirmation Modal */}
      <Dialog open={dlvConfirm.open} onOpenChange={(v) => !v && setDlvConfirm({ open: false, id: "", pendiente: 0, type: "paid" })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {dlvConfirm.type === "paid" ? (
                <><CheckCircle className="w-5 h-5 text-emerald-500" /> Confirmar entrega</>
              ) : dlvConfirm.type === "no_client" ? (
                <><AlertCircle className="w-5 h-5 text-red-500" /> No se puede entregar</>
              ) : (
                <><AlertCircle className="w-5 h-5 text-amber-500" /> Saldo pendiente</>
              )}
            </DialogTitle>
          </DialogHeader>
          {(() => {
            const v = ventas.find((x) => x.id === dlvConfirm.id);
            const fmtCur = (n: number) => formatCurrency(n);
            return (
              <div className="space-y-4">
                {dlvConfirm.type === "paid" && v && (
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4">
                    <p className="text-sm text-emerald-800">
                      Pedido <b>#{v.numero}</b> de <b>{v.clientes?.nombre}</b> por <b>{fmtCur(v.total)}</b>
                    </p>
                    <p className="text-xs text-emerald-600 mt-1">Pago completo</p>
                  </div>
                )}
                {dlvConfirm.type === "unpaid" && v && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 space-y-2">
                    <p className="text-sm text-amber-900">
                      <b>{v.clientes?.nombre}</b> tiene <b className="text-amber-700">{fmtCur(dlvConfirm.pendiente)}</b> sin cobrar.
                    </p>
                    <p className="text-xs text-amber-700">Se cargará a su cuenta corriente como deuda.</p>
                  </div>
                )}
                {dlvConfirm.type === "no_client" && (
                  <div className="rounded-lg bg-red-50 border border-red-200 p-4 space-y-2">
                    <p className="text-sm text-red-900">
                      Este pedido tiene <b>{fmtCur(dlvConfirm.pendiente)}</b> sin cobrar y no tiene cliente asignado.
                    </p>
                    <p className="text-xs text-red-700">No se puede registrar la deuda. Cobrá primero o asigná un cliente.</p>
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setDlvConfirm({ open: false, id: "", pendiente: 0, type: "paid" })}>
                    Cancelar
                  </Button>
                  {dlvConfirm.type !== "no_client" && (
                    <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={executeDlvConfirm}>
                      <CheckCircle className="w-4 h-4 mr-1.5" />
                      {dlvConfirm.type === "unpaid" ? "Cargar a CC y entregar" : "Marcar entregado"}
                    </Button>
                  )}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Pago</DialogTitle>
          </DialogHeader>
          {payVenta && (() => {
            const pagado = pagadoPorVenta[payVenta.id] || 0;
            const debe = Math.max(0, payVenta.total - pagado);
            const totalPagando = payMetodo === "Mixto" ? payEfectivo + payTransferencia : payMonto;
            const saldoPendiente = debe - Math.min(totalPagando, debe);
            return (
              <div className="space-y-4">
                {/* Summary */}
                <div className="text-sm space-y-1 bg-muted/50 rounded-lg p-3">
                  <div className="flex justify-between"><span className="text-muted-foreground">Venta</span><span className="font-mono font-medium">{payVenta.numero}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Cliente</span><span className="font-medium">{payVenta.clientes?.nombre || "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-bold">{formatCurrency(payVenta.total)}</span></div>
                  {pagado > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Ya pagado</span><span className="text-emerald-600">{formatCurrency(pagado)}</span></div>}
                  <div className="flex justify-between border-t pt-1 mt-1"><span className="text-muted-foreground font-medium">Debe</span><span className="text-orange-600 font-bold">{formatCurrency(debe)}</span></div>
                  {payVenta.origen === "tienda" && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Pago elegido por cliente</span><span className="font-medium">{payVenta.forma_pago}</span></div>
                  )}
                </div>

                {/* Payment method */}
                <div className="space-y-2">
                  <Label>Método de pago</Label>
                  <div className="flex gap-2">
                    {(["Efectivo", "Transferencia", "Mixto"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => {
                          setPayMetodo(m);
                          if (m === "Mixto") { setPayEfectivo(Math.floor(debe / 2)); setPayTransferencia(debe - Math.floor(debe / 2)); }
                          else { setPayMonto(debe); }
                        }}
                        className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-all ${
                          payMetodo === m ? "bg-foreground text-white border-foreground" : "bg-white text-muted-foreground border-border hover:border-foreground/30"
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Amount inputs */}
                {payMetodo === "Mixto" ? (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Efectivo</Label>
                      <Input type="number" value={payEfectivo} onChange={(e) => { const v = Math.max(0, Number(e.target.value)); setPayEfectivo(v); setPayTransferencia(Math.max(0, debe - v)); }} min={0} max={debe} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Transferencia</Label>
                      <Input type="number" value={payTransferencia} onChange={(e) => { const v = Math.max(0, Number(e.target.value)); setPayTransferencia(v); setPayEfectivo(Math.max(0, debe - v)); }} min={0} max={debe} />
                    </div>
                    {payTransferencia > 0 && cuentasBancarias.length > 0 && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Cuenta bancaria</Label>
                        <Select value={payCuentaBancariaId} onValueChange={(v) => setPayCuentaBancariaId(v || "")}>
                          <SelectTrigger className="h-9">
                            {payCuentaBancariaId ? ((cuentasBancarias.find((c) => c.id === payCuentaBancariaId) as any)?.alias || cuentasBancarias.find((c) => c.id === payCuentaBancariaId)?.nombre || "Seleccionar cuenta") : "Seleccionar cuenta"}
                          </SelectTrigger>
                          <SelectContent>
                            {cuentasBancarias.map((c) => <SelectItem key={c.id} value={c.id}>{(c as any).alias || c.nombre}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="text-xs text-right text-muted-foreground">
                      Total a cobrar: <strong className="text-foreground">{formatCurrency(payEfectivo + payTransferencia)}</strong>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Monto a cobrar</Label>
                    <Input type="number" value={payMonto} onChange={(e) => setPayMonto(Math.max(0, Math.min(debe, Number(e.target.value))))} min={0} max={debe} />
                    {payMetodo === "Transferencia" && cuentasBancarias.length > 0 && (
                      <div className="space-y-1.5 mt-2">
                        <Label className="text-xs">Cuenta bancaria</Label>
                        <Select value={payCuentaBancariaId} onValueChange={(v) => setPayCuentaBancariaId(v || "")}>
                          <SelectTrigger className="h-9">
                            {payCuentaBancariaId ? ((cuentasBancarias.find((c) => c.id === payCuentaBancariaId) as any)?.alias || cuentasBancarias.find((c) => c.id === payCuentaBancariaId)?.nombre || "Seleccionar cuenta") : "Seleccionar cuenta"}
                          </SelectTrigger>
                          <SelectContent>
                            {cuentasBancarias.map((c) => <SelectItem key={c.id} value={c.id}>{(c as any).alias || c.nombre}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}

                {/* Pending balance warning */}
                {saldoPendiente > 0 && payVenta.cliente_id && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    El saldo pendiente de <strong>{formatCurrency(saldoPendiente)}</strong> se cargará a la cuenta corriente del cliente, vinculado al comprobante <strong>#{payVenta.numero}</strong>.
                  </div>
                )}
                {saldoPendiente > 0 && !payVenta.cliente_id && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    Esta venta no tiene cliente asignado. No se puede dejar saldo pendiente en cuenta corriente.
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" onClick={() => setPayDialogOpen(false)}>Cancelar</Button>
                  <Button onClick={handleRegistrarPago} disabled={paySaving || totalPagando <= 0 || (saldoPendiente > 0 && !payVenta.cliente_id)}>
                    {paySaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Confirmar Cobro — {formatCurrency(Math.min(totalPagando, debe))}
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
