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
import Link from "next/link";
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
  }).format(value);
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
  const [orden, setOrden] = useState<Record<string, number>>({});
  const [filterEntrega, setFilterEntrega] = useState<"todos" | "envio" | "retiro">("todos");
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
      .neq("estado", "anulada")
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

    // Fetch payments per order from caja_movimientos
    if (rows.length > 0) {
      const ventaIds = rows.map((v) => v.id);
      const { data: movs } = await supabase
        .from("caja_movimientos")
        .select("referencia_id, monto")
        .eq("tipo", "ingreso")
        .eq("referencia_tipo", "venta")
        .in("referencia_id", ventaIds);

      const pagadoMap: Record<string, number> = {};
      (movs || []).forEach((m: { referencia_id: string; monto: number }) => {
        pagadoMap[m.referencia_id] = (pagadoMap[m.referencia_id] || 0) + m.monto;
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
      .order("fecha", { ascending: false });

    const rows = (data || []) as unknown as VentaRow[];
    setHistorialVentas(rows);

    // Fetch payments for these orders
    if (rows.length > 0) {
      const ventaIds = rows.map((v) => v.id);
      const { data: movs } = await supabase
        .from("caja_movimientos")
        .select("referencia_id, monto, metodo_pago")
        .eq("tipo", "ingreso")
        .eq("referencia_tipo", "venta")
        .in("referencia_id", ventaIds);

      const pagosMap: Record<string, { monto: number; metodo: string }[]> = {};
      (movs || []).forEach((m: { referencia_id: string; monto: number; metodo_pago: string }) => {
        if (!pagosMap[m.referencia_id]) pagosMap[m.referencia_id] = [];
        pagosMap[m.referencia_id].push({ monto: m.monto, metodo: m.metodo_pago });
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
    return s + pagos.reduce((a, p) => a + p.monto, 0);
  }, 0);

  const handleMarkDelivered = async (id: string) => {
    const { error } = await supabase
      .from("ventas")
      .update({ entregado: true })
      .eq("id", id);
    if (error) {
      console.error(error);
      return;
    }
    setVentas((prev) => prev.filter((v) => v.id !== id));
  };

  const handleViewDetail = (venta: VentaRow) => {
    setDetailVenta(venta);
    setDetailOpen(true);
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

  // Load bank accounts
  useEffect(() => {
    try {
      const stored = localStorage.getItem("cuentas_bancarias");
      if (stored) setCuentasBancarias(JSON.parse(stored));
    } catch {}
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
    const hora = new Date().toTimeString().split(" ")[0];
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
      const clientSaldo = payVenta.clientes?.saldo || 0;
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

  // Counts per filter
  const countEnvio = ventas.filter((v) => v.metodo_entrega === "envio").length;
  const countRetiro = ventas.filter((v) => v.metodo_entrega === "retiro" || v.metodo_entrega === "retiro_local" || !v.metodo_entrega).length;

  const navTabs = [
    { name: "Todas las Ventas", href: "/ventas/listado" },
    { name: "Entregas y Ruta", href: "/ventas/hoja-ruta" },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Nav Tabs */}
      <div className="bg-gray-100 rounded-xl p-1 inline-flex">
        {navTabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-lg px-6 py-2.5 text-sm transition-all ${
              tab.href === "/ventas/hoja-ruta"
                ? "bg-white shadow-sm font-semibold text-gray-900"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.name}
          </Link>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Truck className="w-7 h-7 text-gray-700" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Entregas y Hoja de Ruta</h1>
            <p className="text-sm text-gray-500">Gestiona entregas pendientes, cobros y hoja de ruta</p>
          </div>
        </div>
      </div>

      {/* Pendientes / Historial tabs */}
      <div className="flex items-center justify-between">
        <div className="bg-gray-100 rounded-lg p-1 inline-flex">
          <button
            onClick={() => setActiveTab("pendientes")}
            className={`rounded-md px-5 py-2 text-sm transition-all ${
              activeTab === "pendientes" ? "bg-white shadow-sm font-semibold text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Package className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
            Entregas Pendientes
          </button>
          <button
            onClick={() => setActiveTab("historial")}
            className={`rounded-md px-5 py-2 text-sm transition-all ${
              activeTab === "historial" ? "bg-white shadow-sm font-semibold text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Clock className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
            Historial de Entregas
          </button>
        </div>
        {activeTab === "pendientes" && (
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showAllPending}
                onChange={(e) => setShowAllPending(e.target.checked)}
                className="rounded border-gray-300"
              />
              Todas las pendientes
            </label>
            {!showAllPending && (
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-gray-400" />
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
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-500">Desde</span>
              <Input
                type="date"
                value={historialDateFrom}
                onChange={(e) => setHistorialDateFrom(e.target.value)}
                className="w-40 h-9"
              />
              <span className="text-sm text-gray-500">Hasta</span>
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
                className="w-full h-9 pl-3 pr-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>
          </div>

          {/* Historial stats */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                  <CheckCircle className="w-4 h-4" />
                  Entregas Realizadas
                </div>
                <div className="text-2xl font-bold">{filteredHistorial.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
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
              </CardContent>
            </Card>
          </div>

          {/* Historial table */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Historial de Entregas</h2>
                <Button variant="outline" size="sm" onClick={fetchHistorial} disabled={historialLoading}>
                  <RefreshCw className={`w-4 h-4 mr-2 ${historialLoading ? "animate-spin" : ""}`} />
                  Actualizar
                </Button>
              </div>

              {historialLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : filteredHistorial.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <CheckCircle className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p className="font-medium text-gray-500">No hay entregas en este periodo</p>
                  <p className="text-sm mt-1">Selecciona otro rango de fechas</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-gray-500">
                        <th className="pb-3 px-3">Fecha</th>
                        <th className="pb-3 px-3">Nro. Venta</th>
                        <th className="pb-3 px-3">Cliente</th>
                        <th className="pb-3 px-3">Entrega</th>
                        <th className="pb-3 px-3 text-right">Total</th>
                        <th className="pb-3 px-3 text-right">Cobrado</th>
                        <th className="pb-3 px-3">Metodo Pago</th>
                        <th className="pb-3 px-3 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHistorial.map((venta) => {
                        const pagos = historialPagos[venta.id] || [];
                        const totalCobrado = pagos.reduce((a, p) => a + p.monto, 0);
                        const metodos = [...new Set(pagos.map((p) => p.metodo))].join(", ") || venta.forma_pago;

                        return (
                          <tr key={venta.id} className="border-b hover:bg-gray-50 transition-colors">
                            <td className="py-3 px-3 text-xs text-gray-500">{venta.fecha}</td>
                            <td className="py-3 px-3">
                              <div className="font-mono text-xs font-semibold text-gray-700">{venta.numero}</div>
                              <span className="text-xs text-gray-400">{venta.tipo_comprobante}</span>
                            </td>
                            <td className="py-3 px-3 font-medium text-gray-900">
                              {venta.clientes?.nombre ?? "Sin cliente"}
                            </td>
                            <td className="py-3 px-3">
                              <Badge variant={venta.metodo_entrega === "envio" ? "default" : "secondary"} className={`text-xs ${venta.metodo_entrega === "envio" ? "bg-blue-100 text-blue-700 hover:bg-blue-100" : "bg-gray-100 text-gray-600 hover:bg-gray-100"}`}>
                                {venta.metodo_entrega === "envio" ? "Envio" : "Retiro"}
                              </Badge>
                            </td>
                            <td className="py-3 px-3 text-right font-semibold text-gray-900">
                              {formatCurrency(venta.total)}
                            </td>
                            <td className="py-3 px-3 text-right text-green-600 font-medium">
                              {formatCurrency(totalCobrado)}
                            </td>
                            <td className="py-3 px-3">
                              <Badge variant="secondary" className="text-xs">{metodos || "---"}</Badge>
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex items-center justify-end">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleViewDetail(venta)}
                                  title="Ver detalle"
                                >
                                  <Eye className="w-4 h-4 text-gray-500" />
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
        </>
      )}

      {activeTab === "pendientes" && (<>
      {/* Filter tabs: Envío / Retiro / Todos */}
      <div className="flex items-center gap-3">
        <div className="bg-gray-100 rounded-lg p-1 inline-flex">
          {([
            { key: "envio" as const, label: "Envío a domicilio", count: countEnvio },
            { key: "retiro" as const, label: "Retiro en local", count: countRetiro },
            { key: "todos" as const, label: "Todos", count: ventas.length },
          ]).map((f) => (
            <button
              key={f.key}
              onClick={() => setFilterEntrega(f.key)}
              className={`rounded-md px-4 py-2 text-sm transition-all ${
                filterEntrega === f.key ? "bg-white shadow-sm font-semibold text-gray-900" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {f.label} {f.count > 0 && <span className="ml-1 text-xs bg-gray-200 text-gray-600 rounded-full px-1.5 py-0.5">{f.count}</span>}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <input
            type="text"
            placeholder="Buscar por N° o cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 pl-3 pr-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
              <Package className="w-4 h-4" />
              Total Entregas
            </div>
            <div className="text-2xl font-bold">{totalPedidos}</div>
            <div className="text-xs text-gray-400 mt-1">
              Pendientes de entrega
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
              <DollarSign className="w-4 h-4" />
              Valor Total
            </div>
            <div className="text-2xl font-bold">
              {formatCurrency(valorTotal)}
            </div>
            <div className="text-xs text-gray-400 mt-1">
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
            <div className="text-xs text-gray-400 mt-1">
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
            <div className="text-xs text-gray-400 mt-1">
              Cobrado previamente
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Orders Table */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
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
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : ventas.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Truck className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="font-medium text-gray-500">
                No hay entregas pendientes para esta fecha
              </p>
              <p className="text-sm mt-1">
                Selecciona otra fecha o espera nuevas ventas
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-3 px-3 w-24">Orden</th>
                    <th className="pb-3 px-3">Nro. Venta</th>
                    <th className="pb-3 px-3">Fecha</th>
                    <th className="pb-3 px-3">Cliente</th>
                    <th className="pb-3 px-3">Entrega</th>
                    <th className="pb-3 px-3">Direccion</th>
                    <th className="pb-3 px-3 text-right">Total</th>
                    <th className="pb-3 px-3 text-right">Pagado</th>
                    <th className="pb-3 px-3 text-right">Debe</th>
                    <th className="pb-3 px-3">Estado Pago</th>
                    <th className="pb-3 px-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedVentas.map((venta) => {
                    const pagado = pagadoPorVenta[venta.id] || 0;
                    const debe = Math.max(0, venta.total - pagado);
                    const estaPago = debe <= 0;

                    return (
                      <tr
                        key={venta.id}
                        className="border-b hover:bg-gray-50 transition-colors"
                      >
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              min={1}
                              value={orden[venta.id] ?? ""}
                              onChange={(e) =>
                                handleOrdenChange(venta.id, e.target.value)
                              }
                              className="w-14 h-8 text-center text-sm"
                            />
                            <div className="flex flex-col">
                              <button
                                onClick={() => moveOrder(venta.id, "up")}
                                className="text-gray-400 hover:text-gray-700 p-0.5"
                              >
                                <ArrowUp className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => moveOrder(venta.id, "down")}
                                className="text-gray-400 hover:text-gray-700 p-0.5"
                              >
                                <ArrowDown className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-mono text-xs font-semibold text-gray-700">
                            {venta.numero}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-xs text-gray-400">{venta.tipo_comprobante}</span>
                            {venta.origen === "tienda" && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-pink-300 text-pink-600 bg-pink-50">Web</Badge>
                            )}
                          </div>
                          <div className="text-[10px] text-gray-400 mt-0.5">Pago: {venta.forma_pago}</div>
                        </td>
                        <td className="py-3 px-3 text-xs text-gray-500">
                          {venta.fecha}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-medium text-gray-900">
                            {venta.clientes?.nombre ?? "Sin cliente"}
                          </div>
                          {venta.clientes?.telefono && (
                            <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                              <Phone className="w-3 h-3" />
                              {venta.clientes.telefono}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <Badge variant={venta.metodo_entrega === "envio" ? "default" : "secondary"} className={`text-xs ${venta.metodo_entrega === "envio" ? "bg-blue-100 text-blue-700 hover:bg-blue-100" : "bg-gray-100 text-gray-600 hover:bg-gray-100"}`}>
                            {venta.metodo_entrega === "envio" ? "Envío" : "Retiro en local"}
                          </Badge>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-start gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                            <div className="text-gray-700">
                              {[
                                venta.clientes?.domicilio,
                                venta.clientes?.localidad,
                              ]
                                .filter(Boolean)
                                .join(", ") || "Sin direccion"}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-semibold text-gray-900">
                          {formatCurrency(venta.total)}
                        </td>
                        <td className="py-3 px-3 text-right text-green-600 font-medium">
                          {formatCurrency(pagado)}
                        </td>
                        <td className="py-3 px-3 text-right text-orange-600 font-medium">
                          {debe > 0 ? formatCurrency(debe) : "-"}
                        </td>
                        <td className="py-3 px-3">
                          <Badge
                            variant="secondary"
                            className={
                              estaPago
                                ? "bg-green-100 text-green-700 hover:bg-green-100"
                                : "bg-orange-100 text-orange-700 hover:bg-orange-100"
                            }
                          >
                            {estaPago ? "Pagado" : "Debe"}
                          </Badge>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center justify-end gap-1">
                            {debe > 0 && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs text-emerald-600 border-emerald-300 hover:bg-emerald-50"
                                onClick={() => openPayDialog(venta)}
                                title="Registrar pago"
                              >
                                <DollarSign className="w-3 h-3 mr-1" />
                                Cobrar
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleViewDetail(venta)}
                              title="Ver detalle"
                            >
                              <Eye className="w-4 h-4 text-gray-500" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs text-green-600 border-green-300 hover:bg-green-50"
                              onClick={() => handleMarkDelivered(venta.id)}
                              title="Marcar como entregado"
                            >
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Entregado
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

      </>)}

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Detalle de Venta
              {detailVenta && (
                <span className="font-mono text-sm text-gray-500 ml-2">
                  {detailVenta.numero}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {detailVenta && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Cliente:</span>{" "}
                  <span className="font-medium">
                    {detailVenta.clientes?.nombre ?? "Sin cliente"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Fecha:</span>{" "}
                  <span className="font-medium">{detailVenta.fecha}</span>
                </div>
                <div>
                  <span className="text-gray-500">Direccion:</span>{" "}
                  <span className="font-medium">
                    {[
                      detailVenta.clientes?.domicilio,
                      detailVenta.clientes?.localidad,
                    ]
                      .filter(Boolean)
                      .join(", ") || "N/A"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Forma de pago:</span>{" "}
                  <span className="font-medium">
                    {detailVenta.forma_pago || "N/A"}
                  </span>
                </div>
                {detailVenta.clientes?.telefono && (
                  <div>
                    <span className="text-gray-500">Telefono:</span>{" "}
                    <span className="font-medium">
                      {detailVenta.clientes.telefono}
                    </span>
                  </div>
                )}
                <div>
                  <span className="text-gray-500">Saldo cliente:</span>{" "}
                  <span className="font-medium text-orange-600">
                    {formatCurrency(detailVenta.clientes?.saldo ?? 0)}
                  </span>
                </div>
              </div>

              {detailVenta.observacion && (
                <div className="text-sm bg-gray-50 rounded-lg p-3">
                  <span className="text-gray-500 font-medium">
                    Observacion:
                  </span>{" "}
                  {detailVenta.observacion}
                </div>
              )}

              {/* Items table */}
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr className="text-left text-gray-500">
                      <th className="py-2 px-3">Producto</th>
                      <th className="py-2 px-3 text-center">Cant.</th>
                      <th className="py-2 px-3 text-right">Precio Unit.</th>
                      <th className="py-2 px-3 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailVenta.venta_items?.map((item) => (
                      <tr key={item.id} className="border-t">
                        <td className="py-2 px-3 font-medium">
                          {item.descripcion}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {item.cantidad} {item.unidad_medida ?? ""}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {formatCurrency(item.precio_unitario)}
                        </td>
                        <td className="py-2 px-3 text-right font-medium">
                          {formatCurrency(item.subtotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end pt-2 border-t">
                <div className="text-lg font-bold">
                  Total: {formatCurrency(detailVenta.total)}
                </div>
              </div>
            </div>
          )}
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
                <div className="text-sm space-y-1 bg-gray-50 rounded-lg p-3">
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
                          payMetodo === m ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
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
                          <SelectTrigger className="h-9"><SelectValue placeholder="Seleccionar cuenta" /></SelectTrigger>
                          <SelectContent>
                            {cuentasBancarias.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="text-xs text-right text-muted-foreground">
                      Total a cobrar: <strong className="text-gray-900">{formatCurrency(payEfectivo + payTransferencia)}</strong>
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
                          <SelectTrigger className="h-9"><SelectValue placeholder="Seleccionar cuenta" /></SelectTrigger>
                          <SelectContent>
                            {cuentasBancarias.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
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
                  <Button onClick={handleRegistrarPago} disabled={paySaving || totalPagando <= 0}>
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
