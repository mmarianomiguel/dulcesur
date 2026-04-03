"use client";

import { nowTimeARG, formatCurrency } from "@/lib/formatters";
import { norm } from "@/lib/utils";
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
import { CobroVentaSection } from "@/components/cobro-venta-section";
import type { CobroVentaResult } from "@/components/cobro-venta-section";
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
  alias?: string;
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
  const [dlvConfirm, setDlvConfirm] = useState<{ open: boolean; ids: string[]; pendiente: number; type: "paid" | "unpaid" | "no_client"; clienteNombre?: string }>({ open: false, ids: [], pendiente: 0, type: "paid" });
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
  const [ncPorVenta, setNcPorVenta] = useState<Record<string, number>>({});

  const fetchVentas = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("ventas")
      .select(
        "id, numero, tipo_comprobante, fecha, forma_pago, total, estado, observacion, entregado, cliente_id, origen, metodo_entrega, cuenta_transferencia_alias, clientes(id, nombre, domicilio, localidad, telefono, saldo), venta_items(id, descripcion, cantidad, precio_unitario, subtotal, unidad_medida, unidades_por_presentacion)"
      )
      .eq("entregado", false)
      .in("metodo_entrega", ["envio", "envio_a_domicilio", "envio a domicilio"])
      .neq("estado", "anulada")
      .not("tipo_comprobante", "ilike", "Nota de Crédito%")
      .not("tipo_comprobante", "ilike", "NC%")
      .not("cliente_id", "is", null)
      .order("created_at", { ascending: false });

    // If showing all pending, include today and past (not future deliveries)
    // If showing specific date, filter by that date only
    if (!showAllPending) {
      query = query.eq("fecha", selectedDate);
    } else {
      query = query.lte("fecha", getArgentinaToday());
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
      const [{ data: movs }, { data: ncDirect }, { data: facturas }] = await Promise.all([
        supabase
          .from("caja_movimientos")
          .select("referencia_id, monto")
          .eq("tipo", "ingreso")
          .eq("referencia_tipo", "venta")
          .in("referencia_id", ventaIds),
        // Find NCs linked directly to these sales
        supabase
          .from("ventas")
          .select("remito_origen_id, total")
          .in("remito_origen_id", ventaIds)
          .ilike("tipo_comprobante", "Nota de Crédito%")
          .neq("estado", "anulada"),
        // Find facturas created from these remitos (to find NCs linked to those facturas)
        supabase
          .from("ventas")
          .select("id, remito_origen_id")
          .in("remito_origen_id", ventaIds)
          .ilike("tipo_comprobante", "Factura%"),
      ]);

      // Build map: factura_id -> original remito_id
      const facturaToRemito: Record<string, string> = {};
      (facturas || []).forEach((f: any) => { if (f.remito_origen_id) facturaToRemito[f.id] = f.remito_origen_id; });
      const facturaIds = Object.keys(facturaToRemito);

      // Find NCs linked to those facturas
      let ncViaFactura: any[] = [];
      if (facturaIds.length > 0) {
        const { data: ncF } = await supabase
          .from("ventas")
          .select("remito_origen_id, total")
          .in("remito_origen_id", facturaIds)
          .ilike("tipo_comprobante", "Nota de Crédito%")
          .neq("estado", "anulada");
        ncViaFactura = ncF || [];
      }

      const pagadoMap: Record<string, number> = {};
      (movs || []).forEach((m: { referencia_id: string; monto: number }) => {
        pagadoMap[m.referencia_id] = (pagadoMap[m.referencia_id] || 0) + m.monto;
      });
      // Add NC refund amounts as "paid" (they reduce what the client owes)
      const ncMap: Record<string, number> = {};
      (ncDirect || []).forEach((nc: any) => {
        if (nc.remito_origen_id) {
          pagadoMap[nc.remito_origen_id] = (pagadoMap[nc.remito_origen_id] || 0) + (nc.total || 0);
          ncMap[nc.remito_origen_id] = (ncMap[nc.remito_origen_id] || 0) + (nc.total || 0);
        }
      });
      // Add NCs issued against facturas back to the original remito
      ncViaFactura.forEach((nc: any) => {
        const originalRemitoId = facturaToRemito[nc.remito_origen_id];
        if (originalRemitoId) {
          pagadoMap[originalRemitoId] = (pagadoMap[originalRemitoId] || 0) + (nc.total || 0);
          ncMap[originalRemitoId] = (ncMap[originalRemitoId] || 0) + (nc.total || 0);
        }
      });
      setPagadoPorVenta(pagadoMap);
      setNcPorVenta(ncMap);
    } else {
      setPagadoPorVenta({});
      setNcPorVenta({});
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
        "id, numero, tipo_comprobante, fecha, forma_pago, total, estado, observacion, entregado, cliente_id, origen, metodo_entrega, cuenta_transferencia_alias, clientes(id, nombre, domicilio, localidad, telefono, saldo), venta_items(id, descripcion, cantidad, precio_unitario, subtotal, unidad_medida, unidades_por_presentacion)"
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
      const [{ data: movs }, { data: ncDirect }, { data: facturas }] = await Promise.all([
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
        // Find facturas created from these ventas
        supabase
          .from("ventas")
          .select("id, remito_origen_id")
          .in("remito_origen_id", ventaIds)
          .ilike("tipo_comprobante", "Factura%"),
      ]);

      // Build map: factura_id -> original venta_id
      const facturaToVenta: Record<string, string> = {};
      (facturas || []).forEach((f: any) => { if (f.remito_origen_id) facturaToVenta[f.id] = f.remito_origen_id; });
      const facturaIds = Object.keys(facturaToVenta);

      // Find NCs linked to those facturas
      let ncViaFactura: any[] = [];
      if (facturaIds.length > 0) {
        const { data: ncF } = await supabase
          .from("ventas")
          .select("remito_origen_id, total")
          .in("remito_origen_id", facturaIds)
          .ilike("tipo_comprobante", "Nota de Crédito%")
          .neq("estado", "anulada");
        ncViaFactura = ncF || [];
      }

      const pagosMap: Record<string, { monto: number; metodo: string }[]> = {};
      (movs || []).forEach((m: { referencia_id: string; monto: number; metodo_pago: string }) => {
        if (!pagosMap[m.referencia_id]) pagosMap[m.referencia_id] = [];
        pagosMap[m.referencia_id].push({ monto: m.monto, metodo: m.metodo_pago });
      });
      // Add NC refunds as payments (direct)
      (ncDirect || []).forEach((nc: any) => {
        if (nc.remito_origen_id && nc.total > 0) {
          if (!pagosMap[nc.remito_origen_id]) pagosMap[nc.remito_origen_id] = [];
          pagosMap[nc.remito_origen_id].push({ monto: nc.total, metodo: "Nota de Crédito" });
        }
      });
      // Add NCs issued against facturas back to the original venta
      ncViaFactura.forEach((nc: any) => {
        const originalVentaId = facturaToVenta[nc.remito_origen_id];
        if (originalVentaId && nc.total > 0) {
          if (!pagosMap[originalVentaId]) pagosMap[originalVentaId] = [];
          pagosMap[originalVentaId].push({ monto: nc.total, metodo: "Nota de Crédito" });
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

  const handleMarkDelivered = async (groupVentas: VentaRow[]) => {
    const ids = groupVentas.map((v) => v.id);
    const totalPendiente = groupVentas.reduce((s, v) => s + Math.max(0, v.total - (pagadoPorVenta[v.id] || 0)), 0);
    const clienteId = groupVentas[0]?.cliente_id;
    const clienteNombre = groupVentas[0]?.clientes?.nombre || "Sin cliente";

    if (totalPendiente > 0 && !clienteId) {
      setDlvConfirm({ open: true, ids, pendiente: totalPendiente, type: "no_client", clienteNombre });
      return;
    }
    if (totalPendiente > 0) {
      setDlvConfirm({ open: true, ids, pendiente: totalPendiente, type: "unpaid", clienteNombre });
      return;
    }
    setDlvConfirm({ open: true, ids, pendiente: 0, type: "paid", clienteNombre });
  };

  const executeDlvConfirm = async () => {
    const { ids, pendiente, type } = dlvConfirm;
    const groupVentas = ventas.filter((v) => ids.includes(v.id));
    if (groupVentas.length === 0 || type === "no_client") {
      setDlvConfirm({ open: false, ids: [], pendiente: 0, type: "paid" });
      return;
    }
    setDlvConfirm({ open: false, ids: [], pendiente: 0, type: "paid" });
    const clienteId = groupVentas[0].cliente_id;

    if (type === "unpaid" && pendiente > 0 && clienteId) {
      const { data: freshCli } = await supabase.from("clientes").select("saldo").eq("id", clienteId).single();
      let runningClientSaldo = freshCli?.saldo ?? 0;
      const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

      for (const venta of groupVentas) {
        const ventaDeuda = Math.max(0, venta.total - (pagadoPorVenta[venta.id] || 0));
        if (ventaDeuda <= 0) continue;
        // Check if CC entry already exists
        const { data: existingCC } = await supabase.from("cuenta_corriente").select("id").eq("venta_id", venta.id).gt("debe", 0).limit(1);
        if (existingCC && existingCC.length > 0) continue;
        runningClientSaldo += ventaDeuda;
        await supabase.from("cuenta_corriente").insert({
          cliente_id: clienteId, fecha: hoy,
          comprobante: `Entrega #${venta.numero}`,
          descripcion: `Saldo pendiente de entrega`,
          debe: ventaDeuda, haber: 0, saldo: runningClientSaldo,
          forma_pago: venta.forma_pago || "Efectivo", venta_id: venta.id,
        });
      }
      await supabase.from("clientes").update({ saldo: runningClientSaldo }).eq("id", clienteId);
    }

    // Mark all ventas in group as delivered
    for (const venta of groupVentas) {
      await supabase.from("ventas").update({ entregado: true, estado: "entregado" }).eq("id", venta.id);
      if (venta.numero) {
        await supabase.from("pedidos_tienda").update({ estado: "entregado" }).eq("numero", venta.numero);
      }
    }
    setVentas((prev) => prev.filter((v) => !ids.includes(v.id)));
  };

  const handleViewDetail = async (venta: VentaRow) => {
    setDetailVenta(venta);
    setDetailPagos([]);
    setDetailOpen(true);
    const [{ data: movs }, { data: ncDirect }, { data: facturas }] = await Promise.all([
      supabase.from("caja_movimientos").select("metodo_pago, monto, tipo, cuenta_bancaria").eq("referencia_id", venta.id).eq("referencia_tipo", "venta").eq("tipo", "ingreso"),
      supabase.from("ventas").select("id, total").eq("remito_origen_id", venta.id).ilike("tipo_comprobante", "Nota de Crédito%").neq("estado", "anulada"),
      supabase.from("ventas").select("id, remito_origen_id").eq("remito_origen_id", venta.id).ilike("tipo_comprobante", "Factura%"),
    ]);
    // Find NCs issued against facturas created from this venta
    const facturaIds = (facturas || []).map((f: any) => f.id);
    let ncViaFactura: any[] = [];
    if (facturaIds.length > 0) {
      const { data: ncF } = await supabase.from("ventas").select("id, total").in("remito_origen_id", facturaIds).ilike("tipo_comprobante", "Nota de Crédito%").neq("estado", "anulada");
      ncViaFactura = ncF || [];
    }
    const pagos: { metodo: string; monto: number; cuenta_bancaria?: string | null }[] = [];
    if (movs && movs.length > 0) {
      pagos.push(...movs.map((m: any) => ({ metodo: m.metodo_pago, monto: Math.abs(m.monto), cuenta_bancaria: m.cuenta_bancaria })));
    } else if (venta.forma_pago) {
      pagos.push({ metodo: venta.forma_pago, monto: venta.total });
    }
    // Add NC refunds as settled amount (direct + via facturas)
    const ncTotal = [...(ncDirect || []), ...ncViaFactura].reduce((s: number, nc: any) => s + (nc.total || 0), 0);
    if (ncTotal > 0) {
      pagos.push({ metodo: "Nota de Crédito (devolución)", monto: ncTotal });
    }
    setDetailPagos(pagos);
  };

  // Payment dialog state
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payVenta, setPayVenta] = useState<VentaRow | null>(null);
  const [payMetodo, setPayMetodo] = useState<"Efectivo" | "Transferencia" | "Mixto" | "Cuenta Corriente">("Efectivo");
  const [payMonto, setPayMonto] = useState(0);
  const [payEfectivo, setPayEfectivo] = useState(0);
  const [payTransferencia, setPayTransferencia] = useState(0);
  const [payCuentaBancariaId, setPayCuentaBancariaId] = useState("");
  const [paySaving, setPaySaving] = useState(false);
  const [cuentasBancarias, setCuentasBancarias] = useState<CuentaBancaria[]>([]);
  const [porcentajeTransferencia, setPorcentajeTransferencia] = useState(2);

  // Load bank accounts and transfer surcharge from DB
  useEffect(() => {
    (async () => {
      const [{ data }, { data: tc }] = await Promise.all([
        supabase.from("cuentas_bancarias").select("id, nombre, alias, cbu_cvu, tipo_cuenta, titular").eq("activo", true).order("nombre"),
        supabase.from("tienda_config").select("recargo_transferencia").limit(1).single(),
      ]);
      if (data && data.length > 0) {
        setCuentasBancarias(data as CuentaBancaria[]);
      } else {
        try {
          const stored = localStorage.getItem("cuentas_bancarias");
          if (stored) setCuentasBancarias(JSON.parse(stored));
        } catch {}
      }
      if (tc && (tc as any).recargo_transferencia > 0) {
        setPorcentajeTransferencia((tc as any).recargo_transferencia);
      }
    })();
  }, []);

  const [payGroupVentas, setPayGroupVentas] = useState<VentaRow[]>([]);

  const openPayDialog = async (v: VentaRow, groupVentas?: VentaRow[]) => {
    const allVentas = groupVentas || [v];
    setPayGroupVentas(allVentas);
    const totalDebe = allVentas.reduce((s, vt) => s + Math.max(0, vt.total - (pagadoPorVenta[vt.id] || 0)), 0);
    setPayVenta(v);
    const metodoOriginal = v.forma_pago === "Transferencia" ? "Transferencia" : v.forma_pago === "Mixto" ? "Mixto" : "Efectivo";
    setPayMetodo(metodoOriginal);
    setPayMonto(totalDebe);

    // Pre-fill amounts from pedidos_tienda if it's a Mixto online order
    if (metodoOriginal === "Mixto" && v.numero) {
      const { data: pt } = await supabase.from("pedidos_tienda").select("monto_efectivo, monto_transferencia").eq("numero", v.numero).maybeSingle();
      if (pt && (pt.monto_efectivo > 0 || pt.monto_transferencia > 0)) {
        setPayEfectivo(pt.monto_efectivo || 0);
        setPayTransferencia(pt.monto_transferencia || 0);
      } else {
        setPayEfectivo(Math.floor(totalDebe / 2));
        setPayTransferencia(totalDebe - Math.floor(totalDebe / 2));
      }
    } else {
      setPayEfectivo(metodoOriginal === "Mixto" ? Math.floor(totalDebe / 2) : totalDebe);
      setPayTransferencia(metodoOriginal === "Mixto" ? totalDebe - Math.floor(totalDebe / 2) : 0);
    }

    setPayCuentaBancariaId("");
    setPayDialogOpen(true);
  };

  const handleRegistrarPago = async () => {
    if (!payVenta) return;
    const allVentas = payGroupVentas.length > 0 ? payGroupVentas : [payVenta];
    const totalDebeGrupo = allVentas.reduce((s, vt) => s + Math.max(0, vt.total - (pagadoPorVenta[vt.id] || 0)), 0);

    let totalPagando = payMetodo === "Mixto" ? payEfectivo + payTransferencia : payMetodo === "Cuenta Corriente" ? 0 : payMonto;
    if (totalPagando <= 0 && payMetodo !== "Cuenta Corriente") return;

    // Transfer surcharge — calculated per-venta in the loop below, not globally
    const hasSurcharge = porcentajeTransferencia > 0 && (payMetodo === "Transferencia" || payMetodo === "Mixto");

    setPaySaving(true);
    const hoy = getArgentinaToday();
    const hora = nowTimeARG();
    const montoReal = Math.min(totalPagando, totalDebeGrupo);
    const saldoPendiente = totalDebeGrupo - montoReal;
    const cuentaSeleccionada = payCuentaBancariaId ? cuentasBancarias.find((c) => c.id === payCuentaBancariaId) : null;
    const clienteNombre = payVenta.clientes?.nombre || "";
    const nums = allVentas.map((v) => `#${v.numero}`).join(", ");

    // Distribute payment across ventas — fill each venta's debt in order
    let remaining = montoReal;
    const perVenta: { venta: VentaRow; paid: number; debtLeft: number }[] = [];
    for (const v of allVentas) {
      const deuda = Math.max(0, v.total - (pagadoPorVenta[v.id] || 0));
      const pays = Math.min(remaining, deuda);
      perVenta.push({ venta: v, paid: pays, debtLeft: deuda - pays });
      remaining -= pays;
    }

    // Register caja entries per venta
    for (const { venta, paid } of perVenta) {
      if (paid <= 0) continue;
      if (payMetodo === "Mixto") {
        // Split proportionally between ef and tr for this venta
        const ratio = totalPagando > 0 ? paid / totalPagando : 0;
        const efPart = Math.round(payEfectivo * ratio);
        const trPart = paid - efPart;
        if (efPart > 0) {
          await supabase.from("caja_movimientos").insert({
            fecha: hoy, hora, tipo: "ingreso",
            descripcion: `Cobro entrega #${venta.numero} (Efectivo) — ${clienteNombre}`,
            metodo_pago: "Efectivo", monto: efPart,
            referencia_id: venta.id, referencia_tipo: "venta",
          });
        }
        if (trPart > 0) {
          const trSurcharge = hasSurcharge ? Math.round(trPart * (porcentajeTransferencia / 100)) : 0;
          await supabase.from("caja_movimientos").insert({
            fecha: hoy, hora, tipo: "ingreso",
            descripcion: `Cobro entrega #${venta.numero} (Transferencia${trSurcharge > 0 ? ` +${porcentajeTransferencia}%` : ""}) — ${clienteNombre}${cuentaSeleccionada ? ` → ${cuentaSeleccionada.nombre}` : ""}`,
            metodo_pago: "Transferencia", monto: trPart + trSurcharge,
            referencia_id: venta.id, referencia_tipo: "venta",
            ...(cuentaSeleccionada ? { cuenta_bancaria: cuentaSeleccionada.nombre } : {}),
          });
        }
      } else if (payMetodo === "Transferencia") {
        const trSurcharge = hasSurcharge ? Math.round(paid * (porcentajeTransferencia / 100)) : 0;
        await supabase.from("caja_movimientos").insert({
          fecha: hoy, hora, tipo: "ingreso",
          descripcion: `Cobro entrega #${venta.numero} (Transferencia${trSurcharge > 0 ? ` +${porcentajeTransferencia}%` : ""}) — ${clienteNombre}${cuentaSeleccionada ? ` → ${cuentaSeleccionada.nombre}` : ""}`,
          metodo_pago: "Transferencia", monto: paid + trSurcharge,
          referencia_id: venta.id, referencia_tipo: "venta",
          ...(cuentaSeleccionada ? { cuenta_bancaria: cuentaSeleccionada.nombre } : {}),
        });
      } else {
        await supabase.from("caja_movimientos").insert({
          fecha: hoy, hora, tipo: "ingreso",
          descripcion: `Cobro entrega #${venta.numero} (${payMetodo}) — ${clienteNombre}`,
          metodo_pago: payMetodo, monto: paid,
          referencia_id: venta.id, referencia_tipo: "venta",
        });
      }
      // Update forma_pago + cuenta_transferencia_alias (surcharge is already tracked in caja_movimiento monto)
      const ventaUpdate: Record<string, any> = { forma_pago: payMetodo === "Cuenta Corriente" ? "Cuenta Corriente" : payMetodo };
      if ((payMetodo === "Transferencia" || payMetodo === "Mixto") && cuentaSeleccionada) {
        ventaUpdate.cuenta_transferencia_alias = cuentaSeleccionada.alias || cuentaSeleccionada.nombre;
      }
      // Update monto_pagado so the system knows this venta is paid
      if (paid > 0) {
        ventaUpdate.monto_pagado = (pagadoPorVenta[venta.id] || 0) + paid;
      }
      await supabase.from("ventas").update(ventaUpdate).eq("id", venta.id);
    }

    // For Cuenta Corriente: all goes to CC, update forma_pago for all ventas
    if (payMetodo === "Cuenta Corriente") {
      for (const v of allVentas) {
        await supabase.from("ventas").update({ forma_pago: "Cuenta Corriente" }).eq("id", v.id);
      }
    }

    // Pending balance → cuenta corriente (aggregated for the group)
    if (saldoPendiente > 0 && payVenta.cliente_id) {
      const { data: freshCli } = await supabase.from("clientes").select("saldo").eq("id", payVenta.cliente_id).single();
      let runningClientSaldo = freshCli?.saldo ?? payVenta.clientes?.saldo ?? 0;
      for (const { venta, debtLeft } of perVenta) {
        if (debtLeft <= 0) continue;
        runningClientSaldo += debtLeft;
        await supabase.from("cuenta_corriente").insert({
          cliente_id: payVenta.cliente_id, fecha: hoy,
          comprobante: `Saldo pendiente #${venta.numero}`,
          descripcion: `Saldo pendiente de entrega — ${venta.numero}`,
          debe: debtLeft, haber: 0, saldo: runningClientSaldo,
          forma_pago: "Cuenta Corriente", venta_id: venta.id,
        });
      }
      await supabase.from("clientes").update({ saldo: runningClientSaldo }).eq("id", payVenta.cliente_id);
    }

    // Mark as delivered — payment was registered so the order has been delivered
    // (even if there's pending balance going to CC, the physical delivery happened)
    for (const v of allVentas) {
      await supabase.from("ventas").update({ entregado: true, estado: "entregado" }).eq("id", v.id);
      await supabase.from("pedidos_tienda").update({ estado: "entregado" }).eq("numero", v.numero);
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

  // Drag & drop reorder
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleDragStart = (id: string) => setDragId(id);
  const handleDragOver = (e: React.DragEvent, id: string) => { e.preventDefault(); setDragOverId(id); };
  const handleDragEnd = () => { setDragId(null); setDragOverId(null); };
  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) { handleDragEnd(); return; }
    // Reorder groups: move dragId group to targetId group's position
    const keys = clientGroups.map((g) => g.key);
    const fromIdx = keys.indexOf(dragId);
    const toIdx = keys.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) { handleDragEnd(); return; }
    const reordered = [...keys];
    reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, dragId);
    // Rebuild orden mapping venta IDs from the new group order
    const newOrden: Record<string, number> = {};
    let counter = 1;
    for (const key of reordered) {
      const g = clientGroups.find((gr) => gr.key === key);
      if (g) for (const v of g.ventas) { newOrden[v.id] = counter; }
      counter++;
    }
    setOrden(newOrden);
    handleDragEnd();
  };

  // Filter and sort ventas
  const filteredVentas = ventas.filter((v) => {
    if (filterEntrega === "envio" && v.metodo_entrega !== "envio") return false;
    if (filterEntrega === "retiro" && v.metodo_entrega !== "retiro" && v.metodo_entrega !== "retiro_local" && v.metodo_entrega !== null) return false;
    if (search) {
      const s = norm(search);
      if (!norm(v.numero).includes(s) && !norm(v.clientes?.nombre || "").includes(s)) return false;
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

  // ─── Group ventas by client ───
  type ClientGroup = {
    key: string;
    clienteId: string | null;
    cliente: ClienteInfo | null;
    ventas: VentaRow[];
  };
  const clientGroups: ClientGroup[] = (() => {
    const map: Record<string, VentaRow[]> = {};
    const orderKeys: string[] = [];
    for (const v of sortedVentas) {
      const key = v.cliente_id || `_nocli_${v.id}`;
      if (!map[key]) { map[key] = []; orderKeys.push(key); }
      map[key].push(v);
    }
    return orderKeys.map((key) => {
      const vts = map[key];
      return { key, clienteId: vts[0].cliente_id, cliente: vts[0].clientes, ventas: vts };
    });
  })();

  // Helper: group totals
  const groupTotals = (g: ClientGroup) => {
    const bruto = g.ventas.reduce((s, v) => s + v.total, 0);
    const nc = g.ventas.reduce((s, v) => s + (ncPorVenta[v.id] || 0), 0);
    const pagado = g.ventas.reduce((s, v) => s + (pagadoPorVenta[v.id] || 0), 0);
    const neto = bruto - nc;
    const debe = Math.max(0, bruto - pagado);
    return { bruto, nc, pagado, neto, debe };
  };

  // Stats (from filtered)
  const totalPedidos = clientGroups.length;
  const valorTotal = filteredVentas.reduce((s, v) => s + v.total - (ncPorVenta[v.id] || 0), 0);
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
              Todas las pendientes (hasta hoy)
            </label>
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-muted-foreground" />
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setShowAllPending(false);
                }}
                className="w-44"
              />
            </div>
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
                <div className="text-2xl font-bold">{formatCurrency(historialTotalVentas - historialTotalNC)}</div>
                {historialTotalNC > 0 && (
                  <p className="text-xs text-amber-600 mt-1">NC devoluciones: -{formatCurrency(historialTotalNC)}</p>
                )}
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
                const dayTotalBruto = dayVentas.reduce((s, v) => s + v.total, 0);
                const dayNC = dayVentas.reduce((s, v) => {
                  const pagos = historialPagos[v.id] || [];
                  return s + pagos.filter(p => p.metodo.includes("Nota de Cr")).reduce((a, p) => a + p.monto, 0);
                }, 0);
                const dayTotal = dayTotalBruto - dayNC;
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
                  const cobradoSinNC = pagos.filter(p => !p.metodo.includes("Nota de Cr")).reduce((a, p) => a + p.monto, 0);
                  const ncAmount = pagos.filter(p => p.metodo.includes("Nota de Cr")).reduce((a, p) => a + p.monto, 0);
                  const debe = (v.total - ncAmount) - cobradoSinNC;
                  return debe > 0;
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
                              const totalNeto = venta.total - ncMonto;
                              const metodos = [...new Set(pagos.filter(p => !p.metodo.includes("Nota de Cr")).map((p) => p.metodo))].join(", ") || venta.forma_pago;
                              const debe = totalNeto - cobradoReal;

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
                                    {formatCurrency(ncMonto > 0 ? venta.total - ncMonto : venta.total)}
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
      {viewMode === "ruta" && clientGroups.length > 0 && (
        <div className="space-y-4">
          {/* Current stop card */}
          {(() => {
            const group = clientGroups[currentStop];
            if (!group) return null;
            const { neto, nc, debe } = groupTotals(group);
            const direccion = [group.cliente?.domicilio, group.cliente?.localidad].filter(Boolean).join(", ");
            const mapsUrl = direccion ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}` : null;
            const tel = group.cliente?.telefono?.replace(/\D/g, "") || "";
            const whatsappUrl = tel ? `https://wa.me/54${tel.startsWith("0") ? tel.slice(1) : tel}` : null;

            return (
              <Card className="border-2 border-blue-300 bg-blue-50/30">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2 text-blue-700 text-sm font-semibold">
                    <Navigation className="w-4 h-4" />
                    Siguiente Parada — {currentStop + 1} de {clientGroups.length}
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xl font-bold text-foreground">{group.cliente?.nombre ?? "Sin cliente"}</p>
                      {direccion && (
                        <p className="flex items-start gap-1.5 text-sm text-muted-foreground mt-1">
                          <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
                          {direccion}
                        </p>
                      )}
                      {group.cliente?.telefono && (
                        <p className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
                          <Phone className="w-4 h-4 shrink-0" />
                          {group.cliente.telefono}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-2xl font-bold text-foreground">{formatCurrency(neto)}</p>
                      {nc > 0 && <p className="text-xs text-amber-600">NC -{formatCurrency(nc)}</p>}
                      <Badge variant="secondary" className={debe > 0 ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}>
                        {debe > 0 ? `Debe ${formatCurrency(debe)}` : "Pagado"}
                      </Badge>
                    </div>
                  </div>
                  {group.ventas.length > 1 && (
                    <div className="bg-white/60 rounded-lg p-2 space-y-1">
                      {group.ventas.map((v) => (
                        <div key={v.id} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{v.tipo_comprobante} #{v.numero}</span>
                          <span className="font-medium">{formatCurrency(v.total - (ncPorVenta[v.id] || 0))}</span>
                        </div>
                      ))}
                    </div>
                  )}
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
                    {group.cliente?.telefono && (
                      <a href={`tel:${group.cliente.telefono}`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-muted text-foreground text-sm font-medium hover:bg-muted transition-colors">
                        <Phone className="w-4 h-4" />
                        Llamar
                      </a>
                    )}
                    {debe > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-10 text-sm text-emerald-600 border-emerald-300 hover:bg-emerald-50"
                        onClick={() => openPayDialog(group.ventas[0], group.ventas)}
                      >
                        <DollarSign className="w-4 h-4 mr-1" />
                        Cobrar
                      </Button>
                    )}
                    <Button
                      size="sm"
                      className="h-10 text-sm bg-green-600 hover:bg-green-700 text-white"
                      onClick={async () => {
                        await handleMarkDelivered(group.ventas);
                        setCurrentStop((prev) => Math.min(prev, clientGroups.length - 2));
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
                Paradas ({clientGroups.length})
              </h3>
              <div className="space-y-1">
                {clientGroups.map((group, idx) => {
                  const { neto, debe } = groupTotals(group);
                  const direccion = [group.cliente?.domicilio, group.cliente?.localidad].filter(Boolean).join(", ");
                  const isActive = idx === currentStop;

                  return (
                    <button
                      key={group.key}
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
                          {group.cliente?.nombre ?? "Sin cliente"}
                        </p>
                        {direccion && (
                          <p className="text-xs text-muted-foreground truncate">{direccion}</p>
                        )}
                        {group.ventas.length > 1 && (
                          <p className="text-[10px] text-muted-foreground">{group.ventas.length} facturas</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-foreground">{formatCurrency(neto)}</p>
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
              {clientGroups.map((group, idx) => {
                const { neto, nc, debe } = groupTotals(group);
                const estaPago = debe <= 0;
                const direccion = [group.cliente?.domicilio, group.cliente?.localidad].filter(Boolean).join(", ");
                const mapsUrl = direccion ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}` : null;
                const tel = group.cliente?.telefono?.replace(/\D/g, "") || "";
                const whatsappUrl = tel ? `https://wa.me/54${tel.startsWith("0") ? tel.slice(1) : tel}` : null;

                return (
                  <Card
                    key={group.key}
                    draggable
                    onDragStart={() => handleDragStart(group.key)}
                    onDragOver={(e) => handleDragOver(e, group.key)}
                    onDrop={() => handleDrop(group.key)}
                    onDragEnd={handleDragEnd}
                    className={`overflow-hidden cursor-grab active:cursor-grabbing transition-all ${estaPago ? "border-green-200" : "border-orange-200"} ${dragId === group.key ? "opacity-50 scale-95" : ""} ${dragOverId === group.key && dragId !== group.key ? "ring-2 ring-primary/50 scale-[1.01]" : ""}`}
                  >
                    <CardContent className="p-0">
                      {/* Header row */}
                      <div className="flex items-center justify-between px-4 py-2.5 bg-muted/50 border-b">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            value={orden[group.ventas[0].id] ?? idx + 1}
                            onChange={(e) => handleOrdenChange(group.ventas[0].id, e.target.value)}
                            className="w-8 h-7 rounded-full bg-muted text-xs font-bold text-muted-foreground text-center border-0 focus:ring-2 focus:ring-primary/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {group.ventas.map((v) => (
                              <span key={v.id} className="flex items-center gap-1">
                                <span className="font-mono text-xs font-semibold text-foreground">{v.numero}</span>
                                {v.origen === "tienda" && <Badge variant="outline" className="text-[10px] px-1 py-0 border-pink-300 text-pink-600 bg-pink-50">Web</Badge>}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className={estaPago ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}>
                            {estaPago ? "Pagado" : `Debe ${formatCurrency(debe)}`}
                          </Badge>
                        </div>
                      </div>

                      {/* Client info */}
                      <div className="px-4 py-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-foreground truncate text-base">{group.cliente?.nombre ?? "Sin cliente"}</p>
                            {direccion && (
                              <p className="flex items-start gap-1.5 text-sm text-muted-foreground mt-0.5">
                                <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                <span>{direccion}</span>
                              </p>
                            )}
                            {group.cliente?.telefono && (
                              <p className="flex items-center gap-1.5 text-sm text-muted-foreground mt-0.5">
                                <Phone className="w-3.5 h-3.5 shrink-0" />
                                {group.cliente.telefono}
                              </p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-lg font-bold text-foreground">{formatCurrency(neto)}</p>
                            {nc > 0 && <p className="text-xs text-amber-600">NC -{formatCurrency(nc)}</p>}
                          </div>
                        </div>

                        {/* Individual invoices breakdown */}
                        {group.ventas.length > 1 && (
                          <div className="bg-muted/30 rounded-lg p-2 space-y-1">
                            {group.ventas.map((v) => (
                              <div key={v.id} className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">{v.tipo_comprobante} #{v.numero} <span className="ml-1 opacity-60">{v.forma_pago}</span></span>
                                <span className="font-medium">{formatCurrency(v.total - (ncPorVenta[v.id] || 0))}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {group.ventas.length === 1 && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{group.ventas[0].tipo_comprobante}</span>
                            <span>{group.ventas[0].forma_pago}</span>
                            <span>{group.ventas[0].fecha}</span>
                          </div>
                        )}

                        {/* Quick contact buttons */}
                        <div className="flex items-center gap-2 pt-1">
                          {group.cliente?.telefono && (
                            <a href={`tel:${group.cliente.telefono}`} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100 transition-colors">
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
                          {group.ventas.map((v) => (
                            <Button key={v.id} variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground ml-auto" onClick={() => handleViewDetail(v)}>
                              <Eye className="w-3.5 h-3.5 mr-1" />
                              {group.ventas.length > 1 ? `#${v.numero}` : "Ver items"}
                            </Button>
                          ))}
                        </div>
                      </div>

                      {/* Action bar */}
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/50 border-t">
                        {debe > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 sm:flex-none h-9 text-sm text-emerald-600 border-emerald-300 hover:bg-emerald-50"
                            onClick={() => openPayDialog(group.ventas[0], group.ventas)}
                          >
                            <DollarSign className="w-4 h-4 mr-1.5" />
                            Cobrar {group.ventas.length > 1 ? `(${group.ventas.length})` : ""}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          className="flex-1 sm:flex-none h-9 text-sm bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => handleMarkDelivered(group.ventas)}
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
          cuenta_transferencia_alias: (detailVenta as any).cuenta_transferencia_alias || undefined,
        } : null}
        items={detailVenta?.venta_items?.map((item) => ({
          id: item.id,
          descripcion: item.descripcion,
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario,
          subtotal: item.subtotal,
          unidad_medida: item.unidad_medida,
          unidades_por_presentacion: (item as any).unidades_por_presentacion,
        })) || []}
        pagos={detailPagos}
      />

      {/* Delivery Confirmation Modal */}
      <Dialog open={dlvConfirm.open} onOpenChange={(v) => !v && setDlvConfirm({ open: false, ids: [], pendiente: 0, type: "paid" })}>
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
            const groupVentas = ventas.filter((x) => dlvConfirm.ids.includes(x.id));
            const fmtCur = (n: number) => formatCurrency(n);
            const nombre = dlvConfirm.clienteNombre || "Sin cliente";
            const nums = groupVentas.map((v) => `#${v.numero}`).join(", ");
            return (
              <div className="space-y-4">
                {dlvConfirm.type === "paid" && (
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4">
                    <p className="text-sm text-emerald-800">
                      {groupVentas.length > 1 ? `${groupVentas.length} pedidos` : `Pedido ${nums}`} de <b>{nombre}</b>
                    </p>
                    <p className="text-xs text-emerald-600 mt-1">Pago completo — listo para entregar</p>
                  </div>
                )}
                {dlvConfirm.type === "unpaid" && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 space-y-2">
                    <p className="text-sm text-amber-900">
                      <b>{nombre}</b> tiene <b className="text-amber-700">{fmtCur(dlvConfirm.pendiente)}</b> sin cobrar.
                    </p>
                    {groupVentas.length > 1 && (
                      <div className="space-y-0.5">
                        {groupVentas.map((v) => {
                          const d = Math.max(0, v.total - (pagadoPorVenta[v.id] || 0));
                          return d > 0 ? <p key={v.id} className="text-xs text-amber-700">#{v.numero}: {fmtCur(d)}</p> : null;
                        })}
                      </div>
                    )}
                    <p className="text-xs text-amber-700">Se cargará a su cuenta corriente como deuda.</p>
                  </div>
                )}
                {dlvConfirm.type === "no_client" && (
                  <div className="rounded-lg bg-red-50 border border-red-200 p-4 space-y-2">
                    <p className="text-sm text-red-900">
                      {groupVentas.length > 1 ? "Estos pedidos tienen" : "Este pedido tiene"} <b>{fmtCur(dlvConfirm.pendiente)}</b> sin cobrar y no tiene cliente asignado.
                    </p>
                    <p className="text-xs text-red-700">No se puede registrar la deuda. Cobrá primero o asigná un cliente.</p>
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setDlvConfirm({ open: false, ids: [], pendiente: 0, type: "paid" })}>
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
      <Dialog open={payDialogOpen} onOpenChange={(v) => { if (!v) setPayDialogOpen(false); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader className="pr-8">
            <DialogTitle>Registrar Pago</DialogTitle>
          </DialogHeader>
          {payVenta && (() => {
            const allVentas = payGroupVentas.length > 0 ? payGroupVentas : [payVenta];
            const totalDebeGrupo = allVentas.reduce((s, vt) => s + Math.max(0, vt.total - (pagadoPorVenta[vt.id] || 0)), 0);
            const totalPagadoReal = allVentas.reduce((s, vt) => s + ((pagadoPorVenta[vt.id] || 0) - (ncPorVenta[vt.id] || 0)), 0);
            const totalNCGrupo = allVentas.reduce((s, vt) => s + (ncPorVenta[vt.id] || 0), 0);
            return (
              <div className="space-y-4">
                {/* Summary header */}
                <div className="text-sm space-y-1 bg-gray-50 rounded-lg p-3">
                  <div className="flex justify-between"><span className="text-gray-500">Cliente</span><span className="font-medium">{payVenta.clientes?.nombre || "—"}</span></div>
                  {allVentas.length === 1 ? (
                    <>
                      <div className="flex justify-between"><span className="text-gray-500">Venta</span><span className="font-mono font-medium">{payVenta.numero}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Total</span><span className="font-bold">{formatCurrency(payVenta.total)}</span></div>
                    </>
                  ) : (
                    <>
                      {allVentas.map((v) => (
                        <div key={v.id} className="flex justify-between">
                          <span className="text-gray-500">#{v.numero}</span>
                          <span className="font-medium">{formatCurrency(v.total)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between border-t pt-1 mt-1"><span className="text-gray-500">Total combinado</span><span className="font-bold">{formatCurrency(allVentas.reduce((s, v) => s + v.total, 0))}</span></div>
                    </>
                  )}
                  {totalNCGrupo > 0 && <div className="flex justify-between"><span className="text-red-600">Nota de Crédito</span><span className="text-red-600 font-medium">-{formatCurrency(totalNCGrupo)}</span></div>}
                  {totalPagadoReal > 0 && <div className="flex justify-between"><span className="text-gray-500">Ya pagado</span><span className="text-emerald-600">{formatCurrency(totalPagadoReal)}</span></div>}
                  <div className="flex justify-between border-t pt-1 mt-1"><span className="text-gray-500 font-medium">Debe</span><span className="text-orange-600 font-bold">{formatCurrency(totalDebeGrupo)}</span></div>
                </div>

                {/* CobroVentaSection — same as listado detail */}
                <CobroVentaSection
                  ventaId={payVenta.id}
                  clienteId={payVenta.cliente_id || ""}
                  clienteNombre={payVenta.clientes?.nombre || ""}
                  clienteSaldo={payVenta.clientes?.saldo || 0}
                  montoVenta={totalDebeGrupo}
                  subtotalItems={totalDebeGrupo}
                  costoEnvio={0}
                  recargoTransferencia={porcentajeTransferencia}
                  cuentasBancarias={cuentasBancarias.map(c => ({ id: c.id, nombre: c.nombre, alias: (c as any).alias || "" }))}
                  defaultMetodo={payVenta.forma_pago}
                  defaultCuentaAlias={(payVenta as any).cuenta_transferencia_alias}
                  onConfirmar={async (result: CobroVentaResult) => {
                    const hoy = getArgentinaToday();
                    const hora = nowTimeARG();
                    const clienteNombre = payVenta.clientes?.nombre || "";
                    const cuentaNombre = result.cuentaBancaria;

                    // Distribute payment across ventas FIFO
                    let remaining = result.monto;
                    const perVenta: { venta: VentaRow; paid: number; debtLeft: number }[] = [];
                    for (const v of allVentas) {
                      const deuda = Math.max(0, v.total - (pagadoPorVenta[v.id] || 0));
                      const pays = Math.min(remaining, deuda);
                      perVenta.push({ venta: v, paid: pays, debtLeft: deuda - pays });
                      remaining = Math.round((remaining - pays) * 100) / 100;
                    }

                    // Register caja entries per venta
                    for (const { venta, paid } of perVenta) {
                      if (paid <= 0 && result.metodo !== "Cuenta Corriente") continue;
                      if (result.metodo === "Mixto") {
                        const ratio = result.monto > 0 ? paid / result.monto : 0;
                        const efPart = Math.round(result.efectivo * ratio);
                        const trPart = paid - efPart - Math.round((result.cuentaCorriente || 0) * ratio);
                        if (efPart > 0) {
                          await supabase.from("caja_movimientos").insert({ fecha: hoy, hora, tipo: "ingreso", descripcion: `Cobro entrega #${venta.numero} (Efectivo) — ${clienteNombre}`, metodo_pago: "Efectivo", monto: efPart, referencia_id: venta.id, referencia_tipo: "venta" });
                        }
                        if (trPart > 0) {
                          const trSurcharge = result.surcharge > 0 ? Math.round(trPart * (porcentajeTransferencia / 100)) : 0;
                          await supabase.from("caja_movimientos").insert({ fecha: hoy, hora, tipo: "ingreso", descripcion: `Cobro entrega #${venta.numero} (Transferencia${trSurcharge > 0 ? ` +${porcentajeTransferencia}%` : ""}) — ${clienteNombre}${cuentaNombre ? ` → ${cuentaNombre}` : ""}`, metodo_pago: "Transferencia", monto: trPart + trSurcharge, referencia_id: venta.id, referencia_tipo: "venta", ...(cuentaNombre ? { cuenta_bancaria: cuentaNombre } : {}) });
                        }
                      } else if (result.metodo === "Transferencia") {
                        const trSurcharge = result.surcharge > 0 ? Math.round(paid * (porcentajeTransferencia / 100)) : 0;
                        await supabase.from("caja_movimientos").insert({ fecha: hoy, hora, tipo: "ingreso", descripcion: `Cobro entrega #${venta.numero} (Transferencia${trSurcharge > 0 ? ` +${porcentajeTransferencia}%` : ""}) — ${clienteNombre}${cuentaNombre ? ` → ${cuentaNombre}` : ""}`, metodo_pago: "Transferencia", monto: paid + trSurcharge, referencia_id: venta.id, referencia_tipo: "venta", ...(cuentaNombre ? { cuenta_bancaria: cuentaNombre } : {}) });
                      } else if (result.metodo === "Cuenta Corriente") {
                        await supabase.from("caja_movimientos").insert({ fecha: hoy, hora, tipo: "ingreso", descripcion: `Cobro entrega #${venta.numero} (Cuenta Corriente) — ${clienteNombre}`, metodo_pago: "Cuenta Corriente", monto: venta.total - (pagadoPorVenta[venta.id] || 0), referencia_id: venta.id, referencia_tipo: "venta" });
                      } else {
                        await supabase.from("caja_movimientos").insert({ fecha: hoy, hora, tipo: "ingreso", descripcion: `Cobro entrega #${venta.numero} (${result.metodo}) — ${clienteNombre}`, metodo_pago: result.metodo, monto: paid, referencia_id: venta.id, referencia_tipo: "venta" });
                      }
                      // Update venta
                      const ventaUpd: Record<string, any> = { forma_pago: result.metodo, monto_pagado: (pagadoPorVenta[venta.id] || 0) + paid };
                      if (cuentaNombre) ventaUpd.cuenta_transferencia_alias = cuentaNombre;
                      await supabase.from("ventas").update(ventaUpd).eq("id", venta.id);
                    }

                    // CC portion (Mixto remainder or full CC) — atomic saldo
                    const ccAmount = result.metodo === "Cuenta Corriente" ? totalDebeGrupo : result.cuentaCorriente;
                    if (ccAmount > 0 && payVenta.cliente_id) {
                      // Atomic increment
                      const { data: newSaldoCC } = await supabase.rpc("atomic_update_client_saldo", { p_client_id: payVenta.cliente_id, p_change: ccAmount });
                      let runningSaldo = newSaldoCC ?? 0;
                      // Per-venta CC entries (saldo snapshots)
                      let ccUsed = 0;
                      for (const { venta, debtLeft } of perVenta) {
                        const ccForVenta = result.metodo === "Cuenta Corriente" ? (venta.total - (pagadoPorVenta[venta.id] || 0)) : debtLeft;
                        if (ccForVenta <= 0) continue;
                        ccUsed += ccForVenta;
                        await supabase.from("cuenta_corriente").insert({ cliente_id: payVenta.cliente_id, fecha: hoy, comprobante: `Cobro entrega #${venta.numero}`, descripcion: result.metodo === "Cuenta Corriente" ? "A cuenta corriente" : "Saldo pendiente a cuenta corriente", debe: ccForVenta, haber: 0, saldo: runningSaldo - (ccAmount - ccUsed), forma_pago: result.metodo === "Cuenta Corriente" ? "Cuenta Corriente" : "Mixto", venta_id: venta.id });
                      }
                    }

                    // FIFO saldo allocation (pay old debts) — atomic saldo
                    if (result.cobrarSaldo && result.saldoAllocations.length > 0) {
                      for (const alloc of result.saldoAllocations) {
                        if (alloc.aplicar <= 0) continue;
                        const { data: old } = await supabase.from("ventas").select("monto_pagado").eq("id", alloc.venta_id).single();
                        await supabase.from("ventas").update({ monto_pagado: ((old as any)?.monto_pagado || 0) + alloc.aplicar }).eq("id", alloc.venta_id);
                      }
                      const totalAllocated = result.saldoAllocations.reduce((s, a) => s + a.aplicar, 0);
                      if (totalAllocated > 0 && payVenta.cliente_id) {
                        const { data: newSaldo2 } = await supabase.rpc("atomic_update_client_saldo", { p_client_id: payVenta.cliente_id, p_change: -totalAllocated });
                        const saldoAfter2 = Math.max(0, newSaldo2 ?? 0);
                        await supabase.from("cuenta_corriente").insert({ cliente_id: payVenta.cliente_id, fecha: hoy, comprobante: `Cobro saldo entrega`, descripcion: `Cobro deuda anterior (${result.saldoAllocations.length} comprobante${result.saldoAllocations.length > 1 ? "s" : ""})`, debe: 0, haber: totalAllocated, saldo: saldoAfter2, forma_pago: result.metodo, venta_id: null });
                      }
                    }

                    // Mark all as delivered
                    for (const v of allVentas) {
                      await supabase.from("ventas").update({ entregado: true, estado: "entregado" }).eq("id", v.id);
                      await supabase.from("pedidos_tienda").update({ estado: "entregado" }).eq("numero", v.numero);
                    }

                    setPayDialogOpen(false);
                    fetchVentas();
                  }}
                />
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
